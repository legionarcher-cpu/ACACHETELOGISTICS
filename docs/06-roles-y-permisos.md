# 6. Roles y permisos

## Los 6 roles

| Rol (`rol`) | Quién es | Tienda / región | Usuario (empresa `01`) |
|---|---|---|---|
| `desarrollador` | **Por encima de todo** (dueño del sistema). Puede todo lo del Administrador; **nadie lo ve** en Usuarios ni en avisos; solo se crea por SQL. **Único que ve y crea empresas** y cambia de empresa | Ninguna (ninguna empresa) | `desar` |
| `administrador` | Controla todo en **su empresa** | Ninguna | `admin` / `jperez01` |
| `admin_g1` | Administración de todo el país (de su empresa) | Ninguna | `jlopez01` |
| `admin_g2` | Administración de **una región** | Región | `mruiz01` |
| `admin_g3` | Administrador local de **una tienda** | Tienda | `mlopez01` |
| `empleado` | Usuario de una tienda: registra y sigue pedidos | Tienda | `jperez01` |
| `piloto` | Conductor: entrega sus pedidos; en Transporte, hace sus viajes | Tienda (base) | `lgarcia01` |
| `cliente` | Cliente con usuario (solo empresas que hacen viajes): solicita y sigue SUS viajes. Se crea en Clientes → "Acceso y lugares"; no aparece en Usuarios | Ninguna (su cliente: `usuarios.cliente_id`) | `mramirez01` |

Cada usuario es de **una empresa interna** y todo lo que ve es de esa empresa (ver
[secciones/empresas-internas.md](secciones/empresas-internas.md)). El ID de la empresa va al final del usuario. El usuario **no lleva la tienda ni la región**
(sql/01 bloque 31): cambiar de sucursal o de región no lo cambia.

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
| Tiendas → Visitas (quién entra, desde dónde y a qué pantallas; 3 días) | Solo Desarrollador | — | — | — | — | — |

🔒 = candado en el menú (`js/sesion.js`: `SECCIONES_POR_ROL`, `SECCIONES_BLOQUEADAS_POR_ROL`). La opción
"Configuración" del menú del usuario también se oculta a quien no tiene permiso (`js/permisos.js`).

**Módulos y funciones de cada usuario** (Usuarios → Nuevo / Modificar): la tabla de arriba y la de abajo son lo
que **trae cada rol** (viene marcado al crear el usuario). Al personal (G1, G2, G3, Empleado) se le puede quitar o
**dar** cualquier módulo y, dentro de cada uno, funciones (registrar pedidos, alistar, despachar, cancelar, cerrar
caja, exportar...), aunque su rol no las traiga ("otro rol"). Ej.: dos Empleados, uno de bodega (ve, alista,
despacha y cierra la caja de los pilotos) y otro de ventas (registra y ve). Lo que **ve** sigue siendo su alcance
(G2 su región; G3 y Empleado su tienda). Al piloto solo se le puede quitar. El Administrador y el Desarrollador no
se limitan.

- **Dónde vive:** en la base, desde la Etapa 2B.
  - La tabla `funciones` es el catálogo, con los roles que traen cada módulo y función. Es la única lista.
  - La tabla `usuario_funciones` guarda lo que se le dio o se le quitó a cada usuario.
- **Cómo lo usa la página:**
  - La sesión guarda lo de cada usuario (`mis_funciones()`, en `sesion.funciones`).
  - Cada sección pregunta con `puedeHacer('modulo.funcion', loQueDaSuRol)`.
- **La base hace cumplir lo mismo:** quién cambia tarifas, rutas, productos... (`puede`, reglas de
  `11_acceso_web.sql`) y qué pedidos ve cada uno (región, tienda, sus pedidos).

**Transporte (sql/01 bloque 19):** **Viajes** la ven todos los roles si la empresa hace viajes (el cliente, los suyos;
el piloto, los que maneja; el personal, la agenda). Si la empresa es **solo** de viajes, Pedidos, Rutas y Cotizador
no aparecen (`seccionAplica`), y el piloto no tiene Reportes. El **cliente** solo ve Inicio, Viajes y Mi perfil (las
demás opciones del menú no aparecen, ni el pie ni el lector de QR). Configuración → Transporte: Administrador y G1.
Reservar, cambiar la hora, cancelar y avanzar un viaje lo revisan **las funciones de la base** (rol, empresa, plazo).

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
| Recibido para ruta / Saliendo a ruta / Escanear QR (entregando) / Entregado / No entregado | — | — | — | — | — | Solo sus pedidos |
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

La página decide qué **muestra**; la base aplica lo mismo con Supabase Auth y reglas RLS (Etapas 2A, 2B y 2C,
`sql/instalacion/11_acceso_web.sql`). Ver [05-base-de-datos.md](05-base-de-datos.md), "Acceso".

**Desarrollador:** en el código `esDesarrollador()`; `esAdministrador()` también es verdadero para él,
así que la página le muestra lo del Administrador. La lista de Usuarios lo excluye (`.neq('rol', 'desarrollador')`)
y no recibe avisos de aprobación. Los usuarios `desar` y `admin` están protegidos en la base de datos
(no se eliminan ni cambian de usuario o rol).

**Límite del Desarrollador y Admin TI (Etapa 2C, lo aplica la base):**
- **Admin TI** es una casilla del usuario (Usuarios → formulario), no un rol: la pone o quita el Administrador; el
  Desarrollador solo la pone. El Admin TI y el Administrador dan la llave en **Configuración → Soporte**.
- Sin llave, el Desarrollador ve la configuración y el personal de cada empresa, cambia el plan y si está activa, y
  usa las acciones de emergencia de Usuarios (bloquear, desbloquear, cerrar sesiones).
- Mientras la empresa **no tenga Admin TI** (puesta en marcha) también cambia su configuración, tiendas y usuarios.
- Clientes, pedidos, viajes, inventario, precios, cajas y costos: solo con la **llave** ("Solo ver" o "Ver y
  corregir"). El aviso de soporte, arriba de la lista de la campana (`js/soporte.js`), le dice en qué modo está. Todo queda en la bitácora.
