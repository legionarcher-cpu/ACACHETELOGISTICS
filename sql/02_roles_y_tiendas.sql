-- ==================================================
-- ROLES DE USUARIO, REGIONES Y TIENDAS
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   (Se ejecuta UNA sola vez, después de 01_crear_tabla_usuarios.sql)
--
-- Qué hace:
--   1. Crea la tabla "regiones" (zonas del país).
--   2. Crea la tabla "tiendas". Cada tienda tiene un código
--      REGIÓN + NÚMERO (ej. NOR-001) que dice de qué zona es.
--   3. Cambia la tabla "usuarios":
--        - agrega "rol": administrador | tienda | piloto
--        - agrega "tienda_id": a qué tienda pertenece
--          (obligatorio para tienda y piloto; el administrador no tiene)
--        - pasa los 2 usuarios actuales al esquema nuevo
--        - elimina la columna vieja "tienda" (texto libre)
--
-- Roles:
--   administrador -> controla todo (usuarios, tiendas, reportes...)
--   tienda        -> usuario de una tienda (crea y sigue pedidos)
--   piloto        -> conductor de una tienda; no crea pedidos ni hace
--                    nada administrativo, solo llenará datos que se
--                    definirán más adelante
--
-- Usuario compuesto (lo arma la página de Usuarios al crear):
--   tienda y piloto -> <código de tienda en minúsculas>-<usuario>
--                      ej. tienda NOR-001 + "jperez" = nor-001-jperez
--   administrador   -> solo el usuario, ej. admin
--   Así el mismo nombre (jperez) puede existir en tiendas distintas.
--
-- ⚠ Igual que el archivo 01: reglas RLS TEMPORALES (todo abierto).
-- ==================================================


-- ==================================================
-- 1. REGIONES
-- ==================================================
-- codigo: 3 letras MAYÚSCULAS (es el inicio del código de cada tienda)
-- nombre: nombre para mostrar
--
-- ⚠ CAMBIAR la lista de abajo por las regiones reales del país
--   antes de ejecutar (se pueden agregar más después).

create table public.regiones (
    codigo  text primary key check (codigo ~ '^[A-Z]{3}$'),
    nombre  text not null
);

insert into public.regiones (codigo, nombre) values
    ('CEN', 'Central'),
    ('NOR', 'Norte'),
    ('SUR', 'Sur'),
    ('ORI', 'Oriente'),
    ('OCC', 'Occidente');


-- ==================================================
-- 2. TIENDAS
-- ==================================================
-- codigo: REGIÓN-NÚMERO de 3 dígitos, ej. NOR-001.
--   La base de datos revisa que:
--     - tenga ese formato exacto
--     - las 3 letras coincidan con la región de la tienda
--       (no se puede guardar NOR-001 en la región SUR)
-- (Basada en la tabla "tiendas" de PROPUESTA-ESTRUCTURADA-V2.md,
--  agregando codigo, region y creado_en.)

create table public.tiendas (
    id         bigint generated always as identity primary key,
    codigo     text not null unique,
    region     text not null references public.regiones(codigo),
    nombre     text not null,
    direccion  text,
    telefono   text,
    estado     text not null default 'activa',
    creado_en  timestamptz not null default now(),

    constraint tiendas_codigo_formato check (codigo ~ '^[A-Z]{3}-[0-9]{3}$'),
    constraint tiendas_codigo_region  check (left(codigo, 3) = region),
    constraint tiendas_estado_valido  check (estado in ('activa', 'inactiva'))
);

-- Tienda de ejemplo (a ella se pasa el usuario "operador" actual).
-- Se puede renombrar o cambiar después desde la futura sección Tiendas.
insert into public.tiendas (codigo, region, nombre) values
    ('CEN-001', 'CEN', 'Tienda Central');


-- ==================================================
-- 3. USUARIOS: rol y tienda
-- ==================================================

-- 3.1 Columna rol (los usuarios que ya existen quedan como 'tienda' por ahora)
alter table public.usuarios
    add column rol text not null default 'tienda';

alter table public.usuarios
    add constraint usuarios_rol_valido check (rol in ('administrador', 'tienda', 'piloto'));

-- 3.2 Columna tienda_id (a qué tienda pertenece).
--     on delete restrict = no se puede borrar una tienda que tenga usuarios.
alter table public.usuarios
    add column tienda_id bigint references public.tiendas(id) on delete restrict;

-- 3.3 Pasar los usuarios actuales al esquema nuevo
--     - "admin" pasa a administrador (sin tienda)
update public.usuarios
set rol = 'administrador'
where id_usuario = 'admin';

--     - todos los demás pasan a la tienda CEN-001 con usuario compuesto
--       (ej. "operador" -> "cen-001-operador")
update public.usuarios
set tienda_id  = (select id from public.tiendas where codigo = 'CEN-001'),
    id_usuario = 'cen-001-' || id_usuario
where rol <> 'administrador'
  and tienda_id is null;

-- 3.4 Reglas nuevas
--     - tienda y piloto DEBEN tener tienda
--     - el administrador NO tiene tienda
alter table public.usuarios
    add constraint usuarios_tienda_segun_rol check (
        (rol = 'administrador' and tienda_id is null)
        or (rol in ('tienda', 'piloto') and tienda_id is not null)
    );

--     - el rol se debe indicar siempre al crear un usuario (sin valor por defecto)
alter table public.usuarios
    alter column rol drop default;

-- 3.5 Eliminar la columna vieja "tienda" (texto libre), reemplazada por tienda_id
alter table public.usuarios
    drop column tienda;


-- ==================================================
-- 4. ACCESO DESDE LA WEB (TEMPORAL, igual que usuarios)
-- ==================================================
-- CUANDO SE PASE A LA VERSIÓN SEGURA (Fase 7): borrar estas reglas.

-- Regiones: solo lectura desde la web (se editan aquí, en Supabase)
alter table public.regiones enable row level security;
grant select on public.regiones to anon;
create policy "TEMPORAL - leer regiones" on public.regiones for select to anon using (true);

-- Tiendas: leer, crear, modificar y eliminar
alter table public.tiendas enable row level security;
grant select, insert, update, delete on public.tiendas to anon;
create policy "TEMPORAL - leer tiendas"      on public.tiendas for select to anon using (true);
create policy "TEMPORAL - crear tiendas"     on public.tiendas for insert to anon with check (true);
create policy "TEMPORAL - modificar tiendas" on public.tiendas for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar tiendas"  on public.tiendas for delete to anon using (true);


-- ==================================================
-- 5. VERIFICAR (opcional): muestra los usuarios con su tienda
-- ==================================================
select u.id, u.nombre, u.id_usuario, u.rol, t.codigo as tienda, r.nombre as region
from public.usuarios u
left join public.tiendas  t on t.id = u.tienda_id
left join public.regiones r on r.codigo = t.region
order by u.id;
