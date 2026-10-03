# Inicio (`#inicio`)

Primera pantalla después del login (`SECCION_INICIAL` en `js/pagina_inicial.js`): un tablero simple de
**"qué pasa hoy"** que cambia según el rol, con el **mapa** de las entregas del día. Todo es de la empresa
activa (ver [empresas.md](empresas.md)). No cuenta pedidos anulados.

| Archivo | Qué tiene |
|---|---|
| `secciones/inicio.html`, `js/secciones/inicio.js`, `css/secciones/inicio.css` | Clases e ids `ini` |
| Tablas | `pedidos`, `pedido_historial`, `usuarios`, `tiendas`, `clientes`, `pilotos_dia`, `marcas_piloto`, `marcas_del_dia()` |

Arriba: saludo con el nombre, la fecha, la empresa y el alcance (región / tienda), y **accesos rápidos**
según el rol. Luego **cuatro cuadros grandes**; cada uno abre la lista de Pedidos ya filtrada
(`#pedidos?grupo=ruta`, `?grupo=pendientes&fecha=todas`, `?tienda=3`...). Se actualiza **cada minuto**.

## Por rol

| Rol | Cuadros | Además |
|---|---|---|
| Administrador / G1 (todo) · G2 (su región) | Pedidos de hoy (por despachar · en despacho) · En ruta (pilotos en la calle) · Entregados (% de hoy, incidencias, no entregados) · Sin piloto (hoy y próximos) | Mapa · Gráfica de 14 días · **Hoy por tienda** · **Pendientes** |
| Admin G3 (su tienda) | Los mismos | Mapa · Gráfica · Pendientes |
| Empleado (su tienda) | Pedidos de hoy · Por alistar · En despacho · Entregados | Mapa · **Mis solicitudes por aprobar** (clientes) |
| Piloto | Por recibir · En ruta · Entregados hoy · Mis marcas (x/y) | **Mi ruta** · **Mis marcas de hoy** · mapa con sus entregas numeradas |

**Pendientes**: pedidos sin piloto (hoy y próximos), no entregados de hoy, **pilotos con pedidos que la
tienda aún no validó hoy** (QR del día), clientes por aprobar y usuarios por aprobar (no lo ve el G3). Cada
uno lleva a donde se resuelve.

**Hoy por tienda** (Admin / G1 / G2): cada tienda con pedidos hoy, cuántos entregó, cuántos faltan y los
no entregados; primero las que más faltan. Abre Pedidos filtrado por esa tienda.

**Gráfica** (Chart.js, se descarga después de pintar los números): pedidos de los últimos 14 días,
apilados en entregados, no entregados y sin terminar.

## Mapa (todos los roles)

Gratis (Leaflet + OpenStreetMap, sin clave; `INI_MAPA = 'google'` cambia a Google Maps, sin marcadores).

- Cada **entrega de hoy** aparece en su **punto B** (el que se marca en Nuevo pedido, mapa A → B; se guarda
  en `detalle.ruta.b`) con el **color de su estado** (leyenda al lado). Tocarla muestra el pedido, el cliente,
  la dirección, el piloto y el enlace al detalle.
- Las **tiendas** con ubicación se ven como un cuadro azul.
- Debajo del mapa se avisa cuántos pedidos no tienen punto.
- **Filtros** de región y tienda según el rol (Admin / G1: región y tienda · G2: tienda de su región · G3,
  Empleado y Piloto: sin filtros). Filtran los marcadores y la lista **Pilotos de hoy** (en ruta, por salir,
  entregados de cada piloto).
- Listo para el GPS en tiempo real: cuando la app del piloto comparta su ubicación, sus marcadores se
  agregan en `dibujarMarcadores()` con `pilotosDelFiltro()`.
- **Piloto:** ve sus entregas **numeradas en el orden de "Mi ruta"**.

## Mi ruta (solo el Piloto)

Sus pedidos por despachar y en ruta (`INI_MI_RUTA`), con un botón según el estado:

| Estado | Botón |
|---|---|
| Listo para despachar | **Recibido para ruta** → abre el QR del pedido para que el despachador lo escanee |
| Recibido para ruta | **Mostrar QR** |
| Cargado | (espera) — el botón de arriba **Saliendo a ruta (N)** pasa todos los cargados a *En ruta* y guarda la hora de salida |
| En ruta | **Entregar ahora** — solo uno a la vez (la base no deja dos *Entregando*) |
| Entregando | **Cerrar entrega** → detalle del pedido (Entregado / No entregado) |

Orden: **del más cercano al más lejano en cadena** (`ordenarEnCadena`) desde la tienda (o desde el que
está entregando). El primero *En ruta* lleva la etiqueta **Siguiente** y cada uno dice a cuánto está del
anterior.

## Mis marcas de hoy (solo el Piloto)

Sus horarios del día (`marcas_del_dia`, Configuración → Horarios). Cada uno se habilita solo según la hora
(se redibuja cada 30 s): "Todavía no se habilita" → abierto (a tiempo) → **marca tardía** (con motivo) →
"No marcada". Se marca con QR (`js/qr.js`): primero la tienda valida su **"Mi QR del día"**; luego
**"Escanear QR de la tienda"** marca el horario abierto y avisa a la tienda para despachar.

## Dónde tocar

| Quiero... | Dónde |
|---|---|
| Qué estados cuenta cada cuadro | `INI_GRUPOS` (los mismos de `PED_GRUPOS` en Pedidos) |
| Colores del mapa y la leyenda | `INI_COLOR_GRUPO` (variables de `css/variables.css`) |
| Textos y colores de estados | `INI_ESTADOS` (repetido de Pedidos: cambiar en los dos) |
| Días de la gráfica | `INI_DIAS_GRAFICA` |
| Qué mapa se usa | `INI_MAPA`: `'libre'` (por defecto) o `'google'` (clave en `INI_MAPS_CLAVE`, con facturación) |
| Centro, zoom y proveedor del mapa | `MAPA_CENTRO`, `MAPA_ZOOM`, `MAPA_CAPA` en `js/mapa.js` |
| Accesos rápidos de cada rol | Final de `inicio.js` (`accesos([...])`) |
