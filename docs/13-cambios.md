# 13. Registro de cambios

Lo más nuevo, arriba. Cada entrada dice qué SQL hay que ejecutar.

## 2026-10-13 · QR fijo: solo se marca estando en la tienda (GPS)

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 35** (va en el mismo archivo que el 34:
`sql/por_funcion/01_actualizacion_12_qr_fijo_tienda.sql`; instalación nueva: `sql/00`, sección 28).

- Al escanear el QR fijo, el celular del piloto manda su ubicación (GPS) y `marcar_por_qr_fijo` mide la
  distancia a la tienda (`tiendas.lat/lng`). Más lejos que el radio = no marca ("Estás a 1112 m de la tienda...").
  Se descuenta la precisión del GPS hasta 50 m. Sin permiso de ubicación o sin GPS: no marca.
- **Radio**: `configuracion.radio_marca_m` (150 m por defecto); Administrador y G1 lo cambian en la tarjeta del QR
  del Inicio ("Distancia máxima para marcar").
- **Ubicación de la tienda**: la tarjeta dice si falta; "Usar mi ubicación actual" (Administrador, G1, G3) guarda el
  GPS del dispositivo como la de la tienda. Sin ubicación, el QR fijo no marca.
- Cada marca guarda dónde se hizo: `marcas_piloto.lat`, `lng`, `distancia_m`.
- "Validar y marcar" (la tienda escanea al piloto en persona) y el QR del mes no cambian.
- `VERSION_APP` = `20261013j`.

## 2026-10-13 · QR fijo de la tienda (marca automática)

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 34** (=
`sql/por_funcion/01_actualizacion_12_qr_fijo_tienda.sql`; instalación nueva: `sql/00`, sección 27).

- Cada tienda tiene un **QR fijo** (`qr_tienda_fija`, tabla `qr_tiendas_fijo`) que no cambia cada mes. Se ve
  siempre en el **Inicio** (G3 y Empleado: su tienda; Administrador, G1 y G2: eligen la tienda) con
  "Ver, descargar o imprimir". El botón QR de Tiendas también muestra este.
- El piloto lo escanea ("Escanear QR") y su horario abierto se **marca solo con la fecha y la hora del sistema**
  (hora de Costa Rica), **sin validación previa** (`marcar_por_qr_fijo`). Marca tardía: pide el motivo. Se avisa
  a la tienda para despachar.
- **Generar uno nuevo** (Administrador, G1 y G3): el impreso deja de servir (por si se copió o se perdió).
- El QR del mes y "Validar y marcar" con el QR del piloto siguen funcionando.
- `VERSION_APP` = `20261013i`.

## 2026-10-13 · QR del piloto: "Validar y marcar" en un solo paso

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 33** (=
`sql/por_funcion/01_actualizacion_11_qr_validar_y_marcar.sql`; instalación nueva: `sql/00`, sección 26).

- La tienda escanea "Mi QR del día" del piloto: sale su ficha (foto, nombre, tienda y el horario que puede marcar,
  a tiempo o tardío) con el botón **Validar y marcar**. Valida al piloto y marca su horario abierto en un solo paso
  (`piloto_qr_info`, `validar_y_marcar_piloto`) y avisa a la tienda para despachar.
- Marca tardía: en la misma ficha se escribe el motivo; sin motivo no se guarda nada (todo o nada).
- Sin horario abierto, o si ya lo marcó: solo se valida y se dice por qué.
- La marca queda con la tienda de quien escanea (si no tiene, la del piloto).
- El QR de marcas de la tienda sigue funcionando igual (el piloto ya validado lo escanea para marcar).
- Sin el bloque 33 la página solo valida, como antes.
- `VERSION_APP` = `20261013h`.

## 2026-10-13 · Logos de empresa por número interno (no por ID)

Sin SQL.

- **Problema:** las imágenes del encabezado de cada empresa iban por su ID (`html[data-empresa="02"]`). Al borrar
  una empresa su ID se vuelve a usar, y la nueva (ej. "Corporación Dinant", 02) heredaba los logos de la borrada
  (Transportes Otoya-Valverde). En la base no quedaba nada de las borradas (revisado).
- **Ahora:** `empresas/empresas.js` marca también `data-empresa-id` (empresas.id, nunca se repite) y
  `css/encabezados.css` usa `html[data-empresa-id="N"]`. Se quitó la regla vieja de la 02.
- **Empresa sin logos propios:** usa el encabezado y los logos de ACACHETE (los de la 01).
- Tiendas → Empresas muestra el **N.º interno** de cada una; al eliminar una empresa recuerda borrar su bloque
  de `css/encabezados.css`.
- `VERSION_APP` = `20261013f`.

## 2026-10-13 · Configuración → Artículos de venta y precios

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 32** (=
`sql/por_funcion/01_actualizacion_10_articulos_de_venta.sql`; instalación nueva: `sql/00`, sección 25).

