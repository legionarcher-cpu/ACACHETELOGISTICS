/* ==================================================
   CONFIGURACIÓN -> COSTOS DE OPERACIÓN
   ACACHETE LOGISTICS

   Lo carga js/secciones/configuracion.js la primera vez que se abre la tarjeta
   "Costos de operación" (todas las empresas si su plan incluye "cfg_costos";
   Administrador y Admin G1). Tablas: sql/01 bloque 19 (transporte_costos,
   transporte_config y los datos de costos de vehiculos).

   Qué hace (todo es de la empresa activa):
     1. Resumen: gasto del mes, costo por hora, por km, de 1 km contando el tiempo y
        costo promedio de cada entrega o viaje (últimos 30 días).
        Combustible: precio del litro y velocidad promedio (transporte_config).
     2. Por vehículo: el gasto del mes se DIVIDE entre sus horas y km del mes (estimado)
        y entre lo que hizo de verdad en 30 días (real).
     3. Gastos del mes (fijos y variables, de un vehículo o de toda la empresa).
   Fórmulas: costosPorVehiculo y costoDeViaje (js/viajes-comun.js).
   "Real" junta:
     - viajes terminados (vehiculo_id, km y minutos), si la empresa hace viajes;
     - pedidos entregados: el vehículo es el del piloto (usuarios.vehiculo_id), los km
       son distancia_km y los minutos los del mapa (detalle.ruta.minutos) o, si no hay,
       km ÷ velocidad promedio.
   ================================================== */

