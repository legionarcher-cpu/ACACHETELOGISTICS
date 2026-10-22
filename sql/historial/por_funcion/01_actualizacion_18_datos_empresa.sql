-- 18 de 23 · sql/01_actualizacion_base_existente.sql · Datos de cada empresa: razón social, cédula jurídica, teléfono, dirección, ubicación y giro (bloques 41 a 41).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 41. DATOS DE CADA EMPRESA INTERNA: RAZÓN SOCIAL, CÉDULA JURÍDICA, TELÉFONO, DIRECCIÓN, UBICACIÓN Y GIRO
--   Los llena el Desarrollador en Tiendas -> Empresas -> Nueva / Modificar
--   (js/secciones/empresas-internas.js). Todos opcionales.
--   - razon_social: nombre legal (ej. "Corporación Dinant S.A.")
--   - cedula_juridica: cédula jurídica (ej. "3-101-123456")
--   - telefono:     teléfono de la empresa
--   - direccion:    dirección escrita
--   - ubicacion:    coordenadas "9.93, -84.08" o enlace de Google Maps (botón "Mapa")
--   - giro:         a qué se dedica, por escrito (ej. "Distribución de alimentos")
--   Se puede repetir.
-- ==================================================

alter table public.empresas add column if not exists razon_social text;
alter table public.empresas add column if not exists cedula_juridica text;
alter table public.empresas add column if not exists telefono text;
alter table public.empresas add column if not exists direccion text;
alter table public.empresas add column if not exists ubicacion text;
alter table public.empresas add column if not exists giro text;

notify pgrst, 'reload schema';


