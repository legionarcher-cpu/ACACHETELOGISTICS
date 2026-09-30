# 1. Inicio rápido

## Qué se necesita

| Para | Se necesita |
|---|---|
| Abrir y usar el sistema | VS Code + extensión **Live Server**, y conexión a internet (Supabase y librerías) |
| Los scripts de Python en VS Code | **Python 3** (python.org). No hace falta para la calculadora de la página |
| Modificar la base de datos | Acceso al proyecto en **supabase.com** (SQL Editor) |

## Abrir el sistema

1. Abrir la carpeta del proyecto en VS Code.
2. Clic derecho en `index.html` → **Open with Live Server**.
3. Se abre `http://127.0.0.1:5500/index.html` con el login.

> ⚠ No abrir `index.html` con doble clic (`file://`): el navegador bloquea la carga de las secciones
> y de Python. Siempre con Live Server (o publicado en internet).

## Primer ingreso

- Usuario `admin`. La clave inicial de una base nueva es `admin123`: **cambiarla** al entrar.
- El usuario `admin` está protegido: no se puede eliminar ni cambiarle el usuario o el rol.

## Qué empresa se está usando

La abre `empresas/empresas.js` → línea `const EMPRESA_ACTIVA = '...'`. Cambiarla y recargar la página
cambia logo, título, pie, actividades, colores y base de datos (ver [02-empresa-nueva.md](02-empresa-nueva.md)).
Al cambiar de empresa hay que iniciar sesión otra vez (cada empresa guarda su propia sesión).

## Orden recomendado para una base NUEVA

1. Crear las **regiones** reales (en `sql/00_instalacion_completa.sql` antes de ejecutarlo, o en
   Supabase → tabla `regiones`).
2. **Tiendas** (sección Tiendas).
3. **Usuarios**: administradores G1/G2, luego G3, empleados y pilotos (sección Usuarios).
4. **Vehículos** (Configuración → Vehículos) y asignarlos a los pilotos (Usuarios).
5. **Rutas** de cada tienda y sus pilotos por día/semana (Rutas y asignaciones).
6. **Configuración**: horarios, tarifas, descuentos, categorías, pesos promedio.
7. **Clientes** (desde Tiendas → Clientes) y registrar el primer pedido.

## Dónde mirar si algo falla

- **F12 → Consola** del navegador: todos los errores se anotan ahí con un texto en español.
- "Falta ejecutar sql/NN..." → ese script no se ha ejecutado en Supabase ([05-base-de-datos.md](05-base-de-datos.md)).
- Una sección en blanco o "No se pudo cargar la sección" → se abrió sin Live Server o falta el archivo
  `secciones/<nombre>.html`.
- Después de cambiar un CSS o JS y no ver el cambio: **Ctrl + F5** (recarga sin caché).
