-- 22 de 23 · sql/01_actualizacion_base_existente.sql · Costos de operación: margen de utilidad y entregas al mes (bloques 45 a 45).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 45. COSTOS DE OPERACIÓN: MARGEN DE UTILIDAD Y ENTREGAS AL MES
--   Configuración -> Costos de operación (js/secciones/configuracion/costos.js) NO depende
--   de vehículos: suma los gastos del mes que se registran (combustible incluido, como un
--   gasto más) y los reparte entre las entregas o viajes del mes. Con eso calcula el precio
--   mínimo para cubrir gastos y el precio sugerido con el margen de utilidad deseado.
--   Columnas nuevas de transporte_config:
--   - margen_objetivo: % de utilidad deseado, de 0 a 90 (precio sugerido = costo ÷ (1 − margen))
--   - trabajos_mes:    entregas o viajes estimados al mes (vacío = los reales de 30 días)
--   Sin este bloque la pantalla calcula igual con lo escrito, pero no lo guarda.
--   Se puede repetir.
-- ==================================================

alter table public.transporte_config add column if not exists margen_objetivo numeric(5,2) not null default 20;
alter table public.transporte_config add column if not exists trabajos_mes integer;

alter table public.transporte_config drop constraint if exists transporte_config_margen_valido;
alter table public.transporte_config add constraint transporte_config_margen_valido check (
    margen_objetivo between 0 and 90
    and (trabajos_mes is null or trabajos_mes >= 0));

notify pgrst, 'reload schema';


