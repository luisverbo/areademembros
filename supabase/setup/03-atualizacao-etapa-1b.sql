-- =============================================================================
-- LC.Academy — ATUALIZAÇÃO do banco (gerado automaticamente; não edite)
-- Migrações: 20261002090000, 20261002090100
--
-- Como usar: Supabase > SQL Editor > New query > cole TUDO > Run.
-- Rode UMA vez, num banco que já tem a instalação anterior.
-- Tudo roda numa transação: se algo falhar, nada é aplicado.
-- =============================================================================

begin;

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

-- Registra as migrações aplicadas (permite usar "supabase db push" no futuro).
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261002090000', 'progress_functions'),
  ('20261002090100', 'lesson_comments')
on conflict (version) do nothing;

commit;
