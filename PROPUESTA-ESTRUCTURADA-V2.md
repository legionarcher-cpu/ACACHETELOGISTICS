# PROPUESTA ESTRUCTURADA DE APLICACIÓN
## Gestión de Pedidos, Entregas y Transporte
### Documento de diseño — versión 2 (ajustado a la implementación en curso)

> **📌 La documentación técnica actualizada está en la carpeta [`docs/`](docs/README.md)** (desde el
> 2026-09-30). Este documento se conserva como historia del diseño; si algo no coincide, manda `docs/`.
>
> **Cómo está organizado este documento**
> - **Parte I (secciones 1 a 18):** qué es el sistema, qué debe hacer y cómo se construirá por fases.
> - **Parte II (secciones 19 a 30):** guía técnica de lo que ya está construido: cómo abrirlo, cómo está organizado el código, la base de datos, los roles, la seguridad y cómo agregar pantallas nuevas.
>
> Última actualización: 28/09/2026.

---

## 1. Objetivo general

Crear una aplicación para coordinar las operaciones de tiendas, pedidos, conductores, retiros, entregas y solicitudes de transporte desde una plataforma centralizada.

---

## 2. Estructura general del sistema

La aplicación se divide en dos módulos principales conectados a una misma base de datos:

- **Módulo de Tiendas:** creación y programación de pedidos, horarios, seguimiento y control mediante QR.
- **Módulo de Transporte:** solicitudes de transporte, asignación de conductores y vehículos, y seguimiento.

Ambos módulos, junto con el panel administrativo, viven sobre una única base de datos en **Supabase (PostgreSQL)**, ya en funcionamiento.

---

## 3. Módulo de Tiendas

Cada tienda tendrá un usuario y podrá registrar sus pedidos.

Datos de un pedido:
- Número de pedido
- Cliente
- Dirección
- Teléfono
- Fecha
- Hora programada de llegada
- Hora programada de retiro
- Hora programada de entrega
- Estado del pedido

---

## 4. Control de horarios

La tienda podrá asignar tres momentos principales:
- Marca de llegada
- Retiro del pedido
- Entrega programada

El sistema muestra los pedidos con indicadores: **verde** = a tiempo, **amarillo** = próximo a vencer, **rojo** = atrasado. Este cálculo se hace en el frontend comparando la hora actual contra la hora programada de cada pedido (sin necesidad de un proceso en segundo plano al inicio).

---

## 5. Línea de tiempo del pedido

Cada pedido tendrá un historial de eventos, por ejemplo:

```
08:02 – Llegada a tienda
08:15 – Pedido listo
08:27 – Pedido retirado
08:29 – QR escaneado
08:30 – Salida
09:18 – Entregado
```

Cada fila de este historial es un registro en la tabla `eventos_pedido`.

---

## 6. Sistema QR

> Actualizado en la **sección 31.6**: QR común para todas las empresas, lo escanean tienda y piloto, y hay un código de respaldo de 4 dígitos.

Cada pedido dispone de un código QR único (columna `qr` en la tabla `pedidos`). Al recogerlo, el conductor lo escanea y el sistema verifica que el pedido exista, esté listo, esté asignado y pueda salir.

El escaneo registra automáticamente fecha, hora, pedido, conductor, vehículo y cambio de estado (un nuevo registro en `eventos_pedido` + actualización de `pedidos.estado`).

Para generar el QR se puede usar una librería JS ligera (ej. `qrcode.js`) sin necesidad de backend propio. Para leerlo, la cámara del navegador (API `getUserMedia` + librería como `jsQR`), evitando depender de una app nativa desde el inicio.

---

## 7. Aplicación del conductor

Interfaz separada del panel de tienda, pensada para móvil:
- Ver pedidos asignados
- Consultar dirección y hora de entrega
- Escanear QR
- Registrar retiro
- Registrar salida
- Confirmar entrega
- Registrar incidencias

**Recomendación de implementación:** empezar como una página web ligera y responsive (mismo login, mismas tablas de Supabase, sin el dashboard completo), en vez de invertir de entrada en Flutter o React Native. Migrar a app nativa cuando el flujo esté validado y se necesite acceso más profundo al dispositivo (notificaciones push, GPS en segundo plano).

---

## 8. Confirmación de entrega

La entrega registra:
- Fecha y hora
- Conductor
- Persona que recibe
- Firma
- Fotografía
- Ubicación
- Observaciones

Firma y fotografía se guardan como archivos en **Supabase Storage**, y la tabla `entregas` guarda solo la URL de cada uno (no el archivo binario en la base de datos).

---

## 9. Módulo de Solicitud de Transporte

Permite a una tienda solicitar un transporte independiente de los pedidos:
- Tienda solicitante
- Fecha
- Hora requerida
- Tipo de transporte
- Cantidad o descripción de mercancía
- Origen
- Destino
- Observaciones
- Estado de la solicitud

---

## 10. Panel de transporte

El encargado visualiza solicitudes pendientes y asigna recursos:
- Conductor
- Vehículo
- Hora de servicio
- Estado de la solicitud

---

## 11. Panel administrativo

El administrador controla toda la operación:
- Pedidos del día
- Pedidos pendientes
- Pedidos en preparación
- Pedidos en camino
- Pedidos entregados
- Transportes pendientes
- Vehículos disponibles
- Conductores disponibles
- Reportes y estadísticas

---

## 12. Estados del pedido

```
CREADO
PROGRAMADO
ESPERANDO_PREPARACION
LISTO_PARA_RETIRO
RETIRADO
EN_CAMINO
ENTREGADO
CANCELADO
NO_ENTREGADO
REPROGRAMADO
INCIDENCIA
```

---

## 13. Estructura de la base de datos (Supabase / PostgreSQL)

> Todas las tablas usan el mismo estilo (snake_case, sin tildes ni espacios).
> Los scripts ya ejecutados o por ejecutar están en la carpeta `sql/` del proyecto.

### 13.1 Roles de usuario

| Rol | Quién es | Tienda | Formato de usuario (`id_usuario`) |
|---|---|---|---|
| `administrador` | Controla toda la operación | No tiene | `admin` |
| `admin_g1` (Admin G1) | Administración en todo el país: crea, modifica y elimina Empleados y Pilotos. En Tiendas crea tiendas y modifica datos (nombre, dirección, teléfono, estado) | No tiene | `jlopez` |
| `admin_g2` (Admin G2) | Administración de UNA región: crea, modifica y elimina Empleados y Pilotos de las tiendas de su región. Solo ve su región. En Tiendas solo ve | No tiene (tiene **región**) | `mruiz` |
| `admin_g3` (Admin G3) | Administrador local de UNA tienda: crea Empleados de su tienda (quedan **pendientes** hasta que los apruebe G2 de la región, G1 o el Administrador); administra los clientes de su tienda; solo ve su tienda | Obligatoria | `<código tienda>-<usuario>` → `cen-001-mlopez` |
| `empleado` | Usuario de una tienda: crea y sigue pedidos (funciones por definir) | Obligatoria | `<código tienda>-<usuario>` → `nor-001-jperez` |
| `piloto` | Conductor de una tienda. No crea pedidos ni hace tareas administrativas; solo registrará datos que se definirán más adelante | Obligatoria | `<código tienda>-<usuario>` → `nor-001-lgarcia` |

**Qué puede hacer cada rol (hasta ahora):**

| Sección | Administrador | Admin G1 | Admin G2 | Admin G3 | Empleado | Piloto |
|---|---|---|---|---|---|---|
| Menú (acceso) | Todo | Todo | Todo | Todo | Todo **menos Usuarios, Pilotos y Reportes** (con candado) | **Solo Inicio y Pedidos** (+ Mi perfil). El resto aparece con candado |
| Usuarios | Todo, con cualquier rol. Único que asigna roles de administración | Crear, modificar y eliminar Empleados y Pilotos | Lo mismo que G1, solo en su región (y solo ve su región). **Aprueba** usuarios creados por G3 de su región | Solo ve su tienda. **Crea Empleados** que quedan pendientes de aprobación. No modifica ni elimina | Sin acceso | Sin acceso |
| Tiendas | Crear, modificar (incluido el código) y eliminar | Crear y modificar datos (no cambia códigos, no elimina) | Solo ver su región | Solo ver su tienda | Solo ver | Sin acceso |
| Pilotos | Ver | Ver | Ver su región | Ver su tienda | Sin acceso | Sin acceso |
| Reportes | (por construir) | (por construir) | (por construir) | (por construir) | Sin acceso | Sin acceso |
| Clientes | Todo (ver, crear, modificar, eliminar, aprobar) | Todo | Todo, solo clientes de tiendas de su región | Todo, solo clientes de su tienda (aprueba a sus Empleados) | Ver los de su tienda; crear y modificar **con aprobación**; no elimina | Sin acceso |
| Configuración → Horarios | Sí | Sí | Ve la base (solo lectura); administra los **pedidos por marca** de su región y de sus tiendas | No (no ve la tarjeta) | No | Sin acceso |
| Configuración → Vehículos | Sí | Sí | Solo vehículos asignados a pilotos de su región: modifica; elimina si no los usa otra región; no agrega (los registra desde Usuarios) | No | No | Sin acceso |
| Botones del pie | Sí | Sí | Sí | Sí | Sí | Ocultos |

**Aprobaciones:** los usuarios que crea un Admin G3 no pueden iniciar sesión hasta que los aprueba un Admin G2 de la región, un Admin G1 o el Administrador (botón naranja "Revisar" en Usuarios; rechazar = eliminar). Lo que crea o cambia un Empleado en Clientes lo aprueban G3 (su tienda), G2 (su región), G1 o el Administrador.

> En la fase de pruebas estas reglas las aplica la página. En la Fase 7 pasan a reglas reales de la base de datos (Supabase Auth + RLS).

- La **tienda no es un rol**: es el lugar al que pertenecen los empleados y los pilotos.
- El **usuario compuesto** permite repetir el mismo nombre en tiendas distintas. Se guarda siempre en minúsculas.
- Los **pilotos son usuarios** con rol `piloto`: ya no existe una tabla `conductores` aparte. Cuando se definan los datos propios del piloto (licencia, vehículo, estado, etc.) se agregarán en una tabla enlazada a `usuarios`.

### 13.2 Código de tienda

Cada tienda tiene un código **REGIÓN + NÚMERO** que indica de qué parte del país es:

```
NOR-001   →  región NOR (Norte), tienda 001
CEN-004   →  región CEN (Central), tienda 004
```

La base de datos valida el formato (`AAA-000`) y que las 3 letras coincidan con la región de la tienda.

### 13.3 Tablas

