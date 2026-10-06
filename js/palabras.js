/* ==================================================
   PALABRAS POR ACTIVIDAD (Pedido -> Viaje, Piloto -> Conductor)
   ACACHETE LOGISTICS

   Cada actividad puede llamar distinto al registro y al conductor
   (tabla actividades: palabra_registro, palabra_registros,
   palabra_conductor, palabra_conductores; vacío = pedido / piloto).
   Se cambian en Configuración -> Actividades.

   Regla: si TODAS las actividades de la empresa de la sesión usan la misma
   palabra, se muestra en todo el sistema. Ej.: una empresa solo de
   Transporte ve "Viajes", "Nuevo viaje", "Conductores"...; una que hace
   Transporte y Encomiendas sigue viendo "Pedidos" (Pedidos ya separa las
   actividades en pestañas). Al cambiar de empresa cambian solas.

   Cómo: en vez de cambiar los cientos de textos del código, se cambian en
   PANTALLA. Un MutationObserver revisa todo lo que se dibuja (textos y los
   atributos placeholder, title y aria-label) y también los mensajes de
   alert / confirm / prompt. Mantiene las mayúsculas: Pedido -> Viaje,
   PEDIDOS -> VIAJES, pedido -> viaje.
     - Lo que está dentro de un elemento con  data-sin-palabras  no se toca
       (para datos escritos por personas, ej. notas de un cliente).
     - No se tocan valores de campos, ids, enlaces (#pedidos), ni lo que se
       guarda en la base: solo lo que se ve.
     - Para un texto armado en JS que no pasa por la pantalla (ej. un Excel),
       usar  cambiarPalabras(texto)  o  palabra('registros').

   Las palabras de cada actividad se guardan en localStorage para que se vean
   desde el primer momento, y se actualizan desde la base al abrir la página
   y al modificar una actividad (cargarPalabras()).

   Lo llama js/sesion.js cada vez que cambia la sesión (entrar, cambiar de
   empresa, salir) -> refrescarPalabras().
   Diseño: docs/14-transporte.md.
   ================================================== */

// Palabras de siempre (las que están escritas en el código)
const PALABRAS_BASE = { registro: 'pedido', registros: 'pedidos', conductor: 'piloto', conductores: 'pilotos' };

// Grupos: singular y plural se toman siempre de la misma actividad
const PALABRAS_GRUPOS = [['registro', 'registros'], ['conductor', 'conductores']];

const CLAVE_PALABRAS = `acachete_palabras_${EMPRESA_ACTIVA}`;
const PALABRAS_ATRIBUTOS = ['placeholder', 'title', 'aria-label'];
const PALABRAS_NO_TOCAR = 'script, style, [data-sin-palabras]';
const PALABRAS_NO_TOCAR_TEXTO = `${PALABRAS_NO_TOCAR}, textarea`; // lo escrito en un textarea es su valor

// codigo de actividad -> { registro, registros, conductor, conductores } (null = la de siempre)
let palabrasActividades = (() => {
    try {
        return JSON.parse(localStorage.getItem(CLAVE_PALABRAS)) || {};
    } catch {
        return {};
    }
})();

let palabrasActuales = { ...PALABRAS_BASE };
let palabrasRegex = null;      // /\b(pedidos|pedido|...)\b/gi, null = no hay nada que cambiar
let palabrasCambio = {};       // 'pedidos' -> 'viajes'

// ==================================================
// QUÉ PALABRAS USA LA EMPRESA
// ==================================================

function calcularPalabras() {
    const sesion = typeof empresaActual === 'function' ? empresaActual() : null;
    let codigos = (sesion && sesion.actividades && sesion.actividades.length ? sesion.actividades : null)
        || EMPRESA.actividades || [];
    if (!codigos.length) codigos = Object.keys(palabrasActividades); // lista vacía = todas

    const resultado = { ...PALABRAS_BASE };
    PALABRAS_GRUPOS.forEach(([singular, plural]) => {
        const propias = codigos.map((c) => palabrasActividades[c] || {});
        const primera = propias[0];
        const todasIguales = primera && primera[singular] && propias.every((p) => p[singular] === primera[singular]);
        if (todasIguales) {
            resultado[singular] = primera[singular];
            resultado[plural] = primera[plural] || `${primera[singular]}s`;
        }
    });
    return resultado;
}

