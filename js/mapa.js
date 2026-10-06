/* ==================================================
   MAPA Y DISTANCIAS (GRATIS, SIN CLAVE)
   ACACHETE LOGISTICS

   Piezas del mapa que usan varias secciones:
     - Inicio: mapa de pilotos (cargarLeaflet + MAPA_CAPA).
     - Pedidos y Cotizador: mapa "punto A -> punto B" que calcula la
       distancia POR CALLE para el cobro por km (crearMapaRuta).

   Servicios gratuitos (no piden clave ni tarjeta):
     Leaflet        -> la librería que dibuja el mapa (CDN)
     OpenStreetMap  -> el dibujo de las calles (pide mostrar su crédito)
     Nominatim      -> busca una dirección y devuelve el punto (máx. 1 búsqueda
                       por segundo: por eso se busca al presionar "Ubicar",
                       no mientras se escribe)
     OSRM           -> calcula la ruta en carro entre dos puntos (km y minutos)
   Son servidores públicos de uso moderado. Si el sistema crece mucho, se
   cambian aquí (MAPA_SERVICIOS / MAPA_CAPA) por uno propio o de pago sin
   tocar las secciones. Si OSRM no responde, se usa la línea recta × 1.3
   y se avisa que es aproximada.

   Se carga en app.html después de componentes.js.
   ================================================== */

// Centro y acercamiento iniciales (San José, Costa Rica)
const MAPA_CENTRO = { lat: 9.9333, lng: -84.0833 };
const MAPA_ZOOM = 11;
// País donde se buscan las direcciones (código ISO; '' = todo el mundo)
const MAPA_PAIS = 'cr';

const MAPA_LEAFLET = {
    css: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
    js: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
};

// Dibujo de las calles (OpenStreetMap). Su crédito es obligatorio.
const MAPA_CAPA = {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    credito: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    zoomMaximo: 19,
};

const MAPA_SERVICIOS = {
    buscar: 'https://nominatim.openstreetmap.org/search',
    inverso: 'https://nominatim.openstreetmap.org/reverse',
    ruta: 'https://router.project-osrm.org/route/v1/driving',
};

// Si no se puede calcular por calle: línea recta × este factor (aproximado)
const MAPA_FACTOR_RECTA = 1.3;

// ---------- Cargar Leaflet (CSS + JS) una sola vez ----------
let mapaLeafletPromesa = null;
function cargarLeaflet() {
    if (window.L && window.L.map) return Promise.resolve();
    if (mapaLeafletPromesa) return mapaLeafletPromesa;
    // Se espera el CSS y el JS: sin el CSS el mapa se dibuja desordenado
    const estilos = new Promise((listo) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = MAPA_LEAFLET.css;
        css.onload = () => listo();
        css.onerror = () => listo(); // sin estilos igual funciona (se ve peor)
        document.head.appendChild(css);
    });
    const codigo = new Promise((listo, falla) => {
        const s = document.createElement('script');
        s.src = MAPA_LEAFLET.js;
        s.onload = () => listo();
        s.onerror = () => { s.remove(); falla(new Error('No se pudo cargar el mapa (Leaflet)')); };
        document.head.appendChild(s);
    });
    mapaLeafletPromesa = Promise.all([estilos, codigo]).catch((e) => { mapaLeafletPromesa = null; throw e; });
    return mapaLeafletPromesa;
}

// ---------- Nominatim: máximo 1 consulta por segundo ----------
let mapaUltimaConsulta = 0;
async function mapaTurno() {
    const espera = mapaUltimaConsulta + 1100 - Date.now();
    mapaUltimaConsulta = Math.max(Date.now(), mapaUltimaConsulta + 1100);
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
}