- Tarjeta nueva en Configuración (Administrador y G1): crear un artículo de venta en **una ventana** con
  artículo, categoría, código, presentación, unidad, cantidad que trae, costo y precio de venta con IVA (IVA 13 %
  cambiable). Tabla con costo, precio y margen; filtro por lista de precios; modificar y eliminar. Mismo catálogo
  que Distribución → Productos y precios ([15-distribuidora.md](15-distribuidora.md)).
- `producto_presentaciones.unidad` y `.costo` (bloque 32). Sin el bloque se guarda lo demás y se avisa.
- El selector de productos del pedido y de la venta en ruta muestra el **precio con IVA** de cada opción.
- Configuración → Pedidos → Categorías y Artículos frecuentes indican dónde se crean los artículos de venta.
- `VERSION_APP` = `20261013e`.

## 2026-10-13 · Tiendas: región opcional · usuarios sin región

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 31** (=
`sql/por_funcion/01_actualizacion_9_tiendas_region_opcional.sql`; instalación nueva: `sql/00`, sección 24).

- Una tienda se crea **sin región** ("Sin región" en el formulario; código sugerido `SUC-001`). En la lista va
  en el grupo "Sin región" y el filtro tiene esa opción. La ven el Administrador y el Admin G1 (el G2 solo ve
  su región). Los pilotos multitienda de otra tienda no se le ofrecen (se cruzan por región).
- **Los usuarios ya no llevan la región:** todos los roles son nombre + ID de la empresa (`jperez01`).
  Cambiar, poner o quitar la región de una tienda no toca a los usuarios.
- ⚠ Al ejecutar el bloque 31, los usuarios de tienda que ya existían se renombran **una sola vez**
  (`cenjperez01` → `jperez01`; si dos quedarían iguales, el segundo queda `jperez201`). Marca
  `usuarios_sin_region` en `configuracion`; el bloque 17 ya no les vuelve a poner la región. **Avisar a cada
  uno su usuario nuevo** (la clave no cambia).
- `cambiar_codigo_empresa` solo cambia el ID del final.
- `VERSION_APP` = `20261013d`.

## 2026-10-13 · Caja de pilotos como parte de cada actividad · versión de los archivos

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 30** (incluido en
`sql/por_funcion/01_actualizacion_8_despacho_carga_y_salida.sql`; instalación nueva: `sql/00`, sección 23).

- **Caja de pilotos** es una casilla más en Configuración → Actividades → "Qué usa en todo el sistema"
  (`actividades.usa_caja`). La sección Caja y Configuración → Cajas aparecen si alguna actividad de la empresa la
  usa (y su plan incluye "caja"). Todas las actividades vienen con caja: no desaparece nada.
- **Distribución**: después de cerrar la mercadería de un piloto, botón de **caja fuerte** que abre su Caja
  (`#caja?piloto=ID`) para cuadrar el dinero.
- **Versión de los archivos** (`VERSION_APP` en `app.html`): cada JS, CSS y HTML se descarga con `?v=...`, así el
  navegador no mezcla archivos nuevos con viejos (por eso Configuración no cargaba). Subirla al publicar
  ([10-recetas.md](10-recetas.md)).

## 2026-10-12 · Despacho: carga con evidencia por pedido y salida a ruta por slot

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 29** (o `sql/por_funcion/01_actualizacion_8_despacho_carga_y_salida.sql`;
instalación nueva: `sql/00`, sección 22). Probado en Postgres (PGlite) y la pantalla con datos simulados.

- El piloto **solo toca** los pedidos que la tienda marcó **"Listo para despachar"** (la base lo revisa).
- **Cargar por pedido** (botón "Cargar" en Mi ruta y en el detalle; `js/carga-comun.js` → `pedido_cargar`): foto(s) de
  lo que recibe (se achican y se suben a Storage `evidencias/carga/<pedido>/`), **bultos recibidos** (sugiere los
  registrados) y **efectivo** que lleva para ese pedido (muestra el vuelto previsto). Queda "Cargado"; ya no hace falta
  "Recibido para ruta" ni escanear el QR (los que quedaron así con el flujo anterior se cargan igual o se escanean).
  Columnas nuevas `pedidos.carga_bultos`, `carga_efectivo`, `carga_nota`; evidencia tipo `carga`.
- **Salir a ruta POR SLOT** (Inicio → Mi ruta, un renglón por slot; `piloto_salir_ruta`): los cargados del slot pasan
  a "En ruta". Los listos que no se cargaron quedan **"No salió a ruta"** (estado nuevo `no_salio`): aviso pendiente al
  G2 para **reprogramar** o cancelar, y aviso al G3. El cliente lo ve como "Reprogramando".
- Detalle del pedido: "Carga" (bultos, efectivo, nota) y bloque "Carga y entrega" con las fotos.

