-- 6 de 12 · sql/00_instalacion_completa.sql · Caja de pilotos y ubicación en tiempo real (secciones 17 a 18).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 17. CAJA DE PILOTOS Y CONDUCTORES (como en SISCED)
--   - cajas: tipos de caja de la empresa (nombre y monto, ej. "Caja básica ₡50 000").
--   - usuarios.caja_id / caja_monto: el fondo de caja de cada piloto o conductor
--     (un tipo de caja o un monto propio). Configuración -> Cajas.
--   - pedidos.cobro_forma: cómo pagó el cliente al entregar (efectivo, sinpe o
--     tarjeta; lo marca el piloto en "Entregado"). viajes.cobro_forma igual.
--   - cierres_caja: cada cierre con el fondo, el efectivo, el SINPE y la tarjeta
--     verificados, el efectivo contado y la diferencia. Lo guarda la base con
--     caja_cerrar (todo o nada): crea el cierre y les pone cierre_id a los pedidos
--     y viajes incluidos. Los SINPE o tarjeta sin verificar quedan para el
--     siguiente cierre. Los cierres no se borran.
--   Sección Caja (js/secciones/caja.js). Plan: función "caja".
--   Se puede repetir. (sql/01 bloque 24)
-- ==================================================

create table if not exists public.cajas (
    id          bigint generated always as identity primary key,
    empresa_id  bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    nombre      text not null,
    monto       numeric(12,2) not null default 0,
    creado_en   timestamptz not null default now(),

    constraint cajas_monto_valido  check (monto >= 0),
    constraint cajas_nombre_unico  unique (empresa_id, nombre)
);

alter table public.usuarios add column if not exists caja_id    bigint references public.cajas(id) on delete set null;
alter table public.usuarios add column if not exists caja_monto numeric(12,2) not null default 0;
alter table public.usuarios drop constraint if exists usuarios_caja_valida;
alter table public.usuarios add constraint usuarios_caja_valida check (caja_monto >= 0);

create table if not exists public.cierres_caja (
    id                  bigint generated always as identity primary key,
    empresa_id          bigint not null references public.empresas(id) on delete cascade,
    piloto_id           bigint references public.usuarios(id) on delete set null,
    piloto_nombre       text not null,
    tienda_id           bigint references public.tiendas(id) on delete set null,
    fecha               date not null default current_date,
    fondo               numeric(12,2) not null default 0,
    efectivo            numeric(12,2) not null default 0,
    sinpe               numeric(12,2) not null default 0,
    tarjeta             numeric(12,2) not null default 0,
    efectivo_contado    numeric(12,2) not null default 0,
    diferencia          numeric(12,2) not null default 0,  -- contado - (fondo + efectivo)
    cantidad            integer not null default 0,        -- pedidos y viajes incluidos
    notas               text,
    cerrado_por         bigint,                            -- sin llave: queda aunque se borre el usuario
    cerrado_por_nombre  text,
    cerrado_en          timestamptz not null default now(),

    constraint cierres_caja_montos_validos check (fondo >= 0 and efectivo >= 0 and sinpe >= 0 and tarjeta >= 0 and efectivo_contado >= 0)
);
create index if not exists cierres_caja_piloto_idx on public.cierres_caja (empresa_id, piloto_id, cerrado_en);

alter table public.pedidos add column if not exists cobro_forma text;
alter table public.pedidos add column if not exists cierre_id   bigint references public.cierres_caja(id) on delete set null;
alter table public.pedidos drop constraint if exists pedidos_cobro_forma_valida;
alter table public.pedidos add constraint pedidos_cobro_forma_valida check (cobro_forma is null or cobro_forma in ('efectivo', 'sinpe', 'tarjeta'));
create index if not exists pedidos_caja_idx on public.pedidos (piloto_id, cierre_id);

