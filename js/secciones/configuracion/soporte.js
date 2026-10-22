/* ==================================================
   CONFIGURACIÓN -> SOPORTE
   ACACHETE LOGISTICS

   Lo carga js/secciones/configuracion.js la primera vez que se abre la tarjeta "Soporte"
   (el Admin TI y el Administrador de la empresa; js/sesion.js: esAdminTI).
   Base: sql/instalacion/01_base.sql (tablas soporte_llaves y soporte_bitacora).

   1. Nueva llave: dura 1, 4 o 24 horas y es "Solo ver" o "Ver y corregir"
      (soporte_crear_llave). El código se ve UNA vez; una llave nueva anula la anterior.
   2. Llaves: las últimas 30, con quién las creó y si el Desarrollador ya entró con ellas.
      Una vigente se anula con soporte_anular_llave.
   3. Bitácora: lo que vio y cambió el Desarrollador y quién dio, usó o anuló las llaves.
      Nadie la puede cambiar ni borrar.
   El Desarrollador escribe el código en el aviso de soporte de su campana (js/soporte.js).
   ================================================== */

// Cómo se lee cada acción de la bitácora
const SOP_ACCIONES = {
    llave_creada: 'Creó una llave',
    llave_usada: 'Entró con la llave',
    llave_anulada: 'Anuló una llave',
    codigo_equivocado: 'Escribió un código equivocado',
    llaves_bloqueadas: 'Llave bloqueada (5 códigos equivocados)',
    vio: 'Abrió una pantalla',
    creo: 'Creó un registro',
    cambio: 'Cambió un registro',
    borro: 'Borró un registro',
    bloqueo: 'Bloqueó a un usuario',
    desbloqueo: 'Desbloqueó a un usuario',
    cerro_sesiones: 'Cerró las sesiones de un usuario',
};

const SOP_ALCANCE = { ver: 'Solo ver', corregir: 'Ver y corregir' };

