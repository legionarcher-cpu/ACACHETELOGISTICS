# Documentación del sistema — ACACHETE Logistics

Sistema web para coordinar **pedidos, entregas, pilotos, rutas y tiendas** de una o varias empresas:
**empresas internas** en la misma base, cada una con su ID (`01`, `02`...) y sus datos separados
([secciones/empresas.md](secciones/empresas.md)), y **multimarca** (otra copia con su logo y colores). Funciona en el navegador, guarda todo en **Supabase** (PostgreSQL) y no necesita
servidor propio.

> Esta carpeta explica **cómo está hecho hoy** y **dónde tocar** para cambiarlo.
> El documento de diseño original (ideas, fases, decisiones) es
> [PROPUESTA-ESTRUCTURADA-V2.md](../PROPUESTA-ESTRUCTURADA-V2.md), en la raíz; se conserva como
> historia. Si algo no coincide, manda esta carpeta.

## Índice

| # | Archivo | Para qué sirve |
|---|---|---|
| 1 | [01-inicio-rapido.md](01-inicio-rapido.md) | Abrir el proyecto, probarlo y primeros pasos |
| 2 | [02-empresa-nueva.md](02-empresa-nueva.md) | Multimarca: agregar una empresa, su base de datos y su paleta de colores |
| 3 | [03-arquitectura.md](03-arquitectura.md) | Cómo está organizado: carpetas, orden de carga, secciones, sesión |
| 4 | [secciones/](secciones/) | Una guía por pantalla (qué hace, archivos, tablas, quién ve qué, dónde tocar) |
| 5 | [05-base-de-datos.md](05-base-de-datos.md) | Tablas, columnas, reglas y scripts SQL |
| 6 | [06-roles-y-permisos.md](06-roles-y-permisos.md) | Los 6 roles y qué puede hacer cada uno en cada sección |
| 7 | [07-actividades-y-mercaderia.md](07-actividades-y-mercaderia.md) | Actividades (tienda, encomiendas), categorías, pesos y cobro |
| 8 | [08-estilos.md](08-estilos.md) | CSS: variables, componentes, colores y responsive |
| 9 | [09-python.md](09-python.md) | Scripts de Python (en el navegador y en VS Code) |
| 10 | [10-recetas.md](10-recetas.md) | Paso a paso para los cambios más comunes |
| 11 | [11-pruebas.md](11-pruebas.md) | Lista de pruebas por sección (usar después de cada cambio) |
| 12 | [12-pendientes.md](12-pendientes.md) | Cambios aprobados, pendientes y decisiones abiertas |
| 13 | [13-cambios.md](13-cambios.md) | Registro de cambios (qué cambió y qué SQL ejecutar) |

### Guías por sección (carpeta `secciones/`)

[Login y Mi perfil](secciones/login-y-perfil.md) ·
[Inicio](secciones/inicio.md) ·
[Pedidos](secciones/pedidos.md) ·
[Rutas y asignaciones](secciones/rutas.md) ·
[Pilotos](secciones/pilotos.md) ·
[Tiendas y Clientes](secciones/tiendas-y-clientes.md) ·
[Empresas internas](secciones/empresas.md) ·
[Usuarios](secciones/usuarios.md) ·
[Reportes](secciones/reportes.md) ·
[Configuración](secciones/configuracion.md) ·
[Cotizador](secciones/cotizador.md) ·
[Encabezado, menú, pie y notificaciones](secciones/marco-del-index.md)

## El sistema en una imagen

```
                 ┌──────────── index.html (única página) ────────────┐
empresas.js ──►  │ Encabezado: logo ACACHETE + logo empresa, título,  │
(qué empresa)    │             fecha, campana, usuario                │
                 │ Menú lateral │  .cuerpo-principal  ◄── secciones/  │
                 │              │  (aquí se cargan las pantallas)     │
                 │ Pie: botones de acceso rápido + derechos           │
                 └────────────────────────┬───────────────────────────┘
                                          │ js/supabase.js (objeto "db")
                                          ▼
                             Supabase (una base por empresa)
                             tablas + reglas + fotos (Storage)
```

## Reglas de oro

1. **Un solo lugar por cosa.** Colores en `css/variables.css`; piezas comunes en `css/componentes.css`
   y `js/componentes.js`; datos de la empresa en `empresas/empresas.js`.
2. **La base de datos se cambia solo con scripts** numerados en `sql/` (nunca a mano en Supabase), y se
   actualiza también `sql/00_instalacion_completa.sql`.
3. **Un pedido nunca se borra:** se cancela o se anula.
4. **Seguridad:** hoy las reglas de quién ve qué las aplica la página (modo rápido de pruebas). Antes de
   usar datos reales hace falta la Fase 7 (ver [12-pendientes.md](12-pendientes.md)).
5. **Después de cada cambio**, repasar [11-pruebas.md](11-pruebas.md) en la sección afectada.
