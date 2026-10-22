-- ==================================================
-- 03. HORARIOS Y MARCAS DEL PILOTO
-- ACACHETE LOGISTICS
--
-- HORARIOS (una sola estructura para los dos usos, por empresa):
--   tipo 'turno'    -> horarios del piloto (marcas): abre = desde cuándo puede marcar
--                      (solo lo ven G2 o superior), inicio = "HORA INICIO" (hasta aquí
--                      es a tiempo), fin = "TERMINA" (hasta aquí, marca tardía con motivo).
--   tipo 'despacho' -> slots de despacho del pedido: inicio y fin (abre vacío).
--   horarios_dias: cuántos horarios hay. dia 0 = la BASE (todos los días); dia 1..7 =
--     un día con horario propio (cantidad 0 = ese día no hay). Borrar el día = vuelve
--     a la base (sus horarios se borran solos).
--   horarios: las horas de cada uno (dia 0 = base).
--   horarios_capacidad: pedidos por horario del piloto. Sin región ni tienda = la base
--     de la empresa; con región o tienda = un ajuste.
--   marcas_del_dia(fecha, empresa) y slots_del_dia(fecha, empresa): los que aplican a una fecha.
-- MARCAS DEL PILOTO:
--   - QR FIJO de la tienda (qr_tiendas_fijo): el piloto lo escanea ESTANDO en la tienda
--     (GPS, radio en la configuración de la empresa 'radio_marca_m') y la base marca su horario abierto.
--   - QR DEL DÍA del piloto (pilotos_dia): la tienda lo escanea ("Validar y marcar").
--   - marcas_piloto: lo mínimo de cada marca; lo de meses anteriores se borra solo.
--   La página no escribe directo en estas tablas: solo con las funciones.
-- Se puede repetir.
-- ==================================================

-- ==================================================
-- HORARIOS
-- ==================================================

create table if not exists public.horarios_dias (
    empresa_id      bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    tipo            text not null,
    dia             smallint not null,   -- 0 = base; 1 = lunes ... 7 = domingo
    cantidad        smallint not null,
    actualizado_en  timestamptz not null default now(),

    primary key (empresa_id, tipo, dia),
    constraint horarios_dias_tipo_valido     check (tipo in ('turno', 'despacho')),
    constraint horarios_dias_dia_valido      check (dia between 0 and 7),
    constraint horarios_dias_cantidad_valida check (cantidad between 0 and 24)
);

create table if not exists public.horarios (
    empresa_id      bigint not null default public.empresa_principal(),
    tipo            text not null,
    dia             smallint not null,
    numero          smallint not null,
    abre            time,               -- solo turno: desde aquí se puede marcar
    inicio          time not null,      -- turno: hora inicio (a tiempo hasta aquí) · despacho: desde
    fin             time not null,      -- turno: termina (marca tardía hasta aquí) · despacho: hasta
    actualizado_en  timestamptz not null default now(),

    primary key (empresa_id, tipo, dia, numero),
    foreign key (empresa_id, tipo, dia) references public.horarios_dias (empresa_id, tipo, dia) on delete cascade,
    constraint horarios_numero_valido check (numero between 1 and 24),
    constraint horarios_horas_validas check (
        fin > inicio and (tipo = 'despacho' or (abre is not null and inicio >= abre)))
);

create table if not exists public.horarios_capacidad (
    id          bigint generated always as identity primary key,
    empresa_id  bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    region      text references public.regiones(codigo) on delete cascade,
    tienda_id   bigint references public.tiendas(id) on delete cascade,
    pedidos     integer not null,       -- pedidos máximos en cada horario del piloto

    constraint horarios_capacidad_valida      check (pedidos between 0 and 999),
    constraint horarios_capacidad_un_destino  check (region is null or tienda_id is null)
);
create unique index if not exists horarios_capacidad_unica
    on public.horarios_capacidad (empresa_id, coalesce(region, ''), coalesce(tienda_id, 0));

-- Horarios del piloto que aplican a una fecha: los propios del día o los de la base
create or replace function public.marcas_del_dia(p_fecha date, p_empresa bigint)
returns table (numero smallint, inicio_desde time, inicio_hasta time, fin time, personalizado boolean)
language sql
stable
set search_path = ''
as $$
    select h.numero, h.abre, h.inicio, h.fin, h.dia > 0
      from public.horarios h
     where h.empresa_id = p_empresa and h.tipo = 'turno'
       and h.dia = case when exists (select 1 from public.horarios_dias d
                                      where d.empresa_id = p_empresa and d.tipo = 'turno'
                                        and d.dia = extract(isodow from p_fecha))
                        then extract(isodow from p_fecha)::smallint else 0 end
     order by h.numero;
