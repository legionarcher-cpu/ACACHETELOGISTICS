# Usuarios (`#usuarios`)

| Archivo | Qué tiene |
|---|---|
| `secciones/usuarios.html`, `js/secciones/usuarios.js`, `css/secciones/usuarios.css` | Clases e ids `usr` |
| Tablas | `usuarios`, `tiendas`, `regiones`, `vehiculos`, `rutas_pilotos`, `pedidos`, `notificaciones`; Storage `avatares` |

## Qué hace

- Lista con rol y tienda (buscador). Crear, modificar, eliminar.
- **Foto:** elegir o quitar (se aplica al guardar; `js/avatar.js`).
- **Vehículo** (solo pilotos): elegir uno o registrar uno nuevo (marca + placa) desde el formulario.
- **Piloto multitienda:** el G2 lo puede asignar a rutas de otras tiendas de su región.
- **Cambio de tienda de un piloto** (no multitienda): se quitan sus asignaciones de rutas futuras en la
  tienda anterior, sus pedidos pendientes allá quedan sin piloto (queda en la línea de tiempo) y se
  avisa al G2 de esa tienda.

## Usuario (cómo inicia sesión)

**Hoy:** usuario compuesto. En el formulario se escribe `jperez`; al guardar se agrega el código de la
tienda: `cen-001-jperez` (G3, Empleado, Piloto). Administrador, G1 y G2: solo `jperez`.
Siempre en minúsculas y sin espacios.

**Aprobado para cambiar (opción C):** usar el número interno de la tienda, que nunca cambia:
`t4-jperez`. Ver [12-pendientes.md](../12-pendientes.md).

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
| Cómo se arma el usuario compuesto | Función que agrega el prefijo al guardar (buscar "prefijo" en `usuarios.js`) |
