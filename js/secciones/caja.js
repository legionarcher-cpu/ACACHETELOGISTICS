/* ==================================================
   SECCIÓN: CAJA DE PILOTOS Y CONDUCTORES - LÓGICA
   ACACHETE LOGISTICS

   Basada en el cierre de caja de SISCED. Guía: docs/secciones/caja.md.
   Tablas: cajas, cierres_caja, pedidos.cobro_forma / cierre_id, viajes.cobro_forma /
   cierre_id (sql/01 bloque 24). Fondo de cada piloto: Configuración -> Cajas.

   - Cobros sin cerrar del piloto: pedidos entregados con monto a cobrar (total_cobrar)
     y viajes terminados con total. La forma sale de lo que marcó el piloto al entregar
     (cobro_forma), o de la prevista (forma_pago); los viajes, efectivo. Se puede corregir.
   - Efectivo a entregar = fondo de caja + efectivo cobrado.
   - SINPE y tarjeta: entran al cierre solo si se marcan "Verificado"; los demás
     quedan para el siguiente cierre.
   - Cerrar caja: la base (caja_cerrar) revisa quién cierra, toma los montos de los
     pedidos y viajes, guarda el cierre y les pone cierre_id, todo o nada.
   Quién: G3 su tienda | G2 su región | G1 y Administrador todos | el piloto ve la suya.
   #caja?piloto=8 abre directo ese piloto.
   ================================================== */

