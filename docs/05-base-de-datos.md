# 5. Base de datos (Supabase / PostgreSQL)

Conexión: `js/supabase.js` (objeto `db`), usando la base de la empresa activa (`empresas/empresas.js`).
Consulta típica: `const { data, error } = await db.from('tiendas').select('id, codigo').eq('region', 'CEN');`

## Scripts SQL (`sql/`)

**Cómo ejecutar:** Supabase → SQL Editor → New query → pegar el archivo completo → Run.

Hay **solo dos** scripts:

| Script | Qué hace | Cuándo |
|---|---|---|
| `00_instalacion_completa.sql` | **Toda** la base en blanco, organizada en 11 secciones (ver abajo). Los roles, reglas y tablas están en su versión final, cada cosa en un solo lugar | Una vez, en un proyecto de Supabase **nuevo** |
| `01_actualizacion_base_existente.sql` | Pone al día una base que ya está en uso: asegura todas las funciones que usa la página (admin protegido, cambiar código de tienda, horarios del día, número y código de respaldo, validar código, vehículo en uso), rutas y multitienda, tipo de vehículo, qué usa cada actividad y categorías de encomiendas. Se puede volver a ejecutar sin error | En la base actual (y en cualquier base creada antes de un cambio) |

Secciones de `00` (los comentarios del código las citan como "sql/00, sección N"):
1 regiones y tiendas · 2 vehículos · 3 usuarios y roles · 4 clientes y notificaciones ·
5 configuración y horarios · 6 actividades y configuración de pedidos · 7 rutas · 8 pedidos ·
9 vehículo "en uso" automático · 10 acceso desde la web · 11 archivos (fotos) ·
12 **empresas internas** (= bloque 16 de `01`).

Bloques de `01`: 1 a 15 (ver su cabecera) y **16 · empresas internas** (2026-10-02): tabla `empresas`,
`empresa_id` en las tablas de cada empresa, usuarios con el ID de la empresa (⚠ **renombra una sola vez**
a los usuarios que ya existían: `cen-001-jperez` → `cenjperez01`; avisarles), regiones editables desde
la página y ruta de entrega del cliente por tienda.

**Regla para cambios de estructura** (no crear archivos nuevos):
1. Agregar el cambio en su sección de `00_instalacion_completa.sql` (para las bases nuevas).
2. Agregarlo como un bloque más **al final** de `01_actualizacion_base_existente.sql`, escrito para
   poder repetirse (`add column if not exists`, `drop constraint if exists`, `on conflict do nothing`).
3. Ejecutar `01` en la base de cada empresa que ya exista.

Nunca crear columnas a mano en el Table Editor.

**Vaciar (empezar de cero):** `herramientas/vaciar_base_datos.sql` primero pide **qué empresa** se limpia (PASO 1
del archivo); sin escribirla se detiene sin borrar nada.
- **Una empresa:** su ID (`'02'`) y, para confirmar, su nombre exacto. Borra solo sus datos (pedidos, viajes,
  clientes, rutas, vehículos, usuarios, tiendas, regiones, tarifas, descuentos, categorías y su configuración de
  transporte); las demás empresas y lo que es de todo el sistema (actividades, horarios, slots) no se tocan. Puede
  conservar sus Administradores (`conservar_administradores`) y borrar la empresa al final (`borrar_empresa`).
- **Toda la base:** `'TODAS'` + `'BORRAR TODO'`: borra todo (también la configuración) y reinicia los contadores, sin
  tocar la estructura. Después se ejecuta `01_actualizacion_base_existente.sql` y luego `00_instalacion_completa.sql`
  (valores de fábrica).

Las fotos de Storage se borran a mano (Storage → `avatares` / `evidencias`). No se puede deshacer.

Si la página dice "Falta instalar la base de datos", falta `00`; si dice "Falta ejecutar
sql/01_actualizacion_base_existente.sql", falta la actualización.

## Tablas

### Organización

