-- 2 de 15 · sql/01_actualizacion_base_existente.sql · Empresas internas, usuarios con el ID de la empresa y palabras por actividad (bloques 16 a 18).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

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

    -- El usuario lleva la REGIÓN de la tienda (bloque 28)
    for r in select u.id, u.id_usuario, t.region,
                    case when left(t.codigo, 3) = t.region then t.codigo else t.region end as tienda
               from public.usuarios u
               left join public.tiendas t on t.id = u.tienda_id
              where u.empresa_id = p_empresa_id
                and u.id_usuario not in ('admin', 'desar') loop
        update public.usuarios
           set id_usuario = public.usuario_libre(public.usuario_base(r.id_usuario, v_viejo, r.tienda), v_nuevo, r.region, r.id)
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
    -- Desde el bloque 31 los usuarios ya no llevan la región: si ya se quitó, no se vuelve a poner
    if exists (select 1 from public.configuracion where clave = 'usuarios_sin_region') then
        return;
    end if;
    -- El usuario lleva la REGIÓN de la tienda (bloque 28: el código de la tienda ya no la lleva).
    -- Para reconocer los formatos viejos se usa el código si empieza con la región.
    for r in select u.id, u.id_usuario, t.region,
                    case when left(t.codigo, 3) = t.region then t.codigo else t.region end as tienda,
                    e.codigo as empresa
               from public.usuarios u
               join public.empresas e on e.id = u.empresa_id
               join public.tiendas t on t.id = u.tienda_id
              where u.id_usuario not in ('admin', 'desar')
              order by u.id loop
        v_id := public.usuario_libre(public.usuario_base(r.id_usuario, r.empresa, r.tienda), r.empresa, r.region, r.id);
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