```sql
-- ===== YA CREADAS (scripts sql/01 a sql/12) =====

create table public.regiones (
    codigo  text primary key,          -- 3 letras, ej. NOR
    nombre  text not null              -- ej. Norte
);

create table public.tiendas (
    id         bigint generated always as identity primary key,
    codigo     text not null unique,   -- REGIÓN-NÚMERO, ej. NOR-001
    region     text not null references public.regiones(codigo),
    nombre     text not null,
    direccion  text,
    telefono   text,
    estado     text not null default 'activa',   -- activa | inactiva
    creado_en  timestamptz not null default now()
);

create table public.usuarios (
    id          bigint generated always as identity primary key,
    nombre      text not null,
    id_usuario  text not null unique,  -- usuario de login (compuesto para tienda/piloto)
    telefono    text,
    clave       text not null,         -- ⚠ texto plano en fase de pruebas (ver Fase 7)
    permisos    text[] not null default '{}',
    rol         text not null,         -- administrador | admin_g1 | admin_g2 | admin_g3 | empleado | piloto
    tienda_id   bigint references public.tiendas(id),  -- obligatorio para admin_g3, empleado y piloto
    aprobado    boolean not null default true,         -- false = creado por un Admin G3, sin aprobar (no puede entrar)
    solicitado_por bigint references public.usuarios(id),
    solicitado_en  timestamptz,
    region      text references public.regiones(codigo), -- obligatorio para admin_g2
    vehiculo_id bigint references public.vehiculos(id),  -- solo pilotos (opcional)
    foto_url    text,                  -- enlace a la foto en Supabase Storage (bucket "avatares")
    creado_en   timestamptz not null default now()
);

create table public.vehiculos (         -- de uso general de la empresa
    id         bigint generated always as identity primary key,
    placa      text not null unique,    -- MAYÚSCULAS sin espacios, ej. P123ABC
    marca      text not null,           -- ej. Toyota
    estado     text not null default 'disponible',  -- disponible | en_uso | mantenimiento
    creado_en  timestamptz not null default now()
);

-- Además (ver sección 24):
--   - Storage: bucket "avatares" (fotos de usuario, máx. 2 MB, JPG/PNG/WEBP)
--   - Función cambiar_codigo_tienda(id, nuevo_codigo): cambia el código de una
--     tienda y renombra a sus usuarios en una sola operación
--   - Regla (trigger) usuarios_proteger_admin: el usuario "admin" no se puede
--     eliminar ni cambiarle el usuario o el rol

create table public.clientes (          -- base de datos compartida (sql/09)
    id                  bigint generated always as identity primary key,
    nombre              text not null,
    apellidos           text not null,
    telefono            text not null,
    direccion           text,
    ubicacion           text,        -- referencia o enlace de mapas (WhatsApp más adelante)
    aprobado            boolean not null default true,  -- false = nuevo creado por Empleado, sin aprobar
    cambios_pendientes  jsonb,       -- cambios propuestos por un Empleado, sin aplicar
    solicitado_por      bigint references public.usuarios(id),
    solicitado_en       timestamptz,
    creado_en           timestamptz not null default now()
);

create table public.clientes_tiendas (  -- un cliente puede estar en varias tiendas
    cliente_id  bigint references public.clientes(id),
    tienda_id   bigint references public.tiendas(id),
    primary key (cliente_id, tienda_id)
);

-- ----- Configuración: módulo Horarios (sql/12) -----
-- MARCA = registro de horario que el piloto debe hacer en el día.

create table public.configuracion (     -- valores generales (clave -> valor)
    clave           text primary key,   -- ej. 'cantidad_marcas' (5), 'pedidos_por_marca' (5)
    valor           jsonb not null,
    actualizado_en  timestamptz not null default now()
);

create table public.marcas_horario (     -- horas predeterminadas de cada marca
    numero        smallint primary key, -- 1, 2, 3...
    inicio_desde  time not null,        -- ventana para iniciar: desde...
    inicio_hasta  time not null,        -- ...hasta   (ej. 07:00 a 07:30)
    fin           time not null         -- hora en que termina (ej. 09:00)
);

create table public.capacidad_marcas (   -- pedidos por marca distintos para una región o tienda
    id                 bigint generated always as identity primary key,
    region             text references public.regiones(codigo),
    tienda_id          bigint references public.tiendas(id),
    pedidos_por_marca  integer not null  -- prioridad: tienda > región > base
);

-- ----- Horario por día de la semana (sql/13) -----
-- Un día con fila en horario_dias usa SUS marcas; si no, la base.
create table public.horario_dias (       -- días preajustados distinto a la base
    dia              smallint primary key, -- 1 = lunes ... 7 = domingo
    cantidad_marcas  smallint not null     -- 0 = sin marcas ese día
);

create table public.marcas_dia (         -- horas de las marcas de esos días
    dia           smallint references public.horario_dias(dia) on delete cascade,
    numero        smallint,
    inicio_desde  time not null,
    inicio_hasta  time not null,
    fin           time not null,
    primary key (dia, numero)
);
-- Función marcas_del_dia(fecha): marcas que aplican a una fecha (propias o base)

-- ===== PENDIENTES =====
-- (Fase 2) calificaciones de clientes: 1 a 5 por pedido -> categoría del
-- cliente según el promedio: A ≥ 4.5, B ≥ 3.5, C ≥ 2.5, D < 2.5, sin
-- calificaciones = "Nuevo". Qué permite o bloquea cada categoría: por definir.

-- ⚠ BORRADOR ANTIGUO: pedidos, eventos_pedido y entregas se rediseñaron
-- en la SECCIÓN 31 (pedidos por actividad). Usar esa como referencia.
create table public.pedidos (
    id                       bigint generated always as identity primary key,
    numero_pedido            text not null unique,
    tienda_id                bigint references public.tiendas(id),
    cliente                  text,
    direccion                text,
    telefono                 text,
    fecha                    date not null default current_date,
    hora_llegada_programada  time,
    hora_retiro_programada   time,
    hora_entrega_programada  time,
    estado                   text not null default 'CREADO',
    qr                       text unique,
    creado_en                timestamptz not null default now()
);

create table public.eventos_pedido (
    id          bigint generated always as identity primary key,
    pedido_id   bigint references public.pedidos(id),
    tipo_evento text not null,
    fecha_hora  timestamptz not null default now(),
    usuario_id  bigint references public.usuarios(id),
    ubicacion   text
);

create table public.solicitudes_transporte (
    id            bigint generated always as identity primary key,
    tienda_id     bigint references public.tiendas(id),
    fecha         date not null,
    hora          time not null,
    origen        text,
    destino       text,
    descripcion   text,
    estado        text not null default 'PENDIENTE',
    piloto_id     bigint references public.usuarios(id),   -- usuario con rol 'piloto'
    vehiculo_id   bigint references public.vehiculos(id)
);

create table public.entregas (
    id            bigint generated always as identity primary key,
    pedido_id     bigint references public.pedidos(id),
    piloto_id     bigint references public.usuarios(id),   -- usuario con rol 'piloto'
    fecha_hora    timestamptz not null default now(),
    recibido_por  text,
    firma_url     text,
    foto_url      text,
    ubicacion     text,
    observaciones text
);
```

---

## 14. Historial de eventos y métricas

Cada acción importante genera un registro en `eventos_pedido`, lo que permite calcular:
- Tiempo promedio de preparación
- Tiempo de espera para retiro
- Tiempo de transporte
- Pedidos atrasados
- Porcentaje de entregas a tiempo
- Rendimiento por tienda
- Rendimiento por conductor
- Cantidad de pedidos diarios

Estas métricas se resuelven con consultas SQL (vistas o funciones en Supabase) y se muestran en el panel administrativo con gráficos. **Pendiente:** el proyecto todavía no tiene gráficos; hay que elegir una librería (ej. Chart.js) cuando se construya la Fase 6.

---

## 15. Arquitectura

```
Aplicación Web + Aplicación Web móvil (conductor) → Supabase (API + Auth + PostgreSQL + Storage)
```

**Tecnologías en uso:**
- Frontend web: HTML + CSS + JavaScript sin frameworks (ya construido: marco del panel, carga dinámica de secciones, login, usuarios con roles y fotos, perfil, tiendas). Ver Parte II.
- Base de datos y backend: **Supabase** (PostgreSQL + API REST/Realtime automática + Authentication + Storage para archivos)
- Código QR: librerías JS (`qrcode.js` para generar, `jsQR` para leer)
- Autenticación: tabla `usuarios` en fase de pruebas → migrar a Supabase Auth antes de producción
- Aplicación móvil futura: página web responsive primero; evaluar Flutter o React Native más adelante si se necesita acceso nativo al dispositivo

**Nota sobre el backend original propuesto (Python + FastAPI):** no es necesario para arrancar, porque Supabase ya cubre la capa de API, autenticación y base de datos. Se deja como opción futura únicamente para lógica que no pueda resolverse desde el navegador (validaciones complejas de QR, integraciones externas, procesos pesados de reportes).

---

## 16. Desarrollo por fases

- **FASE 0 (completada):** estructura visual del panel, grid responsive, carga dinámica de secciones, header/footer, login de prueba contra la tabla `usuarios`.
- **FASE 1 (en curso):**
  - ✅ Usuarios con roles (Administrador, Admin G1, Admin G2, Empleado, Piloto), foto de perfil y sección "Mi perfil".
  - ✅ Regiones y tiendas (código REGIÓN-NÚMERO), sección Tiendas agrupada por región.
  - ✅ Tabla `vehiculos` (marca y placa) y vehículo asignado a cada piloto desde la sección Usuarios.
  - ✅ Módulo **Configuración → Vehículos** (Administrador y Admin G1; Admin G2 los de pilotos de su región): listarlos, agregarlos, modificarlos (placa, marca, estado) y eliminarlos; resumen por estado y pilotos asignados.
  - (Ya no se crea la tabla `conductores`: los pilotos son usuarios con rol `piloto`.)
- **FASE 2 – Gestión de pedidos:** crear pedidos, asignar horarios, listar con indicador de color (verde/amarillo/rojo), cambiar estados e historial en `eventos_pedido`.
- **FASE 3 – QR:** generar QR por pedido, pantalla de escaneo, registrar retiro y salida.
- **FASE 4 – Entrega:** estado en camino, llegada, confirmación de entrega (firma/foto vía Supabase Storage), registro de incidencias.
- **FASE 5 – Transporte:** solicitud, asignación de conductor y vehículo, estados.
- **FASE 6 – Administración:** dashboard, reportes, estadísticas, filtros e historial completo.
- **FASE 7 – Seguridad para producción:** migrar `usuarios` a Supabase Auth (o cifrar contraseñas), cerrar las políticas RLS temporales y definir reglas reales por rol (`administrador`, `admin_g1`, `admin_g2`, `empleado`, `piloto`). Detalle en la sección 27. **Obligatoria antes de publicar el sistema o usarlo con datos reales.**

---

## 17. Recomendación para iniciar el proyecto

No se recomienda programar todo el sistema de una sola vez. Primero se define el mapa de pantallas y el flujo de usuarios, luego se diseña la base de datos, y finalmente se desarrolla cada módulo.

El primer prototipo recomendado es:
**Tienda → Crear pedido → Asignar horarios → Guardar pedido → Visualizar pedido.**
Una vez funcionando, se agregan QR, conductor, entrega y transporte.

**Mapa de pantallas → archivos del proyecto:**

Cada pantalla es una sección con el mismo nombre en `secciones/`, `css/secciones/` y `js/secciones/`, y se abre con `index.html#<nombre>` (ver sección 22).

