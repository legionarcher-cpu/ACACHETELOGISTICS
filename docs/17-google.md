# 17. Aparecer en Google (SEO)

Qué tiene el sitio para que Google lo encuentre y qué hay que hacer fuera del código.

## Piezas en el proyecto

| Archivo | Para qué |
|---|---|
| `index.html` (`<head>`) | Título y descripción con las palabras que la gente busca, dirección oficial (`canonical`), imagen y textos al compartir (Open Graph), y **datos estructurados** (`application/ld+json`): empresa, sitio, software y preguntas frecuentes |
| `index.html` (`#software-logistica`) | Texto que Google sí lee: qué hace el software y **preguntas frecuentes**. Lo que se abre en ventanas (Productos, Soluciones, Contacto) Google no lo ve |
| `img/web/compartir.jpg` | Imagen 1200×630 al compartir el enlace (WhatsApp, Facebook, LinkedIn) |
| `robots.txt` | Permite revisar el sitio y dice dónde está el mapa |
| `sitemap.xml` | Mapa del sitio: solo las páginas públicas. Al agregar una, sumar su `<url>` y cambiar `<lastmod>` |
| `_headers` | `X-Robots-Tag: noindex` para la app (`/app`, `/app.html`), sus pantallas (`secciones/`), las ventanas de la web (`web/paginas/`), `empresas/` y `python/` |
| `app.html` | `<meta name="robots" content="noindex, nofollow">` (la app pide usuario y clave) |

**Regla:** las preguntas de `#software-logistica` y las del bloque `FAQPage` del `<head>` deben ser las mismas
(misma pregunta y misma respuesta). Si se cambia una, cambiar las dos.

## Lo que se hace una sola vez (fuera del código)

1. **Google Search Console** (search.google.com/search-console): *Agregar propiedad → Dominio* →
   `acachetelogistics.com`. Google da un registro **TXT**: se agrega en Cloudflare → `acachetelogistics.com` →
   **DNS → Registros → Agregar registro** (tipo TXT, nombre `@`, el valor que da Google) → *Verificar*.
2. En Search Console → **Sitemaps** → escribir `sitemap.xml` → *Enviar*.
3. En Search Console → **Inspección de URLs** → `https://acachetelogistics.com/` → **Solicitar indexación**.
4. **Perfil de empresa en Google** (google.com/business): ACACHETE Logistics, categoría *Empresa de software*,
   teléfono, zona de servicio (Costa Rica) y el sitio web.
5. **www → sin www** (opcional, recomendado): Cloudflare → `acachetelogistics.com` → **Reglas → Reglas de
   redirección → Crear desde plantilla → "Redirigir de WWW a raíz"**. Así Google ve una sola dirección.

## Cómo revisar que funciona

- `https://acachetelogistics.com/robots.txt` y `/sitemap.xml` se ven en el navegador.
- **Prueba de resultados enriquecidos** (search.google.com/test/rich-results) con la dirección del sitio: debe
  reconocer *Organización*, *Preguntas frecuentes* y *Aplicación de software*.
- Al pegar el enlace en WhatsApp sale la imagen `compartir.jpg` (WhatsApp guarda la vista previa un tiempo).
- En Search Console → **Páginas**: la principal "Indexada"; la app "Excluida por la etiqueta noindex" (correcto).

## Tiempos

Buscando "ACACHETE Logistics": días a pocas semanas después de enviar el sitemap. Búsquedas generales como
"software de logística Costa Rica": meses; ayuda el perfil de empresa, enlaces desde redes sociales y
directorios, y agregar páginas propias por tipo de empresa (mensajerías, distribuidoras, transporte).
