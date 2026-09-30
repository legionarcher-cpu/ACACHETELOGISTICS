# Encabezado, menú, pie y notificaciones (marco del index)

Lo que se ve siempre, alrededor de las secciones. HTML en `index.html`, estilos en `css/index.css`.

## Encabezado

| Parte | Qué es | Dónde se cambia |
|---|---|---|
| Logo animado (izquierda) | Logo de ACACHETE que se turna cada 6 s con el de la empresa (efecto cortina) | Imágenes y fondo: `css/index.css` (`.logo-img-1`, `.logo-img-2`, `.logo-slog`). Velocidad: `6s` en `.logo-img-1` y `.logo-img-2` |
| Logo de la empresa | Junto al título (`#log-sec`) | `css/index.css` → `#log-sec` |
| Título | Texto (`titulo` + `subtitulo`) o imagen que cubre el recuadro (`encabezado`) | `empresas.js` |
| Fecha y hora | Mes/año, día y hora; se actualiza cada segundo | `js/date.js` |
| Campana | Notificaciones (ver abajo) | `js/notificaciones.js` |
| Usuario | Foto o iniciales + nombre; menú: Mi perfil, Configuración, Cerrar sesión | `js/permisos.js`, `js/menu-usuario.js` |

## Menú lateral

- Una opción por sección (`<li class="menu-item"><a href="#seccion">`).
- Las secciones sin permiso aparecen grises con candado (`js/permisos.js`).
- La opción de la sección actual se resalta (`.activo`, lo pone `pagina_inicial.js`).
- Entrada en cascada al cargar e iniciar sesión (`js/menu-animado.js`).

## Pie

- **Botones de acceso rápido** (`BOTONES_PIE` en `pagina_inicial.js`): Crear Pedido, Cargar Pedidos
  (sin función aún; solo G2 y G3), Asignar Piloto, Reasignar horario, Cancelar pedido, Generar reporte,
  **Cotizador** (solo si la empresa realiza Encomiendas; lo decide `pagina_inicial.js` con
  `empresaTieneActividad('encomiendas')`; ver [cotizador.md](cotizador.md)).
- Se ocultan por rol en `css/index.css` ("SEGÚN EL ROL"): Piloto ninguno; G3 y Empleado sin Asignar
  Piloto; Empleado sin Cancelar ni Reporte.
- **Texto de derechos:** `empresas.js` → `pie`.

## Notificaciones (`js/notificaciones.js`, tabla `notificaciones`)

- Campana con número rojo de no leídas; lista de las últimas 30; clic → se marca leída y lleva a su
  sección; aviso emergente abajo a la derecha. Revisa cada 60 s y al cambiar de sección.
- Para enviar desde una sección: `notificarPendiente(...)` (a quienes aprueban), `notificarResultado(...)`
  (a quien pidió), `resolverPendientes(...)` (marca resueltas).
- A quién se avisa: usuario creado por G3 → Administrador, G1 y G2 de la región; solicitud de un
  Empleado → el G3 de su tienda (o el G2 si no hay G3).
- Si enviar falla, la acción principal no se detiene.
- Constantes: `NOTI_INTERVALO`, `NOTI_LIMITE`, `NOTI_DURACION_AVISO`.

## Responsive (`responsive/`)

- Solo reglas `@media` (≤1200, ≤900, ≤600, ≤420 px); en computadora no cambia nada.
- ≤ 900 px: botón ☰ abre el menú como panel con fondo oscuro (se cierra al elegir, con Escape o al
  tocar el fondo); los botones del pie quedan solo con icono (nombre como globo).
- Al cambiar `responsive.css`, subir el número `?v=N` en `index.html` para que los celulares no usen la copia vieja.
