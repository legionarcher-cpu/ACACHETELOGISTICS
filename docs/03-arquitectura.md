# 3. Arquitectura: cómo está organizado

## Carpetas

```
index.html                 Única página: encabezado, menú, pie y el espacio de las secciones
empresas/empresas.js       Empresas (multimarca) y empresa activa
secciones/<nombre>.html    Contenido de cada pantalla (sin <html>/<head>/<body>)
css/
  variables.css            Colores, fuentes, bordes y sombras con nombre
  base.css                 Reinicio y fuente general ([hidden] siempre oculta)
  animaciones.css          @keyframes compartidos
  componentes.css          Piezas comunes: botones, tablas, formularios, ventanas...
  index.css                Marco: encabezado, menú, pie, notificaciones
  secciones/<nombre>.css   Estilos propios de cada sección (clases con prefijo)
js/
  supabase.js              Conexión: objeto "db"
  sesion.js                Sesión del usuario, roles y permisos de secciones
  permisos.js              Bloquea el menú y pinta el usuario según la sesión
  pagina_inicial.js        Cargador de secciones y botones del pie
  componentes.js           Funciones comunes (avisos, celdas, botones, tarifas, Python...)
  mapa.js                  Mapa gratis (Leaflet + OpenStreetMap), buscar direcciones y
                           distancia por calle A -> B (Inicio, Pedidos, Cotizador)
  avatar.js                Fotos de usuario (Storage "avatares")
  notificaciones.js        Campana y envío de avisos
  date.js                  Fecha y hora del encabezado
  menu-usuario.js          Menú desplegable del usuario y cerrar sesión
  menu-animado.js          Entrada en cascada del menú
  secciones/<nombre>.js    Lógica de cada sección
  secciones/configuracion/ Módulos grandes de Configuración (pedidos.js, actividades.js)
responsive/                Tablet y celular (responsive.css + responsive.js)
python/                    Scripts de Python (ver 09-python.md)
sql/                       Scripts de la base de datos (ver 05-base-de-datos.md)
img/                       Logos e imágenes
docs/                      Esta documentación
```

## Orden de carga (`index.html`)

1. **CSS**: variables → base → animaciones → componentes → index → Bootstrap Icons → responsive.
   Si una regla se repite, gana la que se carga después. El CSS de cada sección lo agrega el cargador.
2. **`empresas/empresas.js`** (sin `defer`): colores de la empresa antes de dibujar.
3. **`js/sesion.js`** (sin `defer`) + un script en línea: si no hay sesión pone `<html class="sin-sesion">`,
   si hay pone `<html data-rol="...">` (el CSS oculta cosas según eso).
4. Con `defer`, en este orden: supabase-js (CDN) → `supabase.js` → `avatar.js` → `componentes.js` →
   `mapa.js` → `notificaciones.js` → `permisos.js` → `date.js` → `menu-usuario.js` → `menu-animado.js` →
   `pagina_inicial.js` (último) → `responsive/responsive.js`.

## Cargador de secciones (`js/pagina_inicial.js`)

- Cada opción del menú es un enlace con `#`: `#pedidos`, `#rutas`...
- Al cambiar el `#`, descarga **una sola vez** `secciones/<nombre>.html`, `css/secciones/<nombre>.css`
  y `js/secciones/<nombre>.js`, y muestra el HTML dentro de `.cuerpo-principal`.
- El JS de la sección se registra así y su función se ejecuta **cada vez** que se muestra:

```js
registrarSeccion('facturas', (zona) => {
    // zona = el div donde se mostró la sección: buscar con zona.querySelector(...)
    return () => { /* limpieza al salir (opcional): detener intervalos, cerrar ventanas */ };
});
```

- El CSS de una sección solo está activo mientras se ve esa sección.
- **Parámetros**: `#pedidos?id=15&qr=1` → `parametrosSeccion().get('id')`.
- Sin sesión siempre muestra `loggin`. Con sesión y sin `#` muestra `SECCION_INICIAL` (`inicio`).
- Antes de cargar revisa `tienePermiso(nombre)`; si no, muestra "No tienes permiso".
- `SECCION_DEL_MENU`: secciones que no están en el menú y qué opción resaltan (ej. `clientes` → `tiendas`).
- **Botones del pie** (`BOTONES_PIE`): Crear Pedido → `pedidos?nuevo=1`, Asignar Piloto → `rutas`,
  Reasignar horario → `pedidos?accion=reasignar`, Cancelar pedido → `pedidos?accion=cancelar`,
  Generar reporte → `reportes`, Cotizador → `cotizador` (solo si la empresa realiza Encomiendas).
- Transición: la sección sale en 150 ms (`DURACION_SALIDA`, igual que el CSS de `.cuerpo-principal`).

Funciones que usan otros archivos: `irA(nombre)`, `mostrarSeccionActual()`, `limpiarHash()`,
`nombreSeccionDeHash()`, `parametrosSeccion()`.

## Sesión y permisos (`js/sesion.js`, `js/permisos.js`)

- La sesión se guarda en `sessionStorage` (se borra al cerrar la pestaña):
  `{ id, usuario, nombre, rol, tienda: {id, codigo, nombre}|null, region, permisos, foto_url }`.
- Funciones: `obtenerSesion()`, `guardarSesion()`, `cerrarSesion()`, `rolActual()`, `esAdministrador()`,
  `esAdminG1()`, `esAdminG2()`, `esAdminG3()`, `tiendaActual()`, `regionActual()`, `tienePermiso(seccion)`.
