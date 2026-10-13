/* ==================================================
   DISTRIBUIDORA (funciones compartidas)
   ACACHETE LOGISTICS

   Lo usan Pedidos (preventa: productos del pedido y entrega por producto) y la
   sección Distribución (js/secciones/distribucion.js). Guía: docs/15-distribuidora.md.
   Tablas: productos, producto_presentaciones, listas_precios, precios,
   motivos_entrega_parcial, pedido_productos (sql/01 bloque 27).

   Precios: se guardan SIN IVA con su % de IVA (13 por defecto, se cambia en cada
   precio). El total de una línea = cantidad × precio × (1 + IVA/100), redondeado a
   2 decimales, igual que la base (dist_entregar, dist_venta_ruta).

     distCargarCatalogo()                 -> { productos, presentaciones, listas, precios, tiendas, motivos }
     distPrecio(cat, listaId, presId)     -> { precio, iva_pct } (si la lista no lo tiene, la general)
     distListaDeTienda(cat, tiendaId)     -> lista de la tienda (o la general)
     distLinea(cantidad, precio, iva)     -> { subtotal, iva, total }
     crearSelectorProductos(caja, op)     -> elegir productos y cantidades (pedido, venta en ruta)
     abrirEntregaProductos(op)            -> ventana del piloto: cuánto entregó de cada producto
   ================================================== */

const DIST_IVA = 13; // % de IVA de un precio nuevo (Costa Rica)
const DIST_FORMAS = { efectivo: 'Efectivo', sinpe: 'SINPE Móvil', tarjeta: 'Tarjeta' };

