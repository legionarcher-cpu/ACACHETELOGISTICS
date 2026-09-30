# 6. Roles y permisos

## Los 6 roles

| Rol (`rol`) | Quién es | Tienda / región | Usuario (hoy) |
|---|---|---|---|
| `desarrollador` | **Por encima de todo** (dueño del sistema). Puede todo lo del Administrador; **nadie lo ve** en Usuarios ni en avisos; solo se crea por SQL | Ninguna | `desar` |
| `administrador` | Controla todo en la empresa que usa el sistema | Ninguna | `admin` |
| `admin_g1` | Administración de todo el país | Ninguna | `jlopez` |
| `admin_g2` | Administración de **una región** | Región | `mruiz` |
| `admin_g3` | Administrador local de **una tienda** | Tienda | `cen-001-mlopez` |
| `empleado` | Usuario de una tienda: registra y sigue pedidos | Tienda | `cen-001-jperez` |
| `piloto` | Conductor: entrega sus pedidos | Tienda (base) | `cen-001-lgarcia` |

## Jerarquía de lo que se ve (en todas las secciones)

| Rol | Ve |
|---|---|
| Administrador, Admin G1 | Todo |
| Admin G2 | Solo su región |
| Admin G3, Empleado | Solo su tienda |
| Piloto | Solo sus pedidos |

## Acceso a secciones

| Sección | Admin | G1 | G2 | G3 | Empleado | Piloto |
|---|---|---|---|---|---|---|
| Inicio, Mi perfil | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Pedidos | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ (sus pedidos) |
| Pilotos | ✔ | ✔ | ✔ | ✔ | 🔒 | 🔒 |
| Rutas y asignaciones | ✔ | ✔ | ✔ | Ver | 🔒 | 🔒 |
| Tiendas / Clientes | ✔ | ✔ | ✔ | ✔ | ✔ | 🔒 |
| Reportes | ✔ | ✔ | ✔ | Ver | 🔒 | 🔒 |
| Usuarios | ✔ | ✔ | ✔ | ✔ | 🔒 | 🔒 |
| Configuración | Todo | Casi todo | Parte | — | — | — |

🔒 = candado en el menú (`js/sesion.js`: `SECCIONES_POR_ROL`, `SECCIONES_BLOQUEADAS_POR_ROL`).

## Qué puede hacer cada uno (resumen)

| Qué | Admin | G1 | G2 | G3 | Empleado | Piloto |
|---|---|---|---|---|---|---|
| Asignar roles de administración | ✔ | — | — | — | — | — |
| Crear/modificar/eliminar Empleados y Pilotos | ✔ | ✔ | Su región | Crea Empleados (pendientes) | — | — |
| Aprobar usuarios creados por G3 | ✔ | ✔ | Su región | — | — | — |
| Tiendas: crear / modificar / eliminar | ✔ / ✔ (con código) / ✔ | ✔ / datos / — | Ver | Ver | Ver | — |
| Clientes: crear, modificar, eliminar, aprobar | ✔ | ✔ | Su región | Su tienda | Crea/modifica con aprobación | — |
| Registrar pedidos | ✔ | ✔ | Su región | Su tienda | Su tienda | — |
| Asignar piloto / horario / ruta, reprogramar | ✔ | ✔ | Su región | Solo solicita | Solo solicita | — |
| Cancelar pedido | ✔ | ✔ | ✔ | ✔ | — | — |
| Anular pedido | ✔ | ✔ | — | — | — | — |
| Salí a entregar / Entregado / No entregado | — | — | — | — | — | Solo sus pedidos |
| Rutas: crear y asignar pilotos | ✔ | ✔ | Su región | Ver | — | — |
| Reportes: exportar | ✔ | ✔ | ✔ | Solo ver | — | — |
| Config. → Actividades | Solo Desarrollador | — | — | — | — | — |
| Config. → Categorías | ✔ | — | — | — | — | — |
| Config. → Horarios base, tamaños, motivos, artículos, número de pedido, código de respaldo | ✔ | ✔ | Ver | — | — | — |
| Config. → Tarifas y descuentos | ✔ | ✔ | Su región | — | — | — |
| Config. → Vehículos | ✔ | ✔ | Los de su región (no agrega) | — | — | — |

## Dónde está cada regla

- **Qué secciones abre:** `js/sesion.js` (`tienePermiso`).
- **Qué ve y hace dentro de la sección:** al inicio del JS de cada sección (bloque "PERMISOS"), con
  `esAdministrador()`, `esAdminG1()`, `esAdminG2()`, `regionActual()`, `tiendaActual()`.
- **Qué botones del pie ve:** `css/index.css`, bloque "SEGÚN EL ROL".
- **Aprobaciones y avisos:** `js/notificaciones.js`.

⚠ Todo esto hoy lo aplica **la página**. La base de datos acepta cualquier consulta con la clave
pública. Aprobado: que todas las consultas pasen por una sola función de "alcance del usuario", y en la
Fase 7 que la base de datos misma aplique la jerarquía (Supabase Auth + RLS). Ver [12-pendientes.md](12-pendientes.md).

**Desarrollador:** en el código `esDesarrollador()`; `esAdministrador()` también es verdadero para él,
así que tiene todo lo del Administrador. La lista de Usuarios lo excluye (`.neq('rol', 'desarrollador')`)
y no recibe avisos de aprobación. Los usuarios `desar` y `admin` están protegidos en la base de datos
(no se eliminan ni cambian de usuario o rol).