| Pantalla | Sección (`#nombre`) | Tabla(s) | Estado |
|---|---|---|---|
| Login | `loggin` | `usuarios` | ✅ Hecha |
| Inicio | `inicio` | — | ⬜ Vacía (por definir) |
| Mi perfil | `perfil` | `usuarios` + Storage | ✅ Hecha |
| Usuarios | `usuarios` | `usuarios`, `tiendas`, `regiones` | ✅ Hecha |
| Tiendas | `tiendas` | `tiendas`, `regiones` | ✅ Hecha |
| Gestión de pedidos | `pedidos` | `pedidos`, `pedido_articulos`, `pedido_historial`... (sección 31) | ✅ Hecha (lista, registrar, detalle, QR, estados) |
| Línea de tiempo de un pedido | `pedidos?id=N` (detalle) | `pedido_historial` | ✅ Hecha |
| Pilotos | `pilotos` | `usuarios` (rol piloto), `vehiculos` | 🟡 Lista hecha; funciones por definir |
| Clientes (se abre desde Tiendas) | `clientes` | `clientes`, `clientes_tiendas` | 🟡 Hecha; calificación y categoría con Pedidos |
| Rutas y asignaciones | `rutas` | `rutas`, `rutas_pilotos` (sql/17) | ✅ Hecha: rutas por tienda y pilotos por día o semana (calendario semanal) |
| Transporte (solicitudes) | por definir | `solicitudes_transporte`, `vehiculos` | ⬜ Fase 5 |
| Reportes / Panel administrativo | `reportes` | todas (consultas agregadas) | ⬜ Fase 6 |
| Configuración | `configuracion` | `configuracion`, `marcas_horario`, `capacidad_marcas`, `horario_dias`, `marcas_dia` | 🟡 Módulo Horarios hecho; más módulos después |
| App del conductor | proyecto/página aparte | `pedidos`, `entregas`, `eventos_pedido` | ⬜ Futuro |

> Los nombres `#pedidos`, `#pilotos`, `#rutas`, `#reportes` y `#configuracion` ya existen en el menú lateral de `index.html`.

---

## 18. Visión final del sistema

El objetivo final es contar con una plataforma que permita saber en tiempo real qué pedidos están pendientes, cuáles están listos, quién los retiró, cuándo salieron, dónde deben entregarse, si fueron entregados y qué solicitudes de transporte están pendientes.

---
---

# PARTE II — GUÍA TÉCNICA DE LO CONSTRUIDO

---

## 19. Estado actual

| Área | Qué hay | Detalle |
|---|---|---|
| Marco del panel | Encabezado (logo animado, título, fecha/hora, usuario), menú lateral y pie con botones de acceso rápido | `index.html` + `css/index.css` |
| Navegación | `index.html` es la **única página**; cada pantalla se carga dentro de `.cuerpo-principal` sin recargar | sección 22 |
| Login | Valida contra la tabla `usuarios` de Supabase; guarda la sesión con rol, tienda y región | `secciones/loggin.html` |
| Usuarios | Listar, buscar y **filtrar por región, tienda y rol**; crear, modificar y eliminar; roles, tienda/región, usuario compuesto, foto y vehículo del piloto | `secciones/usuarios.html` |
| Mi perfil | Cada usuario ve sus datos (y el piloto su vehículo) y cambia o quita su foto | `secciones/perfil.html` |
| Vehículos | Marca, placa y estado. Se administran en **Configuración → Vehículos** (Administrador y Admin G1; Admin G2 solo los asignados a pilotos de su región: resumen por estado, búsqueda, agregar/modificar/eliminar, pilotos asignados). Se asignan a los pilotos desde Usuarios (ahí también se puede registrar uno nuevo) | tabla `vehiculos`, `secciones/configuracion.html` |
| Pilotos | Todos los usuarios con rol Piloto aparecen solos, agrupados por tienda, con foto, usuario, teléfono y vehículo. Columna "Funciones" = "Por definir". Solo lectura (se modifican en Usuarios). El Admin G2 solo ve su región | `secciones/pilotos.html` |
| Clientes | Base de datos compartida; un cliente puede estar en varias tiendas. Se abre desde Tiendas ("Agregar clientes" o el botón de cada tienda). Lo que crea o cambia un Empleado queda pendiente de aprobación | `secciones/clientes.html` |
| Tiendas | Agrupadas por región; crear, modificar (incluido el código) y eliminar según el rol | `secciones/tiendas.html` |
| Inicio | 4 secciones (cuadrícula 2 columnas × 2 filas). **Sección 1:** resumen de los pedidos de hoy según el rol (Piloto los suyos, Empleado/G3 su tienda, G2 su región, Admin/G1 todos): total, pendientes, en ruta, entregados, no entregados/cancelados. Secciones 2, 3 y 4 vacías | `secciones/inicio.html` |
| Configuración | Al entrar se ven **tarjetas de módulos**; cada uno se abre al presionarlo (`#configuracion?modulo=nombre`) y tiene "← Configuración" para volver. Cada rol solo ve las tarjetas que puede usar. Módulo **Horarios** (Administrador y Admin G1; Admin G2 solo los pedidos por marca de su región): cantidad de marcas del piloto (base 5), pedidos máximos por marca (base 5), horas de cada marca, **horario por día** (un día puede quedar preajustado con su propia cantidad de marcas y horas, ej. domingo 1 marca o 0 = sin marcas; se puede copiar a otros días; "Volver a la base" lo quita) y ajustes por región o tienda. Módulo **Pedidos** (`js/secciones/configuracion/pedidos.js`, archivo aparte que se descarga al abrir la tarjeta): actividades y tiendas que las ofrecen, tarifas (con ejemplo del cálculo), descuentos, categorías de mercadería, tamaños de bulto, motivos de retraso y código de respaldo; Admin G2 solo tarifas y descuentos de su región. Módulo **Vehículos** (Administrador y Admin G1; Admin G2 los de pilotos de su región): resumen por estado, búsqueda, agregar/modificar/eliminar y pilotos asignados | `secciones/configuracion.html` |
| Pedidos | 3 vistas en `#pedidos`: **lista** (filtros por fecha, tienda, actividad y estado; resumen por estado; búsqueda), **registrar** (`?nuevo=1`: el formulario cambia según la actividad; bultos o casillas de mercadería con artículos del catálogo y su peso; cálculo del envío con la tarifa, envío gratis, descuento, lo que cobra el piloto y el vuelto; número manual si la empresa lo usa) y **detalle** (`?id=N`: datos, mercadería, cobro, entrega, línea de tiempo, QR y acciones según el estado). QR como imagen (descargar, compartir, WhatsApp). Los pedidos no se borran: se cancelan o se anulan | `secciones/pedidos.html` (sección 31) |
| Reportes | Filtros en cascada (región → tienda → cliente / empleado / piloto) + fechas con atajos + actividad; tarjetas de resumen, récord del cliente o rendimiento del empleado/piloto, 5 gráficas (Chart.js) con su tabla "Ver datos", tabla detallada ordenable y paginada. Exporta a **Excel** (SheetJS) y **PDF** (jsPDF) lo que se ve. G3 solo ve su tienda (no exporta); G2 su región; Admin/G1 todo. Botón del pie "Generar reporte" | `secciones/reportes.html` (sección 31.11) |
| Notificaciones | Campana en el encabezado con número de no leídas, lista y avisos emergentes (pendientes, aprobados, rechazados) | `js/notificaciones.js` (sección 26.1) |
| Seguridad | **Modo rápido de pruebas** (ver sección 27) | — |

Botones del pie (`js/pagina_inicial.js`, "Botones del pie"; ocultos por rol en `css/index.css`):

| Botón | Qué hace | Quién lo ve |
|---|---|---|
| Crear Pedido | Abre `#pedidos?nuevo=1` | Todos menos Piloto |
| Asignar Piloto | Abre **Rutas y asignaciones** (pilotos por ruta, día o semana) | Admin, G1, G2 |
| Reasignar horario | Lista de pedidos pendientes (`#pedidos?accion=reasignar`); cada fila tiene un botón que abre la ventana: G2+ reasigna, G3 y Empleado solicitan | Todos menos Piloto |
| Cancelar pedido (antes "Eliminar pedido") | Lista de pedidos pendientes (`#pedidos?accion=cancelar`); el botón de la fila abre "Cancelar" con motivo. Los pedidos no se borran | Admin, G1, G2, G3 |
| Generar reporte | Abre **Reportes** (G3 solo ve; G2 o superior exporta) | Admin, G1, G2, G3 |
| Cargar Pedidos | Para compañías que reciben pedidos desde otra web o app y los cargan aquí. **Todavía sin función**. Color verde azulado `#0E6B63` | Solo G2 y G3 |

---

## 20. Cómo abrir y probar el proyecto

1. Abrir la carpeta del proyecto en VS Code.
2. Abrir **`index.html`** con la extensión **Live Server** (clic derecho → "Open with Live Server").
   - Siempre `index.html`, aunque se esté editando otra sección.
   - Si se abre un archivo de `secciones/` directamente, redirige solo a `index.html`.
   - **No funciona con doble clic** (`file://`): el navegador bloquea la carga de las secciones.
3. Iniciar sesión:
   - Administrador: usuario `admin`.
   - Empleados y pilotos: usuario compuesto, ej. `cen-001-inavarro`.
   - Administradores G1 y G2: usuario simple, ej. `jvalverde`.
4. Si se cambian los roles en la base de datos, **cerrar sesión y volver a entrar** para que la sesión tome los datos nuevos.

> ⚠ La clave del usuario `admin` todavía es la de ejemplo que aparece en `sql/01_crear_tabla_usuarios.sql`. Cambiarla desde la sección Usuarios.

---

## 21. Estructura de archivos

```
index.html                 Única página: marco del panel + lugar donde se cargan las secciones
PROPUESTA-ESTRUCTURADA-V2.md   Este documento

css/
├─ variables.css           Colores, fuentes y medidas con nombre (--color-naranja, --radio...)
├─ base.css                Reinicio, fuente general, regla [hidden]
├─ animaciones.css         @keyframes compartidos (aparecerBajando, abrirDialogo, fundido, latir, sacudir)
├─ componentes.css         Piezas reutilizables (botones, tablas, formularios, ventanas...) — sección 23
├─ index.css               Marco del index: encabezado, menú lateral, pie
└─ secciones/              CSS propio de cada sección (loggin, inicio, usuarios, perfil, tiendas, pilotos)

js/
├─ sesion.js               Sesión del usuario y funciones de rol/permisos (se carga primero)
├─ supabase.js             Conexión con la base de datos (objeto "db")
├─ avatar.js               Fotos de usuario: validar, achicar, subir, quitar y mostrar
├─ componentes.js          Funciones para avisos, celdas, botones y búsquedas en tablas
├─ notificaciones.js       Campana de notificaciones: enviar, mostrar, avisos emergentes
├─ permisos.js             Bloquea el menú y pinta el usuario del encabezado según la sesión
├─ date.js                 Fecha y hora del encabezado
├─ menu-usuario.js         Menú desplegable del usuario (Mi perfil, Cerrar sesión)
├─ menu-animado.js         Entrada en cascada del menú lateral
├─ pagina_inicial.js       Cargador de secciones (va al final)
└─ secciones/              Lógica de cada sección (loggin, usuarios, perfil, tiendas, pilotos)

secciones/                 HTML de cada sección (solo contenido, sin <html>/<head>/<body>)
sql/                       Scripts de la base de datos, numerados en orden (sección 24)
img/                       Logos e iconos
```

