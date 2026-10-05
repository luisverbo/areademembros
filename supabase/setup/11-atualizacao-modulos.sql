-- =============================================================================
-- LC.Academy — ATUALIZAÇÃO do banco (gerado automaticamente; não edite)
-- Migrações: 20261008090000
--
-- Como usar: Supabase > SQL Editor > New query > cole TUDO > Run.
-- Rode UMA vez, num banco que já tem a instalação anterior.
-- Tudo roda numa transação: se algo falhar, nada é aplicado.
-- =============================================================================

begin;

-- >>> 20261008090000_module_banners.sql
-- =============================================================================
-- Área do aluno: módulos com banner e descrição; layout dos módulos por curso.
-- =============================================================================

alter table public.modules
  add column description text check (description is null or length(description) <= 600),
  add column cover_url text;

-- cards = banners dos módulos (padrão); list = lista simples de aulas.
alter table public.courses
  add column module_layout text not null default 'cards' check (module_layout in ('cards', 'list'));

-- Registra as migrações aplicadas (permite usar "supabase db push" no futuro).
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261008090000', 'module_banners')
on conflict (version) do nothing;

commit;
