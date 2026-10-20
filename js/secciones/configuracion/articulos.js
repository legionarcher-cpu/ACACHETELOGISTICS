/* ==================================================
   CONFIGURACIÓN -> ARTÍCULOS (todo lo de artículos en un lugar)
   ACACHETE LOGISTICS

   Lo carga js/secciones/configuracion.js la primera vez que se abre la tarjeta
   "Artículos" (Administrador y Admin G1). Tres tarjetas:
     1. Categorías (categorias_mercaderia): casillas del pedido de cada actividad y
        categoría de los artículos de venta. Solo el Administrador las crea o cambia.
        Al renombrar una, los artículos de venta con el nombre viejo pasan al nuevo.
     2. Artículos de venta (abajo). Su categoría se ELIGE de la tarjeta Categorías
        (sin texto libre); las viejas escritas a mano se conservan.
     3. Pesos para el envío (articulos_catalogo, antes "artículos frecuentes" en
        Configuración -> Pedidos): peso promedio por artículo de las categorías de tipo
        "artículos"; Pedidos y Cotizador llenan el peso solo.

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
    // Categorías y pesos para el envío (antes en Configuración -> Pedidos)
    let actividades = [];     // [{ codigo, nombre }] de pedidos que realiza la empresa
    let cats = [];            // categorias_mercaderia de la empresa
    let pesos = [];           // articulos_catalogo (peso promedio de cada artículo)
    let editandoCat = null;
    let editandoPeso = null;
    const esAdmin = typeof esAdministrador === 'function' && esAdministrador(); // solo él crea y cambia categorías

    // ¿Es de una actividad de pedidos que realiza la empresa? (empresas/empresas.js)
    // Las de viajes (Transporte) no usan categorías.
    const deLaEmpresa = (codigo) => !codigo || (empresaTieneActividad(codigo) && !esActividadDeViajes(codigo));

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
        const [pro, lis, pcs, act, cat, pes] = await Promise.all([
            db.from('productos').select('id, codigo, nombre, categoria, activo').order('nombre'),
            db.from('listas_precios').select('id, nombre, general, activa').order('nombre'),
            db.from('precios').select('lista_id, presentacion_id, precio, iva_pct'),
            db.from('actividades').select('codigo, nombre').order('orden'),
            db.from('categorias_mercaderia').select('*').order('orden'),
            db.from('articulos_catalogo').select('id, categoria_id, nombre, peso_kg, activo, orden').order('orden'),
        ]);
        if (!activo) return;

        // Categorías y pesos: no dependen de la distribuidora (se ven aunque falte el bloque 27)
        if (act.error || cat.error || pes.error) console.error('Error al cargar categorías o pesos:', act.error || cat.error || pes.error);
        actividades = act.error ? [] : act.data.filter((a) => deLaEmpresa(a.codigo));
        cats = cat.error ? [] : cat.data.filter((c) => deLaEmpresa(c.actividad));
        pesos = pes.error ? [] : pes.data.filter((f) => cats.some((c) => c.id === f.categoria_id));
        if (!pro.error) productos = pro.data; // la tabla de categorías cuenta sus artículos de venta
        dibujarCategorias();
        dibujarPesos();

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

    // Artículo y presentación: lista con "+ Nuevo…" (js/componentes.js; no datalist, que dentro
    // de la ventana se dibuja fuera de lugar). La categoría SOLO se elige de la tarjeta Categorías
    // (la misma lista de los pedidos), así quedan ligadas.
    const ART_PRESENTACIONES = ['Unidad', 'Caja', 'Paquete', 'Bolsa', 'Paca', 'Docena'];
    const listaNombre = crearListaConNuevo($('#cfgArtNombreLista'), campo.nombre, { textoNuevo: '+ Nuevo artículo…' });
    const listaCategoria = crearListaConNuevo($('#cfgArtCategoriaLista'), campo.categoria,
        { vacio: 'Sin categoría', textoNuevo: null });
    const listaPresentacion = crearListaConNuevo($('#cfgArtPresentacionLista'), campo.presentacion,
        { textoNuevo: '+ Nueva presentación…' });
    const ordenado = (lista) => [...lista].sort((a, b) => a.localeCompare(b, 'es'));
    // Las de la tarjeta Categorías (activas, sin repetir nombres) y las viejas escritas a mano
    // que todavía tiene algún artículo (para no perderlas al modificarlo)
    // (también las inactivas: "inactiva" solo la quita de las casillas del pedido)
    const categorias = () => ordenado([...cats.map((c) => c.nombre),
        ...productos.map((y) => y.categoria).filter(Boolean)]);

    // Al elegir (o escribir) un artículo que ya existe: se llenan su categoría y código
    function revisarArticulo() {
        if (editando) return;
        const nombre = listaNombre.valor().toLowerCase();
        const p = nombre ? productos.find((x) => x.nombre.toLowerCase() === nombre) : null;
        $('#cfgArtNombreAyuda').textContent = p
            ? `Ya existe: se le agrega esta presentación (tiene ${plural(presentaciones.filter((x) => x.producto_id === p.id).length, 'presentación', 'presentaciones')}).`
            : 'Elige un artículo para agregarle una presentación, o "+ Nuevo artículo…".';
        if (p) {
            if (!listaCategoria.valor()) listaCategoria.poner(categorias(), p.categoria || '');
            if (!campo.codigo.value) campo.codigo.value = p.codigo || '';
        }
    }
    $('#cfgArtNombreLista').addEventListener('change', revisarArticulo);
    campo.nombre.addEventListener('input', revisarArticulo);

    function abrir(x = null, productoId = null) {
        editando = x;
        const p = x ? productoDe(x) : productos.find((y) => y.id === productoId) || null;
        const lista = listaElegida();
        const pr = x && lista ? precios.get(`${lista}:${x.id}`) : null;

        $('#cfgArtTitulo').textContent = x ? `Modificar: ${p.nombre} · ${x.nombre}` : 'Nuevo artículo';
        $('#cfgArtError').textContent = '';
        $('#cfgArtNombreAyuda').textContent = x ? 'Cambiar el nombre cambia el artículo en todas sus presentaciones.'
            : 'Elige un artículo para agregarle una presentación, o "+ Nuevo artículo…".';

        // Al modificar, el nombre se escribe (cambiarlo renombra el artículo); al crear, se elige o es nuevo
        listaNombre.poner(ordenado(productos.map((y) => y.nombre)), p ? p.nombre : '', { escribir: !!x });
        listaCategoria.poner(categorias(), p ? p.categoria || '' : '');
        listaPresentacion.poner([...ART_PRESENTACIONES, ...ordenado(presentaciones.map((y) => y.nombre))], x ? x.nombre : 'Unidad');
        campo.codigo.value = p ? p.codigo || '' : '';
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
        (p && !x ? listaPresentacion : listaNombre).campo().focus();
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
        const nombre = listaNombre.valor();
        const presentacion = listaPresentacion.valor();
        const cantidad = numeroDe(campo.cantidad);
        const costo = numeroDe(campo.costo);
        const venta = numeroDe(campo.precio);
        const iva = numeroDe(campo.iva) == null ? DIST_IVA : numeroDe(campo.iva);
        const falla = (texto, input) => { error.textContent = texto; input.focus(); };
        if (!nombre) return falla('Elige el artículo o escribe el nombre del nuevo.', listaNombre.campo());
        if (!presentacion) return falla('Elige la presentación o escribe una nueva (ej. Six pack).', listaPresentacion.campo());
        if (!(cantidad > 0)) return falla('La cantidad que trae debe ser mayor que 0.', campo.cantidad);
        if (costo != null && !(costo >= 0)) return falla('El costo debe ser 0 o más.', campo.costo);
        if (venta == null || !(venta >= 0)) return falla('Escribe el precio de venta (0 o más).', campo.precio);
        if (!(iva >= 0 && iva <= 100)) return falla('El IVA va de 0 a 100 %.', campo.iva);

        const boton = $('#cfgArtGuardar');
        boton.disabled = true;
        try {
            // 1. Artículo (producto): el que se edita, uno existente con ese nombre, o uno nuevo
            const datosProducto = { nombre, categoria: listaCategoria.valor() || null, codigo: campo.codigo.value.trim() || null };
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
    // CATEGORÍAS (tabla categorias_mercaderia; antes en Configuración -> Pedidos)
    // Son las casillas del pedido de cada actividad y la categoría de los artículos de
    // venta. Crear, cambiar y eliminar: solo el Administrador (G1 las ve).
    // ==================================================

    const ART_TIPOS = { articulos: 'Artículos con peso', conteo: 'Conteo', bulto: 'Bultos', documento: 'Documentos' };
    const nombreActividad = (codigo) => (actividades.find((a) => a.codigo === codigo) || {}).nombre || codigo;
    const ordenActividad = (codigo) => { const i = actividades.findIndex((a) => a.codigo === codigo); return i < 0 ? 99 : i; };
    const ordenarCats = (a, b) => (ordenActividad(a.actividad) - ordenActividad(b.actividad)) || (a.orden - b.orden)
        || a.nombre.localeCompare(b.nombre, 'es');
    // "Encomiendas · Línea blanca" (el mismo nombre puede estar en dos actividades)
    const nombreCat = (id) => { const c = cats.find((x) => x.id === id); return c ? `${nombreActividad(c.actividad)} · ${c.nombre}` : 'Sin categoría'; };
    const kilos = (n) => `${Number(n || 0).toLocaleString('es-CR')} kg`;

    function celdaIcono(icono, texto) {
        const td = document.createElement('td');
        const i = document.createElement('i');
        i.className = `bi ${icono || 'bi-box'} cfg-icono-fila`;
        td.append(i, ` ${texto}`);
        return td;
    }

    // Categorías escritas en los artículos de venta (de antes de ligarlas) que no están en la
    // lista: sin repetir y sin importar mayúsculas ni tildes ("lacteos" = "Lácteos")
    const igualTexto = (t) => textoParaBuscar(String(t || '').trim().replace(/\s+/g, ' '));
    function categoriasSueltas() {
        const vistas = new Set(cats.map((c) => igualTexto(c.nombre)));
        const sueltas = [];
        productos.forEach((p) => {
            const nombre = String(p.categoria || '').trim().replace(/\s+/g, ' ');
            if (nombre && !vistas.has(igualTexto(nombre))) {
                vistas.add(igualTexto(nombre));
                sueltas.push(nombre);
            }
        });
        return ordenado(sueltas);
    }

    // Actividad a la que van: la que trabaja con productos (distribuidora). En esa actividad
    // el pedido usa productos, no casillas, así que la categoría no agrega casillas nuevas.
    const actividadDeProductos = () => actividades.find((a) => actividadUsaParte(a.codigo, 'productos')) || null;

    function pintarSueltas() {
        const sueltas = categoriasSueltas();
        const caja = enSeccion('#cfgArtCatSueltas');
        caja.hidden = !sueltas.length;
        if (!sueltas.length) return;
        enSeccion('#cfgArtCatSueltasTexto').textContent =
            `Tus artículos de venta usan ${plural(sueltas.length, 'categoría que no está', 'categorías que no están')} en esta lista: `
            + `${sueltas.join(', ')}.${esAdmin ? '' : ' Pídele al Administrador que las traiga.'}`;
        enSeccion('#cfgArtCatTraer').hidden = !esAdmin || !actividades.length;
    }

    enSeccion('#cfgArtCatTraer').addEventListener('click', () => {
        const sueltas = categoriasSueltas();
        if (!esAdmin || !sueltas.length || !actividades.length) return;
        const deProductos = actividadDeProductos();
        // Sin actividad de productos: van a la primera, pero INACTIVAS (así no salen como casillas en sus pedidos)
        const actividad = deProductos || actividades[0];
        const ultimoOrden = Math.max(0, ...cats.filter((c) => c.actividad === actividad.codigo).map((c) => Number(c.orden) || 0));
        pedirConfirmacion(`¿Agregar ${plural(sueltas.length, 'categoría', 'categorías')} a la lista (${sueltas.join(', ')}) en `
            + `${actividad.nombre}${deProductos ? '' : ', inactivas para que no salgan como casillas en sus pedidos'}?`, async () => {
            const { error } = await db.from('categorias_mercaderia').insert(sueltas.map((nombre, i) => ({
                actividad: actividad.codigo, nombre, tipo: 'articulos', icono: 'bi-box',
                orden: ultimoOrden + i + 1, activa: !!deProductos,
            })));
            if (error) {
                console.error('Error al traer las categorías:', error);
                aviso.mostrar(error.code === '23505' ? 'Alguna ya existe en esa actividad. Recarga e intenta de nuevo.'
                    : 'No se pudieron agregar. Revisa la conexión.', 'error');
                return;
            }
            aviso.mostrar(`${plural(sueltas.length, 'categoría agregada', 'categorías agregadas')} a la lista.`);
            cargar();
        });
    });

    function dibujarCategorias() {
        const cuerpo = enSeccion('#cfgArtCatTabla');
        enSeccion('#cfgArtCatNueva').hidden = !esAdmin || !actividades.length;
        enSeccion('#cfgArtCatSoloAdmin').hidden = esAdmin;
        pintarSueltas();
        cuerpo.replaceChildren();
        if (!cats.length) {
            cuerpo.appendChild(crearFilaVacia(actividades.length
                ? 'Todavía no hay categorías.' : 'La empresa no tiene actividades de pedidos.', 5));
            return;
        }
        let grupo = null;
        [...cats].sort(ordenarCats).forEach((c) => {
            if (c.actividad !== grupo) {
                grupo = c.actividad;
                const cuenta = cats.filter((x) => x.actividad === grupo).length;
                cuerpo.appendChild(crearFilaGrupo(nombreActividad(grupo), null, plural(cuenta, 'categoría', 'categorías'), 5));
            }
            const tr = document.createElement('tr');
            if (!c.activa) tr.classList.add('cfg-art-inactivo');
            tr.appendChild(celdaIcono(c.icono, c.nombre));
            tr.appendChild(crearCelda(c.tipo === 'documento' && c.peso_referencia != null
                ? `Documentos (${kilos(c.peso_referencia)} c/u)` : ART_TIPOS[c.tipo] || c.tipo));
            // Qué tiene: pesos para el envío y artículos de venta con esa categoría
            const conPeso = pesos.filter((f) => f.categoria_id === c.id).length;
            const deVenta = productos.filter((p) => igualTexto(p.categoria) === igualTexto(c.nombre)).length;
            tr.appendChild(crearCelda([conPeso ? `${conPeso} con peso` : null, deVenta ? `${deVenta} de venta` : null]
                .filter(Boolean).join(' · ') || '—', 'dist-num'));
            tr.appendChild(c.activa ? crearCeldaEtiqueta('Activa', 'etiqueta-verde') : crearCeldaEtiqueta('Inactiva', 'etiqueta-gris'));
            tr.appendChild(crearCeldaAcciones(...(esAdmin ? [
                crearBotonIcono('editar', c.id, 'bi-pencil', `Modificar ${c.nombre}`),
                crearBotonIcono('eliminar', c.id, 'bi-trash3', `Eliminar ${c.nombre}`)] : [])));
            cuerpo.appendChild(tr);
        });
    }

    const pesoDeDocumento = () => { $('#cfgArtCatPesoCampo').hidden = $('#cfgArtCatTipo').value !== 'documento'; };
    $('#cfgArtCatTipo').addEventListener('change', pesoDeDocumento);

    function abrirCategoria(c = null) {
        if (!esAdmin) return;
        editandoCat = c;
        $('#cfgArtCatTitulo').textContent = c ? `Modificar categoría: ${c.nombre}` : 'Nueva categoría';
        $('#cfgArtCatError').textContent = '';
        const selAct = $('#cfgArtCatActividad');
        selAct.replaceChildren(...actividades.map((a) => new Option(a.nombre, a.codigo)));
        selAct.value = c ? c.actividad : (actividades[0] || {}).codigo || '';
        selAct.disabled = !!c; // al modificar no cambia de actividad
        $('#cfgArtCatNombre').value = c ? c.nombre : '';
        $('#cfgArtCatTipo').value = c ? c.tipo : 'articulos';
        $('#cfgArtCatPeso').value = c && c.peso_referencia != null ? Number(c.peso_referencia) : 0.2;
        $('#cfgArtCatIcono').value = c && c.icono ? c.icono : 'bi-box';
        $('#cfgArtCatOrden').value = c ? c.orden || 0 : 0;
        $('#cfgArtCatActiva').checked = c ? c.activa : true;
        pesoDeDocumento();
        $('#cfgArtCatDialogo').showModal();
        $('#cfgArtCatNombre').focus();
    }

    enSeccion('#cfgArtCatNueva').addEventListener('click', () => abrirCategoria());
    $('#cfgArtCatCancelar').addEventListener('click', () => $('#cfgArtCatDialogo').close());

    $('#cfgArtCatForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const error = $('#cfgArtCatError');
        const c = editandoCat;
        const nombre = $('#cfgArtCatNombre').value.trim().replace(/\s+/g, ' ');
        const tipo = $('#cfgArtCatTipo').value;
        const peso = Number($('#cfgArtCatPeso').value);
        const orden = Math.round(Number($('#cfgArtCatOrden').value) || 0);
        const falla = (texto, input) => { error.textContent = texto; if (input) input.focus(); };
        if (!c && !$('#cfgArtCatActividad').value) return falla('Elige la actividad.', $('#cfgArtCatActividad'));
        if (!nombre) return falla('Escribe el nombre de la categoría.', $('#cfgArtCatNombre'));
        if (tipo === 'documento' && !(peso >= 0)) return falla('El peso de cada documento debe ser 0 o más.', $('#cfgArtCatPeso'));
        if (orden < 0) return falla('El orden debe ser 0 o más.', $('#cfgArtCatOrden'));

        const datos = {
            nombre, tipo, icono: $('#cfgArtCatIcono').value || 'bi-box', orden, activa: $('#cfgArtCatActiva').checked,
            peso_referencia: tipo === 'documento' ? peso : null,
        };
        if (!c) datos.actividad = $('#cfgArtCatActividad').value;
        const boton = $('#cfgArtCatGuardar');
        boton.disabled = true;
        const { error: err } = c
            ? await db.from('categorias_mercaderia').update(datos).eq('id', c.id)
            : await db.from('categorias_mercaderia').insert(datos);
        boton.disabled = false;
        if (err) {
            console.error('Error al guardar la categoría:', err);
            return falla(err.code === '23505' ? 'Ya existe una categoría con ese nombre en esa actividad.'
                : 'No se pudo guardar. Revisa la conexión e intenta de nuevo.');
        }
        // Cambió el nombre: los artículos de venta con el nombre viejo pasan al nuevo (si ninguna
        // otra categoría se sigue llamando como antes), así siguen ligados
        if (c && c.nombre !== nombre && !cats.some((x) => x.id !== c.id && x.nombre === c.nombre)) {
            const r = await db.from('productos').update({ categoria: nombre }).eq('categoria', c.nombre);
            if (r.error) console.error('Error al pasar los artículos a la categoría renombrada:', r.error);
        }
        $('#cfgArtCatDialogo').close();
        aviso.mostrar(c ? `Categoría "${nombre}" actualizada.` : `Categoría "${nombre}" creada.`);
        cargar();
    });

    enSeccion('#cfgArtCatTabla').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-accion]');
        if (!b || !esAdmin) return;
        const c = cats.find((x) => x.id === Number(b.dataset.id));
        if (!c) return;
        if (b.dataset.accion === 'editar') abrirCategoria(c);
        if (b.dataset.accion === 'eliminar') {
            pedirConfirmacion(`¿Eliminar la categoría "${c.nombre}" (${nombreActividad(c.actividad)})? También se borran sus pesos para el envío. `
                + 'Los pedidos que ya la usaron conservan el nombre. (Para ocultarla sin borrarla, desactívala.)', async () => {
                const { error } = await db.from('categorias_mercaderia').delete().eq('id', c.id);
                if (error) {
                    console.error('Error al eliminar la categoría:', error);
                    aviso.mostrar(error.code === '23503' ? 'Está en uso: no se puede eliminar. Modifícala y quítale "Activa".'
                        : 'No se pudo eliminar. Revisa la conexión.', 'error');
                    return;
                }
                aviso.mostrar(`Categoría "${c.nombre}" eliminada.`);
                cargar();
            });
        }
    });

    // ==================================================
    // PESOS PARA EL ENVÍO (tabla articulos_catalogo; antes "Artículos frecuentes")
    // Peso promedio de cada artículo de las categorías de tipo "artículos". En el pedido y
    // el cotizador el peso se llena solo. python/pesos_promedio.py los ajusta con lo real.
    // ==================================================

    const catsConPeso = () => cats.filter((c) => c.tipo === 'articulos').sort(ordenarCats);

    function dibujarPesos() {
        const cuerpo = enSeccion('#cfgArtPesoTabla');
        const conPeso = catsConPeso();
        enSeccion('#cfgArtPesoNuevo').hidden = !conPeso.length;
        cuerpo.replaceChildren();
        if (!conPeso.length) {
            cuerpo.appendChild(crearFilaVacia('Para agregar pesos, crea una categoría de tipo "Artículos con peso".', 4));
            return;
        }
        if (!pesos.length) {
            cuerpo.appendChild(crearFilaVacia('Todavía no hay pesos. Usa "Agregar peso" (ej. Refrigeradora, 70 kg).', 4));
            return;
        }
        conPeso.forEach((c) => {
            const suyos = pesos.filter((f) => f.categoria_id === c.id)
                .sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, 'es'));
            if (!suyos.length) return;
            cuerpo.appendChild(crearFilaGrupo(nombreCat(c.id), null, plural(suyos.length, 'artículo', 'artículos'), 4));
            suyos.forEach((f) => {
                const tr = document.createElement('tr');
                if (!f.activo) tr.classList.add('cfg-art-inactivo');
                tr.appendChild(crearCelda(f.nombre));
                tr.appendChild(crearCelda(kilos(f.peso_kg), 'dist-num'));
                tr.appendChild(f.activo ? crearCeldaEtiqueta('Activo', 'etiqueta-verde') : crearCeldaEtiqueta('Inactivo', 'etiqueta-gris'));
                tr.appendChild(crearCeldaAcciones(
                    crearBotonIcono('editar', f.id, 'bi-pencil', `Modificar ${f.nombre}`),
                    crearBotonIcono('eliminar', f.id, 'bi-trash3', `Eliminar ${f.nombre}`)));
                cuerpo.appendChild(tr);
            });
        });
    }

    function abrirPeso(f = null) {
        editandoPeso = f;
        $('#cfgArtPesoTitulo').textContent = f ? `Modificar peso: ${f.nombre}` : 'Agregar peso';
        $('#cfgArtPesoError').textContent = '';
        const sel = $('#cfgArtPesoCategoria');
        sel.replaceChildren(...catsConPeso().map((c) => new Option(nombreCat(c.id), c.id)));
        sel.value = f ? String(f.categoria_id) : sel.options.length ? sel.options[0].value : '';
        $('#cfgArtPesoNombre').value = f ? f.nombre : '';
        $('#cfgArtPesoKg').value = f ? Number(f.peso_kg) : '';
        $('#cfgArtPesoOrden').value = f ? f.orden || 0 : 0;
        $('#cfgArtPesoActivo').checked = f ? f.activo : true;
        $('#cfgArtPesoDialogo').showModal();
        $('#cfgArtPesoNombre').focus();
    }

    enSeccion('#cfgArtPesoNuevo').addEventListener('click', () => abrirPeso());
    $('#cfgArtPesoCancelar').addEventListener('click', () => $('#cfgArtPesoDialogo').close());

    $('#cfgArtPesoForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const error = $('#cfgArtPesoError');
        const f = editandoPeso;
        const categoriaId = Number($('#cfgArtPesoCategoria').value);
        const nombre = $('#cfgArtPesoNombre').value.trim().replace(/\s+/g, ' ');
        const textoKg = $('#cfgArtPesoKg').value.trim();
        const peso = Number(textoKg);
        const orden = Math.round(Number($('#cfgArtPesoOrden').value) || 0);
        const falla = (texto, input) => { error.textContent = texto; if (input) input.focus(); };
        if (!categoriaId) return falla('Elige la categoría.', $('#cfgArtPesoCategoria'));
        if (!nombre) return falla('Escribe el artículo (ej. Refrigeradora).', $('#cfgArtPesoNombre'));
        if (textoKg === '' || !(peso >= 0)) return falla('Escribe el peso promedio en kg (0 o más).', $('#cfgArtPesoKg'));
        if (orden < 0) return falla('El orden debe ser 0 o más.', $('#cfgArtPesoOrden'));

        const datos = { categoria_id: categoriaId, nombre, peso_kg: peso, orden, activo: $('#cfgArtPesoActivo').checked };
        const boton = $('#cfgArtPesoGuardar');
        boton.disabled = true;
        const { error: err } = f
            ? await db.from('articulos_catalogo').update(datos).eq('id', f.id)
            : await db.from('articulos_catalogo').insert(datos);
        boton.disabled = false;
        if (err) {
            console.error('Error al guardar el peso:', err);
            return falla(err.code === '23505' ? 'Ese artículo ya existe en esa categoría.'
                : err.code === '23514' ? 'El peso debe ser 0 o más.'
                    : 'No se pudo guardar. Revisa la conexión e intenta de nuevo.');
        }
        $('#cfgArtPesoDialogo').close();
        aviso.mostrar(f ? `"${nombre}" actualizado.` : `"${nombre}" agregado con ${kilos(peso)}.`);
        cargar();
    });

    enSeccion('#cfgArtPesoTabla').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-accion]');
        if (!b) return;
        const f = pesos.find((x) => x.id === Number(b.dataset.id));
        if (!f) return;
        if (b.dataset.accion === 'editar') abrirPeso(f);
        if (b.dataset.accion === 'eliminar') {
            pedirConfirmacion(`¿Eliminar "${f.nombre}" (${kilos(f.peso_kg)}) de los pesos? Los pedidos que ya lo usaron no cambian. `
                + '(Para ocultarlo sin borrarlo, desactívalo.)', async () => {
                const { error } = await db.from('articulos_catalogo').delete().eq('id', f.id);
                if (error) {
                    console.error('Error al eliminar el peso:', error);
                    aviso.mostrar('No se pudo eliminar. Revisa la conexión.', 'error');
                    return;
                }
                aviso.mostrar(`"${f.nombre}" eliminado.`);
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
        ['#cfgArtDialogo', '#cfgArtCatDialogo', '#cfgArtPesoDialogo'].forEach((s) => { const d = $(s); if (d && d.open) d.close(); });
    };
});
