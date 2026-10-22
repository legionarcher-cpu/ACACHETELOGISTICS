-- ==================================================
-- 04. RUTAS Y PEDIDOS
-- ACACHETE LOGISTICS
--
--   - rutas y rutas_pilotos (qué piloto hace cada ruta y en qué fechas).
--   - pedidos: un pedido NUNCA se borra, se cancela o se anula.
--     Flujo: registrado (o recibido_bodega) -> alistando -> listo_despacho (con slot)
--       -> recibido_ruta -> cargado (el piloto lo carga con foto: pedido_cargar)
--       -> en_ruta (piloto_salir_ruta, por slot) -> en_entrega (escaneando el QR del
--       pedido: pedido_iniciar_entrega) -> entregado / entregado_incidencia / no_entregado.
--       no_salio = estaba listo pero no se le entregó al piloto al salir a ruta.
--     direccion_partida: punto A del paquete (actividades con usa_punto_partida).
--     El estado SOLO lo cambian las funciones de la base (pedido_estado, pedido_asignar,
--     pedido_cargar, piloto_salir_ruta, pedido_iniciar_entrega, dist_entregar...), y cada
--     cambio queda en pedido_historial. La hora de cada paso sale del historial (vista
--     pedidos_pasos).
--   - pedido_articulos, pedido_entregas, pedido_evidencias (fotos) y pedido_historial.
--   - pedido_solicitudes: envíos que pide el cliente desde "Mis envíos".
--   - ubicaciones_compartidas: enlace para que el cliente marque dónde entregar.
-- Se puede repetir.
-- ==================================================

-- ==================================================
-- RUTAS
-- ==================================================

create table if not exists public.rutas (
    id          bigint generated always as identity primary key,
    empresa_id  bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict,
    tienda_id   bigint not null references public.tiendas(id) on delete cascade,
    nombre      text not null,
    actividad   text references public.actividades(codigo) on delete set null,
    activa      boolean not null default true,
    orden       smallint not null default 0,
    creado_en   timestamptz not null default now(),

    constraint rutas_nombre_unico unique (tienda_id, nombre)
);

create table if not exists public.rutas_pilotos (
    id           bigint generated always as identity primary key,
    ruta_id      bigint not null references public.rutas(id) on delete cascade,
    piloto_id    bigint not null references public.usuarios(id) on delete cascade,
    fecha_desde  date not null,
    fecha_hasta  date not null,
    creado_por   bigint references public.usuarios(id) on delete set null,
    creado_en    timestamptz not null default now(),

    constraint rutas_pilotos_fechas_validas check (fecha_hasta >= fecha_desde and fecha_hasta - fecha_desde <= 31)
);
create index if not exists rutas_pilotos_fechas_idx on public.rutas_pilotos (ruta_id, fecha_desde, fecha_hasta);

-- Ruta de entrega del cliente en cada tienda (clientes_tiendas está en 01_base.sql)
alter table public.clientes_tiendas drop constraint if exists clientes_tiendas_ruta_id_fkey;
alter table public.clientes_tiendas add constraint clientes_tiendas_ruta_id_fkey
    foreign key (ruta_id) references public.rutas(id) on delete set null;

drop trigger if exists rutas_empresa on public.rutas;
create trigger rutas_empresa before insert or update of tienda_id on public.rutas
    for each row execute function public.empresa_de_tienda();

