-- ==================================================
-- CONFIGURACIÓN: HORARIO POR DÍA DE LA SEMANA
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   (Se ejecuta UNA sola vez, DESPUÉS de sql/12_horarios.sql)
--
-- Para qué sirve: dejar PREAJUSTADO el horario de un día que es distinto
-- a la base. Ej.: el domingo solo 1 marca, el sábado 3 marcas con otras
-- horas, o un día sin marcas (descanso).
--
-- Cómo funciona:
--   - Días 1 = lunes ... 7 = domingo (igual que extract(isodow ...)).
--   - Si un día NO tiene fila en "horario_dias" -> usa la BASE
--     (configuracion.cantidad_marcas + tabla marcas_horario).
--   - Si un día SÍ tiene fila -> usa SU cantidad de marcas y SUS horas
--     (tabla "marcas_dia"). cantidad_marcas = 0 significa "sin marcas".
--   - Los pedidos máximos por marca NO cambian por día (siguen la regla
--     tienda > región > base de sql/12).
--
-- Qué hace:
--   1. Tabla "horario_dias": qué días tienen horario propio y cuántas marcas.
--   2. Tabla "marcas_dia": las horas de cada marca de esos días.
--   3. Función "marcas_del_dia(fecha)": devuelve las marcas que aplican a
--      una fecha (propias del día o las de la base). Para Pedidos y la app.
--   4. Reglas de acceso TEMPORALES (igual que las demás tablas).
--
-- Quién modifica: Administrador y Admin G1 (lo controla la página,
-- js/secciones/configuracion.js; la regla real llega en la Fase 7).
-- ==================================================


-- ---------- 1. Días con horario propio ----------
create table public.horario_dias (
    dia              smallint primary key,       -- 1 = lunes ... 7 = domingo
    cantidad_marcas  smallint not null,          -- 0 = sin marcas ese día
    actualizado_en   timestamptz not null default now(),

    constraint horario_dia_valido      check (dia between 1 and 7),
    constraint horario_cantidad_valida check (cantidad_marcas between 0 and 24)
);


-- ---------- 2. Horas de las marcas de esos días ----------
-- on delete cascade: al quitar el día de "horario_dias" (volver a la base)
-- se borran también sus marcas.
create table public.marcas_dia (
    dia             smallint not null references public.horario_dias(dia) on delete cascade,
    numero          smallint not null,           -- 1, 2, 3...
    inicio_desde    time not null,
    inicio_hasta    time not null,
    fin             time not null,

    primary key (dia, numero),
    constraint marcas_dia_numero_valido  check (numero between 1 and 24),
    constraint marcas_dia_ventana_valida check (inicio_hasta >= inicio_desde),
    constraint marcas_dia_fin_valido     check (fin > inicio_hasta)
);


-- ---------- 3. Marcas que aplican a una fecha ----------
-- Uso: select * from marcas_del_dia('2026-10-04');
-- (Desde la página: db.rpc('marcas_del_dia', { p_fecha: '2026-10-04' }))
-- Pasar la fecha LOCAL desde la página: el servidor trabaja en hora UTC.
create or replace function public.marcas_del_dia(p_fecha date default current_date)
returns table (numero smallint, inicio_desde time, inicio_hasta time, fin time, personalizado boolean)
language sql
stable
as $$
    -- Horas propias del día (si el día tiene horario propio)
    select m.numero, m.inicio_desde, m.inicio_hasta, m.fin, true
    from public.marcas_dia m
    where m.dia = extract(isodow from p_fecha)
    union all
    -- Si no tiene, las de la base
    select b.numero, b.inicio_desde, b.inicio_hasta, b.fin, false
    from public.marcas_horario b
    where not exists (select 1 from public.horario_dias d where d.dia = extract(isodow from p_fecha))
    order by 1;
$$;


-- ---------- 4. Acceso desde la web (TEMPORAL) ----------
alter table public.horario_dias enable row level security;
grant select, insert, update, delete on public.horario_dias to anon;
create policy "TEMPORAL - leer dias"      on public.horario_dias for select to anon using (true);
create policy "TEMPORAL - crear dias"     on public.horario_dias for insert to anon with check (true);
create policy "TEMPORAL - modificar dias" on public.horario_dias for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar dias"  on public.horario_dias for delete to anon using (true);

alter table public.marcas_dia enable row level security;
grant select, insert, update, delete on public.marcas_dia to anon;
create policy "TEMPORAL - leer marcas dia"      on public.marcas_dia for select to anon using (true);
create policy "TEMPORAL - crear marcas dia"     on public.marcas_dia for insert to anon with check (true);
create policy "TEMPORAL - modificar marcas dia" on public.marcas_dia for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar marcas dia"  on public.marcas_dia for delete to anon using (true);

grant execute on function public.marcas_del_dia(date) to anon;