$$;

-- Slots de despacho que aplican a una fecha: los propios del día o los de la base
create or replace function public.slots_del_dia(p_fecha date, p_empresa bigint)
returns table (numero smallint, inicio time, fin time, personalizado boolean)
language sql
stable
set search_path = ''
as $$
    select h.numero, h.inicio, h.fin, h.dia > 0
      from public.horarios h
     where h.empresa_id = p_empresa and h.tipo = 'despacho'
       and h.dia = case when exists (select 1 from public.horarios_dias d
                                      where d.empresa_id = p_empresa and d.tipo = 'despacho'
                                        and d.dia = extract(isodow from p_fecha))
                        then extract(isodow from p_fecha)::smallint else 0 end
     order by h.numero;
$$;


-- ==================================================
-- MARCAS DEL PILOTO
-- ==================================================

create table if not exists public.marcas_piloto (
    id             bigint generated always as identity primary key,
    piloto_id      bigint not null references public.usuarios(id) on delete cascade,
    fecha          date not null,
    numero         smallint not null,
    marcado_en     timestamptz not null default now(),
    a_tiempo       boolean not null default true,
    justificacion  text,                -- solo si fue tardía (máx. 200 caracteres)
    lat            double precision,    -- dónde se marcó (QR fijo con GPS)
    lng            double precision,
    distancia_m    integer,

    constraint marcas_piloto_unica unique (piloto_id, fecha, numero),
    constraint marcas_piloto_justificacion check (justificacion is null or length(justificacion) <= 200)
);

-- QR del día de cada piloto y su validación en la tienda
create table if not exists public.pilotos_dia (
    piloto_id     bigint not null references public.usuarios(id) on delete cascade,
    fecha         date not null,
    token         uuid not null default gen_random_uuid() unique,
    validado_en   timestamptz,
    validado_por  bigint references public.usuarios(id) on delete set null,
    primary key (piloto_id, fecha)
);

-- QR fijo de cada tienda ("ACACHETE-TIENDA:<tienda>:<código>")
create table if not exists public.qr_tiendas_fijo (
    tienda_id  bigint primary key references public.tiendas(id) on delete cascade,
    codigo     text not null,
    creado_en  timestamptz not null default now()
);

