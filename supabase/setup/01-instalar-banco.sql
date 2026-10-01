-- =============================================================================
-- LC.Academy — instalação completa do banco (gerado automaticamente; não edite)
-- Migrações: 20261001120000, 20261001120100, 20261001120200, 20261001120300, 20261002090000, 20261002090100, 20261002100000, 20261002100100, 20261003090000
--
-- Como usar: Supabase > SQL Editor > New query > cole TUDO > Run.
-- Rode UMA vez, num projeto novo.
-- Tudo roda numa transação: se algo falhar, nada é aplicado.
-- =============================================================================

begin;

-- >>> 20261001120000_initial_schema.sql
-- =============================================================================
-- Área de Membros — schema inicial (Etapa 1A)
--
-- Convenções:
--   * Fuso de negócio: America/Sao_Paulo (todas as regras de liberação).
--   * A liberação de aulas é CALCULADA na leitura (função lesson_release_at),
--     sem depender de cron. O cron futuro só dispara avisos.
--   * Conteúdo sensível da aula (ID do vídeo, transcrição) fica em
--     lesson_contents, protegido pela regra de acesso. A tabela lessons só tem
--     metadados (título, miniatura) para o aluno ver aulas futuras com cadeado.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('student', 'admin');
create type public.video_provider as enum ('bunny', 'youtube');
create type public.release_mode as enum ('all', 'weekly', 'fixed_date', 'days_after_join');
create type public.enrollment_origin as enum ('purchase', 'free', 'manual');
create type public.enrollment_status as enum ('active', 'refunded', 'expired');
create type public.payment_provider as enum ('kiwify', 'hotmart', 'yampi', 'mercadopago', 'asaas');
create type public.comment_category as enum ('question', 'complaint', 'praise', 'request', 'technical');
create type public.webhook_status as enum ('received', 'processed', 'ignored', 'failed');

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles (ligada a auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  whatsapp text,
  avatar_url text,
  role public.user_role not null default 'student',
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Cria o perfil quando um usuário nasce no Auth (magic link, webhook ou cadastro rápido).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  consent boolean := coalesce((new.raw_user_meta_data ->> 'marketing_consent')::boolean, false);
begin
  insert into public.profiles (id, email, full_name, whatsapp, marketing_consent, marketing_consent_at)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'whatsapp', ''),
    consent,
    case when consent then now() end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantém o e-mail do perfil em sincronia com o Auth.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- -----------------------------------------------------------------------------
-- Conteúdo: cursos, módulos, aulas
-- -----------------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  description text,
  cover_vertical_url text,   -- 9:16
  cover_horizontal_url text, -- 16:9
  banner_url text,           -- 1920x800
  is_free boolean not null default false,
  preview_lesson_id uuid,    -- FK adicionada depois de lessons
  preview_start_seconds integer check (preview_start_seconds >= 0),
  preview_end_seconds integer check (preview_end_seconds >= 0),
  sales_cohort_id uuid,      -- turma usada no cadeado da vitrine (FK depois de cohorts)
  showcase_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (preview_end_seconds is null or preview_start_seconds is null or preview_end_seconds > preview_start_seconds)
);
create trigger courses_updated_at before update on public.courses
  for each row execute function public.set_updated_at();

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index modules_course_idx on public.modules (course_id, position);
create trigger modules_updated_at before update on public.modules
  for each row execute function public.set_updated_at();

-- Metadados da aula (o aluno vê mesmo antes de liberar, para mostrar o cadeado).
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules (id) on delete cascade,
  title text not null,
  description text,
  thumbnail_url text,        -- 16:9
  duration_seconds integer check (duration_seconds >= 0),
  position integer not null default 0,
  is_free boolean not null default false,
  is_published boolean not null default false,
  -- Botão de oferta dentro do vídeo
  offer_at_seconds integer check (offer_at_seconds >= 0),
  offer_label text,
  offer_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lessons_module_idx on public.lessons (module_id, position);
create trigger lessons_updated_at before update on public.lessons
  for each row execute function public.set_updated_at();

alter table public.courses
  add constraint courses_preview_lesson_fk
  foreign key (preview_lesson_id) references public.lessons (id) on delete set null;

-- Conteúdo protegido da aula: só quem tem acesso à aula lê.
create table public.lesson_contents (
  lesson_id uuid primary key references public.lessons (id) on delete cascade,
  video_provider public.video_provider not null default 'bunny',
  video_id text,
  transcript text,
  ai_summary jsonb,
  ai_checklist jsonb,
  updated_at timestamptz not null default now()
);
create trigger lesson_contents_updated_at before update on public.lesson_contents
  for each row execute function public.set_updated_at();

