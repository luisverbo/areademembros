-- =============================================================================
-- Etapa 3B: certificados, recomendação de próximo curso e painel de desempenho.
-- =============================================================================

alter table public.courses
  add column certificate_enabled boolean not null default false,
  add column certificate_hours integer check (certificate_hours > 0 and certificate_hours <= 10000),
  add column next_course_id uuid references public.courses (id) on delete set null,
  add constraint courses_next_course_not_self check (next_course_id is distinct from id);

-- Certificado emitido (fotografia do nome e do curso no dia da emissão).
create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  student_name text not null,
  course_title text not null,
  hours integer,
  issued_at timestamptz not null default now(),
  unique (user_id, course_id)
);

alter table public.certificates enable row level security;
create policy certificates_select_own on public.certificates
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy certificates_admin_delete on public.certificates
  for delete to authenticated using ((select public.is_admin()));
revoke all on public.certificates from anon;
grant select, delete on public.certificates to authenticated;
grant all on public.certificates to service_role;

-- Concluiu o curso: todas as aulas publicadas da turma de alguma matrícula (não reembolsada).
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
        where cl.cohort_id = e.cohort_id
      )
      and not exists (
        select 1 from public.cohort_lessons cl
        join public.lessons l on l.id = cl.lesson_id and l.is_published
        left join public.lesson_progress p on p.user_id = e.user_id and p.lesson_id = l.id and p.completed_at is not null
        where cl.cohort_id = e.cohort_id and p.lesson_id is null
      )
  );
$$;

-- Emite (ou devolve) o certificado do aluno logado. Só com o certificado ligado no curso e o curso concluído.
create or replace function public.issue_certificate(p_course_id uuid)
returns public.certificates
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cert public.certificates;
  course public.courses;
  name text;
  total_seconds bigint;
begin
  if uid is null then
    raise exception 'login necessário' using errcode = '42501';
  end if;
  select * into cert from public.certificates where user_id = uid and course_id = p_course_id;
  if cert.id is not null then
    return cert;
  end if;

  select * into course from public.courses where id = p_course_id;
  if course.id is null or not course.certificate_enabled then
    raise exception 'certificado indisponível' using errcode = 'P0001';
  end if;
  if not public.has_completed_course(uid, p_course_id) then
    raise exception 'curso não concluído' using errcode = 'P0001';
  end if;
  select nullif(trim(full_name), '') into name from public.profiles where id = uid;
  if name is null then
    raise exception 'nome ausente' using errcode = 'P0001';
  end if;

  select sum(l.duration_seconds) into total_seconds
  from public.lessons l join public.modules m on m.id = l.module_id
  where m.course_id = p_course_id and l.is_published;

  insert into public.certificates (user_id, course_id, student_name, course_title, hours)
  values (uid, p_course_id, name, course.title,
          coalesce(course.certificate_hours, nullif(ceil(coalesce(total_seconds, 0) / 3600.0)::integer, 0)))
  on conflict (user_id, course_id) do update set user_id = excluded.user_id
  returning * into cert;
  return cert;
end;
$$;