**`empresas`** (sql/01 bloque 16) — empresas internas: `id`, `codigo` (ID de 2 números, `01`, único; va al
final de sus usuarios), `nombre` (único), `actividades` (`{tienda,encomiendas}`, al menos una), `activa`
(inactiva = sus usuarios no entran), `colores` (paleta: `{"color-azul": "#5A6B34", ...}`, `{}` = la de la marca;
se pinta al iniciar sesión con un usuario de la empresa; bloque 21), `creado_en`. La primera es la "Empresa principal" (`01`).
**`empresa_id`** (obligatorio) en `regiones`, `tiendas`, `clientes`, `rutas`, `vehiculos`, `pedidos`,
`categorias_mercaderia`, `tarifas` y `descuentos`; en `usuarios` es obligatorio salvo para el Desarrollador.
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
| `id_usuario` | Con lo que inicia sesión (único, minúsculas). Lleva el ID de la empresa al final: `cenjperez01` (G3/Empleado/Piloto: región + nombre, sin la tienda), `jperez01` (Administrador/G1/G2) |
| `empresa_id` | Su empresa interna (null solo el Desarrollador) |
| `clave` | Contraseña **cifrada** (bcrypt, bloque 20): la cifra la base sola (`cifrar_clave`), el login la compara con `iniciar_sesion` y la página no puede leerla (`usuarios_ocultar_clave()`: volver a ejecutarla si se agrega una columna a `usuarios`). ⚠ Desde la página, leer `usuarios` siempre con columnas (`usuarios(id)`), nunca `usuarios(count)` ni `select('*')`: dan "permission denied for table usuarios" |
| `rol` | `administrador`, `admin_g1`, `admin_g2`, `admin_g3`, `empleado`, `piloto`, `cliente` (bloque 19) |
| `cliente_id` | Solo el rol `cliente`: su fila en `clientes` (un acceso por cliente; al eliminar el cliente se elimina su usuario) |
| `tienda_id` | Su tienda (obligatoria para G3, Empleado y Piloto) |
| `region` | Su región (obligatoria solo para G2) |
| `foto_url` | Enlace de su foto (Storage `avatares`) |
| `aprobado`, `solicitado_por`, `solicitado_en` | Aprobación de usuarios creados por un G3 |
| `vehiculo_id` | Vehículo asignado (solo pilotos) |
| `multitienda` | Piloto que puede trabajar en otras tiendas de su región |
| `permisos` | Lista de secciones (**no se usa**: `USAR_PERMISOS = false`) |

Reglas: tienda/región según el rol; vehículo y multitienda solo pilotos; el usuario `admin` no se
elimina ni cambia de usuario o rol (trigger `proteger_admin`).

**`vehiculos`** — `placa` (única, MAYÚSCULAS), `tipo` (`camion`, `pickup`, `panel`, `moto`, `auto`, `microbus`), `marca`,
`estado` (`disponible`, `en_uso`, `mantenimiento`). `en_uso`/`disponible` los pone solo la base de datos
según los pedidos activos del piloto (función `recalcular_estado_vehiculo` + triggers); `mantenimiento`
no se toca. Transporte (bloque 19): `asientos`, `carga_kg`, `acepta_mascotas` (los usa la agenda para asignar
el vehículo) y `km_por_litro`, `horas_mes`, `km_mes` (costos).

**`clientes`** — `nombre`, `apellido1`, `apellido2` (opcional), `telefono`, `correo` (opcional, **no se
repite dentro de la empresa**), `direccion`, `ubicacion` (texto, enlace o coordenadas `lat, lng`: Nuevo pedido
guarda el punto de entrega), `empresa_id`, y aprobación (`aprobado`, `cambios_pendientes`, `solicitado_por`,
`solicitado_en`). Calculadas por la base (no se escriben): `apellidos` (= apellido1 + apellido2) y
`busqueda` (nombre, apellidos, correo y teléfono en dígitos, minúsculas y sin tildes; la usa el buscador de
clientes de Pedidos). sql/01 bloque 11. Transporte (bloque 19): `casa_direccion`, `casa_lat`, `casa_lng`,
`trabajo_direccion`, `trabajo_lat`, `trabajo_lng` (sus dos lugares para armar la ruta de un viaje).
**`clientes_tiendas`** — qué tiendas atienden a cada cliente (muchos a muchos) y `ruta_id`: su **ruta de
entrega** en esa tienda (sql/01 bloque 16).

