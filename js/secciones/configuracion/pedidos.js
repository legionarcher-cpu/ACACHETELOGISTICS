/* ==================================================
   CONFIGURACIÓN -> MÓDULO PEDIDOS
   ACACHETE LOGISTICS

   Lo carga js/secciones/configuracion.js la primera vez que se abre la
   tarjeta "Pedidos" (#configuracion?modulo=pedidos).
   Tablas: sql/00, sección 6. Guía: docs/secciones/configuracion.md.

   Cómo está hecho: cada lista (tarifas, descuentos, categorías...) es un
   "CATÁLOGO" descrito en CATALOGOS más abajo: qué tabla usa, qué columnas
   muestra, qué campos tiene su formulario y quién puede cambiarlo. Con esa
   descripción se arma sola su tarjeta, su tabla y su ventana
   (#cfgPedDialogo, la misma para todas).

   Para agregar una lista nueva: una entrada más en CATALOGOS.

   Además (tabla "configuracion", sql/00 sección 5):
     - Número de pedido: automático (P-000001...) o manual (lo escribe el empleado).
     - Código de respaldo: número aleatorio y/o últimos 4 dígitos del teléfono
       (se pueden marcar los dos).

   Permisos (sección 31.8):
     - CATEGORÍAS DE MERCADERÍA: SOLO el Administrador (ve y cambia).
       (Pendiente: también el rol Desarrollador.)
       Las ACTIVIDADES se movieron a su propia ventana: configuracion/actividades.js.
     - Administrador y Admin G1: todo lo demás.
     - Admin G2: tarifas y descuentos de SU región (y de sus tiendas);
       lo demás lo ve sin poder cambiarlo.
   ⚠ Lo controla la página; la regla real llega en la Fase 7.
   ================================================== */

