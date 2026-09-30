/* ==================================================
   SECCIÓN: COTIZADOR (encomiendas) - LÓGICA
   ACACHETE LOGISTICS

   Calcula el precio de un envío de Encomiendas SIN registrar nada.
   Usa lo que se define en Configuración:
     - Tarifas (Configuración -> Pedidos -> Tarifas): tienda > región > general
     - Descuentos pre-establecidos (máximo 1)
     - Categorías de mercadería de Encomiendas (cajas, bolsas, documentos...)
     - Artículos frecuentes (pesos promedio): al elegir el artículo el peso
       se llena solo y se puede cambiar
     - Tamaños S/M/L/XL (solo referencia; si la actividad usa tamaños)

   FÓRMULA: la misma de Pedidos (buscarTarifa, calcularEnvioTarifa y
   montoDescuento en js/componentes.js), así la cotización y el pedido
   registrado dan el mismo precio.
     envío = cargo fijo + mínimo + max(0, peso total - kg incluidos) × precio por kg
             + km × precio por km - descuento

   RUTA A -> B (js/mapa.js, gratis): A = la recolección escrita o, si está vacía,
   la tienda; B = la entrega. Se ubican solos al escribir la dirección y se
   pueden mover con un clic o arrastrándolos. Los km son POR CALLE.

   QUIÉN: se abre con el botón "Cotizador" del pie, que solo aparece si la
   empresa realiza Encomiendas (empresas/empresas.js). Todos menos el Piloto.
     - Administrador y Admin G1: cualquier tienda o la tarifa general.
     - Admin G2: tiendas de su región o la tarifa de su región.
     - Admin G3 y Empleado: su tienda.

   Estilos: css/secciones/cotizador.css + css/componentes.css
   ================================================== */

const COT_ACTIVIDAD = 'encomiendas';
const COT_MONEDA = '₡';
// Pesos de la tabla "Precios rápidos por peso" (kg)
const COT_PESOS_RAPIDOS = [1, 2, 3, 5, 10, 15, 20, 30, 50];