## 2026-10-12 · Tiendas: código libre (sin región) y tiendas con o sin rutas

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 28** (o `sql/por_funcion/01_actualizacion_7_tiendas_codigo_y_rutas.sql`;
instalación nueva: `sql/00`, sección 21). Probado en Postgres (PGlite), también volviendo a ejecutar todo `01`.

- El código de la tienda ya **no depende de la región**: es libre (letras, números y guion; ej. `SUC-CENTRO`) y la
  región se elige aparte. Las tiendas que ya existían no cambian.
- Cambiar el código ya no cambia la región ni los usuarios. Cambiar la **región** renombra a sus usuarios
  (`cambiar_region_tienda`): el usuario de G3, Empleado y Piloto lleva la región (`cenjperez01`), no el código.
  `cambiar_codigo_empresa` y el bloque 17 también toman la región (así un código libre nunca cambia un usuario).
- **Tiene rutas** (`tiendas.usa_rutas`): las tiendas que no envían pedidos no aparecen en Nuevo pedido, Rutas,
  Cotizador ni Distribución. Columna "Envíos" en la lista de Tiendas.
- `js/componentes.js`: `prefijoUsuario(region)`, `claveTiendaUsuario(tienda)` y `tiendasSinRutas()`.

## 2026-10-12 · Distribuidora y partes por actividad (vehículos, km, peso)

SQL: **`sql/01_actualizacion_base_existente.sql` bloques 26 y 27** (instalación nueva: `sql/00`, secciones 19 y 20).
Probados en Postgres (PGlite): `00` completo, `01` encima dos veces y un día completo de distribuidora.

- **Partes por actividad** (bloque 26): cada actividad dice si usa **vehículos**, **cobro por km**, **peso** y
  **productos** (Configuración → Actividades → "Qué usa en todo el sistema"). Lo que ninguna actividad de la empresa
  usa desaparece: Vehículos y Costos de operación, vehículo del piloto (Usuarios, Pilotos, Mi perfil), campos de kg y
  km de las tarifas, peso del pedido, ayuda del cobro por km, Cotizador y simulador (sin peso ni km). Clases
  `.solo-vehiculos`, `.solo-km`, `.solo-peso`, `.solo-peso-o-km`, `.solo-productos` (`css/base.css`). Ver
  [07-actividades-y-mercaderia.md](07-actividades-y-mercaderia.md).
- Actividad **Masajes** (la usaba la empresa 03 y no estaba en la tabla): sin vehículos, km ni peso.
- Actividad **Distribución** y sección nueva **Distribución** (bloque 27): productos, presentaciones, listas de
  precios con IVA (13 % por defecto, modificable en cada precio), lista de cada tienda, motivos de entrega
  incompleta, **bodega del día por ruta** (ingreso, carga dividida entre pilotos, traspaso, ajuste, devolución buena o
  dañada), **cierre de mercadería por piloto** (faltante con aviso y reporte), **cierre de bodega** (queda en 0 con el
  resumen del día), **Mi carga** y **venta en ruta** del piloto, historial y **reporte de faltantes** (CSV).
- **Pedidos**: una actividad con productos elige productos y lista de precios en vez de categorías; el piloto
  entrega por producto (si es menos, motivo obligatorio → "Entregado con incidencia" + aviso al G3). El total a
  cobrar se recalcula con lo entregado. El detalle muestra los productos pedidos y entregados.
- Plan: función nueva **"Distribución"** (`distribucion`; Profesional y Completo).
- `herramientas/vaciar_base_datos.sql` también limpia bodegas, productos, listas y motivos.
- Ver [15-distribuidora.md](15-distribuidora.md).

## 2026-10-08 · Caja de pilotos y conductores (como en SISCED)

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 24** (instalación nueva: `sql/00`, sección 17).

- Sección nueva **Caja** (`#caja`): fondo de caja, cobros sin cerrar (pedidos entregados y viajes terminados), SINPE y
  tarjeta "Verificado", arqueo con diferencia y **Cerrar caja** (función `caja_cerrar` en la base, todo o nada).
  Cierres anteriores. G3 cierra los de su tienda, G2 los de su región, G1 y Administrador todos; el piloto ve la suya.
- **Configuración → Cajas**: tipos de caja (nombre y monto) y el fondo de cada piloto o conductor.
- **Entregado**: si el pedido tiene monto a cobrar, el piloto marca cómo pagó el cliente (efectivo, SINPE o tarjeta).
  El detalle del pedido muestra "Cómo pagó" y si su caja ya se cerró.
- Plan: función nueva **"Caja de pilotos y conductores"** (`caja`; Profesional y Completo). Se habilita o quita por
  empresa en Configuración → Planes y funciones.
- Ver [secciones/caja.md](secciones/caja.md).

