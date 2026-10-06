/* ==================================================
   EMPRESAS (MULTIMARCA)
   ACACHETE LOGISTICS

   El mismo sistema (UN solo app.html) sirve a varias empresas. Cada
   empresa (marca) se define AQUÍ: textos, colores, pie y base de datos.
   Se elige cuál usa esta copia del sistema con EMPRESA_ACTIVA.
   No hace falta otro index: la página toma de aquí lo de la marca activa.

   ⚠ Las IMÁGENES DEL ENCABEZADO (imagen del título y logos) NO van aquí:
   se eligen SOLO en css/encabezados.css, por marca (data-marca) y por
   empresa interna (data-empresa), y cambian al iniciar sesión o cambiar de empresa.

   Para agregar una empresa nueva, cambiar su base, su paleta o la activa
   SIN escribir código: doble clic en  herramientas\empresas.bat
   (pregunta los datos y la paleta de colores, la agrega aquí abajo y deja
   lista su regla en css/encabezados.css). También se puede copiar un bloque a mano.

   Qué define cada empresa:
     nombre      -> nombre corto (pestaña del navegador)
     titulo      -> texto grande del encabezado (se ve si css/encabezados.css no
                    le pone imagen)
     subtitulo   -> texto chico debajo del título
     icono       -> (opcional) ícono de la pestaña del navegador (vacío = img/logo.png)
     pie         -> líneas del texto del pie (derechos reservados)
     actividades -> qué hace la empresa (códigos de la tabla actividades).
                    Con EMPRESAS INTERNAS (tabla empresas, Tiendas -> Empresas)
                    manda lo que marca cada empresa interna; esta lista queda
                    como respaldo (base sin el bloque 16 de sql/01):
                      'tienda'      = Entregas de tienda (supermercado: abarrotes,
                                      línea blanca, electrónica...)
                      'encomiendas' = Encomiendas (cajas, bolsas, documentos,
                                      línea blanca...)
                      'transporte'  = Transporte (viajes de personas y mercadería).
                                      Si es la única, "Pedido" se lee "Viaje"
                                      (js/palabras.js, docs/14-transporte.md)
                    Las demás actividades no aparecen en ninguna parte del sistema.
     registroClientes -> (opcional) "¿Eres cliente? Solicita tu usuario" del login.
                    Lo pueden usar los clientes de TODAS las empresas activas con
                    Transporte (la base lo revisa). Sin el campo: el cliente escribe
                    el código de su empresa (02, 03...). '02' = ya va puesta esa
                    empresa (no se pregunta). false = el botón no aparece.
                    El enlace app.html#registro?empresa=02 también la deja puesta.
                    La solicitud se aprueba en Clientes -> "Revisar" (sql/01 bloque 20).
     supabase    -> base de datos de la empresa ({ url, anonKey }).
                    Vacío = la de js/supabase.js. Una empresa nueva usa una base
                    en blanco: sql/00_instalacion_completa.sql
     colores     -> paleta propia. Vacío {} = colores originales de ACACHETE.
                    Se escribe el nombre de la variable de css/variables.css
                    sin los "--", ej.:  'color-naranja': '#9EB568'
                    (herramientas\empresas.bat la arma con 2 colores: principal y acción.)

   Paleta por EMPRESA INTERNA (01, 02... de Tiendas -> Empresas):
     - La elige el Desarrollador al crear o modificar la empresa (Tiendas ->
       Empresas: "Paleta de colores") y queda guardada en la base (sql/01 bloque 21).
     - Al iniciar sesión con un usuario de esa empresa (o cuando el Desarrollador
       cambia a ella) se pintan sus colores encima de los de la marca, reconocida
       por su ID. Al cerrar sesión vuelven los de la marca.
     - COLORES_POR_EMPRESA, más abajo: respaldo escrito a mano (si la base no tiene
       la paleta; la de la base gana).

   Se carga en app.html ANTES que todo lo demás (sin defer), así los
   colores se aplican antes de dibujar la página.
   ================================================== */

