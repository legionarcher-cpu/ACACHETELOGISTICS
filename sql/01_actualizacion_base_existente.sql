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
--  11. Clientes: primer y segundo apellido, correo y búsqueda.
--  12. Slots, flujo de despacho (alistando -> listo -> recibido -> cargado
--      -> en ruta -> en entrega) y calculador interno de tiempos.
--  13. Marcas del piloto (se habilitan solas según los horarios).
--  14. QR: marcas con el QR mensual de la tienda y validación diaria del piloto.
--  15. Marca tardía con justificación ("hora inicio" y "termina").
--  16. Empresas internas con ID ("01"), usuarios con el ID de su empresa
--      (jperez01, cenjperez01) y ruta de entrega del cliente por tienda.
--      ⚠ Renombra a los usuarios que ya existen (una sola vez): avisarles.
--  17. Usuarios de tienda con la región y sin el número de la tienda (cenjperez01).
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
on conflict do nothing; -- sin columnas: desde el bloque 16 la regla también lleva la empresa

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

-- ==================================================
-- 11. CLIENTES: PRIMER Y SEGUNDO APELLIDO, CORREO Y BÚSQUEDA
-- "apellidos" pasa a ser calculada (apellido1 + apellido2) y se agrega
-- "busqueda" (nombre, apellidos, correo y teléfono sin tildes): la usa el
-- buscador de clientes del formulario de Pedidos.
-- Los clientes que ya existen: la primera palabra de sus apellidos queda
-- como primer apellido y el resto como segundo.
-- ==================================================

alter table public.clientes
    add column if not exists apellido1 text,
    add column if not exists apellido2 text,
    add column if not exists correo text;

do $$
begin
    -- Solo la primera vez: "apellidos" todavía es una columna normal
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'clientes'
                 and column_name = 'apellidos' and is_generated = 'NEVER') then
        update public.clientes
           set apellido1 = coalesce(nullif(split_part(btrim(apellidos), ' ', 1), ''), '-'),
               apellido2 = nullif(btrim(substr(btrim(apellidos), length(split_part(btrim(apellidos), ' ', 1)) + 1)), '')
         where apellido1 is null;
        alter table public.clientes drop column apellidos;
    end if;
end;
$$;

update public.clientes set apellido1 = '-' where apellido1 is null;
alter table public.clientes alter column apellido1 set not null;

alter table public.clientes
    add column if not exists apellidos text
        generated always as (btrim(apellido1 || ' ' || coalesce(apellido2, ''))) stored;