## 2026-10-06 · Encomiendas: el cliente solicita recolección y entrega ("Mis envíos")

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 23** (instalación nueva: `sql/00`, sección 16).

- Tabla `pedido_solicitudes`. El cliente con usuario de una empresa con encomiendas (actividad con
  `usa_recoleccion`) ve **Mis envíos** (`secciones/envios.html`, `js/secciones/envios.js`): qué envía, A (recoger) y
  B (entregar) con **puntos de referencia** y los puntos en el mapa, quién recibe y la fecha. Ve el avance y puede
  cancelar las pendientes.
- Aviso (campana) al **Admin G3** de su tienda; sin G3, al G2 de la región; si tampoco, al Administrador y G1.
- **Pedidos → "Solicitudes de envío de clientes"** (G3 o superior): **Revisar y registrar** abre "Nuevo pedido" ya
  lleno (cliente, A y B con sus puntos, quién recibe, fecha, un bulto y las referencias en Notas). Al registrarlo la
  solicitud queda aprobada y siguen los avisos de siempre (piloto, G2, pedidos cercanos); al cliente le llega
  "Tu envío fue aprobado". **Rechazar** pide el motivo y se lo avisa.
- El detalle del pedido muestra las referencias al recoger y al entregar (para el piloto).
- La **solicitud de usuario** desde el login ahora también la reciben las empresas de encomiendas, y en Clientes se
  puede dar o aprobar el acceso del cliente en esas empresas.
- Plan: función nueva **"El cliente solicita envíos"** (`envios_clientes`; Profesional y Completo).
- `js/mapa.js`: un punto puesto a mano gana a una búsqueda de dirección que todavía no terminó.

## 2026-10-06 · Planes y funciones por empresa; Costos de operación para todas

SQL: **`sql/01_actualizacion_base_existente.sql` bloque 22** (en una instalación nueva ya va en `sql/00`, sección 15).
Las empresas que ya existían quedan en plan **Completo** (no cambia nada hasta que se les asigne otro).

- `empresas.plan` (`basico` | `profesional` | `completo` | `personalizado`) y `empresas.funciones` (lista; null = todas).
- **Configuración → Planes y funciones** (solo el Desarrollador): una tarjeta por empresa con el plan y las casillas
  de cada función (Secciones, Configuración, Extras). Elegir un plan marca sus funciones; cambiar una casilla lo deja
  en Personalizado. Catálogo y planes: `FUNCIONES_PLAN` y `PLANES` en `empresas/empresas.js` (ahí se editan).
- Lo que el plan no incluye desaparece para los administradores y usuarios de esa empresa (`funcionHabilitada`):
  secciones del menú, botones del pie, botón QR, tarjetas de Configuración, exportar en Reportes, pedidos cercanos.
  La base respeta "Solicitud de usuario de clientes" (`registro_clientes_empresa` y `solicitar_acceso_cliente`).
- **Configuración → Costos de operación** (`js/secciones/configuracion/costos.js`): el calculador de costos salió de
  Transporte y ahora lo tienen todas las empresas (si su plan lo incluye). Suma el **costo por entrega o viaje** de los
  últimos 30 días: pedidos entregados (vehículo del piloto, `distancia_km` y minutos del mapa) y viajes terminados.
  Transporte conserva el margen de cada franja.

## 2026-10-06 · Pedidos: "Pagado en línea"

Sin SQL. Subir `js/secciones/pedidos.js`, `secciones/pedidos.html` y `css/secciones/pedidos.css`; Ctrl + F5.

- En Cobro, las casillas "El piloto cobra al entregar" (marcadas, había que desmarcar) se cambiaron por
  **"¿El cliente ya pagó en línea?": Envío pagado / Compra pagada**, **sin marcar por defecto** = el piloto cobra el
  total, igual en todas las empresas. Marcadas se ponen verdes; si todo está pagado se ocultan Forma de pago y Paga con.
- El pedido guarda `detalle.pagado_en_linea` y el detalle muestra "Pagado en línea: envío / compra".

## 2026-10-06 · Pedidos cercanos: aprovechar un mismo viaje (fase 1)

Sin SQL. Subir `js/secciones/pedidos.js`, `secciones/pedidos.html` y `css/secciones/pedidos.css`; Ctrl + F5.

- Al registrar un pedido se buscan los del mismo día, sin entregar, cuya recolección o entrega quede a menos de 1 km
  (`PED_RADIO_CERCANO_KM`). El formulario los muestra y el G2 puede **asignar el mismo piloto** con un toque.
- Avisos: al piloto ("Nuevo pedido cerca de tu recorrido"), o al G2 con la sugerencia de piloto si no tiene o si lo
  cercano lo lleva otro.
- Detalle del pedido: fila "Cerca de este pedido". El historial guarda los cercanos para medir el plan piloto.
  Ver [secciones/pedidos.md](secciones/pedidos.md), "Pedidos cercanos".

