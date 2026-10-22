# 5. Base de datos (Supabase / PostgreSQL)

Conexión: `js/supabase.js` (objeto `db`), usando la base de la empresa activa (`empresas/empresas.js`).
Consulta típica: `const { data, error } = await db.from('tiendas').select('id, codigo').eq('region', 'CEN');`

## Scripts SQL (`sql/`) — reconstruida el 2026-10-20

Guía completa: [`sql/LEEME.md`](../sql/LEEME.md).

| Carpeta | Qué tiene | Cuándo |
|---|---|---|
| `sql/instalacion/` | La base completa, **un archivo por módulo** (00 a 12). Cada tabla se crea una sola vez con todas sus columnas y cada función está en su versión final | Base nueva o reiniciada: se ejecutan en orden |
| `sql/actualizaciones/` | Un archivo pequeño con fecha por cada cambio (`AAAA-MM-DD_tema.sql`) | Base ya instalada: solo el archivo nuevo |
| `sql/historial/` | Los scripts viejos (`00`, `01` con los bloques 0 a 46, `por_funcion/`, `dividir_sql`, `vaciar_base_datos.sql`) | No se ejecutan. Los comentarios "sql/01 bloque N" del código apuntan aquí |

**Cómo ejecutar:** Supabase → SQL Editor → New query → pegar el archivo → Run. `00_reiniciar_base.sql` **borra todo**
el esquema public (solo para empezar de cero).

**Regla para cambios de estructura:**
1. Cambiar el módulo de `sql/instalacion/` que corresponde (para las bases nuevas).
2. Crear `sql/actualizaciones/AAAA-MM-DD_tema.sql` escrito para poder repetirse (`add column if not exists`,
   `drop constraint if exists`, `create or replace`, `on conflict do nothing`). `create table if not exists` **no
   agrega columnas** a una tabla que ya existe.
3. Ejecutar ese archivo en la base de cada empresa que ya exista.

Nunca crear columnas a mano en el Table Editor.

**Limpiar una empresa:** Tiendas → Empresas → botón **Limpiar datos** (goma de borrar), solo el Desarrollador: pide el
ID de la empresa y su contraseña (la base la comprueba: función `limpiar_empresa`). Borra los datos de esa empresa
(pedidos, viajes, recolecciones, clientes, rutas, vehículos, usuarios, tiendas, regiones, tarifas, descuentos,
categorías, horarios, costos y transporte); las demás no se tocan.

**Empezar de cero:** `sql/instalacion/00_reiniciar_base.sql` y luego 01 a 12. Las fotos de Storage se borran a mano si
Supabase no deja hacerlo por SQL (Storage → `avatares` / `evidencias`).

Si la página dice "Falta instalar la base de datos (sql/instalacion)", falta algún módulo o una actualización.

## Tablas

### Organización

**`empresas`** (sql/01 bloque 16) — empresas internas: `id`, `codigo` (ID de 2 números, `01`, único; va al
final de sus usuarios), `nombre` (único), `actividades` (`{tienda,encomiendas}`, al menos una), `activa`
(inactiva = sus usuarios no entran), `colores` (paleta: `{"color-azul": "#5A6B34", ...}`, `{}` = la de la marca;
se pinta al iniciar sesión con un usuario de la empresa; bloque 21), `plan` (`basico` | `profesional` | `completo` |
`personalizado`, por defecto `completo`) y `funciones` (lista de funciones habilitadas, null = todas; bloque 22,
Configuración → Planes y funciones), `creado_en`. La primera es la "Empresa principal" (`01`).

**`pedido_solicitudes`** (sql/01 bloque 23) — envíos que pide el cliente en "Mis envíos": tienda, actividad, cliente y
su usuario, punto de partida (`partida_direccion`, `partida_referencia`, `partida_lat`, `partida_lng`) y entrega
(dirección, **referencia**, lat/lng), km, minutos, quién recibe, fecha, descripción,
bultos, peso, notas, `estado` (`pendiente` | `aprobada` | `rechazada` | `cancelada`), `motivo`, `pedido_id` (el pedido
que se registró al aprobarla), `revisado_por`, `revisado_en`. Ver [secciones/envios.md](secciones/envios.md).

