/* ==================================================
   CONFIGURACIÓN -> COSTOS DE OPERACIÓN
   ACACHETE LOGISTICS

   Lo carga js/secciones/configuracion.js la primera vez que se abre la tarjeta
   "Costos de operación" (todas las empresas si su plan incluye "cfg_costos";
   Administrador y Admin G1). Tablas: costos_operacion (gastos) y costos_config
   (margen_objetivo y trabajos_mes), sql/instalacion/06_costos.sql.

   NO depende de vehículos: todo lo que cuesta operar (salarios, seguros, combustible,
   mantenimiento…) se escribe como un gasto del mes.
     1. Cuánto cuesta operar: suma de los gastos del mes ÷ entregas o viajes del mes
        (los reales de 30 días o el estimado que se escriba) = costo de cada uno.
        Costo por día: gasto del mes ÷ días que se trabajan este mes (1 día libre por
        semana: los días del mes menos sus domingos, COS_DIA_LIBRE).
     2. Margen y precio: precio mínimo para cubrir gastos (= costo), precio sugerido con
        el margen de utilidad deseado (costo ÷ (1 − margen)), ingreso del mes necesario y
        margen real de 30 días (cobrado − gastado). Se recalcula mientras se escribe.
     3. Gastos del mes (fijos y variables).
   "Real" (30 días) junta:
     - viajes terminados (cobrado: total), si la empresa hace viajes;
     - pedidos entregados (cobrado: costo_envio, ya con descuento).
   El reporte de Viajes usa el mismo costo por viaje (costoPorTrabajo, js/viajes-comun.js).
   ================================================== */

