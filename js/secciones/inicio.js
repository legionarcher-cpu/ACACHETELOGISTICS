/* ==================================================
   SECCIÓN: INICIO - LÓGICA
   ACACHETE LOGISTICS

   Sección 1 (izquierda arriba): pedidos de HOY.
     - Cuadros con números (Total, Pendientes, En ruta, Entregados,
       No entregados / cancelados). Al presionar uno, filtra la lista.
     - Lista: número de pedido, cliente, ruta, piloto, horario y estado.
   Sección 2 (derecha arriba): estadística de la SEMANA (lunes a domingo),
     mismo alcance por rol.
     Solo iconos: al posar el mouse dicen qué son y su valor; al presionarlos
     filtran la lista. Tiempos (despacho, en ruta, total, de la línea de
     tiempo) y totales (entregados, con incidencia, rechazados, cancelados).
     Debajo: promedios de lo que se ve y los tiempos de cada pedido.
   Sección 3 (izquierda abajo): ubicación de pilotos. Mapa de Google AÚN NO
     conectado (espacio reservado) + lista de pilotos activos hoy.
   Sección 4 (derecha abajo): actividad reciente de hoy (ingresa, se asigna,
     sale, termina) con filtros de región / tienda / ruta según el rol.
     Se actualiza cada minuto.
   Lo que se ve depende del rol (js/sesion.js):
     Piloto             -> sus pedidos
     Empleado y Admin G3-> los de su tienda
     Admin G2           -> los de las tiendas de su región
     Administrador y G1 -> todos
   No cuenta los pedidos anulados.
   ================================================== */

// Grupos de los cuadros: [clase, texto, estados que incluye, icono (Bootstrap Icons)]
// El color del icono es el de la línea lateral del cuadro (css/secciones/inicio.css)
const INI_GRUPOS = [
    ['', 'Total', null, 'bi-box-seam'],
    ['pendientes', 'Pendientes', ['registrado', 'recibido_bodega', 'asignado', 'reprogramado'], 'bi-hourglass-split'],
    ['ruta', 'En ruta', ['en_ruta'], 'bi-truck'],
    ['hechos', 'Entregados', ['entregado', 'entregado_incidencia'], 'bi-check-circle'],
    ['fallidos', 'No entregados / cancelados', ['no_entregado', 'devuelto', 'cancelado'], 'bi-x-circle'],
];

// Clave de Google Maps (JavaScript API). Es PÚBLICA (va en la página): debe
// estar restringida en Google Cloud por sitio web (referentes HTTP) y a la
// "Maps JavaScript API", para que nadie la pueda usar desde otro dominio.
const INI_MAPS_CLAVE = 'AIzaSyA1R5Y5ZESzhSz4pSdkBCxyF6JCIXKNuNI';
const INI_MAPS_CENTRO = { lat: 9.9333, lng: -84.0833 }; // San José, Costa Rica

// Carga la librería de Google Maps una sola vez (aunque se entre varias veces a Inicio)
let iniMapsPromesa = null;
function cargarGoogleMaps() {
    if (window.google && window.google.maps && window.google.maps.importLibrary) return Promise.resolve();
    if (iniMapsPromesa) return iniMapsPromesa;
    iniMapsPromesa = new Promise((listo, falla) => {
        window.iniMapsListo = listo;
        const s = document.createElement('script');
        s.src = `https://maps.googleapis.com/maps/api/js?key=${INI_MAPS_CLAVE}&loading=async&callback=iniMapsListo&language=es&region=CR`;
        s.async = true;
        s.onerror = () => { iniMapsPromesa = null; falla(new Error('No se pudo cargar Google Maps')); };
        document.head.appendChild(s);
    });
    return iniMapsPromesa;
}

