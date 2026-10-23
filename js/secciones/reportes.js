/* ==================================================
   SECCIÓN: REPORTES - LÓGICA
   ACACHETE LOGISTICS

   Diseño: PROPUESTA-ESTRUCTURADA-V2.md, secciones 31.10 y 31.11.
   Lee la tabla "pedidos" (+ su cierre de entrega) con los filtros elegidos y
   muestra: tarjetas de resumen, gráficas, récord del cliente / rendimiento
   del empleado o piloto elegido, y la tabla detallada. Exporta a Excel y
   PDF exactamente lo que se ve.

   ACTIVIDAD (pestañas): cada reporte es de UNA actividad de la empresa
     (Entregas de tienda | Encomiendas), nunca revueltas. Lo que se muestra
     cambia según lo que USA la actividad (Configuración -> Actividades):
       usa_compra      -> tarjeta "Compras" (+ envíos gratis), gráfica "Compras
                          por tienda", columna "Compra"
       permite_alcohol -> tarjeta y columna "Alcohol"
       usa_bodega      -> tarjeta "En bodega"
       usa_punto_partida -> tarjeta y columna "Punto de partida"
       usa_tamanos     -> gráfica "Bultos por tamaño"
       sin compra      -> tarjeta "Peso transportado" y columna "Bultos"
     Para agregar algo propio de una actividad: TARJETAS_ACTIVIDAD,
     COLUMNAS (campo "si") y graficaExtra().

   FILTROS (en cascada, como pidió el usuario):
     1. Región  -> 2. Tienda (solo las de esa región) -> 3. Cliente / Empleado /
     Piloto (solo con una tienda elegida; la lista sale de los pedidos cargados).
     Además: fechas (desde / hasta, con atajos).
     Los filtros quedan en la dirección (#reportes?actividad=tienda&region=CEN&...),
     así se puede volver con "atrás" o compartir el enlace (sin recargar).

   PERMISOS (lo controla la página; la regla real llega en la Fase 7):
     - Administrador y Admin G1: todo; exportan.
     - Admin G2: su región (fija); exporta.
     - Admin G3: su región y su tienda (fijas); SOLO VE (no exporta).
     - Empleado y Piloto: sin acceso (SECCIONES_BLOQUEADAS / SECCIONES_POR_ROL).

   GRÁFICAS: Chart.js. Cada gráfica es de UNA sola serie -> un solo color
   (REP_COLORES.serie); barras finas, cuadrícula suave, valor al pasar el
   mouse y una tabla "Ver datos" con los mismos números.
   Librerías gratuitas desde CDN, se descargan solo al usarlas.
   ================================================== */

// Direcciones de las librerías y cargarLibreria(): js/componentes.js (también las usa Inicio)
const REP_LIBRERIAS = LIBRERIAS;

// Colores de las gráficas (paleta de referencia validada; una serie = un color)
const REP_COLORES = {
    serie: '#2a78d6',       // barras
    rejilla: '#e1e0d9',     // cuadrícula (línea fina)
    ejeTexto: '#898781',    // textos de los ejes
    tinta: '#0b0b0b',
};

const REP_MONEDA = '₡';       // en pantalla y Excel
const REP_MONEDA_PDF = 'CRC ';  // el PDF no tiene el símbolo ₡ en su letra estándar

const REP_ESTADOS = [
    ['registrado', 'Registrado'], ['recibido_bodega', 'En bodega'], ['asignado', 'Asignado'],
    ['reprogramado', 'Reprogramado'], ['alistando', 'Alistando'], ['listo_despacho', 'Listo para despachar'],
    ['recibido_ruta', 'Recibido para ruta'], ['cargado', 'Cargado'], ['en_ruta', 'En ruta'], ['en_entrega', 'Entregando'],
    ['entregado', 'Entregado'],
    ['entregado_incidencia', 'Entregado con incidencia'], ['no_entregado', 'No entregado'],
    ['no_salio', 'No salió a ruta'], ['devuelto', 'Devuelto'], ['cancelado', 'Cancelado'],
];
const REP_TEXTO_ESTADO = Object.fromEntries(REP_ESTADOS);
const REP_ENTREGADOS = ['entregado', 'entregado_incidencia'];
const REP_PENDIENTES = ['registrado', 'recibido_bodega', 'asignado', 'reprogramado', 'alistando', 'listo_despacho',
    'recibido_ruta', 'cargado', 'en_ruta', 'en_entrega'];

// ==================================================
// PESTAÑA "CAJAS": cierres de caja de los pilotos (sql/01 bloque 24, tabla cierres_caja)
// Filtros: fechas, tienda, piloto y resultado (faltante / sobrante / cuadra). Tarjetas con
// los totales, tabla de cierres y, al abrir uno, su detalle: montos, si faltó o sobró
// dinero y el MOTIVO (notas del cierre), y los cobros que entraron en él.
// opciones: { puedeExportar, aviso, tiendas (las que el usuario puede ver), limitar (true = solo esas) }
// ==================================================
const REP_CAJ_FORMAS = { efectivo: 'Efectivo', sinpe: 'SINPE Móvil', tarjeta: 'Tarjeta' };