create table public.lesson_materials (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  name text not null,
  storage_path text not null,  -- bucket privado lesson-materials
  file_type text,
  size_bytes bigint,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index lesson_materials_lesson_idx on public.lesson_materials (lesson_id, position);

-- Curso da aula (atalho usado nas regras de acesso).
create or replace function public.lesson_course_id(p_lesson_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.course_id
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where l.id = p_lesson_id;
$$;

-- -----------------------------------------------------------------------------
-- Turmas
-- -----------------------------------------------------------------------------
-- release_config por modo:
--   all              -> {}
--   weekly           -> {"weekday": 0-6 (0 = domingo), "time": "HH:MM"}
--   fixed_date       -> {}   (datas em cohort_lessons.release_at)
--   days_after_join  -> {"interval_days": N}  (padrão quando a aula não tem release_offset_days)
create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  name text not null,
  description text,
  release_mode public.release_mode not null default 'all',
  release_config jsonb not null default '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  access_months integer check (access_months > 0), -- null = vitalício
  checkout_url text,
  live_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (
    release_mode <> 'weekly' or (
      (release_config ->> 'weekday') ~ '^[0-6]$'
      and (release_config ->> 'time') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    )
  ),
  check (
    release_mode <> 'days_after_join'
    or release_config ->> 'interval_days' is null
    or (release_config ->> 'interval_days') ~ '^[0-9]+$'
  )
);
create index cohorts_course_idx on public.cohorts (course_id);
create trigger cohorts_updated_at before update on public.cohorts
  for each row execute function public.set_updated_at();

alter table public.courses
  add constraint courses_sales_cohort_fk
  foreign key (sales_cohort_id) references public.cohorts (id) on delete set null;

-- Quais aulas a turma tem e quando liberam.
create table public.cohort_lessons (
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  position integer not null default 0,
  release_at timestamptz,            -- fixed_date (ou exceção em weekly)
  release_offset_days integer check (release_offset_days >= 0), -- days_after_join
  primary key (cohort_id, lesson_id)
);
create index cohort_lessons_lesson_idx on public.cohort_lessons (lesson_id);

-- A aula precisa ser do mesmo curso da turma.
create or replace function public.check_cohort_lesson_course()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.lesson_course_id(new.lesson_id) is distinct from
     (select course_id from public.cohorts where id = new.cohort_id) then
    raise exception 'A aula % não pertence ao curso da turma %', new.lesson_id, new.cohort_id;
  end if;
  return new;
end;
$$;
create trigger cohort_lessons_same_course
  before insert or update on public.cohort_lessons
  for each row execute function public.check_cohort_lesson_course();

-- Produto de cada plataforma que dá acesso à turma (usado pelos webhooks).
create table public.cohort_products (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  provider public.payment_provider not null,
  external_product_id text not null,
  label text,
  created_at timestamptz not null default now(),
  unique (provider, external_product_id)
);
create index cohort_products_cohort_idx on public.cohort_products (cohort_id);

-- -----------------------------------------------------------------------------
-- Matrículas e liberações individuais
-- -----------------------------------------------------------------------------
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  origin public.enrollment_origin not null,
  status public.enrollment_status not null default 'active',
  provider public.payment_provider,
  external_transaction_id text,
  started_at timestamptz not null default now(), -- base do "X dias após a entrada"
  expires_at timestamptz,                        -- null = vitalício
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, cohort_id)
);
create index enrollments_cohort_idx on public.enrollments (cohort_id);
create index enrollments_transaction_idx on public.enrollments (provider, external_transaction_id);
create trigger enrollments_updated_at before update on public.enrollments
  for each row execute function public.set_updated_at();

create table public.lesson_unlocks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- -----------------------------------------------------------------------------
-- Regras de liberação
-- -----------------------------------------------------------------------------

-- Matrícula vale agora?
create or replace function public.enrollment_is_active(e public.enrollments)
returns boolean
language sql
stable
set search_path = ''
as $$
  select e.status = 'active' and (e.expires_at is null or e.expires_at > now());
$$;