## 2026-10-05 · Web: portada compacta y una página de solución por tipo de empresa

Sin SQL. Recargar con **Ctrl + F5**.

- Portada más compacta: bienvenida (con los 3 beneficios en una línea), una sola sección "Soluciones" y la galería
  "Conozca más". Se quitó la sección "Para quién", que repetía lo mismo.
- **Mensajerías, Distribuidoras y Transporte abren cada una su propia página** (`web/paginas/solucion-*.html`): lo que
  resolvemos (antes / con ACACHETE), así trabaja su operación, funciones incluidas explicadas, un destacado y el llamado
  a la demostración (con enlace al detalle de cada función ya filtrado).
- Visión: se quitaron "Hacia dónde vamos" y "Para quién".
- Menú de arriba: nueva opción "Soluciones"; el pie enlaza las tres soluciones.

## 2026-10-05 · Revisión responsive (web y app) en 12 resoluciones

Sin SQL. Recargar con **Ctrl + F5**.

- Medido en 320, 360, 390 y 414 px (celular), 844 × 390 (celular acostado), 768, 820 y 1024 px (tablet) y 1280, 1366,
  1440 y 1920 px: la web (portada, Productos, Visión, Contacto, la App en ventana, el visor) y todas las secciones de la
  app, sus formularios y el login. Ninguna página queda con scroll horizontal; las tablas se desplazan dentro de su caja.
- Corregido: Contacto de la web en celulares (las listas desplegables ensanchaban el formulario); visor de productos en
  celular angosto (título) y en pantallas bajas (más compacto); lista de tiendas del formulario de Clientes en 320 px.
- Las columnas automáticas de todos los CSS (`repeat(auto-fit, minmax(Xrem, 1fr))`) ya no superan el ancho de la
  pantalla: `minmax(min(Xrem, 100%), 1fr)`. En computadora no cambia nada.

## 2026-10-05 · La página web carga primero: la app ahora es `app.html`

Sin SQL. Recargar con **Ctrl + F5**.

- **`index.html` es la página web de presentación** (antes `web.html`), así abre primero en cualquier servidor.
  **La app ahora es `app.html`** (antes `index.html`). Se actualizaron todas las referencias (las secciones,
  comentarios y documentación).
- Enlaces viejos de la app (`index.html#registro?empresa=02`, `index.html#pedidos`...) se pasan solos a `app.html`.
- Página de inicio más liviana: 3 beneficios con textos nuevos ("Entregas confirmadas", etc.), "Para quién" sin listas
  y la galería. "Cómo funciona" pasó a la ventana Productos.

## 2026-10-05 · Solicitud de usuario para todas las empresas

Sin SQL. Subir `secciones/loggin.html`, `js/secciones/loggin.js` y `empresas/empresas.js`; recargar con **Ctrl + F5**.

- "¿Eres cliente? Solicita tu usuario" aparece **siempre** en el login. Si la empresa no viene en el enlace
  (`#registro?empresa=02`) ni en la marca (`registroClientes: '02'`), el formulario pide el **código de la empresa**
  y muestra su nombre al confirmarlo. Vale para todas las empresas activas con Transporte (lo revisa la base).
- `registroClientes: false` en una marca oculta el botón.

## 2026-10-05 · Imágenes del encabezado solo desde `css/encabezados.css`

Sin SQL. Recargar con **Ctrl + F5**.

- **Un solo archivo para las imágenes del encabezado:** `css/encabezados.css` (imagen del título, logos de la
  esquina y logo chico), con una regla por **marca** (`html[data-marca="..."]`) y por **empresa interna**
  (`html[data-empresa="01"]`). Se elige según lo activo y cambia al iniciar sesión, cambiar de empresa o salir.
- Se quitaron de `empresas/empresas.js` los campos `encabezado`, `encabezadoAjuste`, `encabezadoEnfoque`, `logo` y
  `logoFondo` (y las imágenes de `css/index.css`). `icono` queda solo para la pestaña del navegador.
- Ya cargadas: ACACHETE (banner), marca Otoya y empresa **02** · Transportes Otoya (`img/img-encabezado.jpg`, completa).
- **Empresa principal = 01, siempre distinta:** encabezado y logos de ACACHETE y **colores originales** en cualquier
  marca (ni la paleta de la marca ni una guardada la cambian). En Tiendas → Empresas su ID y su paleta no se
  pueden cambiar, y ninguna otra empresa puede usar el 01: las demás parten de la 02. `registroClientes` de la
  marca Otoya corregido a `'02'`.
- `herramientas\empresas.bat`: la marca nueva deja su regla en `css/encabezados.css`; se quitó la opción "Logos".

## 2026-10-05 · Sección Empresas renombrada y modelos de paleta en un solo lugar

Sin SQL. Recargar con **Ctrl + F5**.

