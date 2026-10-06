# Página web de presentación (`index.html` + carpeta `web/`)

Página para promocionar ACACHETE Logistics. Está **aparte de la app**: no usa ni cambia ningún archivo de la app.

| Archivo | Qué tiene |
|---|---|
| `index.html` (raíz, junto a `app.html`) | La página principal: bienvenida (con los 3 beneficios), soluciones por tipo de empresa, galería "Conozca más" y pie |
| `web/paginas/solucion-courier.html`, `solucion-distribuidora.html`, `solucion-transporte.html` | Una página por tipo de empresa: lo que resolvemos (antes / con ACACHETE), así trabaja su operación, funciones incluidas, destacado y llamado a la demostración |
| `web/css/web.css` | Colores (los de la app), estilos e **imágenes** |
| `web/js/web.js` | Imágenes que se turnan, ventanas internas, visor de productos y formulario de contacto |
| `web/paginas/productos.html` | Productos (cada función de la app como un producto) |
| `web/paginas/vision.html` | Misión, visión, valores y hacia dónde vamos |
| `web/paginas/contacto.html` | Correo, celular, WhatsApp y formulario de demostración |
| `img/web/` | Imágenes de la página |

## Cambiar las imágenes
En `web/css/web.css`, arriba, bloque **IMÁGENES** (`--img-portada-1`, `--img-tarjeta-app`...). Las rutas van desde
`web/css/`, por eso empiezan con `../../img/web/`.

## Ventanas internas
Productos, Visión, Contacto y la App (`app.html`) se abren dentro de la página, creciendo desde lo que se tocó.
Cualquier elemento con `data-ventana="productos|vision|contacto|app|courier|distribuidora|transporte"` abre la suya
(las tres últimas: la solución de cada tipo de empresa); con
`data-filtro="courier|distribuidora|transporte"` abre Productos ya filtrado. También se pueden compartir enlaces
directos: `index.html#productos`, `index.html#vision`, `index.html#contacto`, `index.html#app`.

## Agregar un producto
Copiar un `<article class="producto">` completo en `web/paginas/productos.html` y cambiar ícono, textos y
`data-segmentos`. Aparece solo en la rejilla, en los filtros y en el visor.

## Datos de contacto
En `web/paginas/contacto.html`, en el pie de `index.html` y en `WEB_CORREO` / `WEB_WHATSAPP` de `web/js/web.js`.

## Abrirla
Igual que la app: con Live Server o desde la web publicada (con doble clic el navegador no carga las páginas de
`web/paginas/`). Después de cambios, subir `?v=` de `web.css` y `web.js` en `index.html` y recargar con Ctrl + F5.