- Qué secciones abre cada rol:
  - `SECCIONES_LIBRES`: `inicio`, `perfil` (todos).
  - `SECCIONES_POR_ROL`: el piloto **solo** `inicio` y `pedidos`.
  - `SECCIONES_BLOQUEADAS_POR_ROL`: el empleado **no** `usuarios`, `pilotos`, `reportes`, `rutas`.
  - `USAR_PERMISOS = false`: la columna `permisos` de cada usuario **no se usa** por ahora.
- `aplicarPermisos()` (permisos.js) se llama al abrir, al iniciar y al cerrar sesión: pone el nombre y la
  foto, enciende/apaga la campana y bloquea con candado las secciones sin permiso.
- **Dentro de cada sección**, lo que ve y hace cada rol lo decide su propio JS (ver
  [06-roles-y-permisos.md](06-roles-y-permisos.md)).

⚠ Todo esto es **protección visual**: la base de datos hoy acepta todo con la clave pública.
La protección real es la Fase 7 ([12-pendientes.md](12-pendientes.md)).

## Funciones comunes (`js/componentes.js`)

| Función | Qué hace |
|---|---|
| `crearAviso(elemento, ms)` | Aviso verde/rojo: `.mostrar(texto, 'ok'|'error')`, `.limpiar()` |
| `crearCelda(texto, clase)` | Celda de tabla (vacío = "—") |
| `crearCeldaEtiqueta(texto, color)` | Celda con etiqueta de color (`etiqueta-verde`, ...) |
| `crearBotonIcono(accion, id, icono, texto, deshabilitado)` | Botón de icono con `data-accion` y `data-id` |
| `crearCeldaAcciones(...botones)` | Celda de botones alineados a la derecha |
| `crearFilaVacia(texto, columnas)` | Fila "no hay datos" |
| `crearFilaGrupo(...)` | Fila de título de grupo (ej. región, categoría) |
| `crearPestanas(caja, opciones, actual, alCambiar)` | Pestañas (ej. una por actividad): `.valor()`, `.cuentas({ codigo: n })`. Las usan Pedidos y Reportes |
| `buscarTarifa(tarifas, actividad, tienda)` | Tarifa que aplica: tienda > región > general (+ `alcance`) |
| `calcularEnvioTarifa(tarifa, peso, compra)` | Fórmula del envío (la misma en Pedidos, Cotizador y Configuración) |
| `montoDescuento(descuento, envio)` | Monto de un descuento (% o fijo, nunca más que el envío) |
| `coincideBusqueda(valores, texto)` | Buscador sin distinguir mayúsculas |
| `plural(n, singular, plural)` | "1 tienda" / "3 tiendas" |
| `cargarPython(ruta)` | Python en el navegador (ver [09-python.md](09-python.md)) |

Todos los textos se ponen con `textContent` (nunca como HTML) para evitar problemas con datos raros.

## Mapa y distancias (`js/mapa.js`, gratis y sin clave)

| Función / constante | Qué hace |
|---|---|
| `crearMapaRuta(caja, opciones)` | Mapa "punto A → punto B": botones Ubicar A / Ubicar B, clic en el mapa, puntos que se arrastran, ruta dibujada, distancia, enlaces a Google Maps / Waze y botón "Ampliar mapa". La rueda del mouse solo acerca después de hacer clic en el mapa. Lo usan Pedidos y Cotizador |
| `buscarDireccion(texto, { cerca })` | Nominatim (OpenStreetMap): dirección → puntos, con prioridad a la zona que se ve en el mapa. Acepta coordenadas o un enlace de Google Maps. Recuerda las búsquedas repetidas |
| `sugerirDirecciones(input, { cerca, alElegir })` | Lista de sugerencias bajo el campo mientras se escribe (tras 0.7 s sin escribir; ↑ ↓ Enter Escape). `crearMapaRuta` la pone sola con `entradaA` / `entradaB` |
| `entradaYaUbicada(input)` | `true` si el texto del campo es una sugerencia ya elegida (así no se vuelve a buscar al salir del campo) |
| `rutaEntre(a, b)` | OSRM: km y minutos por calle. Si no responde: línea recta × 1.3 (`aproximada`) |
| `puntoDeTexto(texto)` | Saca "lat, lng" de un texto o enlace de mapas (ej. la ubicación guardada del cliente) |
| `enlacesNavegacion(a, b)` | Enlaces para navegar con Google Maps o Waze (no necesitan clave) |
| `cargarLeaflet()` | Descarga la librería del mapa una sola vez (también la usa Inicio) |
| `MAPA_CENTRO`, `MAPA_ZOOM`, `MAPA_PAIS`, `MAPA_CAPA`, `MAPA_SERVICIOS` | Dónde arranca el mapa, país de las búsquedas y servidores usados |

Los servidores públicos (OpenStreetMap, Nominatim, OSRM) son gratuitos para uso moderado: Nominatim
admite 1 búsqueda por segundo (por eso se busca al terminar de escribir, no en cada letra). Si el uso
crece, se cambian en `MAPA_SERVICIOS` / `MAPA_CAPA` sin tocar las secciones.

## Convenciones

- Nombres en español, sin tildes en código (`pedidos`, `tiendaActual`).
- Prefijo por sección en ids y clases: `ped` (pedidos), `rut` (rutas), `cfg` (configuración),
  `usr`, `tnd`, `cli`, `plt`, `rep`, `ini`, `prf`, `login-`.
- Constantes de sección en MAYÚSCULAS con prefijo: `PED_ESTADOS`, `CFG_MODULOS`, `REP_COLORES`.
- Comentario de cabecera en cada archivo: qué hace, tablas que usa, quién puede qué.
- Moneda: colón (₡), país Costa Rica (WhatsApp +506). En pantalla se dice "horario"; en la base de
  datos se llama `marca` (`marca_numero`, `marcas_horario`).
