/* ==================================================
   CONFIGURACIÓN -> TRANSPORTE
   ACACHETE LOGISTICS

   Lo carga js/secciones/configuracion.js la primera vez que se abre la tarjeta
   "Transporte" (solo si la empresa hace viajes; Administrador y Admin G1).
   Diseño: docs/14-transporte.md · Tablas: sql/01 bloque 19.

   Qué se configura (todo es de la empresa activa):
     1. Franjas y precio (transporte_franjas): precio por km según la hora de recogida,
        cargo base y mínimo; días de la semana. No se enciman (lo revisa también la base).
        Margen de cada franja contra el costo de recorrer 1 km.
     2. Recargos, agenda y cortesía (transporte_config): recargos fijos, minutos para
        llegar al punto A y colchón, anticipación, plazo para cambiar o cancelar,
        zona horaria y reglas del viaje de cortesía.
     3. Simulador km × franja (no se guarda).
     4. Costos del mes (transporte_costos + datos de cada vehículo): el gasto del mes se
        DIVIDE entre las horas y los km del mes -> costo por hora y por km, estimado y real
        (viajes terminados de los últimos 30 días). Fórmulas: costosPorVehiculo (js/viajes-comun.js).
     5. Días cerrados (transporte_dias_cerrados).
   La base usa estas mismas reglas al reservar (viaje_precio, viajes_horas_disponibles).
   ================================================== */