function montarReporteCajas(caja, { puedeExportar, aviso, tiendas, limitar }) {
    const dinero = (n) => `₡${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fechaTexto = (f) => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
    const aTexto = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const nombreTienda = (id) => {
        const t = tiendas.find((x) => x.id === id);
        return t ? `${t.codigo} · ${t.nombre}` : 'Sin tienda';
    };
    const esperado = (c) => Number(c.fondo) + Number(c.efectivo);
    const resultadoDe = (c) => {
        const d = Number(c.diferencia);
        return d < 0 ? 'faltante' : d > 0 ? 'sobrante' : 'cuadra';
    };

    caja.innerHTML = `
        <div class="tarjeta rep-filtros rep-caj-filtros">
            <div class="rep-fechas rep-caj-fila">
                <div class="campo"><label class="campo-etiqueta" for="repCajDesde">Desde</label><input id="repCajDesde" type="date" class="campo-input"></div>
                <div class="campo"><label class="campo-etiqueta" for="repCajHasta">Hasta</label><input id="repCajHasta" type="date" class="campo-input"></div>
                <div class="campo"><label class="campo-etiqueta" for="repCajTienda">Tienda</label><select id="repCajTienda" class="campo-input"></select></div>
                <div class="campo"><label class="campo-etiqueta" for="repCajPiloto">Piloto</label><select id="repCajPiloto" class="campo-input"></select></div>
                <div class="campo"><label class="campo-etiqueta" for="repCajResultado">Resultado</label>
                    <select id="repCajResultado" class="campo-input">
                        <option value="">Todos</option>
                        <option value="faltante">Con faltante</option>
                        <option value="sobrante">Con sobrante</option>
                        <option value="cuadra">Cuadró exacto</option>
                    </select></div>
                <button type="button" id="repCajExcel" class="boton boton-secundario boton-chico" hidden>
                    <i class="bi bi-file-earmark-excel"></i> <span>Excel</span></button>
            </div>
        </div>
        <div id="repCajKpis" class="rep-kpis"></div>
        <div class="tarjeta rep-caj-tabla-caja">
            <h3 class="rep-titulo">Cierres de caja <small class="rep-caj-ayuda">Toca un cierre para ver su detalle</small></h3>
            <div class="tabla-caja">
                <table class="tabla rep-caj-tabla">
                    <thead><tr>
                        <th>Fecha</th><th>Piloto</th><th>Tienda</th><th class="rep-numero">Cobros</th>
                        <th class="rep-numero">A entregar</th><th class="rep-numero">Contado</th>
                        <th class="rep-numero">Diferencia</th><th>Motivo / notas</th><th>Cerró</th>
                    </tr></thead>
                    <tbody id="repCajCuerpo"></tbody>
                </table>
            </div>
        </div>
        <dialog id="repCajDialogo" class="dialogo rep-caj-dialogo" aria-labelledby="repCajDetTitulo">
            <div class="dialogo-form">
                <h3 id="repCajDetTitulo" class="dialogo-titulo"></h3>
                <p id="repCajDetSub" class="rep-caj-sub"></p>
                <p id="repCajDetResultado" class="rep-caj-resultado"></p>
                <dl id="repCajDetMontos" class="rep-caj-montos"></dl>
                <h4 class="rep-caj-subtitulo">Cobros incluidos</h4>
                <div class="tabla-caja">
                    <table class="tabla rep-caj-cobros">
                        <thead><tr><th>Código</th><th>Cliente</th><th>Forma</th><th class="rep-numero">Monto</th><th>Comprobante</th></tr></thead>
                        <tbody id="repCajDetCobros"></tbody>
                    </table>
                </div>
                <div class="dialogo-botones"><button type="button" class="boton boton-principal" data-cerrar>Cerrar</button></div>
            </div>
        </dialog>`;
    const $ = (s) => caja.querySelector(s);
    const inDesde = $('#repCajDesde');
    const inHasta = $('#repCajHasta');
    const selTienda = $('#repCajTienda');
    const selPiloto = $('#repCajPiloto');
    const selResultado = $('#repCajResultado');
    const cuerpo = $('#repCajCuerpo');
    const dlg = $('#repCajDialogo');
    let cierres = [];
    let hayTabla = true;

    const hoy = new Date();
    inDesde.value = aTexto(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    inHasta.value = aTexto(hoy);
    selTienda.replaceChildren(new Option(limitar ? 'Todas mis tiendas' : 'Todas', ''),
        ...tiendas.map((t) => new Option(`${t.codigo} · ${t.nombre}`, String(t.id))));
    $('#repCajExcel').hidden = !puedeExportar;

    async function cargar() {
        let q = db.from('cierres_caja')
            .select('id, fecha, piloto_id, piloto_nombre, tienda_id, fondo, efectivo, sinpe, tarjeta, efectivo_contado, diferencia, cantidad, notas, cerrado_por_nombre, cerrado_en')
            .gte('fecha', inDesde.value).lte('fecha', inHasta.value)
            .order('cerrado_en', { ascending: false }).limit(1000);
        if (selTienda.value) q = q.eq('tienda_id', Number(selTienda.value));
        else if (limitar) q = q.in('tienda_id', tiendas.length ? tiendas.map((t) => t.id) : [0]);
        const { data, error } = await q;
        if (error) {
            console.error('Error al cargar los cierres de caja:', error);
            hayTabla = !['42P01', 'PGRST205', '42703'].includes(error.code);
            cierres = [];
            dibujar(hayTabla ? 'No se pudieron cargar los cierres de caja.' : 'Falta instalar la base de datos (sql/instalacion).');
            return;
        }
        cierres = data || [];
        // Pilotos que tienen cierres en el período (se conserva el elegido)
        const elegido = selPiloto.value;
        const pilotos = new Map();
        cierres.forEach((c) => pilotos.set(String(c.piloto_id ?? ''), c.piloto_nombre));
        selPiloto.replaceChildren(new Option('Todos', ''),
            ...[...pilotos].sort((a, b) => a[1].localeCompare(b[1])).map(([id, nombre]) => new Option(nombre, id)));
        selPiloto.value = pilotos.has(elegido) ? elegido : '';
        dibujar();
    }

    const visibles = () => cierres.filter((c) => (!selPiloto.value || String(c.piloto_id ?? '') === selPiloto.value)
        && (!selResultado.value || resultadoDe(c) === selResultado.value));

    function kpi(texto, valor, detalle, clase = '') {
        const d = document.createElement('div');
        d.className = `rep-kpi ${clase}`;
        [['rep-kpi-texto', texto], ['rep-kpi-valor', valor], ['rep-kpi-detalle', detalle]].forEach(([c, t]) => {
            if (!t) return;
            const s = document.createElement('span');
            s.className = c;
            s.textContent = t;
            d.appendChild(s);
        });
        return d;
    }

    function dibujar(mensaje = '') {
        const lista = visibles();
        const falt = lista.filter((c) => Number(c.diferencia) < 0);
        const sobr = lista.filter((c) => Number(c.diferencia) > 0);
        const suma = (l, f) => l.reduce((s, c) => s + f(c), 0);
        const sinMotivo = falt.filter((c) => !(c.notas || '').trim()).length;
        $('#repCajKpis').replaceChildren(
            kpi('Cierres', String(lista.length), `${plural(suma(lista, (c) => Number(c.cantidad)), 'cobro', 'cobros')}`),
            kpi('Total cerrado', dinero(suma(lista, (c) => Number(c.efectivo) + Number(c.sinpe) + Number(c.tarjeta))),
                `Efectivo ${dinero(suma(lista, (c) => Number(c.efectivo)))}`),
            kpi('Faltantes', dinero(suma(falt, (c) => Math.abs(Number(c.diferencia)))),
                `${plural(falt.length, 'cierre', 'cierres')}${sinMotivo ? ` · ${sinMotivo} sin motivo` : ''}`, falt.length ? 'rep-caj-kpi-falta' : ''),
            kpi('Sobrantes', dinero(suma(sobr, (c) => Number(c.diferencia))), plural(sobr.length, 'cierre', 'cierres'), sobr.length ? 'rep-caj-kpi-sobra' : ''),
            kpi('Cuadraron exacto', String(lista.length - falt.length - sobr.length), lista.length ? `de ${lista.length}` : ''),
        );

        cuerpo.replaceChildren();
        if (mensaje || !lista.length) {
            cuerpo.appendChild(crearFilaVacia(mensaje || 'No hay cierres de caja con estos filtros.', 9));
            return;
        }
        lista.forEach((c) => {
            const tr = document.createElement('tr');
            tr.className = `rep-caj-fila-${resultadoDe(c)}`;
            tr.dataset.cierre = c.id;
            tr.tabIndex = 0;
            const dif = Number(c.diferencia);
            const tdDif = crearCelda(dif === 0 ? 'Cuadra' : `${dif > 0 ? 'Sobra' : 'Falta'} ${dinero(Math.abs(dif))}`, 'rep-numero');
            if (dif !== 0) tdDif.classList.add(dif > 0 ? 'rep-caj-sobra' : 'rep-caj-falta');
            const tdMotivo = crearCelda(c.notas || (dif < 0 ? 'Sin motivo' : ''), 'rep-caj-motivo');
            if (!c.notas && dif < 0) tdMotivo.classList.add('rep-caj-sin-motivo');
            tr.append(
                crearCelda(fechaTexto(c.fecha)),
                crearCelda(c.piloto_nombre),
                crearCelda(nombreTienda(c.tienda_id)),
                crearCelda(String(c.cantidad), 'rep-numero'),
                crearCelda(dinero(esperado(c)), 'rep-numero'),
                crearCelda(dinero(c.efectivo_contado), 'rep-numero'),
                tdDif, tdMotivo,
                crearCelda(c.cerrado_por_nombre),
            );
            cuerpo.appendChild(tr);
        });
    }

    // ---------- Detalle de un cierre ----------
    async function abrirDetalle(id) {
        const c = cierres.find((x) => x.id === id);
        if (!c) return;
        const dif = Number(c.diferencia);
        $('#repCajDetTitulo').textContent = `Cierre de caja · ${c.piloto_nombre}`;
        $('#repCajDetSub').textContent = `${fechaTexto(c.fecha)} · ${nombreTienda(c.tienda_id)} · cerró ${c.cerrado_por_nombre || '—'}`
            + ` a las ${new Date(c.cerrado_en).toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' })}`;
        const res = $('#repCajDetResultado');
        res.className = `rep-caj-resultado rep-caj-resultado-${resultadoDe(c)}`;
        res.replaceChildren();
        const fuerte = document.createElement('strong');
        fuerte.textContent = dif === 0 ? 'Cuadró exacto' : `${dif > 0 ? 'Sobrante' : 'Faltante'} de ${dinero(Math.abs(dif))}`;
        res.appendChild(fuerte);
        const motivo = document.createElement('span');
        motivo.textContent = c.notas ? `Motivo: ${c.notas}` : dif < 0 ? 'No se anotó el motivo del faltante.' : dif > 0 ? 'Sin notas.' : (c.notas || '');
        if (motivo.textContent) res.appendChild(motivo);

        const dl = $('#repCajDetMontos');
        dl.replaceChildren();
        [
            ['Fondo de caja', dinero(c.fondo)],
            ['Efectivo cobrado', dinero(c.efectivo)],
            ['Efectivo a entregar', dinero(esperado(c))],
            ['Efectivo contado', dinero(c.efectivo_contado)],
            ['SINPE verificado', dinero(c.sinpe)],
            ['Tarjeta', dinero(c.tarjeta)],
        ].forEach(([e, v]) => {
            const dt = document.createElement('dt');
            dt.textContent = e;
            const dd = document.createElement('dd');
            dd.textContent = v;
            dl.append(dt, dd);
        });

        const tb = $('#repCajDetCobros');
        tb.replaceChildren(crearFilaVacia('Cargando...', 5));
        if (!dlg.open) dlg.showModal();
        const [ped, via] = await Promise.all([
            db.from('pedidos').select('id, codigo, cliente_nombre, total_cobrar, cobro_forma, forma_pago').eq('cierre_id', id).order('codigo'),
            typeof empresaTieneViajes === 'function' && empresaTieneViajes()
                ? db.from('viajes').select('id, codigo, cliente_nombre, total, forma_pago, cobro_forma').eq('cierre_id', id)
                : Promise.resolve({ data: [] }),
        ]);
        const filas = [
            ...((ped.data) || []).map((p) => ({ enlace: `#pedidos?id=${p.id}`, codigo: p.codigo, cliente: p.cliente_nombre, monto: p.total_cobrar,
                forma: p.cobro_forma || (p.forma_pago === 'tarjeta' ? 'tarjeta' : 'efectivo') })),
            ...((via.data) || []).map((v) => ({ enlace: `#viajes?id=${v.id}`, codigo: v.codigo || `#${v.id}`, cliente: v.cliente_nombre, monto: v.total,
                forma: v.cobro_forma || v.forma_pago || 'efectivo' })),
        ];
        tb.replaceChildren();
        if (ped.error) {
            tb.appendChild(crearFilaVacia('No se pudieron cargar los cobros.', 5));
            return;
        }
        if (!filas.length) {
            tb.appendChild(crearFilaVacia('Sin cobros registrados en este cierre.', 5));
            return;
        }
        // Fotos del comprobante de pago de esos pedidos (sql/01 bloque 37; sin él, ninguna)
        const idsPed = (ped.data || []).map((p) => p.id);
        const comp = idsPed.length
            ? await db.from('pedido_evidencias').select('pedido_id, url, eliminada_en').eq('tipo', 'pago').in('pedido_id', idsPed)
            : { data: [] };
        const fotosDe = (enlace) => (comp.data || []).filter((e) => e.url && !e.eliminada_en && enlace === `#pedidos?id=${e.pedido_id}`);
        filas.forEach((f) => {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            const a = document.createElement('a');
            a.href = f.enlace;
            a.textContent = f.codigo;
            a.addEventListener('click', () => dlg.close());
            td.appendChild(a);
            const tdComp = document.createElement('td');
            const fotos = fotosDe(f.enlace);
            if (!fotos.length) tdComp.textContent = '—';
            fotos.forEach((e, i) => {
                const ver = document.createElement('a');
                ver.href = e.url;
                ver.target = '_blank';
                ver.rel = 'noopener';
                ver.className = 'rep-caj-comprobante';
                ver.innerHTML = '<i class="bi bi-receipt"></i> ';
                ver.append(fotos.length > 1 ? `Ver ${i + 1}` : 'Ver');
                tdComp.appendChild(ver);
            });
            tr.append(td, crearCelda(f.cliente), crearCelda(REP_CAJ_FORMAS[f.forma] || f.forma), crearCelda(dinero(f.monto), 'rep-numero'), tdComp);
            tb.appendChild(tr);
        });
    }

    // ---------- Excel ----------
    async function exportarExcel() {
        const lista = visibles();
        if (!lista.length) { aviso.mostrar('No hay cierres para exportar con estos filtros.', 'error'); return; }
        try {
            await cargarLibreria(LIBRERIAS.xlsx);
        } catch {
            aviso.mostrar('No se pudo cargar el exportador de Excel (revisa internet).', 'error');
            return;
        }
        const XLSX = window.XLSX;
        const libro = XLSX.utils.book_new();
        const hoja = XLSX.utils.aoa_to_sheet([
            [`${nombreEmpresaExportar()} - Cierres de caja`], [`Del ${inDesde.value} al ${inHasta.value}`], [`Generado: ${new Date().toLocaleString('es-CR')}`], [],
            ['Fecha', 'Piloto', 'Tienda', 'Cobros', 'Fondo', 'Efectivo cobrado', 'A entregar', 'Contado', 'SINPE', 'Tarjeta', 'Diferencia', 'Resultado', 'Motivo / notas', 'Cerró'],
            ...lista.map((c) => [c.fecha, c.piloto_nombre, nombreTienda(c.tienda_id), Number(c.cantidad), Number(c.fondo), Number(c.efectivo),
                esperado(c), Number(c.efectivo_contado), Number(c.sinpe), Number(c.tarjeta), Number(c.diferencia),
                { faltante: 'Faltante', sobrante: 'Sobrante', cuadra: 'Cuadra' }[resultadoDe(c)], c.notas || '', c.cerrado_por_nombre || '']),
        ]);
        hoja['!cols'] = [12, 22, 24, 8, 12, 14, 12, 12, 12, 12, 12, 10, 40, 18].map((wch) => ({ wch }));
        XLSX.utils.book_append_sheet(libro, hoja, 'Cierres de caja');
        XLSX.writeFile(libro, `cierres-de-caja-${inDesde.value}-a-${inHasta.value}.xlsx`);
        aviso.mostrar('Excel descargado.');
    }

    // ---------- Eventos ----------
    [inDesde, inHasta, selTienda].forEach((el) => el.addEventListener('change', cargar));
    [selPiloto, selResultado].forEach((el) => el.addEventListener('change', () => dibujar()));
    $('#repCajExcel').addEventListener('click', exportarExcel);
    dlg.querySelector('[data-cerrar]').addEventListener('click', () => dlg.close());
    cuerpo.addEventListener('click', (e) => {
        const tr = e.target.closest('tr[data-cierre]');
        if (tr) abrirDetalle(Number(tr.dataset.cierre));
    });
    cuerpo.addEventListener('keydown', (e) => {
        const tr = e.target.closest('tr[data-cierre]');
        if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirDetalle(Number(tr.dataset.cierre)); }
    });

    cargar();
    return { limpiar: () => { if (dlg.open) dlg.close(); }, recargar: cargar };
}

