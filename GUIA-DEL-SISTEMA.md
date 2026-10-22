# GUÍA DEL SISTEMA: QUÉ HACE CADA PARTE
### ACACHETE Logistics · versión 1.2 · 2026-10-21

Qué hace cada archivo SQL de la base y cada componente de la app y de la página web. El detalle de cada tema
está en `docs/` (empezar por `docs/README.md`).

---

## 1. Las piezas

| Pieza | Qué es |
|---|---|
| `app.html` | **La app** (el sistema). Una sola página: encabezado, menú y pie fijos; cada sección se carga en el centro sin recargar |
| `index.html` + `web/` | **La página web de presentación** (acachetelogistics.com). Aparte de la app: no usa sus archivos |
| `ubicacion.html` | Página suelta, sin iniciar sesión: el cliente marca en el mapa dónde quiere su entrega (enlace que le manda la tienda) |
| Supabase | Base de datos (PostgreSQL), inicio de sesión (Auth) y fotos (Storage). La página se conecta directo; no hay servidor propio |
| Cloudflare | Publica el sitio en cada push a `main` (`wrangler.jsonc`). Lo que no se publica (sql, docs, .md) está en `.assetsignore` |

**Roles:** Desarrollador (de ninguna empresa), Administrador, Admin G1 (toda la empresa), Admin G2 (una región),
Admin G3 (una tienda), Empleado, Piloto y Cliente. Además, a cada usuario se le suman o quitan **funciones**, y
puede ser **Admin TI** (da la llave de soporte al Desarrollador).

---

## 2. Base de datos: `sql/instalacion/`

Se ejecutan **en orden**, del 00 al 12, en Supabase → SQL Editor. Todos se pueden repetir sin duplicar nada
(salvo el 00, que borra todo). Una base ya instalada no se reinstala: cada cambio nuevo va en un archivo con fecha
en `sql/actualizaciones/` (ver `sql/LEEME.md`). Los scripts viejos están en `sql/historial/` y no se ejecutan.

### Regla general de la base

- **Cada empresa ve y cambia solo lo suyo.** Dentro de la empresa: G2 su región, G3 y Empleado su tienda, Piloto
  lo suyo, Cliente lo suyo.
- **Los movimientos se hacen con funciones de la base**, no escribiendo directo en las tablas: pedidos (estados),
  viajes, recolecciones, cajas, bodegas y marcas. Cada función revisa quién es el usuario y qué puede hacer.
- **El usuario de la sesión** lo sabe la base (Supabase Auth); las funciones no aceptan actuar en nombre de otro.

### Archivo por archivo

