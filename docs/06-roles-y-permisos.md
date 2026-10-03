# 6. Roles y permisos

## Los 6 roles

| Rol (`rol`) | Quién es | Tienda / región | Usuario (empresa `01`) |
|---|---|---|---|
| `desarrollador` | **Por encima de todo** (dueño del sistema). Puede todo lo del Administrador; **nadie lo ve** en Usuarios ni en avisos; solo se crea por SQL. **Único que ve y crea empresas** y cambia de empresa | Ninguna (ninguna empresa) | `desar` |
| `administrador` | Controla todo en **su empresa** | Ninguna | `admin` / `jperez01` |
| `admin_g1` | Administración de todo el país (de su empresa) | Ninguna | `jlopez01` |
| `admin_g2` | Administración de **una región** | Región | `mruiz01` |
| `admin_g3` | Administrador local de **una tienda** | Tienda | `cenmlopez01` |
| `empleado` | Usuario de una tienda: registra y sigue pedidos | Tienda | `cenjperez01` |
| `piloto` | Conductor: entrega sus pedidos | Tienda (base) | `cenlgarcia01` |

Cada usuario es de **una empresa interna** y todo lo que ve es de esa empresa (ver
[secciones/empresas.md](secciones/empresas.md)). El ID de la empresa va al final del usuario. Los de tienda llevan la **región** de su tienda,
no la tienda: cambiar de sucursal en la región no cambia su usuario.

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
| Reportes | ✔ | ✔ | ✔ | Ver | 🔒 | Sus pedidos (7 días) |
| Usuarios | ✔ | ✔ | ✔ | 🔒 | 🔒 | 🔒 |
| Configuración | Todo | Casi todo | Parte | 🔒 | 🔒 | 🔒 |
| Tiendas → Empresas | Solo Desarrollador | — | — | — | — | — |

🔒 = candado en el menú (`js/sesion.js`: `SECCIONES_POR_ROL`, `SECCIONES_BLOQUEADAS_POR_ROL`). La opción
"Configuración" del menú del usuario también se oculta a quien no tiene permiso (`js/permisos.js`).

## Qué puede hacer cada uno (resumen)

| Qué | Admin | G1 | G2 | G3 | Empleado | Piloto |
|---|---|---|---|---|---|---|
| Asignar roles de administración | ✔ | — | — | — | — | — |
| Crear/modificar/eliminar Empleados y Pilotos | ✔ | ✔ | Su región | — (sin acceso a Usuarios) | — | — |
| Aprobar usuarios pendientes (creados antes por un G3) | ✔ | ✔ | Su región | — | — | — |
| Aviso "Piloto en tienda: despachar pedidos" (marca de llegada) | — | — | — | ✔ | ✔ | — |
| Tiendas: crear / modificar / eliminar | ✔ / ✔ (con código) / ✔ | ✔ / datos / — | Ver | Ver | Ver | — |
| Clientes: crear, modificar, eliminar, aprobar | ✔ | ✔ | Su región | Su tienda | Crea/modifica con aprobación | — |
| Registrar pedidos | ✔ | ✔ | Su región | Su tienda | Su tienda | — |
| Ver el horario del piloto (marca) | ✔ | ✔ | ✔ | — (ven el slot) | — (ven el slot) | ✔ |
| Elegir el slot al registrar | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| Asignar piloto / horario / ruta, reprogramar | ✔ | ✔ | Su región | Solo solicita (fecha) | Solo solicita (fecha) | — |
| Alistando / Listo para despachar / Aprobar salida (dentro del pedido) | ✔ | ✔ | Su región | Su tienda | Su tienda | — |
| Cancelar pedido (con motivo; ya no se anula) | ✔ | ✔ | ✔ | ✔ | — | — |
| Recibido para ruta / Saliendo a ruta / Entregar ahora / Entregado / No entregado | — | — | — | — | — | Solo sus pedidos |
| Config. → Slots | ✔ | ✔ | Ver | — | — | — |
| Rutas: crear y asignar pilotos | ✔ | ✔ | Su región | Ver | — | — |
| Reportes: exportar | ✔ | ✔ | ✔ | Solo ver | — | Sus pedidos de 7 días |
| Marcar sus horarios (escanea el QR de marcas de la tienda; validado ese día) | — | — | — | — | — | ✔ |
| Ver / imprimir el QR de marcas del mes (Tiendas) | ✔ | ✔ | Su región | Su tienda | Su tienda | — |
| QR del día de los pilotos (Rutas y asignaciones) | ✔ | ✔ | Su región | — | — | El suyo (Inicio) |
| Validar al piloto escaneando su QR del día | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| Config. → Actividades | Solo Desarrollador | — | — | — | — | — |
| Empresas (crear, ID, actividades) y elegir la empresa de un Administrador | Solo Desarrollador | — | — | — | — | — |
| Tiendas → Regiones (crear, renombrar, eliminar) | ✔ | ✔ | — | — | — | — |
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
