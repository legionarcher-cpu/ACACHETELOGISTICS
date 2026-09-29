-- ==================================================
-- FOTOS DE USUARIO (Supabase Storage)
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   (Se ejecuta UNA sola vez)
--
-- Qué hace:
--   1. Agrega a "usuarios" la columna foto_url (enlace a la foto).
--   2. Crea el bucket (carpeta de archivos) "avatares":
--        - público (las fotos se pueden ver en la página)
--        - máximo 2 MB por archivo
--        - solo JPG, PNG y WEBP
--   3. Reglas TEMPORALES para que la web pueda subir, cambiar y
--      borrar fotos en ese bucket (igual que las tablas).
--
-- Cómo se guardan: la página achica la foto a 256x256 px (JPG) y la
-- sube como  avatares/usuarios/<id del usuario>.jpg
-- La tabla solo guarda el enlace, no la imagen.
--
-- ⚠ Igual que los archivos anteriores: acceso abierto (modo rápido).
-- ==================================================


-- ---------- 1. Columna para el enlace de la foto ----------
alter table public.usuarios
    add column foto_url text;


-- ---------- 2. Bucket "avatares" ----------
-- file_size_limit en bytes: 2 MB = 2 * 1024 * 1024 = 2097152
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'avatares',
    'avatares',
    true,
    2097152,
    array['image/jpeg', 'image/png', 'image/webp']
);


-- ---------- 3. Reglas de acceso al bucket (TEMPORAL) ----------
-- Solo aplican al bucket "avatares".
-- CUANDO SE PASE A LA VERSIÓN SEGURA (Fase 7): cada usuario solo su
-- propia foto y el administrador todas.

create policy "TEMPORAL - ver avatares"
    on storage.objects for select to anon
    using (bucket_id = 'avatares');

create policy "TEMPORAL - subir avatares"
    on storage.objects for insert to anon
    with check (bucket_id = 'avatares');

create policy "TEMPORAL - reemplazar avatares"
    on storage.objects for update to anon
    using (bucket_id = 'avatares')
    with check (bucket_id = 'avatares');

create policy "TEMPORAL - borrar avatares"
    on storage.objects for delete to anon
    using (bucket_id = 'avatares');
