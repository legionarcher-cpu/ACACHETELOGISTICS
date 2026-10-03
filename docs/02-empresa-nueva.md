# 2. Empresa nueva (multimarca)

Hay **dos formas** de tener varias empresas:

| Forma | Qué es | Dónde |
|---|---|---|
| **Empresas internas** (recomendada) | Varias empresas en la **misma base**, cada una con ID (`01`, `02`...), sus actividades y sus datos separados; sus usuarios llevan el ID (`jperez02`) | Desde la página: Configuración → Empresas o Tiendas → Empresas (solo Desarrollador). Ver [secciones/empresas.md](secciones/empresas.md) |
| **Multimarca** (esta guía) | Otra **copia** del sistema con su logo, colores, textos y, si se quiere, su propia base | `empresas/empresas.js`, en VS Code |

Las dos se combinan: una marca (copia) puede tener varias empresas internas.

**Cada marca se configura en VS Code**, en un solo archivo: `empresas/empresas.js`. No se hace desde la página.

## Qué define cada empresa

```js
'otoya-valverde': {
    nombre: 'Otoya-Valverde & Asociados',      // pestaña del navegador
    titulo: 'Otoya-Valverde & Asociados',      // texto grande del encabezado
    subtitulo: 'Panel de Control de Operaciones',
    encabezado: 'img/img-encabezado.jpg',      // imagen que REEMPLAZA al título ('' = texto)
    pie: ['Derechos Reservados Achete Logistics S.A.', 'Propiedad Reservada para ...'],
    actividades: ['tienda', 'encomiendas'],    // qué hace la empresa
    supabase: { url: '', anonKey: '' },        // su base de datos ('' = la de js/supabase.js)
    colores: {},                               // su paleta ({} = colores originales ACACHETE)
},
```

- `EMPRESA_ACTIVA` (arriba del archivo) elige cuál usa esta copia del sistema.
- **ACACHETE es la marca de la casa:** su logo siempre aparece en la animación del logo (se turna con el
  de la empresa) y en el login. No se cambia por empresa.
- `actividades`: `'tienda'` = Entregas de tienda (supermercado), `'encomiendas'` = Encomiendas.
  Las que no estén aquí **no aparecen en ninguna parte** del sistema. Ver
  [07-actividades-y-mercaderia.md](07-actividades-y-mercaderia.md).
  Con empresas internas (sql/01 bloque 16) **manda lo que marca cada empresa interna**; esta lista queda
  de respaldo para una base sin empresas.

## Agregar una empresa (sin escribir código)

```
python python/nueva_empresa.py
```

Pregunta nombre, logo, imagen de encabezado, pie, **qué actividad realiza** (1 tienda, 2 encomiendas,
3 las dos) y la base de datos; la agrega a `empresas/empresas.js` y puede dejarla activa.
Sin Python: copiar un bloque existente y cambiar los valores (la clave entre comillas no se puede repetir).

Las imágenes van en `img/`. El script avisa si la ruta no existe.

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

1. Pedir la paleta indicando la empresa (y, si hay, su logo o una imagen de referencia).
2. Pegarla en su campo `colores`, con los nombres de `css/variables.css` **sin** los `--`:

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
- Los nombres dicen "azul" y "naranja" porque son los colores de ACACHETE; lo que importa es **para
  qué se usa** cada uno (comentario a la derecha).
- Texto blanco sobre `color-naranja`: elegir un tono oscuro para que se lea (contraste mínimo 4.5:1).
- Hay colores escritos directamente en algunos CSS (ver [08-estilos.md](08-estilos.md)): esos no cambian con la paleta.

## Cómo funciona por dentro

`empresas/empresas.js` se carga en `index.html` **antes que todo** (sin `defer`):
1. Aplica los `colores` al instante (antes de dibujar la página).
2. Al terminar de cargar la página pone logo, fondo del logo, título o imagen, pie y nombre de la pestaña.
3. Deja disponibles `EMPRESA`, `empresaTieneActividad(codigo)` y `actividadesDeLaEmpresa(lista)`,
   que usan Pedidos, Rutas, Reportes y Configuración.

`js/supabase.js` usa `EMPRESA.supabase` si tiene datos; si no, la conexión base.
`js/sesion.js` guarda la sesión con el nombre de la empresa (`acachete_sesion_<empresa>`).