registrarSeccion('cotizador', (zona) => {

    const $ = (selector) => zona.querySelector(selector);
    const aviso = crearAviso($('#cotAviso'), 4000);

    // ---------- Permisos (js/sesion.js) ----------
    const esGeneral = esAdministrador() || esAdminG1();
    const regionG2 = esAdminG2() ? regionActual() : null;

    // ---------- Elementos ----------
    const selTienda = $('#cotTienda');
    const selDescuento = $('#cotDescuento');
    const cuerpo = $('#cotBultos');

    // ---------- Datos de Configuración ----------
    let actividad = null;  // fila de "actividades" (usa_tamanos, activa...)
    let tiendas = [];
    let categorias = [];   // categorías activas de Encomiendas
    let catalogo = [];     // artículos frecuentes (pesos promedio)
    let tamanos = [];
    let tarifas = [];
    let descuentos = [];
    let textoCotizacion = ''; // para copiar / WhatsApp
    let mapaRuta = null;      // mapa A -> B (js/mapa.js)
    let rutaCot = null;       // { km, minutos, aproximada } o null
    const inOrigen = $('#cotOrigen');
    const inDestino = $('#cotDestino');

    // ---------- Ayudas ----------
    const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
    const dinero = (n) => `${COT_MONEDA}${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const kilos = (n) => `${r2(n)} kg`;
    const numero = (el) => (el.value === '' ? 0 : Math.max(0, Number(el.value) || 0));
    const categoriaDe = (id) => categorias.find((c) => String(c.id) === String(id)) || null;
    const conTamanos = () => usaActividad(actividad, 'usa_tamanos'); // empresas/empresas.js

    // Tienda elegida para la tarifa. Sin tienda: la región del G2 o la general.
    function tiendaElegida() {
        const t = tiendas.find((x) => String(x.id) === selTienda.value);
        if (t) return t;
        return regionG2 ? { region: regionG2 } : null;
    }

    // ==================================================
    // CARGAR
    // ==================================================

    async function cargar() {
        // lat / lng de la tienda (punto A cuando no hay recolección). Sin el
        // bloque 9 de sql/01 no existen: se leen las columnas de antes.
        const consultaTiendas = (columnas) => {
            let q = db.from('tiendas').select(columnas).order('codigo');
            if (regionG2) q = q.eq('region', regionG2);
            else if (!esGeneral) q = q.eq('id', tiendaActual() || 0);
            return q;
        };
        const qTie = consultaTiendas('id, codigo, nombre, region, direccion, lat, lng')
            .then((r) => (r.error && r.error.code === '42703' ? consultaTiendas('id, codigo, nombre, region, direccion') : r));

        // select('*'): así funciona aunque la base no tenga todas las columnas nuevas
        const [tie, act, cat, art, tam, tar, des] = await Promise.all([
            qTie,
            db.from('actividades').select('*').eq('codigo', COT_ACTIVIDAD).maybeSingle(),
            db.from('categorias_mercaderia').select('*').eq('actividad', COT_ACTIVIDAD).eq('activa', true).order('orden'),
            db.from('articulos_catalogo').select('categoria_id, nombre, peso_kg').eq('activo', true).order('orden'),
            db.from('tamanos_bulto').select('codigo, nombre, largo_cm, ancho_cm, alto_cm').order('orden'),
            db.from('tarifas').select('*').eq('actividad', COT_ACTIVIDAD), // con o sin km_incluidos (sql/01, bloque 10)
            db.from('descuentos').select('id, nombre, tipo, valor, actividad, region').eq('activo', true).order('nombre'),
        ]);
        const error = tie.error || act.error || cat.error || art.error || tam.error || tar.error || des.error;
        if (error) {
            console.error('Error al cargar el cotizador:', error);
            aviso.mostrar(error.code === 'PGRST205' || error.code === '42P01'
                ? 'Falta ejecutar el SQL de pedidos (sql/00 o sql/01).'
                : 'No se pudo cargar la configuración. Revisa la conexión.', 'error');
            return false;
        }
        tiendas = tie.data;
        actividad = act.data;
        categorias = cat.data;
        const ids = new Set(categorias.map((c) => c.id));
        catalogo = art.data.filter((a) => ids.has(a.categoria_id));
        tamanos = tam.data;
        tarifas = tar.data;
        descuentos = des.data.filter((d) => !d.actividad || d.actividad === COT_ACTIVIDAD);
        return true;
    }

    function prepararFormulario() {
        // Tiendas. Admin/G1: también la tarifa general; G2: la de su región.
        selTienda.replaceChildren();
        if (esGeneral) selTienda.appendChild(new Option('Tarifa general (sin tienda)', ''));
        if (regionG2) selTienda.appendChild(new Option(`Tarifa de la región ${regionG2}`, ''));
        tiendas.forEach((t) => selTienda.appendChild(new Option(`${t.codigo} · ${t.nombre}`, t.id)));
        if (!esGeneral && !regionG2) {
            selTienda.value = tiendas[0] ? String(tiendas[0].id) : '';
            selTienda.disabled = tiendas.length <= 1;
        }

        // Pesos promedio: una lista por categoría de artículos (para el campo "Artículo")
        const listas = $('#cotListas');
        listas.replaceChildren();
        categorias.filter((c) => c.tipo === 'articulos').forEach((c) => {
            const dl = document.createElement('datalist');
            dl.id = `cotLista${c.id}`;
            catalogo.filter((a) => a.categoria_id === c.id).forEach((a) => {
                const o = document.createElement('option');
                o.value = a.nombre;
                o.label = kilos(a.peso_kg);
                dl.appendChild(o);
            });
            listas.appendChild(dl);
        });

        $('.cot-tabla').classList.toggle('cot-sin-tamanos', !conTamanos());

        // Avisos de configuración
        const notas = [];
        if (!actividad) notas.push('La actividad Encomiendas no existe en la base de datos.');
        else if (actividad.activa === false) notas.push('Encomiendas está desactivada en Configuración → Actividades: la cotización es solo de referencia.');
        if (!categorias.length) notas.push('Encomiendas no tiene categorías activas (Configuración → Pedidos → Categorías de mercadería); se cotiza por bulto.');
        $('#cotNota').textContent = notas.join(' ');
        $('#cotNota').hidden = !notas.length;

        llenarDescuentos();
        prepararMapa();
        nuevaCotizacion();
    }

    // ---------- Mapa A -> B (js/mapa.js) ----------
    const origenEsTienda = () => !inOrigen.value.trim();
    const tiendaConDatos = () => tiendas.find((x) => String(x.id) === selTienda.value) || null;

    function prepararMapa() {
        if (mapaRuta || typeof crearMapaRuta !== 'function') return;
        mapaRuta = crearMapaRuta($('#cotMapa'), {
            etiquetaA: 'Tienda', etiquetaB: 'Entrega',
            textoA: () => (origenEsTienda() ? ((tiendaConDatos() || {}).direccion || '') : inOrigen.value),
            textoB: () => inDestino.value,
            // Sugerencias mientras se escribe (prioridad: la zona que se ve en el mapa)
            entradaA: inOrigen,
            entradaB: inDestino,
            alCambiar: (ruta) => { rutaCot = ruta; recalcular(); },
        });
    }

    // A = la recolección escrita, o la tienda (sus coordenadas guardadas o su dirección)
    async function actualizarPuntoA() {
        if (!mapaRuta) return;
        mapaRuta.etiquetas(origenEsTienda() ? 'Tienda' : 'Recolección', 'Entrega');
        if (!origenEsTienda()) { await mapaRuta.ubicarA(); return; }
        const t = tiendaConDatos();
        if (t && t.lat != null && t.lng != null) await mapaRuta.ponerA({ lat: Number(t.lat), lng: Number(t.lng) });
        else if (t && t.direccion) await mapaRuta.ubicarA();
        else await mapaRuta.ponerA(null);
    }

    // Si se eligió una sugerencia (entradaYaUbicada, js/mapa.js), el punto ya está puesto
    inOrigen.addEventListener('change', () => {
        if (entradaYaUbicada(inOrigen)) {
            if (mapaRuta) mapaRuta.etiquetas('Recolección', 'Entrega');
            return;
        }
        actualizarPuntoA();
    });
    inDestino.addEventListener('change', () => {
        if (!mapaRuta || entradaYaUbicada(inDestino)) return;
        if (inDestino.value.trim().length >= 4) mapaRuta.ubicarB();
        else mapaRuta.ponerB(null);
    });

    // Descuentos de Encomiendas que aplican a la región de la tienda
    function llenarDescuentos() {
        const actual = selDescuento.value;
        const region = (tiendaElegida() || {}).region;
        selDescuento.replaceChildren(new Option('Sin descuento', ''));
        descuentos.filter((d) => !d.region || d.region === region).forEach((d) => selDescuento.appendChild(new Option(
            `${d.nombre} (${d.tipo === 'porcentaje' ? `${Number(d.valor)} %` : dinero(d.valor)})`, d.id)));
        selDescuento.value = [...selDescuento.options].some((o) => o.value === actual) ? actual : '';
    }

    // ==================================================
    // BULTOS (una fila por bulto o grupo de bultos iguales)
    // ==================================================

    // etiqueta: en celular cada fila se ve como tarjeta y la etiqueta va arriba del
    // campo (data-etiqueta, css/secciones/cotizador.css)
    function celda(elemento, clase, etiqueta) {
        const td = document.createElement('td');
        if (clase) td.className = clase;
        if (etiqueta) td.dataset.etiqueta = etiqueta;
        td.appendChild(elemento);
        return td;
    }

    function input(tipo, etiqueta, extra = {}) {
        const i = document.createElement('input');
        i.type = tipo;
        i.className = 'campo-input';
        i.setAttribute('aria-label', etiqueta);
        Object.assign(i, extra);
        return i;
    }

    function agregarFila() {
        const tr = document.createElement('tr');

        const selCat = document.createElement('select');
        selCat.className = 'campo-input';
        selCat.setAttribute('aria-label', 'Categoría');
        if (categorias.length) categorias.forEach((c) => selCat.appendChild(new Option(c.nombre, c.id)));
        else selCat.appendChild(new Option('Bulto', ''));

        const inDesc = input('text', 'Artículo o descripción', { maxLength: 80 });
        const inCant = input('number', 'Cantidad', { min: 1, step: 1, value: 1 });
        const selTam = document.createElement('select');
        selTam.className = 'campo-input';
        selTam.setAttribute('aria-label', 'Tamaño');
        selTam.appendChild(new Option('—', ''));
        tamanos.forEach((t) => {
            const medidas = t.largo_cm ? ` (${Number(t.largo_cm)}×${Number(t.ancho_cm)}×${Number(t.alto_cm)} cm)` : '';
            selTam.appendChild(new Option(`${t.codigo} · ${t.nombre}${medidas}`, t.codigo));
        });
        const inPeso = input('number', 'Peso de cada uno en kg', { min: 0, step: 0.1, placeholder: '0' });
        const subtotal = document.createElement('span');
        const quitar = crearBotonIcono('eliminar', '', 'bi-x-lg', 'Quitar este bulto');

        // Al elegir un artículo del catálogo, su peso promedio se llena solo (se puede cambiar)
        function pesoDelCatalogo() {
            const c = categoriaDe(selCat.value);
            if (!c || c.tipo !== 'articulos') return;
            const nombre = inDesc.value.trim().toLowerCase();
            const art = catalogo.find((a) => a.categoria_id === c.id && a.nombre.toLowerCase() === nombre);
            if (art) inPeso.value = Number(art.peso_kg);
        }

        // Cada tipo de categoría pide cosas distintas (igual que en Pedidos)
        function alCambiarCategoria() {
            const c = categoriaDe(selCat.value);
            const tipo = c ? c.tipo : 'bulto';
            const esDocumento = tipo === 'documento';
            inDesc.disabled = esDocumento;
            if (esDocumento) inDesc.value = '';
            inDesc.placeholder = tipo === 'articulos' ? 'Elige o escribe el artículo' : esDocumento ? 'Documentos / sobres' : 'Ej. caja de ropa';
            if (tipo === 'articulos') inDesc.setAttribute('list', `cotLista${c.id}`);
            else inDesc.removeAttribute('list');
            selTam.disabled = tipo !== 'bulto';
            if (selTam.disabled) selTam.value = '';
            // Documento: peso fijo de la categoría (peso_referencia)
            inPeso.readOnly = esDocumento;
            if (esDocumento) inPeso.value = Number(c.peso_referencia || 0.2);
            pesoDelCatalogo();
        }

        selCat.addEventListener('change', () => { alCambiarCategoria(); recalcular(); });
        inDesc.addEventListener('input', () => { pesoDelCatalogo(); recalcular(); });
        [inCant, inPeso, selTam].forEach((el) => el.addEventListener('input', recalcular));
        quitar.addEventListener('click', () => {
            tr.remove();
            if (!cuerpo.children.length) agregarFila();
            recalcular();
        });

        tr.append(celda(selCat, 'cot-col-categoria', 'Categoría'), celda(inDesc, 'cot-col-desc', 'Artículo / descripción'),
            celda(inCant, 'cot-col-cant', 'Cantidad'), celda(selTam, 'cot-col-tamano', 'Tamaño'),
            celda(inPeso, 'cot-col-peso', 'Peso c/u (kg)'), celda(subtotal, 'cot-subtotal', 'Peso'), crearCeldaAcciones(quitar));
        // Para leer la fila después
        tr.datos = () => {
            const c = categoriaDe(selCat.value);
            const cantidad = Math.max(1, Math.round(numero(inCant)) || 1);
            const pesoUno = numero(inPeso);
            return {
                categoria: c ? c.nombre : 'Bulto',
                descripcion: inDesc.value.trim(),
                tamano: selTam.value,
                cantidad, pesoUno, peso: r2(cantidad * pesoUno),
                mostrar: (texto) => { subtotal.textContent = texto; },
            };
        };
        cuerpo.appendChild(tr);
        alCambiarCategoria();
        return tr;
    }

    const leerBultos = () => [...cuerpo.children].map((tr) => tr.datos());

    // ==================================================
    // CÁLCULO (mismas funciones que Pedidos: js/componentes.js)
    // ==================================================

    function filaDesglose(tbody, texto, monto, nota = '') {
        const tr = tbody.insertRow();
        const td1 = tr.insertCell();
        td1.textContent = texto;
        if (nota) {
            const s = document.createElement('small');
            s.textContent = nota;
            td1.appendChild(s);
        }
        tr.insertCell().textContent = monto;
    }

    function recalcular() {
        const bultos = leerBultos();
        bultos.forEach((b) => b.mostrar(kilos(b.peso)));
        const peso = r2(bultos.reduce((s, b) => s + b.peso, 0));
        const unidades = bultos.reduce((s, b) => s + b.cantidad, 0);
        $('#cotPeso').textContent = `${kilos(peso)} · ${plural(unidades, 'bulto', 'bultos')}`;

        const tarifa = buscarTarifa(tarifas, COT_ACTIVIDAD, tiendaElegida());
        const tbody = $('#cotDesglose');
        tbody.replaceChildren();
        const lineas = []; // para copiar / WhatsApp

        if (!tarifa) {
            filaDesglose(tbody, 'No hay tarifa de Encomiendas para esta tienda ni una general (Configuración → Pedidos → Tarifas).', dinero(0));
            $('#cotTotal').textContent = dinero(0);
            pintarBarra(0, 'Sin tarifa', peso);
            $('#cotTarifa').textContent = '';
            textoCotizacion = '';
            dibujarRapida(null);
            return;
        }

        const km = rutaCot ? rutaCot.km : 0;
        const conKm = Number(tarifa.precio_km) > 0;
        const calc = calcularEnvioTarifa(tarifa, peso, 0, km);
        const desc = descuentos.find((d) => String(d.id) === selDescuento.value) || null;
        const descuento = montoDescuento(desc, calc.envio);
        const total = r2(calc.envio - descuento);

        const linea = (texto, monto, nota) => { filaDesglose(tbody, texto, monto, nota); lineas.push(`${texto}: ${monto}`); };
        if (Number(tarifa.cargo_fijo)) linea('Cargo fijo', dinero(tarifa.cargo_fijo));
        if (Number(tarifa.minimo)) {
            const kmIncl = conKm && Number(tarifa.km_incluidos) > 0 ? ` y ${Number(tarifa.km_incluidos)} km` : '';
            linea('Mínimo', dinero(tarifa.minimo), `Cubre hasta ${kilos(tarifa.kg_incluidos)}${kmIncl}`);
        }
        if (calc.kgAdicional > 0 && Number(tarifa.precio_kg)) {
            linea(`Peso adicional: ${kilos(calc.kgAdicional)} × ${dinero(tarifa.precio_kg)}`, dinero(calc.montoKg),
                `${kilos(peso)} − ${kilos(tarifa.kg_incluidos)} incluidos`);
        }
        if (conKm) {
            if (rutaCot) {
                const incl = Number(tarifa.km_incluidos || 0);
                const nota = [
                    incl > 0 ? `${rutaCot.km} km − ${incl} km incluidos en el mínimo` : null,
                    rutaCot.aproximada ? 'aproximada (línea recta)' : 'por calle, de A a B',
                ].filter(Boolean).join(' · ');
                linea(calc.kmAdicional > 0
                    ? `Distancia adicional: ${calc.kmAdicional} km × ${dinero(tarifa.precio_km)}`
                    : `Distancia: ${rutaCot.km} km (incluida en el mínimo)`, dinero(calc.montoKm), nota);
            } else {
                filaDesglose(tbody, 'Distancia: falta ubicar A y B en el mapa', dinero(0), `${dinero(tarifa.precio_km)} por km`);
            }
        }
        if (descuento) linea(`Descuento: ${desc.nombre}`, `−${dinero(descuento)}`);
        $('#cotTotal').textContent = dinero(total);
        pintarBarra(total, rutaCot ? `${rutaCot.km} km` : (conKm ? 'falta ubicar A y B' : ''), peso);
        $('#cotDistancia').textContent = rutaCot
            ? `${rutaCot.km} km${rutaCot.minutos != null ? ` · unos ${rutaCot.minutos} min` : ''}${rutaCot.aproximada ? ' (aproximada)' : ''}`
            : 'sin ubicar';

        const partes = [`Tarifa ${tarifa.alcance}`];
        if (!conKm) partes.push('esta tarifa no cobra por distancia');
        $('#cotTarifa').textContent = `${partes.join(' · ')}.`;

        // Texto para compartir con el cliente
        const detalle = bultos.filter((b) => b.peso > 0 || b.descripcion).map((b) =>
            `• ${b.cantidad} × ${b.descripcion || b.categoria}${b.tamano ? ` (${b.tamano})` : ''}: ${kilos(b.peso)}`);
        textoCotizacion = [
            `Cotización de envío – ${EMPRESA.nombre || ''}`.trim(),
            `Encomienda: ${plural(unidades, 'bulto', 'bultos')}, ${kilos(peso)}`,
            ...(inOrigen.value.trim() ? [`Recolección: ${inOrigen.value.trim()}`] : []),
            ...(inDestino.value.trim() ? [`Entrega: ${inDestino.value.trim()}`] : []),
            ...(rutaCot ? [`Distancia: ${rutaCot.km} km${rutaCot.aproximada ? ' (aproximada)' : ''}`] : []),
            ...detalle,
            '',
            ...lineas,
            `TOTAL DEL ENVÍO: ${dinero(total)}`,
            '',
            `Cotización del ${new Date().toLocaleDateString('es-CR')}. El precio final se confirma con el peso real al recibir la encomienda.`,
        ].join('\n');

        dibujarRapida(tarifa, desc);
    }

    // Barra de abajo (tablet y celular): precio + peso y distancia
    function pintarBarra(total, distancia, peso) {
        $('#cotBarraTotal').textContent = dinero(total);
        $('#cotBarraDetalle').textContent = [kilos(peso), distancia].filter(Boolean).join(' · ');
    }

    // Tabla de precios según el peso con la tarifa elegida (sin contar lo escrito arriba)
    function dibujarRapida(tarifa, desc = null) {
        const filaPesos = $('#cotRapidaPesos');
        const filaPrecios = $('#cotRapidaPrecios');
        filaPesos.replaceChildren();
        filaPrecios.replaceChildren();
        $('.cot-rapida').hidden = !tarifa;
        if (!tarifa) return;
        $('#cotRapidaTexto').textContent = `Tarifa ${tarifa.alcance}${desc ? `, con el descuento "${desc.nombre}"` : ''}. Solo por peso` +
            (Number(tarifa.precio_km) > 0
                ? `: la distancia se suma aparte (${dinero(tarifa.precio_km)} por km${Number(tarifa.km_incluidos) > 0 ? ` después de ${Number(tarifa.km_incluidos)} km` : ''}).`
                : '.');
        COT_PESOS_RAPIDOS.forEach((kg) => {
            const th = document.createElement('th');
            th.textContent = `${kg} kg`;
            filaPesos.appendChild(th);
            const envio = calcularEnvioTarifa(tarifa, kg, 0).envio;
            filaPrecios.insertCell().textContent = dinero(r2(envio - montoDescuento(desc, envio)));
        });
    }

    function nuevaCotizacion() {
        cuerpo.replaceChildren();
        agregarFila();
        selDescuento.value = '';
        inOrigen.value = '';
        inDestino.value = '';
        rutaCot = null;
        if (mapaRuta) mapaRuta.ponerB(null).then(actualizarPuntoA);
        recalcular();
    }

    // ==================================================
    // COMPARTIR
    // ==================================================

    async function copiar() {
        if (!textoCotizacion) return;
        try {
            await navigator.clipboard.writeText(textoCotizacion);
            aviso.mostrar('Cotización copiada. Pégala donde quieras enviarla.');
        } catch (e) {
            aviso.mostrar('El navegador no permitió copiar. Usa el botón de WhatsApp.', 'error');
        }
    }

    function whatsapp() {
        if (!textoCotizacion) return;
        window.open(`https://wa.me/?text=${encodeURIComponent(textoCotizacion)}`, '_blank', 'noopener');
    }

    // ==================================================
    // EVENTOS Y ARRANQUE
    // ==================================================

    selTienda.addEventListener('change', () => {
        llenarDescuentos();
        recalcular();
        if (origenEsTienda()) actualizarPuntoA(); // A = la nueva tienda
    });
    selDescuento.addEventListener('change', recalcular);
    $('#cotAgregar').addEventListener('click', () => {
        const tr = agregarFila();
        recalcular();
        tr.querySelector('select').focus();
    });
    $('#cotLimpiar').addEventListener('click', nuevaCotizacion);
    $('#cotVerDetalle').addEventListener('click', () => $('.cot-resultado').scrollIntoView({ behavior: 'smooth', block: 'start' }));
    $('#cotCopiar').addEventListener('click', copiar);
    $('#cotWhatsapp').addEventListener('click', whatsapp);

    (async () => {
        if (!empresaTieneActividad(COT_ACTIVIDAD)) {
            $('#cotNota').textContent = 'Esta empresa no realiza Encomiendas (empresas/empresas.js).';
            $('#cotNota').hidden = false;
            return;
        }
        if (await cargar()) prepararFormulario();
    })();

    return () => {
        aviso.limpiar();
        if (mapaRuta) mapaRuta.destruir();
    };
});
