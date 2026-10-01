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
