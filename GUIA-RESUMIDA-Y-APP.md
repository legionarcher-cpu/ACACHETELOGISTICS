# GUÍA RESUMIDA DEL SISTEMA Y CÓMO LIGARLO A UNA APP
### ACACHETE Logistics · versión 1.2 · 2026-10-05

Resumen práctico de lo que ya está construido: qué hace cada parte, dónde está y cómo se modifica, y cómo
conectar una app (del piloto o del cliente) a los mismos datos. El diseño original y su historia están en
`PROPUESTA-ESTRUCTURADA-V2.md`; el detalle de cada tema, en `docs/` (empezar por `docs/README.md`).

---

## 1. Cómo está armado (en una página)

| Pieza | Qué es |
|---|---|
| **Una sola página** | `app.html`. Encabezado, menú y pie quedan fijos; cada sección se carga en el centro sin recargar (`js/pagina_inicial.js`) |
| **Secciones** | Cada una son 3 archivos con el mismo nombre: `secciones/<nombre>.html`, `js/secciones/<nombre>.js`, `css/secciones/<nombre>.css` |
| **Base de datos** | Supabase (PostgreSQL). La página se conecta directo con la clave pública (`js/supabase.js`). No hay servidor propio |
| **Marcas** | Varias copias del sistema con su logo, colores y base: `empresas/empresas.js` |
| **Empresas internas** | Varias empresas en la misma base, cada una con ID (`01`, `02`...). La **01 es siempre la empresa principal** (ACACHETE, colores originales); las demás parten de la 02 |
| **Roles** | Desarrollador, Administrador, Admin G1, G2 (región), G3 (tienda), Empleado, Piloto y Cliente |

Para abrirlo: Live Server en VS Code (con doble clic no cargan las secciones). Después de cambiar un CSS o JS:
**Ctrl + F5**.

---

## 2. Qué hace cada segmento y cómo modificarlo

### 2.1 Marco de la página (siempre visible)

| Segmento | Qué hace | Dónde se modifica |
|---|---|---|
| **Imágenes del encabezado** | Imagen del título, logos de la esquina y logo chico, **según la marca y la empresa activas**; cambian al iniciar sesión o cambiar de empresa | **Solo** `css/encabezados.css`: una regla por marca (`html[data-marca="..."]`) y por empresa (`html[data-empresa="02"]`). Luego subir `?v=` en `app.html` |
| Texto del título, pie, ícono de la pestaña | Si una marca no tiene imagen, se ve su título en texto | `empresas/empresas.js` (`titulo`, `subtitulo`, `pie`, `icono`) |
| Colores | 7 colores con nombre (`--color-azul`, `--color-naranja`...) | Originales: `css/variables.css`. Por marca: `colores` en `empresas.js`. Por empresa interna: Tiendas → Empresas → "Paleta de colores" |
| Menú lateral | Una opción por sección; con candado si el rol no puede entrar | `app.html` (opciones) y `js/sesion.js` (qué rol ve qué) |
| Botones del pie | Accesos rápidos (Crear Pedido / Viaje, Reportes, Cotizador...) | `BOTONES_PIE` en `js/pagina_inicial.js`; qué rol los ve, en `css/index.css` |
| Campana | Avisos (pendientes por aprobar, cambios de pedidos y viajes) | `js/notificaciones.js` |
| Escanear QR | Lee el QR de un pedido, de las marcas de la tienda o del piloto del día | `js/qr.js` |
| Celular y tablet | Menú ☰ y ajustes de tamaño | `responsive/responsive.css` (solo `@media`) |

### 2.2 Secciones

