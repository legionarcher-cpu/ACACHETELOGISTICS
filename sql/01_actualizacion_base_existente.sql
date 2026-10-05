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
--  18. Actividad Transporte y palabras de cada actividad (Pedido -> Viaje,
--      Piloto -> Conductor).
--  19. Transporte: viajes con agenda, rol cliente, Casa y Trabajo, franjas de
--      precio, días cerrados, costos por vehículo y viaje de cortesía.
--  20. Seguridad: contraseñas cifradas, inicio de sesión dentro de la base y
--      solicitud de usuario del cliente (empresas con Transporte).
--  21. Paleta de colores de cada empresa interna (empresas.colores).
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

-- ==================================================
-- 18. ACTIVIDAD TRANSPORTE Y PALABRAS DE CADA ACTIVIDAD (2026-10-04)
--   Cada actividad puede llamar distinto al registro y al conductor
--   (vacío = "pedido" y "piloto"). Si TODAS las actividades de la empresa
--   usan la misma palabra, la página la muestra en todo el sistema
--   (js/palabras.js): una empresa solo de Transporte ve "Viajes" y
--   "Conductores"; al cambiar a otra empresa vuelve "Pedidos".
--   Se cambian en Configuración -> Actividades. Diseño: docs/14-transporte.md.
--   Agrega la actividad "transporte" si no existe (si ya se creó desde la
--   página, solo le pone las palabras que le falten). Se puede repetir.
-- ==================================================

alter table public.actividades
    add column if not exists palabra_registro    text, -- singular, ej. 'viaje'
    add column if not exists palabra_registros   text, -- plural,   ej. 'viajes'
    add column if not exists palabra_conductor   text, -- singular, ej. 'conductor'
    add column if not exists palabra_conductores text; -- plural,   ej. 'conductores'

insert into public.actividades (codigo, nombre, descripcion, icono, usa_recoleccion, orden)
select 'transporte', 'Transporte', 'Viajes de personas y mercadería de un punto A a un punto B.', 'bi-car-front', true,
       coalesce(max(orden), 0) + 1
  from public.actividades
on conflict (codigo) do nothing;

update public.actividades
   set palabra_registro    = coalesce(palabra_registro, 'viaje'),
       palabra_registros   = coalesce(palabra_registros, 'viajes'),
       palabra_conductor   = coalesce(palabra_conductor, 'conductor'),
       palabra_conductores = coalesce(palabra_conductores, 'conductores')
 where codigo = 'transporte';

notify pgrst, 'reload schema';

-- ==================================================
-- 19. TRANSPORTE: VIAJES, CLIENTES CON USUARIO, FRANJAS, COSTOS Y CORTESÍA (2026-10-04)
--   Diseño: docs/14-transporte.md. Lo usan js/viajes-comun.js, js/secciones/viajes.js
--   y js/secciones/configuracion/transporte.js.
--   - actividades.usa_viajes: la actividad trabaja con VIAJES (agenda, el cliente
--     solicita, conductor y vehículo automáticos). Transporte = sí.
--   - Rol "cliente": usuario ligado a un cliente (usuarios.cliente_id). Entra solo a
--     Inicio, Viajes y Mi perfil. Se crea en Clientes -> "Acceso y lugares".
--   - clientes: Casa y Trabajo (dirección y punto) para armar la ruta con un toque.
--   - vehiculos: asientos, carga, acepta mascotas y datos de costos; tipos auto y microbús.
--   - transporte_config: reglas por empresa (agenda, recargos, cortesía, combustible).
--   - transporte_franjas: precio por km según la hora de recogida (no se enciman).
--   - transporte_dias_cerrados, transporte_costos (gastos del mes por vehículo).
--   - viajes y cortesias. La página SOLO LEE estas dos tablas: reservar, cambiar la
--     hora, cancelar y avanzar el estado se hace con funciones de la base, que
--     revisan las reglas y evitan que dos clientes tomen la misma hora.
--   Se puede repetir.
-- ==================================================

-- ---------- Actividades: ¿trabaja con viajes? ----------
alter table public.actividades add column if not exists usa_viajes boolean not null default false;
update public.actividades set usa_viajes = true where codigo = 'transporte';

-- ---------- Vehículos: lo que necesita la agenda y los costos ----------
alter table public.vehiculos
    add column if not exists asientos        smallint,      -- pasajeros (sin contar al conductor)
    add column if not exists carga_kg        numeric(8,2),  -- carga máxima
    add column if not exists acepta_mascotas boolean not null default false,
    add column if not exists km_por_litro    numeric(6,2),  -- rendimiento (costo del combustible)
    add column if not exists horas_mes       numeric(6,1),  -- horas de trabajo estimadas al mes
    add column if not exists km_mes          numeric(8,1);  -- km estimados al mes
alter table public.vehiculos drop constraint if exists vehiculos_tipo_valido;
alter table public.vehiculos add constraint vehiculos_tipo_valido
    check (tipo is null or tipo in ('camion', 'pickup', 'panel', 'moto', 'auto', 'microbus'));
alter table public.vehiculos drop constraint if exists vehiculos_transporte_valido;
alter table public.vehiculos add constraint vehiculos_transporte_valido check (
    (asientos is null or asientos between 0 and 60) and (carga_kg is null or carga_kg >= 0)
    and (km_por_litro is null or km_por_litro > 0) and (horas_mes is null or horas_mes >= 0)
    and (km_mes is null or km_mes >= 0));

-- ---------- Clientes: Casa y Trabajo ----------
alter table public.clientes
    add column if not exists casa_direccion    text,
    add column if not exists casa_lat          numeric(9,6),
    add column if not exists casa_lng          numeric(9,6),
    add column if not exists trabajo_direccion text,
    add column if not exists trabajo_lat       numeric(9,6),
    add column if not exists trabajo_lng       numeric(9,6);

-- ---------- Usuarios: rol cliente ----------
alter table public.usuarios add column if not exists cliente_id bigint references public.clientes(id) on delete cascade;
create unique index if not exists usuarios_un_acceso_por_cliente on public.usuarios (cliente_id) where cliente_id is not null;

alter table public.usuarios drop constraint if exists usuarios_rol_valido;
alter table public.usuarios add constraint usuarios_rol_valido check (
    rol in ('desarrollador', 'administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado', 'piloto', 'cliente'));
alter table public.usuarios drop constraint if exists usuarios_tienda_segun_rol;
alter table public.usuarios add constraint usuarios_tienda_segun_rol check (
    (rol in ('desarrollador', 'administrador', 'admin_g1') and tienda_id is null and region is null)
    or (rol = 'admin_g2' and tienda_id is null and region is not null)
    or (rol in ('admin_g3', 'empleado', 'piloto') and tienda_id is not null and region is null)
    or (rol = 'cliente' and tienda_id is null and region is null and cliente_id is not null));
alter table public.usuarios drop constraint if exists usuarios_cliente_solo_cliente;
alter table public.usuarios add constraint usuarios_cliente_solo_cliente check (cliente_id is null or rol = 'cliente');

-- empresa_id del usuario: de su tienda, su región o (cliente) de su cliente
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
    elsif new.cliente_id is not null then
        select c.empresa_id into new.empresa_id from public.clientes c where c.id = new.cliente_id;
    end if;
    return new;
end;
$$;

drop trigger if exists usuarios_empresa on public.usuarios;
create trigger usuarios_empresa before insert or update of tienda_id, region, rol, cliente_id on public.usuarios
    for each row execute function public.empresa_de_usuario();

