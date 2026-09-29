/* ==================================================
   CARGADOR DE SECCIONES
   ACACHETE LOGISTICS

   Qué hace: index.html es la ÚNICA página del sistema.
   Todas las pantallas (incluido el login) se cargan
   DENTRO del <div class="cuerpo-principal">, sin recargar
   la página. El encabezado, el menú y el pie se quedan
   fijos; solo cambia el contenido del centro.

   Cómo funciona:
     - Cada enlace del menú tiene un href con # (ej. #pedidos).
     - Al hacer clic, este archivo busca:
         secciones/pedidos.html       -> el contenido (obligatorio)
         css/secciones/pedidos.css    -> sus estilos  (opcional)
         js/secciones/pedidos.js      -> su lógica    (opcional)
       y los muestra en .cuerpo-principal.
     - Si no hay sesión, siempre se muestra el login
       (secciones/loggin.html), sin importar el # de la URL.

   ---------------------------------------------------
   CÓMO AGREGAR UNA SECCIÓN NUEVA (ej. "facturas"):
     1. En index.html, agregar al menú:
          <li class="menu-item"><a href="#facturas">...</a></li>
     2. Crear secciones/facturas.html con SOLO el contenido
        (sin <html>, <head> ni <body>). Su única etiqueta <script>
        debe ser la línea que redirige a index.html si alguien abre
        el archivo directamente (copiarla de secciones/loggin.html).
     3. (Opcional) css/secciones/facturas.css -> TODO lo propio de la
        sección (estructura, textos y animaciones). Antes, revisar
        css/componentes.css: botones, tablas, formularios, ventanas,
        avisos... ya existen y se usan solo poniendo la clase.
     4. (Opcional) js/secciones/facturas.js con esta forma:

          registrarSeccion('facturas', (zona) => {
              // zona = el div donde se mostró la sección.
              // Buscar elementos con zona.querySelector(...)
              // y agregar los eventos aquí.

              // (Opcional) devolver una función de limpieza que se
              // ejecuta al salir de la sección (ej. detener un setInterval):
              return () => { ... };
          });

        El archivo se descarga una sola vez; la función se ejecuta
        CADA VEZ que se muestra la sección (porque el HTML es nuevo).
     (Opcional) Parámetros: una sección puede recibir datos en el #, ej.
        index.html#facturas?tienda=3  ->  parametrosSeccion().get('tienda') = "3"
     (Opcional) Si la sección no va en el menú y se abre desde otra,
        agregarla a SECCION_DEL_MENU (más abajo) para resaltar su "madre".
     5. (Solo si USAR_PERMISOS = true en js/sesion.js) agregar 'facturas'
        a la columna "permisos" de los usuarios que puedan verla
        (desde la sección Usuarios). Los que tienen {*} ya la ven.
     No hace falta tocar este archivo.
   ---------------------------------------------------

   NOTA: si una sección no tiene .css o .js, el navegador muestra
   un aviso 404 en la consola la primera vez. Es normal.

   IMPORTANTE: el proyecto debe abrirse con un servidor
   local (ej. Live Server en VS Code). Si se abre index.html
   con doble clic (file://), el navegador bloquea fetch y
   las secciones no cargan.
   ================================================== */

// Div de index.html donde se muestran las secciones
const contenedor = document.querySelector('.cuerpo-principal');

// Sección que se muestra después de iniciar sesión si la URL no tiene #.
// Cambiar aquí si se quiere que el sistema arranque en otra sección.
const SECCION_INICIAL = 'inicio';

// Sección que se muestra cuando no hay sesión
const SECCION_LOGIN = 'loggin';

// ==================================================
// DESCARGA DE ARCHIVOS DE CADA SECCIÓN
// Todo se guarda en memoria: cada archivo se descarga una sola vez.
// ==================================================

// ---------- HTML ----------
const cache = new Map(); // nombre -> Promise<string> con el HTML ya descargado

function obtenerSeccion(nombre) {
    if (!cache.has(nombre)) {
        // Carpeta donde viven los HTML de las secciones
        const peticion = fetch(`secciones/${nombre}.html`)
            .then((res) => {
                if (!res.ok) throw new Error(res.status); // ej. 404 si el archivo no existe
                return res.text();
            })
            .catch((err) => {
                cache.delete(nombre); // permite reintentar más tarde
                throw err;
            });
        cache.set(nombre, peticion);
    }
    return cache.get(nombre);
}

// ---------- CSS ----------
// Se descarga con media="not all" (no se aplica) y se activa al mostrar la sección.
// Así los estilos de una sección no afectan a las demás.
const estilos = new Map(); // nombre -> Promise<HTMLLinkElement | null>
let estiloActivo = null;   // <link> del CSS de la sección que se ve ahora

function obtenerEstilo(nombre) {
    if (!estilos.has(nombre)) {
        estilos.set(nombre, new Promise((resolve) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = `css/secciones/${nombre}.css`; // carpeta de los CSS de secciones
            link.media = 'not all';
            link.onload = () => resolve(link);
            link.onerror = () => { link.remove(); resolve(null); }; // la sección no tiene CSS
            document.head.appendChild(link);
        }));
    }
    return estilos.get(nombre);
}