// Palabra de la empresa activa: palabra('registros') -> 'viajes'; palabra('registro', true) -> 'Viaje'
function palabra(clave, mayuscula = false) {
    const texto = palabrasActuales[clave] || PALABRAS_BASE[clave] || clave;
    return mayuscula ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

// ==================================================
// CAMBIAR UN TEXTO
// ==================================================

// Copia las mayúsculas de la palabra original: PEDIDOS -> VIAJES, Pedido -> Viaje
function igualarMayusculas(original, nueva) {
    if (original === original.toUpperCase()) return nueva.toUpperCase();
    if (original[0] === original[0].toUpperCase()) return nueva.charAt(0).toUpperCase() + nueva.slice(1);
    return nueva;
}

function cambiarPalabras(texto) {
    if (!palabrasRegex || !texto) return texto;
    palabrasRegex.lastIndex = 0;
    if (!palabrasRegex.test(texto)) return texto;
    palabrasRegex.lastIndex = 0;
    return texto.replace(palabrasRegex, (encontrada) => igualarMayusculas(encontrada, palabrasCambio[encontrada.toLowerCase()]));
}

// ==================================================
// CAMBIAR LA PANTALLA
// Se recuerda el texto original de cada nodo: al volver a una empresa con las
// palabras de siempre, lo que sigue en pantalla (menú, pie) vuelve a "Pedidos".
// ==================================================

const textosOriginales = new WeakMap();    // nodo de texto -> { original, puesto }
const atributosOriginales = new WeakMap(); // elemento -> { atributo: { original, puesto } }

function noSeToca(elemento, selector = PALABRAS_NO_TOCAR) {
    return !elemento || !!elemento.closest(selector);
}

function traducirTexto(nodo) {
    if (noSeToca(nodo.parentElement, PALABRAS_NO_TOCAR_TEXTO)) return;
    const reg = textosOriginales.get(nodo);
    // Si la página cambió el texto después, lo nuevo es el original
    const original = reg && nodo.nodeValue === reg.puesto ? reg.original : nodo.nodeValue;
    const nuevo = cambiarPalabras(original);
    if (nuevo === original) textosOriginales.delete(nodo);
    else textosOriginales.set(nodo, { original, puesto: nuevo });
    if (nodo.nodeValue !== nuevo) nodo.nodeValue = nuevo;
}

function traducirAtributo(elemento, atributo) {
    if (!elemento.hasAttribute(atributo) || noSeToca(elemento)) return;
    const regs = atributosOriginales.get(elemento) || {};
    const actual = elemento.getAttribute(atributo);
    const reg = regs[atributo];
    const original = reg && actual === reg.puesto ? reg.original : actual;
    const nuevo = cambiarPalabras(original);
    if (nuevo === original) delete regs[atributo];
    else regs[atributo] = { original, puesto: nuevo };
    atributosOriginales.set(elemento, regs);
    if (actual !== nuevo) elemento.setAttribute(atributo, nuevo);
}

// Un nodo y todo lo que tiene dentro
function traducir(raiz) {
    if (raiz.nodeType === Node.TEXT_NODE) {
        traducirTexto(raiz);
        return;
    }
    if (raiz.nodeType !== Node.ELEMENT_NODE || noSeToca(raiz)) return;
    const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let nodo = raiz; nodo; nodo = recorrido.nextNode()) {
        if (nodo.nodeType === Node.TEXT_NODE) traducirTexto(nodo);
        else PALABRAS_ATRIBUTOS.forEach((a) => traducirAtributo(nodo, a));
    }
}

