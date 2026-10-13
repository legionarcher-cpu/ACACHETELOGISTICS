/* ==================================================
   CONFIGURACIÓN -> ARTÍCULOS DE VENTA Y PRECIOS
   ACACHETE LOGISTICS

   Lo carga js/secciones/configuracion.js la primera vez que se abre la tarjeta
   "Artículos de venta y precios" (Administrador y Admin G1).

   Un artículo de venta es, en la base (sql/01 bloques 27 y 32):
     productos (artículo, categoría, código)
       -> producto_presentaciones (presentación, unidad, cantidad que trae, costo)
         -> precios (precio SIN IVA + % de IVA, en una lista de precios)
   Es el mismo catálogo de la distribuidora (Distribución -> Productos y precios);
   aquí se crea todo en UNA ventana y el precio se escribe CON IVA.

   - Nuevo: si el artículo ya existe (mismo nombre), se le agrega la presentación.
     Si la empresa no tiene listas de precios, se crea la "General".
   - Modificar: cambia el artículo (todas sus presentaciones) y esta presentación.
   - Eliminar: la presentación (y el artículo si se queda sin presentaciones). Si ya
     se usó en pedidos o bodegas, la base no deja: se desactiva.
   Sin el bloque 32 (unidad y costo) se guarda lo demás y se avisa.
   Usa distDinero, distConIva, distRedondo, DIST_IVA de js/distribucion-comun.js.
   ================================================== */

