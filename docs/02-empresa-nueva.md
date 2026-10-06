# 2. Empresa nueva (multimarca)

Hay **dos formas** de tener varias empresas:

| Forma | Qué es | Dónde |
|---|---|---|
| **Empresas internas** (recomendada) | Varias empresas en la **misma base**, cada una con ID (`01`, `02`...), sus actividades y sus datos separados; sus usuarios llevan el ID (`jperez02`) | Desde la página: Configuración → Empresas o Tiendas → Empresas (solo Desarrollador). Ver [secciones/empresas-internas.md](secciones/empresas-internas.md) |
| **Multimarca** (esta guía) | Otra **copia** del sistema con su logo, colores, textos y, si se quiere, su propia base | `empresas/empresas.js`, en VS Code |

Las dos se combinan: una marca (copia) puede tener varias empresas internas.

**Cada marca se configura en `empresas/empresas.js`** (textos, colores, pie y base) y **sus imágenes de
encabezado en `css/encabezados.css`**. No hace falta otro `app.html` por empresa: el mismo index toma de ahí lo
de la marca activa (así una corrección del sistema sirve para todas las marcas a la vez).

## Qué define cada empresa

```js
'otoya-valverde': {
    nombre: 'Otoya-Valverde & Asociados',      // pestaña del navegador
    titulo: 'Otoya-Valverde & Asociados',      // texto grande del encabezado
    subtitulo: 'Panel de Control de Operaciones',
    icono: 'img/icono-otoya.png',              // ícono de la pestaña del navegador ('' = img/logo.png)
    pie: ['Derechos Reservados Achete Logistics S.A.', 'Propiedad Reservada para ...'],
    actividades: ['tienda', 'encomiendas'],    // qué hace la empresa
    registroClientes: '01',                    // Transporte: sus clientes solicitan usuario en el login
    supabase: { url: '', anonKey: '' },        // su base de datos ('' = la de js/supabase.js)
    colores: {},                               // su paleta ({} = colores originales ACACHETE)
},
```

- `EMPRESA_ACTIVA` (arriba del archivo) elige cuál usa esta copia del sistema.
- **Imágenes del encabezado** (imagen del título, logos de la esquina y logo chico): **solo en
  `css/encabezados.css`**, una regla por marca (`html[data-marca="otoya-valverde"]`) y por empresa interna
  (`html[data-empresa="01"]`); la de la empresa gana y se ve al iniciar sesión con uno de sus usuarios. Ver
  [secciones/marco-del-index.md](secciones/marco-del-index.md). El logo del cuadro del login sigue siendo el de
  ACACHETE (marca de la casa).
- `actividades`: `'tienda'` = Entregas de tienda (supermercado), `'encomiendas'` = Encomiendas.
  Las que no estén aquí **no aparecen en ninguna parte** del sistema. Ver
  [07-actividades-y-mercaderia.md](07-actividades-y-mercaderia.md).
  Con empresas internas (sql/01 bloque 16) **manda lo que marca cada empresa interna**; esta lista queda
  de respaldo para una base sin empresas.

## Agregar o cambiar una empresa (sin escribir código)

Doble clic en **`herramientas\empresas.bat`** (no necesita Python). Menú:

| Opción | Qué hace |
|---|---|
| 1. Nueva empresa | Pregunta nombre, **imagen de encabezado** (y si se ve completa), ícono de la pestaña, **qué actividad realiza** (1 tienda, 2 encomiendas, 3 las dos, 4 transporte), pie, base de datos y **paleta de colores**; la agrega a `empresas/empresas.js`, deja su regla en `css/encabezados.css` y puede dejarla activa |
| 2. Base de datos | Cambia el proyecto de Supabase de una empresa (vacío = la base compartida) |
| 3. Paleta | Cambia los colores de una empresa |
| 4. Empresa activa | Elige cuál usa esta copia del sistema |

Los logos y las imágenes de encabezado se cambian después directamente en `css/encabezados.css`.

**Paleta:** se elige un modelo (azul y naranja, verde oliva, azul petróleo, vino, grafito) o se escriben
**2 colores**: el principal (menú, encabezado, enlaces) y el de los botones. Con ellos se arman las 7 variables
(oscuros y claros calculados), con la misma fórmula que la página (`paletaDesdeColores` en `empresas/empresas.js`).

