-- =============================================================================
-- Área do aluno: módulos com banner e descrição; layout dos módulos por curso.
-- =============================================================================

alter table public.modules
  add column description text check (description is null or length(description) <= 600),
  add column cover_url text;

-- cards = banners dos módulos (padrão); list = lista simples de aulas.
alter table public.courses
  add column module_layout text not null default 'cards' check (module_layout in ('cards', 'list'));