| Sección | Qué hace | Archivos (prefijo de clases) | Cómo se modifica lo más común |
|---|---|---|---|
| **Login** | Inicia sesión (la clave se compara cifrada en la base). "Solicita tu usuario" para clientes de cualquier empresa con Transporte (escriben el código de su empresa) | `loggin` (`login-`) | Textos en el HTML. Dejar la empresa ya puesta: enlace `#registro?empresa=02` o `registroClientes: '02'` en `empresas.js`; ocultar el botón: `registroClientes: false` |
| **Inicio** | Resumen del día, mapa, marcas del piloto. En empresas solo de Transporte, el resumen de viajes | `inicio` (`ini-`) | Tarjetas y mapa en `js/secciones/inicio.js`; mapa gratis o Google: `INI_MAPA` |
| **Pedidos** | Crear, listar y avanzar pedidos (alistando → listo → en ruta → entregado), QR y código de respaldo, cobro con tarifas | `pedidos` (`ped-`) | Estados y acciones al inicio de `js/secciones/pedidos.js`; precios y mercadería en Configuración → Pedidos (sin código) |
| **Viajes** | Transporte de personas y carga: el cliente solicita en 4 pasos, agenda, conductor y vehículo automáticos, cortesía | `viajes` (`via-`) + `js/viajes-comun.js` | Reglas, franjas de precio y costos en Configuración → Transporte (sin código) |
| **Pilotos** | Lista de pilotos con su tienda y vehículo | `pilotos` (`plt`) | `js/secciones/pilotos.js` |
| **Rutas y asignaciones** | Rutas por tienda y qué piloto cubre cada ruta por día o semana | `rutas` (`rut-`) | `js/secciones/rutas.js` |
| **Tiendas** | Tiendas por región, regiones, QR de marcas del mes | `tiendas` (`tnd-`) | Desde la página (Administrador y G1) |
| **Clientes** | Clientes por tienda y ruta, aprobación de lo que crea un Empleado, acceso de clientes a Viajes (Casa y Trabajo) | `clientes` (`cli-`) | Campos editables: `CLI_CAMPOS` en `js/secciones/clientes.js` |
| **Empresas internas** | Crear empresas (ID, actividades, paleta), trabajar con una (solo Desarrollador) | `empresas-internas` (`emp-`) | Modelos de paleta: `PALETAS_MODELO` en `empresas/empresas.js` |
| **Reportes** | Pedidos y viajes con filtros, gráficos y exportación a Excel y PDF con el nombre y colores de la empresa | `reportes` (`rep-`) | `js/secciones/reportes.js` |
| **Usuarios** | Crear, aprobar y modificar usuarios (llevan el ID de la empresa: `jperez02`, `cenjperez02`) | `usuarios` (`usr-`) | `js/secciones/usuarios.js` |
| **Configuración** | Horarios (marcas), slots, vehículos, Pedidos (tarifas, mercadería, descuentos, simulador), Actividades, Transporte | `configuracion` + `js/secciones/configuracion/*.js` (`cfg-`) | Casi todo se cambia desde la página; un módulo nuevo: tarjeta + `CFG_MODULOS` |
| **Cotizador** | Precio de un envío de Encomiendas con las tarifas | `cotizador` (`cot-`) | Usa las tarifas de Configuración |
| **Mi perfil** | Datos del usuario y su foto | `perfil` (`prf-`) | `js/secciones/perfil.js` |

### 2.3 Piezas compartidas (las usan todas las secciones)

| Archivo | Qué hace | Cuándo tocarlo |
|---|---|---|
| `empresas/empresas.js` | Marcas, paleta, modelos de paleta, empresa principal (`EMPRESA_PRINCIPAL = '01'`), qué actividades hace la empresa | Agregar o cambiar una marca, un modelo de paleta |
| `css/encabezados.css` | Imágenes del encabezado por marca y empresa | Cambiar imágenes o logos |
| `js/supabase.js` | Conexión; cada consulta queda **dentro de la empresa activa**; sin empresa no se borra nada | Si se agrega una tabla con `empresa_id` (sumarla a `TABLAS_POR_EMPRESA`) |
| `js/sesion.js` | Sesión, roles y qué secciones ve cada rol | Cambiar permisos por rol (`SECCIONES_POR_ROL`, `SECCIONES_BLOQUEADAS_POR_ROL`) |
| `js/componentes.js` + `css/componentes.css` | Avisos, tablas, botones, ventanas, exportar | Antes de crear algo nuevo, ver si ya existe aquí |
| `js/palabras.js` | "Pedido" se lee "Viaje" y "Piloto" "Conductor" según la actividad | Configuración → Actividades (palabras de cada actividad) |
| `js/mapa.js` | Mapa gratis, buscar direcciones, km y minutos por calle | Cambiar de proveedor de mapas (`MAPA_SERVICIOS`) |

### 2.4 Base de datos y herramientas

| Archivo | Para qué |
|---|---|
| `sql/00_instalacion_completa.sql` | Base **nueva** en blanco (una sola vez) |
| `sql/01_actualizacion_base_existente.sql` | Pone al día una base existente. Se puede repetir. Hoy llega al **bloque 21** |
| `herramientas/vaciar_base_datos.sql` | Limpia **una empresa** (pide su ID y nombre) o toda la base |
| `herramientas/empresas.bat` | Nueva marca (con paleta y regla de encabezado), cambiar su base, su paleta o la marca activa |
| `python/tarifas.py` | Cálculo de precios (lo usa también la página) |