- La sección **Empresas** (pestaña de Tiendas) ahora es **`empresas-internas`**: `secciones/empresas-internas.html`,
  `js/secciones/empresas-internas.js`, `css/secciones/empresas-internas.css` y la guía
  [secciones/empresas-internas.md](secciones/empresas-internas.md). Así ya no se confunde con `empresas/empresas.js`
  (marcas). Un enlace viejo a `#empresas` abre la nueva.
- **Modelos de paleta en un solo lugar:** `PALETAS_MODELO` en `empresas/empresas.js`. Los ofrecen Tiendas → Empresas
  y `herramientas\empresas.bat` (antes cada uno tenía su copia). Se agregó **"Verde Otoya"**.
- La muestra "Colores de la marca" lee los colores originales de `css/variables.css` (se quitó la copia que tenía la
  sección).

## 2026-10-05 · Paleta por empresa al iniciar sesión, logos por marca y limpieza

→ **Ejecutar `sql/01_actualizacion_base_existente.sql` completo** (agrega el **bloque 21**). Recargar con **Ctrl + F5**.

- **Corrección:** Tiendas daba "No se pudieron cargar las tiendas. Revisa la conexión" después del bloque 20 (contaba
  usuarios con `usuarios(count)`, que ya no se permite). Ahora trae `usuarios(id)` y cuenta en la página.
- **Paleta de cada empresa interna:** Tiendas → Empresas → Nueva / Modificar pide la **paleta de colores**
  (modelo o 2 colores propios). Se guarda en `empresas.colores` y la página se pinta con ella **al iniciar sesión**
  con un usuario de esa empresa (por su ID); al cerrar sesión vuelven los de la marca.
- **Logos por marca** en `empresas/empresas.js` (`logo`, `logoFondo`, `icono`): un solo `app.html` para todas
  las marcas (no hace falta un index por empresa).
- **`herramientas\empresas.bat`**: una sola herramienta (sin Python) para nueva empresa con logos y paleta, cambiar
  su base, su paleta, sus logos o la empresa activa. Reemplaza a `python/nueva_empresa.py` y
  `herramientas/cambiar_supabase.*`.
- `registroClientes` de Otoya corregido a `'01'` (su ID real en la base).
- **A la papelera de reciclaje** (sin uso o repetidos): `python/nueva_empresa.py`, `herramientas/cambiar_supabase.ps1`
  y `.bat`, `img/imagen-muestra.png`, `img/img-logo.png`, `img/logo-web.png`, `img/logo.jpg`, `img/secur-icon.png` y
  `logo app.png` (copia exacta de `img/logo.png`).

## 2026-10-04 · Seguridad: claves cifradas, borrar solo en la empresa y el cliente solicita su usuario

→ **Ejecutar `sql/01_actualizacion_base_existente.sql` completo** (agrega el **bloque 20**). Recargar con **Ctrl + F5**.
Los usuarios siguen entrando con la **misma contraseña** (se cifra la que ya tenían).

- **Contraseñas cifradas (bcrypt):** la base cifra la clave sola al crear o cambiar un usuario. El login la compara
  dentro de la base (`iniciar_sesion`) y la página **ya no puede leer** la columna `clave`. ⚠ Si se agrega una columna a
  `usuarios`, ejecutar `select public.usuarios_ocultar_clave();`.
- **Borrar y modificar solo dentro de la empresa:** en `js/supabase.js`, `update` y `delete` de las tablas por empresa
  llevan siempre la empresa activa; sin empresa activa **no se borra nada** (error `SIN_EMPRESA`).
- **`herramientas/vaciar_base_datos.sql` pregunta qué empresa:** se escribe el ID (`'02'`) y su nombre exacto para
  confirmar; borra solo lo de esa empresa (puede conservar sus Administradores). Para toda la base: `'TODAS'` +
  `'BORRAR TODO'`. Sin escribir la empresa se detiene sin borrar.
- **El cliente solicita su usuario** (empresas con Transporte): enlace `app.html#registro?empresa=02` o
  "¿Eres cliente? Solicita tu usuario" en el login (`registroClientes` en `empresas/empresas.js`). Queda pendiente;
  aviso al Administrador y G1; se aprueba en **Clientes → Revisar**. Ver [secciones/viajes.md](secciones/viajes.md).

**Probar:** [11-pruebas.md](11-pruebas.md), sección "Seguridad y solicitud de usuario".

## 2026-10-04 · Transporte, fases 2 a 7: viajes con agenda, clientes con usuario, costos y cortesía

→ **Ejecutar `sql/01_actualizacion_base_existente.sql` completo** (agrega el **bloque 19**). Recargar con **Ctrl + F5**.
Diseño: [14-transporte.md](14-transporte.md) · Guía: [secciones/viajes.md](secciones/viajes.md).