registrarModuloConfig('costos', (seccion, ctx) => {
    const { zona, aviso, pedirConfirmacion } = ctx;
    const $ = (selector) => zona.querySelector(selector);         // ventanas (fuera del <section>)
    const enSeccion = (selector) => seccion.querySelector(selector);

    // ---------- Estado ----------
    let config = { ...VIA_CONFIG_BASE };
    let costos = [];
    let vehiculos = [];
    let trabajos30 = [];  // [{ vehiculo_id, estado: 'terminado', km, minutos }] (entregas y viajes)
    let resumen = { porVehiculo: new Map(), empresa: {} };
    let editandoGasto = null;
    let editandoVehiculo = null;
    let activo = true;

    const faltaSql = (e) => !!e && ['42P01', 'PGRST205', '42703', 'PGRST200'].includes(e.code);
    const dinero = (n) => viaDinero(n);
    const tieneViajes = typeof empresaTieneViajes === 'function' && empresaTieneViajes();
    const tienePedidos = typeof empresaTienePedidos !== 'function' || empresaTienePedidos();
    // Cómo se llama cada trabajo en esta empresa
    const [unidad, unidades] = tieneViajes && tienePedidos ? ['entrega o viaje', 'entregas y viajes']
        : tieneViajes ? ['viaje', 'viajes'] : ['entrega', 'entregas'];

    function errorBase(error, accion) {
        console.error(`Error al ${accion}:`, error);
        aviso.mostrar(viaErrorTexto(error, accion), 'error');
    }

    // ==================================================
    // CARGAR
    // ==================================================

    // Entregas y viajes de los últimos 30 días, cada uno con su vehículo, km y minutos
    async function cargarTrabajos30(velocidad) {
        const hace30 = new Date(Date.now() - 30 * 86400000);
        const consultas = [];
        if (tieneViajes) {
            consultas.push(db.from('viajes').select('vehiculo_id, estado, km, minutos')
                .eq('estado', 'terminado').gte('inicio', hace30.toISOString())
                .then(({ data, error }) => (error ? [] : data)));
        }
        if (tienePedidos) {
            consultas.push(Promise.all([
                db.from('pedidos').select('piloto_id, distancia_km, ruta:detalle->ruta')
                    .in('estado', ['entregado', 'entregado_incidencia']).gte('fecha_entrega', viaFechaISO(hace30)),
                db.from('usuarios').select('id, vehiculo_id').eq('rol', 'piloto').not('vehiculo_id', 'is', null),
            ]).then(([pe, pi]) => {
                if (pe.error) return [];
                const vehiculoDe = new Map((pi.error ? [] : pi.data).map((p) => [p.id, p.vehiculo_id]));
                return pe.data.map((p) => {
                    const ruta = p.ruta || {};
                    const km = Number(p.distancia_km ?? ruta.km ?? 0);
                    const minutos = ruta.minutos != null ? Number(ruta.minutos) : (km / Math.max(1, velocidad)) * 60;
                    return { vehiculo_id: vehiculoDe.get(p.piloto_id) || null, estado: 'terminado', km, minutos };
                });
            }));
        }
        return (await Promise.all(consultas)).flat();
    }

    async function cargar() {
        const [cfg, co, ve] = await Promise.all([
            db.from('transporte_config').select('*').maybeSingle(),
            db.from('transporte_costos').select('*').order('concepto'),
            db.from('vehiculos').select('id, placa, marca, estado, horas_mes, km_mes, km_por_litro').order('placa'),
        ]);
        if (!activo) return;
        const error = cfg.error || co.error || ve.error;
        enSeccion('#cfgCosFaltaSql').hidden = !faltaSql(error);
        enSeccion('#cfgCosContenido').hidden = faltaSql(error);
        if (error) {
            if (!faltaSql(error)) errorBase(error, 'cargar los costos');
            return;
        }
        config = { ...VIA_CONFIG_BASE, ...(cfg.data || {}) };
        costos = co.data;
        vehiculos = ve.data;
        trabajos30 = await cargarTrabajos30(Number(config.velocidad_kmh) || 30);
        if (!activo) return;
        resumen = costosPorVehiculo(vehiculos, costos, config, trabajos30);
        pintarCombustible();
        dibujarResumen();
        dibujarVehiculos();
        dibujarGastos();
    }

    // ==================================================
    // 1. RESUMEN Y COMBUSTIBLE
    // ==================================================

    // Costo promedio de cada entrega o viaje de los últimos 30 días. Sin vehículo
    // (piloto sin vehículo asignado) se usan los costos de toda la empresa.
    function costoPromedioTrabajo() {
        if (!trabajos30.length) return null;
        const e = resumen.empresa;
        const total = trabajos30.reduce((s, t) => s + costoDeViaje(t,
            resumen.porVehiculo.get(t.vehiculo_id) || { costoHora: e.costoHora, costoKm: e.costoKm }), 0);
        return total / trabajos30.length;
    }

    function dibujarResumen() {
        const e = resumen.empresa;
        const cuadro = (titulo, valor, detalle) => {
            const d = viaElemento('div', 'resumen-item via-kpi');
            d.append(viaElemento('span', 'resumen-texto', titulo), viaElemento('span', 'resumen-numero', valor), viaElemento('span', 'via-kpi-detalle', detalle));
            return d;
        };
        const promedio = costoPromedioTrabajo();
        enSeccion('#cfgCosResumen').replaceChildren(
            cuadro('Gasto del mes', dinero((e.fijos || 0) + (e.variables || 0)), `Fijo ${dinero(e.fijos)} · variable ${dinero(e.variables)}`),
            cuadro('Costo por hora', e.costoHora ? dinero(e.costoHora) : '—', e.costoHora ? 'Gasto fijo ÷ horas del mes' : 'Falta: horas al mes de los vehículos'),
            cuadro('Costo por km', e.costoKm ? dinero(e.costoKm) : '—', 'Variable ÷ km del mes + combustible'),
            cuadro('Costo de 1 km (con el tiempo)', e.costoKmTotal ? dinero(e.costoKmTotal) : '—', `A ${config.velocidad_kmh} km/h. Compárelo con el precio por km`),
            cuadro(`Costo por ${unidad}`, promedio ? dinero(promedio) : '—',
                trabajos30.length ? `Promedio de ${plural(trabajos30.length, unidad.split(' ')[0], unidades)} (30 días)` : `Sin ${unidades} en los últimos 30 días`),
        );
    }

    const camposCombustible = () => [...enSeccion('#cfgCosCombustible').querySelectorAll('[data-cfg]')];

    function pintarCombustible() {
        camposCombustible().forEach((c) => { c.value = config[c.dataset.cfg] ?? ''; });
    }

    enSeccion('#cfgCosCombustible').addEventListener('submit', async (e) => {
        e.preventDefault();
        const datos = {};
        for (const c of camposCombustible()) {
            const n = Number(c.value);
            if (c.value.trim() === '' || !Number.isFinite(n) || n < 0) {
                aviso.mostrar('Usa números mayores o iguales a 0.', 'error');
                c.focus();
                return;
            }
            datos[c.dataset.cfg] = n;
        }
        if (datos.velocidad_kmh !== undefined && datos.velocidad_kmh <= 0) { aviso.mostrar('La velocidad debe ser mayor que 0.', 'error'); return; }
        datos.actualizado_en = new Date().toISOString();
        const { error } = await db.from('transporte_config').upsert(datos, { onConflict: 'empresa_id' });
        if (error) { errorBase(error, 'guardar el combustible'); return; }
        aviso.mostrar('Combustible y velocidad guardados.');
        cargar();
    });

    // ==================================================
    // 2. POR VEHÍCULO
    // ==================================================

    function dibujarVehiculos() {
        const cuerpo = enSeccion('#cfgCosVehiculos');
        cuerpo.replaceChildren();
        if (!vehiculos.length) cuerpo.appendChild(crearFilaVacia('No hay vehículos (Configuración → Vehículos).', 8));
        vehiculos.forEach((v) => {
            const c = resumen.porVehiculo.get(v.id) || {};
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(`${v.placa} · ${v.marca}`));
            tr.appendChild(crearCelda(dinero(c.fijos)));
            tr.appendChild(crearCelda(dinero(c.variables)));
            tr.appendChild(crearCelda([v.horas_mes ? `${v.horas_mes} h` : 'sin horas', v.km_mes ? `${v.km_mes} km` : 'sin km',
                v.km_por_litro ? `${v.km_por_litro} km/l` : null].filter(Boolean).join(' · ')));
            tr.appendChild(crearCelda(c.costoHora != null ? dinero(c.costoHora) : '—'));
            tr.appendChild(crearCelda(c.costoKm ? dinero(c.costoKm) : '—'));
            tr.appendChild(crearCelda(c.viajesReal
                ? `${plural(c.viajesReal, unidad.split(' ')[0], unidades)}: ${Math.round(c.horasReal * 10) / 10} h, ${Math.round(c.kmReal)} km → `
                    + `${c.costoHoraReal != null ? `${dinero(c.costoHoraReal)}/h` : '—'} · ${c.costoKmReal != null ? `${dinero(c.costoKmReal)}/km` : '—'}`
                : `Sin ${unidades}`));
            tr.appendChild(crearCeldaAcciones(crearBotonIcono('editar-vehiculo', v.id, 'bi-pencil', 'Horas, km y rendimiento')));
            cuerpo.appendChild(tr);
        });
    }

    enSeccion('#cfgCosVehiculos').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-accion="editar-vehiculo"]');
        if (!b) return;
        const v = vehiculos.find((x) => x.id === Number(b.dataset.id));
        if (!v) return;
        editandoVehiculo = v;
        $('#cfgCosVehTitulo').textContent = `Costos de ${v.placa}`;
        $('#cfgCosVeError').textContent = '';
        $('#cfgCosVeHoras').value = v.horas_mes ?? '';
        $('#cfgCosVeKm').value = v.km_mes ?? '';
        $('#cfgCosVeLitro').value = v.km_por_litro ?? '';
        $('#cfgCosVehDialogo').showModal();
    });

    $('#cfgCosVehForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!editandoVehiculo) return;
        const leer = (s) => { const t = $(s).value.trim(); return t === '' ? null : Number(t); };
        const datos = { horas_mes: leer('#cfgCosVeHoras'), km_mes: leer('#cfgCosVeKm'), km_por_litro: leer('#cfgCosVeLitro') };
        if (Object.values(datos).some((n) => n !== null && (!Number.isFinite(n) || n < 0))) { $('#cfgCosVeError').textContent = 'Usa números mayores o iguales a 0.'; return; }
        if (datos.km_por_litro === 0) datos.km_por_litro = null;
        const { error } = await db.from('vehiculos').update(datos).eq('id', editandoVehiculo.id);
        if (error) { $('#cfgCosVeError').textContent = viaErrorTexto(error, 'guardar los datos del vehículo'); return; }
        $('#cfgCosVehDialogo').close();
        aviso.mostrar(`Datos de ${editandoVehiculo.placa} guardados.`);
        cargar();
    });
    $('#cfgCosVeCancelar').addEventListener('click', () => $('#cfgCosVehDialogo').close());

    // ==================================================
    // 3. GASTOS DEL MES
    // ==================================================

    const textoVehiculo = (id) => {
        const v = vehiculos.find((x) => x.id === id);
        return v ? `${v.placa} · ${v.marca}` : 'Toda la empresa';
    };

    function dibujarGastos() {
        const cuerpo = enSeccion('#cfgCosGastos');
        cuerpo.replaceChildren();
        if (!costos.length) cuerpo.appendChild(crearFilaVacia('Sin gastos. Usa "Nuevo gasto" (ej. Seguro, fijo, ₡45000 al mes).', 5));
        costos.forEach((g) => {
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(g.concepto));
            tr.appendChild(g.tipo === 'fijo' ? crearCeldaEtiqueta('Fijo', 'etiqueta-azul') : crearCeldaEtiqueta('Variable', 'etiqueta-naranja'));
            tr.appendChild(crearCelda(textoVehiculo(g.vehiculo_id)));
            tr.appendChild(crearCelda(dinero(g.monto_mes)));
            tr.appendChild(crearCeldaAcciones(
                crearBotonIcono('editar-gasto', g.id, 'bi-pencil', 'Modificar gasto'),
                crearBotonIcono('eliminar-gasto', g.id, 'bi-trash3', 'Eliminar gasto')));
            cuerpo.appendChild(tr);
        });
    }

    function abrirGasto(g = null) {
        editandoGasto = g;
        $('#cfgCosGastoTitulo').textContent = g ? `Modificar gasto: ${g.concepto}` : 'Nuevo gasto';
        $('#cfgCosGaError').textContent = '';
        $('#cfgCosGaConcepto').value = g ? g.concepto : '';
        $('#cfgCosGaTipo').value = g ? g.tipo : 'fijo';
        $('#cfgCosGaMonto').value = g ? g.monto_mes : '';
        const sel = $('#cfgCosGaVehiculo');
        sel.replaceChildren(new Option('Toda la empresa', ''), ...vehiculos.map((v) => new Option(`${v.placa} · ${v.marca}`, v.id)));
        sel.value = g && g.vehiculo_id ? String(g.vehiculo_id) : '';
        $('#cfgCosGastoDialogo').showModal();
        $('#cfgCosGaConcepto').focus();
    }

    $('#cfgCosGastoForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const error = $('#cfgCosGaError');
        const concepto = $('#cfgCosGaConcepto').value.trim();
        const monto = Number($('#cfgCosGaMonto').value);
        if (!concepto) { error.textContent = 'Escribe el concepto.'; return; }
        if ($('#cfgCosGaMonto').value.trim() === '' || !Number.isFinite(monto) || monto < 0) { error.textContent = 'Escribe el monto del mes (0 o más).'; return; }
        const datos = { concepto, tipo: $('#cfgCosGaTipo').value, monto_mes: monto, vehiculo_id: Number($('#cfgCosGaVehiculo').value) || null };
        const { error: err } = editandoGasto
            ? await db.from('transporte_costos').update(datos).eq('id', editandoGasto.id)
            : await db.from('transporte_costos').insert(datos);
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
                const { error } = await db.from('transporte_costos').delete().eq('id', g.id);
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
        ['#cfgCosGastoDialogo', '#cfgCosVehDialogo'].forEach((s) => { const d = $(s); if (d && d.open) d.close(); });
    };
});
