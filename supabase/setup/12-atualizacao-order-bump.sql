-- =============================================================================
-- LC.Academy — ATUALIZAÇÃO do banco (gerado automaticamente; não edite)
-- Migrações: 20261013090000
--
-- Como usar: Supabase > SQL Editor > New query > cole TUDO > Run.
-- Rode UMA vez, num banco que já tem a instalação anterior.
-- Tudo roda numa transação: se algo falhar, nada é aplicado.
-- =============================================================================

begin;

-- >>> 20261013090000_addon_modules.sql
-- =============================================================================
-- Módulos extras pagos à parte (order bump): ficam dentro do curso, com cadeado
-- para quem não comprou. A compra do produto ligado ao módulo libera só ele.
-- =============================================================================

alter table public.modules
  add column is_addon boolean not null default false,
  add column addon_checkout_url text check (addon_checkout_url is null or addon_checkout_url ~ '^https://');

-- Produto de cada plataforma que libera o módulo extra.
create table public.module_products (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules (id) on delete cascade,
  provider public.payment_provider not null,
  external_product_id text not null check (length(trim(external_product_id)) between 1 and 200),
  label text,
  created_at timestamptz not null default now(),
  unique (provider, external_product_id)
);
create index module_products_module_idx on public.module_products (module_id);

-- Quem tem o módulo extra.
create table public.module_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  origin public.enrollment_origin not null,
  status text not null default 'active' check (status in ('active', 'refunded')),
  provider public.payment_provider,
  external_transaction_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, module_id)
);
create index module_grants_transaction_idx on public.module_grants (provider, external_transaction_id);
create trigger module_grants_updated_at before update on public.module_grants
  for each row execute function public.set_updated_at();

-- Um mesmo produto não pode liberar turma e módulo ao mesmo tempo (evita confusão no webhook).
create or replace function public.check_product_not_cohort()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.cohort_products cp where cp.provider = new.provider and cp.external_product_id = new.external_product_id) then
    raise exception 'Este produto já está ligado a uma turma' using errcode = '23505';
  end if;
  return new;
end;
$$;
create trigger module_products_not_cohort before insert or update on public.module_products
  for each row execute function public.check_product_not_cohort();

alter table public.module_products enable row level security;
alter table public.module_grants enable row level security;
create policy module_products_admin on public.module_products
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy module_grants_admin on public.module_grants
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy module_grants_own on public.module_grants
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.module_products, public.module_grants from anon;
grant select, insert, update, delete on public.module_products, public.module_grants to authenticated;
grant all on public.module_products, public.module_grants to service_role;

-- O usuário tem acesso ao módulo extra (ou o módulo não é extra)?
create or replace function public.has_module_access(p_user_id uuid, p_module_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.modules m where m.id = p_module_id and m.is_addon)
    or exists (
      select 1 from public.module_grants g
      where g.user_id = p_user_id and g.module_id = p_module_id and g.status = 'active'
    );
$$;
revoke execute on function public.has_module_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public.has_module_access(uuid, uuid) to service_role;

-- Acesso à aula: igual ao anterior, mais a regra do módulo extra.
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

  -- Liberação individual feita pelo admin vale sempre.
  if exists (select 1 from public.lesson_unlocks u where u.user_id = uid and u.lesson_id = p_lesson_id) then
    return true;
  end if;

  -- Módulo extra (order bump): só para quem comprou.
  if not public.has_module_access(uid, l.module_id) then
    return false;
  end if;

  -- Grátis: qualquer usuário logado (lead incluído).
  if l.is_free or co.is_free then
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

-- Concluir o curso não exige o módulo extra de quem não o comprou.
create or replace function public.has_completed_course(p_user_id uuid, p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.cohorts co on co.id = e.cohort_id and co.course_id = p_course_id
    where e.user_id = p_user_id
      and e.status <> 'refunded'
      and exists (
        select 1 from public.cohort_lessons cl
        join public.lessons l on l.id = cl.lesson_id and l.is_published
        where cl.cohort_id = e.cohort_id and public.has_module_access(e.user_id, l.module_id)
      )
      and not exists (
        select 1 from public.cohort_lessons cl
        join public.lessons l on l.id = cl.lesson_id and l.is_published
        left join public.lesson_progress p on p.user_id = e.user_id and p.lesson_id = l.id and p.completed_at is not null
        where cl.cohort_id = e.cohort_id and p.lesson_id is null and public.has_module_access(e.user_id, l.module_id)
      )
  );
$$;

create or replace function public.automation_courses_completed()
returns table (user_id uuid, course_id uuid, course_title text, completed_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select e.user_id, c.id, c.title, max(p.completed_at)
  from public.enrollments e
  join public.cohorts co on co.id = e.cohort_id
  join public.courses c on c.id = co.course_id
  join public.cohort_lessons cl on cl.cohort_id = e.cohort_id
  join public.lessons l on l.id = cl.lesson_id and l.is_published
  left join public.lesson_progress p on p.user_id = e.user_id and p.lesson_id = l.id and p.completed_at is not null
  where public.enrollment_is_active(e) and public.has_module_access(e.user_id, l.module_id)
  group by e.user_id, c.id, c.title
  having count(*) > 0 and count(*) = count(p.lesson_id);
$$;

-- E o contrário: produto de turma que já libera um módulo extra.
create or replace function public.check_product_not_module()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.module_products mp where mp.provider = new.provider and mp.external_product_id = new.external_product_id) then
    raise exception 'Este produto já está ligado a um módulo extra' using errcode = '23505';
  end if;
  return new;
end;
$$;
create trigger cohort_products_not_module before insert or update on public.cohort_products
  for each row execute function public.check_product_not_module();

-- Registra as migrações aplicadas (permite usar "supabase db push" no futuro).
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261013090000', 'addon_modules')
on conflict (version) do nothing;

commit;
