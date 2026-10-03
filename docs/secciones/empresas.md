# Empresas internas (`#empresas`, solo Desarrollador)

Varias empresas trabajan en **la misma base de datos**, cada una con sus datos separados. Es distinto
de la "multimarca" de `empresas/empresas.js` (logo, colores y base propia de cada copia del sistema,
ver [02-empresa-nueva.md](../02-empresa-nueva.md)).

Tercera pestaña de **Tiendas** (Tiendas | Clientes | Empresas). "Nueva empresa" también se abre desde
**Configuración → Empresas** (`#empresas?nuevo=1`).

| Archivo | Qué tiene |
|---|---|
| `secciones/empresas.html`, `js/secciones/empresas.js`, `css/secciones/empresas.css` | Clases e ids `emp` |
| Tabla | `empresas` (codigo, nombre, actividades, activa) |
| SQL | `sql/01`, **bloque 16** (también en `sql/00`, sección 12) |

## El ID de la empresa

- **2 números** (`01`, `02`...). Al crear se propone el siguiente libre. No se repite.
- Lo que ya existía quedó en la empresa **`01` · "Empresa principal"** (se le puede cambiar el nombre).
- **Va al final de todos sus usuarios** (sin guiones):

| Rol | Usuario | Ejemplo (empresa `01`) |
|---|---|---|
| Administrador, Admin G1, Admin G2 | nombre + ID | `jperez01` |
| Admin G3, Empleado, Piloto | región de su tienda + nombre + ID (**sin el número de la tienda**) | `cenjperez01` |
| `admin`, `desar` | no cambian | — |

- **Cambiar el ID renombra a todos los usuarios de la empresa** (función `cambiar_codigo_empresa`, todo o
  nada; la ventana avisa cuántos). Si alguno quedaría repetido, no cambia nada.
- Al ejecutar el bloque 16 por primera vez, los usuarios que ya existían se renombraron **una sola vez**
  (`cen-001-jperez` → `cenjperez01`, `jlopez` → `jlopez01`). El bloque 17 convierte a los que quedaron con
  la tienda (`cen001jperez01` → `cenjperez01`). ⚠ Avisarles su usuario nuevo.
- **Sin la tienda** a propósito: el usuario ya está ligado a su empresa, tienda y región; si cambia de sucursal
  dentro de la región, o es multisucursal, su usuario **no cambia**. Solo cambia si su tienda pasa a otra región.
- Si dos personas quedarían con el mismo usuario (dos "jperez" de tiendas de la misma región), la base le
  agrega un número al segundo al renombrar (`cenjperez201`, función `usuario_libre`); al crear uno a mano,
  la página avisa que ya existe.

## Qué separa cada empresa

Cada empresa tiene sus **regiones, tiendas, usuarios, clientes, rutas, vehículos, pedidos, categorías de
mercadería (con sus artículos y pesos), tarifas y descuentos**. Columna `empresa_id` en `regiones`,
`tiendas`, `usuarios`, `clientes`, `rutas`, `vehiculos`, `pedidos`, `categorias_mercaderia`, `tarifas` y
`descuentos` (los artículos van por su categoría).

**Compartido por todas** (configuración del sistema): actividades y qué usa cada una, horarios de marcas,
slots, tamaños de bulto, motivos de retraso, número de pedido y código de respaldo.

- **Actividades** (multifunción): entregas de tienda, encomiendas o **las dos** (al menos una). Salen de la
  tabla `actividades` (si se agrega una, aparece como casilla). `empresaTieneActividad()`
  (`empresas/empresas.js`) usa las de la empresa de la sesión: Pedidos, Reportes, Rutas, Configuración y el
  botón del Cotizador solo muestran lo de sus actividades.
- **Inactiva**: sus usuarios no pueden iniciar sesión ("Tu empresa está inactiva").
- **Eliminar**: solo una empresa sin regiones, tiendas ni usuarios (si tiene otros datos la base no deja:
  marcarla Inactiva).

## Nueva empresa

ID, nombre, actividades y estado. Al crear se puede **copiar la configuración de pedidos** de la empresa
activa (solo de las actividades que hará): categorías con sus artículos y pesos, tarifas generales y
descuentos generales. Sin copiarla, en Configuración → Pedidos se crea su tarifa general (la opción
"General" aparece mientras le falte a alguna actividad).

Para empezar: **Trabajar con esta** → Tiendas: **Regiones** y Nueva tienda → Usuarios: su Administrador
(se elige la empresa por su ID) → Configuración → Pedidos: tarifas y mercadería.

## Cómo se filtra (sin tocar cada sección)

`js/supabase.js` (`TABLAS_POR_EMPRESA`): con sesión iniciada, `db.from(tabla)` de esas tablas
- **lee** solo las filas de la empresa activa (`empresa_id = X`; en usuarios el Desarrollador también se ve a sí mismo);
- **crea** con `empresa_id` de la empresa activa si la fila no lo trae.

`db.fromTodas(tabla)` lee sin filtro (lo usa Empresas para contar). En la base, triggers ponen `empresa_id`
según la tienda (pedidos, rutas), la región (tiendas, descuentos), la tienda o región (tarifas, usuarios); por
defecto, la primera empresa (`empresa_principal()`).

## Usuarios ligados a su empresa

- Cada usuario es de **una** empresa (`usuarios.empresa_id`): Administrador y G1 la que se elige (o la de quien
  los crea); G2, G3, Empleado y Piloto la de su región o tienda.
- **Crear un Administrador**: el Desarrollador elige la empresa **por su ID** en el campo "Empresa (ID)" del
  formulario; el usuario sale con ese ID al final (`jperez02`). Un Administrador crea en la suya.
- Nadie, salvo el Desarrollador, ve otras empresas ni sus usuarios; el Desarrollador no aparece para nadie.
- Solo el Desarrollador ve el nombre de la empresa en Usuarios (contador y título del formulario).
- ⚠ Lo controla la página (como todo hasta la Fase 7). El nombre de usuario es único en todo el sistema.

## Sesión

`sesion.empresa = { id, codigo, nombre, actividades }` (`js/sesion.js`: `empresaActual()`, `empresaActivaId()`,
`cambiarEmpresaActiva()`, `datosEmpresaSesion()`). Se carga al iniciar sesión. El **Desarrollador** no tiene
empresa: entra con la primera activa y la cambia en el **menú del usuario** (selector "01 · Nombre") o con
**Trabajar con esta**. Todos ven su empresa en el menú del usuario.

## Reglas

- Los **códigos de región y de tienda** siguen siendo únicos en todo el sistema (el usuario `cenjperez01`
  lleva la región de su tienda). El correo de un cliente, el nombre de una categoría y la tarifa de un lugar
  no se repiten **dentro** de cada empresa.
- **Regiones**: ahora se administran en Tiendas → botón **Regiones** (Administrador y Admin G1).
