-- ==================================================
-- PILOTO MULTITIENDA
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   (Se ejecuta UNA sola vez, DESPUÉS de sql/17_rutas.sql)
--
-- Regla (acordada):
--   - Un piloto pertenece a UNA tienda (su tienda base, usuarios.tienda_id).
--     Si se cambia de tienda, sus asignaciones de rutas de la tienda anterior
--     (de hoy en adelante) se quitan y sus pedidos pendientes allá quedan sin
--     piloto (se avisa al G2). Lo hace la página (js/secciones/usuarios.js).
--   - Si se marca como MULTITIENDA, el G2 lo puede asignar también a rutas
--     de OTRAS tiendas de su región (ej. un día a la semana en otra tienda).
--     Nunca a dos tiendas el mismo día (lo revisa js/secciones/rutas.js).
--
-- Qué hace:
--   1. Columna usuarios.multitienda (falso por defecto).
--   2. Regla: solo un piloto puede ser multitienda.
-- ==================================================

alter table public.usuarios
    add column multitienda boolean not null default false;

alter table public.usuarios
    add constraint usuarios_multitienda_solo_piloto
    check (not multitienda or rol = 'piloto');
