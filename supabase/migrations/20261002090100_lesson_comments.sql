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