---

## 22. Cómo funciona la navegación y cómo agregar una sección

### 22.1 Carga de secciones

- Cada opción del menú tiene un enlace con `#`, ej. `href="#tiendas"`.
- Al hacer clic, `js/pagina_inicial.js` busca y muestra dentro de `.cuerpo-principal`:
  - `secciones/tiendas.html` → el contenido (obligatorio)
  - `css/secciones/tiendas.css` → sus estilos (opcional; solo se aplica mientras se ve la sección)
  - `js/secciones/tiendas.js` → su lógica (opcional)
- Cada archivo se descarga **una sola vez**; al pasar el mouse por el menú se precarga.
- Sin sesión, siempre se muestra el login, sin importar el `#`.
- Si una sección no tiene `.css` o `.js`, la consola del navegador muestra un aviso 404 la primera vez. Es normal.

### 22.2 Pasos para crear una sección nueva (ej. "vehiculos")

1. **Menú:** en `index.html` agregar
   `<li class="menu-item"><a href="#vehiculos"><i class="bi bi-truck"></i> Vehículos</a></li>`
2. **HTML:** crear `secciones/vehiculos.html` con **solo el contenido**. Primera línea obligatoria (redirige a `index.html` si alguien abre el archivo directamente):
   ```html
   <script>if (!document.querySelector('.cuerpo-principal')) location.replace('../index.html');</script>
   ```
3. **Estilos:** usar primero las clases de `css/componentes.css` (sección 23). Solo lo que sea propio de la sección va en `css/secciones/vehiculos.css`, con clases que empiecen por un prefijo propio (ej. `veh-`).
4. **Lógica:** crear `js/secciones/vehiculos.js` con esta forma:
   ```js
   registrarSeccion('vehiculos', (zona) => {
       // zona = el div donde se mostró la sección.
       // Buscar elementos con zona.querySelector(...) y agregar los eventos aquí.

       // (Opcional) devolver una función que se ejecuta al salir de la sección
       return () => { /* ej. detener un setInterval */ };
   });
   ```
   El archivo se descarga una vez; la función se ejecuta **cada vez** que se muestra la sección.
5. **Base de datos:** si necesita tabla nueva, crear el siguiente script numerado en `sql/` (ej. `10_pedidos.sql`) y ejecutarlo en Supabase.
   - **(Opcional) Parámetros:** una sección puede recibir datos en el `#`, ej. `#clientes?tienda=3`; se leen con `parametrosSeccion().get('tienda')`.
   - **(Opcional) Sección fuera del menú:** si se abre desde otra (como Clientes desde Tiendas), agregarla a `SECCION_DEL_MENU` en `js/pagina_inicial.js` para que se resalte la sección "madre".
6. **Permisos:** decidir qué puede hacer cada rol y agregarlo a la tabla de la sección 13.1.

---

## 23. Organización del CSS y componentes reutilizables

### 23.1 Dónde va cada cosa

| Archivo | Contenido |
|---|---|
| `variables.css` | Colores, fuentes, bordes y sombras con nombre. **Para cambiar un color de la marca en todo el sistema, se cambia solo aquí.** |
| `base.css` | Reglas generales (tamaños, fuente base) |
| `animaciones.css` | Solo `@keyframes` que usan varias partes |
| `componentes.css` | Piezas que usan varias secciones (estructura, texto y animación juntos) |
| `index.css` | Todo lo del marco de `index.html` |
| `secciones/<nombre>.css` | **Todo** lo propio de una sección (estructura, textos y animaciones) |

Orden de carga: variables → base → animaciones → componentes → index → secciones. Si una regla se repite, gana la que se carga después.

**Regla del equipo:** si una pieza se repite en 2 o más secciones, se mueve a `componentes.css` (y su lógica a `js/componentes.js`).

### 23.2 Clases disponibles en `componentes.css`

| Pieza | Clases |
|---|---|
| Página | `pagina`, `pagina-cabecera`, `pagina-titulo`, `pagina-subtitulo`, `pagina-acciones` |
| Tarjeta | `tarjeta` |
| Buscador | `buscador`, `buscador-input` |
| Filtros | `filtros` (fila), `filtro` (selector, se usa junto con `campo-input`) |
| Resumen por estado | `resumen`, `resumen-item` (+ `resumen-verde` / `-azul` / `-naranja` / `-turquesa` / `-rosada` / `-gris`; `.activo` = filtro elegido), `resumen-numero`, `resumen-texto`. Lo usan Vehículos y Pedidos |
| Botones | `boton` + `boton-principal` (naranja) / `boton-secundario` (blanco) / `boton-peligro` (rojo); `boton-chico` |
| Botones de icono | `boton-icono` + `boton-icono-editar` / `-eliminar` / `-revisar` (naranja, aprobar solicitudes) / `-ver` |
| Avisos | `aviso` (el JS le pone `visible ok` o `visible error`) |
| Tabla | `tabla-caja`, `tabla`, `tabla-col-acciones`, `tabla-botones`, `tabla-vacio` |
| Tabla agrupada | `tabla-grupo`, `tabla-grupo-codigo`, `tabla-grupo-cuenta` (título de cada grupo; un `<tbody>` por grupo) |
| Etiquetas | `etiqueta` + `etiqueta-naranja` / `-azul` / `-verde` / `-morada` / `-turquesa` / `-rosada` / `-gris` |
| Avatar | `avatar` + `avatar-chico` / `avatar-mediano` / `avatar-grande` |
| Formularios | `campos` (2 columnas), `campo`, `campo-ancho`, `campo-etiqueta`, `campo-input`, `campo-ayuda`, `form-error` |
| Ventanas | `dialogo`, `dialogo-chico`, `dialogo-form`, `dialogo-titulo`, `dialogo-texto`, `dialogo-botones` |
| Texto | `texto-codigo` (letra de ancho fijo para usuarios y códigos), `celda-detalle` (segunda línea pequeña dentro de una celda) |

Ejemplo: `<button class="boton boton-principal">Guardar</button>`

### 23.3 Funciones JavaScript compartidas

| Archivo | Funciones |
|---|---|
| `js/sesion.js` | `obtenerSesion()`, `guardarSesion()`, `cerrarSesion()`, `tienePermiso(seccion)`, `rolActual()`, `esAdministrador()`, `esAdminG1()`, `esAdminG2()`, `esAdminG3()`, `regionActual()`, `tiendaActual()`; configuración `SECCIONES_LIBRES`, `SECCIONES_POR_ROL`, `SECCIONES_BLOQUEADAS_POR_ROL`, `USAR_PERMISOS` |
| `js/componentes.js` | `crearAviso(elemento)`, `crearCelda()`, `crearCeldaEtiqueta()`, `crearBotonIcono()`, `crearCeldaAcciones()`, `crearFilaVacia()`, `crearFilaGrupo()`, `coincideBusqueda()`, `plural()` |
| `js/avatar.js` | `validarFoto()`, `subirFotoUsuario()`, `quitarFotoUsuario()`, `borrarArchivoFoto()`, `pintarAvatar()` |
| `js/notificaciones.js` | `notificarPendiente()`, `notificarResultado()`, `resolverPendientes()`, `refrescarNotificaciones()`, `iniciarNotificaciones()`, `detenerNotificaciones()` |
| `js/pagina_inicial.js` | `registrarSeccion()`, `irA(seccion)`, `mostrarSeccionActual()`, `parametrosSeccion()`, `nombreSeccionDeHash()`; configuración `SECCION_DEL_MENU` |
| `js/permisos.js` | `aplicarPermisos()` (vuelve a pintar menú y encabezado) |
| `js/supabase.js` | objeto `db` para consultar la base de datos, ej. `await db.from('tiendas').select('*')` |

---

## 24. Base de datos: scripts SQL

### 24.1 Scripts (desde el 2026-09-30 son solo dos)

Supabase → proyecto → **SQL Editor → New query** → pegar el archivo completo → **Run**.

| Script | Qué hace | Cuándo |
|---|---|---|
| `00_instalacion_completa.sql` | **Toda** la base en blanco, en 11 secciones, ya en su versión final (por ejemplo, los roles de administración en una sola regla). Sin tiendas, usuarios (solo `admin`), clientes ni pedidos | Una vez, en un proyecto **nuevo** |
| `01_actualizacion_base_existente.sql` | Pone al día una base en uso: funciones (admin protegido, cambiar código de tienda, horarios del día, número y código de respaldo, validar código, vehículo en uso), rutas y multitienda, tipo de vehículo, qué usa cada actividad y categorías de encomiendas. Se puede repetir sin error | En la base actual |

- Los 21 scripts anteriores (`01_crear_tabla_usuarios` ... `21_actividades_funciones`) **se eliminaron**:
  su contenido quedó dentro de estos dos. Las menciones a ellos en el resto de este documento son históricas.
- Un cambio de estructura **no crea archivos nuevos**: se agrega en su sección de `00` y como bloque al
  final de `01`. Ver `docs/05-base-de-datos.md`.
- No se crean ni modifican columnas a mano en el Table Editor.

### 24.2 Reglas que hace cumplir la base de datos

- `id_usuario` y el código de tienda no se pueden repetir.
- Código de tienda con formato `AAA-000` y las 3 letras iguales a su región.
- Tienda / región según el rol (sección 13.1).
- No se puede eliminar una tienda con usuarios ni una región con tiendas o Admin G2.
- El usuario `admin` está protegido (script 03).

### 24.3 Conexión

- `js/supabase.js` tiene la **URL del proyecto** y la clave **`anon` (pública)**. Esa clave está hecha para ir en la página.
- **Nunca** poner en la página ni compartir la clave **`service_role`**: da control total de la base de datos.
- Las regiones se agregan en Supabase → Table Editor → `regiones` (código de 3 letras mayúsculas + nombre). La web las toma sola.

---

## 25. Usuarios, sesión y permisos

### 25.1 Usuario compuesto

- **Empleado y Piloto:** `<código de tienda en minúsculas>-<usuario>` → `cen-001-inavarro`. En el formulario solo se escribe `inavarro`; el prefijo lo agrega el sistema.
- **Admin G3:** también usuario compuesto, porque pertenece a una tienda → `cen-001-mlopez`.
- **Administrador, Admin G1 y Admin G2:** usuario simple → `jvalverde`.
- Todo se guarda en minúsculas; en el login no importa si se escribe con mayúsculas.
- **Vehículo del piloto:** en el formulario de Usuarios, al elegir el rol Piloto aparece "Vehículo asignado". Se elige uno de la lista o "Registrar vehículo nuevo..." (marca + placa). La placa se guarda en mayúsculas y sin espacios (`p 123 abc` → `P123ABC`) y no se puede repetir. Un vehículo puede estar asignado a varios pilotos. Solo los pilotos pueden tener vehículo.
- Si se cambia la tienda de un empleado, su prefijo cambia solo. Si el Administrador cambia el código de una tienda, todos sus usuarios se renombran solos (y deben entrar con el usuario nuevo).