**`cajas`** y **`cierres_caja`** (sql/01 bloque 24) — caja de pilotos y conductores: tipos de caja (nombre, monto);
`usuarios.caja_id` / `caja_monto` (fondo de cada piloto); `pedidos.cobro_forma` y `viajes.cobro_forma` (efectivo, sinpe,
tarjeta) y su `cierre_id`. Cada cierre guarda fondo, efectivo, sinpe, tarjeta, efectivo contado, diferencia, cantidad,
notas y quién cerró. Se crean solo con la función `caja_cerrar` (la página solo lee `cierres_caja`).
Ver [secciones/caja.md](secciones/caja.md).

**`ubicaciones_pilotos`** (sql/01 bloque 25) — última posición de cada piloto en ruta (`piloto_ubicacion`).

**Partes de cada actividad** (sql/01 bloque 26) — `actividades.usa_vehiculos`, `usa_km`, `usa_peso` (por defecto sí)
y `usa_productos` (por defecto no). Actividades `masajes` y `distribucion`.

**Distribuidora** (sql/01 bloque 27, ver [15-distribuidora.md](15-distribuidora.md)):
`productos` (nombre, código, categoría, activo) → `producto_presentaciones` (nombre, unidades, código de barras,
activa) → `precios` (por `lista_id` de `listas_precios`: precio **sin IVA** + `iva_pct`, 13 por defecto; una lista
`general` por empresa). `tiendas.lista_precios_id`. `motivos_entrega_parcial`. `bodegas_dia` (una por ruta y fecha,
`lista_id`, `estado` abierta | cerrada, `resumen` del día), `bodega_movimientos` (ingreso, carga, devolución buena o
dañada, traspaso, ajuste, salida; con el precio de ese momento), `pedido_productos` (cantidad pedida y entregada,
motivo, precio, IVA, `bodega_id`), `cierres_mercaderia` (cuadre de cada piloto en unidades y dinero). La bodega, los
movimientos y los cierres solo se escriben con las funciones `dist_*`.
**`empresa_id`** (obligatorio) en `regiones`, `tiendas`, `clientes`, `rutas`, `vehiculos`, `pedidos`,
`categorias_mercaderia`, `tarifas`, `descuentos` y las tablas de la distribuidora (salvo `pedido_productos`, que va
por su pedido); en `usuarios` es obligatorio salvo para el Desarrollador.
Valor por defecto: `empresa_principal()`. Triggers: pedidos y rutas toman la de su tienda; tiendas y
descuentos la de su región; tarifas la de su tienda o región; usuarios la de su tienda o región
(Administrador y G1, la que se elige). Funciones: `usuario_base`, `usuario_completo`,
`usuario_libre` (agrega un número si el usuario ya existe), `cambiar_codigo_empresa` (cambia el ID y renombra
a sus usuarios). Bloque 17: usuarios de tienda con la región y sin el número de la tienda. La página filtra sola por la empresa
activa (`js/supabase.js`, ver [secciones/empresas-internas.md](secciones/empresas-internas.md)).

**`regiones`** — zonas del país. `codigo` (3 letras MAYÚSCULAS, ej. `NOR`, único en todo el sistema),
`nombre`, `empresa_id`. Se administran en Tiendas → Regiones (Administrador y G1).

**`tiendas`** — `id`, `codigo` (único, `AAA-000`, las 3 letras = región), `region`, `nombre`,
`direccion`, `telefono`, `estado` (`activa` | `inactiva`), `lat`, `lng` (ubicación en el mapa: punto A
de sus entregas; la guardan Administrador y G1 desde el formulario de Pedidos; sql/01 bloque 9), `creado_en`.

**`usuarios`**

