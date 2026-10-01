-- =============================================================================
-- LC.Academy — ATUALIZAÇÃO do banco (gerado automaticamente; não edite)
-- Migrações: 20261002100000, 20261002100100
--
-- Como usar: Supabase > SQL Editor > New query > cole TUDO > Run.
-- Rode UMA vez, num banco que já tem a instalação anterior.
-- Tudo roda numa transação: se algo falhar, nada é aplicado.
-- =============================================================================

begin;

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

-- Registra as migrações aplicadas (permite usar "supabase db push" no futuro).
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261002100000', 'leads_and_integrations'),
  ('20261002100100', 'email_throttle')
on conflict (version) do nothing;

commit;
