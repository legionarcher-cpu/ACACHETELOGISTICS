# Login (`loggin`) y Mi perfil (`#perfil`)

## Login

| Archivo | Qué tiene |
|---|---|
| `secciones/loggin.html`, `js/secciones/loggin.js`, `css/secciones/loggin.css` | Clases `login-` |
| Tabla | `usuarios` |

- Se muestra siempre que **no hay sesión**, sin importar el `#`. Encabezado, menú (bloqueado) y pie
  siguen visibles alrededor.
- `validarCredenciales(usuario, clave)`: la función de la base `iniciar_sesion` compara la clave **cifrada**
  (bcrypt, sql/01 bloque 20; distingue mayúsculas) y devuelve el id; luego se traen sus datos sin la clave. Base
  sin el bloque 20: compara `id_usuario` + `clave` tal cual.
- Mensaje genérico "Usuario o contraseña incorrectos" (no da pistas de qué usuarios existen).
- Usuario con `aprobado = false` (creado por un G3, o cliente que pidió su usuario): no puede entrar.
- Usuario con el ID de su empresa al final (`cenjperez01`, `jperez01`; sql/01 bloques 16 y 17). Trae también su
  **empresa** (`empresas(...)`) y la guarda en la sesión; si la empresa está **inactiva**, no entra. El
  Desarrollador (sin empresa) entra con la primera activa.
- Al entrar: `guardarSesion(...)`, `aplicarPermisos()`, animación del menú y abre la sección pedida
  en el `#` (si tiene permiso) o Inicio.
- El logo de la franja es el de ACACHETE (marca de la casa, `img/logo-web-slog.png`).

### Solicitar usuario (clientes de empresas con Transporte)

- Se abre con el enlace **`index.html#registro?empresa=02`** (tarjeta, WhatsApp, QR) o con "¿Eres cliente?
  Solicita tu usuario" debajo de Ingresar, si la marca tiene `registroClientes: '02'` en `empresas/empresas.js`.
  Solo aparece si esa empresa está **activa y hace viajes** (`registro_clientes_empresa`); si no, el enlace avisa
  que no es válido.
- Datos: nombre*, primer apellido*, segundo apellido, teléfono* (8+ dígitos), correo, usuario* (se le agrega el ID:
  `aramirez02`) y contraseña* (6+, se repite). Campo trampa oculto contra robots.
- Lo guarda la base (`solicitar_acceso_cliente`): cliente (si su teléfono no existía, en la primera tienda activa) +
  usuario rol `cliente`, los dos **sin aprobar**; aviso "Solicitud de acceso a viajes" al Administrador y G1. Si el
  teléfono ya tiene usuario o solicitud, no deja repetir.
- Mientras no se apruebe, al entrar dice "Tu solicitud todavía está en revisión". Se aprueba en **Clientes → Revisar**
  ([tiendas-y-clientes.md](tiendas-y-clientes.md)).

⚠ Falta la Fase 7 (Supabase Auth + RLS) para que la base aplique también quién ve qué.

## Mi perfil

| Archivo | Qué tiene |
|---|---|
| `secciones/perfil.html`, `js/secciones/perfil.js`, `css/secciones/perfil.css` | Clases `prf-` |

- Muestra los datos del usuario conectado (rol, tienda, región, vehículo...).
- Cambiar foto (JPG/PNG/WEBP, máx. 2 MB; se achica a 256×256) y quitarla. Se ve al instante en el encabezado.
- Todos los roles pueden entrar (`SECCIONES_LIBRES`).

## Fotos (`js/avatar.js`)

Bucket `avatares`, archivo `usuarios/<id>.jpg` (una foto nueva reemplaza la anterior); la tabla guarda
solo el enlace (`foto_url`). Sin foto se muestran las iniciales.
Constantes: `AVATAR_MAX_BYTES`, `AVATAR_TIPOS`, `AVATAR_TAMANO`.