| Columna | Qué guarda |
|---|---|
| `id` | Número interno |
| `nombre`, `telefono` | Datos de la persona |
| `id_usuario` | Con lo que inicia sesión (único, minúsculas). Nombre + ID de la empresa al final: `jperez01`, en todos los roles (sin tienda ni región desde el bloque 31) |
| `empresa_id` | Su empresa interna (null solo el Desarrollador) |
| `clave` | **Siempre vacía**: la página escribe aquí la contraseña nueva (al crear o cambiar) y la base la pasa a Supabase Auth y la borra. La página no puede leerla (`usuarios_ocultar_clave()`: volver a ejecutarla si se agrega una columna a `usuarios`). ⚠ Desde la página, leer `usuarios` siempre con columnas (`usuarios(id)`), nunca `usuarios(count)` ni `select('*')`: dan "permission denied for table usuarios" |
| `auth_id` | Su acceso en Supabase Auth (`auth.users`). Lo pone solo la base |
| `rol` | `administrador`, `admin_g1`, `admin_g2`, `admin_g3`, `empleado`, `piloto`, `cliente` (bloque 19) |
| `cliente_id` | Solo el rol `cliente`: su fila en `clientes` (un acceso por cliente; al eliminar el cliente se elimina su usuario) |
| `tienda_id` | Su tienda (obligatoria para G3, Empleado y Piloto) |
| `region` | Su región (obligatoria solo para G2) |
| `foto_url` | Enlace de su foto (Storage `avatares`) |
| `aprobado`, `solicitado_por`, `solicitado_en` | Aprobación de usuarios creados por un G3 |
| `admin_ti` | Admin TI: da la llave de soporte al Desarrollador (Configuración → Soporte). Solo personal (no Piloto ni cliente); lo pone o quita el Administrador; el Desarrollador solo lo pone (Etapa 2C) |
| `vehiculo_id` | Vehículo asignado (solo pilotos) |
| `multitienda` | Piloto que puede trabajar en otras tiendas de su región |
| (módulos y funciones) | Ya no es una columna: tablas `funciones` (catálogo y roles que traen cada una) y `usuario_funciones` (lo que a un usuario se le dio o se le quitó). Ver "Acceso" |

Reglas: tienda/región según el rol; vehículo y multitienda solo pilotos; el usuario `admin` no se
elimina ni cambia de usuario o rol (trigger `proteger_admin`).

**`vehiculos`** — `placa` (única, MAYÚSCULAS), `tipo` (`camion`, `pickup`, `panel`, `moto`, `auto`, `microbus`), `marca`,
`estado` (`disponible`, `en_uso`, `mantenimiento`). `en_uso`/`disponible` los pone solo la base de datos
según los pedidos activos del piloto (función `recalcular_estado_vehiculo` + triggers); `mantenimiento`
no se toca. Transporte: `asientos`, `carga_kg`, `acepta_mascotas` (los usa la agenda para asignar el vehículo).
Los costos ya no van por vehículo (ver `costos_operacion`).

**`clientes`** — `tipo` (`persona` | `empresa`), `nombre`, `apellido1`, `apellido2` (opcional; **siempre
separados**), `razon_social` (empresa), `cedula`, `telefono`, `correo` (opcional, **no se repite dentro de la
empresa**), `direccion` (dirección escrita) y `ubicacion` (coordenadas `lat, lng` o enlace de Google Maps: son
campos distintos; Nuevo pedido, Viajes y Recolecciones guardan aquí el punto), `empresa_id`, y aprobación
(`aprobado`, `cambios_pendientes`, `solicitado_por`, `solicitado_en`). Calculada por la base (no se escribe):
`busqueda` (nombre, apellidos, razón social, cédula, correo y teléfono en dígitos, minúsculas y sin tildes; la usa
el buscador de clientes). Para mostrar el nombre: `nombre_completo(nombre, apellido1, apellido2)` en la base, o
juntar los tres en la página.
**`clientes_tiendas`** — qué tiendas atienden a cada cliente (muchos a muchos) y `ruta_id`: su **ruta de
entrega** en esa tienda (sql/01 bloque 16).

**`notificaciones`** — un aviso para un usuario: `tipo` (`pendiente`, `aprobado`, `rechazado`, `info`),
`titulo`, `mensaje`, `enlace` (ej. `#usuarios`), `referencia_tipo`/`referencia_id`, `leida`.

### Horarios: turnos del piloto y slots de despacho (una sola estructura, por empresa)

| Tabla | Qué guarda |
|---|---|
| `horarios_dias` | Cuántos horarios hay: `empresa_id`, `tipo` (`turno` = horario del piloto, `despacho` = slot), `dia` (**0 = la base**; 1 = lunes … 7 = domingo con horario propio; `cantidad` 0 = ese día no hay) |
| `horarios` | Las horas de cada uno: `tipo`, `dia`, `numero`, `abre` (solo turno: "Inicia desde", lo ven G2+), `inicio` (turno: "Hora inicio", a tiempo hasta aquí · despacho: desde), `fin` (turno: "Termina", límite de la marca tardía · despacho: hasta). Llave a `horarios_dias`: borrar el día borra sus horarios |
| `horarios_capacidad` | Pedidos por horario del piloto: sin región ni tienda = la base de la empresa; con región **o** tienda = un ajuste |
| `configuracion` | Ajustes de cada empresa (`empresa_id` + clave → valor JSON): `numero_pedido` (`automatico`/`manual`), `codigo_respaldo` (lista: `aleatorio`, `telefono`), `radio_marca_m`. Sin la fila: automático, aleatorio y 150 m |

