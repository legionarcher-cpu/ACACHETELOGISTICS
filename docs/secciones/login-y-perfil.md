# Login (`loggin`) y Mi perfil (`#perfil`)

## Login

| Archivo | Qué tiene |
|---|---|
| `secciones/loggin.html`, `js/secciones/loggin.js`, `css/secciones/loggin.css` | Clases `login-` |
| Tabla | `usuarios` |

- Se muestra siempre que **no hay sesión**, sin importar el `#`. Encabezado, menú (bloqueado) y pie
  siguen visibles alrededor.
- `validarCredenciales(usuario, clave)`: busca `id_usuario` (en minúsculas) + `clave` (distingue
  mayúsculas). Trae los datos sin la clave.
- Mensaje genérico "Usuario o contraseña incorrectos" (no da pistas de qué usuarios existen).
- Usuario con `aprobado = false` (creado por un G3): no puede entrar.
- Al entrar: `guardarSesion(...)`, `aplicarPermisos()`, animación del menú y abre la sección pedida
  en el `#` (si tiene permiso) o Inicio.
- El logo de la franja es el de ACACHETE (marca de la casa, `img/logo-web-slog.png`).

⚠ La clave se compara tal cual está guardada (sin cifrar). La Fase 7 lo cambia por Supabase Auth.

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
