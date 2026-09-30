/* ==================================================
   EMPRESAS (MULTIMARCA)
   ACACHETE LOGISTICS

   El mismo sistema sirve a varias empresas. Cada empresa se define
   AQUÍ, en VS Code (no desde la página), y se elige cuál usa esta
   copia del sistema con EMPRESA_ACTIVA.

   Para agregar una empresa nueva SIN escribir código:
       python python/nueva_empresa.py
   (pregunta el nombre y qué actividad realiza, y la agrega aquí abajo).
   También se puede copiar un bloque a mano.

   Qué define cada empresa:
     nombre      -> nombre corto (pestaña del navegador)
     titulo      -> texto grande del encabezado
     subtitulo   -> texto chico debajo del título
     (Los logos y el fondo del logo se cambian en css/index.css:
      .logo-img-1, .logo-img-2, #log-sec y .logo-slog)
     encabezado  -> imagen que REEMPLAZA el título ('' = usar el texto)
     pie         -> líneas del texto del pie (derechos reservados)
     actividades -> qué hace la empresa (códigos de la tabla actividades):
                      'tienda'      = Entregas de tienda (supermercado: abarrotes,
                                      línea blanca, electrónica...)
                      'encomiendas' = Encomiendas (cajas, bolsas, documentos,
                                      línea blanca...)
                    Las demás actividades no aparecen en ninguna parte del sistema.
     supabase    -> base de datos de la empresa ({ url, anonKey }).
                    Vacío = la de js/supabase.js. Una empresa nueva usa una base
                    en blanco: sql/00_instalacion_completa.sql
     colores     -> paleta propia. Vacío {} = colores originales de ACACHETE.
                    Se escribe el nombre de la variable de css/variables.css
                    sin los "--", ej.:  'color-naranja': '#9EB568'
                    (La paleta se genera con ayuda: pídela indicando la empresa.)

   Se carga en index.html ANTES que todo lo demás (sin defer), así los
   colores se aplican antes de dibujar la página.
   ================================================== */

// Empresa que usa esta copia del sistema (una de las claves de abajo)
const EMPRESA_ACTIVA = 'otoya-valverde';

const EMPRESAS = {

    // ---------- ACACHETE Logistics (base, colores originales) ----------
    'acachete': {
        nombre: 'ACACHETE Logistics',
        titulo: 'ACACHETE Logistics',
        subtitulo: 'Panel de Control de Operaciones',
        encabezado: '',
        pie: ['Derechos Reservados Achete Logistics S.A.'],
        actividades: ['tienda', 'encomiendas'],
        supabase: { url: '', anonKey: '' },
        colores: {},
    },

    // ---------- Transportes Otoya-Valverde & Asociados ----------
    'otoya-valverde': {
        nombre: 'Otoya-Valverde & Asociados',
        titulo: 'Otoya-Valverde & Asociados',
        subtitulo: 'Panel de Control de Operaciones',
        encabezado: 'img/img-encabezado.jpg',
        pie: [
            'Derechos Reservados Achete Logistics S.A.',
            'Propiedad Reservada para Transporte Valverde y Asociados',
        ],
        actividades: ['tienda', 'encomiendas'],
        supabase: { url: '', anonKey: '' },
        // Colores originales de ACACHETE. Paleta verde de la maqueta, lista para
        // usar si se quiere (quitar las // de cada línea):
        colores: {
            // 'color-fondo-oscuro':   '#080A06',
            // 'color-azul-marino':    '#2A2B26',
            // 'color-azul':           '#5A6B34',
            // 'color-azul-claro':     '#EEF1E6',
            // 'color-naranja':        '#5A6B34',
            // 'color-naranja-oscuro': '#48562A',
            // 'color-naranja-claro':  '#E3E8D3',
        },
    },

    // <<< FIN DE EMPRESAS (no borrar esta línea: python/nueva_empresa.py agrega las nuevas justo arriba)
};


// ==================================================
// Desde aquí no hace falta tocar nada
// ==================================================

// Datos de la empresa activa (si la clave no existe, la primera de la lista)
const EMPRESA = EMPRESAS[EMPRESA_ACTIVA] || EMPRESAS[Object.keys(EMPRESAS)[0]];

// ¿La empresa realiza esta actividad? (lista vacía = todas)
function empresaTieneActividad(codigo) {
    const lista = EMPRESA.actividades || [];
    return !lista.length || lista.includes(codigo);
}

// Deja solo las actividades de la empresa: [{ codigo, ... }] -> [{ codigo, ... }]
function actividadesDeLaEmpresa(actividades) {
    return (actividades || []).filter((a) => empresaTieneActividad(a.codigo));
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

// Colores: se aplican enseguida (antes de dibujar la página)
Object.entries(EMPRESA.colores || {}).forEach(([nombre, valor]) => {
    document.documentElement.style.setProperty(`--${nombre.replace(/^--/, '')}`, valor);
});

// Logo, título y pie: cuando la página ya está armada
document.addEventListener('DOMContentLoaded', () => {
    if (EMPRESA.nombre) document.title = EMPRESA.nombre;

    // Título: imagen de encabezado o texto
    const caja = document.querySelector('.titulos-primordial');
    const titulo = document.getElementById('titulo-panel');
    const subtitulo = document.getElementById('subti-panel');
    if (caja && titulo) {
        if (EMPRESA.encabezado) {
            const img = document.createElement('img');
            img.src = EMPRESA.encabezado;
            img.alt = EMPRESA.titulo || EMPRESA.nombre || '';
            titulo.replaceChildren(img);
            caja.classList.add('con-imagen');
        } else {
            titulo.textContent = EMPRESA.titulo || EMPRESA.nombre || '';
            if (subtitulo) subtitulo.textContent = EMPRESA.subtitulo || '';
        }
    }

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
