/* ==================================================
   CONFIGURACIÓN -> MÓDULO PEDIDOS
   ACACHETE LOGISTICS

   Lo carga js/secciones/configuracion.js la primera vez que se abre la
   tarjeta "Pedidos" (#configuracion?modulo=pedidos).
   Tablas: sql/14_pedidos.sql. Diseño: PROPUESTA-ESTRUCTURADA-V2.md, sección 31.

   Cómo está hecho: cada lista (actividades, tarifas, descuentos...) es un
   "CATÁLOGO" descrito en CATALOGOS más abajo: qué tabla usa, qué columnas
   muestra, qué campos tiene su formulario y quién puede cambiarlo. Con esa
   descripción se arma sola su tarjeta, su tabla y su ventana
   (#cfgPedDialogo, la misma para todas).

   Para agregar una lista nueva: una entrada más en CATALOGOS.

   Además (tabla "configuracion", sql/15_codigos_pedido.sql):
     - Número de pedido: automático (P-000001...) o manual (lo escribe el empleado).
     - Código de respaldo: número aleatorio y/o últimos 4 dígitos del teléfono
       (se pueden marcar los dos).

   Permisos (sección 31.8):
     - ACTIVIDADES de la empresa y CATEGORÍAS DE MERCADERÍA: SOLO el
       Administrador (ve y cambia). (Pendiente: también el rol Desarrollador.)
     - Administrador y Admin G1: todo lo demás.
     - Admin G2: tarifas y descuentos de SU región (y de sus tiendas);
       lo demás lo ve sin poder cambiarlo.
   ⚠ Lo controla la página; la regla real llega en la Fase 7.
   ================================================== */

// Símbolo de la moneda que se muestra en las tarifas
const CFG_MONEDA = '¢';