- **Sección Viajes** (solo si la empresa hace viajes): solicitud en 4 pasos (personas y mascotas obligatorias, ruta A → B
  con Casa y Trabajo, día y hora libres con su precio, confirmar), agenda del personal (resumen, filtros, cambiar la
  hora, cancelar, avanzar) y botones del conductor ("Voy en camino", "A bordo", "Terminar", "No se presentó").
- **Reservas seguras en la base:** `viajes_solicitar`, `viajes_cambiar_hora`, `viajes_cancelar`, `viajes_avanzar` y
  `viajes_horas_disponibles` revisan las reglas, asignan vehículo y conductor y evitan que dos clientes tomen la misma
  hora. La página solo lee `viajes` y `cortesias`.
- **Rol cliente:** Clientes → botón de llave "Acceso y lugares" (usuario `mramirez02`, contraseña, Casa y Trabajo). El
  cliente solo ve Inicio, Viajes y Mi perfil; no aparece en Usuarios.
- **Configuración → Transporte:** franjas de precio por km (no se enciman), recargos fijos, agenda, días cerrados,
  **costos del mes** (gasto ÷ horas y km = costo por hora y por km, estimado y real) con el margen de cada franja,
  simulador km × franja y reglas del viaje de cortesía.
- **Vehículos:** asientos, carga, acepta mascotas, km por litro, horas y km del mes; tipos **Automóvil** y **Microbús**.
- **Viaje de cortesía automático:** 5 viajes terminados en 15 días = 1 cortesía (vence en 30 días, se aplica sola, vuelve
  si se cancela a tiempo).
- **Empresa solo de Transporte:** no ve Pedidos, Rutas, Cotizador ni Configuración → Pedidos / Slots; su **Inicio** y su
  **Reportes** muestran los viajes; el pie "Crear Viaje" abre la solicitud. Con Transporte + otra actividad, Reportes
  suma la pestaña **Viajes**.
- **Exportaciones con el dato correcto:** Excel y PDF de Reportes (y la impresión de QR) llevan el **nombre de la
  empresa** con la que se trabaja (ya no "ACACHETE LOGISTICS"), los **colores de su paleta** y sus palabras
  (Pedido → Viaje, Piloto → Conductor).
- `herramientas/prueba_logica_viajes.html`: prueba sin base de datos de precios, costos y palabras (abrir con doble clic).

**Probar:** [11-pruebas.md](11-pruebas.md), sección "Transporte: viajes".

## 2026-10-04 · Transporte, fase 1: Pedido → Viaje

→ **Ejecutar `sql/01_actualizacion_base_existente.sql` completo** (agrega el **bloque 18**). Recargar con **Ctrl + F5**.

- Actividad **Transporte** (`transporte`) en la base, con sus palabras: viaje / viajes, conductor / conductores.
  Si ya se había creado desde la página con ese código, solo se le ponen las palabras.
- **Palabras por actividad** (`palabra_registro`, `palabra_registros`, `palabra_conductor`, `palabra_conductores`),
  editables en Configuración → Actividades.
- **`js/palabras.js`**: si todas las actividades de la empresa usan la misma palabra, la página dice "Viaje(s)" y
  "Conductor(es)" en vez de "Pedido(s)" y "Piloto(s)" en todo lo que se ve, incluidos alert/confirm. Cambia al entrar,
  al cambiar de empresa y al salir (`actualizarSegunEmpresa()` en `js/sesion.js`). No toca ids, enlaces ni la base.
- `python/nueva_empresa.py`: opción **4 · Transporte**.
- (Los Excel y PDF de Reportes quedaron corregidos en la entrada de arriba.)

**Probar:** [11-pruebas.md](11-pruebas.md), sección "Transporte: Pedido → Viaje".

## 2026-10-04 · Nueva actividad y paleta por empresa

→ **Sin SQL.** Recargar con **Ctrl + F5**.

- **Configuración → Actividades → Nueva actividad** (solo Desarrollador): nombre, código (sale del nombre),
  descripción, icono, activa y qué usa; se puede agregar de una vez a la empresa con la que se trabaja.
  La ventana ahora muestra **todas** las actividades y marca "No la realiza esta empresa". El icono también
  se puede cambiar al modificar. Primer uso previsto: **Transporte** ([14-transporte.md](14-transporte.md)).
- **Paleta por empresa interna**: `COLORES_POR_EMPRESA` en `empresas/empresas.js` (clave = ID de la
  empresa). Se aplica al entrar, al cambiar de empresa y vuelve a la de la marca al cerrar sesión
  (`aplicarColoresEmpresa()`, llamada desde `guardarSesion` / `cerrarSesion` en `js/sesion.js`).

## 2026-10-02 · Mejoras traídas de SISCED