### 25.2 Sesión

Al iniciar sesión se guarda en el navegador (`sessionStorage`, se borra al cerrar la pestaña):
`{ id, usuario, nombre, rol, tienda, region, permisos, foto_url }` — **nunca la clave**.

### 25.3 Reglas de la página

- Solo el **Administrador** asigna roles de administración (Administrador, Admin G1, Admin G2).
- Nadie puede cambiar su propio rol ni eliminarse a sí mismo.
- **Acceso al menú por rol** (`SECCIONES_POR_ROL` en `js/sesion.js`): si un rol aparece ahí, solo puede abrir esas secciones; el resto le aparece con candado y, si escribe el `#` a mano, ve "No tienes permiso". Hoy está restringido el **Piloto** (`inicio` y `pedidos`). Para restringir otro rol se agrega una línea, ej. `empleado: ['pedidos']`.
- **Secciones bloqueadas por rol** (`SECCIONES_BLOQUEADAS_POR_ROL` en `js/sesion.js`): lo contrario, el rol puede abrir todo **menos** esas secciones. Hoy: **Empleado** sin acceso a `usuarios`, `pilotos` ni `reportes`.
- `USAR_PERMISOS = false` en `js/sesion.js`: para los roles que no están en `SECCIONES_POR_ROL`, todas las opciones del menú están abiertas. Lo que cambia por rol son las **acciones dentro de cada sección** (tabla de la sección 13.1).
- "Inicio" y "Mi perfil" están siempre permitidas para todos (`SECCIONES_LIBRES`).
- Cuando se active (`true`), la columna `permisos` de cada usuario define qué secciones puede abrir (`{pedidos,rutas}`; `{*}` = todas). "inicio" y "perfil" siempre están permitidas.

---

## 26. Fotos de usuario

- Se guardan en **Supabase Storage**, bucket `avatares`, como `usuarios/<id>.jpg`. La tabla solo guarda el enlace (`foto_url`).
- Se aceptan JPG, PNG o WEBP de **hasta 2 MB**. El navegador las recorta en cuadrado y las achica a **256×256 px** antes de subirlas (quedan en 20–40 KB).
- Cada usuario cambia o quita la suya en **Mi perfil**; el Administrador (y los Admin G según su alcance) desde **Usuarios**.
- Al eliminar un usuario se borra también su foto. Sin foto, se muestran sus iniciales.

### 26.1 Notificaciones

- **Dónde:** campana junto al usuario, en el encabezado. El número rojo cuenta las no leídas. Al hacer clic se abre la lista (últimas 30); al hacer clic en una, se marca como leída y lleva a su sección. "Marcar todas como leídas" limpia el contador.
- **Aviso emergente:** en la esquina inferior derecha, cuando llega una nueva, y al entrar si hay sin leer. Desaparece a los 6 segundos; al hacer clic lleva a su sección.
- **Rapidez:** se revisa cada minuto y al cambiar de sección (`NOTI_INTERVALO` en `js/notificaciones.js`).
- **Quién recibe qué:**

| Situación | Tipo | Quién la recibe |
|---|---|---|
| Admin G3 crea un empleado | Pendiente | Administrador, Admin G1, Admin G2 de la región |
| Empleado crea o modifica un cliente (solicitud de tienda) | Pendiente | **Solo el Admin G3 de la tienda** (si la tienda no tiene G3: el Admin G2 de la región). Así no se llena de avisos a los admins principales; G1 y el Administrador igual pueden aprobar desde Clientes |
| Se aprueba la solicitud | Aprobado | Quien la pidió |
| Se rechaza la solicitud | Rechazado | Quien la pidió |

- Cuando alguien resuelve una solicitud (o elimina lo pendiente), los avisos "pendiente" de esa solicitud se marcan como leídos para todos los aprobadores.
- Nadie recibe notificaciones de lo que hace él mismo.
- **Agregar notificaciones en una sección nueva:** llamar a `notificarPendiente({...})` o `notificarResultado({...})` (ver ejemplos en `js/secciones/clientes.js`). Si enviar falla, la acción principal no se detiene.

---

## 27. Seguridad (IMPORTANTE)

### 27.1 Situación actual: modo rápido de pruebas

Se eligió a propósito para poder avanzar rápido. Mientras siga así:

- Las **claves se guardan sin cifrar** y cualquiera con la clave pública puede leerlas.
- Cualquiera que conozca la clave pública puede **leer, crear, modificar y borrar** usuarios, tiendas y fotos usando la API directamente, saltándose la página.
- Los permisos por rol (sección 13.1) **solo los aplica la página**; la base de datos todavía no sabe quién hace cada cambio.

➡ **No usar contraseñas reales ni publicar el sistema hasta completar la Fase 7.**

### 27.2 Qué hay que hacer en la Fase 7

1. Pasar el login a **Supabase Auth** (contraseñas cifradas que nadie puede leer).
2. Borrar la columna `clave` de `usuarios` y enlazar cada usuario con su cuenta de Auth.
3. Quitar las reglas "TEMPORAL" de los scripts y crear reglas **RLS reales por rol**, por ejemplo:
   - solo un administrador puede asignar roles de administración;
   - un Admin G2 solo ve y modifica usuarios de su región;
   - cada usuario solo cambia su propia foto.
4. Crear y eliminar cuentas desde una **Edge Function** de Supabase (no se puede hacer con la clave pública).
5. Ajustar la app del compañero para que use el mismo login.

---

## 28. Publicar en internet (GitHub Pages)

El proyecto es solo HTML, CSS y JavaScript, así que se puede publicar gratis:

1. Subir el proyecto a un repositorio de GitHub con `index.html` en la raíz.
2. Repositorio → **Settings → Pages** → *Deploy from a branch* → rama **main**, carpeta **/ (root)**.
3. En 1–2 minutos queda en `https://<usuario>.github.io/<repositorio>/`.

⚠ **Antes de publicar:**
- Completar la Fase 7 (sección 27). Publicado, **cualquier persona en internet** podría leer las claves y modificar los datos.
- Cambiar la clave de `admin`.
- Decidir si se sube la carpeta `sql/` (muestra la estructura de la base de datos y la clave de ejemplo).
- La página publicada siempre es pública, aunque el repositorio sea privado.

---

## 29. Convenciones del equipo

- **Todo el código comentado en español**: cada archivo con una cabecera que explica qué hace y dónde se usa, y cada bloque con cómo modificarlo.
- **Nombres:** archivos y clases en minúscula con guiones; clases propias de una sección con prefijo (`login-`, `usr-`, `prf-`, `tnd-`); ids con el mismo prefijo sin guion (`usrNombre`, `tndTabla`).
- **Base de datos:** tablas y columnas en `snake_case`, sin tildes ni espacios.
- **Colores:** usar las variables de `variables.css`, no códigos de color sueltos.
- **Una sección = tres archivos con el mismo nombre** (`secciones/`, `css/secciones/`, `js/secciones/`).
- **Textos que vienen de la base de datos** se muestran con `textContent` (nunca con `innerHTML`), para que un dato raro no se interprete como código.

---

## 30. Pendientes y decisiones abiertas

- [ ] Horarios: que el piloto registre sus marcas (Pedidos/Pilotos) y que Pedidos respete el máximo de pedidos por marca (tienda > región > base). Las marcas de cada fecha se obtienen con `marcas_del_dia(fecha)` (respeta el horario por día).
- [ ] Más módulos de Configuración (cada uno: tarjeta + `<section>` + entrada en `CFG_MODULOS` de `js/secciones/configuracion.js`).
- [ ] (Opcional) Notificaciones al instante con Supabase Realtime, y por WhatsApp o correo.
- [ ] Confirmar si se ejecutó el `sql/03` (protección del usuario `admin`).
- [ ] **Clientes (con Pedidos):** calificación 1–5 por pedido, categoría A/B/C/D y qué permite o bloquea cada categoría.
- [ ] Clientes: ubicación enviada por WhatsApp; aviso de cliente repetido (mismo teléfono) para asignarlo a otra tienda en vez de duplicarlo.
- [ ] Definir las **funciones de los pilotos** que se asignarán en la sección Pilotos (y quién las asigna).
- [ ] Cambiar la clave de `admin`.
- [ ] Reemplazar las regiones de ejemplo por las regiones reales del país.
- [ ] Funciones de los roles **Empleado** y **Piloto**.
- [x] Botones del pie: Crear Pedido, Cargar Pedidos (solo G2 y G3, sin función aún), Asignar Piloto, Reasignar horario, Cancelar pedido y Generar reporte (sección 19).
- [x] Sección **Inicio** (4 secciones, alcance según el rol): 1) pedidos de hoy con cuadros-filtro; 2) estadística de la semana (tiempos de despacho / en ruta / total y totales, iconos-filtro con globo); 3) ubicación de pilotos: mapa **pendiente** + lista de pilotos activos hoy; 4) actividad reciente de hoy con filtros región / tienda / ruta (se actualiza cada minuto).
- [x] **Responsive (tablet y celular)** en la carpeta `responsive/` sin tocar los CSS/JS existentes: `responsive.css` (solo `@media`: ≤1200 / ≤900 / ≤600 / ≤420 px; las reglas de secciones llevan el prefijo `html body` para ganarle al CSS de la sección, que se carga después) y `responsive.js` (botón ☰ que abre el menú lateral como panel desplegable, fondo oscuro, cierre con Escape / al elegir sección; nombre de los botones del pie como globo). En `index.html` solo se agregaron sus dos enlaces. En computadora (> 1200 px) no cambia nada.
- [x] **Google Maps insertado** en Inicio, sección 3 (`INI_MAPS_CLAVE` en `js/secciones/inicio.js`, centrado en San José). La clave está restringida por sitio web: en Google Cloud → Credenciales → la clave → "Restricciones de sitios web" deben estar `http://127.0.0.1:5500/*` y `http://localhost:5500/*` (Live Server) y, al publicar, el dominio real. Si Google la rechaza, el cuadro lo avisa.
- [ ] **Mapa en tiempo real (Inicio, sección 3):** la app del piloto compartirá su ubicación (GPS del teléfono, cada pocos segundos mientras esté "En ruta") en una tabla de Supabase (ej. `ubicaciones_pilotos`: piloto, lat, lng, velocidad, fecha) y el panel la mostrará en Google Maps con Realtime. Requiere clave de Google Maps (restringida por dominio) y Auth + RLS (fase 7) para que solo el piloto escriba su ubicación.
- [x] **Reportes** interactivos con exportación a Excel y PDF (31.11).
- [ ] **Pedidos — siguientes pasos:**
  - Sección **Reportes** interactiva (31.11) y récord del cliente en Clientes (31.10).
  - **App del piloto** (compañero): escanear QR (`ACACHETE-PEDIDO:<token_qr>`) o validar el código con `validar_codigo_respaldo`, llenar `pedido_entregas`, subir fotos a `evidencias` y agregar eventos en `pedido_historial`.
  - Borrado automático de fotos a los 12 meses (Edge Function programada).
  - Corregir los datos de un pedido ya registrado (hoy solo se reasigna fecha, marca y piloto); cada corrección como evento `correccion`.
  - Guardar como cliente nuevo al que se escribe a mano en el pedido (hoy queda solo en el pedido).
  - Código de país de WhatsApp (`PED_CODIGO_PAIS = '502'` en `js/secciones/pedidos.js`).