registrarSeccion('reportes', (zona) => {

    const $ = (selector) => zona.querySelector(selector);
    const aviso = crearAviso($('#repAviso'), 5000);

    // ---------- Permisos (js/sesion.js) ----------
    const esGeneral = esAdministrador() || esAdminG1();
    const regionG2 = esAdminG2() ? regionActual() : null;
    // Solo su tienda: Admin G3, y el Empleado al que se le dio Reportes (Usuarios -> "Módulos y funciones")
    const esG3 = esAdminG3() || rolActual() === 'empleado';
    // Piloto: SOLO sus pedidos y solo de los últimos 7 días (hoy y los 6 anteriores)
    const esPiloto = rolActual() === 'piloto';
    const REP_DIAS_PILOTO = 7;
    // Por rol: G3 solo ve; el piloto exporta lo suyo. La función del usuario puede quitarlo o darlo
    // (puedeHacer, js/sesion.js). Y solo si el plan de la empresa lo incluye (empresas/empresas.js)
    const puedeExportar = puedeHacer('reportes.exportar', esGeneral || !!regionG2 || esPiloto)
        && (typeof funcionHabilitada !== 'function' || funcionHabilitada('exportar'));

    // ---------- Elementos ----------
    const selRegion = $('#repRegion');
    const selTienda = $('#repTienda');
    const selTipo = $('#repTipo');
    const selEntidad = $('#repEntidad');
    const inDesde = $('#repDesde');
    const inHasta = $('#repHasta');
    const contenido = $('#repContenido');

    // ---------- Estado ----------
    let regiones = [];
    let tiendas = [];       // tiendas que el usuario puede ver
    let actividades = [];   // las de la empresa, con lo que usa cada una
    let actividad = null;   // la de la pestaña ({ codigo, nombre, usa_... })
    let pedidosCargados = []; // pedidos de la actividad + región/tienda/fechas
    let pedidos = [];       // + filtro de cliente / empleado / piloto (lo que se ve)
    let nombres = {};       // id de usuario -> nombre (empleados y pilotos)
    const graficas = {};    // id del canvas -> gráfica de Chart.js
    let orden = { columna: 'fecha', asc: false };
    let pagina = 0;
    const POR_PAGINA = 25;

    // ---------- Pestaña "Viajes" (Transporte, sql/01 bloque 19) ----------
    // Tiene su propio reporte, filtros y exportación (montarReporteViajes, js/viajes-comun.js).
    const REP_VIAJES = 'viajes';
    let enViajes = false;
    let reporteViajes = null;
    const cajaViajes = document.createElement('div');
    cajaViajes.id = 'repViajes';
    cajaViajes.hidden = true;
    $('#repPestanas').after(cajaViajes);

    // ---------- Pestaña "Cajas": cierres de caja de los pilotos (montarReporteCajas, arriba) ----------
    const REP_CAJAS = 'cajas';
    let enCajas = false;
    let reporteCajas = null;
    const filtrosPedidos = zona.querySelector('.rep-filtros'); // los de pedidos (la pestaña Cajas tiene los suyos)
    const cajaCajas = document.createElement('div');
    cajaCajas.id = 'repCajas';
    cajaCajas.className = 'rep-cajas';
    cajaCajas.hidden = true;
    cajaViajes.after(cajaCajas);

    // cual: null (reporte de pedidos de la actividad) | REP_VIAJES | REP_CAJAS
    function mostrarEspecial(cual) {
        enViajes = cual === REP_VIAJES;
        enCajas = cual === REP_CAJAS;
        cajaViajes.hidden = !enViajes;
        cajaCajas.hidden = !enCajas;
        filtrosPedidos.hidden = !!cual;
        contenido.hidden = !!cual;
        $('#repExportar').hidden = !!cual || !puedeExportar;
        if (cual) {
            $('#repNota').hidden = true;
            history.replaceState(null, '', `#reportes?actividad=${cual}`);
        }
        if (enViajes) {
            $('#repSubtitulo').textContent = 'Viajes, ingresos, vehículos, costos y cortesías';
            if (!reporteViajes) reporteViajes = montarReporteViajes(cajaViajes, { puedeExportar, aviso });
        } else if (enCajas) {
            $('#repSubtitulo').textContent = textoExportar('Cierres de caja de los pilotos: faltantes, sobrantes y sus motivos');
            if (!reporteCajas) reporteCajas = montarReporteCajas(cajaCajas, { puedeExportar, aviso, tiendas, limitar: !!regionG2 || esG3 });
        } else {
            $('#repSubtitulo').textContent = textoExportar('Pedidos, entregas, cobros y récord de clientes');
        }
    }
    const mostrarViajes = (si) => mostrarEspecial(si ? REP_VIAJES : null);

    // ==================================================
    // AYUDAS
    // ==================================================

    const dinero = (n, pdf = false) => `${pdf ? REP_MONEDA_PDF : REP_MONEDA}${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const porcentaje = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
    const aTexto = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hoy = () => aTexto(new Date());
    const corta = (t) => (t ? t.split('-').reverse().join('/') : '—');
    const nombreTienda = (id) => { const t = tiendas.find((x) => x.id === id); return t ? t.codigo : '—'; };
    const entregaDe = (p) => (Array.isArray(p.pedido_entregas) ? p.pedido_entregas[0] : p.pedido_entregas) || null;
    const kilos = (n) => `${Math.round(Number(n || 0) * 100) / 100} kg`;

    // ¿La actividad de la pestaña usa esta parte? (usaActividad en empresas/empresas.js)
    const usa = (uso) => usaActividad(actividad, uso);
    const nombreActividad = () => (actividad ? actividad.nombre : '');
    // Unidades de mercadería del pedido (suma de cantidades de pedido_articulos)
    const unidadesDe = (p) => (p.pedido_articulos || []).reduce((s, a) => s + Number(a.cantidad || 0), 0);

    // ==================================================
    // FILTROS
    // ==================================================

    function atajo(tipo) {
        const d = new Date();
        let desde = new Date(d);
        let hasta = new Date(d);
        if (tipo === 'semana') desde.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        if (tipo === 'mes') desde = new Date(d.getFullYear(), d.getMonth(), 1);
        if (tipo === 'mes_anterior') {
            desde = new Date(d.getFullYear(), d.getMonth() - 1, 1);
            hasta = new Date(d.getFullYear(), d.getMonth(), 0);
        }
        if (tipo === 'anio') desde = new Date(d.getFullYear(), 0, 1);
        inDesde.value = aTexto(desde);
        inHasta.value = aTexto(hasta);
        marcarAtajo(tipo);
    }

    // Piloto: las fechas solo pueden estar dentro de los últimos 7 días
    function limitarFechasPiloto() {
        if (!esPiloto) return;
        const d = new Date();
        const minimo = aTexto(new Date(d.getFullYear(), d.getMonth(), d.getDate() - (REP_DIAS_PILOTO - 1)));
        const maximo = hoy();
        [inDesde, inHasta].forEach((i) => { i.min = minimo; i.max = maximo; });
        if (!inDesde.value || inDesde.value < minimo || inDesde.value > maximo) inDesde.value = minimo;
        if (!inHasta.value || inHasta.value > maximo || inHasta.value < minimo) inHasta.value = maximo;
    }

    function marcarAtajo(tipo) {
        zona.querySelectorAll('[data-atajo]').forEach((b) => b.classList.toggle('activo', b.dataset.atajo === tipo));
    }

    function llenarTiendas(actual = '') {
        const lista = tiendas.filter((t) => !selRegion.value || t.region === selRegion.value);
        selTienda.replaceChildren(new Option(selRegion.value ? 'Todas las de la región' : 'Todas', ''));
        lista.forEach((t) => selTienda.appendChild(new Option(`${t.codigo} · ${t.nombre}`, t.id)));
        selTienda.value = lista.some((t) => String(t.id) === String(actual)) ? String(actual) : '';
        if (esG3) {
            selTienda.value = String(tiendaActual());
            selTienda.disabled = true;
        }
    }

    // La 3.ª lista se arma con los pedidos cargados (así incluye clientes
    // escritos a mano en el pedido). Solo con una tienda elegida.
    function llenarEntidades(actual = '') {
        const tipo = selTipo.value;
        selEntidad.replaceChildren();
        if (!tipo) {
            selEntidad.appendChild(new Option('—', ''));
            selEntidad.disabled = true;
            return;
        }
        if (!selTienda.value) {
            selEntidad.appendChild(new Option('Elige primero la tienda', ''));
            selEntidad.disabled = true;
            return;
        }
        const opciones = new Map(); // valor -> texto
        pedidosCargados.forEach((p) => {
            if (tipo === 'cliente') opciones.set(`t:${p.cliente_telefono}`, `${p.cliente_nombre} · ${p.cliente_telefono}`);
            if (tipo === 'empleado' && p.creado_por) opciones.set(String(p.creado_por), nombres[p.creado_por] || `Usuario ${p.creado_por}`);
            if (tipo === 'piloto' && p.piloto_id) opciones.set(String(p.piloto_id), nombres[p.piloto_id] || `Piloto ${p.piloto_id}`);
        });
        selEntidad.appendChild(new Option(`Elige ${tipo === 'cliente' ? 'el cliente' : tipo === 'empleado' ? 'el empleado' : 'el piloto'} (${opciones.size})`, ''));
        [...opciones.entries()].sort((a, b) => a[1].localeCompare(b[1]))
            .forEach(([v, t]) => selEntidad.appendChild(new Option(t, v)));
        selEntidad.disabled = false;
        selEntidad.value = opciones.has(actual) ? actual : '';
    }

    // Guarda los filtros en la dirección sin recargar la sección
    function guardarEnDireccion() {
        const p = new URLSearchParams();
        if (actividad) p.set('actividad', actividad.codigo);
        if (selRegion.value) p.set('region', selRegion.value);
        if (selTienda.value) p.set('tienda', selTienda.value);
        if (selTipo.value) p.set('tipo', selTipo.value);
        if (selEntidad.value) p.set('ver', selEntidad.value);
        p.set('desde', inDesde.value);
        p.set('hasta', inHasta.value);
        history.replaceState(null, '', `#reportes?${p.toString()}`);
    }

    // ==================================================
    // CARGAR
    // ==================================================

    async function cargarBase() {
        let qTie = db.from('tiendas').select('id, codigo, nombre, region').order('codigo');
        let qReg = db.from('regiones').select('codigo, nombre').order('nombre');
        if (regionG2) { qTie = qTie.eq('region', regionG2); qReg = qReg.eq('codigo', regionG2); }
        if (esG3) qTie = qTie.eq('id', tiendaActual() || 0);
        const columnasAct = 'codigo, nombre, icono, usa_bodega, orden';
        const [tie, reg, actNueva] = await Promise.all([qTie, qReg,
            db.from('actividades').select(`${columnasAct}, usa_punto_partida, usa_compra, usa_tamanos, permite_alcohol`).order('orden')]);
        // Sin sql/01_actualizacion_base_existente no existen las columnas de "qué usa":
        // se leen las básicas y usaActividad() lo deduce por el código
        const act = actNueva.error && actNueva.error.code === '42703'
            ? await db.from('actividades').select(columnasAct).order('orden')
            : actNueva;
        const error = tie.error || reg.error || act.error;
        if (error) return error;
        tiendas = tie.data;
        // Solo las actividades de PEDIDOS de la empresa (empresas/empresas.js). Las de
        // viajes (Transporte) van juntas en la pestaña "Viajes" (js/viajes-comun.js)
        actividades = actividadesDePedidos(act.data);
        regiones = esG3 ? reg.data.filter((r) => tiendas.some((t) => t.region === r.codigo)) : reg.data;

        selRegion.replaceChildren(new Option('Todas', ''));
        regiones.forEach((r) => selRegion.appendChild(new Option(`${r.nombre} (${r.codigo})`, r.codigo)));

        // Valores iniciales: de la dirección, o este mes
        const q = parametrosSeccion();

        // Actividad: la de la dirección o la primera. Una pestaña por actividad
        // (con una sola no hace falta mostrarlas) + "Viajes" si la empresa hace viajes
        const conViajes = !esPiloto && empresaTieneViajes();
        // Cajas: si alguna actividad de la empresa cierra caja (sql/01 bloque 30); el piloto no
        const conCajas = !esPiloto && (typeof empresaUsa !== 'function' || empresaUsa('caja'));
        enViajes = conViajes && (q.get('actividad') === REP_VIAJES || !actividades.length);
        enCajas = !enViajes && conCajas && q.get('actividad') === REP_CAJAS;
        actividad = enViajes || enCajas ? null : actividades.find((a) => a.codigo === q.get('actividad')) || actividades[0] || null;
        const opciones = actividades.map((a) => ({ valor: a.codigo, texto: a.nombre, icono: a.icono }));
        if (conViajes) opciones.push({ valor: REP_VIAJES, texto: 'Viajes', icono: 'bi-car-front' });
        if (conCajas) opciones.push({ valor: REP_CAJAS, texto: 'Cajas', icono: 'bi-cash-stack' });
        crearPestanas($('#repPestanas'), opciones, enViajes ? REP_VIAJES : enCajas ? REP_CAJAS : actividad && actividad.codigo,
            (codigo) => {
                if (codigo === REP_VIAJES || codigo === REP_CAJAS) {
                    mostrarEspecial(codigo);
                    return;
                }
                mostrarEspecial(null);
                actividad = actividades.find((a) => a.codigo === codigo) || null;
                prepararSegunActividad();
                cargar('');
            });
        $('#repPestanas').hidden = opciones.length <= 1;
        prepararSegunActividad();
        if (regionG2 || esG3) {
            selRegion.value = regionG2 || (tiendas[0] || {}).region || '';
            selRegion.disabled = true;
        } else {
            // Si solo viene la tienda, la región es la de esa tienda
            const tiendaPedida = tiendas.find((t) => String(t.id) === q.get('tienda'));
            selRegion.value = q.get('region') || (tiendaPedida ? tiendaPedida.region : '');
        }
        llenarTiendas(q.get('tienda') || '');
        selTipo.value = q.get('tipo') || '';
        if (q.get('desde') && q.get('hasta')) {
            inDesde.value = q.get('desde');
            inHasta.value = q.get('hasta');
        } else if (!esPiloto) {
            atajo('mes');
        }
        // Piloto: sin región / tienda / "ver por" ni atajos; solo fechas de los últimos 7 días
        if (esPiloto) {
            zona.querySelector('.rep-cascada').hidden = true;
            zona.querySelector('.rep-atajos').hidden = true;
            $('#repLimpiar').hidden = true;
            $('#repSubtitulo').textContent = `Tus pedidos de los últimos ${REP_DIAS_PILOTO} días: entregas, tiempos y cobros`;
            limitarFechasPiloto();
        }
        return null;
    }

    async function cargar(entidadDeseada = selEntidad.value) {
        limitarFechasPiloto();
        if (inDesde.value > inHasta.value) {
            aviso.mostrar('La fecha "Desde" no puede ser después de "Hasta".', 'error');
            return;
        }
        contenido.classList.add('cargando');

        let q = db.from('pedidos').select(
            'id, codigo, actividad, tienda_id, cliente_id, cliente_nombre, cliente_telefono, direccion_partida, ' +
            'fecha_entrega, marca_numero, piloto_id, creado_por, estado, motivo_cancelacion, costo_envio, monto_compra, cobrar_compra, ' +
            'total_cobrar, peso_total_kg, lleva_alcohol, envio_gratis:costo_desglose->envio_gratis, creado_en, ' +
            'pedido_articulos(categoria, cantidad, tamano), ' +
            'pedido_entregas(satisfecho, hubo_retraso, mercaderia_buena, motivos_retraso(nombre))')
            .eq('anulado', false).gte('fecha_entrega', inDesde.value).lte('fecha_entrega', inHasta.value);

        // Solo la actividad de la pestaña (nunca revueltas)
        if (actividad) q = q.eq('actividad', actividad.codigo);

        // Alcance: el piloto, solo sus pedidos; los demás, la tienda elegida o las de la región elegida
        const ids = tiendas.filter((t) => (!selRegion.value || t.region === selRegion.value)).map((t) => t.id);
        if (esPiloto) q = q.eq('piloto_id', (obtenerSesion() || {}).id || 0);
        else if (selTienda.value) q = q.eq('tienda_id', Number(selTienda.value));
        else if (!esGeneral || selRegion.value) q = q.in('tienda_id', ids.length ? ids : [0]);

        const { data, error } = await q.order('fecha_entrega', { ascending: false }).limit(5000);
        contenido.classList.remove('cargando');
        if (error) {
            console.error('Error al cargar el reporte:', error);
            aviso.mostrar(error.code === 'PGRST205' || error.code === '42P01'
                ? 'Falta instalar la base de datos (sql/instalacion).'
                : 'No se pudo cargar el reporte. Revisa la conexión.', 'error');
            return;
        }
        pedidosCargados = data;
        $('#repNota').hidden = data.length < 5000;
        $('#repNota').textContent = 'Se muestran los primeros 5000 pedidos. Acorta el rango de fechas para ver todo.';

        // Nombres de empleados y pilotos que aparecen
        const idsUsuarios = [...new Set(data.flatMap((p) => [p.creado_por, p.piloto_id]).filter(Boolean))]
            .filter((id) => !nombres[id]);
        if (idsUsuarios.length) {
            const u = await db.from('usuarios').select('id, nombre').in('id', idsUsuarios);
            (u.data || []).forEach((x) => { nombres[x.id] = x.nombre; });
        }

        llenarEntidades(entidadDeseada);
        aplicarEntidad();
    }

    // Filtro de cliente / empleado / piloto (sobre lo cargado)
    function aplicarEntidad() {
        const tipo = selTipo.value;
        const v = selEntidad.value;
        pedidos = pedidosCargados.filter((p) => {
            if (!tipo || !v) return true;
            if (tipo === 'cliente') return `t:${p.cliente_telefono}` === v;
            if (tipo === 'empleado') return String(p.creado_por) === v;
            return String(p.piloto_id) === v;
        });
        pagina = 0;
        guardarEnDireccion();
        dibujarTodo();
    }

    // ==================================================
    // CÁLCULOS
    // ==================================================

    function resumen(lista) {
        const total = lista.length;
        const entregados = lista.filter((p) => REP_ENTREGADOS.includes(p.estado));
        const conEntrega = entregados.map(entregaDe).filter(Boolean);
        const aTiempo = conEntrega.filter((e) => !e.hubo_retraso).length;
        const respondieron = lista.map(entregaDe).filter((e) => e && e.satisfecho != null);
        const noCancelados = lista.filter((p) => p.estado !== 'cancelado');
        return {
            total,
            entregados: entregados.length,
            pendientes: lista.filter((p) => REP_PENDIENTES.includes(p.estado)).length,
            noEntregados: lista.filter((p) => ['no_entregado', 'devuelto'].includes(p.estado)).length,
            cancelados: lista.filter((p) => p.estado === 'cancelado').length,
            incidencias: lista.filter((p) => ['entregado_incidencia', 'no_entregado', 'no_salio', 'devuelto'].includes(p.estado)).length,
            envios: noCancelados.reduce((s, p) => s + Number(p.costo_envio || 0), 0),
            compras: noCancelados.reduce((s, p) => s + Number(p.monto_compra || 0), 0),
            aTiempo, conEntrega: conEntrega.length,
            satisfechos: respondieron.filter((e) => e.satisfecho).length, respondieron: respondieron.length,
            peso: noCancelados.reduce((s, p) => s + Number(p.peso_total_kg || 0), 0),
            // Propios de cada actividad (se muestran según lo que use)
            noCancelados: noCancelados.length,
            unidades: noCancelados.reduce((s, p) => s + unidadesDe(p), 0),
            conCompra: noCancelados.filter((p) => p.monto_compra != null).length,
            enviosGratis: noCancelados.filter((p) => p.envio_gratis === true).length,
            conAlcohol: noCancelados.filter((p) => p.lleva_alcohol).length,
            enBodega: lista.filter((p) => p.estado === 'recibido_bodega').length,
            conRecoleccion: noCancelados.filter((p) => p.direccion_partida).length,
        };
    }

    // Cuenta por una clave: [[etiqueta, valor], ...]
    function contar(lista, clave, valor = () => 1) {
        const m = new Map();
        lista.forEach((p) => {
            const k = clave(p);
            if (k == null) return;
            m.set(k, (m.get(k) || 0) + valor(p));
        });
        return [...m.entries()];
    }

    // Pedidos por día (o por mes si el rango es largo)
    function porFecha(lista) {
        const dias = (new Date(inHasta.value) - new Date(inDesde.value)) / 86400000 + 1;
        const porMes = dias > 62;
        $('#repTituloDias').textContent = porMes ? 'Pedidos por mes' : 'Pedidos por día';
        const m = new Map();
        if (!porMes) {
            // Todos los días del rango, aunque tengan 0
            for (let d = new Date(`${inDesde.value}T12:00:00`); aTexto(d) <= inHasta.value; d.setDate(d.getDate() + 1)) m.set(aTexto(d), 0);
        }
        lista.forEach((p) => {
            const k = porMes ? p.fecha_entrega.slice(0, 7) : p.fecha_entrega;
            m.set(k, (m.get(k) || 0) + 1);
        });
        return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
            .map(([k, v]) => [porMes ? `${k.slice(5, 7)}/${k.slice(0, 4)}` : corta(k).slice(0, 5), v]);
    }

    // ==================================================
    // DIBUJAR
    // ==================================================

    function dibujarTodo() {
        const r = resumen(pedidos);
        dibujarKpis(r);
        dibujarRecord(r);
        dibujarGraficas();
        dibujarTabla();
        const partes = [corta(inDesde.value) + ' al ' + corta(inHasta.value)];
        if (actividad) partes.unshift(actividad.nombre);
        if (selTienda.value) partes.push(nombreTienda(Number(selTienda.value)));
        else if (selRegion.value) partes.push(`Región ${selRegion.value}`);
        $('#repSubtitulo').textContent = `${plural(r.total, 'pedido', 'pedidos')} · ${partes.join(' · ')}`;
    }

    function kpi(texto, valor, detalle = '') {
        const d = document.createElement('div');
        d.className = 'rep-kpi';
        const t = document.createElement('span');
        t.className = 'rep-kpi-texto';
        t.textContent = texto;
        const v = document.createElement('span');
        v.className = 'rep-kpi-valor';
        v.textContent = valor;
        d.append(t, v);
        if (detalle) {
            const s = document.createElement('span');
            s.className = 'rep-kpi-detalle';
            s.textContent = detalle;
            d.appendChild(s);
        }
        return d;
    }

    // Tarjetas propias de cada actividad: aparecen solo si la actividad de la
    // pestaña usa esa parte (si = función con el uso). [texto, valor, detalle]
    const TARJETAS_ACTIVIDAD = [
        { si: () => usa('usa_compra'),
          tarjeta: (r) => ['Compras', dinero(r.compras), `${r.enviosGratis} con envío gratis`] },
        { si: () => usa('permite_alcohol'),
          tarjeta: (r) => ['Con alcohol', String(r.conAlcohol), `${porcentaje(r.conAlcohol, r.noCancelados)} de los pedidos`] },
        { si: () => !usa('usa_compra'),
          tarjeta: (r) => ['Peso transportado', kilos(r.peso), `${r.unidades} bultos / unidades`] },
        { si: () => usa('usa_bodega'),
          tarjeta: (r) => ['En bodega', String(r.enBodega), 'esperando piloto'] },
        { si: () => usa('usa_punto_partida'),
          tarjeta: (r) => ['Con punto de partida', String(r.conRecoleccion), `${porcentaje(r.conRecoleccion, r.noCancelados)} de los pedidos`] },
    ];

    // Las tarjetas (se reutilizan en Excel y PDF): comunes + las de la actividad
    const kpisDe = (r) => [
        ['Pedidos', String(r.total), `${r.pendientes} pendientes`],
        ['Entregados', String(r.entregados), `${porcentaje(r.entregados, r.total)} del total`],
        ['A tiempo', porcentaje(r.aTiempo, r.conEntrega), `${r.aTiempo} de ${r.conEntrega} entregas`],
        ['Clientes satisfechos', porcentaje(r.satisfechos, r.respondieron), `${r.respondieron} respuestas`],
        ['Incidencias', String(r.incidencias), `${r.noEntregados} no entregados`],
        ['Cancelados', String(r.cancelados), porcentaje(r.cancelados, r.total)],
        ['Envíos cobrados', dinero(r.envios), `Promedio ${dinero(r.noCancelados ? r.envios / r.noCancelados : 0)}`],
        ...TARJETAS_ACTIVIDAD.filter((t) => t.si()).map((t) => t.tarjeta(r)),
    ];

    function dibujarKpis(r) {
        const caja = $('#repKpis');
        caja.replaceChildren(...kpisDe(r).map(([t, v, d]) => kpi(t, v, d)));
    }

    // Récord del cliente / rendimiento del empleado o piloto elegido
    function dibujarRecord(r) {
        const caja = $('#repRecord');
        const tipo = selTipo.value;
        caja.hidden = !tipo || !selEntidad.value;
        if (caja.hidden) return;
        const nombre = selEntidad.options[selEntidad.selectedIndex].textContent;
        const fechas = pedidos.map((p) => p.fecha_entrega).sort();
        const datos = [];
        // Con varias actividades, el título dice de cuál es: "Récord del cliente (Encomiendas): ..."
        const deActividad = actividades.length > 1 && actividad ? ` (${actividad.nombre})` : '';
        const conCompra = usa('usa_compra');
        if (tipo === 'cliente') {
            $('#repRecordTitulo').textContent = `Récord del cliente${deActividad}: ${nombre}`;
            // Lo que pagó el cliente: envíos, y las compras si la actividad las usa
            const gastado = r.envios + (conCompra ? r.compras : 0);
            const meses = fechas.length ? Math.max(1, (new Date(fechas[fechas.length - 1]) - new Date(fechas[0])) / (86400000 * 30.4)) : 1;
            datos.push(['Pedidos', r.total], ['Entregados', r.entregados], ['Cancelados', r.cancelados],
                ['No entregados / devueltos', r.noEntregados],
                [conCompra ? 'Monto total (compras + envíos)' : 'Monto total (envíos)', dinero(gastado)],
                ['Promedio por pedido', dinero(r.noCancelados ? gastado / r.noCancelados : 0)]);
            if (!conCompra) datos.push(['Peso enviado', kilos(r.peso)]);
            datos.push(['Frecuencia', `${(r.total / meses).toFixed(1)} pedidos por mes`],
                ['Primer / último pedido', fechas.length ? `${corta(fechas[0])} · ${corta(fechas[fechas.length - 1])}` : '—'],
                ['Satisfecho', porcentaje(r.satisfechos, r.respondieron)], ['Incidencias', r.incidencias]);
        } else if (tipo === 'empleado') {
            $('#repRecordTitulo').textContent = `Rendimiento del empleado${deActividad}: ${nombre}`;
            datos.push(['Pedidos registrados', r.total], ['Entregados', r.entregados], ['Cancelados', r.cancelados],
                ['Envíos cobrados', dinero(r.envios)],
                conCompra ? ['Compras', dinero(r.compras)] : ['Bultos / unidades registrados', r.unidades],
                ['Clientes distintos', new Set(pedidos.map((p) => p.cliente_telefono)).size]);
        } else {
            $('#repRecordTitulo').textContent = `Rendimiento del piloto${deActividad}: ${nombre}`;
            const conRetraso = r.conEntrega - r.aTiempo;
            datos.push(['Pedidos asignados', r.total], ['Entregados', r.entregados], ['A tiempo', porcentaje(r.aTiempo, r.conEntrega)],
                ['Con retraso', conRetraso], ['No entregados / devueltos', r.noEntregados], ['Pendientes', r.pendientes],
                ['Peso transportado', kilos(r.peso)], ['Clientes satisfechos', porcentaje(r.satisfechos, r.respondieron)]);
            if (conCompra) datos.push(['Compras entregadas', dinero(pedidos.filter((p) => REP_ENTREGADOS.includes(p.estado))
                .reduce((s, p) => s + Number(p.monto_compra || 0), 0))]);
            if (!conCompra) datos.push(['Bultos / unidades', r.unidades]);
        }
        const dl = $('#repRecordDatos');
        dl.replaceChildren();
        datos.forEach(([t, v]) => {
            const div = document.createElement('div');
            const dt = document.createElement('dt');
            dt.textContent = t;
            const dd = document.createElement('dd');
            dd.textContent = v;
            div.append(dt, dd);
            dl.appendChild(div);
        });
        recordActual = { titulo: $('#repRecordTitulo').textContent, datos };
    }
    let recordActual = null;

    // ---------- Gráficas ----------
    let datosGraficas = {}; // para "Ver datos", Excel y PDF

    // Suma la cantidad de los artículos del pedido por una clave (categoría, tamaño...)
    function contarArticulos(lista, clave) {
        const m = new Map();
        lista.filter((p) => p.estado !== 'cancelado').forEach((p) => (p.pedido_articulos || []).forEach((a) => {
            const k = clave(a);
            if (k == null) return;
            m.set(k, (m.get(k) || 0) + Number(a.cantidad || 0));
        }));
        return [...m.entries()].sort((a, b) => b[1] - a[1]);
    }

    // Gráfica propia de la actividad (null = no tiene):
    //   usa compra  -> monto de las compras por tienda
    //   usa tamaños -> bultos por tamaño S / M / L / XL
    function graficaExtra() {
        const vivos = pedidos.filter((p) => p.estado !== 'cancelado');
        if (usa('usa_compra')) {
            return {
                titulo: 'Compras por tienda', columnas: ['Tienda', 'Compras'], dinero: true,
                filas: contar(vivos.filter((p) => p.monto_compra != null), (p) => nombreTienda(p.tienda_id), (p) => Number(p.monto_compra || 0))
                    .sort((a, b) => b[1] - a[1]).slice(0, 12),
            };
        }
        if (usa('usa_tamanos')) {
            return {
                titulo: 'Bultos por tamaño', columnas: ['Tamaño', 'Bultos'],
                filas: contarArticulos(pedidos, (a) => a.tamano || null),
            };
        }
        return null;
    }

    async function dibujarGraficas() {
        const estados = contar(pedidos, (p) => p.estado);
        const extra = graficaExtra();
        datosGraficas = {
            dias: { titulo: $('#repTituloDias').textContent, columnas: ['Fecha', 'Pedidos'], filas: porFecha(pedidos) },
            estados: {
                titulo: 'Pedidos por estado', columnas: ['Estado', 'Pedidos'],
                filas: REP_ESTADOS.map(([c, t]) => [t, (estados.find(([k]) => k === c) || [0, 0])[1]]).filter(([, v]) => v > 0),
            },
            // Categorías de la actividad (Abarrotes, Línea blanca... o Cajas, Documentos...)
            categorias: {
                titulo: 'Mercadería por categoría', columnas: ['Categoría', 'Unidades'],
                filas: contarArticulos(pedidos, (a) => a.categoria || 'Sin categoría'),
            },
            pilotos: {
                titulo: 'Pedidos por piloto', columnas: ['Piloto', 'Pedidos'],
                filas: contar(pedidos, (p) => (p.piloto_id ? (nombres[p.piloto_id] || `Piloto ${p.piloto_id}`) : 'Sin piloto'))
                    .sort((a, b) => b[1] - a[1]).slice(0, 12),
            },
            retrasos: {
                titulo: 'Retrasos por motivo', columnas: ['Motivo', 'Retrasos'],
                filas: contar(pedidos, (p) => {
                    const e = entregaDe(p);
                    return e && e.hubo_retraso ? ((e.motivos_retraso && e.motivos_retraso.nombre) || 'Sin motivo') : null;
                }).sort((a, b) => b[1] - a[1]),
            },
            // Cuántos se cancelan y por qué (motivo escrito al cancelar; se agrupan textos iguales)
            cancelaciones: {
                titulo: 'Cancelaciones por motivo', columnas: ['Motivo', 'Cancelados'],
                filas: contar(pedidos.filter((p) => p.estado === 'cancelado'), (p) => {
                    const m = (p.motivo_cancelacion || '').trim();
                    return m ? m.charAt(0).toUpperCase() + m.slice(1) : 'Sin motivo';
                }).sort((a, b) => b[1] - a[1]).slice(0, 15),
            },
        };
        if (extra) datosGraficas.extra = extra;

        // Tablas "Ver datos" (siempre, aunque la librería de gráficas no cargue)
        tablaDatos('#repTablaDias', datosGraficas.dias);
        tablaDatos('#repTablaEstados', datosGraficas.estados);
        tablaDatos('#repTablaCategorias', datosGraficas.categorias);
        tablaDatos('#repTablaPilotos', datosGraficas.pilotos);
        tablaDatos('#repTablaRetrasos', datosGraficas.retrasos);
        $('#repSinRetrasos').hidden = datosGraficas.retrasos.filas.length > 0;
        $('#repGrafRetrasos').parentElement.hidden = !datosGraficas.retrasos.filas.length;
        tablaDatos('#repTablaCancelaciones', datosGraficas.cancelaciones);
        $('#repSinCancelaciones').hidden = datosGraficas.cancelaciones.filas.length > 0;
        $('#repGrafCancelaciones').parentElement.hidden = !datosGraficas.cancelaciones.filas.length;
        $('#repFiguraExtra').hidden = !extra;
        if (extra) {
            $('#repTituloExtra').textContent = extra.titulo;
            $('#repGrafExtra').setAttribute('aria-label', extra.titulo);
            tablaDatos('#repTablaExtra', extra);
        }

        try {
            await cargarLibreria(REP_LIBRERIAS.chart);
        } catch (e) {
            console.error(e);
            aviso.mostrar('No se pudieron cargar las gráficas (revisa internet). Los datos están en "Ver datos".', 'error');
            return;
        }
        grafica('repGrafDias', datosGraficas.dias, false);
        grafica('repGrafEstados', datosGraficas.estados, true);
        grafica('repGrafCategorias', datosGraficas.categorias, true);
        grafica('repGrafPilotos', datosGraficas.pilotos, true);
        if (datosGraficas.retrasos.filas.length) grafica('repGrafRetrasos', datosGraficas.retrasos, true);
        if (datosGraficas.cancelaciones.filas.length) grafica('repGrafCancelaciones', datosGraficas.cancelaciones, true);
        if (extra) grafica('repGrafExtra', extra, true);
        else if (graficas.repGrafExtra) { graficas.repGrafExtra.destroy(); delete graficas.repGrafExtra; }
    }

    function tablaDatos(selector, d) {
        const t = $(selector);
        t.replaceChildren();
        const thead = t.createTHead().insertRow();
        d.columnas.forEach((c) => { const th = document.createElement('th'); th.textContent = c; thead.appendChild(th); });
        const tbody = t.createTBody();
        if (!d.filas.length) {
            const td = tbody.insertRow().insertCell();
            td.colSpan = 2;
            td.textContent = 'Sin datos';
            return;
        }
        d.filas.forEach(([a, b]) => {
            const tr = tbody.insertRow();
            tr.insertCell().textContent = a;
            tr.insertCell().textContent = d.dinero ? dinero(b) : b;
        });
    }

    // Barra de una sola serie. horizontal = categorías largas (estados, pilotos...)
    function grafica(id, d, horizontal) {
        if (graficas[id]) graficas[id].destroy();
        const ejeValor = {
            beginAtZero: true,
            grid: { color: REP_COLORES.rejilla, drawTicks: false },
            border: { display: false },
            ticks: {
                color: REP_COLORES.ejeTexto, precision: 0, padding: 6,
                callback: (v) => (d.dinero ? dinero(v).replace(/\.00$/, '') : v),
            },
        };
        const ejeCategoria = {
            grid: { display: false },
            border: { color: REP_COLORES.rejilla },
            ticks: { color: REP_COLORES.ejeTexto, autoSkip: true, maxRotation: 0 },
        };
        graficas[id] = new window.Chart(zona.querySelector(`#${id}`), {
            type: 'bar',
            data: {
                labels: d.filas.map(([a]) => a),
                datasets: [{
                    label: d.columnas[1],
                    data: d.filas.map(([, b]) => Math.round(b * 100) / 100),
                    backgroundColor: REP_COLORES.serie,
                    borderRadius: 4,           // punta redondeada, base recta
                    borderSkipped: 'start',
                    maxBarThickness: 26,
                    categoryPercentage: 0.8,
                    barPercentage: 0.9,
                }],
            },
            options: {
                indexAxis: horizontal ? 'y' : 'x',
                maintainAspectRatio: false,
                animation: { duration: 250 },
                plugins: {
                    legend: { display: false }, // una sola serie: el título la nombra
                    tooltip: {
                        backgroundColor: '#ffffff', titleColor: REP_COLORES.tinta, bodyColor: REP_COLORES.tinta,
                        borderColor: REP_COLORES.rejilla, borderWidth: 1, padding: 10, displayColors: false,
                        callbacks: { label: (c) => `${d.columnas[1]}: ${d.dinero ? dinero(c.raw) : c.raw}` },
                    },
                },
                scales: horizontal ? { x: ejeValor, y: ejeCategoria } : { x: ejeCategoria, y: ejeValor },
            },
        });
    }

    // ---------- Tabla detallada ----------
    // si: la columna aparece solo si la actividad de la pestaña usa esa parte
    const TODAS_COLUMNAS = [
        { id: 'codigo', texto: 'Pedido', valor: (p) => p.codigo },
        { id: 'fecha', texto: 'Fecha', valor: (p) => p.fecha_entrega, ver: (p) => corta(p.fecha_entrega) },
        { id: 'tienda', texto: 'Tienda', valor: (p) => nombreTienda(p.tienda_id) },
        { id: 'cliente', texto: 'Cliente', valor: (p) => p.cliente_nombre },
        { id: 'telefono', texto: 'Teléfono', valor: (p) => p.cliente_telefono },
        { id: 'recoleccion', texto: 'Punto de partida', valor: (p) => p.direccion_partida || '', si: () => usa('usa_punto_partida') },
        { id: 'piloto', texto: 'Piloto', valor: (p) => (p.piloto_id ? nombres[p.piloto_id] || '' : '') },
        { id: 'estado', texto: 'Estado', valor: (p) => REP_TEXTO_ESTADO[p.estado] || p.estado },
        { id: 'envio', texto: 'Envío', valor: (p) => Number(p.costo_envio || 0), ver: (p) => dinero(p.costo_envio), numero: true },
        { id: 'compra', texto: 'Compra', valor: (p) => Number(p.monto_compra || 0), ver: (p) => (p.monto_compra == null ? '—' : dinero(p.monto_compra)), numero: true, si: () => usa('usa_compra') },
        { id: 'alcohol', texto: 'Alcohol', valor: (p) => (p.lleva_alcohol ? 'Sí' : ''), si: () => usa('permite_alcohol') },
        { id: 'cobrar', texto: 'A cobrar', valor: (p) => Number(p.total_cobrar || 0), ver: (p) => dinero(p.total_cobrar), numero: true },
        { id: 'bultos', texto: 'Bultos', valor: (p) => unidadesDe(p), numero: true, si: () => !usa('usa_compra') },
        { id: 'peso', texto: 'Peso (kg)', valor: (p) => Number(p.peso_total_kg || 0), numero: true },
    ];
    let COLUMNAS = TODAS_COLUMNAS; // las de la actividad de la pestaña (prepararSegunActividad)

    // Lo que cambia al elegir otra actividad: columnas de la tabla
    function prepararSegunActividad() {
        COLUMNAS = TODAS_COLUMNAS.filter((c) => !c.si || c.si());
        if (!COLUMNAS.some((c) => c.id === orden.columna)) orden = { columna: 'fecha', asc: false };
        pagina = 0;
    }

    function filasOrdenadas() {
        const texto = $('#repBuscar').value.trim();
        const col = COLUMNAS.find((c) => c.id === orden.columna);
        return pedidos
            .filter((p) => coincideBusqueda(COLUMNAS.map((c) => c.valor(p)), texto))
            .sort((a, b) => {
                const x = col.valor(a); const y = col.valor(b);
                const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
                return orden.asc ? r : -r;
            });
    }

    function dibujarTabla() {
        const cab = $('#repCabecera');
        cab.replaceChildren();
        COLUMNAS.forEach((c) => {
            const th = document.createElement('th');
            const b = document.createElement('button');
            b.type = 'button';
            b.dataset.columna = c.id;
            b.textContent = c.texto;
            if (orden.columna === c.id) {
                const i = document.createElement('i');
                i.className = `bi ${orden.asc ? 'bi-caret-up-fill' : 'bi-caret-down-fill'}`;
                b.appendChild(i);
            }
            th.appendChild(b);
            th.setAttribute('aria-sort', orden.columna === c.id ? (orden.asc ? 'ascending' : 'descending') : 'none');
            cab.appendChild(th);
        });

        const filas = filasOrdenadas();
        const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
        pagina = Math.min(pagina, paginas - 1);
        const cuerpo = $('#repCuerpo');
        cuerpo.replaceChildren();
        if (!filas.length) cuerpo.appendChild(crearFilaVacia('No hay pedidos con estos filtros.', COLUMNAS.length));
        filas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA).forEach((p) => {
            const tr = document.createElement('tr');
            COLUMNAS.forEach((c) => {
                const td = document.createElement('td');
                if (c.numero) td.className = 'rep-numero';
                if (c.id === 'codigo') {
                    const a = document.createElement('a');
                    a.href = `#pedidos?id=${p.id}`;
                    a.textContent = p.codigo;
                    td.appendChild(a);
                } else {
                    td.textContent = c.ver ? c.ver(p) : (c.valor(p) === '' ? '—' : c.valor(p));
                }
                tr.appendChild(td);
            });
            cuerpo.appendChild(tr);
        });
        $('#repPaginaTexto').textContent = filas.length
            ? `${pagina * POR_PAGINA + 1}–${Math.min((pagina + 1) * POR_PAGINA, filas.length)} de ${filas.length}`
            : '';
        $('#repAnterior').disabled = pagina === 0;
        $('#repSiguiente').disabled = pagina >= paginas - 1;
    }

    // ==================================================
    // EXPORTAR (solo G2 o superior)
    // ==================================================

    // Texto de los filtros usados (va en el encabezado de Excel y PDF)
    function textoFiltros() {
        const partes = [];
        if (actividad) partes.push(`Actividad: ${nombreActividad()}`);
        partes.push(`Del ${corta(inDesde.value)} al ${corta(inHasta.value)}`);
        partes.push(selRegion.value ? `Región: ${selRegion.options[selRegion.selectedIndex].textContent}` : 'Todas las regiones');
        partes.push(selTienda.value ? `Tienda: ${selTienda.options[selTienda.selectedIndex].textContent}` : 'Todas las tiendas');
        if (selTipo.value && selEntidad.value) partes.push(`${selTipo.options[selTipo.selectedIndex].textContent}: ${selEntidad.options[selEntidad.selectedIndex].textContent}`);
        return partes;
    }

    // ej. reporte-encomiendas-2026-09-01-a-2026-09-30.xlsx
    const nombreArchivo = (ext) => `reporte-${actividad ? actividad.codigo : textoExportar('pedidos')}-${inDesde.value}-a-${inHasta.value}.${ext}`;
    const tituloReporte = () => textoExportar(actividad ? `Reporte de pedidos - ${nombreActividad()}` : 'Reporte de pedidos');
    // Todo lo que va al archivo con el nombre de la empresa y sus palabras (js/componentes.js)
    const filasExportar = (filas) => filas.map((fila) => fila.map(textoExportar));

    // Gráfica -> JPEG con fondo blanco (el PNG hace el PDF muy pesado)
    function imagenLiviana(lienzo) {
        const copia = document.createElement('canvas');
        copia.width = lienzo.width;
        copia.height = lienzo.height;
        const ctx = copia.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, copia.width, copia.height);
        ctx.drawImage(lienzo, 0, 0);
        return copia.toDataURL('image/jpeg', 0.85);
    }

    async function exportarExcel() {
        if (!puedeExportar) return;
        try {
            await cargarLibreria(REP_LIBRERIAS.xlsx);
        } catch (e) {
            aviso.mostrar('No se pudo cargar el exportador de Excel (revisa internet).', 'error');
            return;
        }
        const XLSX = window.XLSX;
        const libro = XLSX.utils.book_new();
        const r = resumen(pedidos);

        // Hoja 1: Resumen (filtros + tarjetas + récord)
        const hojaResumen = [[`${nombreEmpresaExportar()} - ${tituloReporte()}`], [`Generado: ${new Date().toLocaleString('es-CR')}`], []];
        textoFiltros().forEach((f) => hojaResumen.push([f]));
        hojaResumen.push([], ['Indicador', 'Valor', 'Detalle']);
        kpisDe(r).forEach((k) => hojaResumen.push(k));
        if (recordActual && !$('#repRecord').hidden) {
            hojaResumen.push([], [recordActual.titulo]);
            recordActual.datos.forEach(([t, v]) => hojaResumen.push([t, v]));
        }
        XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filasExportar(hojaResumen)), 'Resumen');

        // Hoja 2: Pedidos (números como números)
        const filas = filasOrdenadas().map((p) => COLUMNAS.map((c) => c.valor(p)));
        const hojaPedidos = XLSX.utils.aoa_to_sheet(filasExportar([COLUMNAS.map((c) => c.texto), ...filas]));
        hojaPedidos['!cols'] = COLUMNAS.map((c) => ({ wch: c.numero ? 12 : 18 }));
        XLSX.utils.book_append_sheet(libro, hojaPedidos, textoExportar('Pedidos'));

        // Una hoja por gráfica
        Object.values(datosGraficas).forEach((d) => {
            XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filasExportar([d.columnas, ...d.filas])), textoExportar(d.titulo).slice(0, 31));
        });
        XLSX.writeFile(libro, nombreArchivo('xlsx'));
        aviso.mostrar('Excel descargado.');
    }

    async function exportarPdf() {
        if (!puedeExportar) return;
        try {
            await cargarLibreria(REP_LIBRERIAS.jspdf);
            await cargarLibreria(REP_LIBRERIAS.autotable);
        } catch (e) {
            aviso.mostrar('No se pudo cargar el exportador de PDF (revisa internet).', 'error');
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const ancho = doc.internal.pageSize.getWidth();
        const r = resumen(pedidos);

        // Colores de la paleta de la empresa (empresas/empresas.js), con los de ACACHETE de respaldo
        const colorOscuro = colorDeVariable('--color-azul-marino', [7, 48, 92]);
        const colorAcento = colorDeVariable('--color-naranja', [242, 102, 15]);
        const colorTabla = colorDeVariable('--color-azul', [42, 120, 214]);

        // Encabezado: nombre de la empresa y filtros usados
        doc.setFillColor(...colorOscuro);
        doc.rect(0, 0, ancho, 20, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(15);
        const empresaPdf = nombreEmpresaExportar().toUpperCase();
        doc.text(empresaPdf, 12, 13, { maxWidth: ancho / 2 });
        const anchoNombre = Math.min(doc.getTextWidth(empresaPdf), ancho / 2);
        doc.setFontSize(10);
        doc.text(tituloReporte(), 12 + anchoNombre + 8, 13); // en blanco: se lee sobre cualquier paleta
        doc.setTextColor(60, 60, 60);
        doc.setFontSize(9);
        doc.text(textoExportar(`${textoFiltros().join('  ·  ')}   |   Generado: ${new Date().toLocaleString('es-CR')}`), 12, 27, { maxWidth: ancho - 24 });

        // Tarjetas como tabla
        const kpis = filasExportar(kpisDe(r).map(([t, v, d]) => [t, v.replace(REP_MONEDA, REP_MONEDA_PDF), d.replace(REP_MONEDA, REP_MONEDA_PDF)]));
        doc.autoTable({
            startY: 32, head: [['Indicador', 'Valor', 'Detalle']], body: kpis, theme: 'grid',
            styles: { fontSize: 8, cellPadding: 1.8 }, headStyles: { fillColor: colorTabla },
            margin: { left: 12, right: ancho / 2 + 4 },
        });
        let y = doc.lastAutoTable.finalY + 6;

        // Récord (si hay)
        if (recordActual && !$('#repRecord').hidden) {
            doc.autoTable({
                startY: 32, head: [[textoExportar(recordActual.titulo), '']],
                body: filasExportar(recordActual.datos.map(([t, v]) => [t, String(v).replace(REP_MONEDA, REP_MONEDA_PDF)])),
                theme: 'grid', styles: { fontSize: 8, cellPadding: 1.8 }, headStyles: { fillColor: colorAcento },
                margin: { left: ancho / 2 + 4, right: 12 },
            });
            y = Math.max(y, doc.lastAutoTable.finalY + 6);
        }

        // Gráficas (imágenes de los canvas), dos por fila
        const lienzos = ['repGrafDias', 'repGrafEstados', 'repGrafCategorias', 'repGrafExtra', 'repGrafPilotos', 'repGrafRetrasos', 'repGrafCancelaciones']
            .filter((id) => {
                const lienzo = zona.querySelector(`#${id}`);
                return graficas[id] && !lienzo.parentElement.hidden && !lienzo.closest('figure').hidden;
            });
        const anchoImg = (ancho - 30) / 2;
        const altoImg = 62;
        lienzos.forEach((id, i) => {
            if (i % 2 === 0 && i > 0) y += altoImg + 12;
            if (y + altoImg + 8 > doc.internal.pageSize.getHeight()) { doc.addPage(); y = 14; }
            const x = 12 + (i % 2) * (anchoImg + 6);
            const titulo = zona.querySelector(`#${id}`).closest('figure').querySelector('figcaption').textContent;
            doc.setFontSize(9);
            doc.setTextColor(30, 30, 30);
            doc.text(titulo, x, y);
            doc.addImage(imagenLiviana(zona.querySelector(`#${id}`)), 'JPEG', x, y + 2, anchoImg, altoImg);
        });

        // Tabla de pedidos en páginas nuevas
        doc.addPage();
        doc.setFontSize(11);
        doc.setTextColor(30, 30, 30);
        doc.text(textoExportar(`Pedidos del reporte (${pedidos.length})`), 12, 14);
        doc.autoTable({
            startY: 18,
            head: filasExportar([COLUMNAS.map((c) => c.texto)]),
            body: filasExportar(filasOrdenadas().map((p) => COLUMNAS.map((c) => {
                const v = c.ver ? c.ver(p) : c.valor(p);
                return String(v).replace(REP_MONEDA, REP_MONEDA_PDF);
            }))),
            styles: { fontSize: 7, cellPadding: 1.5 },
            headStyles: { fillColor: colorOscuro },
            alternateRowStyles: { fillColor: [245, 247, 250] },
            margin: { left: 8, right: 8 },
        });

        // Número de página
        const total = doc.getNumberOfPages();
        for (let i = 1; i <= total; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(140, 140, 140);
            doc.text(`Página ${i} de ${total}`, ancho - 30, doc.internal.pageSize.getHeight() - 6);
        }
        doc.save(nombreArchivo('pdf'));
        aviso.mostrar('PDF descargado.');
    }

    // ==================================================
    // EVENTOS
    // ==================================================

    selRegion.addEventListener('change', () => { llenarTiendas(); llenarEntidades(); cargar(''); });
    selTienda.addEventListener('change', () => cargar(''));
    selTipo.addEventListener('change', () => { llenarEntidades(); aplicarEntidad(); });
    selEntidad.addEventListener('change', aplicarEntidad);
    [inDesde, inHasta].forEach((i) => i.addEventListener('change', () => { marcarAtajo(null); cargar(); }));
    zona.querySelectorAll('[data-atajo]').forEach((b) => b.addEventListener('click', () => { atajo(b.dataset.atajo); cargar(); }));
    $('#repLimpiar').addEventListener('click', () => {
        if (!regionG2 && !esG3) selRegion.value = '';
        llenarTiendas();
        selTipo.value = '';
        atajo('mes'); // la actividad (pestaña) se queda
        cargar('');
    });
    $('#repBuscar').addEventListener('input', () => { pagina = 0; dibujarTabla(); });
    $('#repCabecera').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-columna]');
        if (!b) return;
        orden = { columna: b.dataset.columna, asc: orden.columna === b.dataset.columna ? !orden.asc : true };
        dibujarTabla();
    });
    $('#repAnterior').addEventListener('click', () => { pagina--; dibujarTabla(); });
    $('#repSiguiente').addEventListener('click', () => { pagina++; dibujarTabla(); });
    $('#repExcel').addEventListener('click', exportarExcel);
    $('#repPdf').addEventListener('click', exportarPdf);

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================

    $('#repExportar').hidden = !puedeExportar;

    (async () => {
        const error = await cargarBase();
        if (error) {
            console.error('Error al cargar reportes:', error);
            aviso.mostrar('No se pudo cargar la información. Revisa la conexión.', 'error');
            return;
        }
        if (enViajes) mostrarEspecial(REP_VIAJES);
        else if (enCajas) mostrarEspecial(REP_CAJAS);
        else await cargar(parametrosSeccion().get('ver') || '');
    })();

    return () => {
        aviso.limpiar();
        Object.values(graficas).forEach((g) => g.destroy());
        if (reporteViajes) reporteViajes.limpiar();
        if (reporteCajas) reporteCajas.limpiar();
    };
});