---

## 3. Recetas rápidas

| Quiero… | Cómo |
|---|---|
| Cambiar la imagen del encabezado de una empresa | `css/encabezados.css` → su bloque `html[data-empresa="ID"]` (agregarlo debajo del último si es nueva) → subir `?v=` en `app.html` |
| Cambiar los colores de una empresa interna | Tiendas → Empresas → Modificar → Paleta de colores (la 01 queda siempre con los originales) |
| Agregar un modelo de paleta | Una línea en `PALETAS_MODELO` (`empresas/empresas.js`): clave, texto y 2 colores |
| Crear una empresa interna | Tiendas → Empresas → Nueva empresa (ID 02 en adelante, actividades y paleta) → "Trabajar con esta" → sus regiones, tiendas y usuarios |
| Crear otra marca (otra copia) | Doble clic en `herramientas/empresas.bat` → opción 1 |
| Agregar una actividad (ej. mensajería) | Configuración → Actividades → Nueva actividad (qué usa y cómo se llaman sus registros) |
| Cambiar precios | Configuración → Pedidos (tarifas) o Configuración → Transporte (franjas por km) |
| Que un rol no vea una sección | `js/sesion.js` → `SECCIONES_BLOQUEADAS_POR_ROL` |
| Agregar una columna a una tabla | Al final de `sql/01` (bloque nuevo) y en su sección de `sql/00`. Si es en `usuarios`, luego `select public.usuarios_ocultar_clave();` |
| Agregar una sección nueva | 3 archivos con el mismo nombre + opción en el menú de `app.html` (`docs/10-recetas.md`) |
| Limpiar los datos de una empresa | `herramientas/vaciar_base_datos.sql` → escribir su ID y su nombre → Run en Supabase |

---

## 4. Cómo ligarlo a una app

### 4.1 La idea

La app **no necesita servidor ni base propia**: se conecta a **la misma base de Supabase** (misma URL y clave
pública que `js/supabase.js` o el campo `supabase` de la marca). Todo lo que haga la app aparece al instante en el
panel web y al revés: un pedido marcado "entregado" en la app se ve en Pedidos, Inicio y Reportes.

```
   App del piloto ─┐
   App del cliente ─┼──>  Supabase (tablas + funciones + fotos)  <──  Panel web (este proyecto)
   Otra app       ─┘
```

### 4.2 Tres formas de hacer la app (de la más simple a la más completa)

| Forma | Qué es | Ventajas | Cuándo |
|---|---|---|---|
| **A. PWA (app web instalable)** | La misma web, con un `manifest.json` y un service worker: se "instala" en el celular con ícono propio | Sin tiendas de apps; se actualiza sola; reutiliza todo el código. Cámara para el QR ya funciona en el navegador | **Para empezar** (recomendada) |
| **B. Envolver la web con Capacitor** | La misma web empaquetada como app Android / iPhone | Publicable en Play Store; acceso a GPS, cámara, notificaciones push y archivos | Cuando haga falta push o GPS más fiable |
| **C. App nativa** (Flutter, React Native, Kotlin) | App nueva que usa el SDK de Supabase | La mejor experiencia y GPS en segundo plano | Cuando el flujo esté validado y haya presupuesto |

En las tres, la app usa **las mismas tablas y funciones** de la sección 4.3.

### 4.3 Qué usaría cada app (ya existe en la base)

**Iniciar sesión** (todas)
- `iniciar_sesion(usuario, clave)` → devuelve el id del usuario si la clave es correcta (la base la compara cifrada).
- Luego leer el usuario con su empresa: `usuarios` (sin la columna `clave`, que no se puede leer) + `empresas(*)`.
- Usuario con `aprobado = false` o empresa inactiva: no entra.

**App del piloto (pedidos)**

