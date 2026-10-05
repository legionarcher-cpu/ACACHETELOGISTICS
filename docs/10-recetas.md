# 10. Recetas (cambios comunes paso a paso)

Después de cada receta: probar la sección con [11-pruebas.md](11-pruebas.md).

## Agregar una sección nueva (ej. "facturas")

1. `index.html` → menú: `<li class="menu-item"><a href="#facturas"><i class="bi bi-receipt"></i> Facturas</a></li>`
2. `secciones/facturas.html` → solo el contenido. Primera línea: la redirección
   (`<script>if (!document.querySelector('.cuerpo-principal')) location.replace('../index.html');</script>`).
3. `css/secciones/facturas.css` (opcional) → clases con prefijo `fac-`. Usar antes `componentes.css`.
4. `js/secciones/facturas.js` (opcional) → `registrarSeccion('facturas', (zona) => { ... })`.
5. Permisos por rol → `js/sesion.js` (`SECCIONES_POR_ROL` / `SECCIONES_BLOQUEADAS_POR_ROL`) y el
   filtro por jerarquía dentro del JS.
6. Documentarla en `docs/secciones/`.

## Agregar una columna a una tabla

1. `sql/00_instalacion_completa.sql`: agregarla en el `create table` de su sección.
2. `sql/01_actualizacion_base_existente.sql`: un bloque nuevo al final con
   `alter table ... add column if not exists ...` (no crear archivos SQL nuevos).
3. Ejecutar `01` en la base de **cada** empresa que ya exista.
4. En el JS: agregarla al `select(...)` y donde se muestre o guarde.
5. Actualizar [05-base-de-datos.md](05-base-de-datos.md).

## Agregar un campo al formulario de pedidos

1. Columna en `pedidos` (receta anterior) o dato dentro de `detalle` (JSON) si es propio de una actividad.
2. `secciones/pedidos.html` → el campo en su bloque (con `hidden` si depende de la actividad).
3. `js/secciones/pedidos.js` → mostrarlo/ocultarlo en `alCambiarActividad`, validarlo en
   `validarFormulario`, guardarlo en el objeto `pedido` del `submit`, mostrarlo en el detalle.
4. Si depende de la actividad: una columna `usa_...` nueva en `actividades` + casilla en la ventana de
   Actividades (`ACT_USOS` en `configuracion/actividades.js` y el `<fieldset class="cfg-act-usa">`).

## Agregar una categoría de mercadería

Sin código: Configuración → Pedidos → Categorías → "Agregar categoría" (elegir actividad y tipo).
Sus artículos con peso: Artículos frecuentes.

## Agregar una lista a Configuración → Pedidos

1. Tabla en SQL (con sus reglas de acceso temporales).
2. Una entrada en `CATALOGOS` de `js/secciones/configuracion/pedidos.js` (ver
   [secciones/configuracion.md](secciones/configuracion.md)). La tarjeta, tabla y formulario se arman solos.

## Agregar un estado de pedido

1. SQL: reemplazar la regla `pedidos_estado_valido`.
2. `PED_ESTADOS` (y `PED_GRUPOS`, `PED_ACCIONES`) en `pedidos.js`, `INI_ESTADOS`/`INI_GRUPOS` en
   `inicio.js`, `REP_ESTADOS` en `reportes.js`. (Aprobado unificarlos en una sola definición.)

## Agregar un rol

1. SQL: reemplazar `usuarios_rol_valido` y `usuarios_tienda_segun_rol`.
2. `js/sesion.js`: función `esNuevoRol()` y sus secciones.
3. Nombres en `USR_ROLES` y `PRF_ROLES`; qué puede hacer en cada sección (bloque PERMISOS de cada JS);
   botones del pie en `css/index.css`.
4. Actualizar [06-roles-y-permisos.md](06-roles-y-permisos.md).

## Agregar una empresa / cambiar su paleta

Ver [02-empresa-nueva.md](02-empresa-nueva.md).

## Cambiar un color para todos

`css/variables.css` (todas las empresas sin paleta propia) o el campo `colores` de una empresa.

## Cambiar la tarifa o ver cuánto cobraría

Configuración → Pedidos → Tarifas (cambiar) y "Calculadora de precios" (revisar antes).