alter table public.clientes
    add column if not exists busqueda text
        generated always as (lower(translate(
            nombre || ' ' || apellido1 || ' ' || coalesce(apellido2, '') || ' ' ||
            coalesce(correo, '') || ' ' || regexp_replace(telefono, '\D', '', 'g'),
            'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))) stored;

alter table public.clientes
    drop constraint if exists clientes_correo_formato;
alter table public.clientes
    add constraint clientes_correo_formato check (correo is null or correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- Desde el bloque 16 el correo no se repite DENTRO de cada empresa (otra regla)
do $$
begin
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'clientes' and column_name = 'empresa_id') then
        create unique index if not exists clientes_correo_unico on public.clientes (lower(correo)) where correo is not null;
    end if;
end;
$$;

-- ==================================================
-- 12. SLOTS Y FLUJO DE DESPACHO
--   - Slots: rango de horario de despacho de cada pedido (Configuración ->
--     Slots), igual que las marcas: base + propios por día de la semana.
--   - Estados nuevos: alistando, listo_despacho, recibido_ruta, cargado, en_entrega.
--   - Hora de cada paso (trigger pedidos_tiempos) y vistas del calculador
--     interno: pedidos_tiempos y slots_carga.
--   - Un solo pedido "en_entrega" por piloto.
-- ==================================================

insert into public.configuracion (clave, valor) values
    ('cantidad_slots', '4')
on conflict (clave) do nothing;

create table if not exists public.slots_horario (
    numero          smallint primary key,
    inicio          time not null,
    fin             time not null,
    actualizado_en  timestamptz not null default now(),

    constraint slots_numero_valido check (numero between 1 and 24),
    constraint slots_fin_valido    check (fin > inicio)
);

insert into public.slots_horario (numero, inicio, fin) values
    (1, '08:00', '10:00'),
    (2, '10:00', '12:00'),
    (3, '13:00', '15:00'),
    (4, '15:00', '17:00')
on conflict do nothing;

create table if not exists public.slot_dias (
    dia             smallint primary key,
    cantidad_slots  smallint not null,
    actualizado_en  timestamptz not null default now(),

    constraint slot_dia_valido      check (dia between 1 and 7),
    constraint slot_cantidad_valida check (cantidad_slots between 0 and 24)
);

create table if not exists public.slots_dia (
    dia     smallint not null references public.slot_dias(dia) on delete cascade,
    numero  smallint not null,
    inicio  time not null,
    fin     time not null,

    primary key (dia, numero),
    constraint slots_dia_numero_valido check (numero between 1 and 24),
    constraint slots_dia_fin_valido    check (fin > inicio)
);

create or replace function public.slots_del_dia(p_fecha date default current_date)
returns table (numero smallint, inicio time, fin time, personalizado boolean)
language sql
stable
as $$
    select s.numero, s.inicio, s.fin, true
    from public.slots_dia s
    where s.dia = extract(isodow from p_fecha)
    union all
    select b.numero, b.inicio, b.fin, false
    from public.slots_horario b
    where not exists (select 1 from public.slot_dias d where d.dia = extract(isodow from p_fecha))
    order by 1;
$$;

-- Slot del pedido y hora de cada paso
alter table public.pedidos
    add column if not exists slot_numero      smallint,
    add column if not exists alistando_en     timestamptz,
    add column if not exists listo_en         timestamptz,
    add column if not exists recibido_ruta_en timestamptz,
    add column if not exists cargado_en       timestamptz,
    add column if not exists cargado_por      bigint references public.usuarios(id) on delete set null,
    add column if not exists salida_en        timestamptz,
    add column if not exists entregando_en    timestamptz,
    add column if not exists finalizado_en    timestamptz;

alter table public.pedidos drop constraint if exists pedidos_estado_valido;
alter table public.pedidos add constraint pedidos_estado_valido check (estado in (
    'registrado', 'recibido_bodega', 'asignado', 'alistando', 'listo_despacho',
    'recibido_ruta', 'cargado', 'en_ruta', 'en_entrega', 'entregado',
    'entregado_incidencia', 'no_entregado', 'reprogramado', 'devuelto', 'cancelado'));

create index if not exists pedidos_slot_idx on public.pedidos (tienda_id, fecha_entrega, slot_numero);
create unique index if not exists pedidos_un_en_entrega on public.pedidos (piloto_id) where estado = 'en_entrega';

create or replace function public.pedidos_marcar_tiempos()
returns trigger
language plpgsql
as $$
begin
    if new.estado is distinct from old.estado then
        case new.estado
            when 'alistando'      then new.alistando_en     := coalesce(old.alistando_en, now());
            when 'listo_despacho' then new.listo_en         := coalesce(old.listo_en, now());
            when 'recibido_ruta'  then new.recibido_ruta_en := now();
            when 'cargado'        then new.cargado_en       := now();
            when 'en_ruta'        then new.salida_en        := now();
            when 'en_entrega'     then new.entregando_en    := now();
            else null;
        end case;
        if new.estado in ('entregado', 'entregado_incidencia', 'no_entregado', 'devuelto', 'cancelado') then
            new.finalizado_en := now();
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists pedidos_tiempos on public.pedidos;
create trigger pedidos_tiempos
    before update of estado on public.pedidos
    for each row execute function public.pedidos_marcar_tiempos();

create or replace view public.pedidos_tiempos
with (security_invoker = true) as
select
    p.id, p.codigo, p.tienda_id, p.actividad, p.fecha_entrega, p.slot_numero, p.piloto_id, p.estado,
    round(extract(epoch from (p.alistando_en  - p.creado_en))    / 60, 1) as min_espera_alistar,
    round(extract(epoch from (p.listo_en      - p.alistando_en)) / 60, 1) as min_alistando,
    round(extract(epoch from (p.listo_en      - p.creado_en))    / 60, 1) as min_hasta_listo,
    round(extract(epoch from (p.cargado_en    - p.listo_en))     / 60, 1) as min_espera_carga,
    round(extract(epoch from (p.salida_en     - p.cargado_en))   / 60, 1) as min_cargado_a_salida,
    round(extract(epoch from (p.finalizado_en - p.salida_en))    / 60, 1) as min_en_ruta,
    round(extract(epoch from (p.finalizado_en - p.entregando_en)) / 60, 1) as min_ultimo_tramo,
    round(extract(epoch from (p.finalizado_en - p.creado_en))    / 60, 1) as min_total
from public.pedidos p
where not p.anulado;

create or replace view public.slots_carga
with (security_invoker = true) as
select
    p.tienda_id, p.fecha_entrega, p.slot_numero,
    count(*)                                   as pedidos,
    count(p.cargado_en)                        as cargados,
    count(*) = count(p.cargado_en)             as completo,
    min(p.listo_en)                            as primer_listo,
    min(p.cargado_en)                          as primer_escaneo,
    max(p.cargado_en)                          as ultimo_escaneo,
    min(p.salida_en)                           as primera_salida,
    round(extract(epoch from (coalesce(min(p.salida_en), max(p.cargado_en)) - min(p.cargado_en))) / 60, 1) as min_carga,
    round(extract(epoch from (max(p.cargado_en) - min(p.cargado_en))) / 60, 1)                              as min_carga_todos
from public.pedidos p
where p.slot_numero is not null and not p.anulado and p.estado <> 'cancelado'
group by p.tienda_id, p.fecha_entrega, p.slot_numero;

-- Vehículo "en uso": también con los estados nuevos del despacho
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
                     and p.estado in ('registrado', 'recibido_bodega', 'asignado', 'reprogramado', 'alistando',
                                      'listo_despacho', 'recibido_ruta', 'cargado', 'en_ruta', 'en_entrega')
               ) then 'en_uso'
               else 'disponible'
           end
     where v.id = p_vehiculo
       and v.estado <> 'mantenimiento';
end;
$$;

-- Acceso desde la web (TEMPORAL, igual que las demás tablas)
do $$
declare
    t text;
begin
    foreach t in array array['slots_horario', 'slot_dias', 'slots_dia'] loop
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

grant execute on function public.slots_del_dia(date) to anon;
grant select on public.pedidos_tiempos to anon;
grant select on public.slots_carga to anon;

-- ==================================================
-- 13. MARCAS DEL PILOTO
-- Lo que marca el piloto cada día en su Inicio. Cada marca (horario) se
-- habilita sola cuando empieza su ventana y se puede marcar hasta que
-- termina; "a tiempo" si fue dentro de la ventana de inicio. La hora la
-- valida la base (Costa Rica), no el celular: función marcar_horario.
-- ==================================================

create table if not exists public.marcas_piloto (
    id          bigint generated always as identity primary key,
    piloto_id   bigint not null references public.usuarios(id) on delete cascade,
    fecha       date not null,
    numero      smallint not null,
    marcado_en  timestamptz not null default now(),
    a_tiempo    boolean not null default true,

    constraint marcas_piloto_unica unique (piloto_id, fecha, numero)
);

create or replace function public.marcar_horario(p_piloto bigint, p_numero smallint)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_ahora  timestamp := now() at time zone 'America/Costa_Rica';  -- hora local de la empresa
    v_hoy    date := v_ahora::date;
    v_hora   time := v_ahora::time;
    m        record;
    v_hecho  timestamptz;
begin
    select * into m from public.marcas_del_dia(v_hoy) x where x.numero = p_numero;
    if not found then
        raise exception 'El horario % no existe hoy.', p_numero using errcode = 'P0001';
    end if;
    if v_hora < m.inicio_desde then
        raise exception 'El horario % se habilita a las %.', p_numero, to_char(m.inicio_desde, 'HH24:MI') using errcode = 'P0001';
    end if;
    if v_hora > m.fin then
        raise exception 'El horario % ya terminó (%).', p_numero, to_char(m.fin, 'HH24:MI') using errcode = 'P0001';
    end if;
    insert into public.marcas_piloto (piloto_id, fecha, numero, a_tiempo)
    values (p_piloto, v_hoy, p_numero, v_hora <= m.inicio_hasta)
    on conflict (piloto_id, fecha, numero) do nothing
    returning marcado_en into v_hecho;
    if v_hecho is null then
        raise exception 'El horario % ya estaba marcado.', p_numero using errcode = 'P0001';
    end if;
    return v_hecho;
end;
$$;

alter table public.marcas_piloto enable row level security;
grant select on public.marcas_piloto to anon;
drop policy if exists "TEMPORAL - leer marcas_piloto" on public.marcas_piloto;
create policy "TEMPORAL - leer marcas_piloto" on public.marcas_piloto for select to anon using (true);
grant execute on function public.marcar_horario(bigint, smallint) to anon;

-- ==================================================
-- 14. QR: MARCAS CON QR DE LA TIENDA Y VALIDACIÓN DIARIA DEL PILOTO
--   - Cada tienda tiene un QR DE MARCAS que cambia cada mes (qr_marcas; se ve e
--     imprime en Tiendas). El piloto lo escanea y la base marca sola el horario
--     abierto (marcar_por_qr). Ya no se marca con un botón: marcar_horario se quita.
--   - Al empezar el día la tienda valida al piloto con su QR DEL DÍA (pilotos_dia;
--     lo da el G2 en Rutas y asignaciones). Sin validación no puede marcar.
--   - Cada marca guarda lo mínimo y lo de meses anteriores se borra solo.
-- ==================================================

drop function if exists public.marcar_horario(bigint, smallint);

create table if not exists public.qr_marcas (
    tienda_id  bigint not null references public.tiendas(id) on delete cascade,
    mes        date not null,
    codigo     text not null,
    primary key (tienda_id, mes)
);

create table if not exists public.pilotos_dia (
    piloto_id     bigint not null references public.usuarios(id) on delete cascade,
    fecha         date not null,
    token         uuid not null default gen_random_uuid() unique,
    validado_en   timestamptz,
    validado_por  bigint references public.usuarios(id) on delete set null,
    primary key (piloto_id, fecha)
);

create or replace function public.ahora_local()
returns timestamp
language sql
stable
as $$ select now() at time zone 'America/Costa_Rica' $$;

create or replace function public.qr_marca_mes(p_tienda bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_mes    date := date_trunc('month', public.ahora_local())::date;
    v_codigo text;
begin
    delete from public.qr_marcas where mes < v_mes;
    select codigo into v_codigo from public.qr_marcas where tienda_id = p_tienda and mes = v_mes;
    if v_codigo is null then
        insert into public.qr_marcas (tienda_id, mes, codigo)
        values (p_tienda, v_mes, substr(md5(random()::text || clock_timestamp()::text || p_tienda::text), 1, 16))
        on conflict (tienda_id, mes) do nothing;
        select codigo into v_codigo from public.qr_marcas where tienda_id = p_tienda and mes = v_mes;
    end if;
    return 'ACACHETE-MARCA:' || p_tienda || ':' || v_codigo;
end;
$$;

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
    delete from public.pilotos_dia where fecha < date_trunc('month', v_hoy)::date;
    insert into public.pilotos_dia (piloto_id, fecha) values (p_piloto, v_hoy) on conflict (piloto_id, fecha) do nothing;
    select token into v_token from public.pilotos_dia where piloto_id = p_piloto and fecha = v_hoy;
    return 'ACACHETE-PILOTO:' || v_token::text;
end;
$$;

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
    select * into d from public.pilotos_dia x where x.token = p_token;
    if not found then
        raise exception 'Ese QR de piloto no existe.' using errcode = 'P0001';
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

create or replace function public.marcar_por_qr(p_piloto bigint, p_qr text)
returns table (numero smallint, marcado_en timestamptz, a_tiempo boolean, tienda_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
    v_ahora   timestamp := public.ahora_local();
    v_hoy     date := v_ahora::date;
    v_hora    time := v_ahora::time;
    v_mes     date := date_trunc('month', v_ahora)::date;
    v_partes  text[] := string_to_array(coalesce(p_qr, ''), ':');
    v_tienda  bigint;
    v_proxima time;
    m         record;
begin
    if coalesce(array_length(v_partes, 1), 0) <> 3 or v_partes[1] <> 'ACACHETE-MARCA' or v_partes[2] !~ '^[0-9]+$' then
        raise exception 'Ese no es un QR de marcas de tienda.' using errcode = 'P0001';
    end if;
    v_tienda := v_partes[2]::bigint;
    if not exists (select 1 from public.qr_marcas q where q.tienda_id = v_tienda and q.mes = v_mes and q.codigo = v_partes[3]) then
        raise exception 'Este QR de marcas ya no sirve (cambia cada mes). Pide a la tienda el QR de este mes.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.pilotos_dia d where d.piloto_id = p_piloto and d.fecha = v_hoy and d.validado_en is not null) then
        raise exception 'La tienda todavía no te ha validado hoy: muéstrale tu QR del día y luego marca.' using errcode = 'P0001';
    end if;

    delete from public.marcas_piloto mp where mp.fecha < v_mes;

    select x.* into m from public.marcas_del_dia(v_hoy) x
     where v_hora between x.inicio_desde and x.fin
       and not exists (select 1 from public.marcas_piloto mp
                        where mp.piloto_id = p_piloto and mp.fecha = v_hoy and mp.numero = x.numero)
     order by x.numero
     limit 1;
    if not found then
        select min(x.inicio_desde) into v_proxima from public.marcas_del_dia(v_hoy) x where x.inicio_desde > v_hora;
        raise exception '%', case when v_proxima is null
            then 'No hay ningún horario abierto para marcar ahora.'
            else 'No hay un horario abierto ahora: el próximo se habilita a las ' || to_char(v_proxima, 'HH24:MI') || '.' end
            using errcode = 'P0001';
    end if;

    insert into public.marcas_piloto (piloto_id, fecha, numero, a_tiempo)
    values (p_piloto, v_hoy, m.numero, v_hora <= m.inicio_hasta);

    return query
        select mp.numero, mp.marcado_en, mp.a_tiempo, v_tienda
          from public.marcas_piloto mp
         where mp.piloto_id = p_piloto and mp.fecha = v_hoy and mp.numero = m.numero;
end;
$$;

alter table public.pilotos_dia enable row level security;
grant select on public.pilotos_dia to anon;
drop policy if exists "TEMPORAL - leer pilotos_dia" on public.pilotos_dia;
create policy "TEMPORAL - leer pilotos_dia" on public.pilotos_dia for select to anon using (true);
alter table public.qr_marcas enable row level security; -- sin acceso directo: solo qr_marca_mes
grant execute on function public.ahora_local() to anon;
grant execute on function public.qr_marca_mes(bigint) to anon;
grant execute on function public.qr_piloto_dia(bigint) to anon;
grant execute on function public.validar_piloto(uuid, bigint) to anon;
grant execute on function public.marcar_por_qr(bigint, text) to anon;

-- ==================================================
-- 15. MARCA TARDÍA CON JUSTIFICACIÓN
--   inicio_desde = desde aquí se puede marcar (solo lo ven G2 o superior)
--   inicio_hasta = "HORA INICIO": hasta aquí, a tiempo
--   fin          = "TERMINA": entre la hora inicio y aquí, MARCA TARDÍA: el piloto
--                  escribe por qué (se guarda en marcas_piloto.justificacion)
-- ==================================================

alter table public.marcas_piloto
    add column if not exists justificacion text;

alter table public.marcas_piloto drop constraint if exists marcas_piloto_justificacion;
alter table public.marcas_piloto add constraint marcas_piloto_justificacion
    check (justificacion is null or length(justificacion) <= 200);

-- Cambia lo que devuelve: se quita la versión anterior (2 datos) y se crea la nueva (3)
drop function if exists public.marcar_por_qr(bigint, text);

create or replace function public.marcar_por_qr(p_piloto bigint, p_qr text, p_justificacion text default null)
returns table (numero smallint, marcado_en timestamptz, a_tiempo boolean, tienda_id bigint, justificacion text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
    v_ahora   timestamp := public.ahora_local();
    v_hoy     date := v_ahora::date;
    v_hora    time := v_ahora::time;
    v_mes     date := date_trunc('month', v_ahora)::date;
    v_partes  text[] := string_to_array(coalesce(p_qr, ''), ':');
    v_tienda  bigint;
    v_proxima time;
    m         record;
begin
    if coalesce(array_length(v_partes, 1), 0) <> 3 or v_partes[1] <> 'ACACHETE-MARCA' or v_partes[2] !~ '^[0-9]+$' then
        raise exception 'Ese no es un QR de marcas de tienda.' using errcode = 'P0001';
    end if;
    v_tienda := v_partes[2]::bigint;
    if not exists (select 1 from public.qr_marcas q where q.tienda_id = v_tienda and q.mes = v_mes and q.codigo = v_partes[3]) then
        raise exception 'Este QR de marcas ya no sirve (cambia cada mes). Pide a la tienda el QR de este mes.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.pilotos_dia d where d.piloto_id = p_piloto and d.fecha = v_hoy and d.validado_en is not null) then
        raise exception 'La tienda todavía no te ha validado hoy: muéstrale tu QR del día y luego marca.' using errcode = 'P0001';
    end if;

    delete from public.marcas_piloto mp where mp.fecha < v_mes;

    select x.* into m from public.marcas_del_dia(v_hoy) x
     where v_hora between x.inicio_desde and x.fin
       and not exists (select 1 from public.marcas_piloto mp
                        where mp.piloto_id = p_piloto and mp.fecha = v_hoy and mp.numero = x.numero)
     order by x.numero
     limit 1;
    if not found then
        select min(x.inicio_hasta) into v_proxima from public.marcas_del_dia(v_hoy) x where x.inicio_desde > v_hora;
        raise exception '%', case when v_proxima is null
            then 'No hay ningún horario abierto para marcar ahora.'
            else 'Todavía no se puede marcar: el próximo horario tiene hora de inicio ' || to_char(v_proxima, 'HH24:MI') || '.' end
            using errcode = 'P0001';
    end if;

    if v_hora > m.inicio_hasta and coalesce(btrim(p_justificacion), '') = '' then
        raise exception 'JUSTIFICAR:Horario % · la hora de inicio era %. Es una marca tardía: escribe por qué.',
            m.numero, to_char(m.inicio_hasta, 'HH24:MI') using errcode = 'P0001';
    end if;

    insert into public.marcas_piloto (piloto_id, fecha, numero, a_tiempo, justificacion)
    values (p_piloto, v_hoy, m.numero, v_hora <= m.inicio_hasta,
            case when v_hora > m.inicio_hasta then left(btrim(p_justificacion), 200) end);

    return query
        select mp.numero, mp.marcado_en, mp.a_tiempo, v_tienda, mp.justificacion
          from public.marcas_piloto mp
         where mp.piloto_id = p_piloto and mp.fecha = v_hoy and mp.numero = m.numero;
end;
$$;

grant execute on function public.marcar_por_qr(bigint, text, text) to anon;

-- Que la página vea las columnas nuevas de inmediato
notify pgrst, 'reload schema';

-- ==================================================
-- 16. EMPRESAS INTERNAS (2026-10-02)
--   Varias empresas en la MISMA base. Cada una tiene un ID de 2 números
--   ("01", "02"...), sus actividades (entregas de tienda, encomiendas o las
--   dos) y sus propias regiones, tiendas, usuarios, clientes, rutas,
--   vehículos, pedidos, categorías de mercadería (con sus artículos), tarifas
--   y descuentos. Las crea el Desarrollador (Configuración -> Empresas; lista
--   en Tiendas -> Empresas). Lo que ya existía queda en la empresa "01".
--   - empresa_id se llena solo: la página pone la empresa activa y, en
--     pedidos, rutas, tiendas, usuarios, tarifas y descuentos, la base la
--     corrige según su tienda o región (triggers).
--   - USUARIOS con el ID de su empresa al final, sin guiones:
--       Administrador, G1, G2:    jperez01
--       G3, Empleado, Piloto:     cenjperez01  (región + nombre + empresa; sin la tienda)
--     "admin" y "desar" no cambian. Los usuarios que ya existían se renombran
--     UNA sola vez (cen-001-jperez -> cenjperez01). Al cambiar el ID de una
--     empresa (cambiar_codigo_empresa) o el código de una tienda se renombran solos.
--   - clientes_tiendas.ruta_id: ruta de entrega del cliente en cada tienda.
--   - Lo que no se repite (correo del cliente, nombre de categoría, tarifa por
--     lugar) ahora es dentro de cada empresa. Los códigos de región y de tienda
--     siguen siendo únicos en todo el sistema.
--   Se puede repetir.
-- ==================================================

create table if not exists public.empresas (
    id           bigint generated always as identity primary key,
    codigo       text not null unique,   -- ID de la empresa: "01", "02"... (va al final de sus usuarios)
    nombre       text not null unique,
    actividades  text[] not null default '{tienda,encomiendas}', -- códigos de la tabla actividades
    activa       boolean not null default true,  -- inactiva: sus usuarios no inician sesión
    creado_en    timestamptz not null default now(),

    constraint empresas_codigo_valido      check (codigo ~ '^[0-9]{2}$'),
    constraint empresas_actividades_validas check (cardinality(actividades) > 0)
);

-- La primera empresa: valor por defecto de empresa_id. Si no hay ninguna (ej. después
-- de herramientas/vaciar_base_datos.sql) la crea, así las inserciones no fallan.
create or replace function public.empresa_principal()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
    v_id bigint;
begin
    select id into v_id from public.empresas order by codigo, id limit 1;
    if v_id is null then
        insert into public.empresas (codigo, nombre) values ('01', 'Empresa principal') returning id into v_id;
    end if;
    return v_id;
end;
$$;

select public.empresa_principal();

alter table public.regiones              add column if not exists empresa_id bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict;
alter table public.tiendas               add column if not exists empresa_id bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict;
alter table public.clientes              add column if not exists empresa_id bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict;
alter table public.rutas                 add column if not exists empresa_id bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict;
alter table public.vehiculos             add column if not exists empresa_id bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict;
alter table public.pedidos               add column if not exists empresa_id bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict;
alter table public.categorias_mercaderia add column if not exists empresa_id bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict;
alter table public.tarifas               add column if not exists empresa_id bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict;
alter table public.descuentos            add column if not exists empresa_id bigint not null default public.empresa_principal() references public.empresas(id) on delete restrict;
-- Usuarios: el Desarrollador no es de ninguna empresa (las ve todas)
alter table public.usuarios              add column if not exists empresa_id bigint default public.empresa_principal() references public.empresas(id) on delete restrict;
update public.usuarios set empresa_id = null where rol = 'desarrollador' and empresa_id is not null;
alter table public.usuarios drop constraint if exists usuarios_empresa_segun_rol;
alter table public.usuarios add constraint usuarios_empresa_segun_rol
    check (rol = 'desarrollador' or empresa_id is not null);

-- Ruta de entrega del cliente en cada tienda (un cliente puede ser de varias)
alter table public.clientes_tiendas add column if not exists ruta_id bigint references public.rutas(id) on delete set null;

-- Lo que no se repite, ahora dentro de cada empresa
alter table public.categorias_mercaderia drop constraint if exists categorias_nombre_unico;
alter table public.categorias_mercaderia add constraint categorias_nombre_unico unique (empresa_id, actividad, nombre);
drop index if exists public.clientes_correo_unico;
create unique index if not exists clientes_correo_unico_empresa on public.clientes (empresa_id, lower(correo)) where correo is not null;
drop index if exists public.tarifas_alcance_unico;
create unique index if not exists tarifas_alcance_unico_empresa
    on public.tarifas (empresa_id, actividad, coalesce(region, ''), coalesce(tienda_id, 0));

create index if not exists tiendas_empresa_idx  on public.tiendas (empresa_id);
create index if not exists clientes_empresa_idx on public.clientes (empresa_id);
create index if not exists pedidos_empresa_idx  on public.pedidos (empresa_id, fecha_entrega);
create index if not exists usuarios_empresa_idx on public.usuarios (empresa_id);

-- ---------- empresa_id según la tienda o la región (triggers) ----------

-- Pedidos y rutas: de su tienda
create or replace function public.empresa_de_tienda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.tienda_id is not null then
        select t.empresa_id into new.empresa_id from public.tiendas t where t.id = new.tienda_id;
    end if;
    return new;
end;
$$;

-- Tiendas y descuentos: de su región
create or replace function public.empresa_de_region()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.region is not null then
        select r.empresa_id into new.empresa_id from public.regiones r where r.codigo = new.region;
    end if;
    return new;
end;
$$;

-- Tarifas: de su tienda o de su región (la general queda con la empresa que la crea)
create or replace function public.empresa_de_lugar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.tienda_id is not null then
        select t.empresa_id into new.empresa_id from public.tiendas t where t.id = new.tienda_id;
    elsif new.region is not null then
        select r.empresa_id into new.empresa_id from public.regiones r where r.codigo = new.region;
    end if;
    return new;
end;
$$;

-- Usuarios: de su tienda o de su región (Admin G2). Administrador y G1: la que se elige.
create or replace function public.empresa_de_usuario()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.rol = 'desarrollador' then
        new.empresa_id := null;
    elsif new.tienda_id is not null then
        select t.empresa_id into new.empresa_id from public.tiendas t where t.id = new.tienda_id;
    elsif new.region is not null then
        select r.empresa_id into new.empresa_id from public.regiones r where r.codigo = new.region;
    end if;
    return new;
end;
$$;

drop trigger if exists pedidos_empresa on public.pedidos;
create trigger pedidos_empresa before insert or update of tienda_id on public.pedidos
    for each row execute function public.empresa_de_tienda();
drop trigger if exists rutas_empresa on public.rutas;
create trigger rutas_empresa before insert or update of tienda_id on public.rutas
    for each row execute function public.empresa_de_tienda();
drop trigger if exists tiendas_empresa on public.tiendas;
create trigger tiendas_empresa before insert or update of region on public.tiendas
    for each row execute function public.empresa_de_region();
drop trigger if exists descuentos_empresa on public.descuentos;
create trigger descuentos_empresa before insert or update of region on public.descuentos
    for each row execute function public.empresa_de_region();
drop trigger if exists tarifas_empresa on public.tarifas;
create trigger tarifas_empresa before insert or update of tienda_id, region on public.tarifas
    for each row execute function public.empresa_de_lugar();
drop trigger if exists usuarios_empresa on public.usuarios;
create trigger usuarios_empresa before insert or update of tienda_id, region, rol on public.usuarios
    for each row execute function public.empresa_de_usuario();

-- ---------- Usuario con el ID de la empresa ----------
-- Usuario de tienda (G3, Empleado, Piloto): REGIÓN + nombre + ID de la empresa ->
-- "cen" + "jperez" + "01" = "cenjperez01". No lleva el número de la tienda: el usuario
-- ya está ligado a su empresa, su tienda y su región; si cambia de sucursal dentro de
-- la región (o es multisucursal) su usuario NO cambia.
-- Administrador, G1 y G2: nombre + ID -> "jperez01". "admin" y "desar" no cambian.

-- "jperez" a partir del usuario completo, en cualquier formato:
--   cenjperez01 / cen001jperez01 / cen001jperez / cen-001-jperez / jperez01 / jperez
create or replace function public.usuario_base(p_id_usuario text, p_codigo_empresa text, p_codigo_tienda text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
    v_id     text := coalesce(p_id_usuario, '');
    v_tienda text := regexp_replace(lower(coalesce(p_codigo_tienda, '')), '[^a-z0-9]', '', 'g');
    v_region text := lower(left(coalesce(p_codigo_tienda, ''), 3));
    v_emp    text := coalesce(p_codigo_empresa, '');
begin
    if p_codigo_tienda is not null then
        if v_id like lower(p_codigo_tienda) || '-%' then                                   -- cen-001-jperez
            v_id := substr(v_id, length(p_codigo_tienda) + 2);
        elsif v_tienda <> '' and v_id like v_tienda || '%' and length(v_id) > length(v_tienda) then -- cen001jperez
            v_id := substr(v_id, length(v_tienda) + 1);
        elsif v_region <> '' and v_id like v_region || '%' and length(v_id) > length(v_region) then -- cenjperez
            v_id := substr(v_id, length(v_region) + 1);
        end if;
    end if;
    if v_emp <> '' and right(v_id, length(v_emp)) = v_emp and length(v_id) > length(v_emp) then
        v_id := left(v_id, length(v_id) - length(v_emp));
    end if;
    return v_id;
end;
$$;

-- región de la tienda + nombre + ID de la empresa: "cen" + "jperez" + "01"
-- (sin tienda: "jperez" + "01")
create or replace function public.usuario_completo(p_base text, p_codigo_empresa text, p_codigo_tienda text)
returns text
language sql
immutable
set search_path = ''
as $$
    select coalesce(lower(left(p_codigo_tienda, 3)), '') || p_base || coalesce(p_codigo_empresa, '');
$$;

-- Usuario completo que no choque con OTRO usuario: si "cenjperez01" ya existe
-- (ej. otro jperez de otra tienda de la región), prueba "cenjperez201", "cenjperez301"...
create or replace function public.usuario_libre(p_base text, p_codigo_empresa text, p_codigo_tienda text, p_usuario_id bigint)
returns text
language plpgsql
set search_path = ''
as $$
declare
    v_n  integer := 1;
    v_id text := public.usuario_completo(p_base, p_codigo_empresa, p_codigo_tienda);
begin
    while exists (select 1 from public.usuarios where id_usuario = v_id and id <> p_usuario_id) loop
        v_n := v_n + 1;
        v_id := public.usuario_completo(p_base || v_n, p_codigo_empresa, p_codigo_tienda);
    end loop;
    return v_id;
end;
$$;

-- Cambia el ID de una empresa y renombra a sus usuarios (todo o nada)
create or replace function public.cambiar_codigo_empresa(p_empresa_id bigint, p_codigo text)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_viejo text;
    v_nuevo text := btrim(coalesce(p_codigo, ''));
    r       record;
begin
    select codigo into v_viejo from public.empresas where id = p_empresa_id for update;
    if not found then
        raise exception 'La empresa no existe.' using errcode = 'P0002';
    end if;
    if v_viejo = v_nuevo then
        return;
    end if;

    update public.empresas set codigo = v_nuevo where id = p_empresa_id;

    for r in select u.id, u.id_usuario, t.codigo as tienda
               from public.usuarios u
               left join public.tiendas t on t.id = u.tienda_id
              where u.empresa_id = p_empresa_id
                and u.id_usuario not in ('admin', 'desar') loop
        update public.usuarios
           set id_usuario = public.usuario_libre(public.usuario_base(r.id_usuario, v_viejo, r.tienda), v_nuevo, r.tienda, r.id)
         where id = r.id;
    end loop;
end;
$$;

-- Cambiar el código de una tienda. Sus usuarios solo se renombran si la tienda
-- cambia de REGIÓN (cenjperez01 -> norjperez01); con otro número en la misma región, no.
create or replace function public.cambiar_codigo_tienda(p_tienda_id bigint, p_nuevo_codigo text)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_codigo_viejo text;
    v_empresa      text;
    r              record;
begin
    select t.codigo, e.codigo into v_codigo_viejo, v_empresa
      from public.tiendas t
      left join public.empresas e on e.id = t.empresa_id
     where t.id = p_tienda_id
       for update of t;
    if not found then
        raise exception 'La tienda no existe.' using errcode = 'P0002';
    end if;
    if v_codigo_viejo = p_nuevo_codigo then
        return;
    end if;

    update public.tiendas
       set codigo = p_nuevo_codigo, region = left(p_nuevo_codigo, 3)
     where id = p_tienda_id;

    if left(v_codigo_viejo, 3) = left(p_nuevo_codigo, 3) then
        return;
    end if;
    for r in select u.id, u.id_usuario from public.usuarios u
              where u.tienda_id = p_tienda_id and u.id_usuario not in ('admin', 'desar') loop
        update public.usuarios
           set id_usuario = public.usuario_libre(public.usuario_base(r.id_usuario, v_empresa, v_codigo_viejo), v_empresa, p_nuevo_codigo, r.id)
         where id = r.id;
    end loop;
end;
$$;

-- Usuarios que ya existían: se renombran UNA sola vez (marca en configuracion)
--   cen-001-jperez -> cenjperez01 · jlopez -> jlopez01
do $$
declare
    r record;
begin
    if exists (select 1 from public.configuracion where clave = 'usuarios_con_empresa') then
        return;
    end if;
    for r in select u.id, u.id_usuario, t.codigo as tienda, e.codigo as empresa
               from public.usuarios u
               join public.empresas e on e.id = u.empresa_id
               left join public.tiendas t on t.id = u.tienda_id
              where u.id_usuario not in ('admin', 'desar')
              order by u.id loop
        update public.usuarios
           set id_usuario = public.usuario_libre(public.usuario_base(r.id_usuario, null, r.tienda), r.empresa, r.tienda, r.id)
         where id = r.id;
    end loop;
    insert into public.configuracion (clave, valor) values ('usuarios_con_empresa', 'true');
end;
$$;

grant execute on function public.usuario_libre(text, text, text, bigint) to anon;

-- ---------- Acceso desde la web (TEMPORAL, como las demás tablas) ----------
-- Empresas y regiones: leer, crear, modificar y eliminar (las regiones ahora se
-- administran en Tiendas -> Regiones)
do $$
declare
    t text;
begin
    foreach t in array array['empresas', 'regiones'] loop
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

-- Ruta de entrega del cliente: ahora también se modifica
grant update on public.clientes_tiendas to anon;
drop policy if exists "TEMPORAL - modificar clientes_tiendas" on public.clientes_tiendas;
create policy "TEMPORAL - modificar clientes_tiendas" on public.clientes_tiendas for update to anon using (true) with check (true);

grant execute on function public.cambiar_codigo_empresa(bigint, text) to anon;
grant execute on function public.cambiar_codigo_tienda(bigint, text) to anon;

notify pgrst, 'reload schema';

-- ==================================================
-- 17. USUARIOS DE TIENDA SIN EL NÚMERO DE LA TIENDA (2026-10-02)
--   Usuario de G3, Empleado y Piloto: REGIÓN + nombre + ID de la empresa
--   ("cenjperez01"), ya no la tienda ("cen001jperez01"). El usuario está
--   ligado a su empresa, tienda y región; si cambia de sucursal en la misma
--   región, o es multisucursal, su usuario no cambia.
--   Convierte a los que quedaron con la tienda (si ya se había ejecutado el
--   bloque 16 anterior). Si dos quedarían iguales (dos "jperez" de tiendas de
--   la misma región), al segundo se le agrega un número: "cenjperez201".
--   Las funciones (usuario_base, usuario_completo, usuario_libre,
--   cambiar_codigo_tienda) ya están en el bloque 16. Se puede repetir.
-- ==================================================

do $$
declare
    r     record;
    v_id  text;
begin
    for r in select u.id, u.id_usuario, t.codigo as tienda, e.codigo as empresa
               from public.usuarios u
               join public.empresas e on e.id = u.empresa_id
               join public.tiendas t on t.id = u.tienda_id
              where u.id_usuario not in ('admin', 'desar')
              order by u.id loop
        v_id := public.usuario_libre(public.usuario_base(r.id_usuario, r.empresa, r.tienda), r.empresa, r.tienda, r.id);
        if v_id <> r.id_usuario then
            update public.usuarios set id_usuario = v_id where id = r.id;
        end if;
    end loop;
end;
$$;

notify pgrst, 'reload schema';
