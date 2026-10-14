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
//   mapa.ponerA({ lat, lng }) / mapa.ponerB(...)   -> pone un punto (sin buscar; gana a una búsqueda en curso)
//   mapa.ubicarA() / mapa.ubicarB()                 -> busca el texto y pone el punto
//   mapa.puntos() -> { a, b } · mapa.ruta() -> la última ruta · mapa.limpiar()
//   mapa.destruir()  -> en la limpieza de la sección
// Se puede: escribir la dirección (sugerencias), "Elegir A / B" (mapa a pantalla completa
// con pin fijo y "Mi ubicación": elegirPuntoEnMapa), clic en el mapa chico (abre lo mismo),
// arrastrar los puntos (con mouse), o pegar coordenadas / un enlace de Google Maps.
// En pantallas táctiles el mapa chico no se arrastra: la página baja con el dedo.
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
    const busqueda = { a: 0, b: 0 }; // para ignorar una búsqueda de dirección si mientras tanto se puso ese punto a mano
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

    // "Elegir A / B en el mapa": abre el mapa a pantalla completa con un pin fijo en el
    // centro (elegirPuntoEnMapa, más abajo). Sirve igual con el dedo que con el mouse.
    const barra = el('div', 'mapa-ruta-barra');
    const botonA = boton('mapa-ruta-elegir mapa-ruta-elegir-a', 'bi-pin-map', '');
    const botonB = boton('mapa-ruta-elegir mapa-ruta-elegir-b', 'bi-pin-map', '');
    barra.append(botonA, botonB);

    const opcionesBusqueda = el('select', 'campo-input mapa-ruta-opciones');
    opcionesBusqueda.hidden = true;
    opcionesBusqueda.setAttribute('aria-label', 'Resultados de la búsqueda');
    const lienzo = el('div', 'mapa-ruta-mapa');
    lienzo.setAttribute('aria-label', 'Mapa de la ruta');
    // En pantallas táctiles el mapa chico no se arrastra (así la página baja con el dedo):
    // un toque lo abre a pantalla completa
    const tactil = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (tactil) lienzo.appendChild(el('span', 'mapa-ruta-toque', 'Toca el mapa para elegir el punto'));
    const estado = el('p', 'mapa-ruta-estado');
    caja.append(barra, opcionesBusqueda, lienzo, estado);

    function textosBotones() {
        botonA.querySelector('span').textContent = `${puntos.a ? 'Cambiar' : 'Elegir'} A · ${o.etiquetaA}`;
        botonB.querySelector('span').textContent = `${puntos.b ? 'Cambiar' : 'Elegir'} B · ${o.etiquetaB}`;
    }
    textosBotones();

    // Abre el selector a pantalla completa para A o B. desde: punto donde empezar (clic en el mapa chico)
    async function elegir(lado, desde = null) {
        const texto = ((lado === 'a' ? o.textoA() : o.textoB()) || '').trim();
        const r = await elegirPuntoEnMapa({
            titulo: `${lado.toUpperCase()} · ${lado === 'a' ? o.etiquetaA : o.etiquetaB}`,
            lado,
            inicial: desde || puntos[lado] || null,
            buscar: desde || puntos[lado] ? '' : texto,
            cerca: zonaVisible(),
        });
        if (!r) return;
        opcionesBusqueda.hidden = true;
        busqueda[lado]++;
        poner(lado, r);
    }

    // ---------- Estado de abajo: distancia + enlaces ----------
    function pintarEstado(texto, tipo = '') {
        estado.replaceChildren();
        estado.className = `mapa-ruta-estado ${tipo}`;
        if (texto) { estado.textContent = texto; return; }
        if (!puntos.a || !puntos.b) {
            estado.textContent = !puntos.a && !puntos.b
                ? `Ubica A (${o.etiquetaA}) y B (${o.etiquetaB}): escribe la dirección, toca "Elegir" o pega coordenadas.`
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
            marcas[lado] = window.L.marker([p.lat, p.lng], { icon: icono(lado), draggable: !tactil, title: lado === 'a' ? o.etiquetaA : o.etiquetaB })
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
        textosBotones();
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
            pintarEstado(`Escribe primero la dirección de ${lado === 'a' ? o.etiquetaA : o.etiquetaB}, o toca "Elegir ${lado.toUpperCase()}" para marcarlo en el mapa.`, 'error');
            return;
        }
        pintarEstado('Buscando la dirección...');
        const turno = ++busqueda[lado];
        let lista = [];
        try {
            lista = await buscarDireccion(texto, { cerca: zonaVisible() });
        } catch (e) {
            console.error(e);
            if (turno === busqueda[lado]) pintarEstado(`No se pudo buscar la dirección (revisa internet). Puedes marcar el punto con "Elegir ${lado.toUpperCase()}".`, 'error');
            return;
        }
        if (turno !== busqueda[lado]) return; // mientras buscaba, el punto se puso a mano: gana ese
        if (!lista.length) {
            opcionesBusqueda.hidden = true;
            pintarEstado(`No se encontró "${texto}". Escribe barrio y cantón (ej. "Barrio Escalante, San José"), o toca "Elegir ${lado.toUpperCase()}" y márcalo en el mapa.`, 'error');
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
    botonA.addEventListener('click', () => elegir('a'));
    botonB.addEventListener('click', () => elegir('b'));
    // El punto que toca elegir con un clic en el mapa chico: el que falte (B primero)
    const ladoDelClic = () => (!puntos.b ? 'b' : !puntos.a ? 'a' : 'b');

    // Sugerencias mientras se escribe: al elegir una, el punto se pone en el mapa
    if (o.entradaA) sugerirDirecciones(o.entradaA, { cerca: zonaVisible, alElegir: (r) => { opcionesBusqueda.hidden = true; busqueda.a++; poner('a', r); } });
    if (o.entradaB) sugerirDirecciones(o.entradaB, { cerca: zonaVisible, alElegir: (r) => { opcionesBusqueda.hidden = true; busqueda.b++; poner('b', r); } });

    // ---------- Crear el mapa ----------
    cargarLeaflet().then(() => {
        if (!lienzo.isConnected && !caja.isConnected) return;
        // La rueda del mouse no acerca el mapa hasta hacer clic en él (así se puede
        // bajar por la página sin que el mapa "atrape" la rueda)
        // Táctil: el mapa chico es solo para ver (no atrapa el dedo); un toque abre el selector
        mapa = window.L.map(lienzo, {
            scrollWheelZoom: false,
            dragging: !tactil, touchZoom: !tactil, doubleClickZoom: !tactil, boxZoom: !tactil, keyboard: !tactil,
        }).setView([MAPA_CENTRO.lat, MAPA_CENTRO.lng], MAPA_ZOOM);
        window.L.tileLayer(MAPA_CAPA.url, { maxZoom: MAPA_CAPA.zoomMaximo, attribution: MAPA_CAPA.credito }).addTo(mapa);
        mapa.on('focus click', () => mapa.scrollWheelZoom.enable());
        mapa.on('mouseout', () => mapa.scrollWheelZoom.disable());
        // Clic en el mapa chico: abre el selector en ese lugar (o en el punto, si ya está)
        mapa.on('click', (e) => {
            const lado = ladoDelClic();
            elegir(lado, tactil && puntos[lado] ? null : { lat: e.latlng.lat, lng: e.latlng.lng });
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
        ponerA: (p) => { busqueda.a++; return poner('a', p); },
        ponerB: (p) => { busqueda.b++; return poner('b', p); },
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

// ==================================================
// MI UBICACIÓN (GPS del celular o la PC)
//   miUbicacionGps() -> promesa { lat, lng, precision (metros) }; error con mensaje claro
// ==================================================
function miUbicacionGps() {
    return new Promise((resolver, rechazar) => {
        if (!navigator.geolocation) {
            rechazar(new Error('Este navegador no puede dar la ubicación.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (p) => resolver({ lat: p.coords.latitude, lng: p.coords.longitude, precision: Math.round(p.coords.accuracy || 0) }),
            (e) => rechazar(new Error(e.code === 1
                ? 'No hay permiso para usar la ubicación. Actívalo en el navegador (o mueve el mapa hasta tu casa).'
                : 'No se pudo obtener la ubicación. Revisa que el GPS esté encendido o mueve el mapa hasta el lugar.')),
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
        );
    });
}

// ==================================================
// ELEGIR UN PUNTO A PANTALLA COMPLETA (pin fijo en el centro)
//   Se mueve el MAPA debajo del pin (como en las apps de taxi) y se toca "Confirmar".
//   Arriba: buscador de direcciones (con sugerencias). Abajo: el lugar donde está el pin,
//   "Mi ubicación" (GPS) y "Confirmar".
//   elegirPuntoEnMapa({ titulo, lado: 'a' | 'b' | '', inicial: { lat, lng }, buscar: 'texto',
//                       cerca: zona, gps: true (pide el GPS al abrir), confirmar: 'texto del botón' })
//     -> promesa { lat, lng, precision } o null si se cerró sin confirmar.
//        precision: metros del GPS, solo si se confirmó sin mover el mapa después del GPS.
//   La usan crearMapaRuta ("Elegir A / B") y la página del cliente (ubicacion.html).
//   Estilos: .mapa-elegir en css/componentes.css
// ==================================================
function elegirPuntoEnMapa(opciones = {}) {
    const o = { titulo: 'Elegir el punto', lado: '', inicial: null, buscar: '', cerca: null, gps: false, confirmar: 'Confirmar este punto', ...opciones };
    return new Promise((resolver) => {
        let resultado = null;
        let mapa = null;
        let circulo = null;
        let precision = null;      // metros del último GPS (se borra si se mueve el mapa)
        let moviendoPorGps = false;
        let esperaLugar = null;
        let turnoLugar = 0;

        const d = document.createElement('dialog');
        d.className = `mapa-elegir${o.lado ? ` mapa-elegir-${o.lado}` : ''}`;
        d.setAttribute('aria-label', o.titulo);
        d.innerHTML = `
            <div class="mapa-elegir-cabecera">
                <button type="button" class="mapa-elegir-cerrar" data-m="cerrar" aria-label="Cerrar sin elegir"><i class="bi bi-x-lg"></i></button>
                <strong data-m="titulo"></strong>
            </div>
            <div class="mapa-elegir-buscar">
                <i class="bi bi-search" aria-hidden="true"></i>
                <input type="search" class="campo-input" data-m="buscar" placeholder="Buscar barrio, lugar o dirección" enterkeyhint="search">
            </div>
            <div class="mapa-elegir-zona">
                <div class="mapa-elegir-mapa" data-m="mapa"></div>
                <span class="mapa-elegir-pin" aria-hidden="true"><i class="bi bi-geo-alt-fill"></i><b data-m="letra"></b></span>
                <span class="mapa-elegir-punto" aria-hidden="true"></span>
            </div>
            <div class="mapa-elegir-pie">
                <p class="mapa-elegir-lugar" data-m="lugar" aria-live="polite">Mueve el mapa hasta que el pin quede en el lugar exacto.</p>
                <div class="mapa-elegir-botones">
                    <button type="button" class="boton boton-secundario" data-m="gps"><i class="bi bi-crosshair"></i> <span>Mi ubicación</span></button>
                    <button type="button" class="boton boton-principal" data-m="confirmar"><i class="bi bi-check2-circle"></i> <span></span></button>
                </div>
            </div>`;
        const $ = (m) => d.querySelector(`[data-m="${m}"]`);
        $('titulo').textContent = o.titulo;
        $('letra').textContent = (o.lado || '').toUpperCase();
        $('confirmar').querySelector('span').textContent = o.confirmar;
        const lugar = (texto, tipo = '') => { $('lugar').textContent = texto; $('lugar').className = `mapa-elegir-lugar ${tipo}`; };

        // Nombre del lugar donde quedó el pin (Nominatim: 1 consulta por segundo; se espera a que se quede quieto)
        function nombrarLugar() {
            clearTimeout(esperaLugar);
            const turno = ++turnoLugar;
            esperaLugar = setTimeout(async () => {
                if (!mapa) return;
                const c = mapa.getCenter();
                const texto = await direccionDePunto({ lat: c.lat, lng: c.lng });
                if (turno !== turnoLugar || !mapa) return;
                const extra = precision ? ` · GPS con precisión de ${precision} m` : '';
                lugar(texto ? `Cerca de: ${texto.split(',').slice(0, 4).join(',')}${extra}` : `Punto elegido${extra}`);
            }, 900);
        }

        async function usarGps() {
            const b = $('gps');
            b.disabled = true;
            lugar('Buscando tu ubicación...');
            try {
                const p = await miUbicacionGps();
                if (!mapa) return;
                moviendoPorGps = true;
                mapa.setView([p.lat, p.lng], p.precision > 300 ? 15 : 18);
                moviendoPorGps = false;
                precision = p.precision || null;
                if (circulo) circulo.remove();
                circulo = p.precision ? window.L.circle([p.lat, p.lng], { radius: p.precision, color: '#2a78d6', weight: 1, fillOpacity: 0.08 }).addTo(mapa) : null;
                if (p.precision > 100) lugar(`El GPS da una precisión de ${p.precision} m: mueve el mapa para ajustar el pin.`, 'aviso');
                nombrarLugar();
            } catch (e) {
                lugar(e.message, 'error');
            } finally {
                b.disabled = false;
            }
        }

        async function buscarYIr(texto) {
            if (!texto || !mapa) return;
            lugar('Buscando...');
            try {
                const lista = await buscarDireccion(texto, { cerca: o.cerca });
                if (!mapa) return;
                if (!lista.length) { lugar(`No se encontró "${texto}". Prueba con barrio y cantón, o mueve el mapa.`, 'error'); return; }
                mapa.setView([lista[0].lat, lista[0].lng], 17);
            } catch (e) {
                lugar('No se pudo buscar (revisa internet). Mueve el mapa hasta el lugar.', 'error');
            }
        }

        $('cerrar').addEventListener('click', () => d.close());
        $('gps').addEventListener('click', usarGps);
        $('confirmar').addEventListener('click', () => {
            if (!mapa) return;
            const c = mapa.getCenter();
            resultado = { lat: Math.round(c.lat * 1e6) / 1e6, lng: Math.round(c.lng * 1e6) / 1e6, precision };
            d.close();
        });
        const inputBuscar = $('buscar');
        inputBuscar.value = o.buscar || '';
        sugerirDirecciones(inputBuscar, {
            cerca: () => (mapa ? { oeste: mapa.getBounds().getWest(), sur: mapa.getBounds().getSouth(), este: mapa.getBounds().getEast(), norte: mapa.getBounds().getNorth() } : o.cerca),
            alElegir: (r) => { if (mapa) mapa.setView([r.lat, r.lng], 17); inputBuscar.blur(); },
        });
        // Enter sin elegir sugerencia: va al primer resultado
        inputBuscar.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const lista = inputBuscar.parentElement.querySelector('.mapa-sugerencias');
            if (lista && !lista.hidden && lista.querySelector('li.activo')) return; // la elige sugerirDirecciones
            if (lista) lista.hidden = true;
            const punto = puntoDeTexto(inputBuscar.value);
            if (punto && mapa) mapa.setView([punto.lat, punto.lng], 17);
            else buscarYIr(inputBuscar.value.trim());
            inputBuscar.blur();
        });

        d.addEventListener('cancel', (e) => { e.preventDefault(); d.close(); });
        d.addEventListener('close', () => {
            clearTimeout(esperaLugar);
            if (mapa) mapa.remove();
            mapa = null;
            d.remove();
            resolver(resultado);
        });

        document.body.appendChild(d);
        d.showModal();
        cargarLeaflet().then(() => {
            if (!d.isConnected) return;
            const inicio = o.inicial || MAPA_CENTRO;
            mapa = window.L.map($('mapa'), { zoomControl: true, attributionControl: true })
                .setView([inicio.lat, inicio.lng], o.inicial ? 17 : 12);
            window.L.tileLayer(MAPA_CAPA.url, { maxZoom: MAPA_CAPA.zoomMaximo, attribution: MAPA_CAPA.credito }).addTo(mapa);
            mapa.on('movestart', () => { if (!moviendoPorGps) d.classList.add('moviendo'); });
            mapa.on('dragstart', () => { precision = null; if (circulo) { circulo.remove(); circulo = null; } });
            mapa.on('moveend', () => { d.classList.remove('moviendo'); nombrarLugar(); });
            setTimeout(() => { if (mapa) mapa.invalidateSize(); }, 60);
            if (o.gps) usarGps();
            else if (!o.inicial && o.buscar) buscarYIr(o.buscar);
            else nombrarLugar();
        }).catch(() => lugar('No se pudo cargar el mapa (revisa internet).', 'error'));
    });
}
