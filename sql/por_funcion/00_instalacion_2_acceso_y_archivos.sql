-- 2 de 10 · sql/00_instalacion_completa.sql · Acceso desde la web (temporal) y fotos (Storage) (secciones 10 a 11).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 10. ACCESO DESDE LA WEB (TEMPORAL)
-- Quién puede hacer qué lo controla la página. Fase 7: reglas reales.
-- ==================================================

-- Si se vuelve a ejecutar: se quitan las reglas TEMPORALES que ya existan
-- (tablas y fotos) para crearlas de nuevo sin error
do $$
declare
    r record;
begin
    for r in select schemaname, tablename, policyname from pg_policies
             where policyname like 'TEMPORAL - %' and schemaname in ('public', 'storage') loop
        execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    end loop;
end;
$$;

-- Regiones: solo lectura aquí; la sección 12 les da acceso completo (Tiendas -> Regiones)
alter table public.regiones enable row level security;
grant select on public.regiones to anon;
create policy "TEMPORAL - leer regiones" on public.regiones for select to anon using (true);

-- Tablas con acceso completo (leer, crear, modificar, eliminar)
do $$
declare
    t text;
begin
    foreach t in array array[
        'tiendas', 'vehiculos', 'usuarios', 'clientes', 'notificaciones',
        'marcas_horario', 'capacidad_marcas', 'horario_dias', 'marcas_dia',
        'slots_horario', 'slot_dias', 'slots_dia',
        'actividades', 'categorias_mercaderia', 'articulos_catalogo', 'tamanos_bulto',
        'tarifas', 'descuentos', 'motivos_retraso', 'rutas', 'rutas_pilotos',
        'pedido_articulos'
    ] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('grant select, insert, update, delete on public.%I to anon', t);
        execute format('create policy "TEMPORAL - leer %1$s" on public.%1$I for select to anon using (true)', t);
        execute format('create policy "TEMPORAL - crear %1$s" on public.%1$I for insert to anon with check (true)', t);
        execute format('create policy "TEMPORAL - modificar %1$s" on public.%1$I for update to anon using (true) with check (true)', t);
        execute format('create policy "TEMPORAL - eliminar %1$s" on public.%1$I for delete to anon using (true)', t);
    end loop;
end;
$$;

-- Asignaciones (sin modificar: se quitan y se ponen)
alter table public.clientes_tiendas enable row level security;
grant select, insert, delete on public.clientes_tiendas to anon;
create policy "TEMPORAL - leer clientes_tiendas"    on public.clientes_tiendas for select to anon using (true);
create policy "TEMPORAL - asignar clientes_tiendas" on public.clientes_tiendas for insert to anon with check (true);
create policy "TEMPORAL - quitar clientes_tiendas"  on public.clientes_tiendas for delete to anon using (true);

alter table public.tiendas_actividades enable row level security;
grant select, insert, delete on public.tiendas_actividades to anon;
create policy "TEMPORAL - leer tiendas_actividades"    on public.tiendas_actividades for select to anon using (true);
create policy "TEMPORAL - asignar tiendas_actividades" on public.tiendas_actividades for insert to anon with check (true);
create policy "TEMPORAL - quitar tiendas_actividades"  on public.tiendas_actividades for delete to anon using (true);

-- Configuración: leer, crear y modificar
alter table public.configuracion enable row level security;
grant select, insert, update on public.configuracion to anon;
create policy "TEMPORAL - leer configuracion"      on public.configuracion for select to anon using (true);
create policy "TEMPORAL - crear configuracion"     on public.configuracion for insert to anon with check (true);
create policy "TEMPORAL - modificar configuracion" on public.configuracion for update to anon using (true) with check (true);

-- Pedidos, entregas y evidencias: leer, crear y modificar (NUNCA borrar)
do $$
declare
    t text;
begin
    foreach t in array array['pedidos', 'pedido_entregas', 'pedido_evidencias'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('grant select, insert, update on public.%I to anon', t);
        execute format('create policy "TEMPORAL - leer %1$s" on public.%1$I for select to anon using (true)', t);
        execute format('create policy "TEMPORAL - crear %1$s" on public.%1$I for insert to anon with check (true)', t);
        execute format('create policy "TEMPORAL - modificar %1$s" on public.%1$I for update to anon using (true) with check (true)', t);
    end loop;
end;
$$;

-- Historial: solo leer y agregar
alter table public.pedido_historial enable row level security;
grant select, insert on public.pedido_historial to anon;
create policy "TEMPORAL - leer historial"  on public.pedido_historial for select to anon using (true);
create policy "TEMPORAL - crear historial" on public.pedido_historial for insert to anon with check (true);

-- Funciones y secuencia que usa la página
grant usage on sequence public.pedidos_codigo_seq to anon;
grant execute on function public.cambiar_codigo_tienda(bigint, text) to anon;
grant execute on function public.marcas_del_dia(date) to anon;
grant execute on function public.slots_del_dia(date) to anon;

-- Marcas del piloto y QR: se leen, pero se crean SOLO con las funciones (validan QR y hora)
alter table public.marcas_piloto enable row level security;
grant select on public.marcas_piloto to anon;
create policy "TEMPORAL - leer marcas_piloto" on public.marcas_piloto for select to anon using (true);
alter table public.pilotos_dia enable row level security;
grant select on public.pilotos_dia to anon;
create policy "TEMPORAL - leer pilotos_dia" on public.pilotos_dia for select to anon using (true);
alter table public.qr_marcas enable row level security; -- sin acceso directo: solo qr_marca_mes
grant execute on function public.ahora_local() to anon;
grant execute on function public.qr_marca_mes(bigint) to anon;
grant execute on function public.qr_piloto_dia(bigint) to anon;
grant execute on function public.validar_piloto(uuid, bigint) to anon;
grant execute on function public.marcar_por_qr(bigint, text, text) to anon;

-- Calculador interno (solo lectura)
grant select on public.pedidos_tiempos to anon;
grant select on public.slots_carga to anon;
grant execute on function public.validar_codigo_respaldo(bigint, text) to anon;


-- ==================================================
-- 11. ARCHIVOS (Supabase Storage)
-- ==================================================

-- Fotos de usuario: 2 MB, JPG / PNG / WEBP
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict do nothing;

create policy "TEMPORAL - ver avatares"        on storage.objects for select to anon using (bucket_id = 'avatares');
create policy "TEMPORAL - subir avatares"      on storage.objects for insert to anon with check (bucket_id = 'avatares');
create policy "TEMPORAL - reemplazar avatares" on storage.objects for update to anon using (bucket_id = 'avatares') with check (bucket_id = 'avatares');
create policy "TEMPORAL - borrar avatares"     on storage.objects for delete to anon using (bucket_id = 'avatares');

-- Fotos de entregas (evidencias): 5 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict do nothing;

create policy "TEMPORAL - ver evidencias"   on storage.objects for select to anon using (bucket_id = 'evidencias');
create policy "TEMPORAL - subir evidencias" on storage.objects for insert to anon with check (bucket_id = 'evidencias');
create policy "TEMPORAL - borrar evidencias" on storage.objects for delete to anon using (bucket_id = 'evidencias');