-- ¿El usuario administra esa tienda? (G3 o superior en su alcance). Lo usan las
-- funciones de pedidos, distribuidora y ubicación compartida. El Desarrollador, con la
-- llave de soporte "Ver y corregir" de la empresa (01_base.sql: soporte_puede).
create or replace function public.puede_tienda(u public.usuarios, p_tienda bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select case
        when u.rol = 'desarrollador' then public.soporte_puede((select t.empresa_id from public.tiendas t where t.id = p_tienda), 'corregir')
        when u.rol in ('administrador', 'admin_g1') then exists (select 1 from public.tiendas t where t.id = p_tienda and t.empresa_id = u.empresa_id)
        when u.rol = 'admin_g2' then exists (select 1 from public.tiendas t where t.id = p_tienda and t.empresa_id = u.empresa_id and t.region = u.region)
        when u.rol = 'admin_g3' then u.tienda_id = p_tienda
        else false
    end;
$$;


-- ==================================================
-- PEDIDOS
-- ==================================================

create table if not exists public.pedidos (
    id                  bigint generated always as identity primary key,
    codigo              text unique,
    token_qr            uuid not null unique default gen_random_uuid(),
    codigo_respaldo     text,
    codigo_telefono     text,

    empresa_id          bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict,
    actividad           text not null references public.actividades(codigo),
    tienda_id           bigint not null references public.tiendas(id),
    ruta_id             bigint references public.rutas(id) on delete set null,

    cliente_id          bigint references public.clientes(id) on delete set null,
    cliente_nombre      text not null,
    cliente_telefono    text not null,

    direccion_partida   text,          -- punto A (actividades con usa_punto_partida)
    direccion_entrega   text not null,
    distancia_km        numeric(8,2),

    recibe_tipo         text not null default 'cliente',
    recibe_nombre       text,
    recibe_telefono     text,

    fecha_entrega       date not null default current_date,
    marca_numero        smallint,      -- horario del piloto (solo lo ven el piloto y G2+)
    slot_numero         smallint,      -- slot de despacho (slots_del_dia)
    piloto_id           bigint references public.usuarios(id) on delete set null,

    peso_total_kg       numeric(10,2) not null default 0,
    lleva_alcohol       boolean not null default false,
    detalle             jsonb not null default '{}'::jsonb,

    monto_compra        numeric(10,2),
    cobrar_compra       boolean not null default false,
    costo_envio         numeric(10,2) not null default 0,
    descuento_id        bigint references public.descuentos(id) on delete set null,
    costo_desglose      jsonb not null default '{}'::jsonb,
    total_cobrar        numeric(10,2) not null default 0,
    forma_pago          text not null default 'efectivo',
    paga_con            numeric(10,2),
    vuelto              numeric(10,2),
    cobro_forma         text,          -- cómo pagó al entregar (efectivo, sinpe, tarjeta)
    cierre_id           bigint,        -- cierre de caja: llave en 07_caja_y_ubicacion.sql

    -- Carga del piloto (pedido_cargar)
    carga_bultos        integer,
    carga_efectivo      numeric(12,2),
    carga_nota          text,
    cargado_por         bigint references public.usuarios(id) on delete set null,

    estado              text not null default 'registrado',
    anulado             boolean not null default false,
    motivo_cancelacion  text,
    notas               text,

    -- (La hora de cada paso no va aquí: sale de pedido_historial, vista pedidos_pasos)
    creado_por          bigint references public.usuarios(id) on delete set null,
    creado_en           timestamptz not null default now(),
    actualizado_en      timestamptz not null default now(),

    constraint pedidos_estado_valido check (estado in (
        'registrado', 'recibido_bodega', 'asignado', 'alistando', 'listo_despacho',
        'recibido_ruta', 'cargado', 'en_ruta', 'en_entrega', 'entregado',
        'entregado_incidencia', 'no_entregado', 'no_salio', 'reprogramado', 'devuelto', 'cancelado')),
    constraint pedidos_recibe_valido      check (recibe_tipo in ('cliente', 'autorizado')),
    constraint pedidos_pago_valido        check (forma_pago in ('efectivo', 'tarjeta')),
    constraint pedidos_cobro_forma_valida check (cobro_forma is null or cobro_forma in ('efectivo', 'sinpe', 'tarjeta')),
    constraint pedidos_montos_validos     check (
        costo_envio >= 0 and total_cobrar >= 0 and peso_total_kg >= 0 and (monto_compra is null or monto_compra >= 0)),
    constraint pedidos_carga_valida       check ((carga_bultos is null or carga_bultos >= 0) and (carga_efectivo is null or carga_efectivo >= 0)),
    constraint pedidos_telefonos_largo    check (char_length(cliente_telefono) <= 30 and char_length(coalesce(recibe_telefono, '')) <= 30)
);

create index if not exists pedidos_fecha_idx   on public.pedidos (fecha_entrega);
create index if not exists pedidos_tienda_idx  on public.pedidos (tienda_id, fecha_entrega);
create index if not exists pedidos_cliente_idx on public.pedidos (cliente_id);
create index if not exists pedidos_piloto_idx  on public.pedidos (piloto_id, fecha_entrega);
create index if not exists pedidos_estado_idx  on public.pedidos (estado);
create index if not exists pedidos_slot_idx    on public.pedidos (tienda_id, fecha_entrega, slot_numero);
create index if not exists pedidos_empresa_idx on public.pedidos (empresa_id, fecha_entrega);
create index if not exists pedidos_caja_idx    on public.pedidos (piloto_id, cierre_id);
-- El piloto entrega UN pedido a la vez
create unique index if not exists pedidos_un_en_entrega on public.pedidos (piloto_id) where estado = 'en_entrega';

-- Artículos / bultos del pedido (peso_kg = peso de CADA uno)
create table if not exists public.pedido_articulos (
    id            bigint generated always as identity primary key,
    pedido_id     bigint not null references public.pedidos(id) on delete cascade,
    categoria_id  bigint references public.categorias_mercaderia(id) on delete set null,
    categoria     text not null,
    descripcion   text,
    cantidad      integer not null default 1,
    tamano        text references public.tamanos_bulto(codigo) on delete set null,
    peso_kg       numeric(10,2) not null default 0,

    constraint articulos_valores_validos check (cantidad > 0 and peso_kg >= 0)
);
create index if not exists pedido_articulos_pedido_idx on public.pedido_articulos (pedido_id);

create table if not exists public.pedido_entregas (
    pedido_id            bigint primary key references public.pedidos(id) on delete cascade,
    piloto_id            bigint references public.usuarios(id) on delete set null,
    entregado_en         timestamptz not null default now(),
    validado_con         text,
    recibio_nombre       text,
    satisfecho           boolean,
    comentario           text,
    mercaderia_buena     boolean,
    hubo_retraso         boolean not null default false,
    motivo_retraso_id    bigint references public.motivos_retraso(id) on delete set null,
    confirma_mayor_edad  boolean,
    ubicacion            text,

    constraint entregas_validado_valido check (validado_con is null or validado_con in ('qr', 'codigo'))
);

-- Fotos: entrega, mal estado, retraso, recepción en bodega, carga del piloto y comprobante de pago
create table if not exists public.pedido_evidencias (
    id            bigint generated always as identity primary key,
    pedido_id     bigint not null references public.pedidos(id) on delete cascade,
    tipo          text not null,
    url           text,
    ruta          text,
    tomada_por    bigint references public.usuarios(id) on delete set null,
    creado_en     timestamptz not null default now(),
    eliminada_en  timestamptz,

    constraint evidencias_tipo_valido check (tipo in ('entrega', 'mal_estado', 'retraso', 'recepcion', 'carga', 'pago'))
);
create index if not exists pedido_evidencias_tipo_idx on public.pedido_evidencias (pedido_id, tipo);

create table if not exists public.pedido_historial (
    id               bigint generated always as identity primary key,
    pedido_id        bigint not null references public.pedidos(id) on delete cascade,
    evento           text not null,
    estado_anterior  text,
    estado_nuevo     text,
    detalle          jsonb,
    usuario_id       bigint references public.usuarios(id) on delete set null,
    usuario_nombre   text,
    ubicacion        text,
    creado_en        timestamptz not null default now()
);
create index if not exists pedido_historial_pedido_idx on public.pedido_historial (pedido_id, creado_en);


-- ==================================================
-- AL CREAR Y AL CAMBIAR UN PEDIDO (triggers)
-- ==================================================

drop trigger if exists pedidos_empresa on public.pedidos;
create trigger pedidos_empresa before insert or update of tienda_id on public.pedidos
    for each row execute function public.empresa_de_tienda();

-- Número de pedido (P-000001 o manual) y código de respaldo (aleatorio o últimos 4 del
-- teléfono), según la configuración de la empresa de la tienda
create sequence if not exists public.pedidos_codigo_seq;

create or replace function public.pedidos_antes_de_crear()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_empresa     bigint := coalesce((select t.empresa_id from public.tiendas t where t.id = new.tienda_id), new.empresa_id);
    modo_numero   text;
    opciones      jsonb;
    digitos       text;
    usa_aleatorio boolean;
    usa_telefono  boolean;
begin
    select valor #>> '{}' into modo_numero from public.configuracion where empresa_id = v_empresa and clave = 'numero_pedido';

    if modo_numero = 'manual' then
        new.codigo := upper(trim(coalesce(new.codigo, '')));
        if new.codigo = '' then
            raise exception 'Falta el número de pedido (la empresa usa números manuales).'
                using errcode = '23502';
        end if;
    else
        new.codigo := 'P-' || lpad(nextval('public.pedidos_codigo_seq')::text, 6, '0');
    end if;

    select valor into opciones from public.configuracion where empresa_id = v_empresa and clave = 'codigo_respaldo';
    if opciones is null then
        opciones := '["aleatorio"]';
    elsif jsonb_typeof(opciones) = 'string' then
        opciones := jsonb_build_array(opciones);
    end if;

    digitos := regexp_replace(coalesce(new.cliente_telefono, ''), '\D', '', 'g');
    usa_aleatorio := opciones ? 'aleatorio';
    usa_telefono  := opciones ? 'telefono' and length(digitos) >= 4;

    new.codigo_telefono := case when usa_telefono then right(digitos, 4) end;

    if usa_aleatorio or not usa_telefono then
        new.codigo_respaldo := lpad(floor(random() * 10000)::int::text, 4, '0');
    else
        new.codigo_respaldo := new.codigo_telefono;
    end if;

    return new;
end;
$$;

drop trigger if exists pedidos_codigo on public.pedidos;
create trigger pedidos_codigo
    before insert on public.pedidos
    for each row execute function public.pedidos_antes_de_crear();

-- Validar un código de respaldo (app del piloto)
create or replace function public.validar_codigo_respaldo(p_pedido bigint, p_codigo text)
returns boolean
language sql
stable
as $$
    select exists (
        select 1 from public.pedidos
        where id = p_pedido
          and trim(p_codigo) in (codigo_respaldo, codigo_telefono)
    );
$$;

-- Lo que la página cambia DIRECTO en pedidos. Crear: solo registrado, en bodega o asignado
-- (con un piloto de la empresa). Cambiar: los datos del pedido (cliente, dirección, detalle,
-- notas...), pero NO su estado, piloto, fecha, horario, slot, ruta, carga, cobro ni caja: eso
-- lo hacen las funciones de la base, que revisan quién puede y escriben el historial.
-- (Las funciones corren como el dueño de la base: aquí no se revisan.)
create or replace function public.pedidos_revisar_cambio()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_fijas constant text[] := array['estado', 'anulado', 'piloto_id', 'fecha_entrega', 'marca_numero', 'slot_numero',
        'ruta_id', 'cargado_por', 'carga_bultos', 'carga_efectivo', 'carga_nota', 'cierre_id', 'cobro_forma',
        'total_cobrar', 'codigo', 'token_qr', 'tienda_id', 'empresa_id', 'creado_por', 'creado_en'];
    v_campo text;
begin
    if current_user <> 'authenticated' then
        return new;
    end if;
    if tg_op = 'INSERT' then
        if new.estado not in ('registrado', 'recibido_bodega', 'asignado') or new.anulado then
            raise exception 'Un pedido nuevo empieza registrado, en bodega o asignado.' using errcode = '42501';
        end if;
        if new.piloto_id is not null
           and not exists (select 1 from public.usuarios x
                            where x.id = new.piloto_id and x.rol = 'piloto'
                              and x.empresa_id = (select t.empresa_id from public.tiendas t where t.id = new.tienda_id)) then
            raise exception 'Ese piloto no es de la empresa.' using errcode = '42501';
        end if;
        return new;
    end if;
    foreach v_campo in array v_fijas loop
        if (to_jsonb(new) -> v_campo) is distinct from (to_jsonb(old) -> v_campo) then
            raise exception 'El estado, el piloto y la fecha del pedido se cambian con sus botones (la base guarda el historial). Campo: %.', v_campo
                using errcode = '42501';
        end if;
    end loop;
    return new;
end;
$$;

drop trigger if exists pedidos_revisar_cambio on public.pedidos;
create trigger pedidos_revisar_cambio before insert or update on public.pedidos
    for each row execute function public.pedidos_revisar_cambio();

-- Red de seguridad: al terminar la transacción, cada cambio de estado debe tener su fila en el
-- historial. Si una función se olvidó de escribirla, se escribe aquí (evento 'estado').
create or replace function public.pedidos_historial_obligatorio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.estado is distinct from old.estado
       and not exists (select 1 from public.pedido_historial h
                        where h.pedido_id = new.id and h.estado_nuevo = new.estado and h.creado_en = now()) then
        insert into public.pedido_historial (pedido_id, evento, estado_anterior, estado_nuevo, usuario_id, usuario_nombre)
        select new.id, 'estado', old.estado, new.estado, u.id, u.nombre
          from public.yo_usuario() u;
    end if;
    return null;
end;
$$;

drop trigger if exists pedidos_historial_obligatorio on public.pedidos;
create constraint trigger pedidos_historial_obligatorio after update of estado on public.pedidos
    deferrable initially deferred
    for each row execute function public.pedidos_historial_obligatorio();

-- Lo que la página agrega al historial (el "Registrado" del pedido nuevo, solicitudes de
-- reasignación, autorizaciones) va a nombre del usuario de la sesión y no inventa cambios
-- de estado: esos los escribe la base.
create or replace function public.pedido_historial_revisar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    yo public.usuarios;
begin
    if current_user <> 'authenticated' then
        return new;
    end if;
    yo := public.yo_usuario();
    new.usuario_id := yo.id;
    new.usuario_nombre := yo.nombre;
    new.creado_en := now();
    if new.estado_nuevo is distinct from new.estado_anterior
       and not (new.evento = 'registrado' and new.estado_anterior is null
                and new.estado_nuevo = (select x.estado from public.pedidos x where x.id = new.pedido_id)
                and not exists (select 1 from public.pedido_historial h where h.pedido_id = new.pedido_id)) then
        raise exception 'Los cambios de estado del pedido los anota la base.' using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists pedido_historial_revisar on public.pedido_historial;
create trigger pedido_historial_revisar before insert on public.pedido_historial
    for each row execute function public.pedido_historial_revisar();

-- "Entregando" solo con pedido_iniciar_entrega (QR o código del cliente), y "Entregado"
-- solo después de "Entregando" ("No entregado" sí se puede desde "En ruta").
create or replace function public.pedidos_entrega_con_qr()
returns trigger
language plpgsql
as $$
begin
    if new.estado is distinct from old.estado then
        if new.estado = 'en_entrega' and coalesce(current_setting('acachete.entrega_qr', true), '') <> new.id::text then
            raise exception 'Escanea el QR del pedido (o escribe el código de entrega del cliente) para empezar la entrega.' using errcode = 'P0001';
        end if;
        if new.estado in ('entregado', 'entregado_incidencia') and old.estado <> 'en_entrega' then
            raise exception 'Primero escanea el QR del pedido: solo se marca entregado después de "Entregando".' using errcode = 'P0001';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists pedidos_entrega_con_qr on public.pedidos;
create trigger pedidos_entrega_con_qr
    before update of estado on public.pedidos
    for each row execute function public.pedidos_entrega_con_qr();

-- Hora de cada paso de cada pedido, sacada del historial. alistando_en y listo_en son la
-- PRIMERA vez; los demás, la última (si se reprograma, cuenta el último intento).
create or replace view public.pedidos_pasos
with (security_invoker = true) as
select
    p.id, p.creado_en,
    min(h.creado_en) filter (where h.estado_nuevo = 'alistando')      as alistando_en,
    min(h.creado_en) filter (where h.estado_nuevo = 'listo_despacho') as listo_en,
    max(h.creado_en) filter (where h.estado_nuevo = 'recibido_ruta')  as recibido_ruta_en,
    max(h.creado_en) filter (where h.estado_nuevo = 'cargado')        as cargado_en,
    max(h.creado_en) filter (where h.estado_nuevo = 'en_ruta')        as salida_en,
    max(h.creado_en) filter (where h.estado_nuevo = 'en_entrega')     as entregando_en,
    max(h.creado_en) filter (where h.estado_nuevo in ('entregado', 'entregado_incidencia', 'no_entregado',
                                                      'devuelto', 'cancelado'))   as finalizado_en
from public.pedidos p
left join public.pedido_historial h
       on h.pedido_id = p.id and h.estado_nuevo is distinct from h.estado_anterior
group by p.id, p.creado_en;

-- Tiempos de cada pedido en minutos (null = ese paso aún no pasa)
create or replace view public.pedidos_tiempos
with (security_invoker = true) as
select
    p.id, p.codigo, p.tienda_id, p.actividad, p.fecha_entrega, p.slot_numero, p.piloto_id, p.estado,
    round(extract(epoch from (s.alistando_en  - p.creado_en))     / 60, 1) as min_espera_alistar,
    round(extract(epoch from (s.listo_en      - s.alistando_en))  / 60, 1) as min_alistando,
    round(extract(epoch from (s.listo_en      - p.creado_en))     / 60, 1) as min_hasta_listo,
    round(extract(epoch from (s.cargado_en    - s.listo_en))      / 60, 1) as min_espera_carga,
    round(extract(epoch from (s.salida_en     - s.cargado_en))    / 60, 1) as min_cargado_a_salida,
    round(extract(epoch from (s.finalizado_en - s.salida_en))     / 60, 1) as min_en_ruta,
    round(extract(epoch from (s.finalizado_en - s.entregando_en)) / 60, 1) as min_ultimo_tramo,
    round(extract(epoch from (s.finalizado_en - p.creado_en))     / 60, 1) as min_total
from public.pedidos p
join public.pedidos_pasos s on s.id = p.id
where not p.anulado;

-- Carga de cada slot (tienda + fecha + slot): del primer escaneo a la salida
create or replace view public.slots_carga
with (security_invoker = true) as
select
    p.tienda_id, p.fecha_entrega, p.slot_numero,
    count(*)                                   as pedidos,
    count(s.cargado_en)                        as cargados,
    count(*) = count(s.cargado_en)             as completo,
    min(s.listo_en)                            as primer_listo,
    min(s.cargado_en)                          as primer_escaneo,
    max(s.cargado_en)                          as ultimo_escaneo,
    min(s.salida_en)                           as primera_salida,
    round(extract(epoch from (coalesce(min(s.salida_en), max(s.cargado_en)) - min(s.cargado_en))) / 60, 1) as min_carga,
    round(extract(epoch from (max(s.cargado_en) - min(s.cargado_en))) / 60, 1)                              as min_carga_todos
from public.pedidos p
join public.pedidos_pasos s on s.id = p.id
where p.slot_numero is not null and not p.anulado and p.estado <> 'cancelado'
group by p.tienda_id, p.fecha_entrega, p.slot_numero;


-- ==================================================
-- VEHÍCULO "EN USO" AUTOMÁTICO
-- En uso mientras su piloto tiene pedidos activos; mantenimiento no se toca.
-- ==================================================

create or replace function public.recalcular_estado_vehiculo(p_vehiculo bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_vehiculo is null then
        return;
    end if;

    update public.vehiculos v
       set estado = case
               when exists (
                   select 1
                   from public.pedidos p
                   join public.usuarios u on u.id = p.piloto_id
                   where u.vehiculo_id = v.id
                     and p.anulado = false
                     and p.estado in ('registrado', 'recibido_bodega', 'asignado', 'reprogramado', 'alistando',
                                      'listo_despacho', 'recibido_ruta', 'cargado', 'en_ruta', 'en_entrega')
               ) then 'en_uso'
               else 'disponible'
           end
     where v.id = p_vehiculo
       and v.estado <> 'mantenimiento';
end;
$$;

create or replace function public.pedidos_actualizar_vehiculo()
returns trigger
language plpgsql
as $$
begin
    if new.piloto_id is not null then
        perform public.recalcular_estado_vehiculo((select vehiculo_id from public.usuarios where id = new.piloto_id));
    end if;
    if tg_op = 'UPDATE' and old.piloto_id is not null and old.piloto_id is distinct from new.piloto_id then
        perform public.recalcular_estado_vehiculo((select vehiculo_id from public.usuarios where id = old.piloto_id));
    end if;
    return null;
end;
$$;

drop trigger if exists pedidos_vehiculo_en_uso on public.pedidos;
create trigger pedidos_vehiculo_en_uso
    after insert or update of piloto_id, estado, anulado on public.pedidos
    for each row execute function public.pedidos_actualizar_vehiculo();

create or replace function public.usuarios_actualizar_vehiculo()
returns trigger
language plpgsql
as $$
begin
    if old.vehiculo_id is distinct from new.vehiculo_id then
        perform public.recalcular_estado_vehiculo(old.vehiculo_id);
        perform public.recalcular_estado_vehiculo(new.vehiculo_id);
    end if;
    return null;
end;
$$;

drop trigger if exists usuarios_vehiculo_en_uso on public.usuarios;
create trigger usuarios_vehiculo_en_uso
    after update of vehiculo_id on public.usuarios
    for each row execute function public.usuarios_actualizar_vehiculo();


-- ==================================================
-- DESPACHO: CARGAR, SALIR A RUTA Y EMPEZAR LA ENTREGA
-- ==================================================

-- Cargar un pedido con su evidencia (foto, bultos y efectivo que lleva).
-- p = { usuario_id, pedido_id, bultos, efectivo, nota, fotos: [{ url, ruta }] }
-- Quién: el piloto del pedido (o un G3 o superior de la tienda).
create or replace function public.pedido_cargar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u         public.usuarios;
    pe        public.pedidos;
    v_bultos  integer := (p ->> 'bultos')::integer;
    v_efe     numeric := (p ->> 'efectivo')::numeric;
    v_nota    text := nullif(btrim(coalesce(p ->> 'nota', '')), '');
    v_fotos   jsonb := coalesce(p -> 'fotos', '[]'::jsonb);
begin
    u := public.usuario_activo((p ->> 'usuario_id')::bigint);
    select * into pe from public.pedidos where id = (p ->> 'pedido_id')::bigint for update;
    if not found then
        raise exception 'Ese pedido no existe.' using errcode = 'P0001';
    end if;
    if u.id is distinct from pe.piloto_id and not public.puede_tienda(u, pe.tienda_id) then
        raise exception 'Solo el piloto del pedido lo carga.' using errcode = 'P0001';
    end if;
    if pe.anulado or pe.estado not in ('listo_despacho', 'recibido_ruta') then
        raise exception 'Solo se cargan los pedidos que la tienda marcó "Listo para despachar".' using errcode = 'P0001';
    end if;
    if pe.detalle #>> '{autorizacion,estado}' = 'pendiente' then
        raise exception 'El pedido espera que un G3 o superior lo autorice.' using errcode = 'P0001';
    end if;
    if v_bultos is null or v_bultos < 1 then
        raise exception 'Escribe cuántos bultos recibiste (1 o más).' using errcode = 'P0001';
    end if;
    if v_efe is not null and v_efe < 0 then
        raise exception 'El efectivo no puede ser negativo.' using errcode = 'P0001';
    end if;
    if jsonb_array_length(v_fotos) = 0 then
        raise exception 'Toma al menos una foto de lo que recibes.' using errcode = 'P0001';
    end if;

    update public.pedidos
       set estado = 'cargado', carga_bultos = v_bultos, carga_efectivo = round(nullif(v_efe, 0), 2), carga_nota = v_nota,
           cargado_por = u.id, actualizado_en = now()
     where id = pe.id;

    insert into public.pedido_evidencias (pedido_id, tipo, url, ruta, tomada_por)
    select pe.id, 'carga', f ->> 'url', f ->> 'ruta', u.id
      from jsonb_array_elements(v_fotos) f
     where coalesce(f ->> 'url', '') <> '';

    insert into public.pedido_historial (pedido_id, evento, estado_anterior, estado_nuevo, detalle, usuario_id, usuario_nombre)
    values (pe.id, 'carga', pe.estado, 'cargado',
            jsonb_build_object('bultos', v_bultos, 'fotos', jsonb_array_length(v_fotos))
            || case when coalesce(v_efe, 0) > 0 then jsonb_build_object('efectivo', round(v_efe, 2)) else '{}'::jsonb end
            || case when v_nota is not null then jsonb_build_object('nota', v_nota) else '{}'::jsonb end,
            u.id, u.nombre);

    return jsonb_build_object('id', pe.id, 'codigo', pe.codigo, 'estado', 'cargado', 'bultos', v_bultos);
end;
$$;

-- Salir a ruta con TODO un slot.
-- p = { usuario_id, slot (vacío = pedidos sin slot), fecha (vacía = hoy), piloto_id (si lo hace un G3+) }
-- Los CARGADOS de ese slot pasan a "En ruta"; los listos que no se cargaron, a "No salió a ruta".
-- Devuelve { en_ruta: [{ id, codigo, tienda_id }], no_salio: [...] }
create or replace function public.piloto_salir_ruta(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u        public.usuarios;
    v_piloto bigint;
    v_slot   smallint := (p ->> 'slot')::smallint;
    v_fecha  date := coalesce((p ->> 'fecha')::date, (now() at time zone 'America/Costa_Rica')::date);
    v_ruta   jsonb;
    v_no     jsonb;
begin
    u := public.usuario_activo((p ->> 'usuario_id')::bigint);
    if u.rol = 'piloto' then
        v_piloto := u.id;
    else
        v_piloto := (p ->> 'piloto_id')::bigint;
        -- Por el piloto: G3 o superior que administra su tienda
        if u.rol not in ('desarrollador', 'administrador', 'admin_g1', 'admin_g2', 'admin_g3') or v_piloto is null
           or not exists (select 1 from public.usuarios x
                           where x.id = v_piloto and x.rol = 'piloto' and public.puede_tienda(u, x.tienda_id)) then
            raise exception 'Solo el piloto sale a ruta con sus pedidos.' using errcode = 'P0001';
        end if;
    end if;

    -- Una salida a la vez por piloto
    perform pg_advisory_xact_lock(7305, v_piloto::integer);

    if not exists (select 1 from public.pedidos
                    where piloto_id = v_piloto and not anulado and estado = 'cargado'
                      and slot_numero is not distinct from v_slot and fecha_entrega <= v_fecha) then
        raise exception 'No tienes pedidos cargados en ese slot.' using errcode = 'P0001';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'codigo', codigo, 'tienda_id', tienda_id) order by id), '[]'::jsonb)
      into v_ruta
      from public.pedidos
     where piloto_id = v_piloto and not anulado and estado = 'cargado'
       and slot_numero is not distinct from v_slot and fecha_entrega <= v_fecha;
    insert into public.pedido_historial (pedido_id, evento, estado_anterior, estado_nuevo, detalle, usuario_id, usuario_nombre)
    select (x ->> 'id')::bigint, 'salida', 'cargado', 'en_ruta', jsonb_build_object('slot', v_slot), u.id, u.nombre
      from jsonb_array_elements(v_ruta) x;
    update public.pedidos
       set estado = 'en_ruta', actualizado_en = now()
     where id in (select (x ->> 'id')::bigint from jsonb_array_elements(v_ruta) x);

    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'codigo', codigo, 'tienda_id', tienda_id, 'estado', estado) order by id), '[]'::jsonb)
      into v_no
      from public.pedidos
     where piloto_id = v_piloto and not anulado and estado in ('listo_despacho', 'recibido_ruta')
       and slot_numero is not distinct from v_slot and fecha_entrega <= v_fecha;
    insert into public.pedido_historial (pedido_id, evento, estado_anterior, estado_nuevo, detalle, usuario_id, usuario_nombre)
    select (x ->> 'id')::bigint, 'no_salio', x ->> 'estado', 'no_salio',
           jsonb_build_object('slot', v_slot, 'motivo', 'Estaba listo pero no se entregó al piloto al salir a ruta'), u.id, u.nombre
      from jsonb_array_elements(v_no) x;
    update public.pedidos
       set estado = 'no_salio', actualizado_en = now()
     where id in (select (x ->> 'id')::bigint from jsonb_array_elements(v_no) x);
    return jsonb_build_object('en_ruta', v_ruta, 'no_salio', v_no);
