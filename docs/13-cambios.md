# 13. Registro de cambios

Lo más nuevo, arriba. Cada entrada dice qué SQL hay que ejecutar.

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