registrarModuloConfig('articulos', (seccion, ctx) => {
    const { zona, aviso, pedirConfirmacion } = ctx;
    const $ = (selector) => zona.querySelector(selector);         // ventanas (fuera del <section>)
    const enSeccion = (selector) => seccion.querySelector(selector);

    const UNIDADES = { unidad: 'Unidad', kg: 'kg', g: 'g', litro: 'Litro', ml: 'ml', metro: 'Metro',
        paquete: 'Paquete', caja: 'Caja', bolsa: 'Bolsa', docena: 'Docena' };
    const faltaSql = (e) => !!e && ['42703', 'PGRST204', '42P01', 'PGRST205', 'PGRST200'].includes(e.code);

    let productos = [];
    let presentaciones = [];
    let listas = [];
    let precios = new Map();  // `${lista}:${presentacion}` -> { precio, iva_pct }
    let tieneBloque32 = true; // columnas unidad y costo
    let editando = null;      // presentación que se modifica (null = nuevo)
    let activo = true;

    const listaElegida = () => Number(enSeccion('#cfgArtLista').value) || null;
    const productoDe = (x) => productos.find((p) => p.id === x.producto_id) || { nombre: '?' };
    const textoUnidad = (u) => UNIDADES[u] || u || 'Unidad';

    // ==================================================
    // CARGAR
    // ==================================================

    async function cargar() {
        let pre = await db.from('producto_presentaciones').select('id, producto_id, nombre, unidades, unidad, costo, activa, orden').order('orden').order('nombre');
        tieneBloque32 = !(pre.error && ['42703', 'PGRST204'].includes(pre.error.code));
        if (!tieneBloque32) pre = await db.from('producto_presentaciones').select('id, producto_id, nombre, unidades, activa, orden').order('orden').order('nombre');
        const [pro, lis, pcs] = await Promise.all([
            db.from('productos').select('id, codigo, nombre, categoria, activo').order('nombre'),
            db.from('listas_precios').select('id, nombre, general, activa').order('nombre'),
            db.from('precios').select('lista_id, presentacion_id, precio, iva_pct'),
        ]);
        if (!activo) return;
        const error = pre.error || pro.error || lis.error || pcs.error;
        enSeccion('#cfgArtFaltaSql').hidden = !faltaSql(error);
        enSeccion('#cfgArtContenido').hidden = faltaSql(error);
        enSeccion('#cfgArtFaltaSql32').hidden = !!error || tieneBloque32;
        enSeccion('#cfgArtSinPedidos').hidden = typeof empresaUsa !== 'function' || empresaUsa('productos');
        if (error) {
            if (!faltaSql(error)) {
                console.error('Error al cargar los artículos:', error);
                aviso.mostrar('No se pudieron cargar los artículos. Revisa la conexión.', 'error');
            }
            return;
        }
        productos = pro.data;
        presentaciones = pre.data;
        listas = lis.data;
        precios = new Map(pcs.data.map((x) => [`${x.lista_id}:${x.presentacion_id}`, x]));
        llenarListas();
        dibujar();
    }

    function llenarListas() {
        const sel = enSeccion('#cfgArtLista');
        const actual = sel.value;
        sel.replaceChildren(...listas.map((l) => new Option(`${l.nombre}${l.general ? ' (general)' : ''}${l.activa ? '' : ' · inactiva'}`, l.id)));
        if (!listas.length) sel.appendChild(new Option('General (se crea al guardar)', ''));
        const general = (listas.find((l) => l.general) || listas[0] || {}).id;
        sel.value = listas.some((l) => String(l.id) === actual) ? actual : String(general || '');
        sel.closest('label').hidden = listas.length <= 1;
    }

    // ==================================================
    // TABLA
    // ==================================================

    function dibujar() {
        const cuerpo = enSeccion('#cfgArtTabla');
        const filtro = enSeccion('#cfgArtBuscar').value;
        const lista = listaElegida();
        cuerpo.replaceChildren();

        const filas = presentaciones
            .map((x) => ({ x, p: productoDe(x) }))
            .filter(({ x, p }) => coincideBusqueda([p.nombre, p.categoria, p.codigo, x.nombre], filtro))
            .sort((a, b) => a.p.nombre.localeCompare(b.p.nombre, 'es') || a.x.nombre.localeCompare(b.x.nombre, 'es'));
        // Artículos sin presentación (creados en Distribución sin terminar)
        const sinPres = productos.filter((p) => !presentaciones.some((x) => x.producto_id === p.id)
            && coincideBusqueda([p.nombre, p.categoria, p.codigo], filtro));

        if (!filas.length && !sinPres.length) {
            cuerpo.appendChild(crearFilaVacia(presentaciones.length || productos.length
                ? 'Ningún artículo coincide con la búsqueda.'
                : 'Todavía no hay artículos. Crea el primero con "Nuevo artículo".', 9));
        }

        filas.forEach(({ x, p }) => {
            const pr = lista ? precios.get(`${lista}:${x.id}`) : null;
            const venta = pr ? distConIva(pr.precio, pr.iva_pct) : null;
            const costo = x.costo == null ? null : Number(x.costo);
            const tr = document.createElement('tr');
            if (!x.activa || !p.activo) tr.classList.add('cfg-art-inactivo');

            const tdNombre = crearCelda(p.nombre);
            const detalle = [p.categoria, p.codigo].filter(Boolean).join(' · ');
            if (detalle) {
                const s = document.createElement('small');
                s.className = 'cfg-art-detalle';
                s.textContent = detalle;
                tdNombre.append(document.createElement('br'), s);
            }
            tr.appendChild(tdNombre);
            tr.appendChild(crearCelda(x.nombre));
            tr.appendChild(crearCelda(textoUnidad(x.unidad)));
            tr.appendChild(crearCelda(distCantidad(x.unidades), 'dist-num'));
            tr.appendChild(crearCelda(costo == null ? '—' : distDinero(costo), 'dist-num'));
            const tdVenta = crearCelda(venta == null ? 'Sin precio' : distDinero(venta), 'dist-num');
            if (pr) tdVenta.title = `Sin IVA ${distDinero(pr.precio)} + IVA ${distCantidad(pr.iva_pct)} %`;
            tr.appendChild(tdVenta);
            // Margen sobre el precio sin IVA (lo que queda para la empresa)
            const margen = pr && costo != null && Number(pr.precio) > 0 ? ((Number(pr.precio) - costo) / Number(pr.precio)) * 100 : null;
            tr.appendChild(crearCelda(margen == null ? '—' : `${margen.toLocaleString('es-CR', { maximumFractionDigits: 1 })} %`, 'dist-num'));
            tr.appendChild(x.activa && p.activo ? crearCeldaEtiqueta('Activo', 'etiqueta-verde') : crearCeldaEtiqueta('Inactivo', 'etiqueta-gris'));
            tr.appendChild(crearCeldaAcciones(
                crearBotonIcono('editar', x.id, 'bi-pencil', `Modificar ${p.nombre} · ${x.nombre}`),
                crearBotonIcono('eliminar', x.id, 'bi-trash3', `Eliminar ${p.nombre} · ${x.nombre}`)));
            cuerpo.appendChild(tr);
        });

        sinPres.forEach((p) => {
            const tr = document.createElement('tr');
            tr.classList.add('cfg-art-inactivo');
            tr.appendChild(crearCelda(p.nombre));
            const td = crearCelda('Sin presentación ni precio');
            td.colSpan = 7;
            tr.appendChild(td);
            const completar = crearBotonIcono('completar', p.id, 'bi-plus-lg', `Agregar presentación y precio a ${p.nombre}`);
            tr.appendChild(crearCeldaAcciones(completar));
            cuerpo.appendChild(tr);
        });

        enSeccion('#cfgArtContador').textContent = presentaciones.length
            ? `${plural(new Set(presentaciones.map((x) => x.producto_id)).size, 'artículo', 'artículos')} · ${plural(presentaciones.length, 'presentación', 'presentaciones')}`
            : '';
    }

    enSeccion('#cfgArtBuscar').addEventListener('input', dibujar);
    enSeccion('#cfgArtLista').addEventListener('change', dibujar);

    // ==================================================
    // VENTANA: NUEVO / MODIFICAR
    // ==================================================

    const campo = {
        nombre: $('#cfgArtNombre'), categoria: $('#cfgArtCategoria'), codigo: $('#cfgArtCodigo'),
        presentacion: $('#cfgArtPresentacion'), unidad: $('#cfgArtUnidad'), cantidad: $('#cfgArtCantidad'),
        costo: $('#cfgArtCosto'), precio: $('#cfgArtPrecio'), iva: $('#cfgArtIva'), activo: $('#cfgArtActivo'),
    };
    const numeroDe = (input) => (input.value.trim() === '' ? null : Number(input.value));

    // "Sin IVA ₡884.96 + IVA ₡115.04 · Margen 32 %" mientras se escribe
    function actualizarResumen() {
        const venta = numeroDe(campo.precio);
        const iva = numeroDe(campo.iva) == null ? DIST_IVA : numeroDe(campo.iva);
        const costo = numeroDe(campo.costo);
        const partes = [];
        if (venta != null && venta >= 0 && iva >= 0) {
            const sinIva = distRedondo(venta / (1 + iva / 100));
            partes.push(`Sin IVA ${distDinero(sinIva)} + IVA ${distDinero(distRedondo(venta - sinIva))}`);
            if (costo != null && sinIva > 0) partes.push(`Margen ${(((sinIva - costo) / sinIva) * 100).toLocaleString('es-CR', { maximumFractionDigits: 1 })} %`);
        }
        const cantidad = numeroDe(campo.cantidad);
        if (venta != null && cantidad > 1) partes.push(`${distDinero(distRedondo(venta / cantidad))} por ${textoUnidad(campo.unidad.value).toLowerCase()}`);
        $('#cfgArtResumen').textContent = partes.join(' · ');
    }
    ['precio', 'iva', 'costo', 'cantidad', 'unidad'].forEach((c) => campo[c].addEventListener('input', actualizarResumen));
    campo.unidad.addEventListener('change', actualizarResumen);

    // Al escribir un artículo que ya existe: se llenan su categoría y código
    campo.nombre.addEventListener('input', () => {
        if (editando) return;
        const p = productos.find((x) => x.nombre.toLowerCase() === campo.nombre.value.trim().toLowerCase());
        $('#cfgArtNombreAyuda').textContent = p
            ? `Ya existe: se le agrega esta presentación (tiene ${plural(presentaciones.filter((x) => x.producto_id === p.id).length, 'presentación', 'presentaciones')}).`
            : 'Si ya existe, se le agrega esta presentación.';
        if (p) {
            if (!campo.categoria.value) campo.categoria.value = p.categoria || '';
            if (!campo.codigo.value) campo.codigo.value = p.codigo || '';
        }
    });

    function abrir(x = null, productoId = null) {
        editando = x;
        const p = x ? productoDe(x) : productos.find((y) => y.id === productoId) || null;
        const lista = listaElegida();
        const pr = x && lista ? precios.get(`${lista}:${x.id}`) : null;

        $('#cfgArtTitulo').textContent = x ? `Modificar: ${p.nombre} · ${x.nombre}` : 'Nuevo artículo';
        $('#cfgArtError').textContent = '';
        $('#cfgArtNombreAyuda').textContent = x ? 'Cambiar el nombre cambia el artículo en todas sus presentaciones.' : 'Si ya existe, se le agrega esta presentación.';
        $('#cfgArtNombres').replaceChildren(...productos.map((y) => new Option(y.nombre)));
        $('#cfgArtCategorias').replaceChildren(...[...new Set(productos.map((y) => y.categoria).filter(Boolean))].sort().map((c) => new Option(c)));

        campo.nombre.value = p ? p.nombre : '';
        campo.categoria.value = p ? p.categoria || '' : '';
        campo.codigo.value = p ? p.codigo || '' : '';
        campo.presentacion.value = x ? x.nombre : 'Unidad';
        campo.unidad.value = x && UNIDADES[x.unidad] ? x.unidad : 'unidad';
        campo.cantidad.value = x ? Number(x.unidades) : 1;
        campo.costo.value = x && x.costo != null ? Number(x.costo) : '';
        campo.precio.value = pr ? distConIva(pr.precio, pr.iva_pct) : '';
        campo.iva.value = pr ? Number(pr.iva_pct) : DIST_IVA;
        campo.activo.checked = x ? x.activa && p.activo : true;
        // Sin el bloque 32 no se guardan unidad ni costo
        campo.unidad.disabled = !tieneBloque32;
        campo.costo.disabled = !tieneBloque32;
        const nombreLista = (listas.find((l) => l.id === lista) || {}).nombre || 'General';
        $('label[for="cfgArtPrecio"]').textContent = `Precio de venta con IVA (₡)${listas.length > 1 ? ` · ${nombreLista}` : ''} *`;

        actualizarResumen();
        $('#cfgArtDialogo').showModal();
        (p && !x ? campo.presentacion : campo.nombre).focus();
    }

    enSeccion('#cfgArtNuevo').addEventListener('click', () => abrir());
    $('#cfgArtCancelar').addEventListener('click', () => $('#cfgArtDialogo').close());

    // Lista donde se guarda el precio: la elegida; si la empresa no tiene, se crea la "General"
    async function listaParaGuardar() {
        const lista = listaElegida();
        if (lista) return { id: lista };
        const r = await db.from('listas_precios').insert({ nombre: 'General', general: true, activa: true }).select('id').single();
        return r.error ? { error: r.error } : { id: r.data.id };
    }

    const textoError = (e) => (e.code === '23505' ? 'Ese artículo ya tiene una presentación con ese nombre.'
        : e.code === '23514' ? 'Revisa los números: cantidad mayor que 0, costo y precio 0 o más.'
        : 'No se pudo guardar. Revisa la conexión e intenta de nuevo.');

    $('#cfgArtForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const error = $('#cfgArtError');
        error.textContent = '';
        const nombre = campo.nombre.value.trim();
        const presentacion = campo.presentacion.value.trim();
        const cantidad = numeroDe(campo.cantidad);
        const costo = numeroDe(campo.costo);
        const venta = numeroDe(campo.precio);
        const iva = numeroDe(campo.iva) == null ? DIST_IVA : numeroDe(campo.iva);
        const falla = (texto, input) => { error.textContent = texto; input.focus(); };
        if (!nombre) return falla('Escribe el nombre del artículo.', campo.nombre);
        if (!presentacion) return falla('Escribe la presentación (ej. Unidad, Caja).', campo.presentacion);
        if (!(cantidad > 0)) return falla('La cantidad que trae debe ser mayor que 0.', campo.cantidad);
        if (costo != null && !(costo >= 0)) return falla('El costo debe ser 0 o más.', campo.costo);
        if (venta == null || !(venta >= 0)) return falla('Escribe el precio de venta (0 o más).', campo.precio);
        if (!(iva >= 0 && iva <= 100)) return falla('El IVA va de 0 a 100 %.', campo.iva);

        const boton = $('#cfgArtGuardar');
        boton.disabled = true;
        try {
            // 1. Artículo (producto): el que se edita, uno existente con ese nombre, o uno nuevo
            const datosProducto = { nombre, categoria: campo.categoria.value.trim() || null, codigo: campo.codigo.value.trim() || null };
            const activoTodo = campo.activo.checked;
            let productoId;
            if (editando) {
                productoId = editando.producto_id;
                const r = await db.from('productos').update({ ...datosProducto, ...(activoTodo ? { activo: true } : {}) }).eq('id', productoId);
                if (r.error) {
                    console.error('Error al guardar el artículo:', r.error);
                    error.textContent = r.error.code === '23505' ? 'Ya existe otro artículo con ese nombre.' : textoError(r.error);
                    return;
                }
            } else {
                const existente = productos.find((p) => p.nombre.toLowerCase() === nombre.toLowerCase());
                if (existente) {
                    productoId = existente.id;
                    const cambios = {};
                    if (datosProducto.categoria && datosProducto.categoria !== existente.categoria) cambios.categoria = datosProducto.categoria;
                    if (datosProducto.codigo && datosProducto.codigo !== existente.codigo) cambios.codigo = datosProducto.codigo;
                    if (activoTodo && !existente.activo) cambios.activo = true;
                    if (Object.keys(cambios).length) await db.from('productos').update(cambios).eq('id', productoId);
                } else {
                    const r = await db.from('productos').insert({ ...datosProducto, activo: true }).select('id').single();
                    if (r.error) { console.error('Error al crear el artículo:', r.error); error.textContent = textoError(r.error); return; }
                    productoId = r.data.id;
                }
            }

            // 2. Presentación (con unidad y costo si existe el bloque 32)
            const datosPres = { nombre: presentacion, unidades: distRedondo(cantidad), activa: activoTodo };
            if (tieneBloque32) Object.assign(datosPres, { unidad: campo.unidad.value, costo: costo == null ? null : distRedondo(costo) });
            const rp = editando
                ? await db.from('producto_presentaciones').update(datosPres).eq('id', editando.id).select('id').single()
                : await db.from('producto_presentaciones').insert({ ...datosPres, producto_id: productoId }).select('id').single();
            if (rp.error) { console.error('Error al guardar la presentación:', rp.error); error.textContent = textoError(rp.error); return; }

            // 3. Precio (se guarda SIN IVA, como lo usa todo el sistema)
            const lista = await listaParaGuardar();
            if (lista.error) { console.error('Error al crear la lista de precios:', lista.error); error.textContent = textoError(lista.error); return; }
            const sesion = obtenerSesion() || {};
            const rpr = await db.from('precios').upsert({
                lista_id: lista.id, presentacion_id: rp.data.id, precio: distRedondo(venta / (1 + iva / 100)), iva_pct: distRedondo(iva),
                actualizado_en: new Date().toISOString(), actualizado_por: sesion.id || null,
            }, { onConflict: 'lista_id,presentacion_id' });
            if (rpr.error) { console.error('Error al guardar el precio:', rpr.error); error.textContent = `Se guardó el artículo, pero no el precio. ${textoError(rpr.error)}`; return; }

            $('#cfgArtDialogo').close();
            aviso.mostrar(editando ? `"${nombre} · ${presentacion}" actualizado.` : `"${nombre} · ${presentacion}" creado a ${distDinero(venta)}.`);
            cargar();
        } finally {
            boton.disabled = false;
        }
    });

    // ==================================================
    // ACCIONES DE LA TABLA
    // ==================================================

    enSeccion('#cfgArtTabla').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-accion]');
        if (!b) return;
        const id = Number(b.dataset.id);
        if (b.dataset.accion === 'completar') return abrir(null, id);
        const x = presentaciones.find((y) => y.id === id);
        if (!x) return;
        if (b.dataset.accion === 'editar') abrir(x);
        if (b.dataset.accion === 'eliminar') {
            const p = productoDe(x);
            const ultima = presentaciones.filter((y) => y.producto_id === p.id).length === 1;
            pedirConfirmacion(`¿Eliminar "${p.nombre} · ${x.nombre}" y sus precios?${ultima ? ' Es su única presentación: también se elimina el artículo.' : ''}`, async () => {
                const { error } = ultima
                    ? await db.from('productos').delete().eq('id', p.id)
                    : await db.from('producto_presentaciones').delete().eq('id', x.id);
                if (error) {
                    console.error('Error al eliminar el artículo:', error);
                    aviso.mostrar(error.code === '23503'
                        ? 'Ya se usó en pedidos o bodegas: no se puede eliminar. Modifícalo y quítale "Activo".'
                        : 'No se pudo eliminar. Revisa la conexión.', 'error');
                    return;
                }
                aviso.mostrar(`"${p.nombre} · ${x.nombre}" eliminado.`);
                cargar();
            });
        }
    });

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================
    cargar();

    return () => {
        activo = false;
        const d = $('#cfgArtDialogo');
        if (d && d.open) d.close();
    };
});