→ **Ejecutar `sql/01_actualizacion_base_existente.sql` completo** (agrega los **bloques 16 y 17**). Después,
cerrar sesión y volver a entrar. ⚠ **Los usuarios se renombran una sola vez**: `cen-001-jperez` →
`cenjperez01` (región + nombre + empresa, sin la tienda), `jlopez` → `jlopez01` (`admin` y `desar` no cambian).
Si dos quedarían iguales, el segundo recibe un número (`cenjperez201`). Avisar a cada uno su usuario nuevo.
Hacer una copia de las tablas antes (Table Editor → Export).

### Empresas internas con ID
Guía: [secciones/empresas-internas.md](secciones/empresas-internas.md).
- Tabla `empresas` (ID de 2 números `01`, nombre, actividades, activa) y `empresa_id` en regiones, tiendas,
  usuarios, clientes, rutas, vehículos, pedidos, categorías, tarifas y descuentos. Lo existente quedó en la
  empresa `01` "Empresa principal".
- Cada empresa hace **entregas de tienda, encomiendas o las dos** y tiene **su** mercadería (categorías,
  artículos y pesos), sus tarifas y sus descuentos; solo ve lo de sus actividades.
- **Configuración → Empresas** y **Tiendas → pestaña Empresas** (solo Desarrollador): crear, modificar (cambiar
  el ID renombra a sus usuarios), "Trabajar con esta" y eliminar. Al crear se puede copiar la configuración
  de pedidos de la empresa activa.
- **Usuarios con el ID de su empresa al final**: `jperez01` (Administrador, G1, G2) y `cenjperez01` (G3,
  Empleado, Piloto: región + nombre + empresa, **sin la tienda**; si cambia de sucursal en la región o es
  multisucursal, no cambia). Bloque 17: convierte a los que ya tenían `cen001jperez01`. Al crear un **Administrador** o G1, el Desarrollador elige la empresa
  **por su ID** (campo "Empresa (ID)").
- Cada usuario solo ve lo de su empresa (filtro automático en `js/supabase.js`, `db.fromTodas()` para todas).
  El Desarrollador cambia de empresa en el menú del usuario; todos ven ahí su empresa.
- Empresa inactiva: sus usuarios no entran.
- **Tiendas → Regiones**: crear, renombrar y eliminar regiones (antes solo en Supabase).

### Inicio simplificado (con el mapa)
Guía: [secciones/inicio.md](secciones/inicio.md).
- Tablero por rol: saludo, accesos rápidos y **4 cuadros** que abren Pedidos ya filtrado
  (`#pedidos?grupo=...`, `&fecha=todas`, `?tienda=`). Se quitaron la tabla desplegable y la actividad reciente.
- Administrador / G1 / G2: pedidos de hoy, en ruta, entregados, sin piloto + gráfica de 14 días, **Hoy por
  tienda** y **Pendientes** (sin piloto, no entregados, pilotos sin validar, clientes y usuarios por aprobar).
- **Mapa**: ahora muestra **cada entrega de hoy en su punto** con el color de su estado, las tiendas y la
  lista de pilotos de hoy. El piloto ve sus entregas numeradas en el orden de su ruta.
- Piloto: Mi ruta y Mis marcas igual que antes, con cuadros arriba.

### Clientes
- Pestañas **Tiendas | Clientes | Empresas**; se quitó "Agregar clientes" de Tiendas y el enlace "← Tiendas".
- Botón **Nuevo cliente** en cada tienda (abre el formulario con esa tienda marcada).
- **Primero la región** (quien ve varias), luego filtros región → tienda → **ruta de entrega**. Cada cliente
  tiene su ruta en cada tienda (`clientes_tiendas.ruta_id`).
- **Nuevo pedido** agrega solo a Clientes al cliente escrito a mano (con su dirección y su punto de entrega);
  si el teléfono ya existe, usa ese cliente. A un cliente elegido sin ubicación se le guarda la del pedido.
- Ubicación con coordenadas → "Ver en mapa".

### Otras mejoras
- Avisos: si una tienda no tiene Admin G3 ni su región G2, las solicitudes de clientes llegan al
  Administrador y G1 (antes no le llegaban a nadie).
- `herramientas/vaciar_base_datos.sql`: ya no deshace el vaciado si falla un contador y la comprobación
  cuenta las filas reales.
- `sql/01` bloques 8 y 11: se pueden repetir después del bloque 16 (antes fallarían por las reglas nuevas).
- Librerías (Chart.js, Excel, PDF): `LIBRERIAS` y `cargarLibreria()` en `js/componentes.js` (Inicio y Reportes).
- El botón del Cotizador se revisa al cambiar de empresa o iniciar sesión.

**Probar:** [11-pruebas.md](11-pruebas.md), secciones "Empresas internas", "Inicio", "Inicio: mapa",
"Pilotos · Tiendas · Clientes" y "Usuarios". Recargar con **Ctrl + F5** para que el navegador tome los
archivos nuevos.