-- ---------- Reglas de transporte de cada empresa ----------
create table if not exists public.transporte_config (
    empresa_id           bigint primary key references public.empresas(id) on delete cascade,
    zona_horaria         text          not null default 'America/Costa_Rica',
    acercamiento_min     smallint      not null default 15,  -- llegar al punto A (antes de la hora)
    colchon_min          smallint      not null default 10,  -- después del viaje
    velocidad_kmh        numeric(5,1)  not null default 30,  -- si el mapa no da los minutos
    anticipacion_min     smallint      not null default 60,  -- reservar al menos N minutos antes
    anticipacion_dias    smallint      not null default 14,  -- reservar hasta N días después
    cancelar_horas       numeric(4,1)  not null default 2,   -- el cliente cancela o cambia hasta N horas antes
    pasajeros_incluidos  smallint      not null default 1,
    recargo_pasajero     numeric(10,2) not null default 0,   -- por persona arriba de las incluidas
    recargo_mercaderia   numeric(10,2) not null default 0,   -- por viaje
    recargo_mascota      numeric(10,2) not null default 0,   -- por mascota
    redondeo             numeric(10,2) not null default 100, -- el precio del viaje se redondea hacia arriba
    cortesia_activa      boolean       not null default true,
    cortesia_viajes      smallint      not null default 5,   -- viajes terminados...
    cortesia_dias        smallint      not null default 15,  -- ...dentro de estos días
    cortesia_vence_dias  smallint      not null default 30,
    cortesia_radio_km    numeric(5,1)  not null default 8,
    precio_litro         numeric(10,2) not null default 0,   -- combustible (costos)
    actualizado_en       timestamptz   not null default now(),

    constraint transporte_config_valida check (
        acercamiento_min between 0 and 240 and colchon_min between 0 and 240 and velocidad_kmh > 0
        and anticipacion_min between 0 and 10080 and anticipacion_dias between 0 and 90
        and cancelar_horas >= 0 and pasajeros_incluidos >= 0
        and recargo_pasajero >= 0 and recargo_mercaderia >= 0 and recargo_mascota >= 0 and redondeo >= 0
        and cortesia_viajes > 0 and cortesia_dias > 0 and cortesia_vence_dias > 0 and cortesia_radio_km >= 0
        and precio_litro >= 0)
);

-- Precio por km según la hora de recogida. dias: 1 = lunes ... 7 = domingo.
create table if not exists public.transporte_franjas (
    id          bigint generated always as identity primary key,
    empresa_id  bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    nombre      text,
    dias        smallint[] not null,
    desde       time not null,
    hasta       time not null,
    cargo_base  numeric(10,2) not null default 0,
    precio_km   numeric(10,2) not null default 0,
    minimo      numeric(10,2) not null default 0,
    activa      boolean not null default true,
    creado_en   timestamptz not null default now(),

    constraint franjas_horas_validas check (hasta > desde),
    constraint franjas_dias_validos  check (cardinality(dias) > 0 and dias <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
    constraint franjas_valores_validos check (cargo_base >= 0 and precio_km >= 0 and minimo >= 0)
);
create index if not exists transporte_franjas_empresa_idx on public.transporte_franjas (empresa_id);

-- Dos franjas activas no pueden cubrir la misma hora del mismo día
create or replace function public.franjas_sin_encimar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_otra record;
begin
    if not new.activa then
        return new;
    end if;
    select x.nombre, x.desde, x.hasta into v_otra
      from public.transporte_franjas x
     where x.empresa_id = new.empresa_id and x.activa and x.id is distinct from new.id
       and x.dias && new.dias and x.desde < new.hasta and x.hasta > new.desde
     limit 1;
    if found then
        raise exception 'Se encima con la franja % (%–%).', coalesce(v_otra.nombre, 'sin nombre'),
            to_char(v_otra.desde, 'HH24:MI'), to_char(v_otra.hasta, 'HH24:MI')
            using errcode = 'P0001', hint = 'franjas_encimadas';
    end if;
    return new;
end;
$$;

drop trigger if exists transporte_franjas_sin_encimar on public.transporte_franjas;
create trigger transporte_franjas_sin_encimar before insert or update on public.transporte_franjas
    for each row execute function public.franjas_sin_encimar();

create table if not exists public.transporte_dias_cerrados (
    empresa_id  bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    fecha       date not null,
    motivo      text,
    primary key (empresa_id, fecha)
);

-- Gastos del mes. vehiculo_id vacío = de toda la empresa (se reparte entre los vehículos)
create table if not exists public.transporte_costos (
    id           bigint generated always as identity primary key,
    empresa_id   bigint not null default public.empresa_principal() references public.empresas(id) on delete cascade,
    vehiculo_id  bigint references public.vehiculos(id) on delete cascade,
    concepto     text not null,
    tipo         text not null,
    monto_mes    numeric(12,2) not null,
    creado_en    timestamptz not null default now(),

    constraint costos_tipo_valido  check (tipo in ('fijo', 'variable')),
    constraint costos_monto_valido check (monto_mes >= 0)
);
create index if not exists transporte_costos_empresa_idx on public.transporte_costos (empresa_id);

-- ---------- Viajes ----------
create sequence if not exists public.viajes_codigo_seq;

create table if not exists public.viajes (
    id                      bigint generated always as identity primary key,
    codigo                  text unique,
    empresa_id              bigint not null references public.empresas(id) on delete restrict,
    cliente_id              bigint references public.clientes(id) on delete set null,
    cliente_nombre          text not null,
    cliente_telefono        text,
    solicitado_por          bigint references public.usuarios(id) on delete set null,

    origen_direccion        text not null,
    origen_lat              numeric(9,6) not null,
    origen_lng              numeric(9,6) not null,
    destino_direccion       text not null,
    destino_lat             numeric(9,6) not null,
    destino_lng             numeric(9,6) not null,
    km                      numeric(8,2) not null,
    minutos                 smallint not null,
    ruta_aproximada         boolean not null default false,

    personas                smallint not null default 1,
    mascotas                smallint not null default 0,
    mascotas_nota           text,
    lleva_mercaderia        boolean not null default false,
    mercaderia_descripcion  text,
    mercaderia_bultos       smallint,
    mercaderia_kg           numeric(8,2),

    inicio                  timestamptz not null,  -- hora de recogida en A
    bloque_inicio           timestamptz not null,  -- desde que el vehículo sale hacia A
    bloque_fin              timestamptz not null,  -- hasta que queda libre

    vehiculo_id             bigint references public.vehiculos(id) on delete set null,
    conductor_id            bigint references public.usuarios(id) on delete set null,
    franja_id               bigint references public.transporte_franjas(id) on delete set null,
    precio_viaje            numeric(10,2) not null default 0,
    recargos                numeric(10,2) not null default 0,
    total                   numeric(10,2) not null default 0,
    desglose                jsonb not null default '{}'::jsonb,

    es_cortesia             boolean not null default false,
    cortesia_id             bigint,   -- la cortesía que se usó en este viaje
    cortesia_ganada_id      bigint,   -- la cortesía que se ganó con este viaje (contó entre los 5)

    estado                  text not null default 'confirmado',
    notas                   text,
    motivo_cancelacion      text,
    cancelado_por           bigint references public.usuarios(id) on delete set null,
    cancelado_en            timestamptz,
    en_camino_en            timestamptz,
    iniciado_en             timestamptz,
    terminado_en            timestamptz,
    creado_en               timestamptz not null default now(),
    actualizado_en          timestamptz not null default now(),

    constraint viajes_estado_valido check (estado in ('confirmado', 'en_camino', 'en_curso', 'terminado', 'cancelado', 'no_se_presento')),
    constraint viajes_quienes_validos check (personas >= 0 and mascotas >= 0 and (personas > 0 or lleva_mercaderia)),
    constraint viajes_bloque_valido check (bloque_fin > bloque_inicio and km >= 0 and minutos >= 0),
    constraint viajes_montos_validos check (precio_viaje >= 0 and recargos >= 0 and total >= 0)
);
create index if not exists viajes_empresa_inicio_idx on public.viajes (empresa_id, inicio);
create index if not exists viajes_vehiculo_idx       on public.viajes (vehiculo_id, bloque_inicio);
create index if not exists viajes_cliente_idx        on public.viajes (cliente_id, estado);
create index if not exists viajes_conductor_idx      on public.viajes (conductor_id, inicio);

create table if not exists public.cortesias (
    id              bigint generated always as identity primary key,
    empresa_id      bigint not null references public.empresas(id) on delete cascade,
    cliente_id      bigint not null references public.clientes(id) on delete cascade,
    ganada_en       timestamptz not null default now(),
    vence_en        timestamptz not null,
    usada_viaje_id  bigint references public.viajes(id) on delete set null,
    usada_en        timestamptz
);
create index if not exists cortesias_cliente_idx on public.cortesias (cliente_id, vence_en);

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'viajes_cortesia_fk') then
        alter table public.viajes add constraint viajes_cortesia_fk
            foreign key (cortesia_id) references public.cortesias(id) on delete set null;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'viajes_cortesia_ganada_fk') then
        alter table public.viajes add constraint viajes_cortesia_ganada_fk
            foreign key (cortesia_ganada_id) references public.cortesias(id) on delete set null;
    end if;
