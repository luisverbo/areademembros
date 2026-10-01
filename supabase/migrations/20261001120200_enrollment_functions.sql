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