- [x] Vehículos: módulo en Configuración (Administrador y Admin G1; Admin G2 por región según sus pilotos).
- [ ] Vehículos: decidir si se agregan más datos (modelo, año, tipo, capacidad) y si el estado cambia solo con la Fase 5 (transporte).
- [ ] Detalles visuales del encabezado en pantallas medianas: el título "Panel de Control de Operaciones" se parte y aparecen barras de desplazamiento.
- [ ] Coordinar con la app del compañero: misma base de datos, mismas reglas de usuario compuesto.
- [ ] **Fase 7 (seguridad)** antes de publicar o usar con datos reales.
- [ ] **Pedidos:** confirmar las decisiones abiertas de la sección 31.9 antes de crear las tablas.
- [ ] **Rol Desarrollador (pendiente, aún no se implementa):**
  - Tiene **todos los privilegios** (igual o más que el Administrador), incluida la actividad de la
    empresa y las categorías de mercadería.
  - **Nadie lo puede asignar** desde la página y **los demás usuarios no lo ven** (ni en Usuarios,
    ni en Pilotos, ni en notificaciones).
  - Se crea **una sola vez desde el SQL** con el usuario `desar`. La clave la definió el dueño del
    proyecto y **no se escribe en el repositorio** (se pone al ejecutar el script).
  - Al implementarlo: agregar `desarrollador` a la regla de roles (SQL), `esDesarrollador()` en
    `js/sesion.js`, que todo lo que hoy revisa `esAdministrador()` también lo acepte, y excluirlo de
    las listas de usuarios, de los conteos y de los avisos.

---

## 31. Diseño del módulo Pedidos (implementado en `#pedidos` y `#rutas`)

> **Nombres:** en pantalla se dice **"horario"** (antes "marca"); en la base de datos se sigue
> llamando `marca` (`marca_numero`, `marcas_horario`, `marcas_del_dia`...). Moneda: **colón (₡)**,
> país Costa Rica (WhatsApp +506).
>
> **Rutas (sql/17):** cada tienda tiene las rutas que necesite (Admin, G1 y G2 las crean en
> "Rutas y asignaciones"); una ruta puede ser solo de una actividad. El G2 asigna el o los pilotos
> de cada ruta **por día o por toda la semana** (calendario semanal); con la × se quita al piloto
> **solo de ese día** aunque se haya asignado toda la semana (o, si se elige, la semana completa). Al registrar un pedido se elige
> la ruta y el piloto sale solo: el de la ruta ese día; si hay varios, el que tenga menos pedidos.
>
> **Piloto y tienda (sql/18):** cada piloto pertenece a **una tienda** (su tienda base). Si en
> Usuarios se le cambia la tienda (o deja de ser piloto), al guardar: sus asignaciones de rutas de la
> tienda anterior **de hoy en adelante** se quitan (el pasado no cambia), sus pedidos pendientes allá
> quedan **sin piloto** (queda en la línea de tiempo) y se avisa al **G2** para reasignarlos. Si se
> marca **"Piloto multitienda"**, conserva todo y el G2 lo puede asignar a rutas de **otras tiendas de
> su región** (ej. un día a la semana), pero **nunca en dos tiendas el mismo día**.

> Reemplaza al borrador de `pedidos` / `eventos_pedido` / `entregas` de la sección 13.3
> y amplía las secciones 5, 6, 8 y 12. Acordado el 2026-09-28.

### 31.1 Idea general

Un solo módulo Pedidos que sirve para **muchos tipos de servicio**. Cada pedido tiene 3 partes:

```
PEDIDO
├── Datos comunes      (todas las actividades: cliente, direcciones, quién recibe, marca, piloto, cobro, estado)
├── Detalle            (según la ACTIVIDAD: encomiendas, abarrotes, ... -> plantilla guardada en la base)
└── Cierre de entrega  (todas: satisfacción, estado de la mercadería, retraso, fotos)
```

- La empresa puede tener **varias actividades activas a la vez**, y cada tienda indica cuáles ofrece.
- Las **plantillas** (qué campos pide cada actividad) se guardan en la base: agregar una actividad
  nueva (farmacia, comida...) no requiere tablas nuevas ni programar otro formulario.
- El formulario de Pedidos se arma solo según la actividad elegida. La app del piloto lee la misma definición.

### 31.2 Datos comunes (todas las actividades)

| Grupo | Campos |
|---|---|
| Identificación | Código del pedido, actividad, tienda, fecha, quién lo registró |
| Cliente | De la tabla `clientes` (o nuevo): nombre, teléfono |
| Direcciones | Recolección (opcional) y entrega; distancia en km (para el cobro por distancia) |
| Quién recibe | Nombre, teléfono, tipo: el mismo cliente / persona autorizada |
| Planificación | Marca (respeta el máximo de pedidos por marca) y piloto |
| Cobro | Desglose del costo (31.5), total, forma de pago (tarjeta / efectivo), con cuánto paga, vuelto |
| Validación | Código QR + código de respaldo de 4 dígitos (31.6) |
| Estado | Ver 31.7 |

**Artículos / bultos (común):** cada pedido tiene una lista: categoría (encomienda, abarrotes, línea
blanca, electrónica...), tipo o descripción (caja, bolsa, hielera, "Refrigeradora", "TV 55\""...),
cantidad, tamaño de referencia (S/M/L/XL, opcional) y **peso**. El **peso total** se muestra al piloto
(para saber qué carga y si cabe en su vehículo) y queda en el historial para reportes.

### 31.3 Cierre de entrega (todas las actividades; lo llena el piloto en la app)

- **Cliente satisfecho:** sí / no (+ comentario). Alimenta la calificación y categoría del cliente.
- **Estado de la mercadería:** buena / mala. Si es mala, fotos obligatorias (1 a 3).
- **Retraso:** sí / no, motivo (lista configurable: tráfico, cliente ausente, dirección incorrecta,
  clima, falla del vehículo, otro) y 1 o 2 fotos de evidencia.
- **Foto de entrega** (respaldo, obligatoria).
- Validación con **QR** o **código de 4 dígitos**.
- Hora real de entrega (se compara con la ventana de la marca para detectar retrasos).

### 31.4 Plantillas iniciales

**📦 Encomiendas (bodega)**
- Recepción en bodega: por cada bulto, peso en kg (y tamaño S/M/L/XL solo como referencia).
- Dirección de recolección y de entrega, persona que recibe.
- Costo calculado con las tarifas (31.5): un mínimo por pedido (cubre un rango de peso) + kg adicionales del peso total (+ distancia cuando se integre Google Maps).
- Estado extra: *Recibido en bodega*.

**🏬 Entregas de tienda** (abarrotes, línea blanca, electrónica...)

La tienda marca con **casillas ("checks")** qué tipo de mercadería lleva el pedido; puede marcar
varias. Cada casilla marcada abre sus campos, y todo queda guardado en el historial:

```
Mercadería del pedido:
[x] Abarrotes      -> cajas: 3   bolsas: 2   hieleras/"fríos": 1   ¿alcohol? [x]   peso aprox.: 12 kg
[x] Línea blanca   -> + Refrigeradora ......... 65 kg
                      + Lavadora ............. 40 kg
[ ] Electrónica    -> (al marcarla: + artículo y su peso, ej. "TV 55"" 18 kg)
                                                            Peso total: 117 kg  (lo ve el piloto)
```

- **Abarrotes:** cantidad de cajas, bolsas y hieleras / "fríos"; ¿lleva alcohol?; peso aproximado.
- **Línea blanca y Electrónica:** lista de artículos, cada uno con **nombre y peso** (y cantidad).
  El artículo se elige del **catálogo de artículos frecuentes** (`articulos_catalogo`, sql/16:
  refrigeradora, lavadora, cocina, pantallas por pulgadas, celular, laptop...) y su **peso aproximado
  se llena solo**; el empleado lo puede corregir o escribir un artículo que no esté en la lista.
  El catálogo se edita en Configuración → Pedidos (Administrador y Admin G1).
- El piloto ve en su app qué lleva y el **peso total** (sirve para saber si cabe en su vehículo).
- Las categorías son una **lista configurable** (Configuración → Categorías de mercadería, Administrador
  y Admin G1): se pueden agregar otras (muebles, farmacia...) sin programar.
- **Alcohol:** si lleva alcohol, **sin excepción** el piloto debe marcar "Confirmo que quien recibe es
  mayor de edad"; sin esa marca la app no deja cerrar la entrega (queda en el historial quién y cuándo).
- Quién recibe: comprador o persona autorizada (nombre).
- **Monto de la compra** (lo que el cliente compró en la tienda): sirve para el envío gratis (31.5).
- Pago: tarjeta o efectivo; en efectivo se registra con cuánto paga y se calcula el vuelto.

### 31.5 Cobro: tarifas combinables

Cada actividad elige qué **componentes de cobro** usa, y se pueden **combinar** (ej. distancia + peso):

| Componente | Ejemplo |
|---|---|
| Cargo fijo por pedido | Q10 |
| **Mínimo** por pedido (incluye un **rango de peso** que definen los admin) | Q25, incluye hasta 2 kg |
| Precio por kg (peso fuera del rango) | Q3 por kg |
| Precio por km (distancia de transporte) | Q2 por km — **más adelante**, con Google Maps |
| **Envío gratis** si el monto de la compra llega a un mínimo | Compras desde Q300: transporte Q0 |

**Regla de cobro (acordada):** **un solo mínimo por pedido** que cubre un rango de peso, y todo el
peso **total** que pase ese rango se cobra como kg adicionales:

```
peso_total   = suma del peso de todos los bultos del pedido
kg_adicional = peso_total - peso_incluido_en_el_minimo   (si da negativo, 0)
costo        = mínimo + kg_adicional × precio_por_kg  (+ cargo fijo, + km cuando exista) - descuento
```

Ejemplos (mínimo cubre 2 kg):

| Pedido | Peso total | Se cobra |
|---|---|---|
| 1 bulto de 1.5 kg | 1.5 kg | mínimo |
| 1 bulto de 4 kg | 4 kg | mínimo + 2 kg adicionales |
| 2 bultos, 8 kg en total | 8 kg | mínimo + 6 kg adicionales |

- El mínimo es **uno por actividad** (no depende del tamaño). Los tamaños S/M/L/XL son **solo
  referencia** de medidas.

**Distancia:** se calculará con **Google Maps** en una fase posterior. Desde ya, el pedido guarda las
direcciones y tendrá la columna `distancia_km` lista; el componente "por km" queda desactivado hasta entonces.