**`notificaciones`** — un aviso para un usuario: `tipo` (`pendiente`, `aprobado`, `rechazado`, `info`),
`titulo`, `mensaje`, `enlace` (ej. `#usuarios`), `referencia_tipo`/`referencia_id`, `leida`.

### Horarios (en pantalla "horario", en la base "marca")

| Tabla | Qué guarda |
|---|---|
| `configuracion` | Valores generales clave → valor (JSON): `cantidad_marcas`, `pedidos_por_marca`, `numero_pedido` (`automatico`/`manual`), `codigo_respaldo` (lista: `aleatorio`, `telefono`) |
| `marcas_horario` | Horarios base: `numero`, `inicio_desde` ("Inicia desde", solo G2+), `inicio_hasta` ("Hora inicio": a tiempo hasta aquí), `fin` ("Termina": límite de la marca tardía) |
| `horario_dias` + `marcas_dia` | Días con horario propio (1 = lunes ... 7 = domingo; 0 marcas = descanso) |
| `capacidad_marcas` | Pedidos por horario distintos para una región **o** una tienda |

Función `marcas_del_dia(fecha)`: horarios que aplican a una fecha (los del día o los de la base).
Prioridad de la capacidad: tienda > región > base. La **marca** (horario del piloto) solo la ven el piloto y
Admin G2 en adelante.

### Marcas del piloto y QR (sql/01 bloques 13 y 14)

| Tabla | Qué guarda |
|---|---|
| `marcas_piloto` | Cada marca, lo mínimo (~60 bytes): `piloto_id`, `fecha`, `numero` (horario), `marcado_en`, `a_tiempo`, `justificacion` (solo si fue tardía, máx. 200). Lo de meses anteriores se borra solo |
| `qr_marcas` | Código del **QR de marcas** de cada tienda, uno por mes (`tienda_id`, `mes`, `codigo`). Sin acceso directo desde la página |
| `pilotos_dia` | **QR del día** de cada piloto (`token`) y su validación en tienda (`validado_en`, `validado_por`) |

| Función | Qué hace |
|---|---|
| `ahora_local()` | Fecha y hora de Costa Rica (cambiar aquí si la empresa está en otra zona) |
| `qr_marca_mes(tienda)` | Texto del QR de marcas del mes (`ACACHETE-MARCA:<tienda>:<código>`); lo crea si falta |
| `qr_piloto_dia(piloto)` | Texto del QR del día del piloto (`ACACHETE-PILOTO:<token>`) |
| `validar_piloto(token, usuario)` | La tienda escanea el QR del día: lo valida y devuelve nombre, foto y tienda |
| `marcar_por_qr(piloto, qr, justificacion)` | El piloto escanea el QR de marcas: revisa que sea el del mes y que esté validado hoy, y marca el horario abierto ("inicia desde" → "termina"; a tiempo hasta la "hora inicio"). Si es tardía y no trae justificación responde `JUSTIFICAR:…` y la app pide el motivo |

Ninguno de los QR lleva datos personales: solo un código que la base reconoce. El QR del pedido es
`ACACHETE-PEDIDO:<token_qr>`.

### Slots (rango de horario de despacho del pedido; sql/01 bloque 12)

| Tabla | Qué guarda |
|---|---|
| `configuracion` | `cantidad_slots` |
| `slots_horario` | Slots base: `numero`, `inicio`, `fin` |
| `slot_dias` + `slots_dia` | Días con slots propios (0 = no se despacha) |

Función `slots_del_dia(fecha)`: slots que aplican a una fecha. Sin límite de pedidos por slot.

### Configuración de pedidos