const CAJ_ENTREGADOS = ['entregado', 'entregado_incidencia'];
const CAJ_FORMAS = { efectivo: 'Efectivo', sinpe: 'SINPE Móvil', tarjeta: 'Tarjeta' };
const cajDinero = (n) => `₡${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const cajFecha = (f) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '—');
const cajRedondo = (n) => Math.round(Number(n || 0) * 100) / 100;

registrarSeccion('caja', (zona) => {
    const $ = (selector) => zona.querySelector(selector);
    const aviso = crearAviso($('#cajAviso'), 5000);
    const sesion = obtenerSesion() || {};

    // ---------- Permisos (js/sesion.js) ----------
    const esGeneral = esAdministrador() || esAdminG1();
    const regionFija = esAdminG2() ? regionActual() : null;
    const tiendaFija = esAdminG3() ? tiendaActual() : null;
    const esPiloto = rolActual() === 'piloto';
    const puedeCerrar = esGeneral || !!regionFija || !!tiendaFija;
    const conViajes = typeof empresaTieneViajes === 'function' && empresaTieneViajes();

    // ---------- Elementos ----------
    const selPiloto = $('#cajPiloto');
    const botonCerrar = $('#cajCerrar');
    const cuerpoCobros = $('#cajCobros');
    const cuerpoCierres = $('#cajCierres');
    const campoContado = $('#cajContado');
    const dlgConfirmar = $('#cajConfirmar');

    // ---------- Estado ----------
    let pilotos = [];
    let pendientesPor = new Map(); // piloto id -> cobros sin cerrar
    let piloto = null;
    let cobros = [];               // [{ tipo, id, codigo, cliente, fecha, monto, forma, verificado }]
    let hayTabla = true;
    let cargaId = 0;

    const faltaSql = (e) => !!e && ['42703', 'PGRST204', '42P01', 'PGRST205', 'PGRST200'].includes(e.code);
    const formaElegida = () => (zona.querySelector('input[name="cajForma"]:checked') || {}).value || '';
    const textoTienda = (p) => (p.tiendas ? `${p.tiendas.codigo} · ${p.tiendas.nombre}` : 'Sin tienda');

    // ==================================================
    // TOTALES
    // ==================================================

    function totales() {
        const suma = (lista) => cajRedondo(lista.reduce((s, c) => s + Number(c.monto), 0));
        const efectivo = cobros.filter((c) => c.forma === 'efectivo');
        const otros = cobros.filter((c) => c.forma !== 'efectivo');
        const verificados = otros.filter((c) => c.verificado);
        const fondo = cajRedondo(piloto ? piloto.caja_monto : 0);
        return {
            fondo,
            efectivo: suma(efectivo), cantEfectivo: efectivo.length,
            otros: suma(otros), cantOtros: otros.length,
            sinpeVerificado: suma(verificados.filter((c) => c.forma === 'sinpe')),
            tarjetaVerificada: suma(verificados.filter((c) => c.forma === 'tarjeta')),
            cantVerificados: verificados.length,
            esperado: cajRedondo(fondo + suma(efectivo)),
            alCierre: [...efectivo, ...verificados],
        };
    }

    function dibujarTotales() {
        const t = totales();
        $('#cajFondo').textContent = cajDinero(t.fondo);
        $('#cajEfectivo').textContent = cajDinero(t.efectivo);
        $('#cajEfectivoTexto').textContent = `Efectivo cobrado · ${plural(t.cantEfectivo, 'cobro', 'cobros')}`;
        $('#cajOtros').textContent = cajDinero(t.otros);
        $('#cajOtrosTexto').textContent = t.cantOtros ? `SINPE y tarjeta · ${t.cantVerificados} de ${t.cantOtros} verificados` : 'SINPE y tarjeta';
        $('#cajEsperado').textContent = cajDinero(t.esperado);
        dibujarDiferencia();
        botonCerrar.disabled = !puedeCerrar || !hayTabla || !piloto;
    }

    function dibujarDiferencia() {
        const caja = $('#cajDiferencia');
        caja.className = 'caj-diferencia';
        if (campoContado.value === '') { caja.textContent = '—'; return; }
        const dif = cajRedondo(Number(campoContado.value) - totales().esperado);
        if (dif === 0) {
            caja.textContent = 'Cuadra exacto';
            caja.classList.add('caj-diferencia-ok');
        } else {
            caja.textContent = `${dif > 0 ? 'Sobrante' : 'Faltante'} de ${cajDinero(Math.abs(dif))}`;
            caja.classList.add(dif > 0 ? 'caj-diferencia-sobra' : 'caj-diferencia-falta');
        }
    }
    campoContado.addEventListener('input', dibujarDiferencia);

    // ==================================================
    // CARGAR
    // ==================================================

    async function cargarPilotos() {
        let q = db.from('usuarios')
            .select('id, nombre, id_usuario, foto_url, tienda_id, caja_monto, caja_id, tiendas(codigo, nombre, region), cajas(nombre)')
            .eq('rol', 'piloto').order('nombre');
        if (esPiloto) q = q.eq('id', sesion.id || 0);
        else if (tiendaFija) q = q.eq('tienda_id', tiendaFija);
        let { data, error } = await q;
        if (error && faltaSql(error)) {
            // Sin el bloque 24 (no hay caja_monto ni la tabla cajas)
            hayTabla = false;
            let q2 = db.from('usuarios').select('id, nombre, id_usuario, foto_url, tienda_id, tiendas(codigo, nombre, region)')
                .eq('rol', 'piloto').order('nombre');
            if (esPiloto) q2 = q2.eq('id', sesion.id || 0);
            else if (tiendaFija) q2 = q2.eq('tienda_id', tiendaFija);
            ({ data, error } = await q2);
        }
        if (error) {
            console.error('Error al cargar los pilotos:', error);
            $('#cajSubtitulo').textContent = 'No se pudo cargar la lista.';
            aviso.mostrar('No se pudieron cargar los pilotos. Revisa la conexión.', 'error');
            return false;
        }
        pilotos = regionFija ? data.filter((p) => p.tiendas && p.tiendas.region === regionFija) : data;
        $('#cajFaltaSql').hidden = hayTabla;

        // Cuántos cobros sin cerrar tiene cada uno (para elegir rápido)
        pendientesPor = new Map();
        if (hayTabla && pilotos.length) {
            const ids = pilotos.map((p) => p.id);
            const sumar = (id) => pendientesPor.set(id, (pendientesPor.get(id) || 0) + 1);
            const [ped, via] = await Promise.all([
                db.from('pedidos').select('piloto_id').in('piloto_id', ids).is('cierre_id', null)
                    .eq('anulado', false).in('estado', CAJ_ENTREGADOS).gt('total_cobrar', 0),
                conViajes
                    ? db.from('viajes').select('conductor_id').in('conductor_id', ids).is('cierre_id', null).eq('estado', 'terminado').gt('total', 0)
                    : Promise.resolve({ data: [] }),
            ]);
            if (ped.error && faltaSql(ped.error)) { hayTabla = false; $('#cajFaltaSql').hidden = false; }
            (ped.data || []).forEach((x) => sumar(x.piloto_id));
            (via.data || []).forEach((x) => sumar(x.conductor_id));
        }
        llenarSelector();
        return true;
    }

    function llenarSelector() {
        const actual = selPiloto.value;
        selPiloto.replaceChildren(new Option(pilotos.length ? 'Elige un piloto' : 'No hay pilotos', ''));
        const grupos = new Map();
        pilotos.forEach((p) => {
            const clave = textoTienda(p);
            if (!grupos.has(clave)) grupos.set(clave, []);
            grupos.get(clave).push(p);
        });
        [...grupos.keys()].sort().forEach((clave) => {
            const grupo = document.createElement('optgroup');
            grupo.label = clave;
            grupos.get(clave).forEach((p) => {
                const n = pendientesPor.get(p.id) || 0;
                grupo.appendChild(new Option(`${p.nombre}${n ? ` · ${plural(n, 'cobro', 'cobros')} sin cerrar` : ''}`, p.id));
            });
            selPiloto.appendChild(grupo);
        });
        selPiloto.value = actual;
        const conPendientes = pilotos.filter((p) => pendientesPor.get(p.id)).length;
        $('#cajSubtitulo').textContent = esPiloto
            ? 'Tu fondo de caja y lo que tienes cobrado sin cerrar'
            : `${plural(pilotos.length, 'piloto', 'pilotos')} · ${conPendientes} con cobros sin cerrar`;
    }

    async function elegirPiloto(id) {
        piloto = pilotos.find((p) => p.id === Number(id)) || null;
        $('#cajContenido').hidden = !piloto;
        $('#cajSinPiloto').hidden = !!piloto;
        campoContado.value = '';
        $('#cajNotas').value = '';
        cobros = [];
        if (!piloto) { botonCerrar.disabled = true; return; }

        if (typeof pintarAvatar === 'function') pintarAvatar($('#cajAvatar'), piloto.nombre, piloto.foto_url); // js/avatar.js
        $('#cajNombre').textContent = piloto.nombre;
        $('#cajDetalle').textContent = [piloto.id_usuario, textoTienda(piloto),
            piloto.cajas ? `Caja: ${piloto.cajas.nombre}` : 'Caja: monto propio'].join(' · ');

        dibujarTotales();
        cuerpoCobros.replaceChildren(crearFilaVacia('Cargando cobros...', 6));
        cuerpoCierres.replaceChildren(crearFilaVacia('Cargando cierres...', 9));
        await Promise.all([cargarCobros(), cargarCierres()]);
    }

    async function cargarCobros() {
        const id = ++cargaId;
        if (!hayTabla) {
            cuerpoCobros.replaceChildren(crearFilaVacia('Falta ejecutar sql/01 (bloque 24).', 6));
            return;
        }
        const [ped, via] = await Promise.all([
            db.from('pedidos').select('id, codigo, cliente_nombre, total_cobrar, forma_pago, cobro_forma, fecha_entrega, finalizado_en')
                .eq('piloto_id', piloto.id).is('cierre_id', null).eq('anulado', false)
                .in('estado', CAJ_ENTREGADOS).gt('total_cobrar', 0).order('fecha_entrega'),
            conViajes
                ? db.from('viajes').select('id, codigo, cliente_nombre, total, cobro_forma, inicio')
                    .eq('conductor_id', piloto.id).is('cierre_id', null).eq('estado', 'terminado').gt('total', 0).order('inicio')
                : Promise.resolve({ data: [] }),
        ]);
        if (id !== cargaId) return;
        if (ped.error) {
            console.error('Error al cargar los cobros:', ped.error);
            cuerpoCobros.replaceChildren(crearFilaVacia('No se pudieron cargar los cobros.', 6));
            return;
        }
        cobros = [
            ...ped.data.map((p) => ({
                tipo: 'pedido', id: p.id, codigo: p.codigo, cliente: p.cliente_nombre,
                fecha: p.finalizado_en || p.fecha_entrega, monto: Number(p.total_cobrar),
                forma: p.cobro_forma || (p.forma_pago === 'tarjeta' ? 'tarjeta' : 'efectivo'), verificado: false,
            })),
            ...(via.data || []).map((v) => ({
                tipo: 'viaje', id: v.id, codigo: v.codigo, cliente: v.cliente_nombre,
                fecha: v.inicio, monto: Number(v.total), forma: v.cobro_forma || 'efectivo', verificado: false,
            })),
        ].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
        dibujarCobros();
        dibujarTotales();
    }

    async function cargarCierres() {
        if (!hayTabla) {
            cuerpoCierres.replaceChildren(crearFilaVacia('Falta ejecutar sql/01 (bloque 24).', 9));
            return;
        }
        const { data, error } = await db.from('cierres_caja')
            .select('id, fecha, cantidad, fondo, efectivo, sinpe, tarjeta, efectivo_contado, diferencia, notas, cerrado_por_nombre')
            .eq('piloto_id', piloto.id).order('cerrado_en', { ascending: false }).limit(20);
        if (error) {
            console.error('Error al cargar los cierres:', error);
            cuerpoCierres.replaceChildren(crearFilaVacia('No se pudieron cargar los cierres.', 9));
            return;
        }
        cuerpoCierres.replaceChildren();
        if (!data.length) {
            cuerpoCierres.appendChild(crearFilaVacia('Todavía no tiene cierres.', 9));
            return;
        }
        data.forEach((c) => {
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(cajFecha(c.fecha)));
            tr.appendChild(crearCelda(String(c.cantidad)));
            ['fondo', 'efectivo', 'sinpe', 'tarjeta', 'efectivo_contado'].forEach((k) => tr.appendChild(crearCelda(cajDinero(c[k]), 'caj-col-monto')));
            const dif = Number(c.diferencia);
            const td = crearCelda(dif === 0 ? 'Cuadra' : `${dif > 0 ? '+' : '−'}${cajDinero(Math.abs(dif))}`, 'caj-col-monto');
            if (dif !== 0) td.classList.add(dif > 0 ? 'caj-texto-sobra' : 'caj-texto-falta');
            if (c.notas) td.title = c.notas;
            tr.appendChild(td);
            tr.appendChild(crearCelda(c.cerrado_por_nombre));
            cuerpoCierres.appendChild(tr);
        });
    }

    // ==================================================
    // TABLA DE COBROS
    // ==================================================

    function dibujarCobros() {
        const forma = formaElegida();
        const lista = cobros.filter((c) => !forma || c.forma === forma);
        cuerpoCobros.replaceChildren();
        if (!lista.length) {
            cuerpoCobros.appendChild(crearFilaVacia(cobros.length ? 'No hay cobros de esa forma de pago.' : 'No tiene cobros sin cerrar.', 6));
            return;
        }
        lista.forEach((c) => {
            const tr = document.createElement('tr');
            const otro = c.forma !== 'efectivo';
            if (otro && c.verificado) tr.classList.add('caj-fila-verificada');
            tr.appendChild(crearCelda(cajFecha(c.fecha)));

            const tdCod = document.createElement('td');
            const link = document.createElement('a');
            link.href = c.tipo === 'pedido' ? `#pedidos?id=${c.id}` : `#viajes?id=${c.id}`;
            link.className = 'texto-codigo';
            link.textContent = c.codigo || `#${c.id}`;
            tdCod.appendChild(link);
            tr.appendChild(tdCod);
            tr.appendChild(crearCelda(c.cliente));

            // Forma: quien cierra la puede corregir; el piloto solo la ve
            const tdForma = document.createElement('td');
            if (puedeCerrar) {
                const sel = document.createElement('select');
                sel.className = 'campo-input caj-forma';
                sel.dataset.forma = `${c.tipo}:${c.id}`;
                Object.entries(CAJ_FORMAS).forEach(([v, t]) => sel.appendChild(new Option(t, v)));
                sel.value = c.forma;
                sel.setAttribute('aria-label', `Forma de pago de ${c.codigo}`);
                tdForma.appendChild(sel);
            } else {
                const e = document.createElement('span');
                e.className = `etiqueta ${c.forma === 'efectivo' ? 'etiqueta-verde' : 'etiqueta-azul'}`;
                e.textContent = CAJ_FORMAS[c.forma];
                tdForma.appendChild(e);
            }
            tr.appendChild(tdForma);
            tr.appendChild(crearCelda(cajDinero(c.monto), 'caj-col-monto'));

            const tdCheck = document.createElement('td');
            tdCheck.className = 'caj-col-check';
            if (otro) {
                const check = document.createElement('input');
                check.type = 'checkbox';
                check.className = 'caj-check';
                check.dataset.verificar = `${c.tipo}:${c.id}`;
                check.checked = c.verificado;
                check.disabled = !puedeCerrar;
                check.setAttribute('aria-label', `Verificado en el banco: ${cajDinero(c.monto)}`);
                tdCheck.appendChild(check);
            } else {
                tdCheck.textContent = '—';
            }
            tr.appendChild(tdCheck);
            cuerpoCobros.appendChild(tr);
        });
    }

    const cobroDe = (clave) => cobros.find((c) => `${c.tipo}:${c.id}` === clave);

    cuerpoCobros.addEventListener('change', (e) => {
        const sel = e.target.closest('select[data-forma]');
        if (sel) {
            const c = cobroDe(sel.dataset.forma);
            if (c) { c.forma = sel.value; c.verificado = false; }
        }
        const check = e.target.closest('input[data-verificar]');
        if (check) {
            const c = cobroDe(check.dataset.verificar);
            if (c) c.verificado = check.checked;
        }
        dibujarCobros();
        dibujarTotales();
    });
    zona.querySelectorAll('input[name="cajForma"]').forEach((r) => r.addEventListener('change', dibujarCobros));

    // ==================================================
    // CERRAR CAJA
    // ==================================================

    botonCerrar.addEventListener('click', () => {
        if (!piloto || !puedeCerrar) return;
        if (campoContado.value === '' || Number(campoContado.value) < 0) {
            aviso.mostrar('Escribe el efectivo contado (0 o más) para cerrar la caja.', 'error');
            campoContado.focus();
            return;
        }
        const t = totales();
        const dif = cajRedondo(Number(campoContado.value) - t.esperado);
        $('#cajConfirmarLista').replaceChildren(...[
            ['Fondo de caja', cajDinero(t.fondo)],
            ['Efectivo cobrado', `${cajDinero(t.efectivo)} (${plural(t.cantEfectivo, 'cobro', 'cobros')})`],
            ['SINPE verificado', cajDinero(t.sinpeVerificado)],
            ['Tarjeta verificada', cajDinero(t.tarjetaVerificada)],
            ['Efectivo a entregar', cajDinero(t.esperado)],
            ['Efectivo contado', cajDinero(campoContado.value)],
            ['Diferencia', dif === 0 ? 'Cuadra exacto' : `${dif > 0 ? 'Sobrante' : 'Faltante'} de ${cajDinero(Math.abs(dif))}`],
        ].map(([etiqueta, valor]) => {
            const li = document.createElement('li');
            const s = document.createElement('span');
            s.textContent = etiqueta;
            const b = document.createElement('strong');
            b.textContent = valor;
            li.append(s, b);
            return li;
        }));
        const sinVerificar = t.cantOtros - t.cantVerificados;
        $('#cajConfirmarNota').textContent = sinVerificar
            ? `${plural(sinVerificar, 'cobro con SINPE o tarjeta sin verificar queda', 'cobros con SINPE o tarjeta sin verificar quedan')} para el siguiente cierre.`
            : 'Los cobros incluidos quedan cerrados y ya no se pueden cambiar.';
        dlgConfirmar.showModal();
    });

    $('#cajConfirmarNo').addEventListener('click', () => dlgConfirmar.close());
    $('#cajConfirmarSi').addEventListener('click', async () => {
        const boton = $('#cajConfirmarSi');
        boton.disabled = true;
        const t = totales();
        const de = (tipo) => t.alCierre.filter((c) => c.tipo === tipo).map((c) => ({ id: c.id, forma: c.forma }));
        const { data, error } = await db.rpc('caja_cerrar', {
            p: {
                usuario_id: sesion.id || null, piloto_id: piloto.id, contado: cajRedondo(campoContado.value),
                notas: $('#cajNotas').value.trim() || null, pedidos: de('pedido'), viajes: de('viaje'),
            },
        });
        boton.disabled = false;
        dlgConfirmar.close();
        if (error) {
            console.error('Error al cerrar la caja:', error);
            aviso.mostrar(error.code === 'P0001' ? error.message
                : ['PGRST202', '42883'].includes(error.code) ? 'Falta ejecutar sql/01 (bloque 24) para cerrar cajas.'
                    : 'No se pudo cerrar la caja. Revisa la conexión.', 'error');
            return;
        }
        const dif = Number(data && data.diferencia);
        aviso.mostrar(`Caja de ${piloto.nombre} cerrada: ${plural(Number(data.cantidad), 'cobro', 'cobros')}`
            + `${dif ? ` · ${dif > 0 ? 'sobrante' : 'faltante'} de ${cajDinero(Math.abs(dif))}` : ' · cuadra exacto'}.`);
        const id = piloto.id;
        await cargarPilotos();
        selPiloto.value = String(id);
        elegirPiloto(id);
    });

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================

    selPiloto.addEventListener('change', () => {
        history.replaceState(null, '', selPiloto.value ? `#caja?piloto=${selPiloto.value}` : '#caja');
        elegirPiloto(selPiloto.value);
    });

    // El piloto solo ve su caja: sin selector, sin arqueo y sin cerrar
    if (!puedeCerrar) {
        botonCerrar.hidden = true;
        $('#cajArqueoCaja').hidden = true;
        $('#cajAyuda').textContent = 'Lo que tienes cobrado y todavía no se ha cerrado. La tienda revisa el SINPE y la tarjeta en el banco y cierra tu caja.';
    }
    selPiloto.hidden = esPiloto;

    (async () => {
        if (!(await cargarPilotos())) return;
        const pedido = esPiloto ? String(sesion.id || '')
            : parametrosSeccion().get('piloto') || (pilotos.length === 1 ? String(pilotos[0].id) : '');
        if (pedido && pilotos.some((p) => String(p.id) === pedido)) {
            selPiloto.value = pedido;
            elegirPiloto(pedido);
        }
    })();

    return () => {
        aviso.limpiar();
        cargaId++;
        if (dlgConfirmar.open) dlgConfirmar.close();
    };
});