// Apaga el CSS de la sección anterior y enciende el de la nueva.
function activarEstilo(link) {
    if (estiloActivo) estiloActivo.media = 'not all';
    if (link) link.media = 'all';
    estiloActivo = link;
}

// ---------- JS ----------
// Cada js/secciones/<nombre>.js llama a registrarSeccion() para dejar
// guardada su función de inicio (ver "CÓMO AGREGAR UNA SECCIÓN NUEVA").
const iniciadores = {}; // nombre -> función (zona) => { ... }

function registrarSeccion(nombre, iniciar) {
    iniciadores[nombre] = iniciar;
}

const scripts = new Map(); // nombre -> Promise<boolean> (true si el archivo existe)

function obtenerScript(nombre) {
    if (!scripts.has(nombre)) {
        scripts.set(nombre, new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = `js/secciones/${nombre}.js`; // carpeta de los JS de secciones
            script.onload = () => resolve(true);
            script.onerror = () => { script.remove(); resolve(false); }; // la sección no tiene JS
            document.body.appendChild(script);
        }));
    }
    return scripts.get(nombre);
}

// Función de limpieza que devolvió la sección actual (si devolvió una)
let limpiezaActual = null;

// ==================================================
// MOSTRAR SECCIONES
// ==================================================

// ---------- Resaltar la opción del menú actual ----------
// Pone la clase "activo" al enlace de la sección que se está viendo.
// Su estilo está en  .menu-item a.activo  (css/index.css).
// Secciones que NO están en el menú y se abren desde otra: al verlas, se
// resalta en el menú la sección "madre" (ej. Clientes se abre desde Tiendas).
const SECCION_DEL_MENU = {
    clientes: 'tiendas',
};

function marcarActivo(nombre) {
    const enMenu = SECCION_DEL_MENU[nombre] || nombre;
    document.querySelectorAll('.menu-item a').forEach((a) => {
        a.classList.toggle('activo', a.getAttribute('href') === `#${enMenu}`);
    });
}

// ---------- Transición entre secciones ----------
// Las clases "seccion-saliendo" y "seccion-entrando" están en css/index.css.
// DURACION_SALIDA debe coincidir con la transición de .cuerpo-principal (0.15s = 150ms).
const DURACION_SALIDA = 150;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Pone el contenido nuevo, lanza la animación de entrada y
// ejecuta la función de inicio de la sección (si tiene).
function mostrarContenido(html, estilo, nombre) {
    // Primero se limpia la sección anterior
    if (limpiezaActual) limpiezaActual();
    limpiezaActual = null;

    activarEstilo(estilo);
    contenedor.innerHTML = html;
    contenedor.scrollTop = 0; // vuelve arriba al cambiar de sección

    contenedor.classList.remove('seccion-saliendo', 'seccion-entrando');
    void contenedor.offsetWidth; // fuerza al navegador a reiniciar la animación
    contenedor.classList.add('seccion-entrando');

    const iniciar = nombre && iniciadores[nombre];
    if (iniciar) {
        const limpiar = iniciar(contenedor);
        if (typeof limpiar === 'function') limpiezaActual = limpiar;
    }
}

// Al terminar la animación de entrada se quita la clase. Esto es necesario:
// mientras hay un transform activo, los elementos position: fixed de una
// sección (ej. ventanas modales) no se ubicarían bien.
// (Se revisa e.target para ignorar animaciones de elementos dentro de la sección.)
contenedor.addEventListener('animationend', (e) => {
    if (e.target === contenedor) contenedor.classList.remove('seccion-entrando');
});

// Arma el HTML de un mensaje (error o sin permiso).
// Se usa textContent para que el texto nunca se interprete como HTML
// (el nombre de la sección viene de la URL y alguien podría manipularlo).
function mensajeSeccion(texto) {
    const p = document.createElement('p');
    p.className = 'seccion-error';
    p.textContent = texto;
    return p.outerHTML;
}

// Contador de cargas. Sirve para que, si el usuario hace clic muy rápido
// en varias secciones, solo se muestre la última que pidió.
let cargaActual = 0;

// ---------- Mostrar una sección ----------
async function cargarSeccion(nombre) {
    const id = ++cargaActual;
    marcarActivo(nombre);

    // Si ya hay algo en pantalla, primero se desvanece (en paralelo con la descarga).
    // La primera vez que abre la página no hay nada que desvanecer.
    const haySeccionPrevia = contenedor.childElementCount > 0;
    if (haySeccionPrevia) contenedor.classList.add('seccion-saliendo');
    const salida = haySeccionPrevia ? esperar(DURACION_SALIDA) : Promise.resolve();

    // Sin permiso (tienePermiso está en js/sesion.js; los permisos de cada
    // usuario vienen de la tabla "usuarios"). El login no necesita permiso.
    // No se descarga nada de la sección.
    if (nombre !== SECCION_LOGIN && !tienePermiso(nombre)) {
        await salida;
        if (id !== cargaActual) return;
        mostrarContenido(mensajeSeccion(`No tienes permiso para ver la sección "${nombre}".`), null);
        return;
    }

    try {
        // Descarga HTML, CSS y JS al mismo tiempo, y espera a que termine la salida
        const [html, estilo] = await Promise.all([
            obtenerSeccion(nombre),
            obtenerEstilo(nombre),
            obtenerScript(nombre),
            salida,
        ]);
        if (id !== cargaActual) return; // el usuario ya pidió otra sección
        mostrarContenido(html, estilo, nombre);
    } catch {
        // No existe secciones/<nombre>.html o hubo un error de red.
        // Para cambiar el mensaje de error, editar el texto de abajo.
        await salida;
        if (id !== cargaActual) return;
        mostrarContenido(mensajeSeccion(`No se pudo cargar la sección "${nombre}".`), null);
    }
}