**Entregas de tienda (abarrotes, línea blanca...):** el transporte se cobrará **por distancia** (cuando
exista Google Maps) y será **gratis** si el monto de la compra llega al mínimo configurado. Mientras no
haya distancia, se usa el cargo fijo de envío. El monto para envío gratis sigue el mismo alcance que
las tarifas (general, región o tienda).

**Descuentos:** solo **pre-establecidos** (Configuración → Descuentos): nombre, tipo (% o monto fijo),
actividad a la que aplica y si está activo. El empleado elige de la lista, **máximo 1 descuento por
pedido**; no puede escribir un precio a mano. Queda en el desglose del pedido.

**Alcance de las tarifas:** por ahora son **estándar** (una tarifa general), pero la estructura permite
variarlas por **región** o por **tienda** cuando se necesite. Prioridad: tienda > región > general
(igual que los pedidos por marca).

- Los valores se definen en **Configuración → Tarifas**. El empleado ve el costo **calculado** como base.
- **Quién define tarifas y descuentos:** Administrador y Admin G1 los generales; **Admin G2** los de su
  región y sus tiendas.
- Cada pedido guarda el **desglose** del costo (mínimo, peso, descuento, total), para que un cambio de
  tarifa no altere pedidos pasados.

**Tamaños de bulto S / M / L / XL:** solo **medidas de referencia** (largo × ancho × alto en cm), no
cambian el precio; **editables solo por Administrador y Admin G1** (grado superior a G2).

### 31.6 QR y código de respaldo (común para todas las empresas)

- Cada pedido tiene un **QR único**. Contiene solo un código seguro (no datos personales).
- Al registrar el pedido, la tienda muestra el QR: el cliente le toma **foto** o se le envía la imagen
  por **WhatsApp** para que lo reenvíe a quien recibe.
- **Lo escanean la tienda y el piloto** (por ahora): la tienda al recibir o despachar, el piloto al retirar
  y al entregar. Al entregar, validar el QR marca la entrega como **lícita** y pide la foto de respaldo.
- **Código de respaldo de 4 dígitos** (si se pierde el QR): en Configuración se marca **una o las
  dos** opciones: número aleatorio y/o **últimos 4 dígitos del teléfono del cliente**. Con las dos,
  el cliente recibe el número aleatorio y también se acepta su teléfono. La app valida con
  `validar_codigo_respaldo(pedido, código)` (sql/15).

**Número de pedido:** la empresa elige en Configuración (Administrador y Admin G1) si es
**automático** (P-000001, P-000002...) o **manual** (lo escribe el empleado, ej. su número de
factura; se guarda en MAYÚSCULAS y no se puede repetir).

### 31.7 Estados

```
Registrado → [Recibido en bodega] → Asignado → En ruta → Entregado
                                                       ↘ Entregado con incidencia (mal estado / retraso)
                                                       ↘ No entregado → Reprogramado / Devuelto
Cancelado (desde Registrado o Asignado)
```

Cada cambio de estado queda en el historial del pedido (quién, cuándo, dónde).

### 31.8 Tablas previstas (concepto)

| Tabla | Para qué |
|---|---|
| `actividades` | Encomiendas, Abarrotes... con su definición de campos (JSON: tipo, obligatorio, cuándo se llena) y componentes de cobro que usa |
| `tiendas_actividades` | Qué actividades ofrece cada tienda |
| `tamanos_bulto` | S / M / L / XL con medidas de referencia |
| `categorias_mercaderia` | Abarrotes, Línea blanca, Electrónica... (casillas del pedido y sus campos) |
| `articulos_catalogo` | Artículos frecuentes de cada categoría con peso aproximado (sql/16) |
| `tarifas` | Valor de cada componente por actividad (mínimo, kg incluidos, precio kg, fijo, km, monto para envío gratis); general, por región o por tienda (tienda > región > general) |
| `descuentos` | Descuentos pre-establecidos (% o monto fijo, actividad, activo); máx. 1 por pedido |
| `motivos_retraso` | Lista configurable |
| `pedidos` | Datos comunes como columnas + `detalle` (JSON de la actividad) + `costo_desglose` (JSON) + código QR + código de 4 dígitos |
| `pedido_articulos` | Artículos / bultos del pedido (categoría, descripción, cantidad, tamaño de referencia, peso) |
| `pedido_entregas` | Cierre de entrega (31.3) |
| `pedido_evidencias` | Fotos (entrega, mal estado, retraso) en el bucket `evidencias`, comprimidas |
| `pedido_historial` | Cambios de estado y escaneos (reemplaza a `eventos_pedido`) |

**Configuración nueva (módulos):** Actividades, Tarifas, Descuentos, Tamaños de bulto, Categorías de mercadería, Motivos de retraso, Número de pedido, Código de respaldo.

**Permisos previstos:**

| Qué | Admin | G1 | G2 | G3 | Empleado | Piloto |
|---|---|---|---|---|---|---|
| Actividad de la empresa (ver y cambiar, y tiendas que la ofrecen) | Sí | **No** | No | No | No | No |
| Categorías de mercadería (ver y cambiar) | Sí | **No** | No | No | No | No |
| Artículos frecuentes | Sí | Sí | Ver | No | No | No |
| Tamaños de bulto | Sí | Sí | No | No | No | No |
| Tarifas y descuentos | Sí | Sí | Su región y sus tiendas | No | No | No |
| Aplicar un descuento (de la lista, máx. 1) | Sí | Sí | Sí | Sí | Sí | No |
| Registrar pedidos (con fecha y marca inicial) | Sí | Sí | Su región | Su tienda | Su tienda (sin piloto) | No |
| **Crear rutas y asignar pilotos a las rutas** (por día o semana, sección Rutas; el selector de tienda siempre habilitado para Admin/G1/G2) | Sí | Sí | Su región | Solo ver | **Sin acceso** (ve las rutas del día y la ruta de cada pedido en Pedidos) | **Sin acceso** (ve "Tu ruta" del día en Pedidos) |
| Elegir la ruta al registrar un pedido | Sí | Sí | Sí | Sí | Sí | — |
| **Piloto del pedido** | Automático (el de la ruta ese día; si hay varios, el de menos pedidos); puede elegir otro a mano | Igual | Igual | Automático | Automático | — |
| **Reasignar horario / fecha / ruta / piloto** y reprogramar | Sí | Sí | Su región | **Solo solicitar** (le llega al G2 por la campana; G2 aplica o rechaza) | **Solo solicitar** | No |
| Cancelar pedido | Sí | Sí | Su región | Su tienda | **No** | No |
| Anular pedido | Sí | Sí | No | No | No | No |
| **"Salió a entregar", "Entregado" y "No entregado"** | No | No | No | No | No | **Solo el piloto del pedido** |
| Escanear QR / código | Sí | Sí | Sí | Su tienda | Su tienda | Sus pedidos |
| Cierre de entrega | — | — | — | — | — | Sí (panel por ahora; luego la app) |

### 31.9 Decisiones abiertas

- [x] **Regla de cobro:** se **suman** mínimo (con rango de peso) + peso cuando pasa el rango o hay más de 1 bulto.
- [x] **Detalle del cálculo:** un solo mínimo por pedido + kg adicionales sobre el peso **total** (ej. mínimo cubre 2 kg: 1 bulto de 4 kg = mínimo + 2 kg; 2 bultos con 8 kg = mínimo + 6 kg).
- [x] Tamaños S/M/L/XL: **solo referencia**; el mínimo es uno por actividad.
- [x] Entregas de tienda: transporte por distancia (más adelante) y **gratis** desde un monto mínimo de compra.
- [x] Mercadería con **casillas** (abarrotes, línea blanca, electrónica...) y artículos con su peso para el piloto.
- [x] **Distancia:** con Google Maps, en una fase posterior (columna `distancia_km` preparada).
- [x] **Descuentos:** pre-establecidos por los admin, máximo 1 por pedido; el empleado no escribe precios.
- [x] **Tarifas:** estándar por ahora, con opción de variar por región o tienda (tienda > región > general).
- [x] **Alcohol:** el piloto confirma la mayoría de edad **sin excepción** para cerrar la entrega.
- [ ] ¿Página pública de seguimiento para quien recibe? (Más adelante; hoy el QR solo lo usan tienda y piloto.)
- [x] **Fotos de evidencia:** se borran a los **12 meses** (ver 31.10). Los datos del pedido se guardan siempre.
- [x] **Reportes:** se ven y se manipulan en pantalla (sección Reportes) y se exportan a **Excel y PDF** (ver 31.11).

### 31.10 Historial, reportes y récord de clientes

**Regla principal: un pedido nunca se borra.** Todo pedido queda guardado para siempre como historial.

- **Cancelar** en vez de borrar: el pedido pasa a *Cancelado* con motivo y quién lo hizo.
- **Anular** (pedido registrado por error): solo Administrador y Admin G1, con motivo; queda oculto de
  las listas normales pero sigue en la base y en auditoría.
- Un pedido **entregado no se edita**. Si hay que corregir algo, se registra una *corrección* en el
  historial (qué cambió, antes → después, quién y cuándo).
- **Foto de los datos al momento del pedido:** el pedido guarda una copia del nombre, teléfono y
  dirección del cliente y de las tarifas usadas. Si luego el cliente cambia de teléfono o sube una
  tarifa, el historial muestra lo que realmente pasó.

**Historial de cada pedido (`pedido_historial`):** cada evento con fecha, hora, usuario y ubicación:
registro, cambio de estado, escaneo de QR / código de 4 dígitos, asignación de marca y piloto,
correcciones, cancelación. Es la línea de tiempo del pedido (sección 5).

**Récord del cliente** (en la ficha del cliente, sección Clientes → pestaña "Historial"):

| Dato | Cómo se obtiene |
|---|---|
| Pedidos totales, entregados, cancelados, no entregados | Conteo de sus pedidos |
| Monto total y promedio por pedido | Suma / promedio del total cobrado |
| Primer y último pedido, frecuencia (pedidos por mes) | Fechas de sus pedidos |
| % satisfecho | Del cierre de entrega |
| Incidencias (mal estado, retrasos, no entregado) | Del cierre de entrega |
| Calificación 1–5 y **categoría A/B/C/D** | Promedio (pendiente de Clientes) |
| Actividades que usa, tiendas donde compra | De sus pedidos |
| Lista de sus pedidos con filtro por fecha | Enlace a cada pedido y su línea de tiempo |

Se calcula con una **vista** en la base (`resumen_clientes`), así siempre está al día sin guardar
números duplicados.

**Fotos de evidencia: se borran a los 12 meses.**
- Un proceso automático diario (Edge Function programada de Supabase) borra del bucket `evidencias`
  las fotos con más de 12 meses.
- El registro de la foto **no** se borra: queda marcado "eliminada por antigüedad" con la fecha,
  para que el historial muestre que existió (tipo, quién la tomó, cuándo).
- Los datos del pedido, su línea de tiempo y el récord del cliente se guardan **siempre**.

Tablas y vistas de apoyo: `pedido_historial` (eventos), vistas `resumen_clientes` y `reporte_pedidos`,
e índices por fecha, cliente, tienda y piloto para que los reportes sean rápidos con muchos pedidos.

