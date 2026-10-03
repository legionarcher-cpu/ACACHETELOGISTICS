# Tiendas (`#tiendas`) y Clientes (`#clientes`)

Arriba de las dos secciones hay pestañas: **Tiendas | Clientes | Empresas** (Empresas solo la ve el
Desarrollador, ver [empresas.md](empresas.md)). Todo es de la empresa activa.

## Tiendas

| Archivo | Qué tiene |
|---|---|
| `secciones/tiendas.html`, `js/secciones/tiendas.js`, `css/secciones/tiendas.css` | Clases e ids `tnd` |
| Tablas | `tiendas`, `regiones`, función `cambiar_codigo_tienda` |

- Lista agrupada por región, con filtro y buscador; cuenta los usuarios de cada tienda.
- **Crear:** región + número → código `NOR-004` (sugiere el siguiente número libre).
- **Modificar:** todo, incluido el código. Los usuarios llevan la **región** (`cenjperez01`), no la tienda:
  con otro número en la misma región no cambian; si cambia la región se renombran solos
  (`cenjperez01` → `norjperez01`) con `cambiar_codigo_tienda` (la ventana avisa).
- **Eliminar:** solo si no tiene usuarios (si no, marcarla "Inactiva").
- **Regiones** (botón, Administrador y Admin G1): crear (código de 3 letras + nombre), renombrar y eliminar
  (si no tiene tiendas). Son de la empresa activa; el código no se repite entre empresas.
- En cada fila: **clientes de la tienda** (botón de personas), **Nuevo cliente en esa tienda** (persona con +:
  abre Clientes con el formulario y esa tienda marcada) y **QR de marcas del mes** (se ve, se descarga y se
  imprime; los pilotos lo escanean al llegar. Cambia cada mes con `qr_marca_mes`).

| Rol | Puede |
|---|---|
| Administrador | Crear, modificar (incluido el código) y eliminar; regiones |
| Admin G1 | Crear y modificar datos; regiones; no elimina ni cambia el código |
| Admin G2 / G3 / Empleado | Solo ver (G2 su región, G3 su tienda) |
| Piloto | Sin acceso |

Reglas de la base de datos: código `AAA-000` y las 3 letras iguales a la región; no se borra una tienda
con usuarios ni una región con tiendas.

## Clientes

`#clientes?tienda=3` filtra por esa tienda; `#clientes?nuevo=1` abre el formulario;
`#clientes?tienda=3&nuevo=1` abre "Nuevo cliente" con esa tienda marcada.

| Archivo | Qué tiene |
|---|---|
| `secciones/clientes.html`, `js/secciones/clientes.js`, `css/secciones/clientes.css` | Clases e ids `cli` |
| Tablas | `clientes`, `clientes_tiendas` (un cliente puede estar en varias tiendas, con su **ruta de entrega** en cada una: `ruta_id`, sql/01 bloque 16) |

**Dónde están los clientes:** quien ve varias regiones **elige primero la región** (un cuadro por región con
su número de clientes, y "Todas"). Luego filtros **región → tienda → ruta de entrega** + estado y buscador.
G2, G3 y Empleado pasan directo a la lista. La columna "Tiendas y rutas" dice `CEN-001 · Ruta Norte, NOR-002`.

**Datos:** Nombre*, Primer apellido*, Segundo apellido, Teléfono* (mín. 8 dígitos), Correo (no se repite
entre clientes de la empresa), Dirección, **Ubicación** y Tiendas (con su ruta). **El teléfono y el correo son
la clave del cliente:** en Nuevo pedido se busca solo por ellos y, al coincidir completos, se llenan sus datos
y el punto de entrega del mapa. El buscador de la tabla busca por cada palabra en nombre, apellidos,
teléfono, correo y dirección, sin importar tildes.

**Ubicación:** coordenadas (`9.934512, -84.087654`), referencia o enlace de Google Maps. En la tabla,
coordenadas y enlaces se ven como **"Ver en mapa"**.

### Cómo se agregan los clientes

| Desde | Cómo |
|---|---|
| Clientes → **Nuevo cliente** | Formulario completo (tiendas y ruta de cada una) |
| Tiendas → botón **Nuevo cliente** de una tienda | El mismo formulario, con esa tienda ya marcada |
| **Nuevo pedido** | Si el cliente se escribió a mano (no se eligió del buscador), al registrar el pedido **se agrega solo** a Clientes (aprobado), en esa tienda y ruta, con la **dirección y el punto de entrega** del mapa. Si su teléfono ya existe en la empresa, se usa ese cliente y se le agrega la tienda |
| **Nuevo pedido** con un cliente elegido | Si no tenía dirección o ubicación, se le guardan las del pedido (no se cambia lo que ya tiene) |

| Rol | Ve | Hace |
|---|---|---|
| Administrador / G1 | Todos | Crear, modificar, eliminar, aprobar |
| Admin G2 | Su región | Lo mismo en su región |
| Admin G3 | Su tienda | Lo mismo en su tienda (aprueba a sus Empleados) |
| Empleado | Su tienda | Crear y modificar **con aprobación**; no elimina |
| Piloto | Sin acceso | — |

**Aprobación:** lo que crea un Empleado queda `aprobado = false`; lo que modifica queda en
`cambios_pendientes` (los datos reales no cambian hasta aprobar). Botón "Revisar": aprobar o rechazar
(rechazar un cliente nuevo lo elimina). Avisos: al G3 de la tienda; si no hay, al G2 de la región; si
tampoco, al Administrador y G1. Al resolver, al Empleado.

Pendiente: calificación 1–5 por pedido y categoría A/B/C/D (hoy todos "Nuevo").
Columnas que se leen: `CLI_COLUMNAS`; campos modificables: `CLI_CAMPOS`.