end;
$$;

-- La entrega se empieza escaneando el QR del pedido (el que tiene el cliente).
-- p = { usuario_id, pedido_id, token (lo que trae el QR, sin "ACACHETE-PEDIDO:") | codigo (el del cliente) }
-- Solo el piloto del pedido y solo desde "En ruta". Uno a la vez.
create or replace function public.pedido_iniciar_entrega(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u         public.usuarios;
    pe        public.pedidos;
    v_id      bigint := (p ->> 'pedido_id')::bigint;
    v_token   text := nullif(btrim(coalesce(p ->> 'token', '')), '');
    v_codigo  text := nullif(btrim(coalesce(p ->> 'codigo', '')), '');
    v_otro    text;
    v_uuid    uuid;
begin
    u := public.usuario_activo((p ->> 'usuario_id')::bigint);
    if v_token is not null then
        begin
            v_uuid := v_token::uuid;
        exception when others then
            raise exception 'Ese QR no es de un pedido del sistema.' using errcode = 'P0001';
        end;
        select * into pe from public.pedidos where token_qr = v_uuid for update;
        if not found then
            raise exception 'Ese QR no es de un pedido del sistema.' using errcode = 'P0001';
        end if;
        if v_id is not null and pe.id <> v_id then
            raise exception 'Ese QR es del pedido %, no de este. Revisa que sea el paquete correcto.', pe.codigo using errcode = 'P0001';
        end if;
    else
        select * into pe from public.pedidos where id = v_id for update;
        if not found then
            raise exception 'Ese pedido no existe.' using errcode = 'P0001';
        end if;
        if v_codigo is null or v_codigo not in (coalesce(pe.codigo_respaldo, ''), coalesce(pe.codigo_telefono, '')) then
            raise exception 'El código no coincide. Pídele al cliente el código de entrega de su pedido.' using errcode = 'P0001';
        end if;
    end if;
    if u.id is distinct from pe.piloto_id then
        raise exception 'El pedido % no es de tu ruta.', pe.codigo using errcode = 'P0001';
    end if;
    if pe.anulado or pe.estado <> 'en_ruta' then
        if pe.estado = 'en_entrega' then
            return jsonb_build_object('id', pe.id, 'codigo', pe.codigo, 'estado', pe.estado);
        end if;
        raise exception 'El pedido % no está en ruta: solo se empieza a entregar un pedido "En ruta".', pe.codigo using errcode = 'P0001';
    end if;
    select codigo into v_otro from public.pedidos
     where piloto_id = pe.piloto_id and estado = 'en_entrega' and id <> pe.id limit 1;
    if v_otro is not null then
        raise exception 'Primero marca como entregado (o no entregado) el pedido %.', v_otro using errcode = 'P0001';
    end if;

    -- Permiso para el trigger pedidos_entrega_con_qr (solo dentro de esta transacción)
    perform set_config('acachete.entrega_qr', pe.id::text, true);
    update public.pedidos set estado = 'en_entrega', actualizado_en = now() where id = pe.id;
    insert into public.pedido_historial (pedido_id, evento, estado_anterior, estado_nuevo, detalle, usuario_id, usuario_nombre)
    values (pe.id, 'estado', 'en_ruta', 'en_entrega',
            jsonb_build_object('verificado', case when v_token is not null then 'qr' else 'codigo' end), u.id, u.nombre);
    return jsonb_build_object('id', pe.id, 'codigo', pe.codigo, 'estado', 'en_entrega');
end;
$$;


-- ==================================================
-- CAMBIOS DE ESTADO Y ASIGNACIÓN (botones del detalle del pedido, js/secciones/pedidos.js)
-- Cada función revisa quién puede, que el pedido siga en el estado que se veía en pantalla
-- ("visto": si otro lo cambió, error con hint 'cambiado') y escribe el historial.
-- ==================================================

-- ¿El pedido está en el alcance de quien lo cambia? Lo mismo que la regla de pedidos de
-- 11_acceso_web.sql: Administrador y G1 su empresa; G2 su región; G3 y Empleado su tienda (y
-- los pilotos de su tienda); Piloto los suyos; el Desarrollador con la llave "Ver y corregir".
create or replace function public.pedido_en_alcance(u public.usuarios, pe public.pedidos)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(case
        when u.rol = 'desarrollador' then public.soporte_puede(pe.empresa_id, 'corregir')
        when u.rol = 'piloto' then pe.piloto_id = u.id
        when u.empresa_id is distinct from pe.empresa_id then false
        when u.rol in ('administrador', 'admin_g1') then true
        when u.rol = 'admin_g2' then
            exists (select 1 from public.tiendas t where t.id = pe.tienda_id and t.region = u.region)
            or exists (select 1 from public.usuarios x join public.tiendas t on t.id = x.tienda_id
                        where x.id = pe.piloto_id and x.rol = 'piloto' and t.region = u.region)
        when u.rol in ('admin_g3', 'empleado') then
            pe.tienda_id = u.tienda_id
            or exists (select 1 from public.usuarios x where x.id = pe.piloto_id and x.rol = 'piloto' and x.tienda_id = u.tienda_id)
        else false
    end, false);
$$;

-- Cambiar el estado con un botón del pedido.
-- p = { usuario_id, pedido_id, estado (al que pasa), visto (el que se veía), motivo,
--       slot (Listo para despachar), cobro_forma y mayor_edad (Entregado),
--       sin_productos (el que lo registró lo cancela porque no hubo producto) }
--   recibido_bodega <- registrado ................................ "Marcar Recibido en bodega"
--   alistando       <- registrado, en bodega, asignado, reprogramado .. "Alistar"
--   listo_despacho  <- alistando (con slot) ........................ "Listo para despachar"
--   cargado         <- recibido_ruta (la tienda escanea el QR) ...... "Listo para despachar"
--   entregado       <- en_entrega ...................................... el piloto del pedido
--   no_entregado    <- en_ruta, en_entrega (con motivo) ................ el piloto del pedido
--   devuelto        <- no_entregado (con motivo) ...................... "Cancelar, devolver..."
--   cancelado       <- antes de salir, no_entregado, no_salio (motivo)  "Cancelar, devolver..."
-- (Cargar con foto, salir a ruta, empezar la entrega y la entrega por producto tienen su
-- propia función: pedido_cargar, piloto_salir_ruta, pedido_iniciar_entrega, dist_entregar.)
create or replace function public.pedido_estado(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u         public.usuarios;
    pe        public.pedidos;
    v_nuevo   text := p ->> 'estado';
    v_motivo  text := nullif(left(btrim(coalesce(p ->> 'motivo', '')), 300), '');
    v_slot    smallint := (p ->> 'slot')::smallint;
    v_cobro   text := nullif(p ->> 'cobro_forma', '');
    v_desde   text[];
    v_funcion text;
    v_evento  text := 'estado';
    v_detalle jsonb := '{}'::jsonb;
begin
    u := public.usuario_activo((p ->> 'usuario_id')::bigint);
    select * into pe from public.pedidos where id = (p ->> 'pedido_id')::bigint for update;
    if pe.id is null or not public.pedido_en_alcance(u, pe) then
        raise exception 'Ese pedido no existe o no es de tu alcance.' using errcode = 'P0001';
    end if;
    if (p ->> 'visto') is not null and pe.estado <> p ->> 'visto' then
        raise exception 'Otra persona cambió este pedido. Se recargó con los datos actuales.' using errcode = 'P0001', hint = 'cambiado';
    end if;
    if pe.anulado then
        raise exception 'El pedido está anulado.' using errcode = 'P0001';
    end if;

    -- De qué estados se llega y qué función pide (null = el piloto del pedido)
    case v_nuevo
        when 'recibido_bodega' then v_desde := array['registrado']; v_funcion := 'pedidos.bodega';
        when 'alistando'       then v_desde := array['registrado', 'recibido_bodega', 'asignado', 'reprogramado'];
                                    v_funcion := 'pedidos.alistar';
        when 'listo_despacho'  then v_desde := array['alistando']; v_funcion := 'pedidos.despachar';
        when 'cargado'         then v_desde := array['recibido_ruta']; v_funcion := 'pedidos.despachar'; v_evento := 'escaneo';
        when 'entregado'       then v_desde := array['en_entrega'];
        when 'no_entregado'    then v_desde := array['en_ruta', 'en_entrega'];
        when 'devuelto'        then v_desde := array['no_entregado']; v_funcion := 'pedidos.cancelar';
        when 'cancelado'       then v_desde := array['registrado', 'recibido_bodega', 'asignado', 'reprogramado', 'alistando',
                                                     'listo_despacho', 'recibido_ruta', 'cargado', 'no_entregado', 'no_salio'];
                                    v_funcion := 'pedidos.cancelar';
        else
            raise exception 'Ese cambio de estado no se hace desde aquí.' using errcode = 'P0001';
    end case;
    if not (pe.estado = any (v_desde)) then
        raise exception 'El pedido está "%": no puede pasar a "%".', pe.estado, v_nuevo using errcode = 'P0001';
    end if;
    if v_nuevo = 'recibido_bodega'
       and not coalesce((select a.usa_bodega from public.actividades a where a.codigo = pe.actividad), false) then
        raise exception 'La actividad de este pedido no usa recepción en bodega.' using errcode = 'P0001';
    end if;

    if v_funcion is null then
        if u.id is distinct from pe.piloto_id then
            raise exception 'Solo el piloto del pedido lo marca.' using errcode = '42501';
        end if;
    elsif not public.tiene_funcion(u, v_funcion)
          -- El que lo registró lo cancela si se quedó sin producto en la bodega (al registrarlo)
          and not (v_nuevo = 'cancelado' and coalesce((p ->> 'sin_productos')::boolean, false)
                   and u.id = pe.creado_por and pe.estado in ('registrado', 'recibido_bodega', 'asignado')
                   and not exists (select 1 from public.pedido_productos x where x.pedido_id = pe.id)) then
        raise exception 'No tienes permiso para ese cambio.' using errcode = '42501';
    end if;
    if v_nuevo in ('recibido_bodega', 'alistando', 'listo_despacho', 'cargado')
       and pe.detalle #>> '{autorizacion,estado}' = 'pendiente' then
        raise exception 'El pedido espera que un G3 o superior lo autorice.' using errcode = 'P0001';
    end if;

    -- Motivo (obligatorio al no entregar, devolver o cancelar) o nota
    if v_nuevo in ('no_entregado', 'devuelto', 'cancelado') then
        if v_motivo is null then
            raise exception 'Escribe el motivo.' using errcode = 'P0001';
        end if;
        v_detalle := jsonb_build_object('motivo', v_motivo);
    elsif v_motivo is not null then
        v_detalle := jsonb_build_object('nota', v_motivo);
    end if;
    if v_nuevo = 'listo_despacho' then
        if v_slot is null or v_slot < 1 then
            raise exception 'Elige el slot al que se va a cargar.' using errcode = 'P0001';
        end if;
        v_detalle := v_detalle || jsonb_build_object('slot', v_slot);
    elsif v_nuevo = 'cargado' then
        v_detalle := v_detalle || jsonb_strip_nulls(jsonb_build_object('slot', pe.slot_numero));
    elsif v_nuevo = 'entregado' then
        if exists (select 1 from public.pedido_productos x where x.pedido_id = pe.id) then
            raise exception 'Este pedido lleva productos: entrégalo con la cantidad de cada uno.' using errcode = 'P0001';
        end if;
        if pe.lleva_alcohol and not coalesce((p ->> 'mayor_edad')::boolean, false) then
            raise exception 'El pedido lleva alcohol: hay que confirmar la mayoría de edad.' using errcode = 'P0001';
        end if;
        if pe.total_cobrar > 0 then
            if v_cobro is null or v_cobro not in ('efectivo', 'sinpe', 'tarjeta') then
                raise exception 'Elige cómo pagó el cliente.' using errcode = 'P0001';
            end if;
            v_detalle := v_detalle || jsonb_build_object('cobro', v_cobro);
        else
            v_cobro := null;
        end if;
    end if;

    update public.pedidos
       set estado = v_nuevo,
           slot_numero = case when v_nuevo = 'listo_despacho' then v_slot else slot_numero end,
           cargado_por = case when v_nuevo = 'cargado' then u.id else cargado_por end,
           cobro_forma = case when v_nuevo = 'entregado' then v_cobro else cobro_forma end,
           motivo_cancelacion = case when v_nuevo = 'cancelado' then v_motivo else motivo_cancelacion end,
           actualizado_en = now()
     where id = pe.id;

    -- Entregado desde el panel: cierre mínimo (la app guarda además QR, satisfacción y fotos)
    if v_nuevo = 'entregado' then
        insert into public.pedido_entregas (pedido_id, piloto_id, recibio_nombre, confirma_mayor_edad, comentario)
        values (pe.id, pe.piloto_id, case when pe.recibe_tipo = 'autorizado' then pe.recibe_nombre else pe.cliente_nombre end,
                case when pe.lleva_alcohol then true end,
                coalesce(v_motivo, 'Marcado como entregado por el piloto desde el panel'))
        on conflict (pedido_id) do update
           set piloto_id = excluded.piloto_id, entregado_en = now(), recibio_nombre = excluded.recibio_nombre,
               confirma_mayor_edad = excluded.confirma_mayor_edad, comentario = excluded.comentario;
    end if;

    insert into public.pedido_historial (pedido_id, evento, estado_anterior, estado_nuevo, detalle, usuario_id, usuario_nombre)
    values (pe.id, v_evento, pe.estado, v_nuevo, nullif(v_detalle, '{}'::jsonb), u.id, u.nombre);
    return jsonb_build_object('id', pe.id, 'codigo', pe.codigo, 'estado', v_nuevo);
end;
$$;

-- Asignar piloto, fecha, horario y ruta, o reprogramar un pedido no entregado / que no salió.
-- p = { usuario_id, pedido_id, visto, fecha, marca, ruta_id (si se manda; null = sin ruta),
--       piloto_id (null = sin piloto), de_ruta (el piloto es el de la ruta), reprogramar, motivo }
-- Quién: "Asignar piloto y horario" (G2 o superior) en su alcance. El estado: con piloto pasa
-- a Asignado; sin piloto vuelve a Registrado / En bodega; al reprogramar, Reprogramado.
create or replace function public.pedido_asignar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u            public.usuarios;
    pe           public.pedidos;
    v_fecha      date := (p ->> 'fecha')::date;
    v_marca      smallint := (p ->> 'marca')::smallint;
    v_piloto     bigint := (p ->> 'piloto_id')::bigint;
    v_ruta       bigint := (p ->> 'ruta_id')::bigint;
    v_motivo     text := nullif(left(btrim(coalesce(p ->> 'motivo', '')), 300), '');
    v_reprograma boolean;
    v_nuevo      text;
begin
    u := public.usuario_activo((p ->> 'usuario_id')::bigint);
    select * into pe from public.pedidos where id = (p ->> 'pedido_id')::bigint for update;
    if pe.id is null or not public.pedido_en_alcance(u, pe) then
        raise exception 'Ese pedido no existe o no es de tu alcance.' using errcode = 'P0001';
    end if;
    if (p ->> 'visto') is not null and pe.estado <> p ->> 'visto' then
        raise exception 'Otra persona cambió este pedido. Se recargó con los datos actuales.' using errcode = 'P0001', hint = 'cambiado';
    end if;
    if not public.tiene_funcion(u, 'pedidos.asignar') then
        raise exception 'No tienes permiso para asignar pedidos.' using errcode = '42501';
    end if;
    if pe.anulado or pe.estado not in ('registrado', 'recibido_bodega', 'asignado', 'reprogramado', 'alistando',
                                       'listo_despacho', 'recibido_ruta', 'cargado', 'no_entregado', 'no_salio') then
        raise exception 'El pedido está "%": ya no se puede asignar.', pe.estado using errcode = 'P0001';
    end if;
    if pe.detalle #>> '{autorizacion,estado}' = 'pendiente' then
        raise exception 'El pedido espera que un G3 o superior lo autorice.' using errcode = 'P0001';
    end if;
    v_reprograma := coalesce((p ->> 'reprogramar')::boolean, false) or pe.estado in ('no_entregado', 'no_salio');
    if v_reprograma and v_motivo is null then
        raise exception 'Escribe el motivo.' using errcode = 'P0001';
    end if;
    if v_fecha is null or v_fecha < (now() at time zone 'America/Costa_Rica')::date then
        raise exception 'Elige una fecha de hoy en adelante.' using errcode = 'P0001';
    end if;
    if v_piloto is not null and not exists (select 1 from public.usuarios x
                                             where x.id = v_piloto and x.rol = 'piloto' and x.aprobado
                                               and x.empresa_id = pe.empresa_id) then
        raise exception 'Ese piloto no es de la empresa.' using errcode = 'P0001';
    end if;
    if v_ruta is not null and not exists (select 1 from public.rutas r where r.id = v_ruta and r.empresa_id = pe.empresa_id) then
        raise exception 'Esa ruta no es de la empresa.' using errcode = 'P0001';
    end if;

    v_nuevo := case
        when v_reprograma then 'reprogramado'
        when v_piloto is not null and pe.estado in ('registrado', 'recibido_bodega') then 'asignado'
        when v_piloto is null and pe.estado = 'asignado' then
            case when (select a.usa_bodega from public.actividades a where a.codigo = pe.actividad) then 'recibido_bodega'
                 else 'registrado' end
        else pe.estado
    end;

    update public.pedidos
       set fecha_entrega = v_fecha, marca_numero = v_marca, piloto_id = v_piloto,
           ruta_id = case when p ? 'ruta_id' then v_ruta else ruta_id end,
           estado = v_nuevo, actualizado_en = now()
     where id = pe.id;

    insert into public.pedido_historial (pedido_id, evento, estado_anterior, estado_nuevo, detalle, usuario_id, usuario_nombre)
    values (pe.id, case when v_reprograma then 'reprogramado' else 'asignado' end, pe.estado, v_nuevo,
            jsonb_strip_nulls(jsonb_build_object(
                'fecha', v_fecha, 'marca', v_marca,
                'ruta', (select r.nombre from public.rutas r where r.id = v_ruta),
                'piloto', case when v_piloto is null then 'Sin piloto'
                               else (select x.nombre from public.usuarios x where x.id = v_piloto)
                                    || case when coalesce((p ->> 'de_ruta')::boolean, false) then ' (de la ruta)' else '' end end,
                'motivo', v_motivo)),
            u.id, u.nombre);
    return jsonb_build_object('id', pe.id, 'codigo', pe.codigo, 'estado', v_nuevo);
end;
$$;

-- Un piloto deja una tienda (Usuarios: cambió de tienda, dejó de ser multitienda o de ser
-- piloto): sus pedidos pendientes de OTRAS tiendas quedan sin piloto (Asignado -> Registrado /
-- En bodega) y queda en su historial. Quién: el que puede modificar a ese piloto.
-- Devuelve { pedidos: n, por_tienda: { "<tienda_id>": n } }.
create or replace function public.pedidos_liberar_piloto(p_usuario bigint, p_piloto bigint, p_tienda_conserva bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u       public.usuarios;
    pil     public.usuarios;
    r       record;
    v_nuevo text;
    v_n     integer := 0;
    v_por   jsonb := '{}'::jsonb;
begin
    u := public.usuario_activo(p_usuario);
    select * into pil from public.usuarios where id = p_piloto;
    if pil.id is null then
        return jsonb_build_object('pedidos', 0, 'por_tienda', v_por);
    end if;
    if not (public.puede_manejar_usuario(u, pil, 'usuarios.modificar') or public.puede_manejar_usuario(u, pil, 'usuarios.crear')
            or (u.rol = 'desarrollador' and public.soporte_puede(pil.empresa_id, 'corregir'))) then
        raise exception 'No tienes permiso para cambiar los pedidos de este piloto.' using errcode = '42501';
    end if;

    for r in select x.id, x.estado, x.actividad, x.tienda_id
               from public.pedidos x
              where x.piloto_id = p_piloto and not x.anulado
                and x.estado in ('registrado', 'recibido_bodega', 'asignado', 'reprogramado', 'alistando', 'listo_despacho')
                and x.tienda_id is distinct from p_tienda_conserva
              order by x.id
                for update loop
        v_nuevo := case when r.estado = 'asignado'
                        then case when (select a.usa_bodega from public.actividades a where a.codigo = r.actividad)
                                  then 'recibido_bodega' else 'registrado' end
                        else r.estado end;
        update public.pedidos set piloto_id = null, estado = v_nuevo, actualizado_en = now() where id = r.id;
        insert into public.pedido_historial (pedido_id, evento, estado_anterior, estado_nuevo, detalle, usuario_id, usuario_nombre)
        values (r.id, 'asignado', r.estado, v_nuevo,
                jsonb_build_object('piloto', 'Sin piloto', 'motivo', pil.nombre || ' ya no trabaja en esta tienda'), u.id, u.nombre);
        v_n := v_n + 1;
        v_por := v_por || jsonb_build_object(r.tienda_id::text, coalesce((v_por ->> r.tienda_id::text)::integer, 0) + 1);
    end loop;
    return jsonb_build_object('pedidos', v_n, 'por_tienda', v_por);
end;
$$;


-- ==================================================
-- SOLICITUDES DE ENVÍO DE LOS CLIENTES ("Mis envíos")
-- El cliente pide que le recojan un paquete en A (partida) y lo entreguen en B.
-- Queda "pendiente" hasta que un G3 o superior la revisa en Pedidos ("Revisar y
-- registrar" abre el formulario ya lleno; al registrar pasa a "aprobada").
-- ==================================================

create table if not exists public.pedido_solicitudes (
    id                  bigint generated always as identity primary key,
    empresa_id          bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    tienda_id           bigint references public.tiendas(id) on delete set null,
    actividad           text not null,
    cliente_id          bigint not null references public.clientes(id) on delete cascade,
    usuario_id          bigint references public.usuarios(id) on delete set null,
    cliente_nombre      text not null,
    cliente_telefono    text not null,
    partida_direccion   text not null,
    partida_referencia  text,
    partida_lat         numeric(9,6),
    partida_lng         numeric(9,6),
    entrega_direccion   text not null,
    entrega_referencia  text,
    entrega_lat         numeric(9,6),
    entrega_lng         numeric(9,6),
    km                  numeric(8,2),
    minutos             integer,
    recibe_nombre       text,
    recibe_telefono     text,
    fecha               date not null,
    descripcion         text not null,
    bultos              smallint not null default 1,
    peso_kg             numeric(8,2),
    notas               text,
    estado              text not null default 'pendiente',
    motivo              text,
    pedido_id           bigint references public.pedidos(id) on delete set null,
    revisado_por        bigint references public.usuarios(id) on delete set null,
    revisado_en         timestamptz,
    creado_en           timestamptz not null default now(),

    constraint pedsol_estado_valido check (estado in ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
    constraint pedsol_bultos_valido check (bultos between 1 and 999),
    constraint pedsol_peso_valido   check (peso_kg is null or peso_kg >= 0),
    constraint pedido_solicitudes_telefonos_largo check (char_length(cliente_telefono) <= 30 and char_length(coalesce(recibe_telefono, '')) <= 30)
);
create index if not exists pedido_solicitudes_empresa_idx on public.pedido_solicitudes (empresa_id, estado);
create index if not exists pedido_solicitudes_cliente_idx on public.pedido_solicitudes (cliente_id);

-- Avisos de la solicitud (los manda la base: el cliente no ve a los usuarios de la empresa).
-- Nueva -> a quien la aprueba (G3 de la tienda; si no hay, G2; si tampoco, Administrador y G1).
-- Cancelada por el cliente -> sus avisos pendientes quedan leídos.
create or replace function public.pedido_solicitudes_avisar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        perform public.avisar_aprobadores(new.empresa_id, new.tienda_id, 'solicitud_envio', new.id,
            'Solicitud de envío de un cliente',
            format('%s pide recoger en %s y entregar en %s el %s (%s %s). Revísala en Pedidos.',
                   new.cliente_nombre, new.partida_direccion, new.entrega_direccion, to_char(new.fecha, 'DD/MM/YYYY'),
                   new.bultos, case when new.bultos = 1 then 'bulto' else 'bultos' end),
            '#pedidos?solicitudes=1');
    elsif new.estado = 'cancelada' and old.estado <> 'cancelada' then
        update public.notificaciones
           set leida = true
         where tipo = 'pendiente' and referencia_tipo = 'solicitud_envio' and referencia_id = new.id and not leida;
    end if;
    return null;
end;
$$;

drop trigger if exists pedido_solicitudes_avisar on public.pedido_solicitudes;
create trigger pedido_solicitudes_avisar after insert or update of estado on public.pedido_solicitudes
    for each row execute function public.pedido_solicitudes_avisar();

-- El cliente solo puede crear su solicitud "pendiente" y cancelarla mientras siga pendiente;
-- aprobar, rechazar y enlazar el pedido es del personal (las reglas de 11_acceso_web.sql
-- solo le dejan ver y tocar las suyas).
create or replace function public.pedido_solicitudes_revisar_cliente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if current_user <> 'authenticated' or public.es_personal() then
        return new;
    end if;
    if tg_op = 'INSERT' then
        if new.estado <> 'pendiente' or new.pedido_id is not null or new.revisado_por is not null then
            raise exception 'La solicitud se crea pendiente.' using errcode = '42501';
        end if;
        new.usuario_id := public.yo();
    elsif old.estado <> 'pendiente' or new.estado not in ('pendiente', 'cancelada')
          or new.pedido_id is distinct from old.pedido_id or new.revisado_por is distinct from old.revisado_por
          or new.cliente_id is distinct from old.cliente_id or new.empresa_id is distinct from old.empresa_id then
        raise exception 'Solo puedes cancelar tu solicitud mientras está pendiente.' using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists pedido_solicitudes_revisar_cliente on public.pedido_solicitudes;
create trigger pedido_solicitudes_revisar_cliente before insert or update on public.pedido_solicitudes
    for each row execute function public.pedido_solicitudes_revisar_cliente();


-- ==================================================
-- UBICACIÓN COMPARTIDA POR EL CLIENTE
-- Antes de registrar un pedido, la tienda le manda al cliente un enlace por WhatsApp
-- (ubicacion.html?t=<token>). El cliente marca dónde entregar y el punto llega al
-- formulario de "Nuevo pedido" (punto B). Vence en 24 horas. También queda en la
-- ficha del cliente. Solo por las funciones (la página del cliente no inicia sesión).
-- ==================================================

create table if not exists public.ubicaciones_compartidas (
    id                 bigint generated always as identity primary key,
    token              uuid not null default gen_random_uuid() unique, -- va en el enlace
    empresa_id         bigint references public.empresas(id) on delete cascade,
    tienda_id          bigint not null references public.tiendas(id) on delete cascade,
    cliente_id         bigint references public.clientes(id) on delete set null,
    cliente_nombre     text,
    telefono           text not null,          -- solo dígitos
    pedida_por         bigint,                 -- quién mandó el enlace (sin llave: queda aunque se borre)
    pedida_por_nombre  text,
    creado_en          timestamptz not null default now(),
    vence_en           timestamptz not null default now() + interval '24 hours',
    lat                numeric(9,6),
    lng                numeric(9,6),
    precision_m        integer,
    compartida_en      timestamptz,
    pedido_id          bigint references public.pedidos(id) on delete set null,
    usada_en           timestamptz,            -- se registró el pedido: el enlace ya no cambia nada

    constraint ubicaciones_compartidas_punto check ((lat is null) = (lng is null))
);
create index if not exists ubicaciones_compartidas_tel_idx on public.ubicaciones_compartidas (tienda_id, telefono, creado_en desc);

-- ¿El usuario registra pedidos de esa tienda? (Empleado y G3 de la tienda; G2, G1 y Administrador en su alcance)
create or replace function public.ubicacion_puede_tienda(u public.usuarios, p_tienda bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select u.rol not in ('piloto', 'cliente')
       and (u.tienda_id = p_tienda or public.puede_tienda(u, p_tienda));
$$;

-- La tienda pide la ubicación. p = { usuario_id, tienda_id, cliente_id, nombre, telefono }
-- Si ya hay un enlace vigente sin usar para ese teléfono en esa tienda, se devuelve ese y se
-- alarga 24 horas. -> { id, token, lat, lng, precision_m, compartida_en, vence_en }
create or replace function public.ubicacion_pedir(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u        public.usuarios;
    v_tienda bigint := (p ->> 'tienda_id')::bigint;
    v_tel    text := regexp_replace(coalesce(p ->> 'telefono', ''), '\D', '', 'g');
    r        public.ubicaciones_compartidas;
begin
    u := public.usuario_activo((p ->> 'usuario_id')::bigint);
    if v_tienda is null or not public.ubicacion_puede_tienda(u, v_tienda) then
        raise exception 'No registras pedidos de esa tienda.' using errcode = 'P0001';
    end if;
    if length(v_tel) < 8 then
        raise exception 'Escribe el teléfono del cliente (al menos 8 dígitos).' using errcode = 'P0001';
    end if;

    select * into r from public.ubicaciones_compartidas
     where tienda_id = v_tienda and right(telefono, 8) = right(v_tel, 8)
       and usada_en is null and vence_en > now()
     order by creado_en desc
     limit 1;
    if found then
        update public.ubicaciones_compartidas
           set vence_en = now() + interval '24 hours',
               cliente_id = coalesce((p ->> 'cliente_id')::bigint, cliente_id),
               cliente_nombre = coalesce(nullif(btrim(p ->> 'nombre'), ''), cliente_nombre)
         where id = r.id
        returning * into r;
    else
        insert into public.ubicaciones_compartidas (empresa_id, tienda_id, cliente_id, cliente_nombre, telefono, pedida_por, pedida_por_nombre)
        values ((select empresa_id from public.tiendas where id = v_tienda), v_tienda, (p ->> 'cliente_id')::bigint,
                nullif(btrim(p ->> 'nombre'), ''), v_tel, u.id, u.nombre)
        returning * into r;
    end if;
    return jsonb_build_object('id', r.id, 'token', r.token, 'lat', r.lat, 'lng', r.lng, 'precision_m', r.precision_m,
                              'compartida_en', r.compartida_en, 'vence_en', r.vence_en);
end;
$$;

-- La tienda revisa si el cliente ya la marcó. p = { usuario_id, id }
create or replace function public.ubicacion_estado(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u public.usuarios;
    r public.ubicaciones_compartidas;
begin
    u := public.usuario_activo((p ->> 'usuario_id')::bigint);
    select * into r from public.ubicaciones_compartidas where id = (p ->> 'id')::bigint;
    if not found or not public.ubicacion_puede_tienda(u, r.tienda_id) then
        raise exception 'No se encontró esa solicitud de ubicación.' using errcode = 'P0001';
    end if;
    return jsonb_build_object('id', r.id, 'tienda_id', r.tienda_id, 'lat', r.lat, 'lng', r.lng, 'precision_m', r.precision_m,
                              'compartida_en', r.compartida_en, 'usada_en', r.usada_en, 'vence_en', r.vence_en,
                              'cliente_id', r.cliente_id, 'cliente_nombre', r.cliente_nombre, 'telefono', r.telefono);
end;
$$;

-- Al registrar el pedido el enlace se cierra. p = { usuario_id, id, pedido_id }
create or replace function public.ubicacion_usar(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    u public.usuarios;
    r public.ubicaciones_compartidas;
begin
    u := public.usuario_activo((p ->> 'usuario_id')::bigint);
    select * into r from public.ubicaciones_compartidas where id = (p ->> 'id')::bigint;
    if not found or not public.ubicacion_puede_tienda(u, r.tienda_id) then
        raise exception 'No se encontró esa solicitud de ubicación.' using errcode = 'P0001';
    end if;
    update public.ubicaciones_compartidas
       set pedido_id = (p ->> 'pedido_id')::bigint, usada_en = now()
     where id = r.id and usada_en is null;
end;
$$;

-- Página del cliente (ubicacion.html, sin sesión): solo con el token. No devuelve datos
-- personales: el primer nombre y la tienda.
-- -> { estado: 'pendiente' | 'compartida' | 'usada' | 'vencida' | 'no_existe', nombre, tienda, lat, lng }
create or replace function public.ubicacion_ver(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    r      public.ubicaciones_compartidas;
    v_uuid uuid;
begin
    begin
        v_uuid := p_token::uuid;
    exception when others then
        return jsonb_build_object('estado', 'no_existe');
    end;
    select * into r from public.ubicaciones_compartidas where token = v_uuid;
    if not found then
        return jsonb_build_object('estado', 'no_existe');
    end if;
    return jsonb_build_object(
        'estado', case when r.usada_en is not null then 'usada' when r.vence_en <= now() then 'vencida'
                       when r.compartida_en is not null then 'compartida' else 'pendiente' end,
        'nombre', split_part(btrim(coalesce(r.cliente_nombre, '')), ' ', 1),
        'tienda', (select t.nombre from public.tiendas t where t.id = r.tienda_id),
        'lat', r.lat, 'lng', r.lng);
end;
$$;

-- El cliente guarda (o cambia) su ubicación hasta que se registre el pedido. También queda
-- en su ficha de Clientes y la primera vez se avisa a quien mandó el enlace.
create or replace function public.ubicacion_guardar(p_token text, p_lat numeric, p_lng numeric, p_precision integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    r      public.ubicaciones_compartidas;
    v_uuid uuid;
    v_txt  text;
begin
    begin
        v_uuid := p_token::uuid;
    exception when others then
        raise exception 'Este enlace no es válido.' using errcode = 'P0001';
    end;
    select * into r from public.ubicaciones_compartidas where token = v_uuid for update;
    if not found then
        raise exception 'Este enlace no es válido.' using errcode = 'P0001';
    end if;
    if r.usada_en is not null then
        raise exception 'Tu pedido ya se registró con esta ubicación. Si cambió, avísale a la tienda.' using errcode = 'P0001';
    end if;
    if r.vence_en <= now() then
        raise exception 'Este enlace venció. Pídele a la tienda uno nuevo.' using errcode = 'P0001';
    end if;
    -- Costa Rica (con la isla del Coco)
    if p_lat is null or p_lng is null or p_lat not between 5.0 and 11.6 or p_lng not between -87.6 and -82.4 then
        raise exception 'Ese punto está fuera de Costa Rica. Mueve el mapa hasta el lugar de entrega.' using errcode = 'P0001';
    end if;

    update public.ubicaciones_compartidas
       set lat = round(p_lat, 6), lng = round(p_lng, 6),
           precision_m = case when p_precision > 0 then p_precision end, compartida_en = now()
     where id = r.id;

    -- Ficha del cliente: la suya o la de la empresa con ese teléfono
    v_txt := trim(to_char(round(p_lat, 6), 'FM990.000000')) || ', ' || trim(to_char(round(p_lng, 6), 'FM990.000000'));
    update public.clientes c
       set ubicacion = v_txt
     where (r.cliente_id is not null and c.id = r.cliente_id)
        or (r.cliente_id is null and c.empresa_id is not distinct from r.empresa_id
            and right(regexp_replace(c.telefono, '\D', '', 'g'), 8) = right(r.telefono, 8));

    -- Aviso (solo la primera vez) a quien mandó el enlace
    if r.compartida_en is null then
        insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, enlace, referencia_tipo, referencia_id)
        select us.id, 'info', 'El cliente compartió su ubicación',
               format('%s (tel. %s) marcó dónde entregar. Ya puedes registrar su pedido.',
                      coalesce(nullif(r.cliente_nombre, ''), 'El cliente'), right(r.telefono, 8)),
               '#pedidos?nuevo=1&ubicacion=' || r.id, 'ubicacion_compartida', r.id
          from public.usuarios us
         where us.id = r.pedida_por;
    end if;
    return jsonb_build_object('ok', true);
end;
$$;