// Un punto escrito como coordenadas o enlace de mapas:
//   "9.93, -84.08" | "https://maps.google.com/?q=9.93,-84.08" | ".../@9.93,-84.08,15z"
// Devuelve { lat, lng } o null.
function puntoDeTexto(texto) {
    const m = String(texto || '').match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
    if (!m) return null;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

// Busca una dirección: [{ lat, lng, texto, corto }] (hasta 5; vacío si no encuentra)
//   cerca: zona del mapa que se está viendo ({ oeste, sur, este, norte }): los
//          lugares de ahí salen primero (sin dejar fuera los demás)
// Las búsquedas iguales se recuerdan (no se vuelven a pedir).
const mapaBusquedas = new Map(); // "texto|zona" -> resultados
async function buscarDireccion(texto, { cerca = null } = {}) {
    const punto = puntoDeTexto(texto);
    if (punto) return [{ ...punto, texto: 'Coordenadas escritas', corto: `${punto.lat}, ${punto.lng}` }];
    const q = String(texto || '').trim();
    if (q.length < 3) return [];
    const zona = cerca ? [cerca.oeste, cerca.norte, cerca.este, cerca.sur].map((n) => Number(n).toFixed(3)).join(',') : '';
    const clave = `${q.toLowerCase()}|${zona}`;
    if (mapaBusquedas.has(clave)) return mapaBusquedas.get(clave);
    await mapaTurno();
    const p = new URLSearchParams({ q, format: 'jsonv2', limit: '5', 'accept-language': 'es' });
    if (MAPA_PAIS) p.set('countrycodes', MAPA_PAIS);
    if (zona) { p.set('viewbox', zona); p.set('bounded', '0'); }
    const r = await fetch(`${MAPA_SERVICIOS.buscar}?${p}`);
    if (!r.ok) throw new Error(`Búsqueda de direcciones: ${r.status}`);
    const datos = await r.json();
    const lista = datos.map((d) => ({
        lat: Number(d.lat), lng: Number(d.lon), texto: d.display_name,
        // Nombre corto para el campo: las 3 primeras partes ("Escalante, Carmen, San José")
        corto: d.display_name.split(',').slice(0, 3).map((s) => s.trim()).join(', '),
    }));
    mapaBusquedas.set(clave, lista);
    return lista;
}

// ¿El texto del campo es el de una sugerencia ya elegida? (así no se vuelve a buscar
// al salir del campo, que movería el punto que el usuario eligió)
const entradaYaUbicada = (input) => !!input && input.dataset.ubicado === input.value;

// ==================================================
// SUGERENCIAS MIENTRAS SE ESCRIBE (lista bajo el campo)
// Busca después de una pausa corta (Nominatim: 1 búsqueda por segundo) y da
// prioridad a los lugares de la zona que se ve en el mapa (cerca()).
// Teclado: ↑ ↓ para moverse, Enter para elegir, Escape para cerrar.
//   sugerirDirecciones(input, { cerca: () => zona | null, alElegir: (lugar) => {} })
// Estilos: .mapa-sugerencias en css/componentes.css
// ==================================================
const MAPA_PAUSA_SUGERIR = 700; // ms sin escribir antes de buscar

function sugerirDirecciones(input, { cerca = () => null, alElegir = () => {} } = {}) {
    const caja = input.parentElement;
    caja.classList.add('mapa-sugerir-caja');
    const lista = document.createElement('ul');
    lista.className = 'mapa-sugerencias';
    lista.setAttribute('role', 'listbox');
    lista.hidden = true;
    input.insertAdjacentElement('afterend', lista);
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-autocomplete', 'list');

    let espera = null;
    let turno = 0;
    let resultados = [];
    let marcado = -1;

    const cerrar = () => { lista.hidden = true; marcado = -1; };

    function mostrar(items, aviso = '') {
        lista.replaceChildren();
        resultados = items;
        marcado = -1;
        if (aviso) {
            const li = document.createElement('li');
            li.className = 'mapa-sugerencias-aviso';
            li.textContent = aviso;
            lista.appendChild(li);
        }
        items.forEach((r, i) => {
            const li = document.createElement('li');
            li.setAttribute('role', 'option');
            li.dataset.i = i;
            const fuerte = document.createElement('strong');
            fuerte.textContent = r.corto || r.texto;
            const chico = document.createElement('small');
            chico.textContent = r.texto;
            li.append(fuerte, chico);
            lista.appendChild(li);
        });
        // La lista va justo debajo del campo
        lista.style.top = `${input.offsetTop + input.offsetHeight + 2}px`;
        lista.hidden = !items.length && !aviso;
    }

    function elegir(i) {
        const r = resultados[i];
        if (!r) return;
        input.value = r.corto || r.texto;
        input.dataset.ubicado = input.value;
        cerrar();
        alElegir(r);
    }

    function marcar(i) {
        const items = lista.querySelectorAll('li[role="option"]');
        if (!items.length) return;
        marcado = (i + items.length) % items.length;
        items.forEach((li, j) => li.classList.toggle('activo', j === marcado));
        items[marcado].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('input', () => {
        delete input.dataset.ubicado; // el texto cambió: ya no es la sugerencia elegida
        clearTimeout(espera);
        const texto = input.value.trim();
        if (texto.length < 4 || puntoDeTexto(texto)) { cerrar(); return; }
        espera = setTimeout(async () => {
            const mio = ++turno;
            mostrar([], 'Buscando...');
            try {
                const items = await buscarDireccion(texto, { cerca: cerca() });
                if (mio !== turno || input.value.trim() !== texto) return; // ya escribió otra cosa
                if (document.activeElement !== input) { cerrar(); return; }
                mostrar(items, items.length ? '' : 'Sin resultados: prueba con barrio y cantón, o marca el punto en el mapa.');
            } catch (e) {
                if (mio === turno) mostrar([], 'No se pudo buscar (revisa internet).');
            }
        }, MAPA_PAUSA_SUGERIR);
    });

    input.addEventListener('keydown', (e) => {
        if (lista.hidden) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); marcar(marcado + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); marcar(marcado - 1); }
        else if (e.key === 'Enter' && marcado >= 0) { e.preventDefault(); elegir(marcado); }
        else if (e.key === 'Escape') cerrar();
    });

    // mousedown (y no click): se elige antes de que el campo pierda el foco
    lista.addEventListener('mousedown', (e) => {
        const li = e.target.closest('li[role="option"]');
        if (!li) return;
        e.preventDefault();
        elegir(Number(li.dataset.i));
    });

    input.addEventListener('blur', () => setTimeout(cerrar, 150));
}

