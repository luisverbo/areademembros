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