registrarModuloConfig('costos', (seccion, ctx) => {
    const { zona, aviso, pedirConfirmacion } = ctx;
    const $ = (selector) => zona.querySelector(selector);         // ventanas (fuera del <section>)
    const enSeccion = (selector) => seccion.querySelector(selector);

    const COS_MARGEN_BASE = 20; // % de utilidad si la empresa no guardó el suyo
    const COS_DIA_LIBRE = 0;    // día libre de cada semana para el costo por día (0 = domingo)
    // Conceptos sugeridos al crear un gasto (más los que ya usa la empresa)
    const COS_CONCEPTOS = ['Combustible', 'Salario del conductor', 'Cuota del vehículo', 'Seguro', 'Marchamo',
        'Plan de teléfono', 'Parqueo', 'Mantenimiento', 'Llantas', 'Lavado'];

    // ---------- Estado ----------
    let config = {};
    let costos = [];
    let trabajos30 = [];  // [{ ingreso }] entregas y viajes terminados de los últimos 30 días
    let editandoGasto = null;
    let activo = true;

    const faltaSql = (e) => !!e && ['42P01', 'PGRST205', '42703', 'PGRST200'].includes(e.code);
    const dinero = (n) => viaDinero(n);
    const porcentaje = (n) => `${(Math.round(n * 10) / 10).toLocaleString('es-CR')} %`;
    const tieneViajes = typeof empresaTieneViajes === 'function' && empresaTieneViajes();
    const tienePedidos = typeof empresaTienePedidos !== 'function' || empresaTienePedidos();
    // Cómo se llama cada trabajo en esta empresa
    const [unidad, unidades] = tieneViajes && tienePedidos ? ['entrega o viaje', 'entregas y viajes']
        : tieneViajes ? ['viaje', 'viajes'] : ['entrega', 'entregas'];
    const unidadCorta = unidad.split(' ')[0];

    function errorBase(error, accion) {
        console.error(`Error al ${accion}:`, error);
        aviso.mostrar(viaErrorTexto(error, accion), 'error');
    }

    // ==================================================
    // CARGAR
    // ==================================================

    // Entregas y viajes de los últimos 30 días: lo cobrado de cada uno
    async function cargarTrabajos30() {
        const hace30 = new Date(Date.now() - 30 * 86400000);
        const consultas = [];
        if (tieneViajes) {
            consultas.push(db.from('viajes').select('total')
                .eq('estado', 'terminado').gte('inicio', hace30.toISOString())
                .then(({ data, error }) => (error ? [] : data.map((v) => ({ ingreso: Number(v.total || 0) })))));
        }
        if (tienePedidos) {
            consultas.push(db.from('pedidos').select('costo_envio')
                .in('estado', ['entregado', 'entregado_incidencia']).gte('fecha_entrega', viaFechaISO(hace30))
                .then(({ data, error }) => (error ? [] : data.map((p) => ({ ingreso: Number(p.costo_envio || 0) })))));
        }
        return (await Promise.all(consultas)).flat();
    }

    async function cargar() {
        const [cfg, co] = await Promise.all([
            db.from('costos_config').select('*').maybeSingle(),
            db.from('costos_operacion').select('*').order('concepto'),
        ]);
        if (!activo) return;
        const error = cfg.error || co.error;
        enSeccion('#cfgCosFaltaSql').hidden = !faltaSql(error);
        enSeccion('#cfgCosContenido').hidden = faltaSql(error);
        if (error) {
            if (!faltaSql(error)) errorBase(error, 'cargar los costos');
            return;
        }
        config = cfg.data || {};
        costos = co.data;
        trabajos30 = await cargarTrabajos30();
        if (!activo) return;
        pintarDatos();
        dibujarCalculo();
        dibujarGastos();
    }

    // ==================================================
    // 1. CUÁNTO CUESTA OPERAR  y  2. MARGEN Y PRECIO
    // ==================================================

    // Número escrito en un campo (vacío o inválido = null). Se lee lo escrito aunque no
    // se haya guardado: así el cálculo cambia mientras se escribe.
    const leerNumero = (selector) => {
        const texto = enSeccion(selector).value.trim();
        const n = Number(texto);
        return texto === '' || !Number.isFinite(n) ? null : n;
    };

    // Días que se trabajan este mes: todos menos el día libre de cada semana
    function diasTrabajoMes() {
        const hoy = new Date();
        const total = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
        let libres = 0;
        for (let d = 1; d <= total; d++) {
            if (new Date(hoy.getFullYear(), hoy.getMonth(), d).getDay() === COS_DIA_LIBRE) libres++;
        }
        return { total, dias: total - libres };
    }

    function calcular() {
        const sumaTipo = (tipo) => costos.filter((c) => c.tipo === tipo).reduce((s, c) => s + Number(c.monto_mes || 0), 0);
        const fijos = sumaTipo('fijo');
        const variables = sumaTipo('variable');
        const gastoMes = fijos + variables;

        // Entregas del mes: el estimado escrito o las reales de 30 días
        const reales = trabajos30.length;
        const estimado = leerNumero('#cfgCosTrabajosMes');
        const trabajos = estimado > 0 ? Math.round(estimado) : reales;
        const costoTrabajo = trabajos > 0 ? gastoMes / trabajos : null;
        const mes = diasTrabajoMes();

        const margenPct = Math.min(90, Math.max(0, leerNumero('#cfgCosMargen') ?? COS_MARGEN_BASE));
        const m = margenPct / 100;
        const ingreso30 = trabajos30.reduce((s, t) => s + t.ingreso, 0);

        return {
            fijos, variables, gastoMes, reales, trabajos, estimado: estimado > 0, costoTrabajo,
            diasMes: mes.dias, diasCalendario: mes.total, costoDia: gastoMes / mes.dias,
            margenPct, recargoPct: (m / (1 - m)) * 100,
            precioSugerido: costoTrabajo != null ? costoTrabajo / (1 - m) : null,
            ingresoNecesario: gastoMes / (1 - m),
            // Real de 30 días: lo cobrado contra los gastos del mes
            ingreso30, precioPromedio: reales && ingreso30 > 0 ? ingreso30 / reales : null,
        };
    }

    const cuadro = (titulo, valor, detalle, clase = '') => {
        const d = viaElemento('div', `resumen-item via-kpi ${clase}`.trim());
        d.append(viaElemento('span', 'resumen-texto', titulo), viaElemento('span', 'resumen-numero', valor), viaElemento('span', 'via-kpi-detalle', detalle));
        return d;
    };

    function dibujarResumen(c) {
        const deDonde = c.estimado ? 'estimado' : 'últimos 30 días';
        enSeccion('#cfgCosResumen').replaceChildren(
            cuadro('Gasto del mes', dinero(c.gastoMes),
                costos.length ? `Fijo ${dinero(c.fijos)} · variable ${dinero(c.variables)}` : 'Agrega los gastos abajo'),
            cuadro(`${unidades.charAt(0).toUpperCase()}${unidades.slice(1)} al mes`, c.trabajos ? c.trabajos.toLocaleString('es-CR') : '—',
                c.trabajos ? deDonde : `Sin ${unidades} en 30 días: escribe cuántas haces al mes`),
            cuadro(`Costo por ${unidad}`, c.costoTrabajo != null ? dinero(c.costoTrabajo) : '—',
                c.costoTrabajo != null ? `${dinero(c.gastoMes)} ÷ ${plural(c.trabajos, unidadCorta, unidades)}` : 'Falta saber cuántas haces al mes'),
            cuadro('Costo por día', costos.length ? dinero(c.costoDia) : '—',
                `${dinero(c.gastoMes)} ÷ ${c.diasMes} días de trabajo (mes de ${c.diasCalendario}, 1 libre por semana)`),
        );
    }

    function dibujarMargen(c) {
        const hay = c.costoTrabajo != null;
        const utilidad30 = c.ingreso30 - c.gastoMes;
        const margen30 = c.ingreso30 > 0 ? (utilidad30 / c.ingreso30) * 100 : null;
        enSeccion('#cfgCosMargenResumen').replaceChildren(
            cuadro('Precio mínimo (cubrir gastos)', hay ? dinero(c.costoTrabajo) : '—',
                hay ? `Por ${unidad}: utilidad ₡0` : `Falta saber cuántas ${unidades} haces al mes`),
            cuadro(`Precio sugerido (${porcentaje(c.margenPct)} de margen)`, hay ? dinero(c.precioSugerido) : '—',
                hay ? `Utilidad ${dinero(c.precioSugerido - c.costoTrabajo)} por ${unidad} · costo + ${porcentaje(c.recargoPct)}` : '—'),
            cuadro('Ingreso al mes para cubrir gastos', dinero(c.gastoMes),
                `Con ${porcentaje(c.margenPct)} de margen: ${dinero(c.ingresoNecesario)} (utilidad ${dinero(c.ingresoNecesario - c.gastoMes)})`),
            cuadro('Margen real (30 días)', margen30 != null ? porcentaje(margen30) : '—',
                margen30 != null
                    ? `Cobrado ${dinero(c.ingreso30)} − gastos ${dinero(c.gastoMes)} = ${utilidad30 >= 0 ? 'utilidad' : 'pérdida'} ${dinero(Math.abs(utilidad30))}`
                    : `Sin cobros de ${unidades} en los últimos 30 días`,
                margen30 == null ? '' : margen30 >= 0 ? 'cfg-cos-gana' : 'cfg-cos-pierde'),
        );

        // Qué tan lejos está el precio de hoy
        const nota = [];
        if (c.precioPromedio && hay) {
            nota.push(`Hoy cobras en promedio ${dinero(c.precioPromedio)} por ${unidad}.`);
            nota.push(c.precioPromedio < c.costoTrabajo
                ? `Está por debajo del costo: pierdes ${dinero(c.costoTrabajo - c.precioPromedio)} en cada una.`
                : c.precioPromedio < c.precioSugerido
                    ? `Cubre los gastos, pero para llegar al ${porcentaje(c.margenPct)} de margen faltan ${dinero(c.precioSugerido - c.precioPromedio)} por ${unidad}.`
                    : 'Ya llega al margen deseado.');
            nota.push(`A ese precio necesitas ${Math.ceil(c.gastoMes / c.precioPromedio)} al mes para cubrir gastos y `
                + `${Math.ceil(c.ingresoNecesario / c.precioPromedio)} para el ${porcentaje(c.margenPct)} de margen.`);
        }
        nota.push(`Cobrado = envío de los pedidos entregados${tieneViajes ? ' y total de los viajes terminados' : ''}.`);
        enSeccion('#cfgCosMargenNota').textContent = nota.join(' ');
    }

    function dibujarCalculo() {
        const c = calcular();
        dibujarResumen(c);
        dibujarMargen(c);
    }

    function pintarDatos() {
        enSeccion('#cfgCosTrabajosMes').value = config.trabajos_mes ?? '';
        enSeccion('#cfgCosMargen').value = config.margen_objetivo ?? COS_MARGEN_BASE;
    }

    // Mientras se escribe, el cálculo cambia (sin guardar)
    enSeccion('#cfgCosTrabajosMes').addEventListener('input', dibujarCalculo);
    enSeccion('#cfgCosMargen').addEventListener('input', dibujarCalculo);

    // Guarda en costos_config (una fila por empresa)
    async function guardarConfig(datos, mensaje) {
        datos.actualizado_en = new Date().toISOString();
        const { error } = await db.from('costos_config').upsert(datos, { onConflict: 'empresa_id' });
        if (error) { errorBase(error, 'guardar los datos del cálculo'); return; }
        aviso.mostrar(mensaje);
        cargar();
    }

    enSeccion('#cfgCosDatos').addEventListener('submit', (e) => {
        e.preventDefault();
        const trabajos = leerNumero('#cfgCosTrabajosMes');
        if (enSeccion('#cfgCosTrabajosMes').value.trim() !== '' && (trabajos == null || trabajos < 0)) {
            aviso.mostrar('Las entregas al mes: un número de 0 o más (o vacío para usar las reales).', 'error');
            enSeccion('#cfgCosTrabajosMes').focus();
            return;
        }
        guardarConfig({ trabajos_mes: trabajos ? Math.round(trabajos) : null }, `${unidades.charAt(0).toUpperCase()}${unidades.slice(1)} al mes guardadas.`);
    });

    enSeccion('#cfgCosMargenGuardar').addEventListener('click', () => {
        const margen = leerNumero('#cfgCosMargen');
        if (margen == null || margen < 0 || margen > 90) {
            aviso.mostrar('El margen va de 0 a 90 %.', 'error');
            enSeccion('#cfgCosMargen').focus();
            return;
        }
        guardarConfig({ margen_objetivo: margen }, `Margen de ${porcentaje(margen)} guardado.`);
    });

    // ==================================================
    // 3. GASTOS DEL MES
    // ==================================================

    function dibujarGastos() {
        const cuerpo = enSeccion('#cfgCosGastos');
        cuerpo.replaceChildren();
        if (!costos.length) cuerpo.appendChild(crearFilaVacia('Sin gastos. Usa "Nuevo gasto" (ej. Combustible, variable, ₡300000 al mes).', 4));
        costos.forEach((g) => {
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(g.concepto));
            tr.appendChild(g.tipo === 'fijo' ? crearCeldaEtiqueta('Fijo', 'etiqueta-azul') : crearCeldaEtiqueta('Variable', 'etiqueta-naranja'));
            tr.appendChild(crearCelda(dinero(g.monto_mes)));
            tr.appendChild(crearCeldaAcciones(
                crearBotonIcono('editar-gasto', g.id, 'bi-pencil', 'Modificar gasto'),
                crearBotonIcono('eliminar-gasto', g.id, 'bi-trash3', 'Eliminar gasto')));
            cuerpo.appendChild(tr);
        });
    }

    // Concepto: lista con los sugeridos y los que ya usa la empresa, más "+ Nuevo concepto…"
    // (js/componentes.js; no datalist, que dentro de la ventana se dibuja fuera de lugar)
    const listaConcepto = crearListaConNuevo($('#cfgCosGaConceptoLista'), $('#cfgCosGaConcepto'),
        { vacio: 'Elige el concepto…', textoNuevo: '+ Nuevo concepto…' });

    function abrirGasto(g = null) {
        editandoGasto = g;
        $('#cfgCosGastoTitulo').textContent = g ? `Modificar gasto: ${g.concepto}` : 'Nuevo gasto';
        $('#cfgCosGaError').textContent = '';
        const usados = costos.map((x) => x.concepto).filter((c) => !COS_CONCEPTOS.includes(c)).sort((a, b) => a.localeCompare(b, 'es'));
        listaConcepto.poner([...COS_CONCEPTOS, ...usados], g ? g.concepto : '');
        $('#cfgCosGaTipo').value = g ? g.tipo : 'fijo';
        $('#cfgCosGaMonto').value = g ? g.monto_mes : '';
        $('#cfgCosGastoDialogo').showModal();
        listaConcepto.campo().focus();
    }

    // El combustible cambia con lo que se trabaja: se sugiere "variable"
    $('#cfgCosGaConceptoLista').addEventListener('change', () => {
        if (!editandoGasto && listaConcepto.valor() === 'Combustible') $('#cfgCosGaTipo').value = 'variable';
    });

    $('#cfgCosGastoForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const error = $('#cfgCosGaError');
        const concepto = listaConcepto.valor();
        const monto = Number($('#cfgCosGaMonto').value);
        if (!concepto) { error.textContent = 'Elige el concepto o escribe uno nuevo.'; listaConcepto.campo().focus(); return; }
        if ($('#cfgCosGaMonto').value.trim() === '' || !Number.isFinite(monto) || monto < 0) { error.textContent = 'Escribe el monto del mes (0 o más).'; return; }
        const datos = { concepto, tipo: $('#cfgCosGaTipo').value, monto_mes: monto };
        const { error: err } = editandoGasto
            ? await db.from('costos_operacion').update(datos).eq('id', editandoGasto.id)
            : await db.from('costos_operacion').insert(datos);
        if (err) { error.textContent = viaErrorTexto(err, 'guardar el gasto'); return; }
        $('#cfgCosGastoDialogo').close();
        aviso.mostrar(editandoGasto ? 'Gasto actualizado.' : 'Gasto agregado.');
        cargar();
    });
    $('#cfgCosGaCancelar').addEventListener('click', () => $('#cfgCosGastoDialogo').close());
    enSeccion('#cfgCosNuevoGasto').addEventListener('click', () => abrirGasto());

    enSeccion('#cfgCosGastos').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-accion]');
        if (!b) return;
        const g = costos.find((x) => x.id === Number(b.dataset.id));
        if (!g) return;
        if (b.dataset.accion === 'editar-gasto') abrirGasto(g);
        if (b.dataset.accion === 'eliminar-gasto') {
            pedirConfirmacion(`¿Eliminar el gasto "${g.concepto}" (${dinero(g.monto_mes)} al mes)?`, async () => {
                const { error } = await db.from('costos_operacion').delete().eq('id', g.id);
                if (error) { errorBase(error, 'eliminar el gasto'); return; }
                aviso.mostrar('Gasto eliminado.');
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
        const d = $('#cfgCosGastoDialogo');
        if (d && d.open) d.close();
    };
});
