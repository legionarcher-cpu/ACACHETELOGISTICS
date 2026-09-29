-- ==================================================
-- VEHÍCULO "EN USO" AUTOMÁTICO
-- ACACHETE LOGISTICS
--
-- Cómo ejecutarlo:
--   Supabase -> tu proyecto -> SQL Editor -> New query
--   -> pegar todo este archivo -> Run
--   (Se ejecuta UNA sola vez, DESPUÉS de sql/14_pedidos.sql)
--
-- Regla:
--   - Un vehículo pasa a "en_uso" cuando el piloto que lo tiene asignado
--     tiene al menos un pedido ACTIVO (con piloto y sin terminar:
--     registrado, en bodega, asignado, reprogramado o en ruta; no anulado).
--   - Vuelve a "disponible" cuando ese piloto ya no tiene pedidos activos
--     (entregados, cancelados, no entregados, devueltos...).
--   - Si el vehículo está en "mantenimiento", NO se cambia (eso lo decide
--     una persona en Configuración -> Vehículos).
--
-- Qué hace:
--   1. Función recalcular_estado_vehiculo(vehiculo): aplica la regla.
--   2. Trigger en "pedidos": al crear un pedido o cambiar su piloto, estado
--      o anulado, recalcula el vehículo del piloto anterior y del nuevo.
--   3. Trigger en "usuarios": al cambiar el vehículo de un piloto, recalcula
--      el vehículo anterior y el nuevo.
--   4. Recalcula ahora todos los vehículos.
-- ==================================================


-- ---------- 1. Aplicar la regla a un vehículo ----------
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
       and v.estado <> 'mantenimiento';   -- mantenimiento no se toca
end;
$$;


-- ---------- 2. Cuando cambia un pedido ----------
create or replace function public.pedidos_actualizar_vehiculo()
returns trigger
language plpgsql
as $$
begin
    -- Vehículo del piloto nuevo
    if new.piloto_id is not null then
        perform public.recalcular_estado_vehiculo((select vehiculo_id from public.usuarios where id = new.piloto_id));
    end if;
    -- Vehículo del piloto anterior (si cambió de piloto)
    if tg_op = 'UPDATE' and old.piloto_id is not null and old.piloto_id is distinct from new.piloto_id then
        perform public.recalcular_estado_vehiculo((select vehiculo_id from public.usuarios where id = old.piloto_id));
    end if;
    return null;
end;
$$;

create trigger pedidos_vehiculo_en_uso
    after insert or update of piloto_id, estado, anulado on public.pedidos
    for each row execute function public.pedidos_actualizar_vehiculo();


-- ---------- 3. Cuando a un piloto le cambian el vehículo ----------
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

create trigger usuarios_vehiculo_en_uso
    after update of vehiculo_id on public.usuarios
    for each row execute function public.usuarios_actualizar_vehiculo();


-- ---------- 4. Recalcular todos ahora ----------
select public.recalcular_estado_vehiculo(id) from public.vehiculos;