| Acción | Cómo |
|---|---|
| Ver sus pedidos del día | `pedidos` donde `piloto_id` = su id y `fecha_entrega` = hoy |
| Escanear el QR del pedido | El QR dice `ACACHETE-PEDIDO:<token_qr>` → buscar el pedido por `token_qr` |
| Validar sin QR | `validar_codigo_respaldo(pedido, código)` |
| Avanzar el estado | Cambiar `pedidos.estado` (`cargado` → `en_ruta` → `en_entrega` → `entregado` / `no_entregado`) **y** agregar la línea en `pedido_historial` (evento, estado anterior y nuevo, usuario), igual que `registrarEvento` en `js/secciones/pedidos.js`. Las horas de cada paso las pone la base sola |
| Cierre de entrega | `pedido_entregas`: quién recibió, satisfecho, mercadería buena, retraso y motivo (`motivos_retraso`), mayoría de edad, ubicación |
| Fotos | Subir a Storage `evidencias` y registrar en `pedido_evidencias` (`entrega`, `mal_estado`, `retraso`, `recepcion`) |
| Marcar horario en la tienda | Escanear el QR de marcas → `marcar_por_qr(piloto, qr, justificación)` (si llega tarde responde `JUSTIFICAR:` y la app pide el motivo) |
| Su QR del día (la tienda lo valida) | `qr_piloto_dia(piloto)` |

**App del conductor (viajes de Transporte)**
- Sus viajes: `viajes` donde `conductor_id` = su id (solo lectura).
- Avanzar: `viajes_avanzar(viaje, usuario, estado)` → "Voy en camino", "A bordo", "Terminado", "No se presentó".

**App del cliente (Transporte)**

| Acción | Función |
|---|---|
| Pedir su usuario | `registro_clientes_empresa(ID)` (¿esa empresa recibe solicitudes?) y `solicitar_acceso_cliente(datos)` |
| Ver horas libres y precio | `viajes_horas_disponibles(...)` y `viaje_precio(...)` |
| Solicitar un viaje | `viajes_solicitar(datos)`: revisa reglas, asigna vehículo y conductor y confirma |
| Cambiar la hora / cancelar | `viajes_cambiar_hora(...)` / `viajes_cancelar(...)` |
| Sus viajes y su cortesía | `viajes` y `cortesias` (solo lectura) y `viajes_estado_cliente(cliente)` |

### 4.4 Reglas que la app debe respetar

1. **Siempre filtrar por la empresa del usuario** (`empresa_id`). La web lo hace sola en `js/supabase.js`; la app
   debe hacer lo mismo en cada consulta, sobre todo al modificar o borrar.
2. **Los pedidos no se borran**: se cancelan (`estado = cancelado` + motivo). Viajes y cortesías solo se cambian con
   sus funciones.
3. **Zona horaria**: Costa Rica (`ahora_local()` en la base; `transporte_config.zona_horaria` para viajes).
4. **Palabras**: si la actividad es Transporte, mostrar "Viaje" y "Conductor" (`actividades.palabra_*`).
5. **Colores e imágenes**: la app puede leer `empresas.colores` para pintarse con la paleta de la empresa (la 01,
   siempre los originales).
6. **Mismo SQL**: cualquier cambio de tablas se hace en `sql/01` y `sql/00`, y se avisa al equipo de la app.

### 4.5 Lo que falta antes de publicar una app con datos reales

| Pendiente | Por qué | Qué hacer |
|---|---|---|
| **Fase 7: Supabase Auth + RLS** (lo más importante) | Hoy la base acepta leer y escribir casi todo con la clave pública, y una app publicada deja esa clave a la vista de cualquiera | Pasar el login a Supabase Auth y poner reglas en cada tabla: cada usuario ve solo su empresa y lo que su rol permite |
| **Ubicación en tiempo real** | El mapa de Inicio ya está listo para mostrar a los pilotos | Tabla de ubicaciones (piloto, lat, lng, hora) que la app actualice cada pocos segundos; Inicio dibuja un marcador por piloto |
| **Notificaciones push** | Hoy los avisos se ven en la campana de la web | Guardar el token del celular y enviar con Firebase (FCM) desde una función de Supabase (Edge Function) |
| **Cambios en vivo** | Hoy la web revisa novedades cada minuto | Usar Supabase Realtime en la app (y luego en la web) para recibir cambios al instante |
| Firma del cliente | La propuesta la contempla | Guardarla como imagen en Storage `evidencias` (tipo nuevo `firma`) |

### 4.6 Orden sugerido

1. Hacer la **Fase 7** (seguridad) — sin esto no se publica una app.
2. **PWA del piloto**: una vista móvil sencilla dentro del mismo proyecto (sus pedidos del día, escanear, avanzar,
   cierre con fotos), con `manifest.json` para instalarla.
3. Probar con un grupo de pilotos; agregar la **tabla de ubicaciones** y el mapa en vivo.
4. Si se necesita push o GPS en segundo plano: empaquetar con **Capacitor** y publicar en Play Store.
5. **App del cliente** de Transporte: la misma sección Viajes (ya es apta para celular) como PWA o dentro de la
   misma app.
