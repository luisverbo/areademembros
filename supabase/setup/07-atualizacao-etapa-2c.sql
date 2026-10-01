-- =============================================================================
-- LC.Academy — ATUALIZAÇÃO do banco (gerado automaticamente; não edite)
-- Migrações: 20261004090000
--
-- Como usar: Supabase > SQL Editor > New query > cole TUDO > Run.
-- Rode UMA vez, num banco que já tem a instalação anterior.
-- Tudo roda numa transação: se algo falhar, nada é aplicado.
-- =============================================================================

begin;

-- >>> 20261004090000_radar.sql
-- =============================================================================
-- Etapa 2C: Radar de Comentários (sem IA). O admin marca um comentário como resolvido
-- sem precisar responder; respostas do professor também tiram o comentário da fila.
-- =============================================================================

alter table public.comments add column handled_at timestamptz;
create index comments_created_idx on public.comments (created_at desc);
create index comments_parent_idx on public.comments (parent_id) where parent_id is not null;

create or replace function public.set_comment_handled(p_comment_id uuid, p_handled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'apenas admin' using errcode = '42501';
  end if;
  update public.comments
  set handled_at = case when p_handled then now() else null end
  where id = p_comment_id;
end;
$$;

revoke execute on function public.set_comment_handled(uuid, boolean) from public, anon;
grant execute on function public.set_comment_handled(uuid, boolean) to authenticated, service_role;

-- Registra as migrações aplicadas (permite usar "supabase db push" no futuro).
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261004090000', 'radar')
on conflict (version) do nothing;

commit;
