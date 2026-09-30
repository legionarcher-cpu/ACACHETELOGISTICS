# Inicio (`#inicio`)

Primera pantalla después del login (`SECCION_INICIAL` en `js/pagina_inicial.js`).

| Archivo | Qué tiene |
|---|---|
| `secciones/inicio.html`, `js/secciones/inicio.js`, `css/secciones/inicio.css` | Clases e ids `ini-` |
| Tablas | `pedidos`, `pedido_historial`, `usuarios` (pilotos), `rutas`, `marcas_del_dia()` |

## Las 4 partes

1. **Pedidos de hoy** (arriba izquierda): cuadros Total, Pendientes, En ruta, Entregados, No entregados /
   cancelados (clic = filtrar) + lista con pedido, cliente, ruta, piloto, horario y estado.
2. **Estadística de la semana** (arriba derecha): iconos con globo (tiempos de despacho, en ruta y total;
   entregados, con incidencia, rechazados, cancelados); clic = filtrar; promedios debajo.
3. **Ubicación de pilotos** (abajo izquierda): mapa **gratis** (Leaflet + OpenStreetMap, sin clave ni
   tarjeta; centrado en San José) + lista de pilotos activos hoy. Los marcadores en tiempo real (GPS del
   piloto) están pendientes. Se puede cambiar a Google Maps con `INI_MAPA = 'google'`.
4. **Actividad reciente de hoy** (abajo derecha): ingresa, se asigna, sale, termina; filtros región /
   tienda / ruta según el rol. Se actualiza **cada minuto**.

No cuenta pedidos anulados.

## Quién ve qué

Piloto: sus pedidos · Empleado y G3: su tienda · G2: su región · Administrador y G1: todo.

## Dónde tocar

| Quiero... | Dónde |
|---|---|
| Cambiar los cuadros de la parte 1 | `INI_GRUPOS` (clase, texto, estados, icono) |
| Textos y colores de estados | `INI_ESTADOS` (repetido de Pedidos: cambiar en los dos) |
| Qué mapa se usa | `INI_MAPA`: `'libre'` (Leaflet + OpenStreetMap, gratis, por defecto) o `'google'` |
| Centro y acercamiento del mapa | `INI_MAPS_CENTRO`, `INI_MAPA_ZOOM` (los usan los dos mapas) |
| Proveedor del dibujo del mapa libre | `INI_LIBRE_CAPA` (url, crédito, zoom máximo). OpenStreetMap es gratis para uso moderado y pide mostrar su crédito; si el uso crece, se cambia aquí por otro proveedor |
| Clave de Google Maps (solo con `'google'`) | `INI_MAPS_CLAVE`. Necesita facturación activa y estar restringida por sitio web en Google Cloud (Live Server `http://127.0.0.1:5500/*`, `http://localhost:5500/*` y el dominio real al publicar) |
