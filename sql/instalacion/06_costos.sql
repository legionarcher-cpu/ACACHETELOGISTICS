-- ==================================================
-- 06. COSTOS DE OPERACIÓN
-- ACACHETE LOGISTICS
--
-- Configuración -> Costos de operación (js/secciones/configuracion/costos.js). No
-- depende de vehículos: suma los gastos del mes de la empresa (el combustible es un
-- gasto más) y los reparte entre las entregas o viajes del mes. Con eso calcula el
-- precio mínimo para cubrir gastos y el precio sugerido con el margen deseado.
--   - costos_operacion: cada gasto del mes (fijo o variable).
--   - costos_config: margen de utilidad deseado y entregas o viajes al mes.
--     precio sugerido = costo ÷ (1 − margen). trabajos_mes vacío = los reales de 30 días.
-- Se puede repetir.
-- ==================================================

create table if not exists public.costos_operacion (
    id          bigint generated always as identity primary key,
    empresa_id  bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    concepto    text not null,
    tipo        text not null,
    monto_mes   numeric(12,2) not null,
    creado_en   timestamptz not null default now(),

    constraint costos_tipo_valido  check (tipo in ('fijo', 'variable')),
    constraint costos_monto_valido check (monto_mes >= 0)
);
create index if not exists costos_operacion_empresa_idx on public.costos_operacion (empresa_id);

create table if not exists public.costos_config (
    empresa_id       bigint primary key references public.empresas(id) on delete cascade,
    margen_objetivo  numeric(5,2) not null default 20,  -- % de utilidad deseado
    trabajos_mes     integer,                           -- entregas o viajes al mes (vacío = los reales)
    actualizado_en   timestamptz not null default now(),

    constraint costos_config_valida check (margen_objetivo between 0 and 90 and (trabajos_mes is null or trabajos_mes >= 0))
);
