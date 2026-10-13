-- 10 de 13 · sql/01_actualizacion_base_existente.sql · Artículos de venta: unidad y costo de cada presentación (bloques 32 a 32).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 32. ARTÍCULOS DE VENTA: UNIDAD Y COSTO DE CADA PRESENTACIÓN
--   Configuración -> "Artículos de venta y precios": el artículo se crea en una
--   sola ventana con su unidad, cantidad, presentación, costo y precio.
--   - producto_presentaciones.unidad: unidad de medida (unidad, kg, litro,
--     paquete, caja...). Las que ya existían quedan en "unidad".
--   - producto_presentaciones.costo: lo que le cuesta a la empresa (opcional;
--     solo lo ven Administrador y G1, para el margen). El precio de venta sigue
--     en "precios" (sin IVA + % de IVA, por lista).
--   Se puede repetir.
-- ==================================================

alter table public.producto_presentaciones add column if not exists unidad text not null default 'unidad';
alter table public.producto_presentaciones add column if not exists costo numeric(12,2);
alter table public.producto_presentaciones drop constraint if exists presentaciones_costo_valido;
alter table public.producto_presentaciones add constraint presentaciones_costo_valido check (costo is null or costo >= 0);

notify pgrst, 'reload schema';