// Todo lo que se dibuja después (secciones, tablas, ventanas, avisos)
const observadorPalabras = new MutationObserver((cambios) => {
    cambios.forEach((c) => {
        if (c.type === 'characterData') traducirTexto(c.target);
        else if (c.type === 'attributes') traducirAtributo(c.target, c.attributeName);
        else c.addedNodes.forEach(traducir);
    });
});
let observando = false;

// Vuelve a calcular las palabras de la empresa y, si cambiaron, repinta todo
function refrescarPalabras() {
    const nuevas = calcularPalabras();
    if (PALABRAS_GRUPOS.flat().every((k) => nuevas[k] === palabrasActuales[k])) return;
    palabrasActuales = nuevas;

    palabrasCambio = {};
    Object.keys(PALABRAS_BASE).forEach((k) => {
        if (nuevas[k] !== PALABRAS_BASE[k]) palabrasCambio[PALABRAS_BASE[k]] = nuevas[k];
    });
    // Las largas primero (pedidos antes que pedido)
    const buscar = Object.keys(palabrasCambio).sort((a, b) => b.length - a.length);
    palabrasRegex = buscar.length ? new RegExp(`\\b(${buscar.join('|')})\\b`, 'gi') : null;

    if (document.body) traducir(document.body); // también devuelve los textos a "Pedidos" si toca
    if (palabrasRegex && !observando && document.body) {
        observadorPalabras.observe(document.body, {
            childList: true, subtree: true, characterData: true,
            attributes: true, attributeFilter: PALABRAS_ATRIBUTOS,
        });
        observando = true;
    } else if (!palabrasRegex && observando) {
        observadorPalabras.disconnect();
        observando = false;
    }
}

// ==================================================
// PALABRAS DE CADA ACTIVIDAD (desde la base)
// ==================================================

// También guarda si cada actividad trabaja con viajes (usa_viajes, sql/01 bloque 19) y si
// recoge en un punto de partida (usa_recoleccion): lo usan esActividadDeViajes(),
// empresaTieneViajes() y empresaTieneRecoleccion() de empresas/empresas.js.
async function cargarPalabras() {
    const columnas = 'codigo, palabra_registro, palabra_registros, palabra_conductor, palabra_conductores';
    let { data, error } = await db.from('actividades').select(`${columnas}, usa_viajes, usa_recoleccion`);
    if (error && error.code === '42703') ({ data, error } = await db.from('actividades').select(columnas)); // sin el bloque 19
    if (error) {
        // Falta el bloque 18 de sql/01: todas con las palabras de siempre
        if (error.code === '42703') palabrasActividades = {};
        else return;
    } else {
        palabrasActividades = Object.fromEntries(data.map((a) => [a.codigo, {
            registro: a.palabra_registro, registros: a.palabra_registros,
            conductor: a.palabra_conductor, conductores: a.palabra_conductores,
            viajes: a.usa_viajes === undefined ? null : !!a.usa_viajes,
            recoleccion: a.usa_recoleccion === undefined ? null : !!a.usa_recoleccion, // "Mis envíos" del cliente
        }]));
    }
    try {
        localStorage.setItem(CLAVE_PALABRAS, JSON.stringify(palabrasActividades));
    } catch {
        // sin almacenamiento: se vuelven a pedir la próxima vez
    }
    // Palabras, y también el menú y el pie (Viajes / Pedidos según la empresa)
    if (typeof actualizarSegunEmpresa === 'function') actualizarSegunEmpresa();
    else refrescarPalabras();
}

// Mensajes del navegador (alert, confirm, prompt) con las mismas palabras
['alert', 'confirm', 'prompt'].forEach((nombre) => {
    const original = window[nombre].bind(window);
    window[nombre] = (mensaje, ...resto) => original(mensaje == null ? mensaje : cambiarPalabras(String(mensaje)), ...resto);
});

// Arranque: primero con lo guardado (sin esperar) y luego con lo de la base
refrescarPalabras();
cargarPalabras();