alter table public.viajes add column if not exists cobro_forma text;
alter table public.viajes add column if not exists cierre_id   bigint references public.cierres_caja(id) on delete set null;
alter table public.viajes drop constraint if exists viajes_cobro_forma_valida;
alter table public.viajes add constraint viajes_cobro_forma_valida check (cobro_forma is null or cobro_forma in ('efectivo', 'sinpe', 'tarjeta'));
create index if not exists viajes_caja_idx on public.viajes (conductor_id, cierre_id);

-- ---------- Cerrar la caja (todo o nada) ----------
-- p = { usuario_id, piloto_id, contado, notas,
--       pedidos: [{ id, forma }], viajes: [{ id, forma }] }   (forma: efectivo | sinpe | tarjeta)
-- La página manda el efectivo y los SINPE / tarjeta ya verificados. Los montos los
-- toma la base (total_cobrar del pedido, total del viaje), no la página.
-- Quién: Administrador y G1 (su empresa), G2 (su región), G3 (su tienda), Desarrollador.
create or replace function public.caja_cerrar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u          public.usuarios;
    pil        public.usuarios;
    v_contado  numeric := (p ->> 'contado')::numeric;
    v_ped      jsonb := coalesce(p -> 'pedidos', '[]'::jsonb);
    v_via      jsonb := coalesce(p -> 'viajes', '[]'::jsonb);
    v_ef       numeric := 0;
    v_si       numeric := 0;
    v_ta       numeric := 0;
    v_n        integer := 0;
    v_ef2      numeric := 0;
    v_si2      numeric := 0;
    v_ta2      numeric := 0;
    v_n2       integer := 0;
    v_cierre   bigint;
begin
    u := public.viaje_usuario((p ->> 'usuario_id')::bigint);
    if u.rol not in ('desarrollador', 'administrador', 'admin_g1', 'admin_g2', 'admin_g3') then
        raise exception 'Tu usuario no puede cerrar cajas.' using errcode = 'P0001';
    end if;
    select * into pil from public.usuarios where id = (p ->> 'piloto_id')::bigint and rol = 'piloto';
    if not found then
        raise exception 'Ese piloto no existe.' using errcode = 'P0001';
    end if;
    if u.rol <> 'desarrollador' and u.empresa_id is distinct from pil.empresa_id then
        raise exception 'Ese piloto es de otra empresa.' using errcode = 'P0001';
    end if;
    if u.rol = 'admin_g3' and u.tienda_id is distinct from pil.tienda_id then
        raise exception 'Solo puedes cerrar la caja de los pilotos de tu tienda.' using errcode = 'P0001';
    end if;
    if u.rol = 'admin_g2' and not exists (select 1 from public.tiendas t where t.id = pil.tienda_id and t.region = u.region) then
        raise exception 'Solo puedes cerrar la caja de los pilotos de tu región.' using errcode = 'P0001';
    end if;
    if v_contado is null or v_contado < 0 then
        raise exception 'Escribe el efectivo contado (0 o más).' using errcode = 'P0001';
    end if;
    if exists (select 1 from jsonb_array_elements(v_ped || v_via) x
                where coalesce(x ->> 'forma', '') not in ('efectivo', 'sinpe', 'tarjeta')) then
        raise exception 'Forma de cobro no válida.' using errcode = 'P0001';
    end if;

    -- Un cierre a la vez por piloto (si dos personas cierran al mismo tiempo)
    perform pg_advisory_xact_lock(7303, pil.id::integer);

    select coalesce(sum(pe.total_cobrar) filter (where i.forma = 'efectivo'), 0),
           coalesce(sum(pe.total_cobrar) filter (where i.forma = 'sinpe'), 0),
           coalesce(sum(pe.total_cobrar) filter (where i.forma = 'tarjeta'), 0),
           count(*)
      into v_ef, v_si, v_ta, v_n
      from jsonb_to_recordset(v_ped) as i(id bigint, forma text)
      join public.pedidos pe on pe.id = i.id
     where pe.piloto_id = pil.id and pe.cierre_id is null and not pe.anulado
       and pe.estado in ('entregado', 'entregado_incidencia');

    select coalesce(sum(vi.total) filter (where i.forma = 'efectivo'), 0),
           coalesce(sum(vi.total) filter (where i.forma = 'sinpe'), 0),
           coalesce(sum(vi.total) filter (where i.forma = 'tarjeta'), 0),
           count(*)
      into v_ef2, v_si2, v_ta2, v_n2
      from jsonb_to_recordset(v_via) as i(id bigint, forma text)
      join public.viajes vi on vi.id = i.id
     where vi.conductor_id = pil.id and vi.cierre_id is null and vi.estado = 'terminado';

    v_ef := v_ef + v_ef2;
    v_si := v_si + v_si2;
    v_ta := v_ta + v_ta2;
    v_n := v_n + v_n2;

    insert into public.cierres_caja (empresa_id, piloto_id, piloto_nombre, tienda_id, fecha, fondo, efectivo, sinpe, tarjeta,
        efectivo_contado, diferencia, cantidad, notas, cerrado_por, cerrado_por_nombre)
    values (pil.empresa_id, pil.id, pil.nombre, pil.tienda_id, (now() at time zone 'America/Costa_Rica')::date,
        pil.caja_monto, v_ef, v_si, v_ta, round(v_contado, 2), round(v_contado - (pil.caja_monto + v_ef), 2), v_n,
        nullif(btrim(coalesce(p ->> 'notas', '')), ''), u.id, u.nombre)
    returning id into v_cierre;

    update public.pedidos pe
       set cierre_id = v_cierre, cobro_forma = i.forma
      from jsonb_to_recordset(v_ped) as i(id bigint, forma text)
     where pe.id = i.id and pe.piloto_id = pil.id and pe.cierre_id is null and not pe.anulado
       and pe.estado in ('entregado', 'entregado_incidencia');

    update public.viajes vi
       set cierre_id = v_cierre, cobro_forma = i.forma
      from jsonb_to_recordset(v_via) as i(id bigint, forma text)
     where vi.id = i.id and vi.conductor_id = pil.id and vi.cierre_id is null and vi.estado = 'terminado';

    return (select to_jsonb(c) from public.cierres_caja c where c.id = v_cierre);
