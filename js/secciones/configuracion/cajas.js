/* ==================================================
   CONFIGURACIÓN -> CAJAS
   ACACHETE LOGISTICS

   Lo carga js/secciones/configuracion.js la primera vez que se abre la tarjeta
   "Cajas" (si el plan de la empresa incluye "caja"; Administrador y Admin G1).
   Tablas: cajas y usuarios.caja_id / caja_monto (sql/01 bloque 24).

   1. Tipos de caja: nombre y monto (ej. "Caja básica" ₡50 000). Al cambiar el monto,
      cambia el fondo de los pilotos que lo usan. Al eliminarlo, esos pilotos quedan
      con "monto propio" (el mismo monto).
   2. Fondo de cada piloto o conductor: un tipo de caja o un monto propio.
   El arqueo y el cierre se hacen en la sección Caja (js/secciones/caja.js).
   ================================================== */

registrarModuloConfig('cajas', (seccion, ctx) => {
    const { zona, aviso, pedirConfirmacion } = ctx;
    const $ = (selector) => zona.querySelector(selector);         // ventanas (fuera del <section>)
    const enSeccion = (selector) => seccion.querySelector(selector);

    let cajas = [];
    let pilotos = [];
    let editando = null;
    let activo = true;

    const dinero = (n) => `₡${Number(n || 0).toLocaleString('es-CR', { maximumFractionDigits: 2 })}`;
    const faltaSql = (e) => !!e && ['42703', 'PGRST204', '42P01', 'PGRST205', 'PGRST200'].includes(e.code);

    // ==================================================
    // CARGAR
    // ==================================================

    async function cargar() {
        const [caj, pil] = await Promise.all([
            db.from('cajas').select('id, nombre, monto').order('monto').order('nombre'),
            db.from('usuarios').select('id, nombre, id_usuario, caja_id, caja_monto, tiendas(codigo, nombre)')
                .eq('rol', 'piloto').order('nombre'),
        ]);
        if (!activo) return;
        const error = caj.error || pil.error;
        enSeccion('#cfgCajFaltaSql').hidden = !faltaSql(error);
        enSeccion('#cfgCajContenido').hidden = faltaSql(error);
        if (error) {
            if (!faltaSql(error)) {
                console.error('Error al cargar las cajas:', error);
                aviso.mostrar('No se pudieron cargar las cajas. Revisa la conexión.', 'error');
            }
            return;
        }
        cajas = caj.data;
        pilotos = pil.data;
        dibujarTipos();
        dibujarPilotos();
    }

    // ==================================================
    // 1. TIPOS DE CAJA
    // ==================================================

    function dibujarTipos() {
        const cuerpo = enSeccion('#cfgCajTipos');
        cuerpo.replaceChildren();
        if (!cajas.length) {
            cuerpo.appendChild(crearFilaVacia('Sin tipos de caja. Usa "Nueva caja" (ej. Caja básica, ₡50 000) o escribe un monto propio a cada piloto.', 4));
            return;
        }
        cajas.forEach((c) => {
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(c.nombre));
            tr.appendChild(crearCelda(dinero(c.monto)));
            tr.appendChild(crearCelda(String(pilotos.filter((p) => p.caja_id === c.id).length)));
            tr.appendChild(crearCeldaAcciones(
                crearBotonIcono('editar-caja', c.id, 'bi-pencil', `Modificar ${c.nombre}`),
                crearBotonIcono('eliminar-caja', c.id, 'bi-trash3', `Eliminar ${c.nombre}`)));
            cuerpo.appendChild(tr);
        });
    }

    function abrirCaja(c = null) {
        editando = c;
        $('#cfgCajTitulo').textContent = c ? `Modificar ${c.nombre}` : 'Nueva caja';
        $('#cfgCajError').textContent = '';
        $('#cfgCajNombre').value = c ? c.nombre : '';
        $('#cfgCajMonto').value = c ? Number(c.monto) : '';
        $('#cfgCajDialogo').showModal();
        $('#cfgCajNombre').focus();
    }

    enSeccion('#cfgCajNueva').addEventListener('click', () => abrirCaja());
    $('#cfgCajCancelar').addEventListener('click', () => $('#cfgCajDialogo').close());

    $('#cfgCajForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const error = $('#cfgCajError');
        const nombre = $('#cfgCajNombre').value.trim();
        const monto = Number($('#cfgCajMonto').value);
        if (!nombre) { error.textContent = 'Escribe el nombre.'; return; }
        if ($('#cfgCajMonto').value.trim() === '' || !Number.isFinite(monto) || monto < 0) { error.textContent = 'Escribe el monto (0 o más).'; return; }
        const datos = { nombre, monto: Math.round(monto * 100) / 100 };
        const { error: err } = editando
            ? await db.from('cajas').update(datos).eq('id', editando.id)
            : await db.from('cajas').insert(datos);
        if (err) {
            console.error('Error al guardar la caja:', err);
            error.textContent = err.code === '23505' ? 'Ya hay una caja con ese nombre.' : 'No se pudo guardar. Revisa la conexión.';
            return;
        }
        // El fondo de los pilotos que usan este tipo pasa al monto nuevo
        if (editando && Number(editando.monto) !== datos.monto) {
            const upd = await db.from('usuarios').update({ caja_monto: datos.monto }).eq('caja_id', editando.id);
            if (upd.error) console.error('Error al actualizar el fondo de los pilotos:', upd.error);
        }
        $('#cfgCajDialogo').close();
        aviso.mostrar(editando ? `Caja ${nombre} actualizada.` : `Caja ${nombre} creada.`);
        cargar();
    });

    enSeccion('#cfgCajTipos').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-accion]');
        if (!b) return;
        const c = cajas.find((x) => x.id === Number(b.dataset.id));
        if (!c) return;
        if (b.dataset.accion === 'editar-caja') abrirCaja(c);
        if (b.dataset.accion === 'eliminar-caja') {
            const n = pilotos.filter((p) => p.caja_id === c.id).length;
            pedirConfirmacion(`¿Eliminar la caja "${c.nombre}"?${n ? ` ${plural(n, 'piloto queda', 'pilotos quedan')} con monto propio de ${dinero(c.monto)}.` : ''}`, async () => {
                const { error } = await db.from('cajas').delete().eq('id', c.id);
                if (error) {
                    console.error('Error al eliminar la caja:', error);
                    aviso.mostrar('No se pudo eliminar la caja.', 'error');
                    return;
                }
                aviso.mostrar(`Caja ${c.nombre} eliminada.`);
                cargar();
            });
        }
    });

    // ==================================================
    // 2. FONDO DE CADA PILOTO
    // ==================================================

    function dibujarPilotos() {
        const cuerpo = enSeccion('#cfgCajPilotos');
        cuerpo.replaceChildren();
        if (!pilotos.length) {
            cuerpo.appendChild(crearFilaVacia('No hay pilotos ni conductores (se crean en Usuarios).', 5));
            return;
        }
        pilotos.forEach((p) => {
            const tr = document.createElement('tr');
            tr.dataset.piloto = p.id;
            tr.appendChild(crearCelda(`${p.nombre} (${p.id_usuario})`));
            tr.appendChild(crearCelda(p.tiendas ? `${p.tiendas.codigo} · ${p.tiendas.nombre}` : '—'));

            const tdTipo = document.createElement('td');
            const sel = document.createElement('select');
            sel.className = 'campo-input';
            sel.dataset.tipo = '1';
            sel.setAttribute('aria-label', `Tipo de caja de ${p.nombre}`);
            sel.appendChild(new Option('Monto propio', ''));
            cajas.forEach((c) => sel.appendChild(new Option(`${c.nombre} · ${dinero(c.monto)}`, c.id)));
            sel.value = p.caja_id && cajas.some((c) => c.id === p.caja_id) ? String(p.caja_id) : '';
            tdTipo.appendChild(sel);
            tr.appendChild(tdTipo);

            const tdMonto = document.createElement('td');
            const monto = document.createElement('input');
            monto.type = 'number';
            monto.min = 0;
            monto.step = 100;
            monto.className = 'campo-input cfg-numero';
            monto.dataset.monto = '1';
            monto.value = Number(p.caja_monto || 0);
            monto.readOnly = !!sel.value;
            monto.setAttribute('aria-label', `Fondo de ${p.nombre}`);
            tdMonto.appendChild(monto);
            tr.appendChild(tdMonto);

            tr.appendChild(crearCeldaAcciones(crearBotonIcono('guardar-fondo', p.id, 'bi-check2', `Guardar el fondo de ${p.nombre}`)));
            cuerpo.appendChild(tr);
        });
    }

    // Elegir un tipo pone su monto (y no se escribe a mano)
    enSeccion('#cfgCajPilotos').addEventListener('change', (e) => {
        const sel = e.target.closest('select[data-tipo]');
        if (!sel) return;
        const monto = sel.closest('tr').querySelector('input[data-monto]');
        const caja = cajas.find((c) => c.id === Number(sel.value));
        if (caja) monto.value = Number(caja.monto);
        monto.readOnly = !!caja;
    });

    enSeccion('#cfgCajPilotos').addEventListener('click', async (e) => {
        const b = e.target.closest('button[data-accion="guardar-fondo"]');
        if (!b) return;
        const tr = b.closest('tr');
        const p = pilotos.find((x) => x.id === Number(tr.dataset.piloto));
        if (!p) return;
        const cajaId = Number(tr.querySelector('select[data-tipo]').value) || null;
        const monto = Number(tr.querySelector('input[data-monto]').value);
        if (!Number.isFinite(monto) || monto < 0) { aviso.mostrar('El fondo debe ser 0 o más.', 'error'); return; }
        b.disabled = true;
        const { error } = await db.from('usuarios').update({ caja_id: cajaId, caja_monto: Math.round(monto * 100) / 100 }).eq('id', p.id);
        b.disabled = false;
        if (error) {
            console.error('Error al guardar el fondo:', error);
            aviso.mostrar('No se pudo guardar el fondo.', 'error');
            return;
        }
        p.caja_id = cajaId;
        p.caja_monto = monto;
        dibujarTipos();
        aviso.mostrar(`Fondo de ${p.nombre}: ${dinero(monto)}.`);
    });

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================
    cargar();

    return () => {
        activo = false;
        const d = $('#cfgCajDialogo');
        if (d && d.open) d.close();
    };
});