end;
$$;

-- Código del viaje (V-000001) y fecha de modificación
create or replace function public.viajes_antes_de_guardar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' and new.codigo is null then
        new.codigo := 'V-' || lpad(nextval('public.viajes_codigo_seq')::text, 6, '0');
    end if;
    new.actualizado_en := now();
    return new;
end;
$$;

drop trigger if exists viajes_antes_de_guardar on public.viajes;
create trigger viajes_antes_de_guardar before insert or update on public.viajes
    for each row execute function public.viajes_antes_de_guardar();

-- ==================================================
-- FUNCIONES DE TRANSPORTE
-- ==================================================

-- Distancia en línea recta (km): nadie puede cobrar menos que esto
create or replace function public.km_recta(a_lat numeric, a_lng numeric, b_lat numeric, b_lng numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
    select (6371 * 2 * asin(sqrt(
        power(sin(radians((b_lat - a_lat)::float8) / 2), 2)
        + cos(radians(a_lat::float8)) * cos(radians(b_lat::float8)) * power(sin(radians((b_lng - a_lng)::float8) / 2), 2))))::numeric;
$$;

-- Reglas de la empresa (si no tiene, las crea con los valores de siempre)
create or replace function public.transporte_cfg(p_empresa bigint)
returns public.transporte_config
language plpgsql
security definer
set search_path = ''
as $$
declare
    v public.transporte_config;
begin
    select * into v from public.transporte_config where empresa_id = p_empresa;
    if not found then
        insert into public.transporte_config (empresa_id) values (p_empresa) on conflict (empresa_id) do nothing;
        select * into v from public.transporte_config where empresa_id = p_empresa;
    end if;
    return v;
end;
$$;

-- Franja de una hora de recogida (vacía si a esa hora no hay servicio)
create or replace function public.viaje_franja(p_empresa bigint, p_inicio timestamptz)
returns public.transporte_franjas
language plpgsql
stable
set search_path = ''
as $$
declare
    v_local timestamp;
    f       public.transporte_franjas;
begin
    v_local := p_inicio at time zone coalesce(
        (select zona_horaria from public.transporte_config where empresa_id = p_empresa), 'America/Costa_Rica');
    select * into f
      from public.transporte_franjas x
     where x.empresa_id = p_empresa and x.activa
       and extract(isodow from v_local)::smallint = any(x.dias)
       and x.desde <= v_local::time and v_local::time < x.hasta
     order by x.desde
     limit 1;
    return f;
end;
$$;

-- Precio del viaje (jsonb con el desglose) o null si a esa hora no hay franja:
--   viaje = máximo(mínimo, cargo base + km × precio por km), redondeado hacia arriba
--   recargos = pasajeros adicionales + mercadería + mascotas (montos fijos)
--   total = viaje (0 si es cortesía) + recargos
create or replace function public.viaje_precio(p_empresa bigint, p_inicio timestamptz, p_km numeric,
    p_personas integer, p_mascotas integer, p_mercaderia boolean, p_cortesia boolean default false)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
    c       public.transporte_config;
    f       public.transporte_franjas;
    v_viaje numeric;
    r_pas   numeric;
    r_merc  numeric;
    r_masc  numeric;
begin
    select * into c from public.transporte_config where empresa_id = p_empresa;
    f := public.viaje_franja(p_empresa, p_inicio);
    if f.id is null then
        return null;
    end if;
    v_viaje := greatest(f.minimo, f.cargo_base + coalesce(p_km, 0) * f.precio_km);
    if coalesce(c.redondeo, 0) > 0 then
        v_viaje := ceil(v_viaje / c.redondeo) * c.redondeo;
    end if;
    r_pas  := greatest(0, coalesce(p_personas, 0) - coalesce(c.pasajeros_incluidos, 1)) * coalesce(c.recargo_pasajero, 0);
    r_merc := case when p_mercaderia then coalesce(c.recargo_mercaderia, 0) else 0 end;
    r_masc := coalesce(p_mascotas, 0) * coalesce(c.recargo_mascota, 0);
    return jsonb_build_object(
        'franja_id', f.id,
        'franja', coalesce(f.nombre, to_char(f.desde, 'HH24:MI') || '–' || to_char(f.hasta, 'HH24:MI')),
        'precio_km', f.precio_km, 'cargo_base', f.cargo_base, 'minimo', f.minimo, 'km', p_km,
        'viaje', v_viaje, 'cortesia', coalesce(p_cortesia, false),
        'recargo_pasajeros', r_pas, 'recargo_mercaderia', r_merc, 'recargo_mascotas', r_masc,
        'recargos', r_pas + r_merc + r_masc,
        'total', (case when p_cortesia then 0 else v_viaje end) + r_pas + r_merc + r_masc);
end;
$$;

-- Bloque que ocupa el vehículo: sale hacia A "acercamiento" minutos antes, hace el
-- viaje y suma el colchón; redondeado hacia arriba a 15 minutos.
create or replace function public.viaje_bloque(p_empresa bigint, p_inicio timestamptz, p_minutos integer,
    out bloque_inicio timestamptz, out bloque_fin timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
    v_acerca integer;
    v_colchon integer;
begin
    select coalesce(acercamiento_min, 15), coalesce(colchon_min, 10) into v_acerca, v_colchon
      from public.transporte_config where empresa_id = p_empresa;
    v_acerca := coalesce(v_acerca, 15);
    v_colchon := coalesce(v_colchon, 10);
    bloque_inicio := p_inicio - make_interval(mins => v_acerca);
    bloque_fin := bloque_inicio + make_interval(mins => (ceil((v_acerca + greatest(coalesce(p_minutos, 1), 1) + v_colchon) / 15.0) * 15)::integer);
end;
$$;

-- Vehículo libre para un bloque: activo, con conductor, con asientos y carga
-- suficientes, que acepte mascotas si hacen falta y sin otro viaje que choque.
-- Prefiere p_preferido (al cambiar la hora) y si no, el de menos viajes ese día.
create or replace function public.viaje_vehiculo_libre(p_empresa bigint, p_desde timestamptz, p_hasta timestamptz,
    p_personas integer, p_kg numeric, p_mascotas integer, p_excluir bigint default null, p_preferido bigint default null,
    out vehiculo_id bigint, out conductor_id bigint)
language plpgsql
stable
set search_path = ''
as $$
begin
    select v.id, u.id into vehiculo_id, conductor_id
      from public.vehiculos v
      join lateral (select x.id from public.usuarios x
                     where x.vehiculo_id = v.id and x.rol = 'piloto' and x.aprobado
                     order by x.id limit 1) u on true
     where v.empresa_id = p_empresa
       and v.estado <> 'mantenimiento'
       and coalesce(v.asientos, 0) >= coalesce(p_personas, 0)
       and (coalesce(p_kg, 0) <= 0 or coalesce(v.carga_kg, 0) >= p_kg)
       and (coalesce(p_mascotas, 0) = 0 or v.acepta_mascotas)
       and not exists (
           select 1 from public.viajes o
            where o.vehiculo_id = v.id
              and o.estado not in ('cancelado', 'no_se_presento')
              and (p_excluir is null or o.id <> p_excluir)
              and o.bloque_inicio < p_hasta
              and (case when o.estado = 'terminado' and o.terminado_en is not null
                        then least(o.bloque_fin, o.terminado_en) else o.bloque_fin end) > p_desde)
     order by (v.id = p_preferido) desc nulls last,
              (select count(*) from public.viajes d
                where d.vehiculo_id = v.id and d.estado not in ('cancelado', 'no_se_presento')
                  and d.inicio >= p_desde - interval '12 hours' and d.inicio < p_desde + interval '12 hours'),
              v.id
     limit 1;
end;
$$;

-- ¿Se puede reservar a esa hora? (lanza el error con el motivo)
create or replace function public.viaje_validar_inicio(p_empresa bigint, p_inicio timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    c       public.transporte_config;
    v_local timestamp;
begin
    c := public.transporte_cfg(p_empresa);
    v_local := p_inicio at time zone c.zona_horaria;
    if p_inicio < now() + make_interval(mins => c.anticipacion_min) then
        raise exception 'Reserva con al menos % minutos de anticipación.', c.anticipacion_min using errcode = 'P0001';
    end if;
    if v_local::date > (now() at time zone c.zona_horaria)::date + c.anticipacion_dias then
        raise exception 'Solo se puede reservar hasta % días después de hoy.', c.anticipacion_dias using errcode = 'P0001';
    end if;
    if exists (select 1 from public.transporte_dias_cerrados d where d.empresa_id = p_empresa and d.fecha = v_local::date) then
        raise exception 'Ese día no hay servicio.' using errcode = 'P0001';
    end if;
    if (public.viaje_franja(p_empresa, p_inicio)).id is null then
        raise exception 'A esa hora no hay servicio: elige una hora de la lista.' using errcode = 'P0001';
    end if;
    if extract(minute from v_local)::integer % 15 <> 0 then
        raise exception 'Elige una hora de la lista (cada 15 minutos).' using errcode = 'P0001';
    end if;
end;
$$;

-- Horas de un día: cada 15 minutos dentro de las franjas, si hay vehículo libre
-- y cuánto cuesta. Si el día no se puede, una sola fila con el motivo.
create or replace function public.viajes_horas_disponibles(p_empresa bigint, p_fecha date, p_km numeric, p_minutos integer,
    p_personas integer, p_mascotas integer, p_mercaderia boolean, p_kg numeric, p_excluir bigint default null)
returns table (inicio timestamptz, hora text, disponible boolean, franja text, total numeric, motivo text)
language plpgsql
security definer
set search_path = ''
as $$
declare
    c        public.transporte_config;
    v_hoy    date;
    v_motivo text;
    v_min    integer;
    v_ini    timestamptz;
    v_precio jsonb;
    f        record;
    t        timestamp;
    b        record;
    vl       record;
begin
    c := public.transporte_cfg(p_empresa);
    v_hoy := (now() at time zone c.zona_horaria)::date;
    if p_fecha < v_hoy or p_fecha > v_hoy + c.anticipacion_dias then
        return query select null::timestamptz, null::text, false, null::text, null::numeric,
            format('Solo se puede reservar desde hoy hasta %s días después.', c.anticipacion_dias);
        return;
    end if;
    select coalesce(d.motivo, '') into v_motivo from public.transporte_dias_cerrados d
     where d.empresa_id = p_empresa and d.fecha = p_fecha;
    if found then
        return query select null::timestamptz, null::text, false, null::text, null::numeric,
            'Ese día no hay servicio' || case when v_motivo <> '' then ': ' || v_motivo else '.' end;
        return;
    end if;
    v_min := coalesce(p_minutos, ceil(coalesce(p_km, 0) / greatest(c.velocidad_kmh, 1) * 60)::integer);
    for f in select x.* from public.transporte_franjas x
              where x.empresa_id = p_empresa and x.activa and extract(isodow from p_fecha)::smallint = any(x.dias)
              order by x.desde loop
        for t in select g from generate_series(p_fecha + f.desde, p_fecha + f.hasta - interval '1 minute', interval '15 minutes') g loop
            v_ini := t at time zone c.zona_horaria;
            continue when v_ini < now() + make_interval(mins => c.anticipacion_min);
            select * into b from public.viaje_bloque(p_empresa, v_ini, v_min);
            select * into vl from public.viaje_vehiculo_libre(p_empresa, b.bloque_inicio, b.bloque_fin,
                p_personas, p_kg, p_mascotas, p_excluir);
            v_precio := public.viaje_precio(p_empresa, v_ini, p_km, p_personas, p_mascotas, p_mercaderia, false);
            return query select v_ini, to_char(t, 'HH24:MI'), vl.vehiculo_id is not null,
                coalesce(f.nombre, to_char(f.desde, 'HH24:MI') || '–' || to_char(f.hasta, 'HH24:MI')),
                (v_precio ->> 'total')::numeric,
                case when vl.vehiculo_id is null then 'Ocupado' end;
        end loop;
    end loop;
end;
$$;

-- Viaje con su vehículo y su conductor (lo que devuelven las funciones)
create or replace function public.viaje_json(p_viaje bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select to_jsonb(v) || jsonb_build_object(
        'vehiculo', (select jsonb_build_object('placa', x.placa, 'marca', x.marca, 'tipo', x.tipo) from public.vehiculos x where x.id = v.vehiculo_id),
        'conductor', (select jsonb_build_object('nombre', u.nombre, 'telefono', u.telefono) from public.usuarios u where u.id = v.conductor_id))
      from public.viajes v where v.id = p_viaje;
$$;

-- Aviso para un usuario (si hay a quién)
create or replace function public.viaje_avisar(p_usuario bigint, p_titulo text, p_mensaje text, p_viaje bigint)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, enlace, referencia_tipo, referencia_id)
    select p_usuario, 'info', p_titulo, p_mensaje, '#viajes?id=' || p_viaje, 'viaje', p_viaje
     where p_usuario is not null;
$$;

-- Usuario que hace la acción: { id, rol, empresa_id, cliente_id, nombre }
create or replace function public.viaje_usuario(p_usuario bigint)
returns public.usuarios
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    u public.usuarios;
begin
    select * into u from public.usuarios where id = p_usuario;
    if not found or u.aprobado = false then
        raise exception 'Usuario no válido: vuelve a iniciar sesión.' using errcode = 'P0001';
    end if;
    return u;
end;
$$;

-- ---------- Reservar ----------
-- p: { usuario_id, empresa_id (solo Desarrollador), cliente_id (personal; el cliente es él mismo),
--      origen: { direccion, lat, lng }, destino: {...}, km, minutos, aproximada,
--      personas, mascotas, mascotas_nota, lleva_mercaderia, mercaderia_descripcion,
--      mercaderia_bultos, mercaderia_kg, inicio, notas }
create or replace function public.viajes_solicitar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u          public.usuarios;
    c          public.transporte_config;
    v_empresa  bigint;
    v_cliente  record;
    v_inicio   timestamptz;
    v_km       numeric;
    v_min      integer;
    v_personas integer;
    v_mascotas integer;
    v_merc     boolean;
    v_kg       numeric;
    v_cort     bigint;
    v_precio   jsonb;
    v_viaje    public.viajes;
    b          record;
    vl         record;
begin
    u := public.viaje_usuario((p ->> 'usuario_id')::bigint);
    if u.rol not in ('cliente', 'administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado', 'desarrollador') then
        raise exception 'Tu usuario no puede solicitar viajes.' using errcode = 'P0001';
    end if;
    v_empresa := case when u.rol = 'desarrollador' then (p ->> 'empresa_id')::bigint else u.empresa_id end;
    select id, nombre, apellidos, telefono, empresa_id into v_cliente from public.clientes
     where id = case when u.rol = 'cliente' then u.cliente_id else (p ->> 'cliente_id')::bigint end;
    if v_cliente.id is null or v_cliente.empresa_id is distinct from v_empresa then
        raise exception 'Elige el cliente del viaje.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.empresas e join public.actividades a on a.codigo = any(e.actividades)
                    where e.id = v_empresa and a.usa_viajes and a.activa) then
        raise exception 'La empresa no tiene una actividad de viajes activa.' using errcode = 'P0001';
    end if;

    v_personas := (p ->> 'personas')::integer;
    v_mascotas := (p ->> 'mascotas')::integer;
    v_merc := coalesce((p ->> 'lleva_mercaderia')::boolean, false);
    v_kg := coalesce((p ->> 'mercaderia_kg')::numeric, 0);
    if v_personas is null or v_personas < 0 then
        raise exception 'Indica cuántas personas viajan.' using errcode = 'P0001';
    end if;
    if v_mascotas is null or v_mascotas < 0 then
        raise exception 'Indica si lleva mascotas.' using errcode = 'P0001';
    end if;
    if v_personas = 0 and not v_merc then
        raise exception 'Si no viaja nadie, el viaje debe llevar mercadería.' using errcode = 'P0001';
    end if;
    if (p #>> '{origen,lat}') is null or (p #>> '{origen,lng}') is null
       or (p #>> '{destino,lat}') is null or (p #>> '{destino,lng}') is null then
        raise exception 'Ubica el punto A y el punto B en el mapa.' using errcode = 'P0001';
    end if;
    v_inicio := (p ->> 'inicio')::timestamptz;
    if v_inicio is null then
        raise exception 'Elige el día y la hora.' using errcode = 'P0001';
    end if;

    -- Una reserva a la vez por empresa: dos clientes no toman la misma hora
    perform pg_advisory_xact_lock(7301, v_empresa::integer);
    c := public.transporte_cfg(v_empresa);
    perform public.viaje_validar_inicio(v_empresa, v_inicio);

    v_km := round(greatest(coalesce((p ->> 'km')::numeric, 0),
        public.km_recta((p #>> '{origen,lat}')::numeric, (p #>> '{origen,lng}')::numeric,
                        (p #>> '{destino,lat}')::numeric, (p #>> '{destino,lng}')::numeric)), 2);
    v_min := coalesce((p ->> 'minutos')::integer, ceil(v_km / greatest(c.velocidad_kmh, 1) * 60)::integer);
    select * into b from public.viaje_bloque(v_empresa, v_inicio, v_min);
    select * into vl from public.viaje_vehiculo_libre(v_empresa, b.bloque_inicio, b.bloque_fin, v_personas, v_kg, v_mascotas);
    if vl.vehiculo_id is null then
        raise exception 'Esa hora acaba de ocuparse: elige otra.' using errcode = 'P0001', hint = 'ocupado';
    end if;

    -- Cortesía: la que vence primero, si el viaje está dentro del radio
    if c.cortesia_activa and v_km <= c.cortesia_radio_km then
        select id into v_cort from public.cortesias
         where cliente_id = v_cliente.id and empresa_id = v_empresa and usada_viaje_id is null and vence_en > now()
         order by vence_en limit 1
           for update;
    end if;
    v_precio := public.viaje_precio(v_empresa, v_inicio, v_km, v_personas, v_mascotas, v_merc, v_cort is not null);

    insert into public.viajes (
        empresa_id, cliente_id, cliente_nombre, cliente_telefono, solicitado_por,
        origen_direccion, origen_lat, origen_lng, destino_direccion, destino_lat, destino_lng,
        km, minutos, ruta_aproximada, personas, mascotas, mascotas_nota,
        lleva_mercaderia, mercaderia_descripcion, mercaderia_bultos, mercaderia_kg,
        inicio, bloque_inicio, bloque_fin, vehiculo_id, conductor_id, franja_id,
        precio_viaje, recargos, total, desglose, es_cortesia, cortesia_id, notas)
    values (
        v_empresa, v_cliente.id, btrim(v_cliente.nombre || ' ' || coalesce(v_cliente.apellidos, '')), v_cliente.telefono, u.id,
        coalesce(nullif(btrim(p #>> '{origen,direccion}'), ''), 'Punto A'), (p #>> '{origen,lat}')::numeric, (p #>> '{origen,lng}')::numeric,
        coalesce(nullif(btrim(p #>> '{destino,direccion}'), ''), 'Punto B'), (p #>> '{destino,lat}')::numeric, (p #>> '{destino,lng}')::numeric,
        v_km, v_min, coalesce((p ->> 'aproximada')::boolean, false), v_personas, v_mascotas, nullif(btrim(p ->> 'mascotas_nota'), ''),
        v_merc, case when v_merc then nullif(btrim(p ->> 'mercaderia_descripcion'), '') end,
        case when v_merc then (p ->> 'mercaderia_bultos')::smallint end, case when v_merc then nullif(v_kg, 0) end,
        v_inicio, b.bloque_inicio, b.bloque_fin, vl.vehiculo_id, vl.conductor_id, (v_precio ->> 'franja_id')::bigint,
        (v_precio ->> 'viaje')::numeric, (v_precio ->> 'recargos')::numeric, (v_precio ->> 'total')::numeric, v_precio,
        v_cort is not null, v_cort, nullif(btrim(p ->> 'notas'), ''))
    returning * into v_viaje;

    if v_cort is not null then
        update public.cortesias set usada_viaje_id = v_viaje.id, usada_en = now() where id = v_cort;
    end if;
    perform public.viaje_avisar(vl.conductor_id, 'Viaje nuevo ' || v_viaje.codigo,
        format('%s · %s · %s → %s', to_char(v_inicio at time zone c.zona_horaria, 'DD/MM HH24:MI'),
               v_viaje.cliente_nombre, v_viaje.origen_direccion, v_viaje.destino_direccion), v_viaje.id);
    return public.viaje_json(v_viaje.id);
end;
$$;

-- ¿Puede esta persona cambiar o cancelar el viaje? (lanza el error si no)
create or replace function public.viaje_permiso(u public.usuarios, v public.viajes, c public.transporte_config)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
    if u.rol = 'cliente' then
        if v.cliente_id is distinct from u.cliente_id then
            raise exception 'Ese viaje no es tuyo.' using errcode = 'P0001';
        end if;
        if v.estado <> 'confirmado' then
            raise exception 'El viaje ya empezó: llama a la empresa.' using errcode = 'P0001';
        end if;
        if now() > v.inicio - make_interval(secs => (c.cancelar_horas * 3600)::integer) then
            raise exception 'Solo se puede cambiar o cancelar hasta % horas antes. Llama a la empresa.', c.cancelar_horas
                using errcode = 'P0001';
        end if;
    elsif u.rol in ('administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado') then
        if u.empresa_id is distinct from v.empresa_id then
            raise exception 'Ese viaje es de otra empresa.' using errcode = 'P0001';
        end if;
        if v.estado not in ('confirmado', 'en_camino') then
            raise exception 'Ese viaje ya no se puede cambiar.' using errcode = 'P0001';
        end if;
    elsif u.rol = 'desarrollador' then
        if v.estado not in ('confirmado', 'en_camino') then
            raise exception 'Ese viaje ya no se puede cambiar.' using errcode = 'P0001';
        end if;
    else
        raise exception 'Tu usuario no puede cambiar viajes.' using errcode = 'P0001';
    end if;
end;
$$;

-- ---------- Cancelar ----------
create or replace function public.viajes_cancelar(p_viaje bigint, p_usuario bigint, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u public.usuarios;
    v public.viajes;
    c public.transporte_config;
begin
    u := public.viaje_usuario(p_usuario);
    select * into v from public.viajes where id = p_viaje for update;
    if not found then
        raise exception 'El viaje no existe.' using errcode = 'P0001';
    end if;
    c := public.transporte_cfg(v.empresa_id);
    perform public.viaje_permiso(u, v, c);

    update public.viajes
       set estado = 'cancelado', cancelado_por = u.id, cancelado_en = now(),
           motivo_cancelacion = nullif(btrim(coalesce(p_motivo, '')), '')
     where id = v.id;
    -- La cortesía vuelve si todavía no venció
    if v.es_cortesia and v.cortesia_id is not null then
        update public.cortesias set usada_viaje_id = null, usada_en = null
         where id = v.cortesia_id and vence_en > now();
    end if;
    perform public.viaje_avisar(v.conductor_id, 'Viaje cancelado ' || v.codigo,
        format('%s · %s', to_char(v.inicio at time zone c.zona_horaria, 'DD/MM HH24:MI'), v.cliente_nombre), v.id);
    return public.viaje_json(v.id);
end;
$$;

-- ---------- Cambiar la hora (todo o nada) ----------
create or replace function public.viajes_cambiar_hora(p_viaje bigint, p_usuario bigint, p_inicio timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u        public.usuarios;
    v        public.viajes;
    c        public.transporte_config;
    b        record;
    vl       record;
    v_precio jsonb;
begin
    u := public.viaje_usuario(p_usuario);
    select * into v from public.viajes where id = p_viaje for update;
    if not found then
        raise exception 'El viaje no existe.' using errcode = 'P0001';
    end if;
    c := public.transporte_cfg(v.empresa_id);
    perform public.viaje_permiso(u, v, c);
    perform pg_advisory_xact_lock(7301, v.empresa_id::integer);
    perform public.viaje_validar_inicio(v.empresa_id, p_inicio);

    select * into b from public.viaje_bloque(v.empresa_id, p_inicio, v.minutos);
    select * into vl from public.viaje_vehiculo_libre(v.empresa_id, b.bloque_inicio, b.bloque_fin,
        v.personas, coalesce(v.mercaderia_kg, 0), v.mascotas, v.id, v.vehiculo_id);
    if vl.vehiculo_id is null then
        raise exception 'Esa hora no está disponible: elige otra. Tu viaje sigue como estaba.' using errcode = 'P0001', hint = 'ocupado';
    end if;
    v_precio := public.viaje_precio(v.empresa_id, p_inicio, v.km, v.personas, v.mascotas, v.lleva_mercaderia, v.es_cortesia);

    update public.viajes
       set inicio = p_inicio, bloque_inicio = b.bloque_inicio, bloque_fin = b.bloque_fin,
           vehiculo_id = vl.vehiculo_id, conductor_id = vl.conductor_id, franja_id = (v_precio ->> 'franja_id')::bigint,
           precio_viaje = (v_precio ->> 'viaje')::numeric, recargos = (v_precio ->> 'recargos')::numeric,
           total = (v_precio ->> 'total')::numeric, desglose = v_precio, estado = 'confirmado', en_camino_en = null
     where id = v.id;
    if v.conductor_id is distinct from vl.conductor_id then
        perform public.viaje_avisar(v.conductor_id, 'Viaje reasignado ' || v.codigo, 'Ya no te toca este viaje.', v.id);
    end if;
    perform public.viaje_avisar(vl.conductor_id, 'Viaje con hora nueva ' || v.codigo,
        format('%s · %s', to_char(p_inicio at time zone c.zona_horaria, 'DD/MM HH24:MI'), v.cliente_nombre), v.id);
    return public.viaje_json(v.id);
end;
$$;

-- ---------- Cortesía: ¿ya juntó los viajes? ----------
create or replace function public.cortesia_revisar(p_empresa bigint, p_cliente bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    c     public.transporte_config;
    v_ids bigint[];
    v_id  bigint;
begin
    c := public.transporte_cfg(p_empresa);
    if not c.cortesia_activa or p_cliente is null then
        return;
    end if;
    select array_agg(id order by terminado_en) into v_ids
      from (select id, terminado_en from public.viajes
             where empresa_id = p_empresa and cliente_id = p_cliente and estado = 'terminado'
               and not es_cortesia and cortesia_ganada_id is null
               and terminado_en >= now() - make_interval(days => c.cortesia_dias)
             order by terminado_en
             limit c.cortesia_viajes) x;
    if coalesce(cardinality(v_ids), 0) < c.cortesia_viajes then
        return;
    end if;
    insert into public.cortesias (empresa_id, cliente_id, vence_en)
    values (p_empresa, p_cliente, now() + make_interval(days => c.cortesia_vence_dias))
    returning id into v_id;
    update public.viajes set cortesia_ganada_id = v_id where id = any(v_ids);
    perform public.viaje_avisar(u.id, '¡Ganaste un viaje de cortesía!',
        format('Se aplica solo en tu próximo viaje de hasta %s km. Vence el %s.', c.cortesia_radio_km,
               to_char(now() at time zone c.zona_horaria + make_interval(days => c.cortesia_vence_dias), 'DD/MM/YYYY')), v_ids[1])
      from public.usuarios u where u.cliente_id = p_cliente;
end;
$$;

-- ---------- Avanzar el estado (conductor o personal) ----------
--   confirmado -> en_camino -> en_curso -> terminado | confirmado / en_camino -> no_se_presento
create or replace function public.viajes_avanzar(p_viaje bigint, p_usuario bigint, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    u public.usuarios;
    v public.viajes;
    c public.transporte_config;
begin
    u := public.viaje_usuario(p_usuario);
    select * into v from public.viajes where id = p_viaje for update;
    if not found then
        raise exception 'El viaje no existe.' using errcode = 'P0001';
    end if;
    if not (u.rol = 'desarrollador'
            or (u.rol = 'piloto' and v.conductor_id = u.id)
            or (u.rol in ('administrador', 'admin_g1', 'admin_g2', 'admin_g3', 'empleado') and u.empresa_id = v.empresa_id)) then
        raise exception 'Este viaje no es tuyo.' using errcode = 'P0001';
    end if;
    if not ((p_estado = 'en_camino' and v.estado = 'confirmado')
            or (p_estado = 'en_curso' and v.estado in ('confirmado', 'en_camino'))
            or (p_estado = 'terminado' and v.estado in ('en_camino', 'en_curso'))
            or (p_estado = 'no_se_presento' and v.estado in ('confirmado', 'en_camino'))) then
        raise exception 'El viaje está "%": no puede pasar a "%".', v.estado, p_estado using errcode = 'P0001';
    end if;
    c := public.transporte_cfg(v.empresa_id);

    update public.viajes
       set estado = p_estado,
           en_camino_en = case when p_estado = 'en_camino' then now() else en_camino_en end,
           iniciado_en  = case when p_estado = 'en_curso' then now() else iniciado_en end,
           terminado_en = case when p_estado = 'terminado' then now() else terminado_en end
     where id = v.id;

    if p_estado = 'en_camino' then
        perform public.viaje_avisar(x.id, 'Tu conductor va en camino',
            format('%s · llega a %s cerca de las %s', v.codigo, v.origen_direccion,
                   to_char(v.inicio at time zone c.zona_horaria, 'HH24:MI')), v.id)
          from public.usuarios x where x.cliente_id = v.cliente_id;
    elsif p_estado = 'terminado' then
        perform public.cortesia_revisar(v.empresa_id, v.cliente_id);
    end if;
    return public.viaje_json(v.id);
end;
$$;

-- ---------- Cortesía del cliente (Inicio y Viajes) ----------
create or replace function public.viajes_estado_cliente(p_cliente bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_empresa bigint;
    c         public.transporte_config;
    v_n       integer;
    v_primero timestamptz;
begin
    select empresa_id into v_empresa from public.clientes where id = p_cliente;
    if v_empresa is null then
        return null;
    end if;
    c := public.transporte_cfg(v_empresa);
    select count(*), min(terminado_en) into v_n, v_primero from public.viajes
     where empresa_id = v_empresa and cliente_id = p_cliente and estado = 'terminado'
       and not es_cortesia and cortesia_ganada_id is null
       and terminado_en >= now() - make_interval(days => c.cortesia_dias);
    return jsonb_build_object(
        'activa', c.cortesia_activa, 'necesarios', c.cortesia_viajes, 'dias', c.cortesia_dias,
        'radio_km', c.cortesia_radio_km, 'cancelar_horas', c.cancelar_horas,
        'contados', least(v_n, c.cortesia_viajes),
        'cuenta_hasta', v_primero + make_interval(days => c.cortesia_dias),
        'cortesias', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'vence_en', vence_en) order by vence_en)
                                 from public.cortesias
                                where cliente_id = p_cliente and usada_viaje_id is null and vence_en > now()), '[]'::jsonb));
end;
$$;

-- ---------- Acceso desde la web (TEMPORAL, como las demás tablas) ----------
-- Configuración de transporte: leer, crear, modificar y eliminar
do $$
declare
    t text;
begin
    foreach t in array array['transporte_config', 'transporte_franjas', 'transporte_dias_cerrados', 'transporte_costos'] loop
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
    -- Viajes y cortesías: la página SOLO LEE (todo cambio pasa por las funciones de arriba)
    foreach t in array array['viajes', 'cortesias'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('revoke insert, update, delete on public.%I from anon', t);
        execute format('grant select on public.%I to anon', t);
        execute format('drop policy if exists "TEMPORAL - leer %1$s" on public.%1$I', t);
        execute format('create policy "TEMPORAL - leer %1$s" on public.%1$I for select to anon using (true)', t);
    end loop;
end;
$$;

grant execute on function public.viajes_horas_disponibles(bigint, date, numeric, integer, integer, integer, boolean, numeric, bigint) to anon;
grant execute on function public.viajes_solicitar(jsonb) to anon;
grant execute on function public.viajes_cancelar(bigint, bigint, text) to anon;
grant execute on function public.viajes_cambiar_hora(bigint, bigint, timestamptz) to anon;
grant execute on function public.viajes_avanzar(bigint, bigint, text) to anon;
grant execute on function public.viajes_estado_cliente(bigint) to anon;
grant execute on function public.viaje_precio(bigint, timestamptz, numeric, integer, integer, boolean, boolean) to anon;
-- Las funciones internas no se llaman desde la página
revoke execute on function public.transporte_cfg(bigint) from anon, public;
revoke execute on function public.viaje_validar_inicio(bigint, timestamptz) from anon, public;
revoke execute on function public.viaje_avisar(bigint, text, text, bigint) from anon, public;
revoke execute on function public.viaje_usuario(bigint) from anon, public;
revoke execute on function public.cortesia_revisar(bigint, bigint) from anon, public;
revoke execute on function public.viaje_json(bigint) from anon, public;

notify pgrst, 'reload schema';


-- ==================================================
-- 20. SEGURIDAD: CONTRASEÑAS CIFRADAS Y SOLICITUD DE USUARIO DEL CLIENTE
--   Lo usan js/secciones/loggin.js (iniciar sesión y "Solicita tu usuario") y
--   js/secciones/clientes.js (aprobar la solicitud). Ver docs/secciones/viajes.md.
--   - Las contraseñas se guardan CIFRADAS (bcrypt). Las que ya existían se
--     cifran aquí; los usuarios siguen entrando con la misma contraseña.
--   - iniciar_sesion(usuario, clave): compara la clave dentro de la base. La
--     página ya no puede leer la columna clave.
--   - El cliente de una empresa con Transporte pide su usuario desde el enlace
--     index.html#registro?empresa=02. Queda PENDIENTE (cliente y usuario sin
--     aprobar) y se avisa al Administrador y al G1 de esa empresa.
--   ⚠ Después de este bloque, si se agrega una columna a usuarios, ejecutar
--     select public.usuarios_ocultar_clave();  (si no, la página no la puede leer)
--   Se puede repetir.
-- ==================================================
-- ---------- Contraseñas cifradas (bcrypt, extensión pgcrypto) ----------
create extension if not exists pgcrypto with schema extensions;

-- ¿Ya está cifrada? ($2a$10$..., $2b$..., formato bcrypt)
create or replace function public.clave_cifrada(p_clave text)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select coalesce(p_clave ~ '^[$]2[abxy][$][0-9]{2}[$]', false);
$$;

-- La base cifra la clave sola al crear el usuario o al cambiarle la clave
-- (Usuarios, Clientes -> "Acceso y lugares", solicitud del cliente)
create or replace function public.cifrar_clave()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.clave is not null and not public.clave_cifrada(new.clave) then
        new.clave := extensions.crypt(new.clave, extensions.gen_salt('bf', 10));
    end if;
    return new;
end;
$$;

drop trigger if exists usuarios_cifrar_clave on public.usuarios;
create trigger usuarios_cifrar_clave before insert or update of clave on public.usuarios
    for each row execute function public.cifrar_clave();

-- Las claves que ya existían se cifran (las ya cifradas no se tocan). Los
-- usuarios siguen entrando con la misma contraseña.
update public.usuarios set clave = clave where not public.clave_cifrada(clave);

-- Iniciar sesión: la clave se compara DENTRO de la base. Devuelve el id del
-- usuario o null (sin decir si falló el usuario o la clave).
create or replace function public.iniciar_sesion(p_usuario text, p_clave text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_id    bigint;
    v_clave text;
begin
    select u.id, u.clave into v_id, v_clave
      from public.usuarios u
     where u.id_usuario = lower(btrim(coalesce(p_usuario, '')));
    if v_id is not null and public.clave_cifrada(v_clave)
       and v_clave = extensions.crypt(coalesce(p_clave, ''), v_clave) then
        return v_id;
    end if;
    perform pg_sleep(0.4); -- frena a quien prueba claves al azar
    return null;
end;
$$;

-- La página ya no puede LEER la columna clave (ni cifrada): se le da permiso
-- de lectura a todas las demás columnas de usuarios. Crear y cambiar la clave
-- sigue igual. ⚠ Si se agrega una columna a usuarios, volver a ejecutar:
--   select public.usuarios_ocultar_clave();
create or replace function public.usuarios_ocultar_clave()
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_columnas text;
begin
    select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position) into v_columnas
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = 'usuarios' and c.column_name <> 'clave';
    execute 'revoke select on public.usuarios from anon';
    execute format('grant select (%s) on public.usuarios to anon', v_columnas);
end;
$$;

select public.usuarios_ocultar_clave();

-- ---------- El cliente solicita su usuario (empresas con Transporte) ----------
-- Enlace: index.html#registro?empresa=02 (o el botón del login si la marca tiene
-- "registroClientes" en empresas/empresas.js).

-- ¿Esa empresa recibe solicitudes? (activa y con una actividad de viajes)
-- Devuelve { nombre } o null.
create or replace function public.registro_clientes_empresa(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select jsonb_build_object('nombre', e.nombre)
      from public.empresas e
     where e.codigo = btrim(coalesce(p_codigo, ''))
       and e.activa
       and exists (select 1 from public.actividades a where a.codigo = any (e.actividades) and a.usa_viajes);
$$;

-- Guarda la solicitud: cliente (si su teléfono no existe en la empresa) + usuario
-- rol cliente, los dos SIN APROBAR (el login no lo deja entrar), y avisa al
-- Administrador y al G1 de la empresa. Se aprueba en Clientes -> "Revisar".
--   p = { empresa: '02', nombre, apellido1, apellido2, telefono, correo, usuario, clave }
--   Devuelve { usuario: 'aramirez02', empresa: 'Transportes ...' }
create or replace function public.solicitar_acceso_cliente(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_empresa  record;
    v_nombre   text := regexp_replace(btrim(coalesce(p->>'nombre', '')), '\s+', ' ', 'g');
    v_ape1     text := regexp_replace(btrim(coalesce(p->>'apellido1', '')), '\s+', ' ', 'g');
    v_ape2     text := nullif(regexp_replace(btrim(coalesce(p->>'apellido2', '')), '\s+', ' ', 'g'), '');
    v_tel      text := regexp_replace(coalesce(p->>'telefono', ''), '\D', '', 'g');
    v_correo   text := nullif(lower(btrim(coalesce(p->>'correo', ''))), '');
    v_base     text := lower(btrim(coalesce(p->>'usuario', '')));
    v_clave    text := coalesce(p->>'clave', '');
    v_cliente  bigint;
    v_tienda   bigint;
    v_usuario  text;
    v_completo text;
begin
    select e.id, e.codigo, e.nombre into v_empresa
      from public.empresas e
     where e.codigo = btrim(coalesce(p->>'empresa', ''))
       and e.activa
       and exists (select 1 from public.actividades a where a.codigo = any (e.actividades) and a.usa_viajes);
    if not found then
        raise exception 'Este enlace de registro no es válido. Pide a la empresa el enlace correcto.' using errcode = 'P0001';
    end if;

    if length(v_nombre) not between 2 and 60 or length(v_ape1) not between 2 and 60 or length(coalesce(v_ape2, '')) > 60 then
        raise exception 'Escribe tu nombre y tu primer apellido (de 2 a 60 letras).' using errcode = 'P0001';
    end if;
    if length(v_tel) not between 8 and 15 then
        raise exception 'El teléfono debe tener al menos 8 dígitos.' using errcode = 'P0001';
    end if;
    if v_correo is not null and v_correo !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'El correo no es válido.' using errcode = 'P0001';
    end if;
    if v_base !~ '^[a-z0-9]{3,20}$' then
        raise exception 'El usuario: de 3 a 20 letras o números, sin espacios.' using errcode = 'P0001';
    end if;
    if length(v_clave) not between 6 and 72 then
        raise exception 'La contraseña debe tener de 6 a 72 caracteres.' using errcode = 'P0001';
    end if;

    -- Una solicitud a la vez por empresa (evita duplicados si se envía dos veces)
    perform pg_advisory_xact_lock(7302, v_empresa.id::integer);

    -- Freno contra solicitudes falsas en cantidad
    if (select count(*) from public.usuarios u
         where u.empresa_id = v_empresa.id and u.rol = 'cliente' and not u.aprobado
           and u.creado_en > now() - interval '1 hour') >= 20 then
        raise exception 'Hay muchas solicitudes en este momento. Intenta de nuevo en una hora.' using errcode = 'P0001';
    end if;

    -- ¿Ya es cliente de la empresa? (mismo teléfono)
    select c.id into v_cliente
      from public.clientes c
     where c.empresa_id = v_empresa.id and regexp_replace(c.telefono, '\D', '', 'g') = v_tel
     order by c.aprobado desc, c.id
     limit 1;

    if v_cliente is not null then
        if exists (select 1 from public.usuarios u where u.cliente_id = v_cliente) then
            raise exception 'Ya hay un usuario o una solicitud con ese teléfono. Si olvidaste tu contraseña, comunícate con la empresa.' using errcode = 'P0001';
        end if;
    else
        if v_correo is not null and exists (select 1 from public.clientes c
                                             where c.empresa_id = v_empresa.id and lower(c.correo) = v_correo) then
            raise exception 'Ese correo ya está registrado con otro teléfono. Comunícate con la empresa.' using errcode = 'P0001';
        end if;
        insert into public.clientes (nombre, apellido1, apellido2, telefono, correo, aprobado, solicitado_en, empresa_id)
        values (v_nombre, v_ape1, v_ape2, v_tel, v_correo, false, now(), v_empresa.id)
        returning id into v_cliente;
        -- En la primera tienda activa de la empresa (así aparece en Clientes y lo ve su G3)
        select t.id into v_tienda
          from public.tiendas t
         where t.empresa_id = v_empresa.id and t.estado = 'activa'
         order by t.codigo
         limit 1;
        if v_tienda is not null then
            insert into public.clientes_tiendas (cliente_id, tienda_id) values (v_cliente, v_tienda);
        end if;
    end if;

    select ct.tienda_id into v_tienda
      from public.clientes_tiendas ct
     where ct.cliente_id = v_cliente
     order by ct.tienda_id
     limit 1;

    -- Usuario: el que pidió + ID de la empresa (aramirez02); si ya existe, aramirez202...
    v_completo := btrim(v_nombre || ' ' || v_ape1 || ' ' || coalesce(v_ape2, ''));
    v_usuario := public.usuario_libre(v_base, v_empresa.codigo, null, 0);
    insert into public.usuarios (nombre, id_usuario, telefono, clave, permisos, rol, cliente_id, aprobado, solicitado_en)
    values (v_completo, v_usuario, v_tel, v_clave, '{}', 'cliente', v_cliente, false, now());

    insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, enlace, referencia_tipo, referencia_id)
    select u.id, 'pendiente', 'Solicitud de acceso a viajes',
           format('%s (tel. %s) pidió su usuario "%s". Revísala en Clientes.', v_completo, v_tel, v_usuario),
           case when v_tienda is null then '#clientes' else '#clientes?tienda=' || v_tienda end,
           'acceso_cliente', v_cliente
      from public.usuarios u
     where u.empresa_id = v_empresa.id and u.rol in ('administrador', 'admin_g1') and u.aprobado;

    return jsonb_build_object('usuario', v_usuario, 'empresa', v_empresa.nombre);
end;
$$;

grant execute on function public.iniciar_sesion(text, text) to anon;
grant execute on function public.registro_clientes_empresa(text) to anon;
grant execute on function public.solicitar_acceso_cliente(jsonb) to anon;
-- Internas: no se llaman desde la página
revoke execute on function public.usuarios_ocultar_clave() from anon, public;
revoke execute on function public.cifrar_clave() from anon, public;

notify pgrst, 'reload schema';


-- ==================================================
-- 21. PALETA DE COLORES DE CADA EMPRESA INTERNA
--   empresas.colores: la paleta que el Desarrollador elige al crear o modificar la
--   empresa (Tiendas -> Empresas). Se pinta al iniciar sesión con un usuario de esa
--   empresa (empresas/empresas.js: aplicarColoresEmpresa). {} = colores de la marca.
--   Ej.: {"color-azul": "#5A6B34", "color-naranja": "#C8A13A", ...}
--   Se puede repetir.
-- ==================================================

alter table public.empresas add column if not exists colores jsonb not null default '{}'::jsonb;
alter table public.empresas drop constraint if exists empresas_colores_objeto;
alter table public.empresas add constraint empresas_colores_objeto check (jsonb_typeof(colores) = 'object');

notify pgrst, 'reload schema';