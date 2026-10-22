-- ==================================================
-- 07. CAJA DE PILOTOS Y UBICACIÓN EN TIEMPO REAL
-- ACACHETE LOGISTICS
--
-- CAJA (como en SISCED; sección Caja, js/secciones/caja.js; actividades con usa_caja):
--   - cajas: tipos de caja de la empresa (nombre y monto, ej. "Caja básica ₡50 000").
--   - usuarios.caja_id / caja_monto: el fondo de cada piloto o conductor.
--   - pedidos.cobro_forma / viajes.cobro_forma: cómo pagó el cliente al entregar.
--   - cierres_caja: cada cierre con el fondo, el efectivo, el SINPE y la tarjeta
--     verificados, el efectivo contado y la diferencia. Lo guarda caja_cerrar (todo o
--     nada). Los SINPE o tarjeta sin verificar quedan para el siguiente cierre.
-- UBICACIÓN:
--   - ubicaciones_pilotos: la ÚLTIMA posición de cada piloto en ruta (una fila por piloto).
--   - piloto_ubicacion la guarda SOLO si está en ruta; si ya no, borra su fila.
--   La web la manda cada 2 minutos (js/ubicacion.js); el mapa de Inicio la dibuja.
-- Se puede repetir.
-- ==================================================

-- ==================================================
-- CAJA
-- ==================================================

create table if not exists public.cajas (
    id          bigint generated always as identity primary key,
    empresa_id  bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    nombre      text not null,
    monto       numeric(12,2) not null default 0,
    creado_en   timestamptz not null default now(),

    constraint cajas_monto_valido check (monto >= 0),
    constraint cajas_nombre_unico unique (empresa_id, nombre)
);

alter table public.usuarios drop constraint if exists usuarios_caja_id_fkey;
alter table public.usuarios add constraint usuarios_caja_id_fkey
    foreign key (caja_id) references public.cajas(id) on delete set null;

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

alter table public.pedidos drop constraint if exists pedidos_cierre_id_fkey;
alter table public.pedidos add constraint pedidos_cierre_id_fkey
    foreign key (cierre_id) references public.cierres_caja(id) on delete set null;
alter table public.viajes drop constraint if exists viajes_cierre_id_fkey;
alter table public.viajes add constraint viajes_cierre_id_fkey
    foreign key (cierre_id) references public.cierres_caja(id) on delete set null;

-- Cerrar la caja (todo o nada).
-- p = { usuario_id, piloto_id, contado, notas,
--       pedidos: [{ id, forma }], viajes: [{ id, forma }] }   (forma: efectivo | sinpe | tarjeta)
-- Los montos los toma la base (total_cobrar del pedido, total del viaje), no la página.
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
    u := public.usuario_activo((p ->> 'usuario_id')::bigint);
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
    perform public.soporte_exigir(pil.empresa_id, 'corregir');
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


-- ==================================================
-- UBICACIÓN DEL PILOTO EN TIEMPO REAL
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

-- true si tiene pedidos "En ruta" / "Entregando" o viajes "En camino" / "En curso"
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
    pil := public.usuario_activo(p_piloto);  -- cada piloto manda solo su propia ubicación
    if pil.rol <> 'piloto' then
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
