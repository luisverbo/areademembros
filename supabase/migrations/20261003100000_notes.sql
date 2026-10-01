-- =============================================================================
-- Etapa 2B: caderno de anotações. Cada nota guarda o minuto da aula.
-- =============================================================================

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  content text not null default '' check (length(content) <= 20000),
  timestamp_seconds integer check (timestamp_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_user_lesson_idx on public.notes (user_id, lesson_id, timestamp_seconds);
create index notes_user_updated_idx on public.notes (user_id, updated_at desc);
create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

alter table public.notes enable row level security;

-- Notas são só do aluno (nem o admin lê: é o caderno pessoal).
create policy notes_select_own on public.notes
  for select to authenticated using (user_id = (select auth.uid()));
create policy notes_insert_own on public.notes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.can_access_lesson(lesson_id)));
create policy notes_update_own on public.notes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy notes_delete_own on public.notes
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.notes from anon;
grant select, insert, delete on public.notes to authenticated;
grant update (content, timestamp_seconds) on public.notes to authenticated;
grant all on public.notes to service_role;
