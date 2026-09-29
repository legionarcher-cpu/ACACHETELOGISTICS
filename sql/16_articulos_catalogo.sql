-- ==================================================
-- CATÁLOGO DE ARTÍCULOS FRECUENTES (línea blanca, electrónica...)
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   (Se ejecuta UNA sola vez, DESPUÉS de sql/14_pedidos.sql)
--
-- Para qué sirve: en "Entregas de tienda", al marcar la casilla
-- Línea blanca o Electrónica, el empleado elige el artículo de esta
-- lista y el PESO APROXIMADO se llena solo (lo puede corregir).
-- El peso ayuda al piloto a saber qué carga y si cabe en su vehículo.
--
-- Qué hace:
--   1. Tabla "articulos_catalogo": artículo, categoría (de
--      categorias_mercaderia), peso aproximado en kg, activo, orden.
--   2. Carga los artículos más comunes de Línea blanca y Electrónica
--      (pesos de referencia; se ajustan en Configuración -> Pedidos).
--   3. Reglas de acceso TEMPORALES.
--
-- Quién lo modifica: Administrador y Admin G1 (lo controla la página).
-- ==================================================


-- ---------- 1. Catálogo ----------
-- on delete cascade: si se elimina la categoría, se borran sus artículos del
-- catálogo (los pedidos NO se afectan: guardan una copia del nombre y peso).
create table public.articulos_catalogo (
    id            bigint generated always as identity primary key,
    categoria_id  bigint not null references public.categorias_mercaderia(id) on delete cascade,
    nombre        text not null,
    peso_kg       numeric(8,2) not null default 0,   -- peso aproximado
    activo        boolean not null default true,
    orden         smallint not null default 0,

    constraint articulos_catalogo_peso_valido check (peso_kg >= 0),
    constraint articulos_catalogo_unico unique (categoria_id, nombre)
);


-- ---------- 2. Artículos más comunes (pesos aproximados) ----------
-- Se buscan las categorías por nombre (creadas en sql/14).
insert into public.articulos_catalogo (categoria_id, nombre, peso_kg, orden)
select c.id, a.nombre, a.peso, a.orden
from public.categorias_mercaderia c
join (values
    -- Línea blanca
    ('Línea blanca', 'Refrigeradora',                    70,  1),
    ('Línea blanca', 'Refrigeradora dúplex (side by side)', 110, 2),
    ('Línea blanca', 'Frigobar',                         25,  3),
    ('Línea blanca', 'Congelador',                       55,  4),
    ('Línea blanca', 'Lavadora',                         40,  5),
    ('Línea blanca', 'Secadora',                         35,  6),
    ('Línea blanca', 'Centro de lavado',                 90,  7),
    ('Línea blanca', 'Cocina / estufa',                  45,  8),
    ('Línea blanca', 'Horno de empotrar',                35,  9),
    ('Línea blanca', 'Campana extractora',               12, 10),
    ('Línea blanca', 'Microondas',                       13, 11),
    ('Línea blanca', 'Lavaplatos',                       45, 12),
    ('Línea blanca', 'Calentador de agua',               25, 13),
    ('Línea blanca', 'Aire acondicionado',               35, 14),
    ('Línea blanca', 'Dispensador / enfriador de agua',  15, 15),
    -- Electrónica
    ('Electrónica', 'Pantalla / TV 32"',                  6,  1),
    ('Electrónica', 'Pantalla / TV 43"',                  9,  2),
    ('Electrónica', 'Pantalla / TV 55"',                 15,  3),
    ('Electrónica', 'Pantalla / TV 65"',                 22,  4),
    ('Electrónica', 'Pantalla / TV 75" o más',           32,  5),
    ('Electrónica', 'Celular',                          0.3,  6),
    ('Electrónica', 'Tablet',                           0.6,  7),
    ('Electrónica', 'Laptop',                           2.5,  8),
    ('Electrónica', 'Computadora de escritorio',          8,  9),
    ('Electrónica', 'Monitor',                            5, 10),
    ('Electrónica', 'Impresora',                          6, 11),
    ('Electrónica', 'Consola de videojuegos',             4, 12),
    ('Electrónica', 'Equipo de sonido',                  10, 13),
    ('Electrónica', 'Barra de sonido',                    4, 14),
    ('Electrónica', 'Bocina / parlante',                  3, 15),
    ('Electrónica', 'Teatro en casa',                    12, 16),
    ('Electrónica', 'Proyector',                          3, 17),
    ('Electrónica', 'Cámara',                             1, 18),
    ('Electrónica', 'Router / módem',                   0.5, 19)
) as a(categoria, nombre, peso, orden)
  on c.nombre = a.categoria and c.actividad = 'tienda';


-- ---------- 3. Acceso desde la web (TEMPORAL) ----------
alter table public.articulos_catalogo enable row level security;
grant select, insert, update, delete on public.articulos_catalogo to anon;
create policy "TEMPORAL - leer catalogo"      on public.articulos_catalogo for select to anon using (true);
create policy "TEMPORAL - crear catalogo"     on public.articulos_catalogo for insert to anon with check (true);
create policy "TEMPORAL - modificar catalogo" on public.articulos_catalogo for update to anon using (true) with check (true);
create policy "TEMPORAL - eliminar catalogo"  on public.articulos_catalogo for delete to anon using (true);