-- Quando a aula libera para uma matrícula. null = sem data (fica travada).
create or replace function public.lesson_release_at(
  p_cohort_id uuid,
  p_lesson_id uuid,
  p_enrolled_at timestamptz
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.cohorts;
  cl public.cohort_lessons;
  tz constant text := 'America/Sao_Paulo';
  idx integer;
  base timestamptz;
  local_start timestamp;
  first_slot timestamp;
  weekday integer;
  slot_time time;
  interval_days integer;
begin
  select * into c from public.cohorts where id = p_cohort_id;
  select * into cl from public.cohort_lessons where cohort_id = p_cohort_id and lesson_id = p_lesson_id;
  if c.id is null or cl.lesson_id is null then
    return null;
  end if;

  base := coalesce(c.starts_at, c.created_at);

  -- Índice da aula na turma (0, 1, 2...), pela ordem definida na turma.
  select count(*) into idx
  from public.cohort_lessons o
  where o.cohort_id = p_cohort_id
    and (o.position, o.lesson_id) < (cl.position, cl.lesson_id);

  case c.release_mode
    when 'all' then
      return base;

    when 'fixed_date' then
      return cl.release_at;

    when 'weekly' then
      if cl.release_at is not null then
        return cl.release_at; -- exceção manual
      end if;
      weekday := (c.release_config ->> 'weekday')::integer;
      slot_time := (c.release_config ->> 'time')::time;
      local_start := base at time zone tz;
      first_slot := (local_start::date + ((weekday - extract(dow from local_start)::integer + 7) % 7)) + slot_time;
      if first_slot < local_start then
        first_slot := first_slot + interval '7 days';
      end if;
      return (first_slot + make_interval(days => 7 * idx)) at time zone tz;

    when 'days_after_join' then
      interval_days := coalesce((c.release_config ->> 'interval_days')::integer, 0);
      -- Nunca libera antes do início da turma.
      return greatest(
        coalesce(p_enrolled_at, base) + make_interval(days => coalesce(cl.release_offset_days, idx * interval_days)),
        coalesce(c.starts_at, '-infinity'::timestamptz)
      );
  end case;
  return null;
end;
$$;

-- O usuário atual pode assistir/ler o conteúdo desta aula agora?
create or replace function public.can_access_lesson(p_lesson_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  l public.lessons;
  co public.courses;
begin
  if uid is null then
    return false;
  end if;
  if public.is_admin() then
    return true;
  end if;

  select * into l from public.lessons where id = p_lesson_id;
  select c.* into co from public.courses c join public.modules m on m.course_id = c.id where m.id = l.module_id;
  if l.id is null or not l.is_published or not co.is_published then
    return false;
  end if;

  -- Grátis: qualquer usuário logado (lead incluído).
  if l.is_free or co.is_free then
    return true;
  end if;

  -- Liberação individual feita pelo admin.
  if exists (select 1 from public.lesson_unlocks u where u.user_id = uid and u.lesson_id = p_lesson_id) then
    return true;
  end if;

  return exists (
    select 1
    from public.enrollments e
    join public.cohorts c on c.id = e.cohort_id
    join public.cohort_lessons cl on cl.cohort_id = e.cohort_id and cl.lesson_id = p_lesson_id
    where e.user_id = uid
      and public.enrollment_is_active(e)
      and public.lesson_release_at(e.cohort_id, p_lesson_id, e.started_at) <= now()
  );
end;
$$;

-- O usuário atual tem matrícula ativa nesta turma?
create or replace function public.is_enrolled_in_cohort(p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
    where e.cohort_id = p_cohort_id
      and e.user_id = (select auth.uid())
      and public.enrollment_is_active(e)
  );
$$;

-- Aulas da turma para o aluno logado, com a data de liberação calculada.
-- Admin pode consultar qualquer aluno passando p_user_id.
create or replace function public.cohort_lessons_for_user(p_cohort_id uuid, p_user_id uuid default null)
returns table (
  lesson_id uuid,
  lesson_position integer,
  release_at timestamptz,
  is_released boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  target uuid := coalesce(p_user_id, auth.uid());
  e public.enrollments;
begin
  if target is null then
    return;
  end if;
  if target <> auth.uid() and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into e from public.enrollments
  where cohort_id = p_cohort_id and user_id = target and public.enrollment_is_active(enrollments);
  if e.id is null and not public.is_admin() then
    return;
  end if;

  return query
  select
    cl.lesson_id,
    cl.position,
    r.release_at,
    (r.release_at is not null and r.release_at <= now())
      or exists (select 1 from public.lesson_unlocks u where u.user_id = target and u.lesson_id = cl.lesson_id)
  from public.cohort_lessons cl
  join public.lessons l on l.id = cl.lesson_id
  cross join lateral (
    select public.lesson_release_at(cl.cohort_id, cl.lesson_id, coalesce(e.started_at, now())) as release_at
  ) r
  where cl.cohort_id = p_cohort_id
    and (l.is_published or public.is_admin())
  order by cl.position, cl.lesson_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Progresso e comentários
-- -----------------------------------------------------------------------------
create table public.lesson_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  seconds_watched integer not null default 0 check (seconds_watched >= 0),
  last_position_seconds integer not null default 0 check (last_position_seconds >= 0),
  percent numeric(5, 2) not null default 0 check (percent between 0 and 100),
  completed_at timestamptz,
  last_accessed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index lesson_progress_lesson_idx on public.lesson_progress (lesson_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  cohort_id uuid references public.cohorts (id) on delete cascade, -- null = aula grátis
  user_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  content text not null check (length(trim(content)) > 0 and length(content) <= 5000),
  -- Campos preenchidos pela IA (Etapa 2)
  ai_category public.comment_category,
  ai_sentiment text,
  ai_is_urgent boolean,
  ai_suggested_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comments_lesson_cohort_idx on public.comments (lesson_id, cohort_id, created_at);
create trigger comments_updated_at before update on public.comments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Webhooks (idempotência)
-- -----------------------------------------------------------------------------
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider public.payment_provider not null,
  idempotency_key text not null,
  event_type text,
  payload jsonb not null,
  status public.webhook_status not null default 'received',
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, idempotency_key)
);

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_contents enable row level security;
alter table public.lesson_materials enable row level security;
alter table public.cohorts enable row level security;
alter table public.cohort_lessons enable row level security;
alter table public.cohort_products enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_unlocks enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.comments enable row level security;
alter table public.webhook_events enable row level security;

-- Admin: tudo, em todas as tabelas.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'courses', 'modules', 'lessons', 'lesson_contents', 'lesson_materials',
    'cohorts', 'cohort_lessons', 'cohort_products', 'enrollments', 'lesson_unlocks',
    'lesson_progress', 'comments', 'webhook_events'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
      t || '_admin_all', t
    );
  end loop;
end $$;

-- profiles: cada um lê e edita o próprio (colunas limitadas abaixo).
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Vitrine pública: cursos, módulos e metadados de aulas publicados.
create policy courses_select_published on public.courses
  for select to anon, authenticated using (is_published);
create policy modules_select_published on public.modules
  for select to anon, authenticated
  using (exists (select 1 from public.courses c where c.id = course_id and c.is_published));
create policy lessons_select_published on public.lessons
  for select to anon, authenticated
  using (
    is_published and exists (
      select 1 from public.modules m join public.courses c on c.id = m.course_id
      where m.id = module_id and c.is_published
    )
  );

-- Conteúdo protegido: só com acesso liberado.
create policy lesson_contents_select_access on public.lesson_contents
  for select to authenticated using ((select public.can_access_lesson(lesson_id)));
create policy lesson_materials_select_access on public.lesson_materials
  for select to authenticated using ((select public.can_access_lesson(lesson_id)));

-- Turmas: dados públicos de venda (link de checkout) de turmas ativas de cursos publicados.
create policy cohorts_select_active on public.cohorts
  for select to anon, authenticated
  using (
    (is_active and exists (select 1 from public.courses c where c.id = course_id and c.is_published))
    or (select public.is_enrolled_in_cohort(id))
  );
create policy cohort_lessons_select_enrolled on public.cohort_lessons
  for select to authenticated using ((select public.is_enrolled_in_cohort(cohort_id)));
-- cohort_products: só admin (política acima).

-- Matrículas e liberações: aluno só lê as próprias.
create policy enrollments_select_own on public.enrollments
  for select to authenticated using (user_id = (select auth.uid()));
create policy lesson_unlocks_select_own on public.lesson_unlocks
  for select to authenticated using (user_id = (select auth.uid()));

-- Progresso: o próprio, e só em aulas que pode acessar.
create policy lesson_progress_select_own on public.lesson_progress
  for select to authenticated using (user_id = (select auth.uid()));
create policy lesson_progress_insert_own on public.lesson_progress
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.can_access_lesson(lesson_id)));
create policy lesson_progress_update_own on public.lesson_progress
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select public.can_access_lesson(lesson_id)));