| Archivo | Qué hace | Tablas | Funciones principales |
|---|---|---|---|
| `00_reiniciar_base.sql` | **Borra todo** el sistema (tablas, funciones, datos y los accesos `@acachete.interno` de Auth). Solo para una base de prueba | — | — |
| `01_base.sql` | Lo que usan todos los módulos: empresas internas, regiones, tiendas, vehículos, clientes y usuarios. **Seguridad:** quién es el usuario de la sesión, su empresa, su alcance y sus funciones. Crea el acceso en Supabase Auth al crear un usuario. **Soporte:** llaves del Admin TI y bitácora del Desarrollador. Avisos, ajustes por empresa y registro de visitas | `empresas`, `regiones`, `tiendas`, `vehiculos`, `clientes`, `clientes_tiendas`, `usuarios`, `funciones`, `usuario_funciones`, `notificaciones`, `configuracion`, `visitas`, `soporte_llaves`, `soporte_bitacora` | `ahora_local` (hora de Costa Rica), `yo`, `mi_empresa`, `puede('función')`, `mis_tiendas`, `usuario_activo`, `usuario_guardar_funciones`, `resolver_pendientes`, `cambiar_codigo_tienda`, `soporte_crear_llave`, `soporte_usar_llave`, `soporte_emergencia` |
| `02_actividades_y_catalogos.sql` | Las actividades (tienda, encomiendas, transporte, distribución, recolección…) y qué partes del sistema usa cada una. Catálogos de los pedidos | `actividades`, `categorias_mercaderia`, `articulos_catalogo`, `tamanos_bulto`, `tarifas`, `descuentos`, `motivos_retraso` | — |
| `03_horarios_y_marcas.sql` | Horarios en una sola estructura: **turnos del piloto** (marcas) y **slots de despacho**, con la base y los días especiales. Marcas del piloto con el QR fijo de la tienda (revisa el GPS) o el QR del día del piloto | `horarios_dias`, `horarios`, `horarios_capacidad`, `marcas_piloto`, `pilotos_dia`, `qr_tiendas_fijo` | `marcas_del_dia`, `slots_del_dia`, `marcar_por_qr_fijo`, `qr_piloto_dia`, `validar_y_marcar_piloto` |
| `04_rutas_y_pedidos.sql` | Rutas y qué piloto las hace. **Pedidos:** nunca se borran (se cancelan o anulan). El estado **solo** lo cambian funciones de la base, y cada cambio queda en el historial; la hora de cada paso sale del historial. Entregas, fotos, solicitudes de envío del cliente y enlace de ubicación | `rutas`, `rutas_pilotos`, `pedidos`, `pedido_articulos`, `pedido_entregas`, `pedido_evidencias`, `pedido_historial`, `pedido_solicitudes`, `ubicaciones_compartidas` · vistas `pedidos_pasos`, `pedidos_tiempos`, `slots_carga` | `pedido_estado` (botones del pedido), `pedido_asignar` (piloto, fecha, horario, reprogramar), `pedido_cargar`, `piloto_salir_ruta`, `pedido_iniciar_entrega`, `pedidos_liberar_piloto`, `validar_codigo_respaldo` |
| `05_transporte.sql` | Viajes de personas y carga: reglas de la empresa, precio por franja de hora, días cerrados y cortesía. La página solo lee: reservar, cambiar hora, cancelar y avanzar es con funciones que evitan que dos clientes tomen la misma hora | `transporte_config`, `transporte_franjas`, `transporte_dias_cerrados`, `viajes`, `cortesias` | `viajes_horas_disponibles`, `viaje_precio`, `viajes_solicitar`, `viajes_cambiar_hora`, `viajes_cancelar`, `viajes_avanzar` |
| `06_costos.sql` | Gastos del mes y margen deseado, para calcular el precio mínimo y el sugerido | `costos_operacion`, `costos_config` | — |
| `07_caja_y_ubicacion.sql` | **Caja** de pilotos y conductores (fondo, cobros, cierre con efectivo, SINPE y tarjeta). **Ubicación** en tiempo real: la última posición de cada piloto en ruta | `cajas`, `cierres_caja`, `ubicaciones_pilotos` | `caja_cerrar`, `piloto_en_ruta`, `piloto_ubicacion` |
| `08_distribuidora.sql` | Distribuidora: productos, presentaciones, listas de precios con IVA, bodega del día por ruta, carga, entrega parcial, venta en ruta, devolución y cuadre de cada piloto | `productos`, `producto_presentaciones`, `listas_precios`, `precios`, `motivos_entrega_parcial`, `bodegas_dia`, `bodega_movimientos`, `pedido_productos`, `cierres_mercaderia` | `dist_bodega_abrir`, `dist_movimiento`, `dist_entregar`, `dist_venta_ruta`, `dist_cerrar_piloto`, `dist_cerrar_bodega` |
| `09_recolecciones.sql` | Recolecciones: el cliente elige hora (una sola agenda), qué se recoge y dónde se entrega. Bloqueos de horas y tarifa diaria por cliente que se cobra cada semana | `recoleccion_config`, `recoleccion_bloqueos`, `recoleccion_tarifas`, `recolecciones`, `recoleccion_cargos` | `recolecciones_horas`, `recolecciones_solicitar`, `recolecciones_cambiar_hora`, `recolecciones_cancelar`, `recolecciones_avanzar`, `recoleccion_generar_cargos` |
| `10_clientes_y_herramientas.sql` | El cliente **pide su usuario** desde el login (queda pendiente de aprobar). **Limpiar los datos de una empresa** (solo el Desarrollador, con su contraseña) | — | `registro_clientes_empresa`, `solicitar_acceso_cliente`, `limpiar_empresa` |
| `11_acceso_web.sql` | **Reglas de acceso (RLS)** de todas las tablas: quién lee y quién cambia cada una. Sin sesión no se ve nada (salvo registro de clientes, ubicación por enlace y actividades). Buckets de fotos (`avatares`, `evidencias`) | — | `reglas_tabla` |
| `12_datos_arranque.sql` | Lo mínimo para entrar y probar: actividades, tamaños de bulto, la empresa `01` con datos de ejemplo y los usuarios `desar` (Desarrollador) y `admin` (Administrador de la 01) | — | — |

---

## 3. La app (`app.html`)