// Nombre del lugar de un punto (cuando se marca con clic en el mapa)
async function direccionDePunto(punto) {
    try {
        await mapaTurno();
        const p = new URLSearchParams({ lat: punto.lat, lon: punto.lng, format: 'jsonv2', zoom: '17', 'accept-language': 'es' });
        const r = await fetch(`${MAPA_SERVICIOS.inverso}?${p}`);
        if (!r.ok) return '';
        return (await r.json()).display_name || '';
    } catch (e) {
        return '';
    }
}

// Distancia en línea recta (km)
function kmEnLineaRecta(a, b) {
    const rad = (g) => (g * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// Ruta en carro de A a B: { km, minutos, linea: [[lat, lng], ...], aproximada }
// Si OSRM no responde: línea recta × MAPA_FACTOR_RECTA (aproximada = true).
async function rutaEntre(a, b) {
    const redondo = (n) => Math.round(n * 10) / 10;
    try {
        const url = `${MAPA_SERVICIOS.ruta}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
        const r = await fetch(url);
        const datos = r.ok ? await r.json() : null;
        const ruta = datos && datos.code === 'Ok' && datos.routes && datos.routes[0];
        if (ruta) {
            return {
                km: redondo(ruta.distance / 1000),
                minutos: Math.round(ruta.duration / 60),
                linea: ruta.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
                aproximada: false,
            };
        }
    } catch (e) {
        console.warn('No se pudo calcular la ruta por calle:', e);
    }
    return { km: redondo(kmEnLineaRecta(a, b) * MAPA_FACTOR_RECTA), minutos: null, linea: [[a.lat, a.lng], [b.lat, b.lng]], aproximada: true };
}

// Enlaces para navegar (los abre el piloto en su celular; no necesitan clave)
function enlacesNavegacion(a, b) {
    const destino = `${b.lat},${b.lng}`;
    return {
        google: `https://www.google.com/maps/dir/?api=1${a ? `&origin=${a.lat},${a.lng}` : ''}&destination=${destino}&travelmode=driving`,
        waze: `https://waze.com/ul?ll=${destino}&navigate=yes`,
    };
}

// ==================================================
// MAPA "PUNTO A -> PUNTO B"
// Uso:
//   const mapa = crearMapaRuta(zona.querySelector('#miCaja'), {
//       etiquetaA: 'Punto de partida', etiquetaB: 'Entrega',
//       textoA: () => inputA.value,   // qué buscar al presionar "Ubicar A"
//       textoB: () => inputB.value,
//       entradaA: inputA, entradaB: inputB, // (opcional) sugerencias mientras se escribe
//       alCambiar: (ruta) => { ... },  // { km, minutos, aproximada } o null
//   });
//   mapa.ponerA({ lat, lng }) / mapa.ponerB(...)   -> pone un punto (sin buscar)
//   mapa.ubicarA() / mapa.ubicarB()                 -> busca el texto y pone el punto
//   mapa.puntos() -> { a, b } · mapa.ruta() -> la última ruta · mapa.limpiar()
//   mapa.destruir()  -> en la limpieza de la sección
// Se puede: buscar la dirección, marcar con un clic en el mapa, arrastrar
// los puntos, o pegar coordenadas / un enlace de Google Maps en el texto.
// Estilos: .mapa-ruta en css/componentes.css
// ==================================================
function crearMapaRuta(caja, opciones = {}) {
    const o = {
        etiquetaA: 'Salida', etiquetaB: 'Entrega',
        textoA: () => '', textoB: () => '',
        entradaA: null, entradaB: null,
        alCambiar: () => {},
        ...opciones,
    };
    const puntos = { a: null, b: null };
    let ruta = null;
    let mapa = null;
    let marcas = { a: null, b: null };
    let linea = null;
    let vigia = null;
    let pendiente = 0;   // para ignorar rutas viejas si se mueve rápido
    let proximoClic = 'b';
    let resultados = { lado: null, lista: [] };

    // ---------- Armado (textos con textContent) ----------
    caja.replaceChildren();
    caja.classList.add('mapa-ruta');
    const el = (tag, clase, texto) => {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    };
    const boton = (clase, icono, texto) => {
        const b = el('button', `boton boton-secundario boton-chico ${clase}`);
        b.type = 'button';
        const i = el('i', `bi ${icono}`);
        b.append(i, el('span', null, texto));
        return b;
    };

    const barra = el('div', 'mapa-ruta-barra');
    const botonA = boton('mapa-ruta-ubicar', 'bi-search', '');
    const botonB = boton('mapa-ruta-ubicar', 'bi-search', '');
    const clic = el('div', 'mapa-ruta-clic');
    clic.setAttribute('role', 'group');
    clic.append(el('span', null, 'Clic en el mapa pone:'));
    const radios = {};
    ['a', 'b'].forEach((lado) => {
        const label = el('label', `mapa-ruta-lado mapa-ruta-lado-${lado}`);
        const r = el('input');
        r.type = 'radio';
        r.name = `mapaRutaClic${Math.random().toString(36).slice(2, 7)}`;
        r.value = lado;
        r.addEventListener('change', () => { proximoClic = lado; });
        radios[lado] = r;
        label.append(r, el('b', null, lado.toUpperCase()));
        clic.appendChild(label);
    });
    // Los radios de A y B deben compartir el mismo "name"
    radios.b.name = radios.a.name;
    radios.b.checked = true;
    // Ampliar: el mapa crece (útil en celular para poner los puntos con el dedo)
    const botonAmpliar = boton('mapa-ruta-ampliar', 'bi-arrows-angle-expand', 'Ampliar mapa');
    botonAmpliar.setAttribute('aria-pressed', 'false');
    botonAmpliar.addEventListener('click', () => {
        const grande = caja.classList.toggle('mapa-ruta-grande');
        botonAmpliar.setAttribute('aria-pressed', String(grande));
        botonAmpliar.querySelector('i').className = `bi ${grande ? 'bi-arrows-angle-contract' : 'bi-arrows-angle-expand'}`;
        botonAmpliar.querySelector('span').textContent = grande ? 'Achicar mapa' : 'Ampliar mapa';
        if (mapa) setTimeout(() => { mapa.invalidateSize(); encuadrar(); }, 50);
        if (grande) lienzo.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    barra.append(botonA, botonB, clic, botonAmpliar);

    const opcionesBusqueda = el('select', 'campo-input mapa-ruta-opciones');
    opcionesBusqueda.hidden = true;
    opcionesBusqueda.setAttribute('aria-label', 'Resultados de la búsqueda');
    const lienzo = el('div', 'mapa-ruta-mapa');
    lienzo.setAttribute('aria-label', 'Mapa de la ruta');
    const estado = el('p', 'mapa-ruta-estado');
    caja.append(barra, opcionesBusqueda, lienzo, estado);

    function textosBotones() {
        botonA.querySelector('span').textContent = `Ubicar A · ${o.etiquetaA}`;
        botonB.querySelector('span').textContent = `Ubicar B · ${o.etiquetaB}`;
        radios.a.parentElement.title = o.etiquetaA;
        radios.b.parentElement.title = o.etiquetaB;
    }
    textosBotones();

    // ---------- Estado de abajo: distancia + enlaces ----------
    function pintarEstado(texto, tipo = '') {
        estado.replaceChildren();
        estado.className = `mapa-ruta-estado ${tipo}`;
        if (texto) { estado.textContent = texto; return; }
        if (!puntos.a || !puntos.b) {
            estado.textContent = !puntos.a && !puntos.b
                ? `Ubica A (${o.etiquetaA}) y B (${o.etiquetaB}): con "Ubicar", con un clic en el mapa o pegando coordenadas.`
                : `Falta ubicar ${!puntos.a ? `A (${o.etiquetaA})` : `B (${o.etiquetaB})`}.`;
            return;
        }
        if (!ruta) { estado.textContent = 'Calculando la distancia...'; return; }
        const fuerte = el('strong', null, `${ruta.km} km`);
        estado.append('Distancia: ', fuerte,
            ruta.minutos != null ? ` · unos ${ruta.minutos} min en carro` : '',
            ruta.aproximada ? ' (aproximada: no se pudo calcular por calle)' : ' por calle');
        const nav = enlacesNavegacion(puntos.a, puntos.b);
        const enlace = (href, texto) => {
            const a = el('a', null, texto);
            a.href = href;
            a.target = '_blank';
            a.rel = 'noopener';
            return a;
        };
        estado.append(' · ', enlace(nav.google, 'Ver en Google Maps'), ' · ', enlace(nav.waze, 'Waze'));
    }

    // ---------- Puntos y ruta ----------
    function icono(lado) {
        return window.L.divIcon({
            className: `mapa-ruta-marca mapa-ruta-marca-${lado}`,
            html: `<span>${lado.toUpperCase()}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 28],
        });
    }

    function dibujarPunto(lado) {
        if (!mapa) return;
        const p = puntos[lado];
        if (!p) {
            if (marcas[lado]) { marcas[lado].remove(); marcas[lado] = null; }
            return;
        }
        if (!marcas[lado]) {
            marcas[lado] = window.L.marker([p.lat, p.lng], { icon: icono(lado), draggable: true, title: lado === 'a' ? o.etiquetaA : o.etiquetaB })
                .addTo(mapa);
            marcas[lado].on('dragend', () => {
                const ll = marcas[lado].getLatLng();
                puntos[lado] = { lat: ll.lat, lng: ll.lng };
                recalcular();
            });
        } else {
            marcas[lado].setLatLng([p.lat, p.lng]);
        }
    }

    function encuadrar() {
        if (!mapa) return;
        const lista = ['a', 'b'].map((l) => puntos[l]).filter(Boolean).map((p) => [p.lat, p.lng]);
        if (linea) lista.push(...linea.getLatLngs().map((ll) => [ll.lat, ll.lng]));
        if (lista.length === 1) mapa.setView(lista[0], 15);
        else if (lista.length > 1) mapa.fitBounds(lista, { padding: [30, 30], maxZoom: 16 });
    }

    async function recalcular() {
        const turno = ++pendiente;
        ruta = null;
        if (linea) { linea.remove(); linea = null; }
        ['a', 'b'].forEach(dibujarPunto);
        pintarEstado();
        if (!puntos.a || !puntos.b) {
            encuadrar();
            o.alCambiar(null);
            return;
        }
        const r = await rutaEntre(puntos.a, puntos.b);
        if (turno !== pendiente) return; // se movió otra vez mientras calculaba
        ruta = r;
        if (mapa) {
            linea = window.L.polyline(r.linea, { color: '#2a78d6', weight: 5, opacity: 0.8, dashArray: r.aproximada ? '8 8' : null }).addTo(mapa);
        }
        encuadrar();
        pintarEstado();
        o.alCambiar({ km: r.km, minutos: r.minutos, aproximada: r.aproximada });
    }

    function poner(lado, punto) {
        puntos[lado] = punto ? { lat: Number(punto.lat), lng: Number(punto.lng) } : null;
        // El siguiente clic va al punto que falte
        if (lado === 'a' && puntos.a && !puntos.b) { radios.b.checked = true; proximoClic = 'b'; }
        return recalcular();
    }

    // Zona que se ve en el mapa: las búsquedas dan prioridad a los lugares de ahí
    function zonaVisible() {
        if (!mapa) return null;
        const z = mapa.getBounds();
        return { oeste: z.getWest(), sur: z.getSouth(), este: z.getEast(), norte: z.getNorth() };
    }

    async function ubicar(lado) {
        const texto = (lado === 'a' ? o.textoA() : o.textoB()) || '';
        if (!texto.trim()) {
            pintarEstado(`Escribe primero la dirección de ${lado === 'a' ? o.etiquetaA : o.etiquetaB}, o marca el punto con un clic en el mapa.`, 'error');
            return;
        }
        pintarEstado('Buscando la dirección...');
        let lista = [];
        try {
            lista = await buscarDireccion(texto, { cerca: zonaVisible() });
        } catch (e) {
            console.error(e);
            pintarEstado('No se pudo buscar la dirección (revisa internet). Puedes marcar el punto con un clic en el mapa.', 'error');
            return;
        }
        if (!lista.length) {
            opcionesBusqueda.hidden = true;
            pintarEstado(`No se encontró "${texto}". Escribe barrio y cantón (ej. "Barrio Escalante, San José"), o marca el punto con un clic en el mapa.`, 'error');
            return;
        }
        // Varios resultados: se pone el primero y se puede elegir otro en la lista
        resultados = { lado, lista };
        opcionesBusqueda.replaceChildren(...lista.map((r, i) => new Option(`${lado.toUpperCase()}: ${r.texto}`, i)));
        opcionesBusqueda.hidden = lista.length <= 1;
        await poner(lado, lista[0]);
    }

    opcionesBusqueda.addEventListener('change', () => {
        const r = resultados.lista[Number(opcionesBusqueda.value)];
        if (r) poner(resultados.lado, r);
    });
    botonA.addEventListener('click', () => ubicar('a'));
    botonB.addEventListener('click', () => ubicar('b'));

    // Sugerencias mientras se escribe: al elegir una, el punto se pone en el mapa
    if (o.entradaA) sugerirDirecciones(o.entradaA, { cerca: zonaVisible, alElegir: (r) => { opcionesBusqueda.hidden = true; poner('a', r); } });
    if (o.entradaB) sugerirDirecciones(o.entradaB, { cerca: zonaVisible, alElegir: (r) => { opcionesBusqueda.hidden = true; poner('b', r); } });

    // ---------- Crear el mapa ----------
    cargarLeaflet().then(() => {
        if (!lienzo.isConnected && !caja.isConnected) return;
        // La rueda del mouse no acerca el mapa hasta hacer clic en él (así se puede
        // bajar por la página sin que el mapa "atrape" la rueda)
        mapa = window.L.map(lienzo, { scrollWheelZoom: false }).setView([MAPA_CENTRO.lat, MAPA_CENTRO.lng], MAPA_ZOOM);
        window.L.tileLayer(MAPA_CAPA.url, { maxZoom: MAPA_CAPA.zoomMaximo, attribution: MAPA_CAPA.credito }).addTo(mapa);
        mapa.on('focus click', () => mapa.scrollWheelZoom.enable());
        mapa.on('mouseout', () => mapa.scrollWheelZoom.disable());
        mapa.on('click', (e) => {
            opcionesBusqueda.hidden = true;
            poner(proximoClic, { lat: e.latlng.lat, lng: e.latlng.lng });
        });
        // Si el mapa estaba oculto o cambia de tamaño, se reacomoda
        if (window.ResizeObserver) {
            vigia = new ResizeObserver(() => { if (mapa) mapa.invalidateSize(); });
            vigia.observe(lienzo);
        }
        recalcular();
    }).catch((e) => {
        console.error(e);
        pintarEstado('No se pudo cargar el mapa (revisa internet).', 'error');
    });
    pintarEstado();

    return {
        ponerA: (p) => poner('a', p),
        ponerB: (p) => poner('b', p),
        ubicarA: () => ubicar('a'),
        ubicarB: () => ubicar('b'),
        puntos: () => ({ a: puntos.a, b: puntos.b }),
        ruta: () => ruta,
        etiquetas(a, b) { o.etiquetaA = a; o.etiquetaB = b; textosBotones(); pintarEstado(); },
        limpiar() { puntos.a = null; puntos.b = null; opcionesBusqueda.hidden = true; return recalcular(); },
        destruir() {
            if (vigia) vigia.disconnect();
            if (mapa) mapa.remove();
            mapa = null;
        },
    };
}
