-- =============================================================================
-- Storage: capas/banners (público) e materiais das aulas (privado).
-- Vídeos NUNCA ficam aqui (Bunny Stream / YouTube).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('course-assets', 'course-assets', true, 10 * 1024 * 1024,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('lesson-materials', 'lesson-materials', false, 50 * 1024 * 1024, null)
on conflict (id) do nothing;

-- Imagens: leitura pública (bucket público); escrita só do admin.
create policy course_assets_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'course-assets' and (select public.is_admin()))
  with check (bucket_id = 'course-assets' and (select public.is_admin()));

-- Materiais: caminho "<lesson_id>/<arquivo>". Admin escreve; aluno com acesso à aula lê.
create policy lesson_materials_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'lesson-materials' and (select public.is_admin()))
  with check (bucket_id = 'lesson-materials' and (select public.is_admin()));

create policy lesson_materials_read_access on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lesson-materials'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.can_access_lesson(((storage.foldername(name))[1])::uuid)
  );