-- Comentários: separados por turma.
create policy comments_select_participants on public.comments
  for select to authenticated
  using (
    (select public.can_access_lesson(lesson_id))
    and (cohort_id is null or (select public.is_enrolled_in_cohort(cohort_id)))
  );
create policy comments_insert_participants on public.comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.can_access_lesson(lesson_id))
    and (cohort_id is null or (select public.is_enrolled_in_cohort(cohort_id)))
  );
create policy comments_update_own on public.comments
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy comments_delete_own on public.comments
  for delete to authenticated using (user_id = (select auth.uid()));
-- webhook_events: só admin (leitura) e service role (escrita, ignora RLS).

-- =============================================================================
-- Privilégios por coluna (o que o aluno pode alterar)
-- =============================================================================
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant select on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
grant select on public.courses, public.modules, public.lessons, public.cohorts to anon;

revoke insert, update, delete on all tables in schema public from authenticated;
grant insert, update, delete on
  public.courses, public.modules, public.lessons, public.lesson_contents, public.lesson_materials,
  public.cohorts, public.cohort_lessons, public.cohort_products, public.enrollments,
  public.lesson_unlocks, public.lesson_progress, public.webhook_events
  to authenticated; -- protegidas por RLS (admin) ou pelas políticas acima
grant delete on public.comments, public.profiles to authenticated;

-- profiles: aluno não muda role, e-mail nem datas.
grant update (full_name, whatsapp, avatar_url, marketing_consent, marketing_consent_at, last_seen_at, role)
  on public.profiles to authenticated;
-- role continua protegido: só o admin tem política que permite trocar o role de outro,
-- e o trigger abaixo impede o próprio usuário de se promover.
-- Roda como quem fez a alteração (sem security definer): current_user é
-- 'authenticated' nas requisições de usuários e 'service_role' no back-end.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and current_user in ('authenticated', 'anon') and not public.is_admin() then
    raise exception 'Somente admin pode alterar o papel do usuário' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_profile_role();