### 3.1 Cómo se arma una sección

Cada sección son **3 archivos con el mismo nombre**: `secciones/<nombre>.html` (contenido),
`js/secciones/<nombre>.js` (lógica) y `css/secciones/<nombre>.css` (estilos). `js/pagina_inicial.js` los carga al
abrir `app.html#<nombre>`.

### 3.2 Componentes compartidos (JS)

| Archivo | Qué hace |
|---|---|
| `js/supabase.js` | Conexión con la base (objeto `db`). Inicia sesión en Supabase Auth con el correo interno (`usuario@acachete.interno`) y deja cada consulta dentro de la empresa activa |
| `js/sesion.js` | Sesión del usuario: rol, empresa, tienda, región y funciones (las lee de la base). Dice qué secciones puede abrir cada rol |
| `js/pagina_inicial.js` | Cargador de secciones y botones del pie |
| `js/permisos.js` | Bloquea el menú y pinta el usuario del encabezado según la sesión |
| `js/componentes.js` | Piezas reutilizables: avisos, celdas, botones, búsquedas, formatos de Costa Rica |
| `js/notificaciones.js` | Campana del encabezado: enviar, mostrar y marcar avisos |
| `js/soporte.js` | Aviso del Desarrollador dentro de la campana ("Modo soporte · Empresa X · vence a las…") y su ventana para usar la llave |
| `js/palabras.js` | Cambia "Pedido" por "Viaje" y "Piloto" por "Conductor" según la actividad |
| `js/qr.js` | Escáner de QR: pedido, QR fijo de la tienda y QR del día del piloto |
| `js/mapa.js` | Mapa gratis, búsqueda de direcciones y distancia por calle (cobro por km) |
| `js/ubicacion.js` | Manda el GPS del piloto cada 2 minutos mientras está en ruta |
| `js/carga-comun.js` | Ventana de carga del pedido con fotos (piloto); la usan Inicio y Pedidos |
| `js/viajes-comun.js` | Piezas comunes de Viajes y Recolecciones: estados, tarjeta, cortesía, fechas |
| `js/distribucion-comun.js` | Piezas comunes de la distribuidora: precios con IVA, selector de productos, entrega por producto |
| `js/avatar.js` | Fotos de usuario: validar, achicar, subir y mostrar |
| `js/date.js`, `js/menu-usuario.js`, `js/menu-animado.js` | Fecha y hora del encabezado, menú del usuario y entrada animada del menú |
| `responsive/responsive.js` + `.css` | Menú ☰ y ajustes para tablet y celular |
| `empresas/empresas.js` | Marcas (otra copia del sistema con su logo, colores y base) y modelos de paleta |

### 3.3 Estilos (CSS)

| Archivo | Qué tiene |
|---|---|
| `css/variables.css` | Colores, fuentes y medidas con nombre |
| `css/base.css`, `css/animaciones.css` | Reglas generales y animaciones compartidas |
| `css/componentes.css` | Botones, tablas, formularios, ventanas, etiquetas (van con `js/componentes.js`) |
| `css/index.css` | Marco de la app: encabezado, menú, pie, campana y aviso de soporte |
| `css/encabezados.css` | Imágenes del encabezado de cada marca y empresa (único lugar) |
| `css/despacho.css`, `css/viajes.css`, `css/distribucion.css` | Piezas de carga y salida a ruta, de viajes y de la distribuidora, que usan varias secciones |
| `css/secciones/*.css` | Lo propio de cada sección |

### 3.4 Secciones

