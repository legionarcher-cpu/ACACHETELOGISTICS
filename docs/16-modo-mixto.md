# 16. Modo mixto: nube + instalado en la PC (licencias y actualizaciones firmadas)

**Estado: DISEÑO APROBADO · SIN CÓDIGO TODAVÍA** (2026-10-12). Este documento es el estatus del proyecto: cada fase
dice si está pendiente, en curso o hecha. Se actualiza al avanzar.

## Objetivo

Una sola app, dos formas de usarla:

| | **Nube (alquiler mensual)** | **Instalada (pago único)** |
|---|---|---|
| Base de datos | Supabase (como hoy) | PostgreSQL + PostgREST en la PC del cliente |
| Cómo se abre | Navegador | App de escritorio (instalador) |
| Código | El mismo | El mismo (empaquetado, ofuscado y firmado) |
| Cambios | Se suben y se ven al instante | Le llegan como **actualizaciones firmadas**, solo las que su **licencia** permite |

El Desarrollador sigue manejando todo **desde la web**: publica versiones y decide, por licencia, qué recibe cada
cliente instalado.

## Regla principal: no afectar a la app

1. **El modo nube no cambia.** Las empresas que usan Supabase siguen igual; todo lo nuevo es aparte.
2. **Un solo código.** No hay "otra versión" para el instalado: lo que cambia es a dónde se conecta (un dato por
   empresa en `empresas/empresas.js`, ej. `modo: 'nube' | 'instalado'`).
3. **Nada exclusivo de Supabase en la app.** Hoy ya se cumple: el login es nuestro (`iniciar_sesion`) y los datos van
   por tablas y funciones de Postgres. Excepción a resolver: las fotos (Supabase Storage), ver Fase 2.
4. **Los SQL siguen siendo los mismos** (`sql/00` y `sql/01`, bloques que se pueden repetir). El instalado los aplica
   solo y recuerda cuáles ya tiene.
5. **Toda actualización se puede deshacer:** el instalado guarda la versión anterior y vuelve a ella si algo falla.
6. **Cada fase se prueba en una copia** antes de llegar a un cliente (como las pruebas con PGlite de los bloques 26-27).

## Cómo funcionará

```
   WEB (Desarrollador, Supabase de ACACHETE)
   ├─ Versiones publicadas: archivos cambiados (html, js, css) + bloques SQL nuevos, FIRMADOS
   ├─ Licencias: cliente, equipo, plan y funciones, canal, actualizaciones hasta...
   └─ Qué versión tiene cada cliente instalado y cuándo se conectó
            │  (cada X horas, por internet; o paquete por USB/correo)
            ▼
   PC DEL CLIENTE (instalado)
   ├─ App de escritorio (Tauri): html/js/css dentro del ejecutable, ofuscados
   ├─ Revisa al abrir: archivos firmados por el Desarrollador y licencia válida
   ├─ Actualizador: baja solo lo que su licencia permite, verifica la firma,
   │  reemplaza archivos, aplica los bloques SQL que le faltan, guarda la versión anterior
   └─ PostgreSQL + PostgREST (servicios de Windows, contraseña que el cliente no conoce)
```

### Firmas

- El Desarrollador tiene una **clave privada** (solo en su PC; nunca se sube a ningún lado). La app lleva la **clave
  pública**.
- Se firman: los archivos de la app, cada paquete de actualización y cada licencia.
- Lo que no tenga una firma válida no se instala ni se abre. Así **solo el Desarrollador** puede hacer cambios.

### Licencias (deciden qué actualizaciones recibe cada cliente)

Una licencia firmada lleva:

| Dato | Para qué |
|---|---|
| Empresa y equipo (huella de la PC) | No se copia a otra PC |
| Plan y funciones | Las mismas de Configuración → Planes y funciones (`FUNCIONES_PLAN`) |
| Canal | `estable` (todos) o `pruebas` (clientes que prueban primero) |
| Actualizaciones hasta (fecha) | Pago único con X meses de actualizaciones; después sigue funcionando sin versiones nuevas |
| Módulos extra | Ej. distribuidora, transporte: una versión que trae un módulo solo le llega si lo tiene |
| Vence (opcional) | Para licencias temporales o de prueba |

La licencia se revisa sin internet (con la clave pública) y se renueva sola cuando hay conexión.

### Actualizaciones

- El Desarrollador publica en la web una **versión** (ej. 1.3.0) con: archivos cambiados, bloques SQL nuevos,
  canal, versión mínima requerida y notas.
- El instalado consulta cada X horas: "tengo 1.2.0, licencia tal" → recibe la lista de versiones que le tocan.
- Aplica en orden: verifica firma → copia de respaldo → archivos → bloques SQL que le faltan (tabla
  `versiones_aplicadas`) → si algo falla, vuelve a la versión anterior y avisa al Desarrollador.
- Sin internet: el mismo paquete firmado se puede instalar desde USB o correo.