const distRedondo = (n) => Math.round(Number(n || 0) * 100) / 100;
const distDinero = (n) => `₡${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const distCantidad = (n) => Number(n || 0).toLocaleString('es-CR', { maximumFractionDigits: 2 });
const distConIva = (precio, iva) => distRedondo(Number(precio || 0) * (1 + Number(iva || 0) / 100));
// ¿Falta ejecutar el bloque 27? (tabla, columna o función que no existe)
const distFaltaSql = (e) => !!e && ['42703', 'PGRST204', '42P01', 'PGRST205', 'PGRST200', 'PGRST202', '42883'].includes(e.code);

// Una línea: subtotal sin IVA, IVA y total
function distLinea(cantidad, precio, iva) {
    const c = Number(cantidad || 0);
    const total = distRedondo(c * Number(precio || 0) * (1 + Number(iva || 0) / 100));
    const subtotal = distRedondo(c * Number(precio || 0));
    return { subtotal, iva: distRedondo(total - subtotal), total };
}

// Suma de varias líneas [{ cantidad, precio, iva_pct }]
function distTotales(lineas) {
    return lineas.reduce((t, l) => {
        const x = distLinea(l.cantidad, l.precio, l.iva_pct);
        return { subtotal: distRedondo(t.subtotal + x.subtotal), iva: distRedondo(t.iva + x.iva), total: distRedondo(t.total + x.total) };
    }, { subtotal: 0, iva: 0, total: 0 });
}

// ==================================================
// CATÁLOGO DE LA EMPRESA
// ==================================================

async function distCargarCatalogo() {
    const [pro, pre, lis, pcs, tie, mot] = await Promise.all([
        db.from('productos').select('id, codigo, nombre, categoria, activo').order('nombre'),
        db.from('producto_presentaciones').select('id, producto_id, nombre, unidades, codigo_barras, activa, orden').order('orden').order('nombre'),
        db.from('listas_precios').select('id, nombre, general, activa').order('nombre'),
        db.from('precios').select('id, lista_id, presentacion_id, precio, iva_pct'),
        db.from('tiendas').select('id, codigo, nombre, region, lista_precios_id').order('codigo'),
        db.from('motivos_entrega_parcial').select('id, nombre, activo, orden').order('orden').order('nombre'),
    ]);
    const error = pro.error || pre.error || lis.error || pcs.error || tie.error || mot.error;
    if (error) return { error };
    const productos = pro.data;
    const presentaciones = pre.data.map((p) => ({ ...p, producto: productos.find((x) => x.id === p.producto_id) || { nombre: '?' } }));
    const precios = new Map(pcs.data.map((x) => [`${x.lista_id}:${x.presentacion_id}`, x]));
    return {
        productos, presentaciones, precios, listas: lis.data, tiendas: tie.data, motivos: mot.data,
        general: (lis.data.find((l) => l.general) || {}).id || null,
    };
}

const distDescripcion = (pres) => (pres ? `${pres.producto.nombre} · ${pres.nombre}` : 'Producto eliminado');

// Precio de una presentación en una lista (si no está, el de la lista general; si no, 0)
function distPrecio(cat, listaId, presId) {
    const x = cat.precios.get(`${listaId}:${presId}`) || (cat.general ? cat.precios.get(`${cat.general}:${presId}`) : null);
    return x ? { precio: Number(x.precio), iva_pct: Number(x.iva_pct), tiene: true } : { precio: 0, iva_pct: DIST_IVA, tiene: false };
}

// Lista de precios que usa la tienda (la suya o la general)
function distListaDeTienda(cat, tiendaId) {
    const t = cat.tiendas.find((x) => x.id === tiendaId);
    const propia = t && t.lista_precios_id && cat.listas.some((l) => l.id === t.lista_precios_id && l.activa) ? t.lista_precios_id : null;
    return propia || cat.general || ((cat.listas.find((l) => l.activa) || {}).id) || null;
}

// <select> de presentaciones activas agrupadas por producto
function distLlenarPresentaciones(select, cat, { vacio = 'Elige un producto', soloIds = null } = {}) {
    select.replaceChildren(new Option(vacio, ''));
    cat.productos.filter((p) => p.activo).forEach((p) => {
        const suyas = cat.presentaciones.filter((x) => x.producto_id === p.id && x.activa && (!soloIds || soloIds.has(x.id)));
        if (!suyas.length) return;
        const grupo = document.createElement('optgroup');
        grupo.label = p.codigo ? `${p.nombre} (${p.codigo})` : p.nombre;
        suyas.forEach((x) => grupo.appendChild(new Option(x.nombre, x.id)));
        select.appendChild(grupo);
    });
}

// ==================================================
// SELECTOR DE PRODUCTOS (pedido de preventa y venta en ruta)
// opciones: { catalogo, listaId, alCambiar(), disponibles: Map(presId -> cantidad máxima) | null }
// Devuelve: lineas(), totales(), cambiarLista(id), cambiarDisponibles(map), limpiar()
// ==================================================

function crearSelectorProductos(caja, { catalogo, listaId, alCambiar = () => {}, disponibles = null }) {
    let cat = catalogo;
    let lista = listaId;
    let maximos = disponibles;
    let lineas = []; // [{ presentacion_id, descripcion, cantidad, precio, iva_pct }]

    caja.replaceChildren();
    caja.classList.add('dist-selector');

    const fila = document.createElement('div');
    fila.className = 'dist-selector-fila';
    const select = document.createElement('select');
    select.className = 'campo-input';
    select.setAttribute('aria-label', 'Producto y presentación');
    const cantidad = document.createElement('input');
    cantidad.type = 'number';
    cantidad.min = '0';
    cantidad.step = 'any';
    cantidad.value = '1';
    cantidad.inputMode = 'decimal';
    cantidad.className = 'campo-input dist-cantidad';
    cantidad.setAttribute('aria-label', 'Cantidad');
    const agregar = document.createElement('button');
    agregar.type = 'button';
    agregar.className = 'boton boton-secundario boton-chico';
    agregar.innerHTML = '<i class="bi bi-plus-lg"></i> <span>Agregar</span>';
    fila.append(select, cantidad, agregar);

    const error = document.createElement('p');
    error.className = 'form-error';
    error.setAttribute('role', 'alert');

    const tablaCaja = document.createElement('div');
    tablaCaja.className = 'tabla-caja';
    const tabla = document.createElement('table');
    tabla.className = 'tabla dist-tabla';
    tabla.innerHTML = '<thead><tr><th>Producto</th><th class="dist-num">Cant.</th><th class="dist-num">Precio s/IVA</th>'
        + '<th class="dist-num">IVA</th><th class="dist-num">Total</th><th class="tabla-col-acciones"></th></tr></thead>';
    const cuerpo = document.createElement('tbody');
    const pie = document.createElement('tfoot');
    tabla.append(cuerpo, pie);
    tablaCaja.appendChild(tabla);
    caja.append(fila, error, tablaCaja);

    const soloIds = () => (maximos ? new Set([...maximos.entries()].filter(([, n]) => n > 0).map(([id]) => id)) : null);
    const llenar = () => distLlenarPresentaciones(select, cat, {
        soloIds: soloIds(), vacio: maximos && !soloIds().size ? 'No llevas productos' : 'Elige un producto',
    });

    function precioDe(presId) {
        return distPrecio(cat, lista, presId);
    }

    function dibujar() {
        cuerpo.replaceChildren();
        if (!lineas.length) {
            cuerpo.appendChild(crearFilaVacia('Agrega los productos con su cantidad.', 6));
        }
        lineas.forEach((l, i) => {
            const tr = document.createElement('tr');
            const td = crearCelda(l.descripcion);
            if (!precioDe(l.presentacion_id).tiene) {
                const sin = document.createElement('small');
                sin.className = 'dist-sin-precio';
                sin.textContent = ' Sin precio en esta lista';
                td.appendChild(sin);
            }
            tr.appendChild(td);
            const tdCant = document.createElement('td');
            tdCant.className = 'dist-num';
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.min = '0';
            inp.step = 'any';
            inp.inputMode = 'decimal';
            inp.className = 'campo-input dist-cantidad';
            inp.value = l.cantidad;
            inp.dataset.linea = i;
            inp.setAttribute('aria-label', `Cantidad de ${l.descripcion}`);
            tdCant.appendChild(inp);
            tr.appendChild(tdCant);
            const x = distLinea(l.cantidad, l.precio, l.iva_pct);
            tr.appendChild(crearCelda(distDinero(l.precio), 'dist-num'));
            tr.appendChild(crearCelda(`${distCantidad(l.iva_pct)} %`, 'dist-num'));
            tr.appendChild(crearCelda(distDinero(x.total), 'dist-num'));
            tr.appendChild(crearCeldaAcciones(crearBotonIcono('eliminar', i, 'bi-x-lg', `Quitar ${l.descripcion}`)));
            cuerpo.appendChild(tr);
        });
        const t = distTotales(lineas);
        pie.replaceChildren();
        if (lineas.length) {
            [['Subtotal sin IVA', t.subtotal], ['IVA', t.iva], ['Total productos', t.total]].forEach(([texto, monto], k) => {
                const tr = document.createElement('tr');
                if (k === 2) tr.className = 'dist-total';
                const th = document.createElement('th');
                th.colSpan = 4;
                th.textContent = texto;
                tr.append(th, crearCelda(distDinero(monto), 'dist-num'), document.createElement('td'));
                pie.appendChild(tr);
            });
        }
    }

    // Cuánto se puede poner como máximo (venta en ruta: lo que lleva el piloto)
    const maximo = (presId) => (maximos ? Number(maximos.get(presId) || 0) : Infinity);

    agregar.addEventListener('click', () => {
        error.textContent = '';
        const id = Number(select.value);
        const n = distRedondo(cantidad.value);
        if (!id) { error.textContent = 'Elige el producto.'; select.focus(); return; }
        if (!(n > 0)) { error.textContent = 'Escribe una cantidad mayor que 0.'; cantidad.focus(); return; }
        const pres = cat.presentaciones.find((x) => x.id === id);
        const ya = lineas.find((l) => l.presentacion_id === id);
        const nueva = distRedondo((ya ? ya.cantidad : 0) + n);
        if (nueva > maximo(id)) { error.textContent = `Solo llevas ${distCantidad(maximo(id))} de ${distDescripcion(pres)}.`; return; }
        if (ya) ya.cantidad = nueva;
        else {
            const pr = precioDe(id);
            lineas.push({ presentacion_id: id, descripcion: distDescripcion(pres), cantidad: n, precio: pr.precio, iva_pct: pr.iva_pct });
        }
        select.value = '';
        cantidad.value = '1';
        dibujar();
        alCambiar();
    });

    cuerpo.addEventListener('input', (e) => {
        const inp = e.target.closest('input[data-linea]');
        if (!inp) return;
        const l = lineas[Number(inp.dataset.linea)];
        const n = distRedondo(inp.value);
        error.textContent = n > maximo(l.presentacion_id) ? `Solo llevas ${distCantidad(maximo(l.presentacion_id))} de ${l.descripcion}.` : '';
        l.cantidad = n > 0 ? n : 0;
        const x = distLinea(l.cantidad, l.precio, l.iva_pct);
        inp.closest('tr').cells[4].textContent = distDinero(x.total);
        const t = distTotales(lineas);
        if (pie.rows.length === 3) [t.subtotal, t.iva, t.total].forEach((m, k) => { pie.rows[k].cells[1].textContent = distDinero(m); });
        alCambiar();
    });

    cuerpo.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-accion="eliminar"]');
        if (!b) return;
        lineas.splice(Number(b.dataset.id), 1);
        dibujar();
        alCambiar();
    });

    llenar();
    dibujar();

    return {
        // Solo las que tienen cantidad
        lineas: () => lineas.filter((l) => l.cantidad > 0).map((l) => ({ ...l })),
        totales: () => distTotales(lineas.filter((l) => l.cantidad > 0)),
        // ¿Alguna pasa de lo que lleva? -> texto del error o ''
        revisar() {
            const pasada = lineas.find((l) => l.cantidad > maximo(l.presentacion_id));
            return pasada ? `Solo llevas ${distCantidad(maximo(pasada.presentacion_id))} de ${pasada.descripcion}.` : '';
        },
        lista: () => lista,
        // Otra lista: los precios de las líneas cambian a los de esa lista
        cambiarLista(id) {
            lista = id;
            lineas.forEach((l) => { const pr = precioDe(l.presentacion_id); l.precio = pr.precio; l.iva_pct = pr.iva_pct; });
            dibujar();
            alCambiar();
        },
        cambiarCatalogo(nuevo) {
            cat = nuevo;
            llenar();
            this.cambiarLista(lista);
        },
        cambiarDisponibles(map) {
            maximos = map;
            llenar();
            dibujar();
        },
        limpiar() {
            lineas = [];
            error.textContent = '';
            dibujar();
            alCambiar();
        },
    };
}

// ==================================================
// ENTREGA POR PRODUCTO (piloto, preventa)
// Ventana: cuánto entregó de cada producto; si es menos, el motivo (obligatorio).
// Al confirmar llama a dist_entregar (la base recalcula el total y el estado).
// opciones: { pedido: { id, codigo, total_cobrar, forma_pago, detalle }, lineas (pedido_productos),
//             motivos: [{ nombre }], sesion }
// Devuelve una promesa: el resultado de la base ({ estado, total, incompletos, faltan }) o null.
// ==================================================

function abrirEntregaProductos({ pedido, lineas, motivos = [], sesion }) {
    return new Promise((resolver) => {
        const dlg = document.createElement('dialog');
        dlg.className = 'dialogo dist-entrega';
        dlg.setAttribute('aria-label', `Entregar el pedido ${pedido.codigo}`);
        const form = document.createElement('form');
        form.className = 'dialogo-form';
        form.noValidate = true;

        const titulo = document.createElement('h3');
        titulo.className = 'dialogo-titulo';
        titulo.textContent = `Entregar ${pedido.codigo}`;
        const texto = document.createElement('p');
        texto.className = 'dialogo-texto';
        texto.textContent = 'Escribe cuánto recibió el cliente de cada producto. Si recibió menos, elige o escribe el motivo.';

        // Envío que se cobraba aparte de los productos (se mantiene)
        const prodAntes = Number((pedido.detalle && pedido.detalle.productos && pedido.detalle.productos.total) || 0);
        const envio = Math.max(distRedondo(Number(pedido.total_cobrar || 0) - prodAntes), 0);

        const tablaCaja = document.createElement('div');
        tablaCaja.className = 'tabla-caja';
        const tabla = document.createElement('table');
        tabla.className = 'tabla dist-tabla';
        tabla.innerHTML = '<thead><tr><th>Producto</th><th class="dist-num">Pedido</th><th class="dist-num">Entregado</th><th>Motivo si es menos</th></tr></thead>';
        const cuerpo = document.createElement('tbody');
        tabla.appendChild(cuerpo);
        tablaCaja.appendChild(tabla);

        const listaMotivos = motivos.filter((m) => m.activo !== false).map((m) => m.nombre);
        const filas = lineas.map((l) => {
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(l.descripcion));
            tr.appendChild(crearCelda(distCantidad(l.cantidad), 'dist-num'));
            const tdCant = document.createElement('td');
            tdCant.className = 'dist-num';
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.min = '0';
            inp.max = String(l.cantidad);
            inp.step = 'any';
            inp.inputMode = 'decimal';
            inp.className = 'campo-input dist-cantidad';
            inp.value = l.cantidad;
            inp.setAttribute('aria-label', `Entregado de ${l.descripcion}`);
            tdCant.appendChild(inp);
            tr.appendChild(tdCant);
            const tdMot = document.createElement('td');
            const sel = document.createElement('select');
            sel.className = 'campo-input';
            sel.setAttribute('aria-label', `Motivo de ${l.descripcion}`);
            sel.appendChild(new Option('Elige el motivo', ''));
            listaMotivos.forEach((m) => sel.appendChild(new Option(m, m)));
            sel.appendChild(new Option('Otro (escribir)', '__otro'));
            const otro = document.createElement('input');
            otro.type = 'text';
            otro.maxLength = 120;
            otro.className = 'campo-input';
            otro.placeholder = 'Motivo';
            otro.setAttribute('aria-label', `Otro motivo de ${l.descripcion}`);
            tdMot.append(sel, otro);
            tr.appendChild(tdMot);
            cuerpo.appendChild(tr);
            const f = { l, inp, sel, otro, tdMot };
            const actualizar = () => {
                const menos = distRedondo(inp.value) < Number(l.cantidad);
                tdMot.classList.toggle('dist-motivo-oculto', !menos);
                otro.hidden = !(menos && (sel.value === '__otro' || !listaMotivos.length));
                sel.hidden = !listaMotivos.length;
                tr.classList.toggle('dist-fila-incompleta', menos);
            };
            f.actualizar = actualizar;
            inp.addEventListener('input', () => { actualizar(); dibujarTotal(); });
            sel.addEventListener('change', actualizar);
            actualizar();
            return f;
        });

        const totalCaja = document.createElement('p');
        totalCaja.className = 'dist-entrega-total';

        const cobro = document.createElement('fieldset');
        cobro.className = 'dist-cobro';
        const leyenda = document.createElement('legend');
        leyenda.className = 'campo-etiqueta';
        leyenda.textContent = '¿Cómo pagó el cliente?';
        const opciones = document.createElement('div');
        opciones.className = 'dist-cobro-opciones';
        const prevista = pedido.forma_pago === 'tarjeta' ? 'tarjeta' : 'efectivo';
        Object.entries(DIST_FORMAS).forEach(([valor, nombre]) => {
            const label = document.createElement('label');
            const r = document.createElement('input');
            r.type = 'radio';
            r.name = `distCobro${pedido.id}`;
            r.value = valor;
            r.checked = valor === prevista;
            label.append(r, ` ${nombre}`);
            opciones.appendChild(label);
        });
        cobro.append(leyenda, opciones);

        const nota = document.createElement('input');
        nota.type = 'text';
        nota.maxLength = 300;
        nota.className = 'campo-input';
        nota.placeholder = 'Nota (opcional)';
        nota.setAttribute('aria-label', 'Nota de la entrega');

        const error = document.createElement('p');
        error.className = 'form-error';
        error.setAttribute('role', 'alert');

        const botones = document.createElement('div');
        botones.className = 'dialogo-botones';
        const volver = document.createElement('button');
        volver.type = 'button';
        volver.className = 'boton boton-secundario';
        volver.textContent = 'Volver';
        const confirmar = document.createElement('button');
        confirmar.type = 'submit';
        confirmar.className = 'boton boton-principal';
        confirmar.textContent = 'Confirmar entrega';
        botones.append(volver, confirmar);

        function calcular() {
            const prod = distTotales(filas.map((f) => ({ cantidad: Math.max(distRedondo(f.inp.value), 0), precio: f.l.precio, iva_pct: f.l.iva_pct })));
            return { prod, total: distRedondo(envio + prod.total) };
        }
        function dibujarTotal() {
            const c = calcular();
            totalCaja.textContent = `A cobrar: ${distDinero(c.total)}${envio ? ` (productos ${distDinero(c.prod.total)} + envío ${distDinero(envio)})` : ' (con IVA)'}`;
            cobro.hidden = c.total <= 0;
        }
        dibujarTotal();

        form.append(titulo, texto, tablaCaja, totalCaja, cobro, nota, error, botones);
        dlg.appendChild(form);
        document.body.appendChild(dlg);

        let resultado = null;
        const cerrar = () => dlg.close();
        dlg.addEventListener('close', () => { dlg.remove(); resolver(resultado); });
        volver.addEventListener('click', cerrar);

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            error.textContent = '';
            const datos = [];
            for (const f of filas) {
                const n = distRedondo(f.inp.value);
                if (f.inp.value === '' || n < 0) { error.textContent = `Escribe cuánto se entregó de ${f.l.descripcion} (0 o más).`; f.inp.focus(); return; }
                if (n > Number(f.l.cantidad)) { error.textContent = `De ${f.l.descripcion} se pidieron ${distCantidad(f.l.cantidad)}: no se puede entregar más.`; f.inp.focus(); return; }
                let motivo = null;
                if (n < Number(f.l.cantidad)) {
                    motivo = (f.sel.value && f.sel.value !== '__otro') ? f.sel.value : f.otro.value.trim();
                    if (!motivo) { error.textContent = `Falta el motivo de ${f.l.descripcion}.`; (f.otro.hidden ? f.sel : f.otro).focus(); return; }
                }
                datos.push({ id: f.l.id, entregada: n, motivo });
            }
            if (datos.every((d) => d.entregada === 0)) { error.textContent = 'No se entregó nada: usa "No entregado".'; return; }
            const forma = (form.querySelector(`input[name="distCobro${pedido.id}"]:checked`) || {}).value || null;
            confirmar.disabled = true;
            const { data, error: err } = await db.rpc('dist_entregar', {
                p: { usuario_id: sesion.id || null, pedido_id: pedido.id, cobro_forma: calcular().total > 0 ? forma : null, nota: nota.value.trim() || null, lineas: datos },
            });
            confirmar.disabled = false;
            if (err) {
                console.error('Error al entregar el pedido:', err);
                error.textContent = err.code === 'P0001' ? err.message
                    : distFaltaSql(err) ? 'Falta ejecutar sql/01 (bloque 27: distribuidora).' : 'No se pudo guardar la entrega. Intenta de nuevo.';
                return;
            }
            resultado = data;
            cerrar();
        });

        dlg.showModal();
        if (filas[0]) filas[0].inp.focus();
    });
}