Funciones `marcas_del_dia(fecha, empresa)` y `slots_del_dia(fecha, empresa)`: los que aplican a una fecha (los del
día o los de la base). Prioridad de la capacidad: tienda > región > base. La **marca** (horario del piloto) solo la
ven el piloto y Admin G2 en adelante. Los slots no tienen límite de pedidos.

### Marcas del piloto y QR

| Tabla | Qué guarda |
|---|---|
| `marcas_piloto` | Cada marca, lo mínimo: `piloto_id`, `fecha`, `numero` (horario), `marcado_en`, `a_tiempo`, `justificacion` (solo si fue tardía, máx. 200), `lat`, `lng`, `distancia_m`. Lo de meses anteriores se borra solo |
| `qr_tiendas_fijo` | Código del **QR fijo** de cada tienda (`tienda_id`, `codigo`). Sin acceso directo desde la página |
| `pilotos_dia` | **QR del día** de cada piloto (`token`) y su validación en tienda (`validado_en`, `validado_por`) |

| Función | Qué hace |
|---|---|
| `ahora_local()` | Fecha y hora de Costa Rica (cambiar aquí si la empresa está en otra zona) |
| `qr_tienda_fija(tienda, nuevo)` | Texto del QR fijo (`ACACHETE-TIENDA:<tienda>:<código>`); `nuevo` = otro código |
| `marcar_por_qr_fijo(piloto, qr, justificacion, lat, lng, precision)` | El piloto escanea el QR fijo **estando en la tienda** (GPS, radio `radio_marca_m`) y se marca su horario abierto. Si es tardía y no trae justificación responde `JUSTIFICAR:…` y la app pide el motivo |
| `qr_piloto_dia(piloto)` | Texto del QR del día del piloto (`ACACHETE-PILOTO:<token>`) |
| `piloto_qr_info(token)`, `validar_y_marcar_piloto(token, usuario, justificacion)` | La tienda escanea el QR del día: ve la ficha y valida y marca en un solo paso |

El QR de marcas **mensual** (`qr_marcas`, `marcar_por_qr`) se quitó en la reconstrucción: lo reemplaza el QR fijo.

Ninguno de los QR lleva datos personales: solo un código que la base reconoce. El QR del pedido es
`ACACHETE-PEDIDO:<token_qr>`.

### Visitas (solo Desarrollador; sql/01 bloque 36)

| Tabla | Qué guarda |
|---|---|
| `visitas` | Cada ingreso y cada pantalla abierta: `usuario_id`, `empresa_id`, `tipo` (`ingreso` / `pantalla`), `seccion`, `dispositivo`, `navegador`, `app` (app instalada), `ip`, `pais`, `creado_en`. **Solo 3 días**: lo más viejo se borra al anotar y al pedir el reporte. Sin acceso directo desde la web |

| Función | Qué hace |
|---|---|
| `registrar_visita(usuario, tipo, seccion, dispositivo, navegador, app)` | La llama la página (`registrarVisita` en `js/sesion.js`). La IP y el país los toma de la llamada (`request.headers`). No anota al Desarrollador |
| `reporte_visitas(usuario, empresa)` | Las visitas con empresa, usuario, rol y tienda (máx. 5000). Solo responde si `usuario` es Desarrollador |

### Soporte: llave del Admin TI y bitácora (Etapa 2C)

| Tabla | Qué guarda |
|---|---|
| `soporte_llaves` | Llaves para el Desarrollador: `empresa_id`, `codigo` (**cifrado**), `alcance` (`ver` / `corregir`), `creada_por`, `vence_en`, `usada_por`, `usada_en`, `anulada_por`, `anulada_en`. Sin acceso directo desde la web |
| `soporte_bitacora` | `empresa_id`, `usuario_id`, `usuario`, `accion`, `tabla`, `registro`, `detalle`, `creado_en`. La leen el Admin TI y el Administrador de la empresa; **nadie la cambia ni la borra** (solo el SQL Editor) |