registrarModuloConfig('pedidos', (seccion, ctx) => {
    const { zona, aviso, pedirConfirmacion, esGeneral, regionG2 } = ctx;
    const $ = (selector) => zona.querySelector(selector);

    // ---------- Elementos ----------
    const contenedor  = seccion.querySelector('#cfgPedTarjetas');
    const faltaSql    = seccion.querySelector('#cfgPedFaltaSql');
    const dialogo     = $('#cfgPedDialogo');
    const form        = $('#cfgPedForm');
    const camposCaja  = $('#cfgPedCampos');
    const vistaPrevia = $('#cfgPedVistaPrevia');
    const errorCaja   = $('#cfgPedError');
    const botonGuardar = $('#cfgPedGuardar');

    // ---------- Datos de apoyo ----------
    let actividades = [];        // [{ codigo, nombre, ... }]
    let regiones = [];           // [{ codigo, nombre }]
    let tiendas = [];            // [{ id, codigo, nombre, region }]
    let tiendasActividades = []; // [{ tienda_id, actividad }]
    const filas = {};            // nombre del catálogo -> filas cargadas
    const faltaSqlDe = {};       // nombre del catálogo -> true si falta ejecutar su SQL
    let editando = null;         // { nombre, fila } (fila = null si es nuevo)

    // ==================================================
    // AYUDAS
    // ==================================================

    // 12.5 -> "Q12.50"
    const dinero = (n) => `${CFG_MONEDA}${Number(n || 0).toFixed(2)}`;
    // 2 -> "2 kg" (sin decimales de sobra)
    const kilos = (n) => `${Number(n || 0)} kg`;

    const nombreActividad = (codigo) => (actividades.find((a) => a.codigo === codigo) || {}).nombre || codigo;
    const nombreRegion = (codigo) => {
        const r = regiones.find((x) => x.codigo === codigo);
        return r ? `${r.nombre} (${r.codigo})` : codigo;
    };
    const nombreTienda = (id) => {
        const t = tiendas.find((x) => x.id === id);
        return t ? `${t.codigo} · ${t.nombre}` : 'Tienda eliminada';
    };
    const regionDeTienda = (id) => (tiendas.find((t) => t.id === id) || {}).region;
    const categoriaPorId = (id) => (filas.categorias || []).find((c) => c.id === id);
    const nombreCategoria = (id) => (categoriaPorId(id) || {}).nombre || 'Sin categoría';
    const ordenCategoria = (id) => (categoriaPorId(id) || {}).orden ?? 999;

    // Regiones y tiendas que puede elegir el usuario (G2: solo las suyas)
    const regionesMias = () => (regionG2 ? regiones.filter((r) => r.codigo === regionG2) : regiones);
    const tiendasMias = () => (regionG2 ? tiendas.filter((t) => t.region === regionG2) : tiendas);

    // ¿La fila (tarifa o descuento) es de la región del Admin G2?
    const esDeMiRegion = (f) => !!regionG2 && (f.region === regionG2 || (!!f.tienda_id && regionDeTienda(f.tienda_id) === regionG2));

    const etiquetaEstado = (activo) => (activo
        ? crearCeldaEtiqueta('Activa', 'etiqueta-verde')
        : crearCeldaEtiqueta('Inactiva', 'etiqueta-gris'));

    // Celda con icono + texto
    function celdaIcono(icono, texto) {
        const td = document.createElement('td');
        const i = document.createElement('i');
        i.className = `bi ${icono} cfg-icono-fila`;
        td.append(i, ` ${texto}`);
        return td;
    }

    // Costo de envío con una tarifa (misma fórmula que usará Pedidos, sección 31.5)
    function calcularEnvio(t, pesoKg, montoCompra = 0) {
        if (t.envio_gratis_desde != null && t.envio_gratis_desde !== '' && montoCompra >= Number(t.envio_gratis_desde)) return 0;
        const adicional = Math.max(0, pesoKg - Number(t.kg_incluidos || 0));
        return Number(t.cargo_fijo || 0) + Number(t.minimo || 0) + adicional * Number(t.precio_kg || 0);
    }

    // ==================================================
    // CATÁLOGOS
    // Cada uno describe una lista:
    //   titulo, texto, icono      -> encabezado de su tarjeta
    //   tabla, clave, select, orden, filtro(q) -> cómo se lee de Supabase
    //   columnas: [[título, (fila) => texto | <td>], ...]
    //   campos:   formulario de la ventana (ver construirCampos)
    //   fijos:    valores que se guardan siempre (ej. { actividad: 'tienda' })
    //   preparar(valores, fila) -> objeto a guardar, o texto de error
    //   despuesDeGuardar(fila, valores) -> tareas extra (ej. tiendas de una actividad)
    //   mostrar() -> false = la tarjeta no aparece para este rol
    //   visible(fila), puedeCrear(), puedeEditar(fila), puedeEliminar(fila)
    //   textoEliminar(fila), duplicado -> mensajes
    //   vistaPrevia(valores) -> texto de ejemplo bajo el formulario
    // ==================================================

    const soloGeneral = () => esGeneral;

    const CATALOGOS = {

        // ---------- Actividades ----------
        actividades: {
            titulo: 'Actividades',
            texto: 'Servicios que ofrece la empresa y en qué tiendas. Una tienda sin actividades marcadas ofrece todas las activas.',
            icono: 'bi-diagram-3',
            tabla: 'actividades', clave: 'codigo', select: 'codigo, nombre, descripcion, icono, usa_bodega, activa, orden', orden: 'orden',
            singular: 'actividad',
            columnas: [
                ['Actividad', (f) => celdaIcono(f.icono, f.nombre)],
                ['Descripción', (f) => f.descripcion],
                ['Estado', (f) => etiquetaEstado(f.activa)],
                ['Tiendas', (f) => {
                    const n = tiendasActividades.filter((ta) => ta.actividad === f.codigo).length;
                    return n ? plural(n, 'tienda', 'tiendas') : 'Todas';
                }],
            ],
            campos: [
                { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, max: 60 },
                { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', max: 150, ancho: true },
                { nombre: 'activa', etiqueta: 'Activa (se puede elegir al crear pedidos)', tipo: 'si_no', porDefecto: true },
                { nombre: 'usa_bodega', etiqueta: 'Usa recepción en bodega', tipo: 'si_no' },
                {
                    nombre: 'tiendas', etiqueta: 'Tiendas que la ofrecen (ninguna marcada = todas)', tipo: 'casillas', virtual: true,
                    opciones: () => tiendas.map((t) => [String(t.id), `${t.codigo} · ${t.nombre}`]),
                    valorInicial: (f) => tiendasActividades.filter((ta) => ta.actividad === f.codigo).map((ta) => String(ta.tienda_id)),
                },
            ],
            // Guarda qué tiendas la ofrecen: borra las anteriores y pone las marcadas
            async despuesDeGuardar(fila, valores) {
                const r = await db.from('tiendas_actividades').delete().eq('actividad', fila.codigo);
                if (r.error || !valores.tiendas.length) return r;
                return db.from('tiendas_actividades').insert(valores.tiendas.map((id) => ({ tienda_id: Number(id), actividad: fila.codigo })));
            },
            // La actividad de la empresa SOLO la ve y la cambia el Administrador
            // (G1 y G2 no ven esta tarjeta)
            mostrar: () => esAdministrador(), // js/sesion.js
            // Las actividades nuevas necesitan su formulario en Pedidos: por ahora solo se modifican
            puedeCrear: () => false,
            puedeEditar: () => esAdministrador(),
            puedeEliminar: () => false,
        },

        // ---------- Tarifas ----------
        tarifas: {
            titulo: 'Tarifas',
            texto: 'Cobro del envío por actividad. Prioridad: tienda → región → general.',
            icono: 'bi-cash-coin',
            tabla: 'tarifas', clave: 'id',
            select: 'id, actividad, region, tienda_id, cargo_fijo, minimo, kg_incluidos, precio_kg, precio_km, envio_gratis_desde',
            singular: 'tarifa',
            columnas: [
                ['Actividad', (f) => nombreActividad(f.actividad)],
                ['Aplica a', (f) => {
                    if (f.tienda_id) return crearCeldaEtiqueta(nombreTienda(f.tienda_id), 'etiqueta-azul');
                    if (f.region) return crearCeldaEtiqueta(`Región ${nombreRegion(f.region)}`, 'etiqueta-turquesa');
                    return crearCeldaEtiqueta('General', 'etiqueta-gris');
                }],
                ['Envío fijo', (f) => dinero(f.cargo_fijo)],
                ['Mínimo', (f) => `${dinero(f.minimo)} (cubre ${kilos(f.kg_incluidos)})`],
                ['Kg adicional', (f) => dinero(f.precio_kg)],
                ['Envío gratis desde', (f) => (f.envio_gratis_desde == null ? 'Nunca' : dinero(f.envio_gratis_desde))],
            ],
            campos: [
                { nombre: 'actividad', etiqueta: 'Actividad', tipo: 'opciones', requerido: true, soloAlCrear: true,
                  opciones: () => actividades.map((a) => [a.codigo, a.nombre]) },
                { nombre: 'alcance', etiqueta: 'Aplica a', tipo: 'opciones', requerido: true, soloAlCrear: true, virtual: true,
                  // La general ya existe (una por actividad): al crear solo región o tienda
                  opciones: (f) => (f && !f.region && !f.tienda_id)
                      ? [['general', 'General (todas las tiendas)']]
                      : [['region', 'Una región'], ['tienda', 'Una tienda']],
                  valorInicial: (f) => (f.tienda_id ? 'tienda' : f.region ? 'region' : 'general') },
                { nombre: 'region', etiqueta: 'Región', tipo: 'opciones', requerido: true, soloAlCrear: true,
                  opciones: () => regionesMias().map((r) => [r.codigo, `${r.nombre} (${r.codigo})`]),
                  visible: (v) => v.alcance === 'region' },
                { nombre: 'tienda_id', etiqueta: 'Tienda', tipo: 'opciones', requerido: true, soloAlCrear: true,
                  opciones: () => tiendasMias().map((t) => [String(t.id), `${t.codigo} · ${t.nombre}`]),
                  valorInicial: (f) => (f.tienda_id ? String(f.tienda_id) : ''),
                  visible: (v) => v.alcance === 'tienda' },
                { nombre: 'cargo_fijo', etiqueta: `Envío fijo (${CFG_MONEDA})`, tipo: 'numero', min: 0, porDefecto: 0,
                  ayuda: 'Se cobra en todos los pedidos (mientras no haya cobro por distancia).' },
                { nombre: 'minimo', etiqueta: `Mínimo (${CFG_MONEDA})`, tipo: 'numero', min: 0, porDefecto: 0 },
                { nombre: 'kg_incluidos', etiqueta: 'Kg que cubre el mínimo', tipo: 'numero', min: 0, porDefecto: 0,
                  ayuda: 'El peso que pase de aquí se cobra como kg adicional.' },
                { nombre: 'precio_kg', etiqueta: `Precio por kg adicional (${CFG_MONEDA})`, tipo: 'numero', min: 0, porDefecto: 0 },
                { nombre: 'envio_gratis_desde', etiqueta: `Envío gratis desde (${CFG_MONEDA} de compra)`, tipo: 'numero', min: 0,
                  ayuda: 'Vacío = nunca es gratis.' },
                { nombre: 'precio_km', etiqueta: `Precio por km (${CFG_MONEDA})`, tipo: 'numero', min: 0, porDefecto: 0,
                  ayuda: 'Se usará cuando se integre Google Maps.' },
            ],
            preparar(v, fila) {
                const numeros = {
                    cargo_fijo: v.cargo_fijo || 0, minimo: v.minimo || 0, kg_incluidos: v.kg_incluidos || 0,
                    precio_kg: v.precio_kg || 0, precio_km: v.precio_km || 0,
                    envio_gratis_desde: v.envio_gratis_desde === '' ? null : v.envio_gratis_desde,
                    actualizado_en: new Date().toISOString(),
                };
                if (fila) return numeros; // al modificar no cambia la actividad ni a quién aplica
                return {
                    ...numeros,
                    actividad: v.actividad,
                    region: v.alcance === 'region' ? v.region : null,
                    tienda_id: v.alcance === 'tienda' ? Number(v.tienda_id) : null,
                };
            },
            vistaPrevia(v) {
                const t = { ...v, envio_gratis_desde: v.envio_gratis_desde === '' ? null : v.envio_gratis_desde };
                const ej = [1, 4, 8].map((kg) => `${kg} kg → ${dinero(calcularEnvio(t, kg))}`).join(' · ');
                const gratis = t.envio_gratis_desde == null ? '' : ` · compras desde ${dinero(t.envio_gratis_desde)}: gratis`;
                return `Ejemplo: ${ej}${gratis}`;
            },
            duplicado: 'Ya existe una tarifa de esa actividad para ese lugar. Modifícala desde la lista.',
            textoEliminar: (f) => `¿Quitar la tarifa de ${nombreActividad(f.actividad)} para ${f.tienda_id ? nombreTienda(f.tienda_id) : `la región ${nombreRegion(f.region)}`}? Volverá a usar la general.`,
            // G2 ve la general (sin cambiarla) y las de su región
            visible: (f) => !regionG2 || (!f.region && !f.tienda_id) || esDeMiRegion(f),
            puedeCrear: () => esGeneral || !!regionG2,
            puedeEditar: (f) => esGeneral || esDeMiRegion(f),
            puedeEliminar: (f) => (!!f.region || !!f.tienda_id) && (esGeneral || esDeMiRegion(f)),
            ordenar: (a, b) => (a.actividad.localeCompare(b.actividad)) ||
                ((a.region || a.tienda_id ? 1 : 0) - (b.region || b.tienda_id ? 1 : 0)) ||
                ((a.tienda_id ? 1 : 0) - (b.tienda_id ? 1 : 0)),
        },

        // ---------- Descuentos ----------
        descuentos: {
            titulo: 'Descuentos',
            texto: 'Descuentos pre-establecidos. El empleado elige uno de esta lista (máximo 1 por pedido); no escribe precios a mano.',
            icono: 'bi-percent',
            tabla: 'descuentos', clave: 'id', select: 'id, nombre, tipo, valor, actividad, region, activo', orden: 'nombre',
            singular: 'descuento',
            columnas: [
                ['Descuento', (f) => f.nombre],
                ['Valor', (f) => (f.tipo === 'porcentaje' ? `${Number(f.valor)} %` : dinero(f.valor))],
                ['Actividad', (f) => (f.actividad ? nombreActividad(f.actividad) : 'Todas')],
                ['Región', (f) => (f.region ? nombreRegion(f.region) : 'Todas')],
                ['Estado', (f) => etiquetaEstado(f.activo)],
            ],
            campos: [
                { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, max: 60, ayuda: 'Ej. "Cliente frecuente".' },
                { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'opciones', requerido: true, porDefecto: 'porcentaje',
                  opciones: () => [['porcentaje', 'Porcentaje (%)'], ['monto', `Monto fijo (${CFG_MONEDA})`]] },
                { nombre: 'valor', etiqueta: 'Valor', tipo: 'numero', requerido: true, min: 0.01 },
                { nombre: 'actividad', etiqueta: 'Actividad', tipo: 'opciones',
                  opciones: () => [['', 'Todas'], ...actividades.map((a) => [a.codigo, a.nombre])] },
                { nombre: 'region', etiqueta: 'Región', tipo: 'opciones',
                  // G2 solo crea descuentos de su región
                  opciones: () => (regionG2 ? [] : [['', 'Todas']]).concat(regionesMias().map((r) => [r.codigo, `${r.nombre} (${r.codigo})`])) },
                { nombre: 'activo', etiqueta: 'Activo (se puede elegir en los pedidos)', tipo: 'si_no', porDefecto: true },
            ],
            preparar(v) {
                if (v.tipo === 'porcentaje' && v.valor > 100) return 'Un porcentaje no puede pasar de 100.';
                return { nombre: v.nombre, tipo: v.tipo, valor: v.valor, actividad: v.actividad || null, region: v.region || null, activo: v.activo };
            },
            textoEliminar: (f) => `¿Eliminar el descuento "${f.nombre}"? Los pedidos que ya lo usaron conservan su monto. (Para dejar de usarlo sin borrarlo, desactívalo.)`,
            visible: (f) => !regionG2 || !f.region || f.region === regionG2,
            puedeCrear: () => esGeneral || !!regionG2,
            puedeEditar: (f) => esGeneral || (!!regionG2 && f.region === regionG2),
            puedeEliminar: (f) => esGeneral || (!!regionG2 && f.region === regionG2),
        },

        // ---------- Categorías de mercadería ----------
        categorias: {
            titulo: 'Categorías de mercadería',
            texto: 'Casillas de "Entregas de tienda". Conteo = cajas, bolsas, hieleras y alcohol. Artículos = lista con nombre y peso.',
            icono: 'bi-ui-checks',
            tabla: 'categorias_mercaderia', clave: 'id', select: 'id, nombre, tipo, icono, activa, orden', orden: 'orden',
            filtro: (q) => q.eq('actividad', 'tienda'),
            fijos: { actividad: 'tienda' },
            singular: 'categoría',
            columnas: [
                ['Categoría', (f) => celdaIcono(f.icono, f.nombre)],
                ['Tipo', (f) => (f.tipo === 'conteo' ? 'Conteo (cajas, bolsas, hieleras)' : 'Artículos con peso')],
                ['Estado', (f) => etiquetaEstado(f.activa)],
            ],
            campos: [
                { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, max: 40 },
                { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'opciones', requerido: true, porDefecto: 'articulos',
                  opciones: () => [['articulos', 'Artículos con peso (ej. línea blanca)'], ['conteo', 'Conteo (cajas, bolsas, hieleras, alcohol)']] },
                { nombre: 'icono', etiqueta: 'Icono', tipo: 'opciones', porDefecto: 'bi-box',
                  opciones: () => [['bi-box', 'Caja'], ['bi-basket', 'Canasta'], ['bi-snow', 'Frío / línea blanca'],
                      ['bi-tv', 'Electrónica'], ['bi-lamp', 'Hogar / muebles'], ['bi-capsule', 'Farmacia'], ['bi-bag', 'Bolsa']] },
                { nombre: 'orden', etiqueta: 'Orden', tipo: 'numero', min: 0, porDefecto: 0, entero: true },
                { nombre: 'activa', etiqueta: 'Activa (aparece como casilla en los pedidos)', tipo: 'si_no', porDefecto: true },
            ],
            duplicado: 'Ya existe una categoría con ese nombre.',
            textoEliminar: (f) => `¿Eliminar la categoría "${f.nombre}"? También se borran sus artículos frecuentes. Los pedidos que ya la usaron conservan el nombre. (Para ocultarla sin borrarla, desactívala.)`,
            // Igual que Actividades: SOLO el Administrador la ve y la cambia
            // (G1 y G2 no ven esta tarjeta; los artículos frecuentes sí los administra G1)
            mostrar: () => esAdministrador(),
            puedeCrear: () => esAdministrador(),
            puedeEditar: () => esAdministrador(),
            puedeEliminar: () => esAdministrador(),
        },

        // ---------- Artículos frecuentes (sql/16) ----------
        // Al marcar Línea blanca o Electrónica en un pedido, el artículo se
        // elige de esta lista y el peso se llena solo (se puede corregir).
        articulos: {
            titulo: 'Artículos frecuentes',
            texto: 'Artículos de las categorías con lista (línea blanca, electrónica...) y su peso aproximado. Al registrar un pedido, el peso se llena solo.',
            icono: 'bi-list-check',
            sql: '16_articulos_catalogo.sql', // si falta, solo esta tarjeta lo avisa
            tabla: 'articulos_catalogo', clave: 'id', select: 'id, categoria_id, nombre, peso_kg, activo, orden', orden: 'orden',
            singular: 'artículo',
            // Agrupados por categoría (en el orden de las categorías)
            agrupar: (f) => nombreCategoria(f.categoria_id),
            ordenar: (a, b) => (ordenCategoria(a.categoria_id) - ordenCategoria(b.categoria_id)) || (a.orden - b.orden) || a.nombre.localeCompare(b.nombre),
            columnas: [
                ['Artículo', (f) => f.nombre],
                ['Peso aprox.', (f) => kilos(f.peso_kg)],
                ['Estado', (f) => etiquetaEstado(f.activo)],
            ],
            campos: [
                { nombre: 'categoria_id', etiqueta: 'Categoría', tipo: 'opciones', requerido: true,
                  // Solo las categorías de tipo "artículos"
                  opciones: () => (filas.categorias || []).filter((c) => c.tipo === 'articulos').map((c) => [String(c.id), c.nombre]),
                  valorInicial: (f) => String(f.categoria_id) },
                { nombre: 'nombre', etiqueta: 'Artículo', tipo: 'texto', requerido: true, max: 60, ayuda: 'Ej. "Refrigeradora".' },
                { nombre: 'peso_kg', etiqueta: 'Peso aproximado (kg)', tipo: 'numero', requerido: true, min: 0 },
                { nombre: 'orden', etiqueta: 'Orden', tipo: 'numero', min: 0, porDefecto: 0, entero: true },
                { nombre: 'activo', etiqueta: 'Activo (aparece al registrar pedidos)', tipo: 'si_no', porDefecto: true },
            ],
            preparar: (v) => ({ categoria_id: Number(v.categoria_id), nombre: v.nombre, peso_kg: v.peso_kg, orden: v.orden || 0, activo: v.activo }),
            duplicado: 'Ese artículo ya existe en esa categoría.',
            textoEliminar: (f) => `¿Eliminar "${f.nombre}" del catálogo? Los pedidos que ya lo usaron no cambian. (Para ocultarlo sin borrarlo, desactívalo.)`,
            puedeCrear: soloGeneral,
            puedeEditar: soloGeneral,
            puedeEliminar: soloGeneral,
        },

        // ---------- Tamaños de bulto ----------
        tamanos: {
            titulo: 'Tamaños de bulto',
            texto: 'Solo medidas de referencia (no cambian el precio).',
            icono: 'bi-rulers',
            tabla: 'tamanos_bulto', clave: 'codigo', select: 'codigo, nombre, largo_cm, ancho_cm, alto_cm, orden', orden: 'orden',
            singular: 'tamaño',
            columnas: [
                ['Tamaño', (f) => `${f.codigo} · ${f.nombre}`],
                ['Medidas (cm)', (f) => [f.largo_cm, f.ancho_cm, f.alto_cm].every((x) => x != null)
                    ? `${Number(f.largo_cm)} × ${Number(f.ancho_cm)} × ${Number(f.alto_cm)}` : '—'],
            ],
            campos: [
                { nombre: 'codigo', etiqueta: 'Código', tipo: 'texto', requerido: true, max: 4, soloAlCrear: true, mayusculas: true, ayuda: 'Ej. S, M, L, XL.' },
                { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, max: 30 },
                { nombre: 'largo_cm', etiqueta: 'Largo (cm)', tipo: 'numero', min: 0 },
                { nombre: 'ancho_cm', etiqueta: 'Ancho (cm)', tipo: 'numero', min: 0 },
                { nombre: 'alto_cm', etiqueta: 'Alto (cm)', tipo: 'numero', min: 0 },
                { nombre: 'orden', etiqueta: 'Orden', tipo: 'numero', min: 0, porDefecto: 0, entero: true },
            ],
            duplicado: 'Ya existe un tamaño con ese código.',
            textoEliminar: (f) => `¿Eliminar el tamaño ${f.codigo} (${f.nombre})?`,
            puedeCrear: soloGeneral,
            puedeEditar: soloGeneral,
            puedeEliminar: soloGeneral,
        },

        // ---------- Motivos de retraso ----------
        motivos: {
            titulo: 'Motivos de retraso',
            texto: 'Lista que elige el piloto al cerrar una entrega con retraso.',
            icono: 'bi-hourglass-split',
            tabla: 'motivos_retraso', clave: 'id', select: 'id, nombre, activo, orden', orden: 'orden',
            singular: 'motivo',
            columnas: [
                ['Motivo', (f) => f.nombre],
                ['Estado', (f) => etiquetaEstado(f.activo)],
            ],
            campos: [
                { nombre: 'nombre', etiqueta: 'Motivo', tipo: 'texto', requerido: true, max: 60 },
                { nombre: 'orden', etiqueta: 'Orden', tipo: 'numero', min: 0, porDefecto: 0, entero: true },
                { nombre: 'activo', etiqueta: 'Activo', tipo: 'si_no', porDefecto: true },
            ],
            duplicado: 'Ese motivo ya existe.',
            textoEliminar: (f) => `¿Eliminar el motivo "${f.nombre}"? (Para ocultarlo sin borrarlo, desactívalo.)`,
            puedeCrear: soloGeneral,
            puedeEditar: soloGeneral,
            puedeEliminar: soloGeneral,
        },
    };

    // ==================================================
    // TARJETAS Y TABLAS
    // ==================================================

    // Arma la tarjeta de cada catálogo (una vez)
    const cuerpos = {}; // nombre -> <tbody>

    function crearTarjetas() {
        contenedor.replaceChildren();
        Object.entries(CATALOGOS).forEach(([nombre, cat]) => {
            if (cat.mostrar && !cat.mostrar()) return; // tarjeta oculta para este rol
            const tarjeta = document.createElement('div');
            tarjeta.className = 'tarjeta cfg-tarjeta';

            // Encabezado: título, texto y botón "Agregar"
            const cabecera = document.createElement('div');
            cabecera.className = 'cfg-tarjeta-cabecera';
            const textos = document.createElement('div');
            const titulo = document.createElement('h3');
            titulo.className = 'cfg-tarjeta-titulo';
            const icono = document.createElement('i');
            icono.className = `bi ${cat.icono}`;
            titulo.append(icono, ` ${cat.titulo}`);
            const texto = document.createElement('p');
            texto.className = 'cfg-tarjeta-texto';
            texto.textContent = cat.texto;
            textos.append(titulo, texto);
            cabecera.appendChild(textos);

            if (cat.puedeCrear()) {
                const agregar = document.createElement('button');
                agregar.type = 'button';
                agregar.className = 'boton boton-secundario boton-chico';
                agregar.dataset.agregar = nombre;
                agregar.innerHTML = '<i class="bi bi-plus-lg"></i> <span></span>';
                agregar.querySelector('span').textContent = `Agregar ${cat.singular}`;
                cabecera.appendChild(agregar);
            }

            // Tabla
            const caja = document.createElement('div');
            caja.className = 'tabla-caja';
            const tabla = document.createElement('table');
            tabla.className = 'tabla cfg-tabla';
            const thead = document.createElement('thead');
            const tr = document.createElement('tr');
            cat.columnas.forEach(([t]) => {
                const th = document.createElement('th');
                th.textContent = t;
                tr.appendChild(th);
            });
            if (tieneAcciones(cat)) {
                const th = document.createElement('th');
                th.className = 'tabla-col-acciones';
                th.textContent = 'Acciones';
                tr.appendChild(th);
            }
            thead.appendChild(tr);
            const tbody = document.createElement('tbody');
            tabla.append(thead, tbody);
            caja.appendChild(tabla);
            cuerpos[nombre] = tbody;

            tarjeta.append(cabecera, caja);
            contenedor.appendChild(tarjeta);
        });
    }

    // ¿Este usuario puede modificar o eliminar algo de esta lista?
    // (G2 puede en tarifas y descuentos aunque no en todas las filas)
    const tieneAcciones = (cat) => esGeneral || (!!regionG2 && cat.puedeCrear());

    function dibujar(nombre) {
        const cat = CATALOGOS[nombre];
        const tbody = cuerpos[nombre];
        if (!tbody) return; // su tarjeta no se muestra a este rol
        tbody.replaceChildren();

        let lista = (filas[nombre] || []).filter((f) => !cat.visible || cat.visible(f));
        if (cat.ordenar) lista = [...lista].sort(cat.ordenar);

        const columnas = cat.columnas.length + (tieneAcciones(cat) ? 1 : 0);
        if (faltaSqlDe[nombre]) {
            tbody.appendChild(crearFilaVacia(`Falta ejecutar sql/${cat.sql} en Supabase.`, columnas));
            return;
        }
        if (!lista.length) {
            tbody.appendChild(crearFilaVacia(`No hay ${cat.titulo.toLowerCase()} registrados.`, columnas));
            return;
        }

        let grupoActual = null;
        lista.forEach((f) => {
            // Título de grupo cuando cambia (ej. "Línea blanca", "Electrónica")
            if (cat.agrupar) {
                const grupo = cat.agrupar(f);
                if (grupo !== grupoActual) {
                    grupoActual = grupo;
                    const cuenta = lista.filter((x) => cat.agrupar(x) === grupo).length;
                    tbody.appendChild(crearFilaGrupo(grupo, null, plural(cuenta, cat.singular, `${cat.singular}s`), columnas));
                }
            }
            const tr = document.createElement('tr');
            cat.columnas.forEach(([, valor]) => {
                const v = valor(f);
                tr.appendChild(v instanceof HTMLElement ? v : crearCelda(v));
            });
            if (tieneAcciones(cat)) {
                const botones = [];
                const id = f[cat.clave];
                if (cat.puedeEditar(f)) botones.push(crearBotonIcono('editar', id, 'bi-pencil', `Modificar ${cat.singular}`));
                if (cat.puedeEliminar(f)) botones.push(crearBotonIcono('eliminar', id, 'bi-trash3', `Eliminar ${cat.singular}`));
                botones.forEach((b) => { b.dataset.catalogo = nombre; });
                tr.appendChild(crearCeldaAcciones(...botones));
            }
            tbody.appendChild(tr);
        });
    }

    // ==================================================
    // CARGAR DATOS
    // ==================================================

    async function cargarTodo() {
        const nombres = Object.keys(CATALOGOS);
        const consultas = nombres.map((nombre) => {
            const cat = CATALOGOS[nombre];
            let q = db.from(cat.tabla).select(cat.select);
            if (cat.filtro) q = cat.filtro(q);
            if (cat.orden) q = q.order(cat.orden);
            return q;
        });

        const [act, reg, tie, ta, ...resultados] = await Promise.all([
            db.from('actividades').select('codigo, nombre').order('orden'),
            db.from('regiones').select('codigo, nombre').order('nombre'),
            db.from('tiendas').select('id, codigo, nombre, region').order('codigo'),
            db.from('tiendas_actividades').select('tienda_id, actividad'),
            ...consultas,
        ]);

        // Una lista de un SQL posterior (ej. sql/16) que aún no se ejecutó:
        // solo su tarjeta avisa, el resto funciona
        const tablaFalta = (e) => !!e && (e.code === 'PGRST205' || e.code === '42P01');
        nombres.forEach((nombre, i) => {
            faltaSqlDe[nombre] = !!CATALOGOS[nombre].sql && tablaFalta(resultados[i].error);
            if (faltaSqlDe[nombre]) resultados[i] = { data: [], error: null };
        });

        const error = [act, reg, tie, ta, ...resultados].map((r) => r.error).find(Boolean);
        if (error) {
            console.error('Error al cargar la configuración de pedidos:', error);
            const falta = error.code === 'PGRST205' || error.code === '42P01';
            faltaSql.hidden = !falta;
            contenedor.hidden = falta;
            if (!falta) aviso.mostrar('No se pudo cargar la configuración de pedidos. Revisa la conexión.', 'error');
            return;
        }
        faltaSql.hidden = true;
        contenedor.hidden = false;

        actividades = act.data;
        regiones = reg.data;
        tiendas = tie.data;
        tiendasActividades = ta.data;
        nombres.forEach((nombre, i) => { filas[nombre] = resultados[i].data; });
        nombres.forEach(dibujar);
    }

    // ==================================================
    // VENTANA GENÉRICA
    // Tipos de campo: texto, numero, opciones, si_no, casillas.
    // Opciones de un campo:
    //   requerido, soloAlCrear (bloqueado al modificar), virtual (no es
    //   columna de la tabla), visible(valores), opciones(fila), porDefecto,
    //   valorInicial(fila), min, max, entero, mayusculas, ayuda, ancho
    // ==================================================

    // Crea los campos del formulario según el catálogo
    function construirCampos(cat, fila) {
        camposCaja.replaceChildren();
        cat.campos.forEach((c) => {
            const caja = document.createElement('div');
            caja.className = c.tipo === 'casillas' || c.ancho ? 'campo campo-ancho' : 'campo';
            caja.dataset.caja = c.nombre;

            const inicial = fila
                ? (c.valorInicial ? c.valorInicial(fila) : fila[c.nombre])
                : (c.porDefecto !== undefined ? c.porDefecto : (c.tipo === 'casillas' ? [] : ''));
            const bloqueado = !!fila && !!c.soloAlCrear;
            const idCampo = `cfgPed_${c.nombre}`;

            if (c.tipo === 'si_no') {
                // Casilla sola con su texto al lado
                const label = document.createElement('label');
                label.className = 'cfg-si-no';
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.dataset.campo = c.nombre;
                input.checked = !!inicial;
                label.append(input, c.etiqueta);
                caja.appendChild(label);
            } else {
                const etiqueta = document.createElement('label');
                etiqueta.className = 'campo-etiqueta';
                etiqueta.htmlFor = idCampo;
                etiqueta.textContent = c.etiqueta + (c.requerido ? ' *' : '');
                caja.appendChild(etiqueta);

                if (c.tipo === 'casillas') {
                    const grupo = document.createElement('div');
                    grupo.className = 'cfg-casillas';
                    grupo.id = idCampo;
                    grupo.dataset.campo = c.nombre;
                    grupo.dataset.tipo = 'casillas';
                    const marcadas = new Set(inicial || []);
                    c.opciones(fila).forEach(([valor, texto]) => {
                        const label = document.createElement('label');
                        const casilla = document.createElement('input');
                        casilla.type = 'checkbox';
                        casilla.value = valor;
                        casilla.checked = marcadas.has(valor);
                        label.append(casilla, texto);
                        grupo.appendChild(label);
                    });
                    if (!grupo.children.length) grupo.textContent = 'No hay opciones.';
                    caja.appendChild(grupo);
                } else if (c.tipo === 'opciones') {
                    const select = document.createElement('select');
                    select.className = 'campo-input';
                    select.id = idCampo;
                    select.dataset.campo = c.nombre;
                    const opciones = c.opciones(fila);
                    if (c.requerido && !opciones.some(([v]) => v === '')) select.appendChild(new Option('Selecciona...', ''));
                    opciones.forEach(([valor, texto]) => select.appendChild(new Option(texto, valor)));
                    select.value = inicial == null ? '' : String(inicial);
                    // Si solo hay una opción (ej. la región del Admin G2), queda elegida
                    if (!fila && select.value === '' && opciones.length === 1) select.value = opciones[0][0];
                    select.disabled = bloqueado;
                    caja.appendChild(select);
                } else {
                    const input = document.createElement('input');
                    input.className = 'campo-input';
                    input.id = idCampo;
                    input.dataset.campo = c.nombre;
                    if (c.tipo === 'numero') {
                        input.type = 'number';
                        input.step = c.entero ? '1' : 'any';
                        if (c.min !== undefined) input.min = c.min;
                        if (c.max !== undefined) input.max = c.max;
                        input.value = inicial == null || inicial === '' ? '' : Number(inicial);
                    } else {
                        input.type = 'text';
                        if (c.max) input.maxLength = c.max;
                        input.value = inicial == null ? '' : inicial;
                        if (c.mayusculas) input.classList.add('cfg-placa');
                    }
                    input.disabled = bloqueado;
                    caja.appendChild(input);
                }
            }

            if (c.ayuda) {
                const ayuda = document.createElement('small');
                ayuda.className = 'campo-ayuda';
                ayuda.textContent = c.ayuda;
                caja.appendChild(ayuda);
            }
            camposCaja.appendChild(caja);
        });
    }

    // Lee los valores escritos: { nombre: valor }
    // texto -> string sin espacios de sobra | numero -> Number o '' | si_no -> true/false | casillas -> [valores]
    function leerValores(cat) {
        const valores = {};
        cat.campos.forEach((c) => {
            const el = camposCaja.querySelector(`[data-campo="${c.nombre}"]`);
            if (!el) return;
            if (c.tipo === 'si_no') valores[c.nombre] = el.checked;
            else if (c.tipo === 'casillas') valores[c.nombre] = [...el.querySelectorAll('input:checked')].map((x) => x.value);
            else if (c.tipo === 'numero') valores[c.nombre] = el.value === '' ? '' : Number(el.value);
            else {
                let v = el.value.trim();
                if (c.mayusculas) v = v.toUpperCase();
                valores[c.nombre] = v;
            }
        });
        return valores;
    }

    // Muestra u oculta campos según lo elegido, y actualiza el ejemplo
    function actualizarFormulario() {
        if (!editando) return;
        const cat = CATALOGOS[editando.nombre];
        const valores = leerValores(cat);
        cat.campos.forEach((c) => {
            const caja = camposCaja.querySelector(`[data-caja="${c.nombre}"]`);
            if (caja) caja.hidden = !!c.visible && !c.visible(valores);
        });
        vistaPrevia.hidden = !cat.vistaPrevia;
        if (cat.vistaPrevia) vistaPrevia.textContent = cat.vistaPrevia(valores);
    }

    form.addEventListener('input', actualizarFormulario);
    form.addEventListener('change', actualizarFormulario);

    function abrirDialogo(nombre, fila = null) {
        const cat = CATALOGOS[nombre];
        editando = { nombre, fila };
        errorCaja.textContent = '';
        $('#cfgPedTitulo').textContent = fila ? `Modificar ${cat.singular}` : `Agregar ${cat.singular}`;
        construirCampos(cat, fila);
        actualizarFormulario();
        dialogo.showModal();
        const primero = camposCaja.querySelector('input:not([disabled]), select:not([disabled])');
        if (primero) primero.focus();
    }

    $('#cfgPedCancelar').addEventListener('click', () => dialogo.close());
    dialogo.addEventListener('close', () => { editando = null; });

    // Revisa los campos visibles; devuelve un texto de error o null
    function validar(cat, valores) {
        for (const c of cat.campos) {
            if (c.visible && !c.visible(valores)) continue;
            const v = valores[c.nombre];
            if (c.requerido && (v === '' || v == null)) return `Completa "${c.etiqueta}".`;
            if (c.tipo === 'numero' && v !== '') {
                if (!Number.isFinite(v)) return `"${c.etiqueta}" debe ser un número.`;
                if (c.min !== undefined && v < c.min) return `"${c.etiqueta}" no puede ser menor que ${c.min}.`;
                if (c.max !== undefined && v > c.max) return `"${c.etiqueta}" no puede ser mayor que ${c.max}.`;
                if (c.entero && !Number.isInteger(v)) return `"${c.etiqueta}" debe ser un número entero.`;
            }
        }
        return null;
    }

    // Objeto a guardar cuando el catálogo no tiene preparar():
    // los campos visibles que son columnas (+ los fijos). Vacío -> null.
    function prepararPorDefecto(cat, valores, fila) {
        const datos = { ...(cat.fijos || {}) };
        cat.campos.forEach((c) => {
            if (c.virtual || (fila && c.soloAlCrear)) return;
            if (c.visible && !c.visible(valores)) return;
            const v = valores[c.nombre];
            datos[c.nombre] = v === '' ? null : v;
        });
        return datos;
    }

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (!editando) return;
        const { nombre, fila } = editando;
        const cat = CATALOGOS[nombre];
        if (fila ? !cat.puedeEditar(fila) : !cat.puedeCrear()) return;
        errorCaja.textContent = '';

        const valores = leerValores(cat);
        const errorValidacion = validar(cat, valores);
        if (errorValidacion) {
            errorCaja.textContent = errorValidacion;
            return;
        }
        const datos = cat.preparar ? cat.preparar(valores, fila) : prepararPorDefecto(cat, valores, fila);
        if (typeof datos === 'string') {
            errorCaja.textContent = datos;
            return;
        }

        botonGuardar.disabled = true;
        const { data, error } = fila
            ? await db.from(cat.tabla).update(datos).eq(cat.clave, fila[cat.clave]).select(cat.select).single()
            : await db.from(cat.tabla).insert(datos).select(cat.select).single();

        let errorFinal = error;
        if (!errorFinal && cat.despuesDeGuardar) {
            const extra = await cat.despuesDeGuardar(data, valores);
            errorFinal = extra && extra.error;
        }
        botonGuardar.disabled = false;

        if (errorFinal) {
            console.error(`Error al guardar (${nombre}):`, errorFinal);
            errorCaja.textContent = errorFinal.code === '23505' && cat.duplicado
                ? cat.duplicado
                : 'No se pudo guardar. Intenta de nuevo.';
            return;
        }
        dialogo.close();
        aviso.mostrar(fila ? 'Cambios guardados.' : `${cat.titulo}: agregado a la lista.`);
        cargarTodo();
    });

    // ---------- Botones de las tablas ----------
    contenedor.addEventListener('click', (evento) => {
        const agregar = evento.target.closest('button[data-agregar]');
        if (agregar) {
            abrirDialogo(agregar.dataset.agregar);
            return;
        }

        const boton = evento.target.closest('button[data-accion][data-catalogo]');
        if (!boton) return;
        const nombre = boton.dataset.catalogo;
        const cat = CATALOGOS[nombre];
        const fila = (filas[nombre] || []).find((f) => String(f[cat.clave]) === boton.dataset.id);
        if (!fila) return;

        if (boton.dataset.accion === 'editar' && cat.puedeEditar(fila)) abrirDialogo(nombre, fila);
        if (boton.dataset.accion === 'eliminar' && cat.puedeEliminar(fila)) {
            pedirConfirmacion(cat.textoEliminar(fila), async () => {
                const { error } = await db.from(cat.tabla).delete().eq(cat.clave, fila[cat.clave]);
                if (error) {
                    console.error(`Error al eliminar (${nombre}):`, error);
                    aviso.mostrar(error.code === '23503'
                        ? 'No se puede eliminar porque ya se usa en pedidos. Desactívalo en su lugar.'
                        : 'No se pudo eliminar.', 'error');
                    return;
                }
                aviso.mostrar('Eliminado.');
                cargarTodo();
            });
        }
    });

    // ==================================================
    // NÚMERO DE PEDIDO Y CÓDIGO DE RESPALDO (tabla configuracion, sql/15)
    //   numero_pedido   = "automatico" | "manual"
    //   codigo_respaldo = ["aleatorio"] | ["telefono"] | ["aleatorio", "telefono"]
    // Solo Administrador y Admin G1 los cambian; G2 los ve.
    // ==================================================

    const formNumero = seccion.querySelector('#cfgNumeroForm');
    const opcionesNumero = [...formNumero.querySelectorAll('input[name="cfgNumero"]')];
    const formCodigo = seccion.querySelector('#cfgCodigoForm');
    const opcionesCodigo = [...formCodigo.querySelectorAll('input[name="cfgCodigo"]')];
    const errorCodigo = seccion.querySelector('#cfgCodigoError');

    async function cargarOpcionesPedido() {
        const { data, error } = await db.from('configuracion').select('clave, valor')
            .in('clave', ['numero_pedido', 'codigo_respaldo']);
        if (error) {
            console.error('Error al cargar número de pedido / código de respaldo:', error);
            return;
        }
        const valor = (clave) => (data.find((f) => f.clave === clave) || {}).valor;

        const numero = valor('numero_pedido') || 'automatico';
        opcionesNumero.forEach((o) => { o.checked = o.value === numero; o.disabled = !esGeneral; });

        // Antes de sql/15 se guardaba como texto ("aleatorio"): se acepta igual
        let codigos = valor('codigo_respaldo') || ['aleatorio'];
        if (!Array.isArray(codigos)) codigos = [codigos];
        opcionesCodigo.forEach((o) => { o.checked = codigos.includes(o.value); o.disabled = !esGeneral; });
    }

    // Guarda una clave de "configuracion"
    const guardarOpcion = (clave, valor) => db.from('configuracion')
        .upsert({ clave, valor, actualizado_en: new Date().toISOString() });

    formNumero.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (!esGeneral) return;
        const elegido = opcionesNumero.find((o) => o.checked);
        if (!elegido) return;
        const { error } = await guardarOpcion('numero_pedido', elegido.value);
        if (error) {
            console.error('Error al guardar el número de pedido:', error);
            aviso.mostrar('No se pudo guardar cómo se numeran los pedidos.', 'error');
            return;
        }
        aviso.mostrar(elegido.value === 'manual'
            ? 'Número de pedido MANUAL: el empleado lo escribe al registrar el pedido.'
            : 'Número de pedido AUTOMÁTICO: P-000001, P-000002...');
    });

    formCodigo.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (!esGeneral) return;
        errorCodigo.textContent = '';
        const elegidos = opcionesCodigo.filter((o) => o.checked).map((o) => o.value);
        if (!elegidos.length) {
            errorCodigo.textContent = 'Marca al menos una opción.';
            return;
        }
        const { error } = await guardarOpcion('codigo_respaldo', elegidos);
        if (error) {
            console.error('Error al guardar el código de respaldo:', error);
            aviso.mostrar('No se pudo guardar el código de respaldo.', 'error');
            return;
        }
        aviso.mostrar(elegidos.length === 2
            ? 'Se aceptará el número aleatorio y también los últimos 4 dígitos del teléfono.'
            : elegidos[0] === 'telefono'
                ? 'Se usarán los últimos 4 dígitos del teléfono del cliente.'
                : 'Se usará un número aleatorio de 4 dígitos.');
    });

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================

    crearTarjetas();
    cargarTodo();
    cargarOpcionesPedido();

    return () => {
        if (dialogo.open) dialogo.close();
    };
});