Las imágenes van en `img/`; la herramienta avisa si la ruta no existe. También se puede copiar un bloque a mano
(la clave entre comillas no se puede repetir).

## Base de datos propia (en blanco)

1. supabase.com → **New project**.
2. SQL Editor → pegar **todo** `sql/00_instalacion_completa.sql` → **Run** (una sola vez).
   Antes, cambiar las regiones de ejemplo por las reales.
3. Project Settings → API → copiar **Project URL** y **anon public** en `supabase: { url, anonKey }`.
4. Entrar con `admin` / `admin123` y cambiar la clave.

Queda sin tiendas, usuarios (solo `admin`), clientes ni pedidos; con la configuración inicial
(actividades, categorías, pesos promedio, tamaños, tarifas de ejemplo, motivos, 5 horarios).

> Si varias marcas usan **la misma** base (supabase vacío), comparten todos los datos, salvo que se
> separen con **empresas internas** (cada una ve solo lo suyo). Para separar del todo (otra base),
> cada marca necesita su propio proyecto de Supabase.

⚠ **Cada cambio de estructura** (script `sql/NN_...`) hay que ejecutarlo **en la base de cada empresa**.
Llevar una lista de qué scripts tiene cada base.

## Paleta de colores de una empresa

- **Marca:** con `herramientas\empresas.bat` (opción 1 o 3), o a mano en su campo `colores`.
- **Empresa interna** (`01`, `02`...): la elige el Desarrollador en **Tiendas → Empresas → Nueva / Modificar →
  "Paleta de colores"** (obligatoria al crear; se guarda en la base, sql/01 bloque 21). Al **iniciar sesión** con
  un usuario de esa empresa la página se pinta con su paleta, reconocida por el ID de su empresa; al cerrar
  sesión vuelven los de la marca.

A mano, con los nombres de `css/variables.css` **sin** los `--`:

```js
colores: {
    'color-fondo-oscuro':   '#080A06',   // fondo del menú, pie y cuerpo
    'color-azul-marino':    '#2A2B26',   // bordes, etiquetas, avatar sin foto
    'color-azul':           '#5A6B34',   // enlaces, foco de los campos
    'color-azul-claro':     '#EEF1E6',   // fondos suaves, hover
    'color-naranja':        '#5A6B34',   // acción principal: botones
    'color-naranja-oscuro': '#48562A',   // hover de los botones
    'color-naranja-claro':  '#E3E8D3',   // etiqueta "Administrador"
},
```

- Se puede cambiar cualquier variable de [08-estilos.md](08-estilos.md) (tabla de variables).
- **Orden (el de abajo gana):** `css/variables.css` → `colores` de la marca → `COLORES_POR_EMPRESA['02']`
  (respaldo escrito a mano en `empresas/empresas.js`) → la paleta guardada en la base para la empresa interna.
- Los nombres dicen "azul" y "naranja" porque son los colores de ACACHETE; lo que importa es **para
  qué se usa** cada uno (comentario a la derecha).
- Texto blanco sobre `color-naranja`: elegir un tono oscuro para que se lea (contraste mínimo 4.5:1).
- Hay colores escritos directamente en algunos CSS (ver [08-estilos.md](08-estilos.md)): esos no cambian con la paleta.

## Cómo funciona por dentro

`empresas/empresas.js` se carga en `app.html` **antes que todo** (sin `defer`):
1. Aplica los `colores` al instante (antes de dibujar la página), con la paleta de la empresa de la sesión
   si hay (`aplicarColoresEmpresa`; `js/sesion.js` la vuelve a llamar al entrar, cambiar de empresa y salir).
2. Marca en `<html>` la marca (`data-marca`) y la empresa de la sesión (`data-empresa`): con eso
   `css/encabezados.css` elige las imágenes del encabezado (`aplicarEncabezadoEmpresa`).
3. Al terminar de cargar la página pone el título en texto, el ícono de la pestaña, el pie y el nombre de la pestaña.
3. Deja disponibles `EMPRESA`, `empresaTieneActividad(codigo)` y `actividadesDeLaEmpresa(lista)`,
   que usan Pedidos, Rutas, Reportes y Configuración.

`js/supabase.js` usa `EMPRESA.supabase` si tiene datos; si no, la conexión base.
`js/sesion.js` guarda la sesión con el nombre de la empresa (`acachete_sesion_<empresa>`).
