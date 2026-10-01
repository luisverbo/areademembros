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