## Empresa grande con servidor propio (conversado 2026-10-21, sin código)

Caso: una empresa quiere la base en **su servidor** y que se sincronice con Supabase (ej. una vez al día).

**Acordado — acceso en cada PC:** un **instalador pequeño** que solo crea en la PC el acceso directo a la app, servida
desde el servidor de la empresa en su red, y la abre con el navegador adecuado. La app no se instala en cada PC: se
actualiza una sola vez, en el servidor.
- Funciona en sistemas viejos porque el límite es el navegador: Windows 10/11 sin problema. Windows 7 y 8.1 solo con
  Firefox ESR (sin parches de seguridad pronto). XP y Vista no.
- Tauri (necesita WebView2) y Electron (desde la versión 23) ya no corren en Windows 7: para este caso no sirven.

**Para abordar más adelante — base de datos (no decidido):**
- **Supabase instalado (self-hosted, Docker)** en el servidor, de preferencia Linux (Ubuntu Server LTS). Trae Auth,
  Storage y la API: el mismo código y los mismos `sql/instalacion`.
  - ⚠ Desde la Etapa 2A la app usa **Supabase Auth**. Por eso la idea de "PostgreSQL + PostgREST" de arriba
    (y la regla 3, "el login es nuestro") quedó desactualizada para este caso.
- **Sincronización de una sola vía, del servidor local a la nube**, a un **proyecto de Supabase propio de esa
  empresa**: no a la base compartida, porque los `id` chocarían.
  - Al inicio, una copia completa cada noche.
  - Después, si hace falta, replicación lógica de PostgreSQL (casi al instante).
  - Ida y vuelta diaria no: conflictos e `id` repetidos.
- Depende de la decisión 1 (pilotos en la calle): si ellos usan la nube y la oficina el servidor, una sola vía no
  alcanza.

## Decisiones pendientes (antes de empezar)

| # | Decisión | Opciones | Estado |
|---|---|---|---|
| 1 | **Pilotos en la calle** con base en la PC | Túnel seguro (Cloudflare Tunnel) · pilotos en la nube y oficina local · instalado solo para empresas sin pilotos fuera | **Pendiente** |
| 2 | Una PC o varias | Una sola · una de servidor y las demás por la red de la oficina | Pendiente |
| 3 | Fotos (entregas, avatares) en el instalado | Carpeta del servidor con un pequeño servicio · sin fotos | Pendiente |
| 4 | Respaldos del instalado | Diario automático en la PC · además a la nube si hay internet | Pendiente |
| 5 | Cada cuánto busca actualizaciones | Al abrir + cada X horas | Pendiente |
| 6 | Meses de actualizaciones incluidos en el pago único | Ej. 12 meses | Pendiente |
| 7 | Empaquetador | Tauri (recomendado: más liviano y el código queda dentro del ejecutable) · Electron | Recomendado Tauri |

## Fases

| Fase | Qué se hace | Afecta a la app en la nube | Estado |
|---|---|---|---|
| 0 | Este diseño y las decisiones de arriba | No | **En curso** |
| 1 | `modo` por empresa (nube / instalado) en `empresas.js` y conexión configurable | No (todo queda en nube) | Pendiente |
| 2 | Fotos sin depender de Supabase Storage (adaptador: Storage en nube, carpeta en instalado) | No (en nube sigue Storage) | Pendiente |
| 3 | Panel del Desarrollador en la web: **Licencias y versiones** (tablas en el Supabase de ACACHETE) | No (solo lo ve el Desarrollador) | Pendiente |
| 4 | Firma: herramienta para firmar versiones y licencias con la clave privada | No | Pendiente |
| 5 | Instalador (Tauri): app + PostgreSQL + PostgREST + `sql/00` + licencia | No | Pendiente |
| 6 | Actualizador: buscar, verificar, aplicar, deshacer; tabla `versiones_aplicadas` | No | Pendiente |
| 7 | Protecciones: ofuscación, revisión de integridad al abrir, contraseña de la base oculta | No | Pendiente |
| 8 | Pilotos según la decisión 1 (túnel o mixto) | Depende de la decisión | Pendiente |
| 9 | Prueba completa en una PC limpia y con un cliente piloto | No | Pendiente |

## Límites (para que quede claro)

- El código web **no se puede cifrar al 100 %**: se ofusca y se firma. Un experto con mucho tiempo podría
  desarmarlo; la firma impide que una versión modificada se ejecute o se instale como si fuera oficial.
- Quien sea administrador de la PC podría llegar a los archivos de la base. Por eso la contraseña la genera el
  instalador y los servicios corren con una cuenta restringida.
- Lo que cierra el círculo es el **contrato de licencia** (prohíbe modificar o copiar).
- El modo instalado no tiene la sincronización sin conexión de los pilotos (ver la opción A de PWA, conversada
  aparte): son temas distintos.