-- comments: aluno escreve só o conteúdo; campos da IA ficam com admin/service role.
grant insert (lesson_id, cohort_id, parent_id, content, user_id) on public.comments to authenticated;
grant update (content, ai_category, ai_sentiment, ai_is_urgent, ai_suggested_reply) on public.comments to authenticated;
create or replace function public.guard_comment_ai_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.ai_category := null;
    new.ai_sentiment := null;
    new.ai_is_urgent := null;
    new.ai_suggested_reply := null;
  else
    new.ai_category := old.ai_category;
    new.ai_sentiment := old.ai_sentiment;
    new.ai_is_urgent := old.ai_is_urgent;
    new.ai_suggested_reply := old.ai_suggested_reply;
    new.lesson_id := old.lesson_id;
    new.cohort_id := old.cohort_id;
    new.parent_id := old.parent_id;
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;
create trigger comments_guard_ai before insert or update on public.comments
  for each row execute function public.guard_comment_ai_fields();

-- Funções expostas por RPC.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_admin(),
  public.can_access_lesson(uuid),
  public.is_enrolled_in_cohort(uuid),
  public.cohort_lessons_for_user(uuid, uuid),
  public.lesson_release_at(uuid, uuid, timestamptz),
  public.lesson_course_id(uuid),
  public.enrollment_is_active(public.enrollments)
  to authenticated;
-- Usada na política pública de cohorts (retorna false para visitante).
grant execute on function public.is_enrolled_in_cohort(uuid), public.is_admin() to anon;
grant execute on all functions in schema public to service_role;

-- >>> 20261001120100_storage.sql
-- =============================================================================
-- Storage: capas/banners (público) e materiais das aulas (privado).
-- Vídeos NUNCA ficam aqui (Bunny Stream / YouTube).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('course-assets', 'course-assets', true, 10 * 1024 * 1024,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('lesson-materials', 'lesson-materials', false, 50 * 1024 * 1024, null)
on conflict (id) do nothing;

-- Imagens: leitura pública (bucket público); escrita só do admin.
create policy course_assets_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'course-assets' and (select public.is_admin()))
  with check (bucket_id = 'course-assets' and (select public.is_admin()));

-- Materiais: caminho "<lesson_id>/<arquivo>". Admin escreve; aluno com acesso à aula lê.
create policy lesson_materials_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'lesson-materials' and (select public.is_admin()))
  with check (bucket_id = 'lesson-materials' and (select public.is_admin()));

create policy lesson_materials_read_access on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lesson-materials'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.can_access_lesson(((storage.foldername(name))[1])::uuid)
  );

-- >>> 20261001120200_enrollment_functions.sql
-- =============================================================================
-- Funções de matrícula e de turma usadas pelo admin e pelos webhooks.
-- =============================================================================

-- Usa o papel do JWT (e não current_user, que vira o dono da função dentro de
-- security definer). Sem JWT = SQL direto/migração, permitido.
create or replace function public.assert_admin_or_service()
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
begin
  if jwt_role in ('authenticated', 'anon') and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- Matricula (ou reativa) um usuário numa turma. Usada na compra, no cadastro grátis e pelo admin.
--  * Já ativo: mantém datas (não reinicia a liberação "dias após a entrada").
--  * Reembolsado/expirado: reativa e recalcula o prazo de acesso a partir de agora.
create or replace function public.enroll_user(
  p_user_id uuid,
  p_cohort_id uuid,
  p_origin public.enrollment_origin,
  p_provider public.payment_provider default null,
  p_transaction_id text default null
)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  months integer;
  result public.enrollments;
begin
  perform public.assert_admin_or_service();

  select access_months into months from public.cohorts where id = p_cohort_id;
  if not found then
    raise exception 'Turma não encontrada' using errcode = 'P0002';
  end if;

  insert into public.enrollments (user_id, cohort_id, origin, provider, external_transaction_id, started_at, expires_at)
  values (
    p_user_id, p_cohort_id, p_origin, p_provider, p_transaction_id, now(),
    case when months is not null then now() + make_interval(months => months) end
  )
  on conflict (user_id, cohort_id) do update
  set
    status = 'active',
    origin = case when public.enrollment_is_active(enrollments) then enrollments.origin else excluded.origin end,
    provider = coalesce(excluded.provider, enrollments.provider),
    external_transaction_id = coalesce(excluded.external_transaction_id, enrollments.external_transaction_id),
    expires_at = case when public.enrollment_is_active(enrollments) then enrollments.expires_at else excluded.expires_at end
  returning * into result;

  return result;
end;
$$;