| Sección | Qué hace | Base que usa |
|---|---|---|
| **Login** (`loggin`) | Inicio de sesión (el usuario escribe solo su ID) y "Solicita tu usuario" para clientes | 01, 10 |
| **Inicio** (`inicio`) | Tablero del día según el rol: resumen, mapa de entregas y pilotos, "Mi ruta" del piloto con carga y salida por slot | 03, 04, 07 |
| **Pedidos** (`pedidos`) | Registrar, listar y ver el detalle de pedidos; asignar piloto y horario, cambiar estado (siempre por funciones de la base), QR, código de respaldo, entrega y línea de tiempo | 02, 03, 04, 08 |
| **Mis envíos** (`envios`) | El cliente solicita un envío y sigue los suyos | 04 |
| **Viajes** (`viajes`) | Transporte: el cliente reserva en 4 pasos; el personal ve la agenda y el conductor avanza el viaje | 05 |
| **Recolecciones** (`recolecciones`) | Agenda de recolecciones, proceso del conductor, bloqueos y cobro semanal | 09 |
| **Distribución** (`distribucion`) | Productos, precios, bodega del día, carga, venta en ruta, devoluciones y cierres | 08 |
| **Caja** (`caja`) | Cobros sin cerrar de cada piloto y cierre de caja | 07 |
| **Pilotos** (`pilotos`) | Lista de pilotos con tienda y vehículo | 01 |
| **Rutas y asignaciones** (`rutas`) | Calendario semanal: qué piloto hace cada ruta | 04 |
| **Tiendas** (`tiendas`) | Tiendas, regiones y QR fijo de cada tienda | 01, 03 |
| **Clientes** (`clientes`) | Clientes por tienda, aprobaciones y solicitudes de usuario de clientes | 01, 10 |
| **Usuarios** (`usuarios`) | Crear y modificar usuarios, sus funciones, Admin TI; liberar un piloto de otras tiendas; acciones de emergencia del Desarrollador | 01, 04 |
| **Empresas internas** (`empresas-internas`) | Crear empresas (ID, actividades, paleta) y trabajar con una. Solo el Desarrollador | 01, 10 |
| **Reportes** (`reportes`) | Pedidos y viajes con filtros, gráficas y exportación a Excel y PDF | 04, 05 |
| **Cotizador** (`cotizador`) | Precio de un envío de Encomiendas sin registrar nada | 02 |
| **Configuración** (`configuracion`) | Tarjetas de módulos (abajo) | varios |
| **Mi perfil** (`perfil`) | Datos del usuario y su foto | 01 |
| **Visitas** (`visitas`) | Quién entra al sistema (3 días). Solo el Desarrollador | 01 |

**Módulos de Configuración** (`js/secciones/configuracion/`, se descargan al abrir su tarjeta):

| Módulo | Qué configura |
|---|---|
| Horarios (dentro de `configuracion.js`) y `slots.js` | Turnos del piloto, pedidos por horario y slots de despacho |
| `pedidos.js` | Tarifas, descuentos, tamaños, motivos de retraso, número de pedido y código de respaldo |
| `articulos.js` | Categorías de mercadería y pesos promedio |
| `actividades.js` | Actividades y qué partes usa cada una |
| `transporte.js` | Reglas de viajes, franjas de precio y días cerrados |
| `costos.js` | Gastos del mes y margen |
| `cajas.js` | Tipos de caja y fondo de cada piloto |
| `planes.js` | Plan de cada empresa y qué incluye (solo el Desarrollador) |
| `soporte.js` | Llaves de soporte para el Desarrollador y su bitácora (Admin TI y Administrador) |

---

## 4. La página web de presentación

| Archivo | Qué hace |
|---|---|
| `index.html` | Página principal: bienvenida, soluciones por tipo de empresa, galería "Conozca más" y pie |
| `web/paginas/solucion-courier.html`, `solucion-distribuidora.html`, `solucion-transporte.html` | Una página por tipo de empresa |
| `web/paginas/productos.html`, `vision.html`, `contacto.html` | Productos (cada función de la app), misión y visión, y formulario de demostración |
| `web/css/web.css` | Colores, estilos e imágenes de la página |
| `web/js/web.js` | Imágenes que se turnan y ventanas internas (también abre la app dentro de la página) |
| `_headers`, `robots.txt`, `sitemap.xml` | Qué ven los buscadores: la web sí, la app no (`docs/17-google.md`) |

---

## 5. Otros

| Carpeta o archivo | Qué hace |
|---|---|
| `docs/` | Documentación técnica por tema y por sección; `MANUAL-DE-USO.md` para quienes usan el sistema |
| `sql/LEEME.md` | Cómo instalar y cómo hacer cambios en la base |
| `herramientas/empresas.bat` | Crear o cambiar una marca (paleta, base, regla de encabezado) |
| `herramientas/manual_a_docx.ps1` | Convierte el manual de uso a Word |
| `herramientas/prueba_logica_viajes.html` | Pruebas de precios de viajes y palabras, sin base de datos |
| `python/tarifas.py` | Cálculo del precio del envío por peso |
| `python/pesos_promedio.py` | Compara los pesos promedio del catálogo con los reales de los pedidos |
| `python/empresa_activa.py` | Conexión de los scripts de Python con la base de la marca activa |
| `PROPUESTA-ESTRUCTURADA-V2.md` | Diseño original del sistema (historia) |