| Tabla | Qué guarda |
|---|---|
| `actividades` | `codigo` (`tienda`, `encomiendas`, `transporte`; se agregan desde Configuración → Actividades), `nombre`, `descripcion`, `icono`, `activa`, `orden`; qué usa: `usa_bodega`, `usa_recoleccion`, `usa_compra`, `usa_tamanos`, `permite_alcohol`, `usa_viajes` (trabaja con viajes en vez de pedidos; bloque 19); cómo llama al registro y al conductor: `palabra_registro`, `palabra_registros`, `palabra_conductor`, `palabra_conductores` (vacío = pedido / piloto; bloque 18, `js/palabras.js`) |
| `transporte_config` | Reglas de transporte de cada empresa (una fila por `empresa_id`): agenda (acercamiento, colchón, velocidad, anticipación, plazo para cancelar, zona horaria), recargos fijos, redondeo, cortesía y precio del litro. Bloque 19 |
| `transporte_franjas` | Precio por km según la hora de recogida: `dias` (1 = lunes … 7 = domingo), `desde`, `hasta`, `cargo_base`, `precio_km`, `minimo`, `activa`. Trigger `franjas_sin_encimar` |
| `transporte_dias_cerrados` | `empresa_id` + `fecha` + `motivo`: ese día no se reserva |
| `transporte_costos` | Gastos del mes: `concepto`, `tipo` (`fijo` / `variable`), `monto_mes`, `vehiculo_id` (vacío = toda la empresa) |
| `viajes` | Viajes (código `V-000001`): cliente, A y B (dirección y punto), km, minutos, personas, mascotas, mercadería, `inicio` y bloque del vehículo, vehículo, conductor, franja, precio, recargos, total, `desglose`, cortesía, estado y horas de cada paso. **La página solo lee**: se escribe con `viajes_solicitar`, `viajes_cambiar_hora`, `viajes_cancelar` y `viajes_avanzar` |
| `cortesias` | Viajes de cortesía ganados: cliente, `ganada_en`, `vence_en`, `usada_viaje_id`. Solo lectura desde la página |
| `tiendas_actividades` | **Ya no se usa**: las actividades activas aplican a todas las tiendas (se puede quitar en una limpieza futura) |
| `categorias_mercaderia` | Casillas del pedido por actividad: `nombre`, `tipo` (`conteo`, `articulos`, `bulto`, `documento`), `icono`, `peso_referencia` (documentos), `activa`, `orden` |
| `articulos_catalogo` | Pesos promedio: `categoria_id`, `nombre`, `peso_kg`, `activo`, `orden` |
| `tamanos_bulto` | S/M/L/XL con medidas (solo referencia, no cambian el precio) |
| `tarifas` | Por actividad y alcance (general, región o tienda): `cargo_fijo`, `minimo`, `kg_incluidos`, `precio_kg`, `precio_km` (futuro), `envio_gratis_desde` |
| `descuentos` | `nombre`, `tipo` (`porcentaje`/`monto`), `valor`, `actividad` y `region` (vacío = todas), `activo` |
| `motivos_retraso` | Lista para el cierre de entrega |

**Por empresa** (sql/01 bloque 16): `categorias_mercaderia` (nombre único por empresa y actividad), sus
`articulos_catalogo`, `tarifas` (una general por empresa y actividad) y `descuentos`. **Compartidos**:
`actividades` (qué hace cada empresa está en `empresas.actividades`), `tamanos_bulto`, `motivos_retraso`,
horarios, slots y `configuracion`.

### Rutas

**`rutas`** — `tienda_id`, `nombre` (único por tienda), `actividad` (vacío = todas), `activa`, `orden`.
**`rutas_pilotos`** — piloto en una ruta `fecha_desde` a `fecha_hasta` (máx. 31 días).

### Pedidos (nunca se borran)

**`pedidos`**