end;
$$;

-- ---------- Acceso desde la web (TEMPORAL, como las demás tablas) ----------
-- Tipos de caja: leer, crear, modificar y eliminar. Cierres: SOLO leer (se crean con caja_cerrar).
alter table public.cajas enable row level security;
grant select, insert, update, delete on public.cajas to anon;
drop policy if exists "TEMPORAL - leer cajas" on public.cajas;
drop policy if exists "TEMPORAL - crear cajas" on public.cajas;
drop policy if exists "TEMPORAL - modificar cajas" on public.cajas;
drop policy if exists "TEMPORAL - eliminar cajas" on public.cajas;
create policy "TEMPORAL - leer cajas" on public.cajas for select to anon using (true);
create policy "TEMPORAL - crear cajas" on public.cajas for insert to anon with check (true);
create policy "TEMPORAL - modificar cajas" on public.cajas for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar cajas" on public.cajas for delete to anon using (true);

alter table public.cierres_caja enable row level security;
revoke insert, update, delete on public.cierres_caja from anon;
grant select on public.cierres_caja to anon;
drop policy if exists "TEMPORAL - leer cierres_caja" on public.cierres_caja;
create policy "TEMPORAL - leer cierres_caja" on public.cierres_caja for select to anon using (true);

grant execute on function public.caja_cerrar(jsonb) to anon;

-- usuarios tiene columnas nuevas: la página tiene que poder leerlas (bloque 20)
select public.usuarios_ocultar_clave();

notify pgrst, 'reload schema';