-- Copia a turma (configuração e aulas). Não copia alunos nem produtos do checkout
-- (cada produto só pode apontar para uma turma). A cópia nasce inativa.
create or replace function public.duplicate_cohort(p_cohort_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  perform public.assert_admin_or_service();

  insert into public.cohorts (
    course_id, name, description, release_mode, release_config, starts_at, ends_at,
    access_months, checkout_url, live_url, is_active
  )
  select course_id, name || ' (cópia)', description, release_mode, release_config, starts_at, ends_at,
         access_months, checkout_url, live_url, false
  from public.cohorts where id = p_cohort_id
  returning id into new_id;

  if new_id is null then
    raise exception 'Turma não encontrada' using errcode = 'P0002';
  end if;

  insert into public.cohort_lessons (cohort_id, lesson_id, position, release_at, release_offset_days)
  select new_id, lesson_id, position, release_at, release_offset_days
  from public.cohort_lessons where cohort_id = p_cohort_id;

  return new_id;
end;
$$;

-- Substitui de uma vez as aulas da turma (inclusão, ordem e datas).
-- p_items: [{"lesson_id": "...", "release_at": "ISO" | null, "release_offset_days": n | null}, ...] na ordem desejada.
create or replace function public.set_cohort_lessons(p_cohort_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin_or_service();

  delete from public.cohort_lessons
  where cohort_id = p_cohort_id
    and lesson_id not in (select (item ->> 'lesson_id')::uuid from jsonb_array_elements(p_items) item);

  insert into public.cohort_lessons (cohort_id, lesson_id, position, release_at, release_offset_days)
  select
    p_cohort_id,
    (item ->> 'lesson_id')::uuid,
    (ord - 1)::integer,
    nullif(item ->> 'release_at', '')::timestamptz,
    nullif(item ->> 'release_offset_days', '')::integer
  from jsonb_array_elements(p_items) with ordinality as t(item, ord)
  on conflict (cohort_id, lesson_id) do update
  set position = excluded.position,
      release_at = excluded.release_at,
      release_offset_days = excluded.release_offset_days;
end;
$$;

revoke execute on function public.assert_admin_or_service(), public.enroll_user(uuid, uuid, public.enrollment_origin, public.payment_provider, text),
  public.duplicate_cohort(uuid), public.set_cohort_lessons(uuid, jsonb) from public, anon;
grant execute on function public.enroll_user(uuid, uuid, public.enrollment_origin, public.payment_provider, text),
  public.duplicate_cohort(uuid), public.set_cohort_lessons(uuid, jsonb), public.assert_admin_or_service()
  to authenticated, service_role;

-- >>> 20261001120300_access_rules.sql
-- =============================================================================
-- Decisões de 01/10/2026:
--   * Prazo de acesso conta da compra (padrão) ou do início da turma — escolha por turma.
--   * Um aluno só pode ter UMA matrícula ativa por curso (em cursos diferentes, várias).
-- =============================================================================

create type public.access_start as enum ('purchase', 'cohort_start');

alter table public.cohorts
  add column access_starts_from public.access_start not null default 'purchase';

comment on column public.cohorts.access_starts_from is
  'De onde conta o prazo de acesso (access_months): da compra/entrada do aluno ou do início da turma.';

-- -----------------------------------------------------------------------------
-- Uma matrícula ativa por curso
-- -----------------------------------------------------------------------------
create or replace function public.check_one_active_enrollment_per_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course_id uuid;
begin
  if not public.enrollment_is_active(new) then
    return new;
  end if;

  select course_id into v_course_id from public.cohorts where id = new.cohort_id;
  -- Serializa matrículas simultâneas do mesmo aluno no mesmo curso.
  perform pg_advisory_xact_lock(hashtext(new.user_id::text || ':' || v_course_id::text));

  if exists (
    select 1
    from public.enrollments e
    join public.cohorts c on c.id = e.cohort_id
    where e.user_id = new.user_id
      and e.id <> new.id
      and c.course_id = v_course_id
      and public.enrollment_is_active(e)
  ) then
    raise exception 'O aluno já tem matrícula ativa em outra turma deste curso'
      using errcode = 'P0001', hint = 'one_active_enrollment_per_course';
  end if;
  return new;
end;
$$;

create trigger enrollments_one_active_per_course
  before insert or update of status, cohort_id, expires_at, user_id on public.enrollments
  for each row execute function public.check_one_active_enrollment_per_course();

-- -----------------------------------------------------------------------------
-- enroll_user: prazo conforme access_starts_from
-- -----------------------------------------------------------------------------
create or replace function public.enroll_user(
  p_user_id uuid,
  p_cohort_id uuid,
  p_origin public.enrollment_origin,
  p_provider public.payment_provider default null,
  p_transaction_id text default null
)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cohorts;
  v_expires timestamptz;
  result public.enrollments;
begin
  perform public.assert_admin_or_service();

  select * into c from public.cohorts where id = p_cohort_id;
  if not found then
    raise exception 'Turma não encontrada' using errcode = 'P0002';
  end if;

  if c.access_months is not null then
    v_expires := case
      when c.access_starts_from = 'cohort_start' then coalesce(c.starts_at, now())
      else now()
    end + make_interval(months => c.access_months);
  end if;

  insert into public.enrollments (user_id, cohort_id, origin, provider, external_transaction_id, started_at, expires_at)
  values (p_user_id, p_cohort_id, p_origin, p_provider, p_transaction_id, now(), v_expires)
  on conflict (user_id, cohort_id) do update
  set
    status = 'active',
    origin = case when public.enrollment_is_active(enrollments) then enrollments.origin else excluded.origin end,
    provider = coalesce(excluded.provider, enrollments.provider),
    external_transaction_id = coalesce(excluded.external_transaction_id, enrollments.external_transaction_id),
    expires_at = case when public.enrollment_is_active(enrollments) then enrollments.expires_at else excluded.expires_at end
  returning * into result;

  return result;
end;
$$;

-- duplicate_cohort passa a copiar access_starts_from
create or replace function public.duplicate_cohort(p_cohort_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  perform public.assert_admin_or_service();

  insert into public.cohorts (
    course_id, name, description, release_mode, release_config, starts_at, ends_at,
    access_months, access_starts_from, checkout_url, live_url, is_active
  )
  select course_id, name || ' (cópia)', description, release_mode, release_config, starts_at, ends_at,
         access_months, access_starts_from, checkout_url, live_url, false
  from public.cohorts where id = p_cohort_id
  returning id into new_id;

  if new_id is null then
    raise exception 'Turma não encontrada' using errcode = 'P0002';
  end if;

  insert into public.cohort_lessons (cohort_id, lesson_id, position, release_at, release_offset_days)
  select new_id, lesson_id, position, release_at, release_offset_days
  from public.cohort_lessons where cohort_id = p_cohort_id;

  return new_id;
end;
$$;

revoke execute on function public.check_one_active_enrollment_per_course() from public, anon, authenticated;

-- >>> 20261002090000_progress_functions.sql
-- =============================================================================
-- Etapa 1B: progresso das aulas.
-- Funções SEM security definer: o RLS de lesson_progress garante que o aluno só
-- grava o próprio progresso e só em aulas que pode acessar.
-- =============================================================================

-- Registra onde o aluno está no vídeo. O percentual só sobe; conclui sozinho aos 90%.
create or replace function public.record_lesson_progress(
  p_lesson_id uuid,
  p_position_seconds integer,
  p_duration_seconds integer
)
returns public.lesson_progress
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  pct numeric(5, 2);
  result public.lesson_progress;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  pct := case
    when coalesce(p_duration_seconds, 0) > 0
      then least(100, greatest(0, round(p_position_seconds::numeric * 100 / p_duration_seconds, 2)))
    else 0
  end;

  insert into public.lesson_progress (user_id, lesson_id, seconds_watched, last_position_seconds, percent, completed_at, last_accessed_at)
  values (uid, p_lesson_id, greatest(p_position_seconds, 0), greatest(p_position_seconds, 0), pct,
          case when pct >= 90 then now() end, now())
  on conflict (user_id, lesson_id) do update
  set seconds_watched = greatest(lesson_progress.seconds_watched, excluded.seconds_watched),
      last_position_seconds = excluded.last_position_seconds,
      percent = greatest(lesson_progress.percent, excluded.percent),
      completed_at = coalesce(lesson_progress.completed_at, excluded.completed_at),
      last_accessed_at = now()
  returning * into result;

  return result;
end;
$$;

-- Botão "marcar como concluída" (e desfazer).
create or replace function public.set_lesson_completed(p_lesson_id uuid, p_completed boolean)
returns public.lesson_progress
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result public.lesson_progress;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.lesson_progress (user_id, lesson_id, percent, completed_at, last_accessed_at)
  values (uid, p_lesson_id, case when p_completed then 100 else 0 end, case when p_completed then now() end, now())
  on conflict (user_id, lesson_id) do update
  set completed_at = case when p_completed then coalesce(lesson_progress.completed_at, now()) end,
      percent = case when p_completed then 100 else lesson_progress.percent end,
      last_accessed_at = now()
  returning * into result;

  return result;
end;
$$;

-- Marca o último acesso do aluno (usado na ficha do admin e nas automações da Etapa 3).
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set last_seen_at = now()
  where id = (select auth.uid()) and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
$$;

revoke execute on function public.record_lesson_progress(uuid, integer, integer),
  public.set_lesson_completed(uuid, boolean), public.touch_last_seen() from public, anon;
grant execute on function public.record_lesson_progress(uuid, integer, integer),
  public.set_lesson_completed(uuid, boolean), public.touch_last_seen() to authenticated;

-- >>> 20261002090100_lesson_comments.sql
-- =============================================================================
-- Comentários da aula com o nome do autor. O aluno não lê o perfil dos colegas
-- (RLS), então esta função entrega só o nome curto ("Maria S.") e se é professor.
-- Aplica as mesmas regras da tabela: acesso à aula + mesma turma.
-- =============================================================================

create or replace function public.lesson_comments(p_lesson_id uuid, p_cohort_id uuid default null)
returns table (
  id uuid,
  parent_id uuid,
  content text,
  created_at timestamptz,
  author_id uuid,
  author_name text,
  author_is_admin boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.can_access_lesson(p_lesson_id) then
    return;
  end if;
  if p_cohort_id is not null and not public.is_enrolled_in_cohort(p_cohort_id) and not public.is_admin() then
    return;
  end if;

  return query
  select
    c.id,
    c.parent_id,
    c.content,
    c.created_at,
    c.user_id,
    case
      when p.role = 'admin' then coalesce(nullif(trim(p.full_name), ''), 'Professor')
      when nullif(trim(p.full_name), '') is null then 'Aluno'
      when position(' ' in trim(p.full_name)) = 0 then trim(p.full_name)
      else split_part(trim(p.full_name), ' ', 1) || ' ' || upper(left(regexp_replace(trim(p.full_name), '^.* ', ''), 1)) || '.'
    end,
    p.role = 'admin'
  from public.comments c
  join public.profiles p on p.id = c.user_id
  where c.lesson_id = p_lesson_id
    and c.cohort_id is not distinct from p_cohort_id
  order by c.created_at desc
  limit 500;
end;
$$;

revoke execute on function public.lesson_comments(uuid, uuid) from public, anon;
grant execute on function public.lesson_comments(uuid, uuid) to authenticated;

-- >>> 20261002100000_leads_and_integrations.sql
-- =============================================================================
-- Etapa 1C: captação de leads nos cursos grátis e webhooks de saída (ex.: FunilPro).
-- =============================================================================

-- Que dados o curso grátis pede e como a pessoa entra.
create type public.lead_fields as enum ('email', 'whatsapp', 'name_email', 'name_email_whatsapp');
create type public.lead_access as enum ('direct', 'confirm_email');

alter table public.courses
  add column lead_fields public.lead_fields not null default 'name_email_whatsapp',
  add column lead_access public.lead_access not null default 'direct';

comment on column public.courses.lead_fields is 'Curso grátis: dados pedidos no cadastro rápido.';
comment on column public.courses.lead_access is 'Curso grátis: direct = entra na hora; confirm_email = entra pelo link no e-mail.';

-- Cada captação de lead (a mesma pessoa pode virar lead de vários cursos).
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  source text,           -- ex.: 'gratis'
  utm jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index leads_user_idx on public.leads (user_id);
create index leads_course_idx on public.leads (course_id, created_at desc);

-- Webhooks de saída: a área avisa outros sistemas (FunilPro, n8n, Make...).
create table public.outgoing_webhooks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null check (url ~ '^https?://'),
  secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  events text[] not null default array['lead.created'],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (cardinality(events) > 0 and events <@ array['lead.created', 'purchase.approved', 'purchase.refunded'])
);

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.outgoing_webhooks (id) on delete cascade,
  event text not null,
  payload jsonb not null,
  status_code integer,
  error text,
  created_at timestamptz not null default now()
);
create index webhook_deliveries_webhook_idx on public.webhook_deliveries (webhook_id, created_at desc);

alter table public.leads enable row level security;
alter table public.outgoing_webhooks enable row level security;
alter table public.webhook_deliveries enable row level security;

create policy leads_admin_all on public.leads
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy outgoing_webhooks_admin_all on public.outgoing_webhooks
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy webhook_deliveries_admin_all on public.webhook_deliveries
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.leads, public.outgoing_webhooks, public.webhook_deliveries from anon;
grant select, insert, update, delete on public.leads, public.outgoing_webhooks, public.webhook_deliveries to authenticated;
grant all on public.leads, public.outgoing_webhooks, public.webhook_deliveries to service_role;

-- >>> 20261002100100_email_throttle.sql
-- =============================================================================
-- Limite de envio de e-mails de acesso (link mágico / criar senha) feitos pelo site:
-- no máximo 1 por minuto e 5 por hora para o mesmo e-mail. Usado só pelo servidor.
-- =============================================================================

create table public.auth_email_log (
  id bigint generated always as identity primary key,
  email text not null,
  kind text not null,
  sent_at timestamptz not null default now()
);
create index auth_email_log_email_idx on public.auth_email_log (email, sent_at desc);

alter table public.auth_email_log enable row level security;
-- Sem políticas: só a service role (que ignora RLS) lê e escreve.
revoke all on public.auth_email_log from anon, authenticated;
grant all on public.auth_email_log to service_role;

-- Registra o envio se estiver dentro do limite. Retorna false quando deve segurar.
create or replace function public.claim_auth_email(p_email text, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  e text := lower(trim(p_email));
begin
  perform pg_advisory_xact_lock(hashtext('auth_email:' || e));
  if exists (select 1 from public.auth_email_log where email = e and sent_at > now() - interval '1 minute')
     or (select count(*) from public.auth_email_log where email = e and sent_at > now() - interval '1 hour') >= 5 then
    return false;
  end if;
  insert into public.auth_email_log (email, kind) values (e, p_kind);
  delete from public.auth_email_log where sent_at < now() - interval '1 day';
  return true;
end;
$$;

revoke execute on function public.claim_auth_email(text, text) from public, anon, authenticated;
grant execute on function public.claim_auth_email(text, text) to service_role;

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
  ('20261001120000', 'initial_schema'),
  ('20261001120100', 'storage'),
  ('20261001120200', 'enrollment_functions'),
  ('20261001120300', 'access_rules'),
  ('20261002090000', 'progress_functions'),
  ('20261002090100', 'lesson_comments'),
  ('20261002100000', 'leads_and_integrations'),
  ('20261002100100', 'email_throttle'),
  ('20261003090000', 'ai_transcripts')
on conflict (version) do nothing;

commit;