// Texto y color de cada estado (etiquetas de css/componentes.css)
const INI_ESTADOS = {
    registrado: ['Registrado', 'etiqueta-gris'], recibido_bodega: ['En bodega', 'etiqueta-morada'],
    asignado: ['Asignado', 'etiqueta-azul'], reprogramado: ['Reprogramado', 'etiqueta-azul'],
    en_ruta: ['En ruta', 'etiqueta-turquesa'], entregado: ['Entregado', 'etiqueta-verde'],
    entregado_incidencia: ['Entregado con incidencia', 'etiqueta-naranja'], no_entregado: ['No entregado', 'etiqueta-rosada'],
    devuelto: ['Devuelto', 'etiqueta-rosada'], cancelado: ['Cancelado', 'etiqueta-gris'],
};

registrarSeccion('inicio', (zona) => {

    const $ = (selector) => zona.querySelector(selector);

    // Fecha local de hoy "2026-09-29"
    const d = new Date();
    const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const fechaTexto = d.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });

    let pedidos = [];   // pedidos de hoy del alcance
    let horarios = {};  // número -> "09:30–12:00"
    const pilotos = {}; // id -> nombre
    let grupo = 0;      // cuadro elegido (índice de INI_GRUPOS)

    // Pone en la consulta de pedidos lo que el rol puede ver.
    // Devuelve { q, alcance } (alcance = texto "Región CEN", "Mi tienda"...)
    let tiendasG2 = null; // ids de las tiendas de la región del G2 (se piden una vez)
    async function conAlcance(q) {
        const sesion = obtenerSesion() || {};
        if (rolActual() === 'piloto') return { q: q.eq('piloto_id', sesion.id || 0), alcance: 'Mis pedidos' };
        if (esAdminG2()) {
            if (!tiendasG2) {
                const { data } = await db.from('tiendas').select('id').eq('region', regionActual());
                tiendasG2 = (data || []).map((t) => t.id).concat(0);
            }
            return { q: q.in('tienda_id', tiendasG2), alcance: `Región ${regionActual()}` };
        }
        if (!esAdministrador() && !esAdminG1()) {
            return { q: q.eq('tienda_id', tiendaActual() || 0), alcance: sesion.tienda ? sesion.tienda.nombre : 'Mi tienda' };
        }
        return { q, alcance: 'Todas las tiendas' };
    }

    async function cargarResumen() {
        const { q, alcance } = await conAlcance(
            db.from('pedidos').select('id, codigo, cliente_nombre, marca_numero, estado, piloto_id, creado_en, rutas(nombre)')
                .eq('fecha_entrega', hoy).eq('anulado', false));

        $('#iniResumenAlcance').textContent = `${alcance} · ${fechaTexto.charAt(0).toUpperCase()}${fechaTexto.slice(1)}`;

        const [ped, mar] = await Promise.all([
            q.order('marca_numero', { ascending: true, nullsFirst: false }),
            db.rpc('marcas_del_dia', { p_fecha: hoy }),
        ]);
        if (ped.error) {
            console.error('Error al cargar los pedidos de hoy:', ped.error);
            $('#iniResumen').textContent = 'No se pudo cargar el resumen.';
            return;
        }
        pedidos = ped.data;
        (mar.data || []).forEach((m) => { horarios[m.numero] = `${m.inicio_desde.slice(0, 5)}–${m.fin.slice(0, 5)}`; });

        // Nombre del piloto de cada pedido
        const ids = [...new Set(pedidos.map((p) => p.piloto_id).filter(Boolean))];
        if (ids.length) {
            const { data } = await db.from('usuarios').select('id, nombre').in('id', ids);
            (data || []).forEach((u) => { pilotos[u.id] = u.nombre; });
        }
        dibujar();
        dibujarPilotosActivos();
    }

    // Mapa de Google (sección 3). Aún sin marcadores: la app del piloto
    // todavía no comparte su ubicación (ver PROPUESTA, sección 30).
    function mostrarMapa() {
        const caja = $('#iniMapa');
        // Clave rechazada por Google (no válida, sin permiso o sin facturación)
        window.gm_authFailure = () => {
            caja.classList.remove('conectado');
            caja.replaceChildren();
            const i = document.createElement('i');
            i.className = 'bi bi-exclamation-triangle';
            const t = document.createElement('strong');
            t.textContent = 'Google Maps rechazó la clave';
            const s = document.createElement('span');
            s.textContent = 'Revisa en Google Cloud que la clave esté activa, con facturación y permitida para este sitio.';
            caja.append(i, t, s);
        };
        cargarGoogleMaps()
            .then(() => google.maps.importLibrary('maps'))
            .then(({ Map }) => {
                if (!caja.isConnected) return; // ya se salió de Inicio
                caja.replaceChildren();
                caja.classList.add('conectado');
                new Map(caja, {
                    center: INI_MAPS_CENTRO,
                    zoom: 11,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: true,
                });
            })
            .catch((error) => console.error('Error al cargar Google Maps:', error));
    }

    // ==================================================
    // SECCIÓN 3: UBICACIÓN DE PILOTOS
    //   Mapa de Google (sin marcadores hasta que la app comparta la ubicación).
    //   Lista: pilotos con pedidos hoy (mismo alcance de la sección 1).
    //     En ruta        -> tiene un pedido "En ruta"
    //     N por salir    -> tiene pedidos pendientes
    //     Sin pendientes -> ya terminó los de hoy
    // ==================================================
    function dibujarPilotosActivos() {
        const ul = $('#iniMapaPilotos');
        ul.replaceChildren();
        const porPiloto = {};
        pedidos.filter((p) => p.piloto_id).forEach((p) => {
            (porPiloto[p.piloto_id] = porPiloto[p.piloto_id] || []).push(p);
        });
        const pendientes = INI_GRUPOS[1][2];
        const lista = Object.entries(porPiloto).map(([id, suyos]) => {
            const enRuta = suyos.some((p) => p.estado === 'en_ruta');
            const porSalir = suyos.filter((p) => pendientes.includes(p.estado)).length;
            if (enRuta) return { id, clase: 'ruta', texto: 'En ruta', orden: 0 };
            if (porSalir) return { id, clase: 'pendientes', texto: `${plural(porSalir, 'pedido', 'pedidos')} por salir`, orden: 1 };
            return { id, clase: '', texto: 'Sin pendientes', orden: 2 };
        }).sort((a, b) => a.orden - b.orden || (pilotos[a.id] || '').localeCompare(pilotos[b.id] || ''));

        if (!lista.length) {
            const li = document.createElement('li');
            li.textContent = 'Sin pilotos con pedidos hoy.';
            ul.appendChild(li);
            return;
        }
        lista.forEach((x) => {
            const li = document.createElement('li');
            const punto = document.createElement('span');
            punto.className = `ini-punto ${x.clase}`;
            const textos = document.createElement('div');
            const nombre = document.createElement('strong');
            nombre.textContent = pilotos[x.id] || 'Piloto';
            const estado = document.createElement('small');
            estado.className = x.clase;
            estado.textContent = x.texto;
            textos.append(nombre, estado);
            li.append(punto, textos);
            ul.appendChild(li);
        });
    }

    // ==================================================
    // SECCIÓN 2: ESTADÍSTICA DE LA SEMANA (pedidos con entrega de lunes a domingo)
    //   Despacho = desde que se recibe / crea el pedido hasta "En ruta"
    //   En ruta  = desde "En ruta" hasta que termina (entregado, no entregado, devuelto)
    //   Total    = desde que se recibe / crea hasta que termina
    // Las horas salen de la línea de tiempo (tabla pedido_historial).
    // ==================================================

    const INI_FINALES = ['entregado', 'entregado_incidencia', 'no_entregado', 'devuelto'];

    // minutos -> "35 min" / "1 h 20 min"
    function duracion(minutos) {
        if (minutos == null) return '—';
        const m = Math.round(minutos);
        if (m < 60) return `${m} min`;
        return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
    }

    // Promedio de una lista de minutos (null si no hay datos)
    const promedio = (lista) => (lista.length ? lista.reduce((s, x) => s + x, 0) / lista.length : null);

    let tiempos = [];     // [{ pedido, despacho, enRuta, total }] en minutos (null = aún no)
    let filtroEstad = ''; // icono elegido ('' = todos)

    // Iconos de la sección 2: [id, clase de color, icono, filtro de la lista]
    //   Tiempos -> pedidos que ya tienen ese tiempo | Totales -> por estado
    const INI_ESTAD = [
        ['despacho', 'pendientes', 'bi-stopwatch', (t) => t.despacho != null],
        ['ruta', 'ruta', 'bi-truck', (t) => t.enRuta != null],
        ['total', '', 'bi-clock-history', (t) => t.total != null],
        null, // separador entre tiempos y totales
        ['entregados', 'hechos', 'bi-check-circle', (t) => t.pedido.estado === 'entregado'],
        ['incidencia', 'pendientes', 'bi-exclamation-triangle', (t) => t.pedido.estado === 'entregado_incidencia'],
        ['rechazados', 'fallidos', 'bi-x-circle', (t) => ['no_entregado', 'devuelto'].includes(t.pedido.estado)],
        ['cancelados', 'neutro', 'bi-slash-circle', (t) => t.pedido.estado === 'cancelado'],
    ];

    // Semana actual: lunes a domingo (fechas locales "2026-09-28")
    const aTexto = (f) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
    const lunes = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
    const diaCorto = (f) => f.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' });
    let semana = []; // pedidos de la semana del alcance

    async function cargarEstadistica() {
        const { q, alcance } = await conAlcance(
            db.from('pedidos').select('id, codigo, estado, piloto_id, creado_en, fecha_entrega')
                .gte('fecha_entrega', aTexto(lunes)).lte('fecha_entrega', aTexto(domingo)).eq('anulado', false));
        $('#iniEstadAlcance').textContent = `${alcance} · Semana del ${diaCorto(lunes)} al ${diaCorto(domingo)}`;

        const res = await q.order('fecha_entrega', { ascending: false }).order('id', { ascending: false });
        if (res.error) {
            console.error('Error al cargar la estadística de la semana:', res.error);
            return;
        }
        semana = res.data;

        // Nombres de pilotos que aún no se tienen
        const faltan = [...new Set(semana.map((p) => p.piloto_id).filter((id) => id && !pilotos[id]))];
        if (faltan.length) {
            const { data } = await db.from('usuarios').select('id, nombre').in('id', faltan);
            (data || []).forEach((u) => { pilotos[u.id] = u.nombre; });
        }

        const ids = semana.map((p) => p.id);
        let eventos = [];
        if (ids.length) {
            const { data, error } = await db.from('pedido_historial').select('pedido_id, estado_nuevo, creado_en')
                .in('pedido_id', ids).in('estado_nuevo', ['en_ruta', ...INI_FINALES]).order('creado_en');
            if (error) console.error('Error al cargar la línea de tiempo:', error);
            else eventos = data;
        }

        // Por pedido: hora de "En ruta" (la primera) y hora en que terminó (la última)
        const minutos = (a, b) => (new Date(b) - new Date(a)) / 60000;
        tiempos = semana.map((p) => {
            const suyos = eventos.filter((e) => e.pedido_id === p.id);
            const salida = suyos.find((e) => e.estado_nuevo === 'en_ruta');
            const fin = [...suyos].reverse().find((e) => INI_FINALES.includes(e.estado_nuevo));
            return {
                pedido: p,
                despacho: salida ? minutos(p.creado_en, salida.creado_en) : null,
                enRuta: salida && fin ? minutos(salida.creado_en, fin.creado_en) : null,
                total: fin ? minutos(p.creado_en, fin.creado_en) : null,
            };
        });
        dibujarEstadistica();
    }

    // Texto del globo de cada icono (qué es y su valor)
    function infoIcono(id) {
        const prom = (campo) => {
            const lista = tiempos.map((t) => t[campo]).filter((x) => x != null);
            return `${duracion(promedio(lista))} (${plural(lista.length, 'pedido', 'pedidos')})`;
        };
        const cuenta = (f) => tiempos.filter(f).length;
        const e = INI_ESTAD.find((x) => x && x[0] === id);
        return {
            despacho: `Despacho promedio: ${prom('despacho')}. Desde que se recibe o crea hasta "En ruta".`,
            ruta: `En ruta promedio: ${prom('enRuta')}. Desde "En ruta" hasta que termina.`,
            total: `Tiempo total promedio: ${prom('total')}. Desde que se recibe o crea hasta que termina.`,
            entregados: `Entregados: ${cuenta(e[3])}`,
            incidencia: `Entregados con incidencia: ${cuenta(e[3])}`,
            rechazados: `Rechazados (no entregados y devueltos): ${cuenta(e[3])}`,
            cancelados: `Cancelados: ${cuenta(e[3])}`,
        }[id];
    }

    function dibujarEstadistica() {
        // Iconos (solo el cuadrito; la información va en el globo)
        const caja = $('#iniEstadIconos');
        caja.replaceChildren();
        INI_ESTAD.forEach((item) => {
            if (!item) {
                const sep = document.createElement('span');
                sep.className = 'ini-iconos-separador';
                caja.appendChild(sep);
                return;
            }
            const [id, clase, icono] = item;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `ini-icono-filtro ${clase}${filtroEstad === id ? ' activo' : ''}`;
            b.dataset.estad = id;
            b.dataset.info = infoIcono(id);
            b.setAttribute('aria-label', infoIcono(id));
            b.setAttribute('aria-pressed', filtroEstad === id);
            const cuadrito = document.createElement('span');
            cuadrito.className = 'ini-icono';
            const i = document.createElement('i');
            i.className = `bi ${icono}`;
            cuadrito.appendChild(i);
            b.appendChild(cuadrito);
            caja.appendChild(b);
        });

        // Lista (filtrada por el icono elegido)
        const item = INI_ESTAD.find((x) => x && x[0] === filtroEstad);
        const lista = item ? tiempos.filter(item[3]) : tiempos;

        // Promedios de lo que se ve
        const prom = (campo) => duracion(promedio(lista.map((t) => t[campo]).filter((x) => x != null)));
        const p = $('#iniEstadPromedios');
        p.replaceChildren();
        [['Despacho', 'despacho'], ['En ruta', 'enRuta'], ['Total', 'total']].forEach(([texto, campo], i) => {
            if (i) p.append(' · ');
            const s = document.createElement('strong');
            s.textContent = prom(campo);
            p.append(`${texto} `, s);
        });

        const cuerpo = $('#iniEstadPedidos');
        cuerpo.replaceChildren();
        if (!lista.length) {
            cuerpo.appendChild(crearFilaVacia('No hay pedidos para mostrar.', 6));
            return;
        }
        lista.forEach((t) => {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            const a = document.createElement('a');
            a.href = `#pedidos?id=${t.pedido.id}`;
            a.textContent = t.pedido.codigo;
            // Día de entrega debajo del número (ej. "lun 28")
            const dia = document.createElement('small');
            dia.className = 'ini-dia';
            dia.textContent = new Date(`${t.pedido.fecha_entrega}T12:00:00`)
                .toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric' });
            td.append(a, dia);
            tr.appendChild(td);
            tr.appendChild(crearCelda(t.pedido.piloto_id ? (pilotos[t.pedido.piloto_id] || 'Piloto') : 'Sin piloto'));
            tr.appendChild(crearCelda(duracion(t.despacho)));
            tr.appendChild(crearCelda(duracion(t.enRuta)));
            tr.appendChild(crearCelda(duracion(t.total)));
            const [texto, color] = INI_ESTADOS[t.pedido.estado] || [t.pedido.estado, 'etiqueta-gris'];
            tr.appendChild(crearCeldaEtiqueta(texto, color));
            cuerpo.appendChild(tr);
        });
    }

    // Presionar un icono filtra la lista (otra vez = quitar el filtro)
    $('#iniEstadIconos').addEventListener('click', (evento) => {
        const b = evento.target.closest('button[data-estad]');
        if (!b) return;
        filtroEstad = filtroEstad === b.dataset.estad ? '' : b.dataset.estad;
        dibujarEstadistica();
    });

    function dibujar() {
        // Cuadros (botones que filtran)
        const caja = $('#iniResumen');
        caja.replaceChildren();
        INI_GRUPOS.forEach(([clase, texto, estados, icono], i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `ini-numero ${clase}${i === grupo ? ' activo' : ''}`;
            b.dataset.grupo = i;
            b.setAttribute('aria-pressed', i === grupo);
            // Icono dentro de un cuadrito de color
            const cuadrito = document.createElement('span');
            cuadrito.className = 'ini-icono';
            cuadrito.setAttribute('aria-hidden', 'true');
            const ic = document.createElement('i');
            ic.className = `bi ${icono}`;
            cuadrito.appendChild(ic);
            // Texto arriba y número abajo
            const textos = document.createElement('span');
            textos.className = 'ini-numero-textos';
            const t = document.createElement('span');
            t.textContent = texto;
            const n = document.createElement('strong');
            n.textContent = estados ? pedidos.filter((p) => estados.includes(p.estado)).length : pedidos.length;
            textos.append(t, n);
            b.append(cuadrito, textos);
            caja.appendChild(b);
        });

        // Lista filtrada por el cuadro elegido
        const estados = INI_GRUPOS[grupo][2];
        const lista = estados ? pedidos.filter((p) => estados.includes(p.estado)) : pedidos;
        const cuerpo = $('#iniPedidos');
        cuerpo.replaceChildren();
        if (!lista.length) {
            cuerpo.appendChild(crearFilaVacia('No hay pedidos para mostrar.', 6)); // js/componentes.js
            return;
        }
        lista.forEach((p) => {
            const tr = document.createElement('tr');
            const tdCodigo = document.createElement('td');
            const a = document.createElement('a');
            a.href = `#pedidos?id=${p.id}`;
            a.textContent = p.codigo;
            tdCodigo.appendChild(a);
            tr.appendChild(tdCodigo);
            tr.appendChild(crearCelda(p.cliente_nombre));
            tr.appendChild(crearCelda(p.rutas ? p.rutas.nombre : null));
            tr.appendChild(crearCelda(p.piloto_id ? (pilotos[p.piloto_id] || 'Piloto') : 'Sin piloto'));
            tr.appendChild(crearCelda(p.marca_numero
                ? `Horario ${p.marca_numero}${horarios[p.marca_numero] ? ` · ${horarios[p.marca_numero]}` : ''}`
                : null));
            const [texto, color] = INI_ESTADOS[p.estado] || [p.estado, 'etiqueta-gris'];
            tr.appendChild(crearCeldaEtiqueta(texto, color));
            cuerpo.appendChild(tr);
        });
    }

    // Presionar un cuadro filtra la lista
    $('#iniResumen').addEventListener('click', (evento) => {
        const b = evento.target.closest('button[data-grupo]');
        if (!b) return;
        grupo = Number(b.dataset.grupo);
        dibujar();
    });

    // ==================================================
    // SECCIÓN 4: ACTIVIDAD RECIENTE (línea de tiempo de HOY)
    //   Ingresa (registrado), piloto asignado, sale (en ruta) y termina
    //   (entregado, con incidencia, no entregado, devuelto, cancelado).
    //   Filtros según el rol:
    //     Admin / G1   -> región, tienda y ruta
    //     G2           -> tienda (de su región) y ruta
    //     G3 / Empleado-> ruta (de su tienda)
    //     Piloto       -> sin filtros, solo sus pedidos
    //   Se actualiza cada minuto.
    // ==================================================

    // [icono, clase de color, texto después del número de pedido]
    const INI_ACTIVIDAD = {
        registrado: ['bi-box-arrow-in-down', 'ingreso', 'ingresó'],
        asignado: ['bi-person-check', 'asignado', 'piloto asignado'],
        en_ruta: ['bi-truck', 'ruta', 'salió a entregar'],
        entregado: ['bi-check-lg', 'hechos', 'entregado al cliente'],
        entregado_incidencia: ['bi-exclamation-triangle', 'incidencia', 'entregado con incidencia'],
        no_entregado: ['bi-x-lg', 'fallidos', 'no entregado'],
        devuelto: ['bi-arrow-return-left', 'fallidos', 'devuelto'],
        cancelado: ['bi-slash-circle', 'neutro', 'cancelado'],
    };

    const selRegion = $('#iniActRegion');
    const selTienda = $('#iniActTienda');
    const selRuta = $('#iniActRuta');
    let actTiendas = []; // tiendas que el rol puede ver
    let actRutas = [];   // rutas de esas tiendas
    let actEventos = [];

    const opcion = (valor, texto) => {
        const o = document.createElement('option');
        o.value = valor;
        o.textContent = texto;
        return o;
    };

    // "Ahora" / "Hace 12 min" / "Hace 2 h"
    function haceCuanto(fecha) {
        const min = Math.floor((Date.now() - new Date(fecha)) / 60000);
        if (min < 1) return 'Ahora';
        if (min < 60) return `Hace ${min} min`;
        const h = Math.floor(min / 60);
        return `Hace ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
    }

    async function prepararFiltros() {
        const rol = rolActual();
        if (rol === 'piloto') return;

        let q = db.from('tiendas').select('id, nombre, region').order('nombre');
        if (esAdminG2()) q = q.eq('region', regionActual());
        else if (!esAdministrador() && !esAdminG1()) q = q.eq('id', tiendaActual() || 0);
        const [tie, rut] = await Promise.all([
            q,
            db.from('rutas').select('id, nombre, tienda_id').eq('activa', true).order('orden'),
        ]);
        actTiendas = tie.data || [];
        const ids = actTiendas.map((t) => t.id);
        actRutas = (rut.data || []).filter((r) => ids.includes(r.tienda_id));

        if (esAdministrador() || esAdminG1()) {
            const regiones = [...new Set(actTiendas.map((t) => t.region))].sort();
            selRegion.replaceChildren(opcion('', 'Todas las regiones'), ...regiones.map((r) => opcion(r, `Región ${r}`)));
            selRegion.hidden = false;
        }
        if (esAdministrador() || esAdminG1() || esAdminG2()) {
            llenarTiendas();
            selTienda.hidden = false;
        }
        llenarRutasAct();
        selRuta.hidden = false;
    }

    function llenarTiendas() {
        const lista = actTiendas.filter((t) => !selRegion.value || t.region === selRegion.value);
        selTienda.replaceChildren(opcion('', 'Todas las tiendas'), ...lista.map((t) => opcion(t.id, t.nombre)));
    }

    function llenarRutasAct() {
        const tiendas = tiendasFiltradas();
        const varias = tiendas.length > 1;
        const lista = actRutas.filter((r) => tiendas.includes(r.tienda_id));
        selRuta.replaceChildren(opcion('', 'Todas las rutas'), ...lista.map((r) => {
            const t = actTiendas.find((x) => x.id === r.tienda_id);
            return opcion(r.id, varias && t ? `${r.nombre} · ${t.nombre}` : r.nombre);
        }));
    }

    // Tiendas que cumplen los filtros de región y tienda
    function tiendasFiltradas() {
        if (selTienda.value) return [Number(selTienda.value)];
        return actTiendas.filter((t) => !selRegion.value || t.region === selRegion.value).map((t) => t.id);
    }

    async function cargarActividad() {
        const inicio = new Date();
        inicio.setHours(0, 0, 0, 0);
        const finales = ['en_ruta', 'entregado', 'entregado_incidencia', 'no_entregado', 'devuelto', 'cancelado'];
        let q = db.from('pedido_historial')
            .select('id, evento, estado_nuevo, usuario_nombre, creado_en, pedidos!inner(id, codigo, tienda_id, ruta_id, piloto_id, anulado, rutas(nombre))')
            .gte('creado_en', inicio.toISOString())
            .or(`evento.in.(registrado,asignado),estado_nuevo.in.(${finales.join(',')})`)
            .eq('pedidos.anulado', false)
            .order('creado_en', { ascending: false })
            .limit(40);

        if (rolActual() === 'piloto') q = q.eq('pedidos.piloto_id', (obtenerSesion() || {}).id || 0);
        else {
            q = q.in('pedidos.tienda_id', tiendasFiltradas().concat(0));
            if (selRuta.value) q = q.eq('pedidos.ruta_id', Number(selRuta.value));
        }

        const { data, error } = await q;
        if (error) {
            console.error('Error al cargar la actividad:', error);
            return;
        }
        actEventos = data;
        dibujarActividad();
    }

    function dibujarActividad() {
        const ol = $('#iniActividad');
        ol.replaceChildren();
        if (!actEventos.length) {
            const li = document.createElement('li');
            li.className = 'ini-act-vacio';
            li.textContent = 'Sin movimientos hoy.';
            ol.appendChild(li);
            return;
        }
        const varias = actTiendas.length > 1;
        actEventos.forEach((e) => {
            const clave = e.evento === 'registrado' || e.evento === 'asignado' ? e.evento : e.estado_nuevo;
            const [icono, clase, texto] = INI_ACTIVIDAD[clave] || ['bi-dot', 'neutro', clave];
            const p = e.pedidos;

            const li = document.createElement('li');
            li.className = 'ini-act-item';
            const circulo = document.createElement('span');
            circulo.className = `ini-act-icono ${clase}`;
            circulo.setAttribute('aria-hidden', 'true');
            const i = document.createElement('i');
            i.className = `bi ${icono}`;
            circulo.appendChild(i);

            const textos = document.createElement('div');
            textos.className = 'ini-act-textos';
            const linea = document.createElement('span');
            const a = document.createElement('a');
            a.href = `#pedidos?id=${p.id}`;
            a.textContent = p.codigo;
            linea.append('Pedido ', a, ` ${texto}`);
            // Debajo: hace cuánto · ruta · tienda (si ve varias) · quién
            const t = actTiendas.find((x) => x.id === p.tienda_id);
            const detalle = document.createElement('small');
            detalle.textContent = [
                haceCuanto(e.creado_en),
                p.rutas && p.rutas.nombre,
                varias && t && t.nombre,
                e.usuario_nombre,
            ].filter(Boolean).join(' · ');
            textos.append(linea, detalle);

            li.append(circulo, textos);
            ol.appendChild(li);
        });
    }

    selRegion.addEventListener('change', () => { llenarTiendas(); llenarRutasAct(); cargarActividad(); });
    selTienda.addEventListener('change', () => { llenarRutasAct(); cargarActividad(); });
    selRuta.addEventListener('change', cargarActividad);

    prepararFiltros().then(cargarActividad);
    const reloj = setInterval(cargarActividad, 60000);

    cargarResumen();
    cargarEstadistica();
    mostrarMapa();

    return () => clearInterval(reloj);
});
