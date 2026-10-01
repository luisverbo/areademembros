-- =============================================================================
-- Etapa 3A: Central de Mensagens (e-mail e WhatsApp), automações e descadastro (LGPD).
-- =============================================================================

create type public.message_channel as enum ('email', 'whatsapp');
create type public.delivery_status as enum ('pending', 'sent', 'failed', 'skipped');

-- Descadastro: link pessoal (sem login) em todo e-mail. Quem sai não recebe mais nada
-- da Central (nem promoção nem avisos); e-mails de acesso e senha continuam.
alter table public.profiles
  add column unsubscribe_token uuid not null default gen_random_uuid(),
  add column messages_opt_out_at timestamptz;
create unique index profiles_unsubscribe_token_key on public.profiles (unsubscribe_token);

-- Envios manuais (e o histórico de cada automação).
create table public.message_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0 and length(name) <= 200),
  channel public.message_channel not null,
  -- promo = só quem aceitou receber mensagens; notice = aviso a quem está matriculado
  purpose text not null default 'notice' check (purpose in ('notice', 'promo')),
  audience jsonb not null default '{}'::jsonb,
  subject text check (length(subject) <= 200),
  body text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  status text not null default 'sending' check (status in ('sending', 'sent')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index message_campaigns_created_idx on public.message_campaigns (created_at desc);

-- Cada mensagem para cada pessoa. dedupe_key evita mandar a mesma automação duas vezes.
create table public.message_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.message_campaigns (id) on delete cascade,
  automation_key text,
  user_id uuid references public.profiles (id) on delete set null,
  channel public.message_channel not null,
  to_address text not null,
  subject text,
  body text not null,
  status public.delivery_status not null default 'pending',
  error text,
  provider_message_id text,
  dedupe_key text unique,
  attempts integer not null default 0,
  claimed_at timestamptz, -- reserva de quem está enviando (expira em 5 min)
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index message_deliveries_campaign_idx on public.message_deliveries (campaign_id, status);
create index message_deliveries_pending_idx on public.message_deliveries (created_at) where status = 'pending';
create index message_deliveries_user_idx on public.message_deliveries (user_id, created_at desc);
create index message_deliveries_automation_idx on public.message_deliveries (automation_key, created_at desc);

-- Automações (uma linha por tipo). O texto e os canais são editáveis no admin.
create table public.automations (
  key text primary key check (key in (
    'idle', 'lesson_released', 'course_completed', 'free_no_purchase', 'urgent_comment', 'weekly_report'
  )),
  enabled boolean not null default false,
  channels public.message_channel[] not null default '{email}',
  subject text check (length(subject) <= 200),
  body text not null default '' check (length(body) <= 4000),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger automations_updated_at before update on public.automations
  for each row execute function public.set_updated_at();

insert into public.automations (key, channels, subject, body, settings) values
  ('idle', '{email,whatsapp}', 'Sentimos sua falta, {{nome}}',
   'Oi, {{nome}}! Faz alguns dias que você não aparece em {{curso}}. Sua próxima aula está te esperando: {{link}}',
   '{"days": 3}'),
  ('lesson_released', '{email,whatsapp}', 'Aula nova liberada: {{aula}}',
   'Oi, {{nome}}! A aula "{{aula}}" de {{curso}} acabou de ser liberada. Assista aqui: {{link}}', '{}'),
  ('course_completed', '{email}', 'Parabéns, {{nome}}! Você concluiu {{curso}}',
   'Parabéns, {{nome}}! Você concluiu todas as aulas de {{curso}}. Veja os próximos passos: {{link}}', '{}'),
  ('free_no_purchase', '{email,whatsapp}', '{{nome}}, pronto para o próximo passo?',
   'Oi, {{nome}}! Você começou {{curso}}. Que tal dar o próximo passo? {{link}}',
   '{"days": 2, "link": ""}'),
  ('urgent_comment', '{email,whatsapp}', 'Comentário urgente em {{curso}}',
   'Comentário urgente de {{aluno}} em "{{aula}}": "{{comentario}}". Veja no Radar: {{link}}',
   '{"email": "", "whatsapp": ""}'),
  ('weekly_report', '{email}', 'Resumo da semana na área de membros', '', '{"email": "", "whatsapp": ""}');

-- RLS: só admin (o envio roda com a chave de serviço).
alter table public.message_campaigns enable row level security;
alter table public.message_deliveries enable row level security;
alter table public.automations enable row level security;
create policy message_campaigns_admin on public.message_campaigns
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy message_deliveries_admin on public.message_deliveries
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy automations_admin on public.automations
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.message_campaigns, public.message_deliveries, public.automations from anon;
grant select, insert, update, delete on public.message_campaigns, public.message_deliveries, public.automations to authenticated;
grant all on public.message_campaigns, public.message_deliveries, public.automations to service_role;

-- -----------------------------------------------------------------------------
-- Públicos das automações (rodam com a chave de serviço, no cron diário)
-- -----------------------------------------------------------------------------

-- Aulas que liberaram na janela para cada matrícula ativa (não conta o que já estava liberado na entrada).
create or replace function public.automation_lessons_released(p_from timestamptz, p_to timestamptz)
returns table (user_id uuid, lesson_id uuid, lesson_title text, course_title text, released_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select e.user_id, l.id, l.title, c.title, r.released_at
  from public.enrollments e
  join public.cohorts co on co.id = e.cohort_id
  join public.courses c on c.id = co.course_id
  join public.cohort_lessons cl on cl.cohort_id = e.cohort_id
  join public.lessons l on l.id = cl.lesson_id and l.is_published
  cross join lateral (select public.lesson_release_at(e.cohort_id, cl.lesson_id, e.started_at) as released_at) r
  where public.enrollment_is_active(e)
    and r.released_at > p_from and r.released_at <= p_to
    and r.released_at > e.started_at + interval '1 hour'
  order by e.user_id, r.released_at, cl.position;
$$;

-- Matrículas ativas em que o aluno concluiu todas as aulas publicadas da turma.
create or replace function public.automation_courses_completed()
returns table (user_id uuid, course_id uuid, course_title text, completed_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select e.user_id, c.id, c.title, max(p.completed_at)
  from public.enrollments e
  join public.cohorts co on co.id = e.cohort_id
  join public.courses c on c.id = co.course_id
  join public.cohort_lessons cl on cl.cohort_id = e.cohort_id
  join public.lessons l on l.id = cl.lesson_id and l.is_published
  left join public.lesson_progress p on p.user_id = e.user_id and p.lesson_id = l.id and p.completed_at is not null
  where public.enrollment_is_active(e)
  group by e.user_id, c.id, c.title
  having count(*) > 0 and count(*) = count(p.lesson_id);
$$;

-- Alunos com matrícula ativa sem entrar há N dias (um por aluno, com o curso mais recente).
create or replace function public.automation_idle_students(p_days integer)
returns table (user_id uuid, course_id uuid, course_title text, last_seen_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select distinct on (e.user_id) e.user_id, c.id, c.title, p.last_seen_at
  from public.enrollments e
  join public.profiles p on p.id = e.user_id and p.role = 'student'
  join public.cohorts co on co.id = e.cohort_id
  join public.courses c on c.id = co.course_id
  where public.enrollment_is_active(e)
    and e.started_at < now() - make_interval(days => p_days)
    and coalesce(p.last_seen_at, e.started_at) < now() - make_interval(days => p_days)
  order by e.user_id, e.started_at desc;
$$;

-- Leads de curso grátis que entraram há N dias (janela de 7 dias) e ainda não compraram nada.
create or replace function public.automation_free_no_purchase(p_days integer)
returns table (user_id uuid, course_id uuid, course_title text)
language sql
stable
set search_path = ''
as $$
  select distinct on (e.user_id) e.user_id, c.id, c.title
  from public.enrollments e
  join public.cohorts co on co.id = e.cohort_id
  join public.courses c on c.id = co.course_id
  where e.origin = 'free'
    and e.started_at <= now() - make_interval(days => p_days)
    and e.started_at > now() - make_interval(days => p_days + 7)
    and not exists (
      select 1 from public.enrollments b where b.user_id = e.user_id and b.origin = 'purchase'
    )
  order by e.user_id, e.started_at desc;
$$;

revoke execute on function
  public.automation_lessons_released(timestamptz, timestamptz),
  public.automation_courses_completed(),
  public.automation_idle_students(integer),
  public.automation_free_no_purchase(integer)
  from public, anon, authenticated;
grant execute on function
  public.automation_lessons_released(timestamptz, timestamptz),
  public.automation_courses_completed(),
  public.automation_idle_students(integer),
  public.automation_free_no_purchase(integer)
  to service_role;
