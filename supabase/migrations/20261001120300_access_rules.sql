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