| Función | Qué hace |
|---|---|
| `soporte_crear_llave(horas, alcance)` | Admin TI o Administrador: llave de 1, 4 o 24 h; anula la anterior y devuelve el código una vez |
| `soporte_anular_llave(id)`, `soporte_llaves_empresa()` | Anular una llave; las últimas 30 de la empresa (sin el código) |
| `soporte_usar_llave(empresa, codigo)` | El Desarrollador entra con la llave; avisa al Administrador y al Admin TI. 5 códigos equivocados en 30 min: anula la llave sin usar y avisa |
| `soporte_estado(empresa)` | Para el aviso de soporte del Desarrollador (en la campana): si la empresa tiene Admin TI y su llave en uso |
| `soporte_anotar_vista(empresa, seccion)` | Pantalla que abrió el Desarrollador con la llave (la llama `registrarVisita`) |
| `soporte_emergencia(usuario, accion)` | El Desarrollador, sin llave: `bloquear`, `desbloquear` o `cerrar_sesiones` |
| `soporte_empresas(nivel)`, `soporte_puede(empresa, nivel)` | En qué empresas el Desarrollador puede `config`, `ver` o `corregir` (las usan las reglas y las funciones) |
| `soporte_anotar_cambio()` | Trigger en todas las tablas: anota lo que crea, cambia (qué campos) o borra el Desarrollador |

### Configuración de pedidos

| Tabla | Qué guarda |
|---|---|
| `actividades` | `codigo` (`tienda`, `encomiendas`, `transporte`, `masajes`, `distribucion`, `recoleccion`; se agregan desde Configuración → Actividades), `nombre`, `descripcion`, `icono`, `activa`, `orden`; qué usa en el pedido: `usa_bodega`, `usa_punto_partida` (punto A del paquete), `usa_compra`, `usa_tamanos`, `permite_alcohol`; qué partes usa: `usa_vehiculos`, `usa_km`, `usa_peso`, `usa_productos`, `usa_caja`; con agenda propia en vez de pedidos: `usa_viajes` (Viajes) y `usa_recolecciones` (Recolecciones); cómo llama al registro y al conductor: `palabra_registro`, `palabra_registros`, `palabra_conductor`, `palabra_conductores` (vacío = pedido / piloto; `js/palabras.js`) |
| `transporte_config` | Reglas de transporte de cada empresa (una fila por `empresa_id`): agenda (acercamiento, colchón, velocidad, anticipación, plazo para cancelar, zona horaria), recargos fijos, redondeo y cortesía |
| `transporte_franjas` | Precio por km según la hora de recogida: `dias` (1 = lunes … 7 = domingo), `desde`, `hasta`, `cargo_base`, `precio_km`, `minimo`, `activa`. Trigger `franjas_sin_encimar` |
| `transporte_dias_cerrados` | `empresa_id` + `fecha` + `motivo`: ese día no se reserva |
| `costos_operacion` | Gastos del mes de la empresa: `concepto`, `tipo` (`fijo` / `variable`), `monto_mes` (el combustible es un gasto más) |
| `costos_config` | `margen_objetivo` (% de utilidad deseado) y `trabajos_mes` (entregas o viajes al mes; vacío = los reales) |
| `viajes` | Viajes (código `V-000001`): cliente, A y B (dirección y punto), km, minutos, personas, mascotas, mercadería, `inicio` y bloque del vehículo, vehículo, conductor, franja, precio, recargos, total, `desglose`, cortesía, estado y horas de cada paso. **La página solo lee**: se escribe con `viajes_solicitar`, `viajes_cambiar_hora`, `viajes_cancelar` y `viajes_avanzar` |
| `cortesias` | Viajes de cortesía ganados: cliente, `ganada_en`, `vence_en`, `usada_viaje_id`. Solo lectura desde la página |
| `categorias_mercaderia` | Casillas del pedido por actividad: `nombre`, `tipo` (`conteo`, `articulos`, `bulto`, `documento`), `icono`, `peso_referencia` (documentos), `activa`, `orden` |
| `articulos_catalogo` | Pesos promedio: `categoria_id`, `nombre`, `peso_kg`, `activo`, `orden` |
| `tamanos_bulto` | S/M/L/XL con medidas (solo referencia, no cambian el precio) |
| `tarifas` | Por actividad y alcance (general, región o tienda): `cargo_fijo`, `minimo`, `kg_incluidos`, `precio_kg`, `precio_km` (futuro), `envio_gratis_desde` |
| `descuentos` | `nombre`, `tipo` (`porcentaje`/`monto`), `valor`, `actividad` y `region` (vacío = todas), `activo` |
| `motivos_retraso` | Lista para el cierre de entrega, por empresa y por `actividad` (vacía = para todas) |

