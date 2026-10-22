-- ==================================================
-- 12. DATOS DE ARRANQUE
-- ACACHETE LOGISTICS
--
-- Lo mínimo para entrar y probar. Ejecutar al FINAL (después de 11).
--   - Las actividades del sistema.
--   - La empresa "01" (Empresa de prueba) con regiones, categorías y pesos de artículos,
--     tarifas, motivos de retraso, 5 horarios del piloto y 4 slots de despacho de EJEMPLO.
--   - Usuarios (la base les crea su acceso en Supabase Auth):
--       desar -> DESARROLLADOR (clave ak7desa). No es de ninguna empresa.
--       admin -> Administrador de la empresa 01 (clave admin123). ⚠ Cambiarla al entrar.
--   - Ajustes de la empresa 01 (número de pedido automático, código de respaldo, radio de marca).
-- Se puede repetir: no duplica nada.
-- ==================================================

-- ---------- Actividades ----------
insert into public.actividades (codigo, nombre, descripcion, icono, orden,
                                usa_bodega, usa_punto_partida, usa_compra, usa_tamanos, permite_alcohol,
                                usa_vehiculos, usa_km, usa_peso, usa_productos, usa_caja, usa_viajes, usa_recolecciones,
                                palabra_registro, palabra_registros, palabra_conductor, palabra_conductores) values
    ('tienda', 'Entregas de tienda', 'Supermercado: abarrotes, línea blanca, electrónica y más.', 'bi-shop', 1,
     false, false, true, false, true,   true, true, true, false, true, false, false,   null, null, null, null),
    ('encomiendas', 'Encomiendas', 'Cajas, bolsas, documentos y artículos. Recepción en bodega y entrega con QR.', 'bi-box-seam', 2,
     true, true, false, true, false,    true, true, true, false, true, false, false,   null, null, null, null),
    ('transporte', 'Transporte', 'Viajes de personas y mercadería de un punto A a un punto B.', 'bi-car-front', 3,
     false, true, false, false, false,  true, true, true, false, true, true, false,    'viaje', 'viajes', 'conductor', 'conductores'),
    ('masajes', 'Masajes', 'Servicios a domicilio: sin vehículos, cobro por km ni peso.', 'bi-heart-pulse', 5,
     false, false, false, false, false, false, false, false, false, true, false, false, null, null, null, null),
    ('distribucion', 'Distribución', 'Distribuidora: productos con presentación y precio, bodega del día por ruta, carga de pilotos, entrega, venta en ruta y devolución.', 'bi-boxes', 6,
     false, false, false, false, false, true, false, false, true, true, false, false,  null, null, null, null),
    ('recoleccion', 'Recolección', 'El cliente elige la hora y qué se recoge (depósitos u otros) y dónde se entrega. Una sola agenda; tarifa diaria por cliente que se cobra cada semana.', 'bi-inbox', 7,
     false, false, false, false, false, false, false, false, false, false, false, true, 'recolección', 'recolecciones', 'conductor', 'conductores')
on conflict (codigo) do nothing;

-- ---------- Tamaños de bulto (para todas las empresas) ----------
insert into public.tamanos_bulto (codigo, nombre, largo_cm, ancho_cm, alto_cm, orden) values
    ('S',  'Pequeño',      30, 20, 15, 1),
    ('M',  'Mediano',      40, 30, 30, 2),
    ('L',  'Grande',       60, 40, 40, 3),
    ('XL', 'Extra grande', 80, 60, 60, 4)
on conflict do nothing;

-- ---------- Empresa de prueba y sus datos de ejemplo ----------
insert into public.empresas (codigo, nombre, actividades) values ('01', 'Empresa de prueba', '{tienda,encomiendas}')
on conflict do nothing;

do $$
declare
    v_emp bigint := (select id from public.empresas where codigo = '01');