// Decide qué sección mostrar según la URL y la sesión:
//   - sin sesión            -> login (siempre)
//   - con sesión, sin #     -> SECCION_INICIAL
//   - con sesión y #loggin  -> SECCION_INICIAL (ya inició sesión)
//   - con sesión y #algo    -> esa sección
function seccionDesdeHash() {
    if (!obtenerSesion()) return SECCION_LOGIN;

    const pedida = nombreSeccionDeHash();
    if (!pedida || pedida === SECCION_LOGIN) return SECCION_INICIAL;
    return pedida;
}

// ---------- Parámetros de una sección ----------
// El # puede llevar datos extra después de "?", ej.:
//   index.html#clientes?tienda=3&nuevo=1
// nombreSeccionDeHash() -> "clientes"
// parametrosSeccion()   -> URLSearchParams: .get('tienda') = "3", .get('nuevo') = "1"
function nombreSeccionDeHash() {
    return location.hash.slice(1).split('?')[0];
}

function parametrosSeccion() {
    return new URLSearchParams(location.hash.split('?')[1] || '');
}

// ==================================================
// FUNCIONES PARA OTROS ARCHIVOS
// Las usan js/secciones/loggin.js y js/menu-usuario.js
// ==================================================

// Muestra lo que corresponde según la URL y la sesión actual
// (se usa después de iniciar o cerrar sesión).
function mostrarSeccionActual() {
    cargarSeccion(seccionDesdeHash());
}

// Navega a una sección desde código (ej. después del login).
// Cambia el # de la URL, lo que dispara la carga por "hashchange".
function irA(nombre) {
    if (location.hash === `#${nombre}`) {
        mostrarSeccionActual(); // el # ya es ese: se carga directo
    } else {
        location.hash = nombre;
    }
}

// Quita el # de la URL sin recargar (se usa al cerrar sesión, para que
// el siguiente usuario no aparezca en la última sección del anterior).
function limpiarHash() {
    history.replaceState(null, '', location.pathname + location.search);
}

// ==================================================
// PRECARGA Y ARRANQUE
// ==================================================

// Precarga al pasar el mouse: cuando se hace clic ya está todo descargado.
// Se revisa el permiso en el momento (puede cambiar al iniciar/cerrar sesión).
document.querySelectorAll('.menu-item a').forEach((a) => {
    const nombre = a.getAttribute('href').slice(1);
    a.addEventListener('mouseenter', () => {
        if (!tienePermiso(nombre)) return; // no se precargan las secciones bloqueadas
        obtenerSeccion(nombre).catch(() => {});
        obtenerEstilo(nombre);
        obtenerScript(nombre);
    });
});

// ---------- Botones del pie ----------
//   Crear Pedido      -> formulario de pedido nuevo
//   Asignar Piloto    -> Rutas y asignaciones (pilotos por ruta, día o semana).
//                        Solo G2 o superior (G3 y Empleado no ven el botón, css/index.css)
//   Reasignar horario -> lista de pedidos pendientes en modo "reasignar": al elegir uno
//                        se abre su ventana (G2+ reasigna; G3 y Empleado lo solicitan)
//   Cancelar pedido   -> lista de pedidos pendientes en modo "cancelar" (los pedidos no
//                        se borran). El Empleado no ve el botón.
//   Generar reporte   -> sección Reportes (G3 solo ve; G2 o superior exporta).
//                        El Empleado no ve el botón (no tiene acceso a Reportes).
//   (Cargar Pedidos todavía no tiene función.)
const BOTONES_PIE = {
    '.btn-crear': 'pedidos?nuevo=1',
    '.btn-piloto': 'rutas',
    '.btn-hor': 'pedidos?accion=reasignar',
    '.btn-del': 'pedidos?accion=cancelar',
    '.btn-chart': 'reportes',
};
Object.entries(BOTONES_PIE).forEach(([selector, destino]) => {
    const boton = document.querySelector(`.pie ${selector}`);
    if (!boton) return;
    boton.addEventListener('click', () => {
        const seccion = destino.split('?')[0];
        if (obtenerSesion() && tienePermiso(seccion)) irA(destino);
    });
});

// Cada vez que cambia el # de la URL (clic en el menú, botón atrás/adelante),
// se carga la sección correspondiente.
window.addEventListener('hashchange', mostrarSeccionActual);

// Al abrir la página se muestra el login o la sección del # actual.
mostrarSeccionActual();