// Empresa que usa esta copia del sistema (una de las claves de abajo)
const EMPRESA_ACTIVA = 'acachete';

const EMPRESAS = {

    // ---------- ACACHETE Logistics (base, colores originales) ----------
    'acachete': {
        nombre: 'ACACHETE Logistics',
        titulo: '',
        subtitulo: '',
        // Imágenes del encabezado: css/encabezados.css (html[data-marca="acachete"])
        pie: ['Derechos Reservados Achete Logistics S.A.'],
        actividades: ['tienda', 'encomiendas'],
        supabase: { url: 'https://cfypcaejgdomytgyltdf.supabase.co', anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmeXBjYWVqZ2RvbXl0Z3lsdGRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MjYwMDYsImV4cCI6MjEwNjIwMjAwNn0.vs8RTsi5yg0sCPHA-RajOvV71Dwrh9WV1YGOjEynT2o' },
        colores: {},
    },

    // ---------- Transportes Otoya-Valverde & Asociados ----------
    'otoya-valverde': {
        nombre: 'Otoya-Valverde & Asociados',
        titulo: 'Otoya-Valverde & Asociados',
        subtitulo: 'Panel de Control de Operaciones',
        // Imágenes del encabezado: css/encabezados.css (html[data-marca="otoya-valverde"])
        pie: [
            'Derechos Reservados Achete Logistics S.A.',
            'Propiedad Reservada para Transporte Valverde y Asociados',
        ],
        actividades: ['tienda', 'encomiendas'],
        // ID de la empresa interna de Transportes Otoya (Tiendas -> Empresas: la 02; la 01 es
        // siempre la empresa principal): sus clientes solicitan su usuario desde el login
        registroClientes: '02',
        supabase: { url: '', anonKey: '' },
        // Colores originales de ACACHETE. Paleta verde de la maqueta, lista para
        // usar si se quiere (quitar las // de cada línea):
        colores: {
           //     'color-fondo-oscuro':   '#080A06',
    //     'color-azul-marino':    '#2A2B26',
    //     'color-azul':           '#5A6B34',
    //     'color-azul-claro':     '#EEF1E6',
    //     'color-naranja':        '#5A6B34',
    //     'color-naranja-oscuro': '#48562A',
    //     'color-naranja-claro':  '#E3E8D3',
        },
    },

    // <<< FIN DE EMPRESAS (no borrar esta línea: herramientas/empresas.ps1 agrega las nuevas justo arriba)
};

// Paleta de cada EMPRESA INTERNA, por su ID (el de Tiendas -> Empresas: '02', '03'...).
// Se aplica al iniciar sesión con un usuario de esa empresa y cuando el Desarrollador
// cambia a ella; lo que no se escribe aquí queda con los colores de la marca (arriba).
// La 01 (empresa principal) no lleva paleta: siempre usa los colores originales.
// Mismos nombres que "colores" (variables de css/variables.css sin los "--").
// ⚠ Si se cambia el ID de una empresa, cambiar también aquí su clave.
const COLORES_POR_EMPRESA = {
    // Ejemplo (quitar las // para usarlo con la empresa 02):
    // '02': {
    //     'color-fondo-oscuro':   '#080A06',
    //     'color-azul-marino':    '#2A2B26',
    //     'color-azul':           '#5A6B34',
    //     'color-azul-claro':     '#EEF1E6',
    //     'color-naranja':        '#5A6B34',
    //     'color-naranja-oscuro': '#48562A',
    //     'color-naranja-claro':  '#E3E8D3',
    // },
};

// MODELOS DE PALETA para elegir (UN SOLO LUGAR). Los ofrecen:
//   - Tiendas -> Empresas -> Nueva / Modificar -> "Paleta de colores" (empresas internas)
//   - herramientas\empresas.bat -> Nueva empresa / Paleta (marcas)
// Cada modelo son 2 colores: [principal (menú, encabezado, enlaces), botones]; los otros
// 5 (oscuros y claros) los calcula paletaDesdeColores (más abajo).
// Para agregar uno: copiar una línea y cambiar la clave (sin espacios, no se repite),
// el texto y los 2 colores. ⚠ Una línea por modelo (así la lee la herramienta .bat).
const PALETAS_MODELO = {
    acachete: { texto: 'Azul y naranja (ACACHETE)', colores: ['#1258A6', '#F2660F'] },
    oliva:    { texto: 'Verde oliva y dorado', colores: ['#48562A', '#C8A13A'] },
    otoya:    { texto: 'Verde Otoya', colores: ['#2A2B26', '#5A6B34'] },
    petroleo: { texto: 'Azul petróleo y verde', colores: ['#0F5C8C', '#E3E8D3'] },
    vino:     { texto: 'Vino y dorado', colores: ['#7A1E3A', '#D4A017'] },
    grafito:  { texto: 'Grafito y rojo', colores: ['#3A4652', '#5A6B34'] },
};


// ==================================================
// Desde aquí no hace falta tocar nada
// ==================================================

// ID de la EMPRESA PRINCIPAL (la primera, Tiendas -> Empresas). Siempre es distinta de
// las demás: colores originales de ACACHETE (css/variables.css) y su encabezado
// (css/encabezados.css), en cualquier marca. Las demás empresas parten de la 02.
const EMPRESA_PRINCIPAL = '01';

// Datos de la empresa activa (si la clave no existe, la primera de la lista)
const CLAVE_MARCA = EMPRESAS[EMPRESA_ACTIVA] ? EMPRESA_ACTIVA : Object.keys(EMPRESAS)[0];
const EMPRESA = EMPRESAS[CLAVE_MARCA];

// ¿La empresa realiza esta actividad? (lista vacía = todas)
// Si la sesión tiene empresa interna (tabla empresas, sql/01 bloque 16), manda la
// de esa empresa: solo entregas de tienda, solo encomiendas o las dos.
function empresaTieneActividad(codigo) {
    const deSesion = typeof empresaActual === 'function' ? empresaActual() : null;
    const lista = (deSesion && deSesion.actividades && deSesion.actividades.length ? deSesion.actividades : null)
        || EMPRESA.actividades || [];
    return !lista.length || lista.includes(codigo);
}

// Deja solo las actividades de la empresa: [{ codigo, ... }] -> [{ codigo, ... }]
function actividadesDeLaEmpresa(actividades) {
    return (actividades || []).filter((a) => empresaTieneActividad(a.codigo));
}

// ---------- Viajes o pedidos (sql/01 bloque 19) ----------
// Una actividad con usa_viajes (Transporte) trabaja con VIAJES (sección Viajes, agenda,
// el cliente solicita) y no con pedidos. js/palabras.js trae ese dato de la base y lo
// guarda en el navegador; mientras no lo tenga, se deduce por el código.
function esActividadDeViajes(codigo) {
    const info = typeof palabrasActividades !== 'undefined' ? palabrasActividades[codigo] : null;
    return info && info.viajes != null ? !!info.viajes : codigo === 'transporte';
}

// Códigos de las actividades de la empresa (lista vacía = todas las conocidas)
function codigosActividadesEmpresa() {
    const deSesion = typeof empresaActual === 'function' ? empresaActual() : null;
    const lista = (deSesion && deSesion.actividades && deSesion.actividades.length ? deSesion.actividades : null)
        || EMPRESA.actividades || [];
    if (lista.length) return lista;
    return typeof palabrasActividades !== 'undefined' ? Object.keys(palabrasActividades) : [];
}

// ¿La empresa hace viajes? (sección Viajes, Configuración -> Transporte)
function empresaTieneViajes() {
    return codigosActividadesEmpresa().some(esActividadDeViajes);
}

// ¿La empresa hace pedidos? (Pedidos, Rutas, Cotizador). Una empresa solo de
// Transporte no los ve: su Inicio y sus Reportes muestran los viajes.
function empresaTienePedidos() {
    const codigos = codigosActividadesEmpresa();
    return !codigos.length || codigos.some((c) => !esActividadDeViajes(c));
}

// Actividades de la empresa que trabajan con PEDIDOS (las pestañas de Pedidos, Rutas,
// Reportes y Configuración -> Pedidos)
function actividadesDePedidos(actividades) {
    return actividadesDeLaEmpresa(actividades).filter((a) => !esActividadDeViajes(a.codigo));
}

// ¿La actividad usa esta parte del pedido? (Configuración -> Actividades)
//   usa_bodega, usa_recoleccion, usa_compra, usa_tamanos, permite_alcohol
// Si la base no tiene la columna (falta sql/01_actualizacion_base_existente),
// se deduce por el código, como antes. Lo usan Pedidos y Reportes.
const USO_ANTERIOR = {
    usa_bodega: ['encomiendas'], usa_recoleccion: ['encomiendas'], usa_tamanos: ['encomiendas'],
    usa_compra: ['tienda'], permite_alcohol: ['tienda'],
};
function usaActividad(act, uso) {
    if (!act) return false;
    if (act[uso] !== undefined) return !!act[uso];
    return (USO_ANTERIOR[uso] || []).includes(act.codigo);
}

// Empresa interna de la sesión ({ id, codigo, nombre, actividades, colores }) o null.
// Al cargar la página js/sesion.js todavía no existe: se lee la sesión directo
// (misma clave que CLAVE_SESION de js/sesion.js).
function empresaDeLaSesion() {
    if (typeof empresaActual === 'function') return empresaActual();
    try {
        const sesion = JSON.parse(sessionStorage.getItem(`acachete_sesion_${EMPRESA_ACTIVA}`));
        return sesion && sesion.empresa ? sesion.empresa : null;
    } catch {
        return null;
    }
}

// ---------- Paleta a partir de 2 colores ----------
// El color PRINCIPAL (menú, encabezado, enlaces) y el de ACCIÓN (botones) arman las 7
// variables de la marca (css/variables.css). Lo usa Tiendas -> Empresas (paleta de la
// empresa); herramientas/empresas.ps1 repite la misma fórmula en PowerShell.
//   paletaDesdeColores('#1258A6', '#F2660F') -> { 'color-fondo-oscuro': '#041629', ... }
function mezclarColor(hex, con, cuanto) {
    const a = hex.replace('#', '').match(/../g).map((x) => parseInt(x, 16));
    const b = con.replace('#', '').match(/../g).map((x) => parseInt(x, 16));
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * cuanto).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function paletaDesdeColores(principal, accion) {
    return {
        'color-fondo-oscuro':   mezclarColor(principal, '#000000', 0.75),
        'color-azul-marino':    mezclarColor(principal, '#000000', 0.5),
        'color-azul':           principal.toUpperCase(),
        'color-azul-claro':     mezclarColor(principal, '#FFFFFF', 0.9),
        'color-naranja':        accion.toUpperCase(),
        'color-naranja-oscuro': mezclarColor(accion, '#000000', 0.12),
        'color-naranja-claro':  mezclarColor(accion, '#FFFFFF', 0.85),
    };
}

// Colores originales de css/variables.css ({ 'color-azul': '#1258A6', ... }), leídos de la
// hoja de estilos (así no se copian aquí). Vacío si el navegador no deja leerla.
function coloresOriginales() {
    const colores = {};
    [...document.styleSheets].filter((hoja) => /variables\.css/.test(hoja.href || '')).forEach((hoja) => {
        try {
            [...hoja.cssRules].filter((regla) => regla.selectorText === ':root').forEach((regla) => {
                [...regla.style].filter((prop) => prop.startsWith('--color-'))
                    .forEach((prop) => { colores[prop.slice(2)] = regla.style.getPropertyValue(prop).trim(); });
            });
        } catch {
            // hoja de otro origen o abierta con doble clic: se queda sin la muestra exacta
        }
    });
    return colores;
}

// Colores, del más general al más particular (el de abajo gana):
//   1. css/variables.css (ACACHETE)
//   2. "colores" de la marca (arriba, en EMPRESAS)
//   3. COLORES_POR_EMPRESA[ID] de este archivo (respaldo escrito a mano)
//   4. La paleta de la empresa interna guardada en la base (Tiendas -> Empresas,
//      sql/01 bloque 21): la que se le asignó al crearla
//   Excepción: la EMPRESA PRINCIPAL (01) siempre queda con los colores originales (1).
// Se llama al cargar (antes de dibujar la página) y desde js/sesion.js cada vez que
// cambia la sesión: al iniciar sesión se pinta la paleta de SU empresa; al cambiar de
// empresa (Desarrollador), la de esa; al cerrar sesión vuelven los de la marca.
let coloresPuestos = [];
function aplicarColoresEmpresa() {
    const raiz = document.documentElement.style;
    coloresPuestos.forEach((variable) => raiz.removeProperty(variable));
    const empresa = empresaDeLaSesion();
    // Empresa principal (01): siempre los colores originales (no se pinta nada encima)
    const principal = empresa && empresa.codigo === EMPRESA_PRINCIPAL;
    const colores = principal ? {} : {
        ...(EMPRESA.colores || {}),
        ...((empresa && COLORES_POR_EMPRESA[empresa.codigo]) || {}),
        ...((empresa && empresa.colores) || {}),
    };
    coloresPuestos = Object.entries(colores).map(([nombre, valor]) => {
        const variable = `--${nombre.replace(/^--/, '')}`;
        raiz.setProperty(variable, valor);
        return variable;
    });
}
aplicarColoresEmpresa();

// ---------- Encabezado: qué marca y qué empresa están activas ----------
// Las IMÁGENES del encabezado (imagen del título y logos) están SOLO en
// css/encabezados.css. Aquí se marca en <html>:
//   data-marca   -> la marca de esta copia (EMPRESA_ACTIVA)
//   data-empresa -> el ID de la empresa interna de la sesión ('01'...; sin sesión, no hay)
// y css/encabezados.css elige con ellos las imágenes. Se llama al cargar y desde
// js/sesion.js cada vez que cambia la sesión (entrar, cambiar de empresa, salir).
function aplicarEncabezadoEmpresa() {
    const raiz = document.documentElement;
    raiz.dataset.marca = CLAVE_MARCA;
    const empresa = empresaDeLaSesion();
    if (empresa && empresa.codigo) raiz.dataset.empresa = empresa.codigo;
    else delete raiz.dataset.empresa;

    // ¿Esa marca o empresa tiene imagen de título? Con imagen, el texto no se ve
    const caja = document.querySelector('.titulos-primordial');
    const capa = caja && caja.querySelector('.encabezado-imagen');
    if (capa) caja.classList.toggle('con-imagen', getComputedStyle(capa).backgroundImage !== 'none');
}
aplicarEncabezadoEmpresa();

// Título, ícono de la pestaña y pie: cuando la página ya está armada
document.addEventListener('DOMContentLoaded', () => {
    if (EMPRESA.nombre) document.title = EMPRESA.nombre;

    // Ícono de la pestaña del navegador (no se puede poner desde CSS)
    if (EMPRESA.icono) {
        const favicon = document.querySelector('link[rel="icon"]');
        if (favicon) favicon.href = EMPRESA.icono;
    }

    // Título en texto: se ve si css/encabezados.css no le pone imagen (y lo leen los
    // lectores de pantalla aunque haya imagen)
    const titulo = document.getElementById('titulo-panel');
    const subtitulo = document.getElementById('subti-panel');
    if (titulo) titulo.textContent = EMPRESA.titulo || EMPRESA.nombre || '';
    if (subtitulo) subtitulo.textContent = EMPRESA.subtitulo || '';
    aplicarEncabezadoEmpresa();

    // Pie: una línea por texto
    const pie = document.querySelector('.info-empresa');
    if (pie && Array.isArray(EMPRESA.pie)) {
        pie.replaceChildren();
        EMPRESA.pie.forEach((linea, i) => {
            if (i) pie.appendChild(document.createElement('br'));
            const span = document.createElement('span');
            span.textContent = linea;
            pie.appendChild(span);
        });
    }
});
