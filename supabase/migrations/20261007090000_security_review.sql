-- =============================================================================
-- Etapa 3C: correções da revisão de segurança.
-- =============================================================================

-- 1. Link da live só para quem está na turma (antes qualquer visitante lia cohorts.live_url).
create table public.cohort_live_links (
  cohort_id uuid primary key references public.cohorts (id) on delete cascade,
  live_url text check (live_url is null or live_url ~ '^https://'),
  updated_at timestamptz not null default now()
);
insert into public.cohort_live_links (cohort_id, live_url)
  select id, live_url from public.cohorts where live_url is not null;
alter table public.cohorts drop column live_url;

alter table public.cohort_live_links enable row level security;
create policy cohort_live_links_admin on public.cohort_live_links
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy cohort_live_links_enrolled on public.cohort_live_links
  for select to authenticated using ((select public.is_enrolled_in_cohort(cohort_id)));
revoke all on public.cohort_live_links from anon;
grant select, insert, update, delete on public.cohort_live_links to authenticated;
grant all on public.cohort_live_links to service_role;

-- 2. Aceite de mensagens não é editável pelo aluno direto na API (só pelo site, em "Minha conta").
revoke update on public.profiles from authenticated;
grant update (full_name, whatsapp, avatar_url, last_seen_at, role) on public.profiles to authenticated;

-- 3. Funções internas de liberação não precisam ser chamadas pelo aluno.
revoke execute on function public.lesson_release_at(uuid, uuid, timestamptz) from authenticated;

-- 4. Prévia (trailer) com vídeo próprio, em vez de expor o vídeo inteiro de uma aula paga.
alter table public.courses
  add column preview_video_provider public.video_provider,
  add column preview_video_id text check (preview_video_id is null or length(preview_video_id) between 1 and 200);
update public.courses c
  set preview_video_provider = lc.video_provider, preview_video_id = lc.video_id
  from public.lesson_contents lc
  where lc.lesson_id = c.preview_lesson_id and c.preview_video_id is null;
alter table public.courses drop column preview_lesson_id;

-- 5. Curso grátis: por padrão entra pelo link no e-mail (quem já tem conta nunca entra só digitando o e-mail).
alter table public.courses alter column lead_access set default 'confirm_email';

-- 6. Derruba todas as sessões de um usuário (quando uma compra chega para uma conta que nasceu num cadastro grátis).
create or replace function public.revoke_user_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin_or_service();
  delete from auth.sessions where user_id = p_user_id;
end;
$$;
revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

-- 7. Limite por origem (IP) para formulários públicos: cadastro grátis, link de acesso, senha.
create table public.rate_limits (
  key text not null,
  hit_at timestamptz not null default now()
);
create index rate_limits_key_idx on public.rate_limits (key, hit_at desc);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

-- true = pode seguir (e registra); false = passou do limite na janela.
create or replace function public.claim_rate_limit(p_key text, p_max integer, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin_or_service();
  perform pg_advisory_xact_lock(hashtext('rate:' || p_key));
  if (select count(*) from public.rate_limits where key = p_key and hit_at > now() - p_window) >= p_max then
    return false;
  end if;
  insert into public.rate_limits (key) values (p_key);
  delete from public.rate_limits where hit_at < now() - interval '1 day';
  return true;
end;
$$;
revoke execute on function public.claim_rate_limit(text, integer, interval) from public, anon, authenticated;
grant execute on function public.claim_rate_limit(text, integer, interval) to service_role;

-- 8. Webhook: reserva atômica do evento (duas entregas simultâneas não processam duas vezes).
create or replace function public.claim_webhook_event(p_provider public.payment_provider, p_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed uuid;
begin
  perform public.assert_admin_or_service();
  update public.webhook_events
  set status = 'received', processed_at = null, error = null
  where provider = p_provider and idempotency_key = p_key
    and (status = 'failed' or (status = 'received' and received_at < now() - interval '2 minutes'))
  returning id into claimed;
  return claimed;
end;
$$;
revoke execute on function public.claim_webhook_event(public.payment_provider, text) from public, anon, authenticated;
grant execute on function public.claim_webhook_event(public.payment_provider, text) to service_role;

-- 9. Duplicar turma sem a coluna live_url (o link da live é copiado na tabela própria).
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
    access_months, access_starts_from, checkout_url, is_active
  )
  select course_id, name || ' (cópia)', description, release_mode, release_config, starts_at, ends_at,
         access_months, access_starts_from, checkout_url, false
  from public.cohorts where id = p_cohort_id
  returning id into new_id;

  if new_id is null then
    raise exception 'Turma não encontrada' using errcode = 'P0002';
  end if;

  insert into public.cohort_lessons (cohort_id, lesson_id, position, release_at, release_offset_days)
  select new_id, lesson_id, position, release_at, release_offset_days
  from public.cohort_lessons where cohort_id = p_cohort_id;

  insert into public.cohort_live_links (cohort_id, live_url)
  select new_id, live_url from public.cohort_live_links where cohort_id = p_cohort_id;

  return new_id;
end;
$$;