-- Verificação pública pelo código (quem recebe o certificado confere se é verdadeiro).
create or replace function public.verify_certificate(p_code text)
returns table (student_name text, course_title text, hours integer, issued_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.student_name, c.course_title, c.hours, c.issued_at
  from public.certificates c
  where c.code = upper(trim(p_code));
$$;

-- Cursos recomendados para o aluno logado: o "próximo curso" definido no admin vem primeiro;
-- depois, os mais feitos por quem estuda os mesmos cursos ("quem fez X também fez Y").
create or replace function public.recommended_courses(p_limit integer default 12)
returns table (course_id uuid, score numeric, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select distinct co.course_id,
      public.has_completed_course((select auth.uid()), co.course_id) as completed
    from public.enrollments e
    join public.cohorts co on co.id = e.cohort_id
    where e.user_id = (select auth.uid()) and e.status <> 'refunded'
  ),
  active_mine as (
    select distinct co.course_id
    from public.enrollments e
    join public.cohorts co on co.id = e.cohort_id
    where e.user_id = (select auth.uid()) and public.enrollment_is_active(e)
  ),
  peers as (
    select distinct e.user_id
    from public.enrollments e
    join public.cohorts co on co.id = e.cohort_id
    where co.course_id in (select course_id from mine) and e.user_id <> (select auth.uid())
  ),
  co_enrolled as (
    select co.course_id, count(distinct e.user_id) as n
    from public.enrollments e
    join public.cohorts co on co.id = e.cohort_id
    where e.user_id in (select user_id from peers) and e.origin = 'purchase'
    group by co.course_id
  ),
  scored as (
    select c.id,
      coalesce((select max(case when m.completed then 1000 else 500 end)
                from mine m join public.courses src on src.id = m.course_id
                where src.next_course_id = c.id), 0)
      + coalesce((select n from co_enrolled ce where ce.course_id = c.id), 0) as score,
      case
        when exists (select 1 from mine m join public.courses src on src.id = m.course_id where src.next_course_id = c.id)
          then 'next'
        when exists (select 1 from co_enrolled ce where ce.course_id = c.id) then 'peers'
        else 'showcase'
      end as reason,
      c.showcase_order
    from public.courses c
    where c.is_published and not c.is_free
      and c.id not in (select course_id from active_mine)
  )
  select id, score, reason from scored
  order by score desc, showcase_order
  limit least(greatest(p_limit, 1), 50);
$$;

revoke execute on function public.has_completed_course(uuid, uuid) from public, anon, authenticated;
grant execute on function public.has_completed_course(uuid, uuid) to service_role;
revoke execute on function public.issue_certificate(uuid), public.recommended_courses(integer) from public, anon;
grant execute on function public.issue_certificate(uuid), public.recommended_courses(integer) to authenticated, service_role;
revoke execute on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Painel de desempenho (só admin)
-- -----------------------------------------------------------------------------

-- Por turma: alunos ativos, progresso médio, quantos concluíram e quantos estão parados há 7+ dias.
create or replace function public.cohort_stats()
returns table (
  cohort_id uuid, cohort_name text, course_id uuid, course_title text, is_active boolean,
  students integer, lessons integer, avg_percent numeric, completed integer, idle integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.assert_admin_or_service();
  return query
  with cl as (
    select cl.cohort_id, cl.lesson_id
    from public.cohort_lessons cl join public.lessons l on l.id = cl.lesson_id and l.is_published
  ),
  per_student as (
    select e.cohort_id, e.user_id, p.last_seen_at,
      (select count(*) from cl join public.lesson_progress lp on lp.lesson_id = cl.lesson_id
        and lp.user_id = e.user_id and lp.completed_at is not null where cl.cohort_id = e.cohort_id) as done
    from public.enrollments e
    join public.profiles p on p.id = e.user_id and p.role = 'student'
    where public.enrollment_is_active(e)
  ),
  totals as (select cohort_id, count(*) as n from cl group by cohort_id)
  select co.id, co.name, c.id, c.title, co.is_active,
    count(ps.user_id)::integer,
    coalesce(t.n, 0)::integer,
    case when coalesce(t.n, 0) = 0 or count(ps.user_id) = 0 then 0
      else round(avg(ps.done)::numeric * 100 / t.n, 1) end,
    count(ps.user_id) filter (where t.n > 0 and ps.done >= t.n)::integer,
    count(ps.user_id) filter (where coalesce(ps.last_seen_at, '-infinity') < now() - interval '7 days')::integer
  from public.cohorts co
  join public.courses c on c.id = co.course_id
  left join totals t on t.cohort_id = co.id
  left join per_student ps on ps.cohort_id = co.id
  group by co.id, co.name, c.id, c.title, co.is_active, t.n, co.created_at
  order by co.is_active desc, co.created_at desc;
end;
$$;

-- Abandono por aula: dos alunos ativos da turma, quantos começaram e quantos concluíram cada aula.
create or replace function public.cohort_lesson_funnel(p_cohort_id uuid)
returns table (lesson_id uuid, title text, lesson_position integer, students integer, started integer, completed integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.assert_admin_or_service();
  return query
  with students as (
    select e.user_id from public.enrollments e
    join public.profiles p on p.id = e.user_id and p.role = 'student'
    where e.cohort_id = p_cohort_id and public.enrollment_is_active(e)
  )
  select l.id, l.title, cl.position,
    (select count(*) from students)::integer,
    count(lp.user_id) filter (where lp.percent > 0 or lp.completed_at is not null)::integer,
    count(lp.user_id) filter (where lp.completed_at is not null)::integer
  from public.cohort_lessons cl
  join public.lessons l on l.id = cl.lesson_id and l.is_published
  left join public.lesson_progress lp on lp.lesson_id = l.id and lp.user_id in (select user_id from students)
  where cl.cohort_id = p_cohort_id
  group by l.id, l.title, cl.position
  order by cl.position, l.id;
end;
$$;

revoke execute on function public.cohort_stats(), public.cohort_lesson_funnel(uuid) from public, anon;
grant execute on function public.cohort_stats(), public.cohort_lesson_funnel(uuid) to authenticated, service_role;