-- ==================================================
-- 18. UBICACIÓN DEL PILOTO EN TIEMPO REAL (sql/01 bloque 25)
--   - ubicaciones_pilotos: la ÚLTIMA posición de cada piloto o conductor (una
--     fila por piloto: se reemplaza en cada envío).
--   - piloto_en_ruta(piloto): true si tiene pedidos "En ruta" / "Entregando" o
--     viajes "En camino" / "En curso". La web (y la app) solo piden el GPS si es true.
--   - piloto_ubicacion(...): guarda la posición SOLO si está en ruta; si ya no lo
--     está, borra su fila (deja de verse en el mapa). Origen: 'web' o 'app'.
--   La web la manda cada 2 minutos (js/ubicacion.js); el mapa de Inicio la dibuja.
-- ==================================================

create table if not exists public.ubicaciones_pilotos (
    piloto_id       bigint primary key references public.usuarios(id) on delete cascade,
    empresa_id      bigint not null references public.empresas(id) on delete cascade,
    lat             double precision not null,
    lng             double precision not null,
    precision_m     numeric(8,1),       -- metros (lo que da el GPS)
    velocidad_kmh   numeric(6,1),
    rumbo           numeric(5,1),       -- grados (0 = norte)
    origen          text not null default 'web',
    actualizado_en  timestamptz not null default now(),

    constraint ubicaciones_pilotos_punto_valido  check (lat between -90 and 90 and lng between -180 and 180),
    constraint ubicaciones_pilotos_origen_valido check (origen in ('web', 'app'))
);
create index if not exists ubicaciones_pilotos_empresa_idx on public.ubicaciones_pilotos (empresa_id, actualizado_en);

create or replace function public.piloto_en_ruta(p_piloto bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (select 1 from public.pedidos
                    where piloto_id = p_piloto and not anulado and estado in ('en_ruta', 'en_entrega'))
        or exists (select 1 from public.viajes
                    where conductor_id = p_piloto and estado in ('en_camino', 'en_curso'));
$$;

-- Devuelve { guardado, en_ruta }
create or replace function public.piloto_ubicacion(
    p_piloto bigint, p_lat double precision, p_lng double precision,
    p_precision numeric default null, p_velocidad numeric default null, p_rumbo numeric default null,
    p_origen text default 'web')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    pil public.usuarios;
begin
    select * into pil from public.usuarios where id = p_piloto and rol = 'piloto';
    if not found then
        raise exception 'Ese piloto no existe.' using errcode = 'P0001';
    end if;
    if not public.piloto_en_ruta(pil.id) then
        delete from public.ubicaciones_pilotos where piloto_id = pil.id;
        return jsonb_build_object('guardado', false, 'en_ruta', false);
    end if;
    if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then
        raise exception 'Ubicación no válida.' using errcode = 'P0001';
    end if;

    insert into public.ubicaciones_pilotos (piloto_id, empresa_id, lat, lng, precision_m, velocidad_kmh, rumbo, origen, actualizado_en)
    values (pil.id, pil.empresa_id, p_lat, p_lng, round(p_precision, 1), round(p_velocidad, 1), round(p_rumbo, 1),
            case when p_origen = 'app' then 'app' else 'web' end, now())
    on conflict (piloto_id) do update
       set empresa_id = excluded.empresa_id, lat = excluded.lat, lng = excluded.lng,
           precision_m = excluded.precision_m, velocidad_kmh = excluded.velocidad_kmh, rumbo = excluded.rumbo,
           origen = excluded.origen, actualizado_en = excluded.actualizado_en;
    return jsonb_build_object('guardado', true, 'en_ruta', true);
end;
$$;

-- Solo leer desde la web (TEMPORAL): se escribe con piloto_ubicacion.
alter table public.ubicaciones_pilotos enable row level security;
revoke insert, update, delete on public.ubicaciones_pilotos from anon;
grant select on public.ubicaciones_pilotos to anon;
drop policy if exists "TEMPORAL - leer ubicaciones_pilotos" on public.ubicaciones_pilotos;
create policy "TEMPORAL - leer ubicaciones_pilotos" on public.ubicaciones_pilotos for select to anon using (true);

grant execute on function public.piloto_en_ruta(bigint) to anon;
grant execute on function public.piloto_ubicacion(bigint, double precision, double precision, numeric, numeric, numeric, text) to anon;

notify pgrst, 'reload schema';



