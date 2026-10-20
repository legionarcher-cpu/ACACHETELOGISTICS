-- 20 de 23 · sql/00_instalacion_completa.sql · Usuarios: cédula y departamento (para búsquedas) (secciones 35 a 35).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 35. USUARIOS: CÉDULA Y DEPARTAMENTO (sql/01 bloque 42)
--   Los llena quien crea o modifica el usuario (Usuarios -> Nuevo / Modificar,
--   js/secciones/usuarios.js). Los dos opcionales; el buscador de Usuarios los usa.
--   - cedula:       cédula de identidad (ej. "1-1234-5678")
--   - departamento: área donde trabaja (ej. "Bodega", "Ventas", "Contabilidad")
--   Al final se vuelve a ejecutar usuarios_ocultar_clave() (sql/01 bloque 20): la
--   página solo lee las columnas con permiso, y las nuevas lo necesitan.
--   Se puede repetir.
-- ==================================================

alter table public.usuarios add column if not exists cedula text;
alter table public.usuarios add column if not exists departamento text;
create index if not exists usuarios_cedula_idx on public.usuarios (cedula) where cedula is not null;

select public.usuarios_ocultar_clave();

notify pgrst, 'reload schema';

