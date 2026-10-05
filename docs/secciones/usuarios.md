# Usuarios (`#usuarios`)

| Archivo | Qué tiene |
|---|---|
| `secciones/usuarios.html`, `js/secciones/usuarios.js`, `css/secciones/usuarios.css` | Clases e ids `usr` |
| Tablas | `usuarios`, `tiendas`, `regiones`, `vehiculos`, `rutas_pilotos`, `pedidos`, `notificaciones`; Storage `avatares` |

## Qué hace

- Lista con rol y tienda (buscador). Crear, modificar, eliminar.
- **Foto:** elegir o quitar (se aplica al guardar; `js/avatar.js`).
- **Vehículo** (solo pilotos): la lista se agrupa por tipo (Camión, Pick-up, Panel, Moto, Sin tipo) y cada uno
  dice "placa · marca · tipo"; o registrar uno nuevo (**tipo** obligatorio + marca + placa) desde el formulario.
- **Piloto multitienda:** el G2 lo puede asignar a rutas de otras tiendas de su región.
- **Cambio de tienda de un piloto** (no multitienda): se quitan sus asignaciones de rutas futuras en la
  tienda anterior, sus pedidos pendientes allá quedan sin piloto (queda en la línea de tiempo) y se
  avisa al G2 de esa tienda.

## Usuario (cómo inicia sesión)

Usuario compuesto **con el ID de su empresa al final** (sql/01 bloque 16, [empresas-internas.md](empresas-internas.md)).
En el formulario se escribe `jperez`; al guardar se agrega:

| Rol | Se guarda | Ejemplo (empresa `01`) |
|---|---|---|
| Administrador, G1, G2 | nombre + ID de la empresa | `jperez01` |
| G3, Empleado, Piloto | región de su tienda + nombre + ID (sin la tienda) | `cenjperez01` |

Sin el número de la tienda: si cambia de sucursal dentro de la región, o es multisucursal, su usuario no
cambia. Dos "jperez" en la misma región chocan: al segundo se le pone otro nombre (ej. `jperez2` →
`cenjperez201`); la página avisa "Ese usuario ya existe".

El campo muestra el prefijo de la tienda en gris y el ID de la empresa al final; abajo, "Inicia sesión
como". Siempre en minúsculas y sin espacios. `admin` y `desar` no cambian.

## Empresa del usuario

- La lista solo muestra los usuarios de la **empresa activa** (`js/supabase.js`).
- **Administrador / Admin G1 creados por el Desarrollador:** campo **Empresa (ID)** con las empresas
  ("01 · Empresa principal", "02 · ..."). Se liga a la elegida y el usuario sale con su ID (`jperez02`). Si
  es otra empresa, el aviso dice que para verlo hay que cambiarse a ella en el menú del usuario.
- Los demás roles quedan en la empresa de su tienda o región. Un Administrador crea en la suya.

## Quién puede qué

| Rol | Puede |
|---|---|
| Administrador | Todo, con cualquier rol. **Único** que asigna roles de administración |
| Admin G1 | Crear, modificar y eliminar Empleados y Pilotos (cualquier tienda). Ve a los administradores sin tocarlos |
| Admin G2 | Lo mismo que G1, solo en su región (solo ve su región). **Aprueba** usuarios creados por G3 de su región |
| Admin G3 | Ve su tienda. **Crea Empleados** que quedan pendientes (no pueden entrar) hasta que los apruebe G2, G1 o el Administrador. No modifica ni elimina |
| Empleado / Piloto | Sin acceso a la sección |

Aprobar → puede iniciar sesión; rechazar → el usuario se elimina. Se avisa por la campana.

## Reglas

- La clave nunca se trae a la página. Al modificar, dejarla vacía conserva la actual.
- No se puede eliminar ni cambiar el rol del usuario con el que se inició sesión.
- El usuario `admin` está protegido (`USR_PROTEGIDO` en la página y trigger en la base de datos).
- Tienda / región según el rol: la base de datos lo exige (ver [05-base-de-datos.md](../05-base-de-datos.md)).

## Dónde tocar

| Quiero... | Dónde |
|---|---|
| Nombres de los roles en pantalla | `USR_ROLES` (y `PRF_ROLES` en perfil.js) |
| Columnas que se leen | `USR_COLUMNAS` |
| Cómo se arma el usuario compuesto | `usuarioCompuesto()` y `usuarioSinPrefijo()` en `js/componentes.js`; en la sección, `usuarioDelFormulario()` |
| Qué roles eligen empresa | `USR_ROLES_CON_EMPRESA` |