**Por empresa:** `categorias_mercaderia` (nombre único por empresa y actividad), sus `articulos_catalogo`, `tarifas`
(una general por empresa y actividad), `descuentos`, `motivos_retraso`, horarios, slots y `configuracion`. Al crear
una empresa (Tiendas → Empresas) se le copian los de la empresa activa. **Compartidos** (solo el Desarrollador los
cambia): `actividades` (qué hace cada empresa está en `empresas.actividades`) y `tamanos_bulto`.

### Rutas

**`rutas`** — `tienda_id`, `nombre` (único por tienda), `actividad` (vacío = todas), `activa`, `orden`.
**`rutas_pilotos`** — piloto en una ruta `fecha_desde` a `fecha_hasta` (máx. 31 días).

### Pedidos (nunca se borran)

**`pedidos`**

| Grupo | Columnas |
|---|---|
| Identificación | `codigo` (P-000001 o manual), `token_qr` (lo que lleva el QR), `codigo_respaldo`, `codigo_telefono`, `actividad`, `tienda_id`, `ruta_id` |
| Cliente (copia) | `cliente_id`, `cliente_nombre`, `cliente_telefono` |
| Direcciones | `direccion_partida` (punto A, actividades con `usa_punto_partida`), `direccion_entrega`, `distancia_km` (km por calle de A a B, del mapa) |
| Quién recibe | `recibe_tipo` (`cliente`/`autorizado`), `recibe_nombre`, `recibe_telefono` |
| Planificación | `fecha_entrega`, `slot_numero` (slot de despacho), `marca_numero` (horario del piloto), `piloto_id` |
| Mercadería | `peso_total_kg`, `lleva_alcohol`, `detalle` (JSON: categorías, conteo de abarrotes, documentos y `ruta`: `{ origen, a: {lat,lng}, b: {lat,lng}, km, minutos, aproximada }`) |
| Cobro | `monto_compra`, `cobrar_compra`, `costo_envio`, `descuento_id`, `costo_desglose` (JSON: copia de la tarifa y el cálculo), `total_cobrar`, `forma_pago`, `paga_con`, `vuelto` |
| Estado | `estado`, `anulado` (ya no se usa: se cancela), `motivo_cancelacion`, `notas` |
| Auditoría | `creado_por`, `creado_en`, `actualizado_en`, `cargado_por` (quién cargó o escaneó) |

Estados: `registrado`, `recibido_bodega`, `asignado` (ya tiene piloto), `alistando`, `listo_despacho`,
`recibido_ruta`, `cargado`, `en_ruta`, `en_entrega`, `entregado`, `entregado_incidencia`, `no_entregado`,
`no_salio`, `reprogramado`, `devuelto`, `cancelado`. Solo **un** pedido `en_entrega` por piloto (índice `pedidos_un_en_entrega`).

**Cambios de estado (Etapa 2D):** solo con funciones de la base, que revisan quién puede y escriben `pedido_historial`:

| Función | Qué hace |
|---|---|
| `pedido_estado(p)` | Los botones del pedido: En bodega, Alistando, Listo para despachar (con slot), Cargado (la tienda escanea), Entregado (con cobro, mayoría de edad y cierre en `pedido_entregas`), No entregado, Devuelto y Cancelado (con motivo). `visto`: si otro ya lo cambió, error con hint `cambiado` |
| `pedido_asignar(p)` | Fecha, horario, ruta y piloto, o reprogramar; calcula el estado (Asignado / Registrado / En bodega / Reprogramado) |
| `pedidos_liberar_piloto(usuario, piloto, tienda)` | Usuarios: el piloto deja una tienda y sus pedidos de otras tiendas quedan sin piloto |
| `pedido_cargar`, `piloto_salir_ruta`, `pedido_iniciar_entrega`, `dist_entregar`, `dist_venta_ruta` | Carga con foto, salida a ruta por slot, inicio de la entrega con el QR y entregas de la distribuidora |

- `pedidos_revisar_cambio`: desde la página, un pedido nuevo empieza registrado, en bodega o asignado, y después no se le
  cambia directo el estado, piloto, fecha, horario, slot, ruta, carga, cobro ni caja (sí sus datos: cliente, dirección,
  detalle, notas).
