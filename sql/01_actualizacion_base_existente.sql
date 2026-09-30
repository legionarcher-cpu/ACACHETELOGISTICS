-- ==================================================
-- ACTUALIZACIÓN DE UNA BASE EXISTENTE
-- ACACHETE LOGISTICS
--
-- Para qué sirve: poner al día la base que ya está en uso (creada con los
-- scripts anteriores, ya eliminados), aunque no se hayan ejecutado todos.
-- Deja las mismas funciones, reglas y columnas que una base nueva.
-- Una base NUEVA no lo necesita: sql/00_instalacion_completa.sql ya trae todo.
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   Se puede volver a ejecutar sin error: lo que ya existe no se repite
--   (if not exists / create or replace / drop ... if exists).
--
-- Regla: cada cambio nuevo de estructura se agrega AL FINAL de este archivo
-- (como un bloque más, que se pueda repetir) y también a
-- sql/00_instalacion_completa.sql.
--
-- Requisito: la base ya tiene las tablas principales del sistema (usuarios,
-- tiendas, regiones, vehiculos, clientes, notificaciones, horarios,
-- actividades, pedidos...). Si no, usar sql/00_instalacion_completa.sql.
--
-- Qué hace:
--   1. Usuario "admin" protegido (no se elimina ni cambia de usuario o rol).
--   2. Funciones que usa la página: cambiar el código de una tienda y
--      horarios de una fecha.
--   3. Número de pedido (automático o manual) y código de respaldo
--      (aleatorio y/o teléfono) + su validación para la app del piloto.
--   4. Rutas, pilotos por ruta y piloto multitienda.
--   5. Estado del vehículo automático ("en uso" / "disponible").
--   6. Tipo de vehículo (camión, pick-up, panel o moto).
--   7. Qué usa cada actividad en el pedido.
--   8. Categorías de mercadería: tipos bulto y documento + categorías de Encomiendas.
--   9. Ubicación de las tiendas en el mapa (cobro por distancia).
--  10. Tarifas: km que cubre el mínimo (distancia incluida).
-- ==================================================


-- ---------- Revisión: si la base está vacía, se detiene con un aviso claro ----------
do $$
begin
    if to_regclass('public.usuarios') is null or to_regclass('public.pedidos') is null then
        raise exception 'A esta base le faltan las tablas principales: ejecute sql/00_instalacion_completa.sql (no este archivo).';
    end if;
end;
$$;


-- ==================================================
-- 0. PIEZAS BÁSICAS (por si alguna no se creó en su momento)
-- ==================================================

-- Columnas de usuarios: foto, región (G2), aprobación (G3), vehículo (pilotos)
alter table public.usuarios
    add column if not exists foto_url       text,
    add column if not exists region         text references public.regiones(codigo) on delete restrict,
    add column if not exists aprobado       boolean not null default true,
    add column if not exists solicitado_por bigint references public.usuarios(id) on delete set null,
    add column if not exists solicitado_en  timestamptz,
    add column if not exists vehiculo_id    bigint references public.vehiculos(id) on delete set null;

-- Pesos promedio de artículos (Configuración -> Pedidos -> Artículos frecuentes)
create table if not exists public.articulos_catalogo (
    id            bigint generated always as identity primary key,
    categoria_id  bigint not null references public.categorias_mercaderia(id) on delete cascade,
    nombre        text not null,
    peso_kg       numeric(8,2) not null default 0,
    activo        boolean not null default true,
    orden         smallint not null default 0,

    constraint articulos_catalogo_peso_valido check (peso_kg >= 0),
    constraint articulos_catalogo_unico unique (categoria_id, nombre)
);

alter table public.articulos_catalogo enable row level security;
grant select, insert, update, delete on public.articulos_catalogo to anon;
drop policy if exists "TEMPORAL - leer catalogo"      on public.articulos_catalogo;
drop policy if exists "TEMPORAL - crear catalogo"     on public.articulos_catalogo;
drop policy if exists "TEMPORAL - modificar catalogo" on public.articulos_catalogo;
drop policy if exists "TEMPORAL - eliminar catalogo"  on public.articulos_catalogo;
create policy "TEMPORAL - leer catalogo"      on public.articulos_catalogo for select to anon using (true);
create policy "TEMPORAL - crear catalogo"     on public.articulos_catalogo for insert to anon with check (true);
create policy "TEMPORAL - modificar catalogo" on public.articulos_catalogo for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar catalogo"  on public.articulos_catalogo for delete to anon using (true);