// Símbolo de la moneda que se muestra en las tarifas
const CFG_MONEDA = '₡'; // colón costarricense

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
    // "Encomiendas · Línea blanca" (la misma categoría puede estar en dos actividades)
    const nombreCategoria = (id) => {
        const c = categoriaPorId(id);
        return c ? `${nombreActividad(c.actividad)} · ${c.nombre}` : 'Sin categoría';
    };
    // Orden: primero por actividad (su orden), luego por el orden de la categoría
    const ordenActividad = (codigo) => { const i = actividades.findIndex((a) => a.codigo === codigo); return i < 0 ? 99 : i; };
    const ordenCategoria = (id) => {
        const c = categoriaPorId(id);
        return c ? ordenActividad(c.actividad) * 1000 + (c.orden || 0) : 99999;
    };
    // ¿La fila es de una actividad que realiza la empresa? (empresas/empresas.js)
    const deLaEmpresa = (f) => !f.actividad || empresaTieneActividad(f.actividad);

    // Tipos de categoría (regla categorias_tipo_valido) y su explicación
    const TIPOS_CATEGORIA = {
        conteo:    'Conteo (cajas, bolsas, hieleras y peso aproximado)',
        articulos: 'Artículos con peso (del catálogo de pesos promedio)',
        bulto:     'Bultos (cantidad, tamaño y peso de cada uno)',
        documento: 'Documentos (solo cantidad; peso fijo por unidad)',
    };

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

    // Costo de envío con una tarifa: la MISMA fórmula de Pedidos y del Cotizador
    // (calcularEnvioTarifa en js/componentes.js, sección 31.5)
    const calcularEnvio = (t, pesoKg, montoCompra = 0, km = 0) => calcularEnvioTarifa(
        { ...t, envio_gratis_desde: t.envio_gratis_desde === '' ? null : t.envio_gratis_desde }, pesoKg, montoCompra, km).envio;

    // ¿A alguna actividad de la empresa le falta su tarifa general? (cada empresa tiene las suyas)
    const faltaTarifaGeneral = () => actividades.some((a) =>
        !((filas && filas.tarifas) || []).some((t) => t.actividad === a.codigo && !t.region && !t.tienda_id));

    // ¿La base ya tiene tarifas.km_incluidos? (sql/01, bloque 10). Las tarifas se leen con '*'.
    const tieneKmIncluidos = () => ((filas && filas.tarifas) || []).some((f) => 'km_incluidos' in f);

    // Una tarifa dicha en palabras (formulario de Tarifas y Simulador):
    //   Hasta 3 kg y 5 km: ₡2500.00
    //   Más de 3 kg: + ₡500.00 por cada kg sobre los 3 kg
    //   Más de 5 km: + ₡150.00 por cada km sobre los 5 km
    //   Ejemplo: 5 kg y 10 km → ₡2500.00 + 2 kg × ₡500.00 + 5 km × ₡150.00 = ₡4250.00
    function tarifaEnPalabras(t) {
        const n = (x) => Number(x || 0);
        const base = n(t.cargo_fijo) + n(t.minimo);
        const kgIncl = n(t.kg_incluidos);
        const porKg = n(t.precio_kg);
        const porKm = n(t.precio_km);
        const kmIncl = n(t.km_incluidos);
        const numTxt = (x) => x.toLocaleString('es-CR', { maximumFractionDigits: 2 });
        const kgTxt = `${numTxt(kgIncl)} kg`;
        const kmInclTxt = `${numTxt(kmIncl)} km`;
        const lineas = [];
        // El mínimo cubre peso y distancia: "Hasta 3 kg y 5 km: ₡2500.00"
        const cubre = [kgIncl > 0 && porKg > 0 ? kgTxt : null, kmIncl > 0 && porKm > 0 ? kmInclTxt : null].filter(Boolean);
        if (cubre.length) lineas.push(`Hasta ${cubre.join(' y ')}: ${dinero(base)}`);
        else lineas.push(`Base: ${dinero(base)}`);
        if (porKg <= 0) lineas.push('Peso: no se cobra aparte (cualquier peso)');
        else if (kgIncl <= 0) lineas.push(`Peso: + ${dinero(porKg)} por cada kg`);
        else lineas.push(`Más de ${kgTxt}: + ${dinero(porKg)} por cada kg sobre los ${kgTxt}`);
        if (porKm <= 0) lineas.push('Distancia: no se cobra (precio por km en 0)');
        else if (kmIncl <= 0) lineas.push(`Distancia: + ${dinero(porKm)} por cada km (por calle, de A a B)`);
        else lineas.push(`Más de ${kmInclTxt}: + ${dinero(porKm)} por cada km sobre los ${kmInclTxt} (por calle, de A a B)`);

        // Ejemplo con 2 kg y (si cobra distancia) 5 km más de lo que cubre el mínimo
        const pesoEj = kgIncl + 2;
        const kmEj = porKm > 0 ? kmIncl + 5 : 0;
        const partes = [dinero(base)];
        if (porKg > 0) partes.push(`${numTxt(pesoEj - kgIncl)} kg × ${dinero(porKg)}`);
        if (kmEj) partes.push(`${numTxt(kmEj - kmIncl)} km × ${dinero(porKm)}`);
        lineas.push(`Ejemplo: ${numTxt(pesoEj)} kg${kmEj ? ` y ${numTxt(kmEj)} km` : ''} → ${partes.join(' + ')} = ${dinero(calcularEnvio(t, pesoEj, 0, kmEj))}`);
        if (t.envio_gratis_desde != null && t.envio_gratis_desde !== '') lineas.push(`Envío gratis con compras desde ${dinero(t.envio_gratis_desde)}`);
        return lineas;
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

    // (Las ACTIVIDADES ya no están aquí: tienen su propia ventana flotante,
    //  js/secciones/configuracion/actividades.js)
    const CATALOGOS = {

        // ---------- Tarifas ----------
        tarifas: {
            titulo: 'Tarifas',
            texto: 'Cobro del envío por actividad. Prioridad: tienda → región → general.',
            icono: 'bi-cash-coin',
            tabla: 'tarifas', clave: 'id',
            // '*': así también funciona si la base aún no tiene km_incluidos (sql/01, bloque 10)
            select: '*',
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
                ['Km adicional', (f) => (Number(f.precio_km) > 0
                    ? `${dinero(f.precio_km)}${Number(f.km_incluidos) > 0 ? ` (después de ${Number(f.km_incluidos)} km)` : ''}`
                    : 'No cobra')],
                ['Envío gratis desde', (f) => (f.envio_gratis_desde == null ? 'Nunca' : dinero(f.envio_gratis_desde))],
            ],
            campos: [
                { nombre: 'actividad', etiqueta: 'Actividad', tipo: 'opciones', requerido: true, soloAlCrear: true,
                  opciones: () => actividades.map((a) => [a.codigo, a.nombre]) },
                { nombre: 'alcance', etiqueta: 'Aplica a', tipo: 'opciones', requerido: true, soloAlCrear: true, virtual: true,
                  // La general es una por actividad: al crear se ofrece solo si a alguna
                  // actividad de la empresa le falta (ej. empresa nueva sin tarifas copiadas)
                  opciones: (f) => (f && !f.region && !f.tienda_id)
                      ? [['general', 'General (todas las tiendas)']]
                      : [...(!f && esGeneral && faltaTarifaGeneral() ? [['general', 'General (todas las tiendas)']] : []),
                          ['region', 'Una región'], ['tienda', 'Una tienda']],
                  valorInicial: (f) => (f.tienda_id ? 'tienda' : f.region ? 'region' : 'general') },
                { nombre: 'region', etiqueta: 'Región', tipo: 'opciones', requerido: true, soloAlCrear: true,
                  opciones: () => regionesMias().map((r) => [r.codigo, `${r.nombre} (${r.codigo})`]),
                  visible: (v) => v.alcance === 'region' },
                { nombre: 'tienda_id', etiqueta: 'Tienda', tipo: 'opciones', requerido: true, soloAlCrear: true,
                  opciones: () => tiendasMias().map((t) => [String(t.id), `${t.codigo} · ${t.nombre}`]),
                  valorInicial: (f) => (f.tienda_id ? String(f.tienda_id) : ''),
                  visible: (v) => v.alcance === 'tienda' },
                { nombre: 'cargo_fijo', etiqueta: `Envío fijo (${CFG_MONEDA})`, tipo: 'numero', min: 0, porDefecto: 0,
                  ayuda: 'Se cobra en todos los pedidos.' },
                { nombre: 'minimo', etiqueta: `Mínimo (${CFG_MONEDA})`, tipo: 'numero', min: 0, porDefecto: 0 },
                { nombre: 'kg_incluidos', etiqueta: 'Kg que cubre el mínimo', tipo: 'numero', min: 0, porDefecto: 0,
                  ayuda: 'El peso que pase de aquí se cobra como kg adicional.' },
                { nombre: 'precio_kg', etiqueta: `Precio por kg adicional (${CFG_MONEDA})`, tipo: 'numero', min: 0, porDefecto: 0 },
                { nombre: 'envio_gratis_desde', etiqueta: `Envío gratis desde (${CFG_MONEDA} de compra)`, tipo: 'numero', min: 0,
                  ayuda: 'Vacío = nunca es gratis.' },
                // Solo si la base ya tiene la columna (sql/01, bloque 10)
                { nombre: 'km_incluidos', etiqueta: 'Km que cubre el mínimo', tipo: 'numero', min: 0, porDefecto: 0,
                  visible: () => tieneKmIncluidos(),
                  ayuda: 'Distancia incluida en el mínimo (por calle, de A a B). Los km que pasen de aquí se cobran como km adicional. 0 = se cobra desde el primer km.' },
                { nombre: 'precio_km', etiqueta: `Precio por km adicional (${CFG_MONEDA})`, tipo: 'numero', min: 0, porDefecto: 0,
                  ayuda: 'Se multiplica por los km que pasen de lo que cubre el mínimo. 0 = no se cobra distancia.' },
            ],
            preparar(v, fila) {
                const numeros = {
                    cargo_fijo: v.cargo_fijo || 0, minimo: v.minimo || 0, kg_incluidos: v.kg_incluidos || 0,
                    precio_kg: v.precio_kg || 0, precio_km: v.precio_km || 0,
                    ...(tieneKmIncluidos() ? { km_incluidos: v.km_incluidos || 0 } : {}),
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
            // La tarifa EN PALABRAS mientras se escribe (una regla por línea)
            vistaPrevia: (v) => tarifaEnPalabras(v).join('\n'),
            duplicado: 'Ya existe una tarifa de esa actividad para ese lugar. Modifícala desde la lista.',
            textoEliminar: (f) => `¿Quitar la tarifa de ${nombreActividad(f.actividad)} para ${f.tienda_id ? nombreTienda(f.tienda_id) : `la región ${nombreRegion(f.region)}`}? Volverá a usar la general.`,
            // Solo las actividades de la empresa. G2 ve la general (sin cambiarla) y las de su región
            visible: (f) => deLaEmpresa(f) && (!regionG2 || (!f.region && !f.tienda_id) || esDeMiRegion(f)),
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
            visible: (f) => deLaEmpresa(f) && (!regionG2 || !f.region || f.region === regionG2),
            puedeCrear: () => esGeneral || !!regionG2,
            puedeEditar: (f) => esGeneral || (!!regionG2 && f.region === regionG2),
            puedeEliminar: (f) => esGeneral || (!!regionG2 && f.region === regionG2),
        },

        // ---------- Categorías de mercadería (de cada actividad) ----------
        categorias: {
            titulo: 'Categorías de mercadería',
            texto: 'Casillas que se marcan al registrar un pedido, por actividad. Conteo = abarrotes; Artículos = línea blanca, electrónica...; Bultos = cajas y bolsas; Documentos = sobres.',
            icono: 'bi-ui-checks',
            sql: '01_actualizacion_base_existente.sql', // tipos bulto / documento y peso_referencia
            tabla: 'categorias_mercaderia', clave: 'id', select: 'id, actividad, nombre, tipo, icono, peso_referencia, activa, orden', orden: 'orden',
            singular: 'categoría',
            agrupar: (f) => nombreActividad(f.actividad),
            ordenar: (a, b) => (ordenActividad(a.actividad) - ordenActividad(b.actividad)) || (a.orden - b.orden),
            columnas: [
                ['Categoría', (f) => celdaIcono(f.icono, f.nombre)],
                ['Tipo', (f) => (f.tipo === 'documento' && f.peso_referencia != null
                    ? `Documentos (${kilos(f.peso_referencia)} c/u)`
                    : (TIPOS_CATEGORIA[f.tipo] || f.tipo).split(' (')[0])],
                ['Estado', (f) => etiquetaEstado(f.activa)],
            ],
            campos: [
                { nombre: 'actividad', etiqueta: 'Actividad', tipo: 'opciones', requerido: true, soloAlCrear: true,
                  opciones: () => actividades.map((a) => [a.codigo, a.nombre]) },
                { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, max: 40 },
                { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'opciones', requerido: true, porDefecto: 'articulos',
                  opciones: () => Object.entries(TIPOS_CATEGORIA) },
                { nombre: 'peso_referencia', etiqueta: 'Peso de cada documento (kg)', tipo: 'numero', min: 0, porDefecto: 0.2,
                  ayuda: 'Se suma al peso total del pedido (para el cobro).', visible: (v) => v.tipo === 'documento' },
                { nombre: 'icono', etiqueta: 'Icono', tipo: 'opciones', porDefecto: 'bi-box',
                  opciones: () => [['bi-box', 'Caja'], ['bi-box-seam', 'Caja de cartón'], ['bi-bag', 'Bolsa'],
                      ['bi-envelope', 'Sobre / documento'], ['bi-basket', 'Canasta'], ['bi-snow', 'Frío / línea blanca'],
                      ['bi-tv', 'Electrónica'], ['bi-lamp', 'Hogar / muebles'], ['bi-capsule', 'Farmacia']] },
                { nombre: 'orden', etiqueta: 'Orden', tipo: 'numero', min: 0, porDefecto: 0, entero: true },
                { nombre: 'activa', etiqueta: 'Activa (aparece como casilla en los pedidos)', tipo: 'si_no', porDefecto: true },
            ],
            preparar(v, fila) {
                const datos = {
                    nombre: v.nombre, tipo: v.tipo, icono: v.icono || 'bi-box', orden: v.orden || 0, activa: v.activa,
                    peso_referencia: v.tipo === 'documento' ? (v.peso_referencia === '' ? 0 : v.peso_referencia) : null,
                };
                if (!fila) datos.actividad = v.actividad; // al modificar no cambia de actividad
                return datos;
            },
            visible: deLaEmpresa,
            duplicado: 'Ya existe una categoría con ese nombre en esa actividad.',
            textoEliminar: (f) => `¿Eliminar la categoría "${f.nombre}"? También se borran sus artículos frecuentes. Los pedidos que ya la usaron conservan el nombre. (Para ocultarla sin borrarla, desactívala.)`,
            // SOLO el Administrador la ve y la cambia
            // (G1 y G2 no ven esta tarjeta; los artículos frecuentes sí los administra G1)
            mostrar: () => esAdministrador(),
            puedeCrear: () => esAdministrador(),
            puedeEditar: () => esAdministrador(),
            puedeEliminar: () => esAdministrador(),
        },

        // ---------- Artículos frecuentes = pesos promedio (tabla articulos_catalogo) ----------
        // Al marcar Línea blanca o Electrónica en un pedido (tienda o encomienda),
        // el artículo se elige de esta lista y el peso se llena solo (se puede
        // corregir en el pedido). Cada actividad tiene sus propios pesos.
        // python/pesos_promedio.py los ajusta con los pesos reales de los pedidos.
        articulos: {
            titulo: 'Artículos frecuentes (pesos promedio)',
            texto: 'Peso promedio de cada artículo, por actividad y categoría. Al registrar un pedido el peso se llena solo y el empleado lo puede corregir.',
            icono: 'bi-list-check',
            sql: '00_instalacion_completa.sql', // si falta la tabla, solo esta tarjeta lo avisa
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
                { nombre: 'categoria_id', etiqueta: 'Actividad y categoría', tipo: 'opciones', requerido: true,
                  // Solo las categorías de tipo "artículos" de las actividades de la empresa
                  opciones: () => (filas.categorias || []).filter((c) => c.tipo === 'articulos' && deLaEmpresa(c))
                      .sort((a, b) => ordenCategoria(a.id) - ordenCategoria(b.id))
                      .map((c) => [String(c.id), nombreCategoria(c.id)]),
                  valorInicial: (f) => String(f.categoria_id) },
                { nombre: 'nombre', etiqueta: 'Artículo', tipo: 'texto', requerido: true, max: 60, ayuda: 'Ej. "Refrigeradora".' },
                { nombre: 'peso_kg', etiqueta: 'Peso promedio (kg)', tipo: 'numero', requerido: true, min: 0 },
                { nombre: 'orden', etiqueta: 'Orden', tipo: 'numero', min: 0, porDefecto: 0, entero: true },
                { nombre: 'activo', etiqueta: 'Activo (aparece al registrar pedidos)', tipo: 'si_no', porDefecto: true },
            ],
            preparar: (v) => ({ categoria_id: Number(v.categoria_id), nombre: v.nombre, peso_kg: v.peso_kg, orden: v.orden || 0, activo: v.activo }),
            // Solo los de categorías de actividades de la empresa
            // (las categorías ya vienen solo de la empresa activa: un artículo sin su
            //  categoría en la lista es de otra empresa y no se muestra)
            visible: (f) => { const c = categoriaPorId(f.categoria_id); return !!c && deLaEmpresa(c); },
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

        const [act, reg, tie, ...resultados] = await Promise.all([
            db.from('actividades').select('codigo, nombre').order('orden'),
            db.from('regiones').select('codigo, nombre').order('nombre'),
            db.from('tiendas').select('id, codigo, nombre, region').order('codigo'),
            ...consultas,
        ]);

        // Categorías sin sql/01_actualizacion_base_existente (no existe peso_referencia): se leen igual, sin
        // esa columna, para que los artículos sigan agrupados por categoría
        const iCat = nombres.indexOf('categorias');
        if (resultados[iCat].error && resultados[iCat].error.code === '42703') {
            const viejo = await db.from('categorias_mercaderia').select('id, actividad, nombre, tipo, icono, activa, orden').order('orden');
            if (!viejo.error) {
                resultados[iCat] = viejo;
                aviso.mostrar('Falta ejecutar sql/01_actualizacion_base_existente.sql en Supabase (categorías de encomiendas, bultos y documentos).', 'error');
            }
        }

        // Una lista cuyo SQL aún no se ejecutó en esta base (ver "sql" del catálogo):
        // solo su tarjeta avisa, el resto funciona
        const tablaFalta = (e) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || e.code === '42703');
        nombres.forEach((nombre, i) => {
            faltaSqlDe[nombre] = !!CATALOGOS[nombre].sql && tablaFalta(resultados[i].error);
            if (faltaSqlDe[nombre]) resultados[i] = { data: [], error: null };
        });

        const error = [act, reg, tie, ...resultados].map((r) => r.error).find(Boolean);
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

        // Solo las actividades que realiza la empresa (empresas/empresas.js)
        actividades = actividadesDeLaEmpresa(act.data);
        regiones = reg.data;
        tiendas = tie.data;
        nombres.forEach((nombre, i) => { filas[nombre] = resultados[i].data; });
        nombres.forEach(dibujar);
        llenarTarifasCalculadora();
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
    // NÚMERO DE PEDIDO Y CÓDIGO DE RESPALDO (tabla configuracion)
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

        // En bases antiguas se guardaba como texto ("aleatorio"): se acepta igual
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
    // SIMULADOR DE PRECIOS: PESO × DISTANCIA (Python: python/tarifas.py)
    // La REGLA de cada tarifa (en palabras) se ve en el formulario de Tarifas
    // (tarifaEnPalabras). Aquí se SIMULA: tabla con el precio para cada peso
    // (filas) y cada distancia en km (columnas), con el precio por km de la
    // tarifa. Si la tarifa no cobra por km, una sola columna.
    // Python corre en el navegador (cargarPython, js/componentes.js).
    //
    // Cada simulación se agrega ARRIBA como una tarjeta; se borran una por una
    // (✕) o todas. No se guardan: son solo de esta pantalla.
    // ==================================================

    const calcSelect    = seccion.querySelector('#cfgCalcTarifa');
    const calcEstado    = seccion.querySelector('#cfgCalcEstado');
    const calcBoton     = seccion.querySelector('#cfgCalcBoton');
    const calcHistorial = seccion.querySelector('#cfgCalcHistorial');
    const calcCabecera  = seccion.querySelector('#cfgCalcCabecera');
    const calcKmGrupo   = seccion.querySelector('#cfgCalcKmGrupo');
    const CALC_MAX_CELDAS = 600; // pesos × distancias
    const kg = (n) => `${Number(n || 0).toLocaleString('es-CR', { maximumFractionDigits: 2 })} kg`;
    const kmTxt = (n) => `${Number(n || 0).toLocaleString('es-CR', { maximumFractionDigits: 2 })} km`;
    const tarifaCalc = () => (filas.tarifas || []).find((t) => String(t.id) === calcSelect.value) || null;
    const cobraKmCalc = (t) => !!t && Number(t.precio_km) > 0;
    // La regla de la tarifa en una línea (sin el ejemplo)
    const reglaCorta = (t) => tarifaEnPalabras(t).filter((l) => !l.startsWith('Ejemplo')).join(' · ');

    // Al elegir la tarifa: su regla en una línea y si se piden las distancias
    function alElegirTarifaCalc() {
        const t = tarifaCalc();
        seccion.querySelector('#cfgCalcRegla').textContent = t ? reglaCorta(t) : '';
        calcKmGrupo.disabled = !cobraKmCalc(t);
        calcKmGrupo.title = cobraKmCalc(t) ? '' : 'Esta tarifa no cobra por km (precio por km en 0, se cambia en Tarifas).';
    }
    calcSelect.addEventListener('change', alElegirTarifaCalc);

    function actualizarCabeceraCalc() {
        const n = calcHistorial.children.length;
        calcCabecera.hidden = !n;
        seccion.querySelector('#cfgCalcCuenta').textContent = n;
    }

    // Tarjeta de una simulación (textos con textContent)
    //   datos: { pesos, kms, filas: [{ peso_kg, tramo, kg_adicional, gratis, precios: [...] }] }
    function tarjetaSimulacion(tarifa, datos, rango) {
        const el = (tag, clase, texto) => {
            const e = document.createElement(tag);
            if (clase) e.className = clase;
            if (texto != null) e.textContent = texto;
            return e;
        };
        const art = el('article', 'cfg-calc-resultado');

        // Cabecera: tarifa, rango, hora y ✕
        const cab = el('header', 'cfg-calc-resultado-cabecera');
        const titulos = el('div');
        titulos.append(el('strong', null, nombreTarifa(tarifa)),
            el('small', null, `${rango} · ${new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}`),
            el('small', 'cfg-calc-regla', reglaCorta(tarifa)));
        const borrar = crearBotonIcono('eliminar', '', 'bi-x-lg', 'Borrar esta simulación');
        borrar.addEventListener('click', () => { art.remove(); actualizarCabeceraCalc(); });
        cab.append(titulos, borrar);

        // Tabla cruzada: Peso | (kg adicionales) | precio con cada distancia
        const conKm = cobraKmCalc(tarifa);
        const caja = el('div', 'tabla-caja cfg-calc-tabla');
        const t = el('table', 'tabla cfg-tabla cfg-calc-matriz');
        const cabT = t.createTHead().insertRow();
        cabT.appendChild(el('th', null, 'Peso'));
        cabT.appendChild(el('th', null, 'Kg adicionales'));
        // Distancias que cubre el mínimo: "(incluido)"
        const kmIncl = Number(tarifa.km_incluidos || 0);
        datos.kms.forEach((km) => {
            const th = el('th', 'cfg-calc-precio', conKm ? kmTxt(km) : 'Envío');
            if (conKm && kmIncl > 0 && km <= kmIncl) {
                th.classList.add('cfg-calc-incluido');
                th.appendChild(el('small', null, 'incluido'));
            }
            cabT.appendChild(th);
        });
        const cuerpo = t.createTBody();
        const columnas = 2 + datos.kms.length;
        let tramoAnterior = null;
        datos.filas.forEach((f) => {
            // Línea que marca desde dónde se cobran kg adicionales
            if (f.tramo === 'adicional' && tramoAnterior === 'base') {
                const sep = cuerpo.insertRow();
                sep.className = 'cfg-calc-separador';
                const td = sep.insertCell();
                td.colSpan = columnas;
                td.textContent = `Más de ${kg(tarifa.kg_incluidos)}: se suma ${dinero(tarifa.precio_kg)} por cada kg adicional`;
            }
            tramoAnterior = f.tramo;
            const tr = cuerpo.insertRow();
            tr.className = f.tramo === 'base' ? 'cfg-calc-base' : 'cfg-calc-adicional';
            tr.insertCell().textContent = kg(f.peso_kg);
            tr.insertCell().textContent = f.tramo === 'base' ? 'Precio base' : kg(f.kg_adicional);
            f.precios.forEach((p) => {
                const td = tr.insertCell();
                td.className = 'cfg-calc-precio';
                td.textContent = f.gratis ? 'Gratis' : dinero(p);
            });
        });
        caja.appendChild(t);

        art.append(cab, caja);
        return art;
    }

    seccion.querySelector('#cfgCalcBorrarTodo').addEventListener('click', () => {
        calcHistorial.replaceChildren();
        actualizarCabeceraCalc();
        calcEstado.textContent = 'Simulaciones borradas.';
    });

    // Nombre de una tarifa: "Encomiendas · General" / "... · Región CEN" / "... · Tienda NOR-001"
    const nombreTarifa = (t) => `${nombreActividad(t.actividad)} · ${
        t.tienda_id ? `Tienda ${nombreTienda(t.tienda_id)}` : t.region ? `Región ${nombreRegion(t.region)}` : 'General'}`;

    function llenarTarifasCalculadora() {
        const actual = calcSelect.value;
        const lista = (filas.tarifas || []).filter(CATALOGOS.tarifas.visible).sort(CATALOGOS.tarifas.ordenar);
        calcSelect.replaceChildren();
        lista.forEach((t) => calcSelect.appendChild(new Option(nombreTarifa(t), t.id)));
        if (!lista.length) calcSelect.appendChild(new Option('No hay tarifas', ''));
        if ([...calcSelect.options].some((o) => o.value === actual)) calcSelect.value = actual;
        alElegirTarifaCalc();
    }

    seccion.querySelector('#cfgCalcForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const tarifa = tarifaCalc();
        if (!tarifa) {
            calcEstado.textContent = 'Elige una tarifa.';
            return;
        }
        const leer = (id) => Number(seccion.querySelector(id).value || 0);
        const peso = { desde: leer('#cfgCalcDesde'), hasta: leer('#cfgCalcHasta'), cada: leer('#cfgCalcPaso') };
        // Sin precio por km: una sola columna (0 km)
        const km = cobraKmCalc(tarifa)
            ? { desde: leer('#cfgCalcKmDesde'), hasta: leer('#cfgCalcKmHasta'), cada: leer('#cfgCalcKmPaso') }
            : { desde: 0, hasta: 0, cada: 1 };
        const monto = leer('#cfgCalcMonto');
        for (const [nombre, r] of [['los pesos', peso], ['las distancias', km]]) {
            if (r.cada <= 0 || r.hasta < r.desde) {
                calcEstado.textContent = `Revisa ${nombre}: "Hasta" debe ser mayor o igual que "Desde" y "Cada" mayor que 0.`;
                return;
            }
        }
        const celdas = (Math.floor((peso.hasta - peso.desde) / peso.cada) + 1) * (Math.floor((km.hasta - km.desde) / km.cada) + 1);
        if (celdas > CALC_MAX_CELDAS) {
            calcEstado.textContent = `Son demasiados precios (${celdas}): usa un "Cada" más grande en peso o distancia (máximo ${CALC_MAX_CELDAS}).`;
            return;
        }

        calcBoton.disabled = true;
        calcEstado.textContent = 'Cargando Python...';
        try {
            const py = await cargarPython('python/tarifas.py');
            calcEstado.textContent = 'Calculando...';
            // Se pasa la tarifa como JSON y vuelve JSON (sin conversiones raras)
            const datos = JSON.parse(py.globals.get('matriz_precios_json')(JSON.stringify(tarifa),
                peso.desde, peso.hasta, peso.cada, km.desde, km.hasta, km.cada, monto));

            const rango = [
                peso.desde === peso.hasta ? kg(peso.desde) : `${kg(peso.desde)} a ${kg(peso.hasta)} (cada ${kg(peso.cada)})`,
                cobraKmCalc(tarifa)
                    ? (km.desde === km.hasta ? kmTxt(km.desde) : `${kmTxt(km.desde)} a ${kmTxt(km.hasta)} (cada ${kmTxt(km.cada)})`)
                    : 'sin distancia',
                monto > 0 ? `compra ${dinero(monto)}` : null,
            ].filter(Boolean).join(' · ');
            calcHistorial.prepend(tarjetaSimulacion(tarifa, datos, rango)); // la más nueva arriba
            actualizarCabeceraCalc();
            calcEstado.textContent = `Listo: ${nombreTarifa(tarifa)} (calculado con Python, python/tarifas.py).`;
        } catch (error) {
            console.error('Error en el simulador de precios:', error);
            calcEstado.textContent = 'No se pudo usar Python. Revisa la conexión a internet (la primera vez se descarga), que el sistema se abra con Live Server y recarga la página (F5) si se actualizó.';
        }
        calcBoton.disabled = false;
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