begin
    -- Ajustes de la empresa (Configuración -> Pedidos; el radio en Inicio de la tienda)
    insert into public.configuracion (empresa_id, clave, valor) values
        (v_emp, 'numero_pedido',   '"automatico"'),
        (v_emp, 'codigo_respaldo', '["aleatorio"]'),
        (v_emp, 'radio_marca_m',   '150')
    on conflict do nothing;

    -- Regiones de ejemplo (opcionales: se cambian en Tiendas -> Regiones)
    insert into public.regiones (codigo, nombre, empresa_id) values
        ('CEN', 'Central', v_emp), ('NOR', 'Norte', v_emp), ('SUR', 'Sur', v_emp),
        ('ORI', 'Oriente', v_emp), ('OCC', 'Occidente', v_emp)
    on conflict do nothing;

    -- Categorías de mercadería (casillas del pedido)
    insert into public.categorias_mercaderia (empresa_id, actividad, nombre, tipo, icono, orden, peso_referencia) values
        (v_emp, 'tienda',      'Abarrotes',       'conteo',    'bi-basket',   1, null),
        (v_emp, 'tienda',      'Línea blanca',    'articulos', 'bi-snow',     2, null),
        (v_emp, 'tienda',      'Electrónica',     'articulos', 'bi-tv',       3, null),
        (v_emp, 'encomiendas', 'Cajas',           'bulto',     'bi-box-seam', 1, null),
        (v_emp, 'encomiendas', 'Bolsas',          'bulto',     'bi-bag',      2, null),
        (v_emp, 'encomiendas', 'Documentos',      'documento', 'bi-envelope', 3, 0.2),
        (v_emp, 'encomiendas', 'Línea blanca',    'articulos', 'bi-snow',     4, null),
        (v_emp, 'encomiendas', 'Electrónica',     'articulos', 'bi-tv',       5, null),
        (v_emp, 'encomiendas', 'Otros artículos', 'articulos', 'bi-box',      6, null)
    on conflict do nothing;

    -- Pesos promedio de artículos (los mismos para Línea blanca y Electrónica de ambas actividades)
    insert into public.articulos_catalogo (categoria_id, nombre, peso_kg, orden)
    select c.id, a.nombre, a.peso, a.orden
      from public.categorias_mercaderia c
      join (values
        ('Línea blanca', 'Refrigeradora',                       70,  1),
        ('Línea blanca', 'Refrigeradora dúplex (side by side)', 110, 2),
        ('Línea blanca', 'Frigobar',                            25,  3),
        ('Línea blanca', 'Congelador',                          55,  4),
        ('Línea blanca', 'Lavadora',                            40,  5),
        ('Línea blanca', 'Secadora',                            35,  6),
        ('Línea blanca', 'Centro de lavado',                    90,  7),
        ('Línea blanca', 'Cocina / estufa',                     45,  8),
        ('Línea blanca', 'Horno de empotrar',                   35,  9),
        ('Línea blanca', 'Campana extractora',                  12, 10),
        ('Línea blanca', 'Microondas',                          13, 11),
        ('Línea blanca', 'Lavaplatos',                          45, 12),
        ('Línea blanca', 'Calentador de agua',                  25, 13),
        ('Línea blanca', 'Aire acondicionado',                  35, 14),
        ('Línea blanca', 'Dispensador / enfriador de agua',     15, 15),
        ('Electrónica',  'Pantalla / TV 32"',                    6,  1),
        ('Electrónica',  'Pantalla / TV 43"',                    9,  2),
        ('Electrónica',  'Pantalla / TV 55"',                   15,  3),
        ('Electrónica',  'Pantalla / TV 65"',                   22,  4),
        ('Electrónica',  'Pantalla / TV 75" o más',             32,  5),
        ('Electrónica',  'Celular',                            0.3,  6),
        ('Electrónica',  'Tablet',                             0.6,  7),
        ('Electrónica',  'Laptop',                             2.5,  8),
        ('Electrónica',  'Computadora de escritorio',            8,  9),
        ('Electrónica',  'Monitor',                              5, 10),
        ('Electrónica',  'Impresora',                            6, 11),
        ('Electrónica',  'Consola de videojuegos',               4, 12),
        ('Electrónica',  'Equipo de sonido',                    10, 13),
        ('Electrónica',  'Barra de sonido',                      4, 14),
        ('Electrónica',  'Bocina / parlante',                    3, 15),
        ('Electrónica',  'Teatro en casa',                      12, 16),
        ('Electrónica',  'Proyector',                            3, 17),
        ('Electrónica',  'Cámara',                               1, 18),
        ('Electrónica',  'Router / módem',                     0.5, 19)
      ) as a(categoria, nombre, peso, orden) on c.nombre = a.categoria
     where c.empresa_id = v_emp
    on conflict do nothing;

    -- Tarifas generales de EJEMPLO (una por actividad; se cambian en Configuración)
    insert into public.tarifas (empresa_id, actividad, cargo_fijo, minimo, kg_incluidos, precio_kg, envio_gratis_desde) values
        (v_emp, 'encomiendas', 0,    2500, 2, 500, null),  -- mínimo ₡2500 cubre 2 kg; ₡500 por kg adicional
        (v_emp, 'tienda',      1500, 0,    0, 0,   30000)  -- envío ₡1500; gratis desde ₡30000 de compra
    on conflict do nothing;

    -- Motivos de retraso (para todas las actividades)
    insert into public.motivos_retraso (empresa_id, nombre, orden) values
        (v_emp, 'Tráfico', 1), (v_emp, 'Cliente ausente', 2), (v_emp, 'Dirección incorrecta', 3),
        (v_emp, 'Clima', 4), (v_emp, 'Falla del vehículo', 5), (v_emp, 'Otro', 6)
    on conflict do nothing;

    -- Horarios del piloto (base): 5 de ejemplo y 5 pedidos por horario
    insert into public.horarios_dias (empresa_id, tipo, dia, cantidad) values (v_emp, 'turno', 0, 5), (v_emp, 'despacho', 0, 4)
    on conflict do nothing;
    insert into public.horarios (empresa_id, tipo, dia, numero, abre, inicio, fin) values
        (v_emp, 'turno', 0, 1, '07:00', '07:30', '09:00'),
        (v_emp, 'turno', 0, 2, '09:00', '09:30', '11:00'),
        (v_emp, 'turno', 0, 3, '11:00', '11:30', '13:00'),
        (v_emp, 'turno', 0, 4, '13:00', '13:30', '15:00'),
        (v_emp, 'turno', 0, 5, '15:00', '15:30', '17:00'),
        -- Slots de despacho (base): 4 de ejemplo
        (v_emp, 'despacho', 0, 1, null, '08:00', '10:00'),
        (v_emp, 'despacho', 0, 2, null, '10:00', '12:00'),
        (v_emp, 'despacho', 0, 3, null, '13:00', '15:00'),
        (v_emp, 'despacho', 0, 4, null, '15:00', '17:00')
    on conflict do nothing;
    insert into public.horarios_capacidad (empresa_id, pedidos) values (v_emp, 5)
    on conflict do nothing;

    -- Usuarios iniciales ("desar" y "admin" están protegidos: no se borran ni cambian de rol)
    -- (sin "on conflict": la base crea el acceso en Supabase Auth antes de ver si ya existe)
    insert into public.usuarios (nombre, id_usuario, telefono, clave, rol, empresa_id)
    select x.nombre, x.id_usuario, '00000000', x.clave, x.rol, x.empresa_id
      from (values ('Desarrollador', 'desar', 'ak7desa',  'desarrollador', null::bigint),
                   ('Administrador', 'admin', 'admin123', 'administrador', v_emp)) as x(nombre, id_usuario, clave, rol, empresa_id)
     where not exists (select 1 from public.usuarios u where u.id_usuario = x.id_usuario);
end;
$$;

notify pgrst, 'reload schema';