-- QR del día de un piloto (solo sirve hoy). Lo pide el piloto (Inicio) o el personal de
-- su empresa (Rutas). Lo que lleva el QR: ACACHETE-PILOTO:<token>
create or replace function public.qr_piloto_dia(p_piloto bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_hoy   date := public.ahora_local()::date;
    v_token uuid;
begin
    if not (public.llamada_interna() or coalesce(p_piloto = public.yo(), false)
            or (public.es_personal()
                and public.ve_empresa((select u.empresa_id from public.usuarios u where u.id = p_piloto and u.rol = 'piloto')))) then
        raise exception 'Ese piloto no existe.' using errcode = 'P0001';
    end if;
    delete from public.pilotos_dia where fecha < date_trunc('month', v_hoy)::date;
    insert into public.pilotos_dia (piloto_id, fecha) values (p_piloto, v_hoy) on conflict (piloto_id, fecha) do nothing;
    select token into v_token from public.pilotos_dia where piloto_id = p_piloto and fecha = v_hoy;
    return 'ACACHETE-PILOTO:' || v_token::text;
end;
$$;

-- La tienda escanea el QR del día: valida al piloto y devuelve su nombre y su foto
create or replace function public.validar_piloto(p_token uuid, p_usuario bigint)
returns table (piloto_id bigint, nombre text, foto_url text, tienda text, validado_en timestamptz, ya_estaba boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
    v_hoy date := public.ahora_local()::date;
    d     record;
begin
    perform public.usuario_activo(p_usuario);
    select * into d from public.pilotos_dia x where x.token = p_token;
    if not found then
        raise exception 'Ese QR de piloto no existe.' using errcode = 'P0001';
    end if;
    if not public.ve_empresa((select u.empresa_id from public.usuarios u where u.id = d.piloto_id)) then
        raise exception 'Ese QR es de un piloto de otra empresa.' using errcode = 'P0001';
    end if;
    if d.fecha <> v_hoy then
        raise exception 'Ese QR es del %: pide el QR de hoy.', to_char(d.fecha, 'DD/MM/YYYY') using errcode = 'P0001';
    end if;
    if d.validado_en is null then
        update public.pilotos_dia x set validado_en = now(), validado_por = p_usuario
         where x.piloto_id = d.piloto_id and x.fecha = v_hoy;
    end if;
    return query
        select u.id, u.nombre, u.foto_url, t.codigo || ' · ' || t.nombre,
               coalesce(d.validado_en, now()), d.validado_en is not null
          from public.usuarios u
          left join public.tiendas t on t.id = u.tienda_id
         where u.id = d.piloto_id;
end;
$$;

-- Horario que el piloto puede marcar ahora: { numero, inicio_hasta, ya_marcado } o nada
create or replace function public.piloto_horario_abierto(p_piloto bigint)
returns table (numero smallint, inicio_hasta time, ya_marcado boolean)
language sql
stable
security definer
set search_path = ''
as $$
    select x.numero, x.inicio_hasta,
           exists (select 1 from public.marcas_piloto mp
                    where mp.piloto_id = p_piloto and mp.fecha = public.ahora_local()::date and mp.numero = x.numero)
      from public.marcas_del_dia(public.ahora_local()::date,
                                 (select u.empresa_id from public.usuarios u where u.id = p_piloto)) x
     where public.ahora_local()::time between x.inicio_desde and x.fin
     order by 3, x.numero   -- primero el que falta marcar
     limit 1;
$$;

-- Ficha del QR del piloto (no guarda nada)
create or replace function public.piloto_qr_info(p_token uuid)
returns table (piloto_id bigint, nombre text, foto_url text, tienda text, validado_en timestamptz,
               horario smallint, inicio_hasta time, ya_marcado boolean, tarde boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
    v_hoy date := public.ahora_local()::date;
    d     record;
    h     record;
begin
    select * into d from public.pilotos_dia x where x.token = p_token;
    if not found then
        raise exception 'Ese QR de piloto no existe.' using errcode = 'P0001';
    end if;
    if not public.ve_empresa((select u.empresa_id from public.usuarios u where u.id = d.piloto_id)) then
        raise exception 'Ese QR es de un piloto de otra empresa.' using errcode = 'P0001';
    end if;
    if d.fecha <> v_hoy then
        raise exception 'Ese QR es del %: pide el QR de hoy.', to_char(d.fecha, 'DD/MM/YYYY') using errcode = 'P0001';
    end if;
    select * into h from public.piloto_horario_abierto(d.piloto_id);
    return query
        select u.id, u.nombre, u.foto_url, t.codigo || ' · ' || t.nombre, d.validado_en,
               h.numero, h.inicio_hasta, coalesce(h.ya_marcado, false),
               h.numero is not null and not coalesce(h.ya_marcado, false) and public.ahora_local()::time > h.inicio_hasta
          from public.usuarios u
          left join public.tiendas t on t.id = u.tienda_id
         where u.id = d.piloto_id;
end;
$$;

-- La tienda valida al piloto y marca su horario abierto en un solo paso (todo o nada).
-- Marca tardía sin motivo: responde "JUSTIFICAR:..." y la página pide el motivo.
create or replace function public.validar_y_marcar_piloto(p_token uuid, p_usuario bigint, p_justificacion text default null)
returns table (piloto_id bigint, nombre text, validado_en timestamptz, numero smallint, marcado_en timestamptz,
               a_tiempo boolean, tienda_id bigint, justificacion text, nota text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
    v_ahora  timestamp := public.ahora_local();
    v_hoy    date := v_ahora::date;
    v_hora   time := v_ahora::time;
    v_tienda bigint;
    v_nota   text;
    d        record;
    h        record;
begin
    perform public.usuario_activo(p_usuario);
    select * into d from public.pilotos_dia x where x.token = p_token for update;
    if not found then
        raise exception 'Ese QR de piloto no existe.' using errcode = 'P0001';
    end if;
    if not public.ve_empresa((select u.empresa_id from public.usuarios u where u.id = d.piloto_id)) then
        raise exception 'Ese QR es de un piloto de otra empresa.' using errcode = 'P0001';
    end if;
    if d.fecha <> v_hoy then
        raise exception 'Ese QR es del %: pide el QR de hoy.', to_char(d.fecha, 'DD/MM/YYYY') using errcode = 'P0001';
    end if;
    -- Tienda de la marca: la de quien escanea; si no tiene (G1, G2...), la del piloto
    select coalesce(q.tienda_id, p.tienda_id) into v_tienda
      from public.usuarios p left join public.usuarios q on q.id = p_usuario
     where p.id = d.piloto_id;

    select * into h from public.piloto_horario_abierto(d.piloto_id);
    if h.numero is not null and not h.ya_marcado and v_hora > h.inicio_hasta and coalesce(btrim(p_justificacion), '') = '' then
        raise exception 'JUSTIFICAR:Horario % · la hora de inicio era %. Es una marca tardía: escribe por qué.',
            h.numero, to_char(h.inicio_hasta, 'HH24:MI') using errcode = 'P0001';
    end if;

    if d.validado_en is null then
        update public.pilotos_dia x set validado_en = now(), validado_por = p_usuario
         where x.piloto_id = d.piloto_id and x.fecha = v_hoy;
    end if;

    delete from public.marcas_piloto mp where mp.fecha < date_trunc('month', v_ahora)::date;

    if h.numero is null then
        v_nota := 'No hay un horario abierto para marcar ahora: solo quedó validado.';
    elsif h.ya_marcado then
        v_nota := 'Ya tenía marcado el horario ' || h.numero || ': solo quedó validado.';
    else
        insert into public.marcas_piloto (piloto_id, fecha, numero, a_tiempo, justificacion)
        values (d.piloto_id, v_hoy, h.numero, v_hora <= h.inicio_hasta,
                case when v_hora > h.inicio_hasta then left(btrim(p_justificacion), 200) end);
    end if;

    return query
        select u.id, u.nombre, coalesce(d.validado_en, now()),
               mp.numero, mp.marcado_en, mp.a_tiempo, v_tienda, mp.justificacion, v_nota
          from public.usuarios u
          left join public.marcas_piloto mp
                 on v_nota is null and mp.piloto_id = u.id and mp.fecha = v_hoy and mp.numero = h.numero
         where u.id = d.piloto_id;
end;
$$;

-- QR fijo de una tienda; p_nuevo = true genera otro código (el impreso deja de servir)
create or replace function public.qr_tienda_fija(p_tienda bigint, p_nuevo boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_codigo text;
begin
    if not exists (select 1 from public.tiendas t where t.id = p_tienda and public.ve_empresa(t.empresa_id))
       or not (public.llamada_interna() or public.es_personal()) then
        raise exception 'La tienda no existe.' using errcode = 'P0001';
    end if;
    if p_nuevo then
        delete from public.qr_tiendas_fijo where tienda_id = p_tienda;
    end if;
    select codigo into v_codigo from public.qr_tiendas_fijo where tienda_id = p_tienda;
    if v_codigo is null then
        insert into public.qr_tiendas_fijo (tienda_id, codigo)
        values (p_tienda, substr(md5(random()::text || clock_timestamp()::text || p_tienda::text), 1, 20))
        on conflict (tienda_id) do nothing;
        select codigo into v_codigo from public.qr_tiendas_fijo where tienda_id = p_tienda;
    end if;
    return 'ACACHETE-TIENDA:' || p_tienda || ':' || v_codigo;
end;
$$;

-- El piloto escanea el QR fijo ESTANDO en la tienda (GPS): la base marca su horario
-- abierto con la hora de Costa Rica. Marca tardía: pide el motivo ("JUSTIFICAR:...").
create or replace function public.marcar_por_qr_fijo(
    p_piloto bigint, p_qr text, p_justificacion text default null,
    p_lat double precision default null, p_lng double precision default null, p_precision double precision default null)
returns table (numero smallint, marcado_en timestamptz, a_tiempo boolean, tienda_id bigint, justificacion text, distancia_m integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
    v_ahora     timestamp := public.ahora_local();
    v_hoy       date := v_ahora::date;
    v_hora      time := v_ahora::time;
    v_partes    text[] := string_to_array(coalesce(p_qr, ''), ':');
    v_tienda    bigint;
    v_empresa   bigint;
    v_proxima   time;
    v_radio     integer;
    v_distancia integer;
    t           record;
    m           record;
begin
    if coalesce(array_length(v_partes, 1), 0) <> 3 or v_partes[1] <> 'ACACHETE-TIENDA' or v_partes[2] !~ '^[0-9]+$' then
        raise exception 'Ese no es un QR de tienda.' using errcode = 'P0001';
    end if;
    v_tienda := v_partes[2]::bigint;
    if not exists (select 1 from public.qr_tiendas_fijo q where q.tienda_id = v_tienda and q.codigo = v_partes[3]) then
        raise exception 'Este QR de la tienda ya no sirve (se generó uno nuevo). Escanea el que está en la tienda.' using errcode = 'P0001';
    end if;
    perform public.usuario_activo(p_piloto);
    select u.empresa_id into v_empresa from public.usuarios u where u.id = p_piloto and u.rol = 'piloto';
    if not found then
        raise exception 'Solo los pilotos marcan con este QR.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.tiendas x where x.id = v_tienda and x.empresa_id = v_empresa) then
        raise exception 'Ese QR es de una tienda de otra empresa.' using errcode = 'P0001';
    end if;

    -- ¿Está en la tienda? (GPS del celular vs. ubicación de la tienda)
    select x.lat, x.lng, x.nombre into t from public.tiendas x where x.id = v_tienda;
    if t.lat is null or t.lng is null then
        raise exception 'La tienda % no tiene su ubicación guardada: pide que la guarden en su Inicio ("Usar mi ubicación actual").', t.nombre
            using errcode = 'P0001';
    end if;
    if p_lat is null or p_lng is null then
        raise exception 'Activa la ubicación (GPS) del celular: solo se puede marcar estando en la tienda.' using errcode = 'P0001';
    end if;
    select coalesce((select (valor #>> '{}')::integer from public.configuracion
                      where empresa_id = v_empresa and clave = 'radio_marca_m'), 150) into v_radio;
    v_distancia := round(public.km_recta(t.lat, t.lng, p_lat::numeric, p_lng::numeric) * 1000);
    if v_distancia - least(greatest(coalesce(p_precision, 0), 0), 50) > v_radio then
        raise exception 'Estás a % m de la tienda: solo se puede marcar estando en ella (hasta % m).', v_distancia, v_radio
            using errcode = 'P0001';
    end if;

    delete from public.marcas_piloto mp where mp.fecha < date_trunc('month', v_ahora)::date;

    select x.* into m from public.marcas_del_dia(v_hoy, v_empresa) x
     where v_hora between x.inicio_desde and x.fin
       and not exists (select 1 from public.marcas_piloto mp
                        where mp.piloto_id = p_piloto and mp.fecha = v_hoy and mp.numero = x.numero)
     order by x.numero
     limit 1;
    if not found then
        select min(x.inicio_hasta) into v_proxima from public.marcas_del_dia(v_hoy, v_empresa) x where x.inicio_desde > v_hora;
        raise exception '%', case when v_proxima is null
            then 'No hay ningún horario abierto para marcar ahora (o ya lo marcaste).'
            else 'Todavía no se puede marcar: el próximo horario tiene hora de inicio ' || to_char(v_proxima, 'HH24:MI') || '.' end
            using errcode = 'P0001';
    end if;

    if v_hora > m.inicio_hasta and coalesce(btrim(p_justificacion), '') = '' then
        raise exception 'JUSTIFICAR:Horario % · la hora de inicio era %. Es una marca tardía: escribe por qué.',
            m.numero, to_char(m.inicio_hasta, 'HH24:MI') using errcode = 'P0001';
    end if;

    insert into public.marcas_piloto (piloto_id, fecha, numero, a_tiempo, justificacion, lat, lng, distancia_m)
    values (p_piloto, v_hoy, m.numero, v_hora <= m.inicio_hasta,
            case when v_hora > m.inicio_hasta then left(btrim(p_justificacion), 200) end,
            p_lat, p_lng, v_distancia);

    return query
        select mp.numero, mp.marcado_en, mp.a_tiempo, v_tienda, mp.justificacion, mp.distancia_m
          from public.marcas_piloto mp
         where mp.piloto_id = p_piloto and mp.fecha = v_hoy and mp.numero = m.numero;
end;
$$;