### 31.11 Sección Reportes (interactiva, sin necesidad de exportar)

Los reportes se **ven y se manipulan en pantalla** dentro de `#reportes`; exportar a Excel o PDF es
opcional y exporta exactamente lo que se está viendo.

**Barra de filtros en cascada** (pestaña fija arriba del reporte):

```
[ Región ▾ ] → [ Tienda ▾ ] → [ Cliente ▾ | Empleado ▾ ]      [ Desde – Hasta ]  [ Actividad ▾ ]  [ Limpiar ]
```

1. **Región** primero: al elegirla, la lista de tiendas muestra solo las de esa región.
2. **Tienda**: al elegirla, se habilita el último filtro.
3. **Cliente o Empleado** (selector de dos opciones + buscador): clientes de esa tienda, o empleados /
   pilotos de esa tienda.
- Además: rango de fechas (atajos: hoy, esta semana, este mes, mes anterior, año) y actividad.
- Cada filtro es opcional: sin región = todas; sin tienda = toda la región, etc.
- **Según el rol** los filtros vienen fijos: G2 con su región ya elegida (bloqueada); G3 con su región
  y tienda bloqueadas. (Empleado y Piloto no tienen acceso a Reportes.)
- Los filtros quedan en la dirección (`#reportes?region=CEN&tienda=4&cliente=12`), así se puede
  volver con "atrás" o compartir el enlace con alguien que tenga el mismo permiso.

**Qué se ve al filtrar:**

| Bloque | Contenido |
|---|---|
| Tarjetas de resumen | Pedidos, entregados, % a tiempo, ingresos, % satisfechos, incidencias |
| Gráficas | Pedidos e ingresos por día; pedidos por estado; retrasos por motivo; ingresos por actividad |
| Tabla detallada | Pedidos del filtro, con orden por columna, búsqueda y paginación |
| Según el último filtro | **Cliente** → su récord (31.10). **Empleado/Piloto** → su rendimiento (pedidos registrados o entregas, retrasos, incidencias) |

- **Explorar con clics:** al presionar una tienda en una gráfica o tabla, se aplica ese filtro (y así
  hacia cliente o piloto). Al presionar un pedido se abre su línea de tiempo.
- **Exportar:** botón *Excel* (hoja con la tabla detallada + hoja de resumen) y botón *PDF* (resumen,
  gráficas y tabla, con el logo y los filtros usados en el encabezado).
- Librerías previstas (CDN, sin servidor propio): gráficas con **Chart.js**, Excel con **SheetJS**,
  PDF con **jsPDF** (o la impresión del navegador con estilos de impresión).


---

## 32. Python en el proyecto (idea para más adelante)

> Ya hay una primera parte **sin servidores** (sección 33.4): calculadora de precios en el navegador
> y scripts locales. Lo de esta sección (servicio aparte) sigue siendo idea para más adelante.

### 32.1 Enfoque

- Python **no reemplaza** la página (HTML/CSS/JS) ni Supabase: rehacer el proyecto en Django/Flask sería
  un cambio brusco sin beneficio visible.
- Python entra como un **servicio aparte** que trabaja por detrás, para lo que el navegador no puede o no
  debe hacer.

```
Página (igual que hoy) ──► Supabase ◄── Servicio Python (nuevo, aparte)
        │                                     ▲
        └──── solo "Cargar Pedidos" lo llama ──┘
```

### 32.2 Dónde aporta

| # | Idea | Qué mejora | Encaja con… |
|---|---|---|---|
| 1 | **Cargar Pedidos (importación)** | Recibe pedidos de otras webs/apps (conexión automática) o desde Excel/CSV; los valida, calcula la tarifa y los guarda | Botón **Cargar Pedidos** (G2 y G3) |
| 2 | **Cálculo seguro del cobro** | Hoy el total se calcula en el navegador y podría alterarse; en el servidor no se puede manipular | Tarifas, descuentos, mínimo + kg adicionales (31.5) |
| 3 | **Optimización de rutas** | Con Google Maps + OR-Tools sugiere qué pedidos lleva cada piloto y en qué orden (menos km y tiempo) | Rutas, horarios y mapa en tiempo real |
| 4 | **Distancias reales** | Calcula los km de cada pedido para cobrar por distancia | Columna `distancia_km` (ya existe) |
| 5 | **Tareas automáticas** | Borrar historial de más de 12 meses; avisar pedidos atrasados o pilotos detenidos; cierre del día | Notificaciones y línea de tiempo |
| 6 | **Reportes programados** | Cada lunes genera el Excel/PDF de la semana y lo envía por correo a G2 en adelante | Reportes (hoy se generan a mano) |
| 7 | **WhatsApp automático** | Mensajes al cliente: "tu pedido salió", "fue entregado", con el QR | WhatsApp manual de Pedidos |
| 8 | **Análisis a futuro** | Predecir horas/días con más pedidos para planificar pilotos | Estadísticas e historial |

Prioridad: **1 y 2** primero (más valor inmediato); **3** es la que más diferencia al producto.

### 32.3 Cómo implementarlo sin cambios bruscos

1. **Carpeta nueva y separada** (ej. `servicios/`), igual que `responsive/`: no toca lo existente.
2. **Se comunica por Supabase:** Python lee y escribe las mismas tablas; la página solo ve los datos nuevos.
3. **La clave `service_role` vive solo en el servidor** (variable de entorno), **nunca** en el repositorio
   ni en la página.
4. **Por etapas:**
   - **Etapa 1 (sin servidor):** script local para importar pedidos desde Excel y probar la lógica.
   - **Etapa 2 (servicio en línea):** el mismo código como API pequeña (**FastAPI**) en Google Cloud Run,
     Render o Railway. El botón Cargar Pedidos la llama (único cambio en la página).
   - **Etapa 3 (programado):** el servicio corre solo cada cierto tiempo (reportes, limpieza, alertas).
5. **Seguridad:** antes de la etapa 2 debe estar la **fase 7 (Auth + RLS)**, para que la API compruebe
   quién la llama (ej. G2/G3 de esa tienda).

### 32.4 Alternativas sin Python

- **Tareas programadas simples** (borrar a los 12 meses, marcar atrasados): SQL programado dentro de
  Supabase (`pg_cron`).
- **Cálculos cortos** (cobro): función de la base de datos o **Edge Function** de Supabase (TypeScript).
- Criterio: lo pequeño en Supabase; Python para lo pesado o con lógica de negocio (importar pedidos,
  rutas óptimas, reportes programados, WhatsApp, análisis).

### 32.5 Orden sugerido

1. Fase 7: Auth + RLS.
2. Python etapa 1: importar pedidos desde Excel (script local).
3. Etapa 2: API para Cargar Pedidos + cálculo seguro del cobro.
4. Distancias con Google Maps y rutas óptimas.
5. Reportes programados, WhatsApp y alertas.

---

## 33. Multimarca, actividades y Python sin servidores (implementado)

### 33.1 Multimarca (una copia del sistema por empresa)

- Cada empresa se define en **`empresas/empresas.js`** (en VS Code, no desde la página): nombre, título o
  imagen de encabezado, logo, fondo del logo, texto del pie, **actividades que realiza**, base de datos
  propia y **paleta de colores**. `EMPRESA_ACTIVA` elige cuál usa esta copia.
- **Agregar una empresa sin escribir código:** `python python/nueva_empresa.py` (pregunta los datos y qué
  actividad realiza: Entregas de tienda, Encomiendas o las dos).
- **Base de datos nueva en blanco:** proyecto nuevo en Supabase + `sql/00_instalacion_completa.sql`, y
  su URL y clave `anon` en el campo `supabase` de la empresa.
- **Colores:** vacío = colores originales de ACACHETE. La paleta propia se escribe con los nombres de
  `css/variables.css` sin `--` (ej. `'color-naranja': '#9EB568'`).
- El logo de ACACHETE (marca de la casa) siempre queda en la animación del logo y en el login; el logo
  de la empresa se turna con él y va junto al título.
- La sesión se guarda por empresa (`acachete_sesion_<empresa>`): cambiar de empresa pide iniciar sesión.

### 33.2 Actividades: qué usa cada una

Las actividades que no realiza la empresa no aparecen en ninguna parte (Pedidos, Rutas, Reportes,
Configuración). Lo que usa cada una se marca en **Configuración → Actividades** (solo Administrador) y
decide qué muestra el formulario de Pedidos:

| Uso | Qué muestra | Tienda | Encomiendas |
|---|---|---|---|
| `usa_bodega` | Estado "Recibido en bodega" | | ✔ |
| `usa_recoleccion` | Dirección de recolección | | ✔ |
| `usa_tamanos` | Tamaño S/M/L/XL en los bultos | | ✔ |
| `usa_compra` | Monto de compra, envío gratis, cobrar la compra | ✔ | |
| `permite_alcohol` | Casilla "lleva alcohol" (el piloto confirma la mayoría de edad) | ✔ | |

### 33.3 Mercadería por categorías (las dos actividades)

Cada actividad tiene sus **categorías** (Configuración → Pedidos → Categorías de mercadería). Tipos:

| Tipo | Se registra | Ejemplos |
|---|---|---|
| `conteo` | Cajas, bolsas, hieleras, peso aproximado (y alcohol si la actividad lo permite) | Abarrotes |
| `articulos` | Artículo del catálogo con su **peso promedio**, que el empleado puede cambiar en el pedido | Línea blanca, electrónica |
| `bulto` | Descripción, cantidad, tamaño (si usa tamaños) y peso de cada uno | Cajas, bolsas |
| `documento` | Solo cantidad; cada uno pesa `peso_referencia` (0.2 kg) | Documentos / sobres |

- Encomiendas: Cajas, Bolsas, Documentos, Línea blanca, Electrónica y Otros artículos.
- **Pesos promedio:** Configuración → Pedidos → Artículos frecuentes (por actividad y categoría;
  Administrador y Admin G1). En el pedido el peso se llena solo y se puede corregir.

### 33.4 Python sin servidores

| Archivo | Dónde corre | Qué hace |
|---|---|---|
| `python/tarifas.py` | **En el navegador** (Pyodide, se descarga la primera vez) y en VS Code | Calculadora de precios: mínimo + kg adicionales después del mínimo, envío gratis. Configuración → Pedidos → "Calculadora de precios". Misma fórmula que `calcularEnvio` de Pedidos |
| `python/pesos_promedio.py` | VS Code | Compara los pesos del catálogo con los reales de los pedidos; `--aplicar` los actualiza, `--agregar` suma artículos escritos a mano que se repiten |
| `python/nueva_empresa.py` | VS Code | Agrega una empresa a `empresas/empresas.js` |
| `python/empresa_activa.py` | (ayuda) | Lee la empresa activa y se conecta a su Supabase con la librería estándar |

- En la página, Python corre con `cargarPython(ruta)` (`js/componentes.js`); requiere abrir el sistema
  con Live Server (no con doble clic en el archivo).
- Los scripts de VS Code necesitan **Python 3** instalado (python.org) y nada más.