- `pedidos_historial_obligatorio` (al terminar cada transacción): si un cambio de estado no quedó en el historial, lo anota.
- `pedido_historial_revisar`: lo que la página agrega al historial va a nombre del usuario de la sesión y no puede ser un
  cambio de estado (salvo el "Registrado" del pedido nuevo).

**Hora de cada paso:** ya no son columnas de `pedidos`; salen del historial con la vista `pedidos_pasos`: `alistando_en`
y `listo_en` (la primera vez), `recibido_ruta_en`, `cargado_en`, `salida_en`, `entregando_en` y `finalizado_en` (la
última). La fecha de la entrega para la Caja sale de `pedido_entregas.entregado_en`.

**Calculador interno** (no se ve en pantalla; para estadísticas futuras; las dos vistas leen `pedidos_pasos`):
- Vista `pedidos_tiempos`: minutos de cada pedido — `min_hasta_listo` (creado → listo para despachar),
  `min_espera_alistar`, `min_alistando`, `min_espera_carga`, `min_cargado_a_salida`, `min_en_ruta`,
  `min_ultimo_tramo`, `min_total`.
- Vista `slots_carga`: por tienda + fecha + slot — pedidos, cargados, `completo`, primer y último escaneo,
  primera salida, `min_carga` (primer escaneo → "Saliendo a ruta") y `min_carga_todos` (primer → último escaneo).

| Tabla | Qué guarda |
|---|---|
| `pedido_articulos` | Cada línea: `categoria_id`, `categoria` (copia del nombre), `descripcion`, `cantidad`, `tamano`, `peso_kg` (**de cada uno**). Abarrotes (conteo): una línea por tipo (`Cajas` 5, `Bolsas` 2...) con el peso aproximado repartido por pieza |
| `pedido_historial` | Línea de tiempo: `evento`, `estado_anterior`, `estado_nuevo`, `detalle` (JSON), usuario, fecha (solo agregar) |
| `pedido_entregas` | Cierre de entrega (app del piloto): validado con QR o código, quién recibió, satisfecho, mercadería buena, retraso y motivo, mayoría de edad, ubicación |
| `pedido_evidencias` | Fotos (Storage `evidencias`): `tipo` (`entrega`, `mal_estado`, `retraso`, `recepcion`, `carga`, `pago`); `eliminada_en` cuando se borra la foto a los 12 meses |

Funciones: trigger `pedidos_antes_de_crear` (número y código de respaldo) y
`validar_codigo_respaldo(pedido, código)` (para la app del piloto).

**Copias intencionales:** el pedido guarda nombre y teléfono del cliente, nombre de la categoría y la
tarifa usada. Es a propósito: el historial muestra lo que pasó aunque luego cambien. No "arreglarlo".

### Archivos (Storage)

| Bucket | Qué | Límite |
|---|---|---|
| `avatares` | Fotos de usuario `usuarios/<id>.jpg` | 2 MB, JPG/PNG/WEBP |
| `evidencias` | Fotos de entregas | 5 MB, JPG/PNG/WEBP |

## Acceso: Supabase Auth y reglas RLS (Etapa 2A, 2026-10-21)

**Inicio de sesión:** cada usuario tiene su acceso en Supabase Auth con un correo interno que nadie ve
(`jperez01@acachete.interno`). La base lo crea, le cambia la contraseña o el correo y lo borra junto con el usuario
(`usuarios_sincronizar_acceso`, `usuarios_borrar_acceso`). La página entra con `db.auth.signInWithPassword`
(`js/secciones/loggin.js`).

**¿Quién soy?** (`01_base.sql`): `yo()`, `yo_usuario()`, `mi_empresa()`, `mi_cliente()`, `es_desarrollador()`,
`es_personal()`, `ve_empresa(id)`, `configura_empresa(id)`, `es_admin_ti()`, `mi_rol()`, `mi_region()`, `mis_tiendas()`, `mis_pilotos()` y
`puede('modulo.funcion')`. `puede` usa `tiene_funcion` con las tablas `funciones` (catálogo y roles que traen cada
una: la única lista, la página la lee de aquí) y `usuario_funciones` (lo que a un usuario se le dio o quitó). La
página lee lo suyo con `mis_funciones()` y lo guarda con `usuario_guardar_funciones(usuario, marcadas)`. Desde el SQL Editor no hay sesión: `llamada_interna()` es verdadero y las funciones
confían en los datos que reciben.

