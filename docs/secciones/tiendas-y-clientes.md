# Tiendas (`#tiendas`) y Clientes (`#clientes`)

## Tiendas

| Archivo | Qué tiene |
|---|---|
| `secciones/tiendas.html`, `js/secciones/tiendas.js`, `css/secciones/tiendas.css` | Clases e ids `tnd` |
| Tablas | `tiendas`, `regiones`, función `cambiar_codigo_tienda` |

- Lista agrupada por región, con filtro y buscador; cuenta los usuarios de cada tienda.
- **Crear:** región + número → código `NOR-004` (sugiere el siguiente número libre).
- **Modificar:** todo, incluido el código. Si el código cambia, sus usuarios se renombran solos
  (`cen-001-jperez` → `nor-004-jperez`) con `cambiar_codigo_tienda`.
  *Esto cambiará con el nuevo método de usuarios (opción C, ver [12-pendientes.md](../12-pendientes.md)).*
- **Eliminar:** solo si no tiene usuarios (si no, marcarla "Inactiva").
- Botones de Clientes: "Agregar clientes" y el de personas de cada fila abren la sección Clientes.

| Rol | Puede |
|---|---|
| Administrador | Crear, modificar (incluido el código) y eliminar |
| Admin G1 | Crear y modificar datos; no elimina ni cambia el código |
| Admin G2 / G3 / Empleado | Solo ver (G2 su región, G3 su tienda) |
| Piloto | Sin acceso |

Reglas de la base de datos: código `AAA-000` y las 3 letras iguales a la región; no se borra una
tienda con usuarios. Las **regiones** se administran en Supabase (tabla `regiones`).

## Clientes

Se abre desde Tiendas (no está en el menú; resalta "Tiendas").
`#clientes?tienda=3` filtra por esa tienda; `#clientes?nuevo=1` abre el formulario.

| Archivo | Qué tiene |
|---|---|
| `secciones/clientes.html`, `js/secciones/clientes.js`, `css/secciones/clientes.css` | Clases e ids `cli` |
| Tablas | `clientes`, `clientes_tiendas` (un cliente puede estar en varias tiendas) |

| Rol | Ve | Hace |
|---|---|---|
| Administrador / G1 | Todos | Crear, modificar, eliminar, aprobar |
| Admin G2 | Su región | Lo mismo en su región |
| Admin G3 | Su tienda | Lo mismo en su tienda (aprueba a sus Empleados) |
| Empleado | Su tienda | Crear y modificar **con aprobación**; no elimina |
| Piloto | Sin acceso | — |

**Aprobación:** lo que crea un Empleado queda `aprobado = false`; lo que modifica queda en
`cambios_pendientes` (los datos reales no cambian hasta aprobar). Botón "Revisar": aprobar o rechazar
(rechazar un cliente nuevo lo elimina). Avisos: al G3 de la tienda (o al G2 si no hay G3) y, al
resolver, al Empleado.

Pendiente: calificación 1–5 por pedido y categoría A/B/C/D (hoy todos "Nuevo").
Columnas que se leen: `CLI_COLUMNAS`; campos modificables: `CLI_CAMPOS`.