registrarModuloConfig('transporte', (seccion, ctx) => {
    const { zona, aviso, pedirConfirmacion } = ctx;
    const $ = (selector) => zona.querySelector(selector);         // ventanas (fuera del <section>)
    const enSeccion = (selector) => seccion.querySelector(selector);

    // ---------- Estado ----------
    let config = { ...VIA_CONFIG_BASE };
    let franjas = [];
    let cerrados = [];
    let costos = [];
    let vehiculos = [];
    let viajes30 = [];
    let resumenCostos = { porVehiculo: new Map(), empresa: {} };
    let editandoFranja = null;
    let editandoGasto = null;
    let editandoVehiculo = null;
    let activo = true;

    const faltaSql = (e) => !!e && ['42P01', 'PGRST205', '42703', 'PGRST200'].includes(e.code);
    const dinero = (n) => viaDinero(n);
    const textoHorario = (f) => `${viaHHMM(f.desde)}–${viaHHMM(f.hasta)}`;

    function errorBase(error, accion) {
        console.error(`Error al ${accion}:`, error);
        aviso.mostrar(viaErrorTexto(error, accion), 'error');
    }

    // ==================================================
    // CARGAR
    // ==================================================

    async function cargar() {
        const hace30 = new Date(Date.now() - 30 * 86400000).toISOString();
        const [cfg, fr, ce, co, ve, vi] = await Promise.all([
            db.from('transporte_config').select('*').maybeSingle(),
            db.from('transporte_franjas').select('*').order('desde'),
            db.from('transporte_dias_cerrados').select('fecha, motivo').gte('fecha', viaFechaISO(new Date(), -7)).order('fecha'),
            db.from('transporte_costos').select('*').order('concepto'),
            db.from('vehiculos').select('id, placa, marca, estado, horas_mes, km_mes, km_por_litro').order('placa'),
            db.from('viajes').select('vehiculo_id, estado, km, minutos').eq('estado', 'terminado').gte('inicio', hace30),
        ]);
        if (!activo) return;
        const error = cfg.error || fr.error || ce.error || co.error || ve.error;
        enSeccion('#cfgTraFaltaSql').hidden = !faltaSql(error);
        enSeccion('#cfgTraContenido').hidden = faltaSql(error);
        if (error) {
            if (!faltaSql(error)) errorBase(error, 'cargar la configuración de transporte');
            return;
        }
        config = { ...VIA_CONFIG_BASE, ...(cfg.data || {}) };
        franjas = fr.data;
        cerrados = ce.data;
        costos = co.data;
        vehiculos = ve.data;
        viajes30 = vi.error ? [] : vi.data;
        resumenCostos = costosPorVehiculo(vehiculos, costos, config, viajes30);
        pintarReglas();
        dibujarFranjas();
        dibujarSimulador();
        dibujarCostos();
        dibujarCerrados();
    }

    // ==================================================
    // 2. REGLAS (recargos, agenda, cortesía, combustible)
    // ==================================================

    const camposConfig = () => [...seccion.querySelectorAll('[data-cfg]')];

    function pintarReglas() {
        camposConfig().forEach((c) => {
            const valor = config[c.dataset.cfg];
            if (c.type === 'checkbox') c.checked = !!valor;
            else c.value = valor ?? '';
        });
    }

    // Guarda los campos de un formulario (las reglas o el combustible)
    async function guardarConfig(form, errorCaja) {
        if (errorCaja) errorCaja.textContent = '';
        const datos = {};
        for (const c of form.querySelectorAll('[data-cfg]')) {
            const col = c.dataset.cfg;
            if (c.type === 'checkbox') { datos[col] = c.checked; continue; }
            if ('texto' in c.dataset) { datos[col] = c.value; continue; }
            const n = Number(c.value);
            if (c.value.trim() === '' || !Number.isFinite(n) || n < 0 || ('entero' in c.dataset && !Number.isInteger(n))) {
                const etiqueta = seccion.querySelector(`label[for="${c.id}"]`);
                const texto = `Revisa "${etiqueta ? etiqueta.textContent : col}": ${'entero' in c.dataset ? 'un número entero' : 'un número'} mayor o igual a 0.`;
                if (errorCaja) errorCaja.textContent = texto; else aviso.mostrar(texto, 'error');
                c.focus();
                return;
            }
            datos[col] = n;
        }
        if (datos.velocidad_kmh !== undefined && datos.velocidad_kmh <= 0) { errorCaja.textContent = 'La velocidad debe ser mayor que 0.'; return; }
        if (datos.cortesia_viajes !== undefined && datos.cortesia_viajes < 1) { errorCaja.textContent = 'La cortesía necesita al menos 1 viaje.'; return; }
        datos.actualizado_en = new Date().toISOString();
        const { error } = await db.from('transporte_config').upsert(datos, { onConflict: 'empresa_id' });
        if (error) {
            console.error('Error al guardar las reglas de transporte:', error);
            const texto = error.code === '23514' ? 'Algún valor está fuera de rango (revisa minutos, días y la cortesía).' : viaErrorTexto(error, 'guardar las reglas');
            if (errorCaja) errorCaja.textContent = texto; else aviso.mostrar(texto, 'error');
            return;
        }
        aviso.mostrar('Reglas de transporte guardadas.');
        cargar();
    }

    enSeccion('#cfgTraReglas').addEventListener('submit', (e) => {
        e.preventDefault();
        guardarConfig(e.target, enSeccion('#cfgTraReglasError'));
    });
    enSeccion('#cfgTraCombustible').addEventListener('submit', (e) => {
        e.preventDefault();
        guardarConfig(e.target, null);
    });

    // ==================================================
    // 1. FRANJAS
    // ==================================================

    // Margen del precio por km contra el costo de recorrer 1 km
    function celdaMargen(f) {
        const costoKm = resumenCostos.empresa.costoKmTotal;
        const precio = Number(f.precio_km || 0);
        if (!costoKm || !precio) return crearCelda('—');
        const margen = Math.round(((precio - costoKm) / precio) * 100);
        const td = crearCeldaEtiqueta(`${margen} %`, margen >= 20 ? 'etiqueta-verde' : margen >= 0 ? 'etiqueta-naranja' : 'etiqueta-rosada');
        td.title = `Costo de 1 km ≈ ${dinero(costoKm)} · precio ${dinero(precio)} por km`;
        return td;
    }

    function dibujarFranjas() {
        const cuerpo = enSeccion('#cfgTraFranjas');
        cuerpo.replaceChildren();
        if (!franjas.length) {
            cuerpo.appendChild(crearFilaVacia('Sin franjas: nadie puede reservar todavía. Usa "Nueva franja" (ej. lunes a sábado de 06:00 a 22:00).', 7));
            return;
        }
        [...franjas].sort((a, b) => Math.min(...a.dias) - Math.min(...b.dias) || a.desde.localeCompare(b.desde)).forEach((f) => {
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(f.nombre || '—'));
            tr.appendChild(crearCelda(textoDias(f.dias)));
            tr.appendChild(crearCelda(textoHorario(f)));
            tr.appendChild(crearCelda([`${dinero(f.precio_km)} por km`, Number(f.cargo_base) ? `base ${dinero(f.cargo_base)}` : null,
                Number(f.minimo) ? `mínimo ${dinero(f.minimo)}` : null].filter(Boolean).join(' · ')));
            tr.appendChild(celdaMargen(f));
            tr.appendChild(f.activa ? crearCeldaEtiqueta('Activa', 'etiqueta-verde') : crearCeldaEtiqueta('Inactiva', 'etiqueta-gris'));
            tr.appendChild(crearCeldaAcciones(
                crearBotonIcono('editar-franja', f.id, 'bi-pencil', 'Modificar franja'),
                crearBotonIcono('eliminar-franja', f.id, 'bi-trash3', 'Eliminar franja')));
            cuerpo.appendChild(tr);
        });
    }

    // Casillas de los días (una vez)
    const cajaDias = $('#cfgTraFrDias');
    cajaDias.replaceChildren(...Object.entries(VIA_DIAS).map(([n, nombre]) => {
        const label = viaElemento('label', 'cfg-si-no');
        const c = document.createElement('input');
        c.type = 'checkbox';
        c.value = n;
        label.append(c, ` ${nombre}`);
        return label;
    }));
    const diasElegidos = () => [...cajaDias.querySelectorAll('input:checked')].map((c) => Number(c.value));

    const camposFranja = {
        nombre: $('#cfgTraFrNombre'), desde: $('#cfgTraFrDesde'), hasta: $('#cfgTraFrHasta'),
        precio_km: $('#cfgTraFrPrecioKm'), cargo_base: $('#cfgTraFrBase'), minimo: $('#cfgTraFrMinimo'), activa: $('#cfgTraFrActiva'),
    };

    function abrirFranja(f = null) {
        editandoFranja = f;
        $('#cfgTraFranjaTitulo').textContent = f ? `Modificar franja ${nombreFranja(f)}` : 'Nueva franja';
        $('#cfgTraFrError').textContent = '';
        camposFranja.nombre.value = f ? f.nombre || '' : '';
        camposFranja.desde.value = f ? viaHHMM(f.desde) : '06:00';
        camposFranja.hasta.value = f ? viaHHMM(f.hasta) : '22:00';
        camposFranja.precio_km.value = f ? f.precio_km : '';
        camposFranja.cargo_base.value = f ? f.cargo_base : '0';
        camposFranja.minimo.value = f ? f.minimo : '0';
        camposFranja.activa.checked = f ? f.activa : true;
        const dias = f ? f.dias.map(Number) : [1, 2, 3, 4, 5, 6];
        cajaDias.querySelectorAll('input').forEach((c) => { c.checked = dias.includes(Number(c.value)); });
        franjaEnPalabras();
        $('#cfgTraFranjaDialogo').showModal();
        camposFranja.nombre.focus();
    }

    // "Lun a Sáb de 06:00 a 22:00: ₡350 por km · mínimo ₡2000. Ej.: 10 km = ₡3500"
    function franjaEnPalabras() {
        const f = {
            dias: diasElegidos(), desde: camposFranja.desde.value, hasta: camposFranja.hasta.value,
            precio_km: Number(camposFranja.precio_km.value) || 0, cargo_base: Number(camposFranja.cargo_base.value) || 0,
            minimo: Number(camposFranja.minimo.value) || 0,
        };
        const p = $('#cfgTraFrPalabras');
        if (!f.dias.length || !f.desde || !f.hasta) { p.textContent = 'Elige los días y el horario.'; return; }
        p.textContent = `${textoDias(f.dias)} de ${f.desde} a ${f.hasta}: `
            + `${f.cargo_base ? `${dinero(f.cargo_base)} + ` : ''}${dinero(f.precio_km)} por km`
            + `${f.minimo ? ` · mínimo ${dinero(f.minimo)}` : ''}. Ej.: 5 km = ${dinero(precioFranja(f, 5, config))} · 10 km = ${dinero(precioFranja(f, 10, config))}`
            + `${Number(config.redondeo) ? ` (redondeado a ${dinero(config.redondeo)})` : ''}.`;
    }
    $('#cfgTraFranjaForm').addEventListener('input', franjaEnPalabras);
    cajaDias.addEventListener('change', franjaEnPalabras);

    $('#cfgTraFranjaForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const error = $('#cfgTraFrError');
        error.textContent = '';
        const dias = diasElegidos();
        const desde = camposFranja.desde.value;
        const hasta = camposFranja.hasta.value;
        const numero = (c) => (c.value.trim() === '' ? 0 : Number(c.value));
        const datos = {
            nombre: camposFranja.nombre.value.trim() || null, dias, desde, hasta,
            precio_km: numero(camposFranja.precio_km), cargo_base: numero(camposFranja.cargo_base), minimo: numero(camposFranja.minimo),
            activa: camposFranja.activa.checked,
        };
        if (!dias.length) { error.textContent = 'Marca al menos un día.'; return; }
        if (!desde || !hasta || hasta <= desde) { error.textContent = 'La hora "Hasta" debe ser después de "Desde".'; return; }
        if (camposFranja.precio_km.value.trim() === '') { error.textContent = 'Escribe el precio por km (puede ser 0 si solo cobras el mínimo).'; return; }
        if ([datos.precio_km, datos.cargo_base, datos.minimo].some((n) => !Number.isFinite(n) || n < 0)) { error.textContent = 'Los montos deben ser números mayores o iguales a 0.'; return; }
        // Aviso inmediato si se encima con otra (la base también lo revisa)
        const choca = datos.activa && franjas.find((f) => f.activa && (!editandoFranja || f.id !== editandoFranja.id)
            && f.dias.some((d) => dias.includes(Number(d))) && viaHHMM(f.desde) < hasta && viaHHMM(f.hasta) > desde);
        if (choca) { error.textContent = `Se encima con ${nombreFranja(choca)} (${textoDias(choca.dias)} ${textoHorario(choca)}).`; return; }

        const boton = $('#cfgTraFrGuardar');
        boton.disabled = true;
        const { error: err } = editandoFranja
            ? await db.from('transporte_franjas').update(datos).eq('id', editandoFranja.id)
            : await db.from('transporte_franjas').insert(datos);
        boton.disabled = false;
        if (err) { error.textContent = viaErrorTexto(err, 'guardar la franja'); return; }
        $('#cfgTraFranjaDialogo').close();
        aviso.mostrar(editandoFranja ? 'Franja actualizada.' : 'Franja creada.');
        cargar();
    });

    $('#cfgTraFrCancelar').addEventListener('click', () => $('#cfgTraFranjaDialogo').close());
    enSeccion('#cfgTraNuevaFranja').addEventListener('click', () => abrirFranja());
    enSeccion('#cfgTraFranjas').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-accion]');
        if (!b) return;
        const f = franjas.find((x) => x.id === Number(b.dataset.id));
        if (!f) return;
        if (b.dataset.accion === 'editar-franja') abrirFranja(f);
        if (b.dataset.accion === 'eliminar-franja') {
            pedirConfirmacion(`¿Eliminar la franja ${nombreFranja(f)} (${textoDias(f.dias)} ${textoHorario(f)})? Los viajes ya reservados no cambian.`, async () => {
                const { error } = await db.from('transporte_franjas').delete().eq('id', f.id);
                if (error) { errorBase(error, 'eliminar la franja'); return; }
                aviso.mostrar('Franja eliminada.');
                cargar();
            });
        }
    });

    // ==================================================
    // 3. SIMULADOR km × franja
    // ==================================================

    function dibujarSimulador() {
        const hasta = Math.min(200, Math.max(1, Number(enSeccion('#cfgTraSimHasta').value) || 20));
        const cada = Math.min(50, Math.max(0.5, Number(enSeccion('#cfgTraSimCada').value) || 2));
        const activas = franjas.filter((f) => f.activa).sort((a, b) => a.desde.localeCompare(b.desde));
        const cab = document.createElement('tr');
        cab.appendChild(viaElemento('th', null, 'Km'));
        activas.forEach((f) => {
            const th = viaElemento('th', 'via-num', nombreFranja(f));
            th.title = `${textoDias(f.dias)} ${textoHorario(f)}`;
            cab.appendChild(th);
        });
        enSeccion('#cfgTraSimCabecera').replaceChildren(cab);
        const cuerpo = enSeccion('#cfgTraSimulador');
        cuerpo.replaceChildren();
        if (!activas.length) { cuerpo.appendChild(crearFilaVacia('Crea una franja para simular precios.', 1)); return; }
        const radio = Number(config.cortesia_radio_km || 0);
        for (let km = cada; km <= hasta + 0.001 && cuerpo.children.length < 200; km += cada) {
            const tr = document.createElement('tr');
            const kmTexto = Math.round(km * 10) / 10;
            const td = viaElemento('td', null, `${kmTexto} km`);
            if (config.cortesia_activa && kmTexto <= radio) td.title = 'Dentro del radio del viaje de cortesía';
            tr.appendChild(td);
            activas.forEach((f) => tr.appendChild(viaElemento('td', 'via-num', dinero(precioFranja(f, kmTexto, config)))));
            cuerpo.appendChild(tr);
        }
    }
    ['#cfgTraSimHasta', '#cfgTraSimCada'].forEach((s) => enSeccion(s).addEventListener('input', dibujarSimulador));

    // ==================================================
    // 4. COSTOS DEL MES
    // ==================================================

    const textoVehiculo = (id) => {
        const v = vehiculos.find((x) => x.id === id);
        return v ? `${v.placa} · ${v.marca}` : 'Toda la empresa';
    };

    function dibujarCostos() {
        const e = resumenCostos.empresa;
        const cuadro = (titulo, valor, detalle) => {
            const d = viaElemento('div', 'resumen-item via-kpi');
            d.append(viaElemento('span', 'resumen-texto', titulo), viaElemento('span', 'resumen-numero', valor), viaElemento('span', 'via-kpi-detalle', detalle));
            return d;
        };
        enSeccion('#cfgTraCostoEmpresa').replaceChildren(
            cuadro('Gasto del mes', dinero((e.fijos || 0) + (e.variables || 0)), `Fijo ${dinero(e.fijos)} · variable ${dinero(e.variables)}`),
            cuadro('Costo por hora', e.costoHora ? dinero(e.costoHora) : '—', e.costoHora ? 'Gasto fijo ÷ horas del mes' : 'Falta: horas al mes de los vehículos'),
            cuadro('Costo por km', e.costoKm ? dinero(e.costoKm) : '—', 'Variable ÷ km del mes + combustible'),
            cuadro('Costo de 1 km (con el tiempo)', e.costoKmTotal ? dinero(e.costoKmTotal) : '—', `A ${config.velocidad_kmh} km/h. Compárelo con el precio por km`),
        );

        const cuerpoV = enSeccion('#cfgTraCostosVehiculos');
        cuerpoV.replaceChildren();
        if (!vehiculos.length) cuerpoV.appendChild(crearFilaVacia('No hay vehículos (Configuración → Vehículos).', 8));
        vehiculos.forEach((v) => {
            const c = resumenCostos.porVehiculo.get(v.id) || {};
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(`${v.placa} · ${v.marca}`));
            tr.appendChild(crearCelda(dinero(c.fijos)));
            tr.appendChild(crearCelda(dinero(c.variables)));
            tr.appendChild(crearCelda([v.horas_mes ? `${v.horas_mes} h` : 'sin horas', v.km_mes ? `${v.km_mes} km` : 'sin km',
                v.km_por_litro ? `${v.km_por_litro} km/l` : null].filter(Boolean).join(' · ')));
            tr.appendChild(crearCelda(c.costoHora != null ? dinero(c.costoHora) : '—'));
            tr.appendChild(crearCelda(c.costoKm ? dinero(c.costoKm) : '—'));
            tr.appendChild(crearCelda(c.viajesReal
                ? `${plural(c.viajesReal, 'viaje', 'viajes')}: ${Math.round(c.horasReal * 10) / 10} h, ${Math.round(c.kmReal)} km → `
                    + `${c.costoHoraReal != null ? `${dinero(c.costoHoraReal)}/h` : '—'} · ${c.costoKmReal != null ? `${dinero(c.costoKmReal)}/km` : '—'}`
                : 'Sin viajes terminados'));
            tr.appendChild(crearCeldaAcciones(crearBotonIcono('editar-vehiculo', v.id, 'bi-pencil', 'Horas, km y rendimiento')));
            cuerpoV.appendChild(tr);
        });

        const cuerpoG = enSeccion('#cfgTraGastos');
        cuerpoG.replaceChildren();
        if (!costos.length) cuerpoG.appendChild(crearFilaVacia('Sin gastos. Usa "Nuevo gasto" (ej. Seguro, fijo, ₡45000 al mes).', 5));
        costos.forEach((g) => {
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(g.concepto));
            tr.appendChild(g.tipo === 'fijo' ? crearCeldaEtiqueta('Fijo', 'etiqueta-azul') : crearCeldaEtiqueta('Variable', 'etiqueta-naranja'));
            tr.appendChild(crearCelda(textoVehiculo(g.vehiculo_id)));
            tr.appendChild(crearCelda(dinero(g.monto_mes)));
            tr.appendChild(crearCeldaAcciones(
                crearBotonIcono('editar-gasto', g.id, 'bi-pencil', 'Modificar gasto'),
                crearBotonIcono('eliminar-gasto', g.id, 'bi-trash3', 'Eliminar gasto')));
            cuerpoG.appendChild(tr);
        });
    }

    // ---------- Gasto ----------
    function abrirGasto(g = null) {
        editandoGasto = g;
        $('#cfgTraGastoTitulo').textContent = g ? `Modificar gasto: ${g.concepto}` : 'Nuevo gasto';
        $('#cfgTraGaError').textContent = '';
        $('#cfgTraGaConcepto').value = g ? g.concepto : '';
        $('#cfgTraGaTipo').value = g ? g.tipo : 'fijo';
        $('#cfgTraGaMonto').value = g ? g.monto_mes : '';
        const sel = $('#cfgTraGaVehiculo');
        sel.replaceChildren(new Option('Toda la empresa', ''), ...vehiculos.map((v) => new Option(`${v.placa} · ${v.marca}`, v.id)));
        sel.value = g && g.vehiculo_id ? String(g.vehiculo_id) : '';
        $('#cfgTraGastoDialogo').showModal();
        $('#cfgTraGaConcepto').focus();
    }

    $('#cfgTraGastoForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const error = $('#cfgTraGaError');
        const concepto = $('#cfgTraGaConcepto').value.trim();
        const monto = Number($('#cfgTraGaMonto').value);
        if (!concepto) { error.textContent = 'Escribe el concepto.'; return; }
        if ($('#cfgTraGaMonto').value.trim() === '' || !Number.isFinite(monto) || monto < 0) { error.textContent = 'Escribe el monto del mes (0 o más).'; return; }
        const datos = { concepto, tipo: $('#cfgTraGaTipo').value, monto_mes: monto, vehiculo_id: Number($('#cfgTraGaVehiculo').value) || null };
        const { error: err } = editandoGasto
            ? await db.from('transporte_costos').update(datos).eq('id', editandoGasto.id)
            : await db.from('transporte_costos').insert(datos);
        if (err) { error.textContent = viaErrorTexto(err, 'guardar el gasto'); return; }
        $('#cfgTraGastoDialogo').close();
        aviso.mostrar(editandoGasto ? 'Gasto actualizado.' : 'Gasto agregado.');
        cargar();
    });
    $('#cfgTraGaCancelar').addEventListener('click', () => $('#cfgTraGastoDialogo').close());
    enSeccion('#cfgTraNuevoGasto').addEventListener('click', () => abrirGasto());

    enSeccion('#cfgTraGastos').addEventListener('click', (e) => {
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

    // ---------- Horas, km y rendimiento de un vehículo ----------
    enSeccion('#cfgTraCostosVehiculos').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-accion="editar-vehiculo"]');
        if (!b) return;
        const v = vehiculos.find((x) => x.id === Number(b.dataset.id));
        if (!v) return;
        editandoVehiculo = v;
        $('#cfgTraVehTitulo').textContent = `Costos de ${v.placa}`;
        $('#cfgTraVeError').textContent = '';
        $('#cfgTraVeHoras').value = v.horas_mes ?? '';
        $('#cfgTraVeKm').value = v.km_mes ?? '';
        $('#cfgTraVeLitro').value = v.km_por_litro ?? '';
        $('#cfgTraVehDialogo').showModal();
    });

    $('#cfgTraVehForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!editandoVehiculo) return;
        const leer = (s) => { const t = $(s).value.trim(); return t === '' ? null : Number(t); };
        const datos = { horas_mes: leer('#cfgTraVeHoras'), km_mes: leer('#cfgTraVeKm'), km_por_litro: leer('#cfgTraVeLitro') };
        if (Object.values(datos).some((n) => n !== null && (!Number.isFinite(n) || n < 0))) { $('#cfgTraVeError').textContent = 'Usa números mayores o iguales a 0.'; return; }
        if (datos.km_por_litro === 0) datos.km_por_litro = null;
        const { error } = await db.from('vehiculos').update(datos).eq('id', editandoVehiculo.id);
        if (error) { $('#cfgTraVeError').textContent = viaErrorTexto(error, 'guardar los datos del vehículo'); return; }
        $('#cfgTraVehDialogo').close();
        aviso.mostrar(`Datos de ${editandoVehiculo.placa} guardados.`);
        cargar();
    });
    $('#cfgTraVeCancelar').addEventListener('click', () => $('#cfgTraVehDialogo').close());

    // ==================================================
    // 5. DÍAS CERRADOS
    // ==================================================

    function dibujarCerrados() {
        const cuerpo = enSeccion('#cfgTraCerrados');
        cuerpo.replaceChildren();
        if (!cerrados.length) cuerpo.appendChild(crearFilaVacia('Sin días cerrados próximos.', 3));
        cerrados.forEach((d) => {
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(new Date(`${d.fecha}T12:00:00`).toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })));
            tr.appendChild(crearCelda(d.motivo || '—'));
            tr.appendChild(crearCeldaAcciones(crearBotonIcono('eliminar-cerrado', d.fecha, 'bi-trash3', 'Quitar este día')));
            cuerpo.appendChild(tr);
        });
    }

    enSeccion('#cfgTraCerradoForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fecha = enSeccion('#cfgTraCerradoFecha').value;
        if (!fecha) { aviso.mostrar('Elige la fecha.', 'error'); return; }
        const { error } = await db.from('transporte_dias_cerrados').insert({ fecha, motivo: enSeccion('#cfgTraCerradoMotivo').value.trim() || null });
        if (error) {
            aviso.mostrar(error.code === '23505' ? 'Ese día ya está cerrado.' : viaErrorTexto(error, 'cerrar el día'), 'error');
            return;
        }
        e.target.reset();
        aviso.mostrar('Día cerrado agregado.');
        cargar();
    });

    enSeccion('#cfgTraCerrados').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-accion="eliminar-cerrado"]');
        if (!b) return;
        pedirConfirmacion(`¿Quitar el día cerrado ${new Date(`${b.dataset.id}T12:00:00`).toLocaleDateString('es-CR')}?`, async () => {
            // El filtro por empresa va explícito: delete no lo agrega solo (js/supabase.js)
            const { error } = await db.from('transporte_dias_cerrados').delete().eq('fecha', b.dataset.id).eq('empresa_id', empresaActivaId());
            if (error) { errorBase(error, 'quitar el día cerrado'); return; }
            aviso.mostrar('Día cerrado quitado.');
            cargar();
        });
    });

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================
    cargar();

    return () => {
        activo = false;
        ['#cfgTraFranjaDialogo', '#cfgTraGastoDialogo', '#cfgTraVehDialogo'].forEach((s) => { const d = $(s); if (d && d.open) d.close(); });
    };
});