**Reglas** (`11_acceso_web.sql`, helper `reglas_tabla(tabla, leer, escribir)`):

| Quién | Ve | Cambia |
|---|---|---|
| Sin sesión | Solo `actividades` activas | Nada (solo el registro de clientes y la ubicación por enlace, con sus funciones) |
| Personal de la empresa | Todo lo de su empresa | Lo de su empresa, salvo las tablas que solo se cambian con funciones |
| Cliente | Su ficha, sus pedidos, viajes, solicitudes, recolecciones y cobros; los catálogos de la empresa; el conductor de sus viajes | Sus solicitudes de envío (crearlas y cancelarlas mientras están pendientes) y sus datos personales |
| Desarrollador (Etapa 2C) | La configuración y el personal de todas las empresas; los datos (clientes, pedidos, viajes, inventario, precios, cajas, costos), solo con la llave de soporte de la empresa | La configuración, tiendas y usuarios de una empresa sin Admin TI (puesta en marcha) o con la llave "Ver y corregir"; los datos, con esa llave. Siempre: el plan y si la empresa está activa, `actividades`, `tamanos_bulto` y `funciones`, y las acciones de emergencia |

- **Solo con funciones:** `viajes`, `cortesias`, `recolecciones`, `cierres_caja`, `ubicaciones_pilotos`,
  `bodegas_dia`, `bodega_movimientos`, `cierres_mercaderia`, `marcas_piloto` y `pilotos_dia`. Sin acceso directo:
  `visitas`, `qr_tiendas_fijo` y `ubicaciones_compartidas`. Pedidos, entregas, evidencias y ajustes no se borran; el
  historial solo se agrega.
- **Funciones:** sin sesión no se ejecuta ninguna (salvo las 5 del registro y la ubicación por enlace). Con sesión,
  todas menos las internas. `usuario_activo(id)` confirma que el id que manda la página es el de la sesión.
- **Usuarios:** `usuarios_revisar_cambio` revisa cada cambio directo, con las reglas de `js/secciones/usuarios.js`.
  En su propio usuario cada uno solo cambia nombre, teléfono, cédula, departamento, foto y contraseña.
- `usuarios.clave`: siempre vacía (buzón de la contraseña nueva) y no se puede leer. Desde la página, leer `usuarios`
  siempre con columnas, nunca `select('*')`.
- **Alcance dentro de la empresa (Etapa 2B):**
  - **Pedidos** (y sus partes) **y cierres de caja**: Administrador y G1 todo; G2 su región; G3 y Empleado su tienda,
    más los pilotos de su tienda aunque lleven pedidos de otra; Piloto, los suyos.
  - **Viajes**: el conductor solo ve los suyos.
  - **Clientes y usuarios** se ven en toda la empresa. Así se encuentra al cliente aunque se registrara en otra tienda,
    y los avisos llegan a los administradores.
- **Escribir por función (Etapa 2B):**

  | Función o rol | Cambia |
  |---|---|
  | `configuracion.general` | Tarifas, descuentos, motivos, horarios, ajustes, transporte, costos, cajas, categorías y artículos |
  | G2 | Tarifas, descuentos y pedidos por horario de su región; vehículos |
  | `distribucion.catalogo` | Productos y precios |
  | `rutas.gestionar` | Rutas (los pilotos de cada ruta: `rutas.gestionar` o `usuarios.modificar`) |
  | `tiendas.gestionar` | Regiones |
  | `recolecciones.atender` | Bloqueos y horario de recolecciones |
  | `recolecciones.cobrar` | Tarifas y cobros de recolecciones |
- Solicitud de usuario del cliente: `registro_clientes_empresa(codigo)` y `solicitar_acceso_cliente(p)` (bloque 20)
  revisan la empresa (activa y con Transporte), los datos, duplicados por teléfono o correo, máximo 20 solicitudes por
  hora y crean cliente + usuario **sin aprobar**.

En la página (`js/supabase.js`): `select`, `update` y `delete` de las tablas por empresa llevan siempre la empresa
activa; sin empresa activa, `delete` no borra nada.

> Supabase devuelve como máximo **1000 filas** por consulta (ajuste "Max Rows" del proyecto, en la
> configuración de la API). Si los reportes crecen más, subir ese valor o paginar.
