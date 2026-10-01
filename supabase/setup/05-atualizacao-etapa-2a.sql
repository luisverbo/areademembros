-- =============================================================================
-- LC.Academy — ATUALIZAÇÃO do banco (gerado automaticamente; não edite)
-- Migrações: 20261003090000
--
-- Como usar: Supabase > SQL Editor > New query > cole TUDO > Run.
-- Rode UMA vez, num banco que já tem a instalação anterior.
-- Tudo roda numa transação: se algo falhar, nada é aplicado.
-- =============================================================================

begin;

-- >>> 20261003090000_ai_transcripts.sql
-- =============================================================================
-- Etapa 2A: transcrição das aulas, resumo/checklist por IA, Professor IA e busca.
-- =============================================================================

-- Trechos da transcrição com o minuto (busca em português).
create table public.lesson_transcript_segments (
  id bigint generated always as identity primary key,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  start_seconds integer not null check (start_seconds >= 0),
  end_seconds integer check (end_seconds >= 0),
  text text not null,
  tsv tsvector generated always as (to_tsvector('portuguese', text)) stored
);
create index lesson_transcript_segments_lesson_idx on public.lesson_transcript_segments (lesson_id, start_seconds);
create index lesson_transcript_segments_tsv_idx on public.lesson_transcript_segments using gin (tsv);

-- Situação do processamento por IA (resumo e checklist).
alter table public.lesson_contents
  add column ai_status text not null default 'idle' check (ai_status in ('idle', 'processing', 'ready', 'error')),
  add column ai_error text,
  add column ai_updated_at timestamptz;

-- Conversas do aluno com o Professor IA (uma por aula). Também alimentam o Radar (Etapa 2C).
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);
create trigger ai_conversations_updated_at before update on public.ai_conversations
  for each row execute function public.set_updated_at();

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) <= 20000),
  created_at timestamptz not null default now()
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

-- Perguntas da busca inteligente (para o Radar e para ver o que os alunos procuram).
create table public.ai_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  query text not null check (length(query) <= 500),
  created_at timestamptz not null default now()
);
create index ai_searches_user_idx on public.ai_searches (user_id, created_at desc);

-- RLS -----------------------------------------------------------------------
alter table public.lesson_transcript_segments enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_searches enable row level security;

create policy lesson_transcript_segments_admin_all on public.lesson_transcript_segments
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy lesson_transcript_segments_select_access on public.lesson_transcript_segments
  for select to authenticated using ((select public.can_access_lesson(lesson_id)));

create policy ai_conversations_admin_read on public.ai_conversations
  for select to authenticated using ((select public.is_admin()));
create policy ai_conversations_own on public.ai_conversations
  for select to authenticated using (user_id = (select auth.uid()));
create policy ai_conversations_insert_own on public.ai_conversations
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.can_access_lesson(lesson_id)));

create policy ai_messages_admin_read on public.ai_messages
  for select to authenticated using ((select public.is_admin()));
create policy ai_messages_own on public.ai_messages
  for select to authenticated
  using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));
create policy ai_messages_insert_own on public.ai_messages
  for insert to authenticated
  with check (exists (
    select 1 from public.ai_conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid()) and public.can_access_lesson(c.lesson_id)
  ));

create policy ai_searches_admin_read on public.ai_searches
  for select to authenticated using ((select public.is_admin()));
create policy ai_searches_insert_own on public.ai_searches
  for insert to authenticated with check (user_id = (select auth.uid()));

revoke all on public.lesson_transcript_segments, public.ai_conversations, public.ai_messages, public.ai_searches from anon;
grant select, insert, update, delete on public.lesson_transcript_segments to authenticated;
grant select, insert on public.ai_conversations, public.ai_messages, public.ai_searches to authenticated;
grant all on public.lesson_transcript_segments, public.ai_conversations, public.ai_messages, public.ai_searches to service_role;

-- Busca inteligente: trechos das aulas que o usuário pode assistir, em ordem de relevância.
-- Roda com as permissões de quem chama (RLS filtra as aulas liberadas).
create or replace function public.search_lesson_segments(p_query text, p_limit integer default 30)
returns table (
  lesson_id uuid,
  lesson_title text,
  course_title text,
  start_seconds integer,
  text text,
  rank real
)
language sql
stable
set search_path = ''
as $$
  with q as (select websearch_to_tsquery('portuguese', p_query) as query)
  select s.lesson_id, l.title, c.title, s.start_seconds, s.text, ts_rank(s.tsv, q.query) as rank
  from public.lesson_transcript_segments s
  cross join q
  join public.lessons l on l.id = s.lesson_id
  join public.modules m on m.id = l.module_id
  join public.courses c on c.id = m.course_id
  where s.tsv @@ q.query
  order by rank desc, s.start_seconds
  limit least(greatest(p_limit, 1), 60);
$$;

revoke execute on function public.search_lesson_segments(text, integer) from public, anon;
grant execute on function public.search_lesson_segments(text, integer) to authenticated, service_role;

-- Registra as migrações aplicadas (permite usar "supabase db push" no futuro).
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261003090000', 'ai_transcripts')
on conflict (version) do nothing;

commit;