-- Espacios de fotos (usuarios y entregas)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
    ('avatares',   'avatares',   true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
    ('evidencias', 'evidencias', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict do nothing;

drop policy if exists "TEMPORAL - ver avatares"        on storage.objects;
drop policy if exists "TEMPORAL - subir avatares"      on storage.objects;
drop policy if exists "TEMPORAL - reemplazar avatares" on storage.objects;
drop policy if exists "TEMPORAL - borrar avatares"     on storage.objects;
drop policy if exists "TEMPORAL - ver evidencias"      on storage.objects;
drop policy if exists "TEMPORAL - subir evidencias"    on storage.objects;
drop policy if exists "TEMPORAL - borrar evidencias"   on storage.objects;
create policy "TEMPORAL - ver avatares"        on storage.objects for select to anon using (bucket_id = 'avatares');
create policy "TEMPORAL - subir avatares"      on storage.objects for insert to anon with check (bucket_id = 'avatares');
create policy "TEMPORAL - reemplazar avatares" on storage.objects for update to anon using (bucket_id = 'avatares') with check (bucket_id = 'avatares');
create policy "TEMPORAL - borrar avatares"     on storage.objects for delete to anon using (bucket_id = 'avatares');
create policy "TEMPORAL - ver evidencias"      on storage.objects for select to anon using (bucket_id = 'evidencias');
create policy "TEMPORAL - subir evidencias"    on storage.objects for insert to anon with check (bucket_id = 'evidencias');
create policy "TEMPORAL - borrar evidencias"   on storage.objects for delete to anon using (bucket_id = 'evidencias');


-- ==================================================
-- 1. ROL DESARROLLADOR Y USUARIOS PROTEGIDOS
-- desarrollador: por ENCIMA del Administrador; no aparece para los demás.
-- Usuario "desar" (clave ak7desa). "desar" y "admin" no se eliminan ni
-- cambian de usuario o rol.
-- ==================================================

alter table public.usuarios drop constraint if exists usuarios_rol_valido;
alter table public.usuarios add constraint usuarios_rol_valido check (
    rol in ('desarrollador', 'administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado', 'piloto'));
alter table public.usuarios drop constraint if exists usuarios_tienda_segun_rol;
alter table public.usuarios add constraint usuarios_tienda_segun_rol check (
    (rol in ('desarrollador', 'administrador', 'admin_g1') and tienda_id is null and region is null)
    or (rol = 'admin_g2' and tienda_id is null and region is not null)
    or (rol in ('admin_g3', 'empleado', 'piloto') and tienda_id is not null and region is null));

insert into public.usuarios (nombre, id_usuario, telefono, clave, permisos, rol) values
    ('Desarrollador', 'desar', '00000000', 'ak7desa', '{*}', 'desarrollador')
on conflict do nothing;

create or replace function public.proteger_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' and old.id_usuario in ('admin', 'desar') then
        raise exception 'El usuario % está protegido y no se puede eliminar.', old.id_usuario
            using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and old.id_usuario in ('admin', 'desar')
       and (new.id_usuario <> old.id_usuario or new.rol <> old.rol) then
        raise exception 'Al usuario % no se le puede cambiar el usuario ni el rol.', old.id_usuario
            using errcode = 'P0001';
    end if;
    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

drop trigger if exists usuarios_proteger_admin on public.usuarios;
create trigger usuarios_proteger_admin
    before update or delete on public.usuarios
    for each row execute function public.proteger_admin();


-- ==================================================
-- 2. FUNCIONES QUE USA LA PÁGINA
-- ==================================================

-- Cambiar el código de una tienda y renombrar a sus usuarios (sección Tiendas)
create or replace function public.cambiar_codigo_tienda(p_tienda_id bigint, p_nuevo_codigo text)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_codigo_viejo text;
begin
    select codigo into v_codigo_viejo from public.tiendas where id = p_tienda_id for update;
    if not found then
        raise exception 'La tienda no existe.' using errcode = 'P0002';
    end if;
    if v_codigo_viejo = p_nuevo_codigo then
        return;
    end if;

    update public.tiendas
       set codigo = p_nuevo_codigo, region = left(p_nuevo_codigo, 3)
     where id = p_tienda_id;

    update public.usuarios
       set id_usuario = lower(p_nuevo_codigo) || '-' || substr(id_usuario, length(v_codigo_viejo) + 2)
     where tienda_id = p_tienda_id
       and id_usuario like lower(v_codigo_viejo) || '-%';
end;
$$;

-- Horarios que aplican a una fecha: los propios del día o los de la base
create or replace function public.marcas_del_dia(p_fecha date default current_date)
returns table (numero smallint, inicio_desde time, inicio_hasta time, fin time, personalizado boolean)
language sql
stable
as $$
    select m.numero, m.inicio_desde, m.inicio_hasta, m.fin, true
    from public.marcas_dia m
    where m.dia = extract(isodow from p_fecha)
    union all
    select b.numero, b.inicio_desde, b.inicio_hasta, b.fin, false
    from public.marcas_horario b
    where not exists (select 1 from public.horario_dias d where d.dia = extract(isodow from p_fecha))
    order by 1;
$$;

grant execute on function public.cambiar_codigo_tienda(bigint, text) to anon;
grant execute on function public.marcas_del_dia(date) to anon;


-- ==================================================
-- 3. NÚMERO DE PEDIDO Y CÓDIGO DE RESPALDO
--   numero_pedido   = "automatico" (P-000001...) | "manual" (lo escribe el empleado)
--   codigo_respaldo = ["aleatorio"] | ["telefono"] | ["aleatorio", "telefono"]
-- ==================================================

insert into public.configuracion (clave, valor) values
    ('numero_pedido',   '"automatico"'),
    ('codigo_respaldo', '["aleatorio"]')
on conflict (clave) do nothing;

-- Si quedó guardado como texto ("aleatorio"), pasa a lista (["aleatorio"])
update public.configuracion
   set valor = jsonb_build_array(valor)
 where clave = 'codigo_respaldo' and jsonb_typeof(valor) = 'string';

alter table public.pedidos
    add column if not exists codigo_telefono text;

create sequence if not exists public.pedidos_codigo_seq;

create or replace function public.pedidos_antes_de_crear()
returns trigger
language plpgsql
as $$
declare
    modo_numero   text;
    opciones      jsonb;
    digitos       text;
    usa_aleatorio boolean;
    usa_telefono  boolean;
begin
    select valor #>> '{}' into modo_numero from public.configuracion where clave = 'numero_pedido';

    if modo_numero = 'manual' then
        new.codigo := upper(trim(coalesce(new.codigo, '')));
        if new.codigo = '' then
            raise exception 'Falta el número de pedido (la empresa usa números manuales).'
                using errcode = '23502';
        end if;
    else
        new.codigo := 'P-' || lpad(nextval('public.pedidos_codigo_seq')::text, 6, '0');
    end if;

    select valor into opciones from public.configuracion where clave = 'codigo_respaldo';
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

grant usage on sequence public.pedidos_codigo_seq to anon;
grant execute on function public.validar_codigo_respaldo(bigint, text) to anon;


-- ==================================================
-- 4. RUTAS, PILOTOS POR RUTA Y PILOTO MULTITIENDA
-- ==================================================

create table if not exists public.rutas (
    id          bigint generated always as identity primary key,
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

alter table public.pedidos
    add column if not exists ruta_id bigint references public.rutas(id) on delete set null;

alter table public.usuarios
    add column if not exists multitienda boolean not null default false;

alter table public.usuarios
    drop constraint if exists usuarios_multitienda_solo_piloto;
alter table public.usuarios
    add constraint usuarios_multitienda_solo_piloto check (not multitienda or rol = 'piloto');

-- Acceso desde la web (TEMPORAL, igual que las demás tablas)
do $$
declare
    t text;
begin
    foreach t in array array['rutas', 'rutas_pilotos'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('grant select, insert, update, delete on public.%I to anon', t);
        execute format('drop policy if exists "TEMPORAL - leer %1$s" on public.%1$I', t);
        execute format('drop policy if exists "TEMPORAL - crear %1$s" on public.%1$I', t);
        execute format('drop policy if exists "TEMPORAL - modificar %1$s" on public.%1$I', t);
        execute format('drop policy if exists "TEMPORAL - eliminar %1$s" on public.%1$I', t);
        execute format('create policy "TEMPORAL - leer %1$s" on public.%1$I for select to anon using (true)', t);
        execute format('create policy "TEMPORAL - crear %1$s" on public.%1$I for insert to anon with check (true)', t);
        execute format('create policy "TEMPORAL - modificar %1$s" on public.%1$I for update to anon using (true) with check (true)', t);
        execute format('create policy "TEMPORAL - eliminar %1$s" on public.%1$I for delete to anon using (true)', t);
    end loop;
end;
$$;


-- ==================================================
-- 5. VEHÍCULO "EN USO" AUTOMÁTICO
-- En uso mientras su piloto tiene pedidos activos; mantenimiento no se toca.
-- ==================================================

create or replace function public.recalcular_estado_vehiculo(p_vehiculo bigint)
returns void
language plpgsql
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
                     and p.estado in ('registrado', 'recibido_bodega', 'asignado', 'reprogramado', 'en_ruta')
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

-- Recalcular todos ahora
select public.recalcular_estado_vehiculo(id) from public.vehiculos;


-- ==================================================
-- 6. VEHÍCULOS: tipo
-- Vacío = registrado antes (aparece "Sin tipo" hasta que se le ponga).
-- ==================================================

alter table public.vehiculos
    add column if not exists tipo text;

alter table public.vehiculos
    drop constraint if exists vehiculos_tipo_valido;
alter table public.vehiculos
    add constraint vehiculos_tipo_valido
    check (tipo is null or tipo in ('camion', 'pickup', 'panel', 'moto'));


-- ==================================================
-- 7. ACTIVIDADES: qué usa cada una
-- (se cambian en Configuración -> Actividades)
-- ==================================================

alter table public.actividades
    add column if not exists usa_recoleccion boolean not null default false,
    add column if not exists usa_compra      boolean not null default false,
    add column if not exists usa_tamanos     boolean not null default false,
    add column if not exists permite_alcohol boolean not null default false;

update public.actividades
   set usa_bodega = true, usa_recoleccion = true, usa_tamanos = true
 where codigo = 'encomiendas';

update public.actividades
   set usa_compra = true, permite_alcohol = true
 where codigo = 'tienda';


-- ==================================================
-- 8. CATEGORÍAS DE MERCADERÍA
--   conteo    -> cajas, bolsas, hieleras y peso aproximado (abarrotes)
--   articulos -> artículos con su peso promedio (línea blanca, electrónica)
--   bulto     -> cantidad, tamaño y peso de cada uno (cajas, bolsas)
--   documento -> solo cantidad; cada uno pesa peso_referencia
-- ==================================================

alter table public.categorias_mercaderia
    drop constraint if exists categorias_tipo_valido;
alter table public.categorias_mercaderia
    add constraint categorias_tipo_valido check (tipo in ('conteo', 'articulos', 'bulto', 'documento'));

alter table public.categorias_mercaderia
    add column if not exists peso_referencia numeric(8,2);

-- Categorías de Encomiendas. Los pesos promedio de Línea blanca y
-- Electrónica se compartirán con los de tienda (catálogo único, pendiente);
-- mientras tanto el empleado escribe el artículo y su peso.
insert into public.categorias_mercaderia (actividad, nombre, tipo, icono, orden, peso_referencia) values
    ('encomiendas', 'Cajas',           'bulto',     'bi-box-seam', 1, null),
    ('encomiendas', 'Bolsas',          'bulto',     'bi-bag',      2, null),
    ('encomiendas', 'Documentos',      'documento', 'bi-envelope', 3, 0.2),
    ('encomiendas', 'Línea blanca',    'articulos', 'bi-snow',     4, null),
    ('encomiendas', 'Electrónica',     'articulos', 'bi-tv',       5, null),
    ('encomiendas', 'Otros artículos', 'articulos', 'bi-box',      6, null)
on conflict (actividad, nombre) do nothing;

-- ==================================================
-- 9. UBICACIÓN DE LAS TIENDAS EN EL MAPA
-- Punto de salida de las entregas de tienda (cobro por distancia).
-- Se guarda desde el formulario de Pedidos ("Guardar como ubicación de la
-- tienda"). Vacío = se busca con la dirección de la tienda.
-- ==================================================

alter table public.tiendas
    add column if not exists lat numeric(9,6),
    add column if not exists lng numeric(9,6);

-- ==================================================
-- 10. TARIFAS: KM QUE CUBRE EL MÍNIMO
-- Igual que kg_incluidos: el mínimo cubre hasta km_incluidos km; cada km
-- de más se cobra a precio_km. 0 = se cobra desde el primer km.
-- ==================================================

alter table public.tarifas
    add column if not exists km_incluidos numeric(8,2) not null default 0;

alter table public.tarifas
    drop constraint if exists tarifas_km_incluidos_valido;
alter table public.tarifas
    add constraint tarifas_km_incluidos_valido check (km_incluidos >= 0);
