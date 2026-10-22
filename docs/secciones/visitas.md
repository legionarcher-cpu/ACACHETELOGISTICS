# Visitas (solo Desarrollador)

Reporte de **quién entra al sistema**: de qué empresa, qué usuario, desde qué dispositivo y dirección (IP)
y a qué pantallas. Se abre en **Tiendas → pestaña Visitas** (`#visitas`). Solo la ve el Desarrollador.

## Qué se anota

| Momento | Dónde | Qué se guarda |
|---|---|---|
| Al iniciar sesión | `js/secciones/loggin.js` → `registrarVisita('ingreso')` | tipo `ingreso` |
| Al abrir cada pantalla | `js/pagina_inicial.js` (`cargarSeccion`) → `registrarVisita('pantalla', nombre)` | tipo `pantalla` + la sección |

Cada visita lleva usuario, empresa, dispositivo ("Android · celular", "Windows · PC"), navegador ("Chrome 129"),
si se abrió desde la **app instalada**, y la **IP y el país** (los pone la base desde la llamada; la página no
los manda). La misma pantalla abierta dos veces en menos de 5 segundos cuenta una vez. Las visitas del
Desarrollador no se anotan. Si falla (sin internet o sin el bloque 36), no se avisa ni frena nada.

**Se guardan 3 días.** Cada registro y cada reporte borran lo anterior.

## La pantalla

- **Totales**: ingresos, pantallas abiertas, usuarios, empresas, usuarios en celular y con la app instalada.
- **Filtros**: empresa, tipo (ingresos / pantallas), día y búsqueda (usuario, nombre, IP, dispositivo).
- **Por usuario**: agrupado por empresa. Por cada usuario: rol y tienda, ingresos, pantallas, último acceso,
  pantalla más usada, último dispositivo e IP.
- **Detalle**: cada visita (las 500 más recientes en pantalla; el Excel lleva todas).
- **Exportar Excel**: hojas "Por usuario" y "Detalle", con los filtros aplicados.
- **IP**: al tocarla se abre ipinfo.io con su **ciudad aproximada** (suele ser la del proveedor de internet).
  La página no consulta ningún servicio externo por su cuenta.

## Archivos

| Qué | Archivo |
|---|---|
| HTML | `secciones/visitas.html` |
| Lógica | `js/secciones/visitas.js` |
| Estilos | `css/secciones/visitas.css` (clases `vis-`) |
| Anotar | `js/sesion.js` (`registrarVisita`, `datosDispositivo`) |
| Permiso | `js/sesion.js` (`tienePermiso`: `visitas` solo Desarrollador) |
| Base | Tabla `visitas`, funciones `registrar_visita` y `reporte_visitas` (sql/01 bloque 36; sql/00 sección 29) |

## Seguridad

Desde la web la tabla `visitas` no se lee ni se escribe directo, solo con las dos funciones. Las dos confirman con la
sesión de Supabase Auth que el usuario que manda la página es el de la sesión: cada uno anota solo sus visitas, y
`reporte_visitas` solo responde al Desarrollador.

## Dónde tocar

- **Días que se guardan**: `interval '3 days'` en las dos funciones del bloque 36 (y el texto "3 días" de la pantalla).
- **Qué se anota del dispositivo**: `datosDispositivo()` en `js/sesion.js`.
- **No anotar alguna pantalla**: la condición junto a `registrarVisita` en `cargarSeccion` (`js/pagina_inicial.js`).
