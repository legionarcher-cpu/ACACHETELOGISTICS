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
9 vehículo "en uso" automático · 10 acceso desde la web · 11 archivos (fotos).

**Regla para cambios de estructura** (no crear archivos nuevos):
1. Agregar el cambio en su sección de `00_instalacion_completa.sql` (para las bases nuevas).
2. Agregarlo como un bloque más **al final** de `01_actualizacion_base_existente.sql`, escrito para
   poder repetirse (`add column if not exists`, `drop constraint if exists`, `on conflict do nothing`).
3. Ejecutar `01` en la base de cada empresa que ya exista.

Nunca crear columnas a mano en el Table Editor.

Si la página dice "Falta instalar la base de datos", falta `00`; si dice "Falta ejecutar
sql/01_actualizacion_base_existente.sql", falta la actualización.

## Tablas

### Organización

**`regiones`** — zonas del país. `codigo` (3 letras MAYÚSCULAS, ej. `NOR`), `nombre`.
Solo lectura desde la página; se editan en Supabase.

**`tiendas`** — `id`, `codigo` (único, `AAA-000`, las 3 letras = región), `region`, `nombre`,
`direccion`, `telefono`, `estado` (`activa` | `inactiva`), `lat`, `lng` (ubicación en el mapa: punto A
de sus entregas; la guardan Administrador y G1 desde el formulario de Pedidos; sql/01 bloque 9), `creado_en`.

**`usuarios`**

| Columna | Qué guarda |
|---|---|
| `id` | Número interno |
| `nombre`, `telefono` | Datos de la persona |
| `id_usuario` | Con lo que inicia sesión (único, minúsculas). Hoy `cen-001-jperez` para G3/Empleado/Piloto |
| `clave` | Contraseña (⚠ sin cifrar hasta la Fase 7) |
| `rol` | `administrador`, `admin_g1`, `admin_g2`, `admin_g3`, `empleado`, `piloto` |
| `tienda_id` | Su tienda (obligatoria para G3, Empleado y Piloto) |
| `region` | Su región (obligatoria solo para G2) |
| `foto_url` | Enlace de su foto (Storage `avatares`) |
| `aprobado`, `solicitado_por`, `solicitado_en` | Aprobación de usuarios creados por un G3 |
| `vehiculo_id` | Vehículo asignado (solo pilotos) |
| `multitienda` | Piloto que puede trabajar en otras tiendas de su región |
| `permisos` | Lista de secciones (**no se usa**: `USAR_PERMISOS = false`) |

Reglas: tienda/región según el rol; vehículo y multitienda solo pilotos; el usuario `admin` no se
elimina ni cambia de usuario o rol (trigger `proteger_admin`).

**`vehiculos`** — `placa` (única, MAYÚSCULAS), `tipo` (`camion`, `pickup`, `panel`, `moto`), `marca`,
`estado` (`disponible`, `en_uso`, `mantenimiento`). `en_uso`/`disponible` los pone solo la base de datos
según los pedidos activos del piloto (función `recalcular_estado_vehiculo` + triggers); `mantenimiento`
no se toca.

**`clientes`** — `nombre`, `apellidos`, `telefono`, `direccion`, `ubicacion`, y aprobación
(`aprobado`, `cambios_pendientes`, `solicitado_por`, `solicitado_en`).
**`clientes_tiendas`** — qué tiendas atienden a cada cliente (muchos a muchos).

**`notificaciones`** — un aviso para un usuario: `tipo` (`pendiente`, `aprobado`, `rechazado`, `info`),
`titulo`, `mensaje`, `enlace` (ej. `#usuarios`), `referencia_tipo`/`referencia_id`, `leida`.

### Horarios (en pantalla "horario", en la base "marca")

| Tabla | Qué guarda |
|---|---|
| `configuracion` | Valores generales clave → valor (JSON): `cantidad_marcas`, `pedidos_por_marca`, `numero_pedido` (`automatico`/`manual`), `codigo_respaldo` (lista: `aleatorio`, `telefono`) |
| `marcas_horario` | Horarios base: `numero`, `inicio_desde`, `inicio_hasta`, `fin` |
| `horario_dias` + `marcas_dia` | Días con horario propio (1 = lunes ... 7 = domingo; 0 marcas = descanso) |
| `capacidad_marcas` | Pedidos por horario distintos para una región **o** una tienda |

Función `marcas_del_dia(fecha)`: horarios que aplican a una fecha (los del día o los de la base).
Prioridad de la capacidad: tienda > región > base.

### Configuración de pedidos

| Tabla | Qué guarda |
|---|---|
| `actividades` | `codigo` (`tienda`, `encomiendas`), `nombre`, `descripcion`, `icono`, `activa`, `orden` y qué usa: `usa_bodega`, `usa_recoleccion`, `usa_compra`, `usa_tamanos`, `permite_alcohol` |
| `tiendas_actividades` | **Ya no se usa**: las actividades activas aplican a todas las tiendas (se puede quitar en una limpieza futura) |
| `categorias_mercaderia` | Casillas del pedido por actividad: `nombre`, `tipo` (`conteo`, `articulos`, `bulto`, `documento`), `icono`, `peso_referencia` (documentos), `activa`, `orden` |
| `articulos_catalogo` | Pesos promedio: `categoria_id`, `nombre`, `peso_kg`, `activo`, `orden` |
| `tamanos_bulto` | S/M/L/XL con medidas (solo referencia, no cambian el precio) |
| `tarifas` | Por actividad y alcance (general, región o tienda): `cargo_fijo`, `minimo`, `kg_incluidos`, `precio_kg`, `precio_km` (futuro), `envio_gratis_desde` |
| `descuentos` | `nombre`, `tipo` (`porcentaje`/`monto`), `valor`, `actividad` y `region` (vacío = todas), `activo` |
| `motivos_retraso` | Lista para el cierre de entrega |

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
| Planificación | `fecha_entrega`, `marca_numero` (horario), `piloto_id` |
| Mercadería | `peso_total_kg`, `lleva_alcohol`, `detalle` (JSON: categorías, conteo de abarrotes, documentos y `ruta`: `{ origen, a: {lat,lng}, b: {lat,lng}, km, minutos, aproximada }`) |
| Cobro | `monto_compra`, `cobrar_compra`, `costo_envio`, `descuento_id`, `costo_desglose` (JSON: copia de la tarifa y el cálculo), `total_cobrar`, `forma_pago`, `paga_con`, `vuelto` |
| Estado | `estado`, `anulado`, `motivo_cancelacion`, `notas` |
| Auditoría | `creado_por`, `creado_en`, `actualizado_en` |

Estados: `registrado`, `recibido_bodega`, `asignado`, `en_ruta`, `entregado`, `entregado_incidencia`,
`no_entregado`, `reprogramado`, `devuelto`, `cancelado`.

| Tabla | Qué guarda |
|---|---|
| `pedido_articulos` | Cada línea: `categoria_id`, `categoria` (copia del nombre), `descripcion`, `cantidad`, `tamano`, `peso_kg` (**de cada uno**) |
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

> Supabase devuelve como máximo **1000 filas** por consulta (ajuste "Max Rows" del proyecto, en la
> configuración de la API). Si los reportes crecen más, subir ese valor o paginar.