registrarModuloConfig('soporte', (seccion, ctx) => {
    const { aviso, pedirConfirmacion } = ctx;
    const enSeccion = (selector) => seccion.querySelector(selector);

    let llaves = [];
    let activo = true;

    const fechaHora = (f) => (f ? new Date(f).toLocaleString('es-CR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
    const faltaSql = (e) => !!e && ['42883', 'PGRST202', '42P01', 'PGRST205'].includes(e.code);

    // ==================================================
    // CARGAR
    // ==================================================

    async function cargar() {
        const [lla, bit] = await Promise.all([
            db.rpc('soporte_llaves_empresa'),
            db.from('soporte_bitacora').select('id, creado_en, usuario, accion, tabla, registro, detalle')
                .order('creado_en', { ascending: false }).limit(200),
        ]);
        if (!activo) return;
        const error = lla.error || bit.error;
        enSeccion('#cfgSopFaltaSql').hidden = !faltaSql(error);
        enSeccion('#cfgSopContenido').hidden = faltaSql(error);
        if (error) {
            if (!faltaSql(error)) {
                console.error('Error al cargar el soporte:', error);
                aviso.mostrar('No se pudieron cargar las llaves de soporte. Revisa la conexión.', 'error');
            }
            return;
        }
        llaves = lla.data || [];
        dibujarLlaves();
        dibujarBitacora(bit.data || []);
    }

    // ==================================================
    // 1. NUEVA LLAVE
    // ==================================================

    enSeccion('#cfgSopForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const horas = Number(enSeccion('#cfgSopHoras').value);
        const alcance = enSeccion('#cfgSopAlcance').value;
        const crear = async () => {
            const boton = enSeccion('#cfgSopCrear');
            boton.disabled = true;
            const { data, error } = await db.rpc('soporte_crear_llave', { p_horas: horas, p_alcance: alcance });
            boton.disabled = false;
            if (error) {
                console.error('Error al crear la llave:', error);
                aviso.mostrar(error.code === '42501' || error.code === 'P0001' ? error.message : 'No se pudo crear la llave.', 'error');
                return;
            }
            enSeccion('#cfgSopCodigoTexto').textContent = data.codigo;
            enSeccion('#cfgSopCodigoDetalle').textContent = `${SOP_ALCANCE[data.alcance]} · vence ${fechaHora(data.vence_en)}. No se volverá a mostrar.`;
            enSeccion('#cfgSopCodigo').hidden = false;
            cargar();
        };
        // Hay una vigente: la nueva la reemplaza
        if (llaves.some((l) => l.vigente)) {
            pedirConfirmacion('Ya hay una llave vigente: al crear otra, la anterior deja de servir. ¿Continuar?', crear);
            return;
        }
        crear();
    });

    enSeccion('#cfgSopCopiar').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(enSeccion('#cfgSopCodigoTexto').textContent);
            aviso.mostrar('Código copiado.');
        } catch {
            aviso.mostrar('No se pudo copiar: selecciona el código y cópialo a mano.', 'error');
        }
    });

    // ==================================================
    // 2. LLAVES
    // ==================================================

    function estadoLlave(l) {
        if (l.anulada_en) return ['Anulada', 'etiqueta-gris'];
        if (!l.vigente) return ['Vencida', 'etiqueta-gris'];
        return l.usada_en ? ['En uso', 'etiqueta-naranja'] : ['Sin usar', 'etiqueta-verde'];
    }

    function dibujarLlaves() {
        const cuerpo = enSeccion('#cfgSopLlaves');
        cuerpo.replaceChildren();
        if (!llaves.length) {
            cuerpo.appendChild(crearFilaVacia('Todavía no se ha creado ninguna llave.', 6));
            return;
        }
        llaves.forEach((l) => {
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(`${fechaHora(l.creada_en)}${l.creada_por ? ` · ${l.creada_por}` : ''}`));
            tr.appendChild(crearCelda(SOP_ALCANCE[l.alcance] || l.alcance));
            tr.appendChild(crearCelda(fechaHora(l.vence_en)));
            tr.appendChild(crearCelda(l.usada_en ? `${fechaHora(l.usada_en)}${l.usada_por ? ` · ${l.usada_por}` : ''}` : '—'));
            const [texto, color] = estadoLlave(l);
            tr.appendChild(crearCeldaEtiqueta(l.anulada_en && l.anulada_por ? `${texto} (${l.anulada_por})` : texto, color));
            tr.appendChild(l.vigente
                ? crearCeldaAcciones(crearBotonIcono('anular', l.id, 'bi-x-octagon', 'Anular esta llave'))
                : crearCelda(''));
            cuerpo.appendChild(tr);
        });
    }

    enSeccion('#cfgSopLlaves').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-accion="anular"]');
        if (!b) return;
        pedirConfirmacion('¿Anular la llave? Si el Desarrollador la está usando, deja de ver los datos al momento.', async () => {
            const { error } = await db.rpc('soporte_anular_llave', { p_id: Number(b.dataset.id) });
            if (error) {
                console.error('Error al anular la llave:', error);
                aviso.mostrar('No se pudo anular la llave.', 'error');
                return;
            }
            enSeccion('#cfgSopCodigo').hidden = true;
            aviso.mostrar('Llave anulada.');
            cargar();
        });
    });

    // ==================================================
    // 3. BITÁCORA
    // ==================================================

    // "Detalle" de cada fila: pantalla, tabla y campos, usuario o alcance de la llave
    function detalleBitacora(b) {
        const d = b.detalle || {};
        if (b.accion === 'vio') return `Pantalla "${b.registro}"`;
        if (['creo', 'cambio', 'borro'].includes(b.accion)) {
            const campos = Array.isArray(d.campos) && d.campos.length ? ` · campos: ${d.campos.join(', ')}` : '';
            return `${b.tabla}${b.registro ? ` #${b.registro}` : ''}${campos}`;
        }
        if (d.usuario) return `Usuario ${d.usuario}`;
        if (d.alcance) return `${SOP_ALCANCE[d.alcance] || d.alcance}${d.horas ? ` · ${plural(d.horas, 'hora', 'horas')}` : ''}`;
        return '';
    }

    function dibujarBitacora(filas) {
        const cuerpo = enSeccion('#cfgSopBitacora');
        cuerpo.replaceChildren();
        if (!filas.length) {
            cuerpo.appendChild(crearFilaVacia('La bitácora está vacía.', 4));
            return;
        }
        filas.forEach((b) => {
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(fechaHora(b.creado_en)));
            tr.appendChild(crearCelda(b.usuario || '—', 'texto-codigo'));
            tr.appendChild(crearCelda(SOP_ACCIONES[b.accion] || b.accion));
            tr.appendChild(crearCelda(detalleBitacora(b)));
            cuerpo.appendChild(tr);
        });
    }

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================
    enSeccion('#cfgSopCodigo').hidden = true;
    cargar();

    return () => {
        activo = false;
    };
});