| Grupo | Columnas |
|---|---|
| Identificación | `codigo` (P-000001 o manual), `token_qr` (lo que lleva el QR), `codigo_respaldo`, `codigo_telefono`, `actividad`, `tienda_id`, `ruta_id` |
| Cliente (copia) | `cliente_id`, `cliente_nombre`, `cliente_telefono` |
| Direcciones | `direccion_recoleccion`, `direccion_entrega`, `distancia_km` (km por calle de A a B, del mapa) |
| Quién recibe | `recibe_tipo` (`cliente`/`autorizado`), `recibe_nombre`, `recibe_telefono` |
| Planificación | `fecha_entrega`, `slot_numero` (slot de despacho), `marca_numero` (horario del piloto), `piloto_id` |
| Mercadería | `peso_total_kg`, `lleva_alcohol`, `detalle` (JSON: categorías, conteo de abarrotes, documentos y `ruta`: `{ origen, a: {lat,lng}, b: {lat,lng}, km, minutos, aproximada }`) |
| Cobro | `monto_compra`, `cobrar_compra`, `costo_envio`, `descuento_id`, `costo_desglose` (JSON: copia de la tarifa y el cálculo), `total_cobrar`, `forma_pago`, `paga_con`, `vuelto` |
| Estado | `estado`, `anulado` (ya no se usa: se cancela), `motivo_cancelacion`, `notas` |
| Auditoría | `creado_por`, `creado_en`, `actualizado_en` |
| Hora de cada paso (las pone el trigger `pedidos_tiempos`) | `alistando_en`, `listo_en`, `recibido_ruta_en`, `cargado_en` (+ `cargado_por`: quién escaneó), `salida_en`, `entregando_en`, `finalizado_en` |

Estados: `registrado`, `recibido_bodega`, `asignado` (ya tiene piloto), `alistando`, `listo_despacho`,
`recibido_ruta`, `cargado`, `en_ruta`, `en_entrega`, `entregado`, `entregado_incidencia`, `no_entregado`,
`reprogramado`, `devuelto`, `cancelado`. Solo **un** pedido `en_entrega` por piloto (índice `pedidos_un_en_entrega`).

**Calculador interno** (no se ve en pantalla; para estadísticas futuras):
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
| `pedido_evidencias` | Fotos (Storage `evidencias`): `tipo` (`entrega`, `mal_estado`, `retraso`, `recepcion`); `eliminada_en` cuando se borra la foto a los 12 meses |

Funciones: trigger `pedidos_antes_de_crear` (número y código de respaldo) y
`validar_codigo_respaldo(pedido, código)` (para la app del piloto).

**Copias intencionales:** el pedido guarda nombre y teléfono del cliente, nombre de la categoría y la
tarifa usada. Es a propósito: el historial muestra lo que pasó aunque luego cambien. No "arreglarlo".

### Archivos (Storage)

| Bucket | Qué | Límite |
|---|---|---|
| `avatares` | Fotos de usuario `usuarios/<id>.jpg` | 2 MB, JPG/PNG/WEBP |
| `evidencias` | Fotos de entregas | 5 MB, JPG/PNG/WEBP |

## Acceso (modo rápido)

Todas las tablas tienen reglas **TEMPORALES** que dejan leer y escribir a cualquiera con la clave
pública (`anon`). Pedidos, entregas y evidencias no se pueden borrar; el historial solo se agrega.
Quién ve qué lo decide la página. Ver Fase 7 en [12-pendientes.md](12-pendientes.md).

Ya protegido en la base (no depende de la página):
- `viajes` y `cortesias`: la página solo lee; todo cambio pasa por funciones (bloque 19).
- `usuarios.clave`: cifrada y no se puede leer (bloque 20).
- Solicitud de usuario del cliente: `registro_clientes_empresa(codigo)` y `solicitar_acceso_cliente(p)` (bloque 20)
  revisan la empresa (activa y con Transporte), los datos, duplicados por teléfono o correo, máximo 20 solicitudes por
  hora y crean cliente + usuario **sin aprobar**.

En la página (`js/supabase.js`): `select`, `update` y `delete` de las tablas por empresa llevan siempre la empresa
activa; sin empresa activa, `delete` no borra nada.

> Supabase devuelve como máximo **1000 filas** por consulta (ajuste "Max Rows" del proyecto, en la
> configuración de la API). Si los reportes crecen más, subir ese valor o paginar.
