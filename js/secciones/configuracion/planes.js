/* ==================================================
   CONFIGURACIÓN -> PLANES Y FUNCIONES
   ACACHETE LOGISTICS

   Lo carga js/secciones/configuracion.js la primera vez que se abre la tarjeta
   "Planes y funciones" (SOLO el Desarrollador).

   Una tarjeta por empresa interna con:
     - su plan de pago (empresas.plan): Básico, Profesional, Completo o Personalizado;
     - las casillas de las funciones (empresas.funciones), agrupadas como en
       FUNCIONES_PLAN (empresas/empresas.js).
   Elegir un plan marca sus funciones (PLANES en empresas/empresas.js). Si después se
   cambia una casilla, el plan pasa a "Personalizado" (o al plan que coincida).
   "Completo" guarda funciones = null (todas, también las que se agreguen después).
   La página oculta lo que no esté marcado (funcionHabilitada); la base respeta
   "registro_clientes" (sql/01 bloque 22).
   ================================================== */

registrarModuloConfig('planes', (seccion, ctx) => {
    const { aviso } = ctx;
    const enSeccion = (selector) => seccion.querySelector(selector);
    const lista = enSeccion('#cfgPlaLista');
    const TODAS = Object.keys(FUNCIONES_PLAN);
    let activo = true;

    const funcionesDelPlan = (plan) => {
        const p = PLANES[plan];
        if (!p) return null;
        return p.funciones === '*' ? TODAS : p.funciones.filter((f) => TODAS.includes(f));
    };
    const mismas = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

    // Plan que coincide con las casillas marcadas (o "personalizado")
    function planDe(marcadas) {
        const hallado = Object.keys(PLANES).find((p) => mismas(funcionesDelPlan(p), marcadas));
        return hallado || 'personalizado';
    }

    // ==================================================
    // DIBUJAR
    // ==================================================

    function tarjetaEmpresa(emp) {
        const form = viaElemento('form', 'tarjeta cfg-tarjeta cfg-pla-empresa');
        form.noValidate = true;
        form.dataset.id = emp.id;

        // Cabecera: empresa y plan
        const cab = viaElemento('div', 'cfg-tarjeta-cabecera');
        const textos = document.createElement('div');
        const titulo = viaElemento('h3', 'cfg-tarjeta-titulo', `${emp.codigo || '—'} · ${emp.nombre}`);
        if (emp.activa === false) titulo.append(' ', viaElemento('span', 'etiqueta etiqueta-gris', 'Inactiva'));
        const resumen = viaElemento('p', 'cfg-tarjeta-texto cfg-pla-resumen');
        textos.append(titulo, resumen);

        const campo = viaElemento('div', 'campo cfg-pla-plan');
        const etiqueta = viaElemento('label', 'campo-etiqueta', 'Plan');
        const select = viaElemento('select', 'campo-input');
        select.id = `cfgPlaPlan${emp.id}`;
        etiqueta.htmlFor = select.id;
        Object.entries(PLANES).forEach(([clave, p]) => select.appendChild(new Option(p.texto, clave)));
        select.appendChild(new Option('Personalizado', 'personalizado'));
        campo.append(etiqueta, select);
        cab.append(textos, campo);
        form.appendChild(cab);

        // Casillas por grupo
        const marcadas = Array.isArray(emp.funciones) ? emp.funciones : TODAS;
        const grupos = viaElemento('div', 'cfg-pla-grupos');
        const porGrupo = {};
        Object.entries(FUNCIONES_PLAN).forEach(([clave, f]) => { (porGrupo[f.grupo] = porGrupo[f.grupo] || []).push([clave, f]); });
        Object.entries(porGrupo).forEach(([grupo, funciones]) => {
            const fs = viaElemento('fieldset', 'cfg-tra-grupo');
            fs.appendChild(viaElemento('legend', null, grupo));
            funciones.forEach(([clave, f]) => {
                const label = viaElemento('label', 'cfg-si-no');
                const c = document.createElement('input');
                c.type = 'checkbox';
                c.value = clave;
                c.checked = marcadas.includes(clave);
                label.append(c, ` ${f.texto}`);
                if (f.ayuda) label.title = f.ayuda;
                fs.appendChild(label);
            });
            grupos.appendChild(fs);
        });
        form.appendChild(grupos);

        const botones = viaElemento('div', 'dialogo-botones');
        const guardar = viaElemento('button', 'boton boton-principal', 'Guardar');
        guardar.type = 'submit';
        botones.appendChild(guardar);
        form.appendChild(botones);

        const casillas = () => [...grupos.querySelectorAll('input[type="checkbox"]')];
        const elegidas = () => casillas().filter((c) => c.checked).map((c) => c.value);
        const pintarResumen = () => {
            const n = elegidas().length;
            resumen.textContent = `${n} de ${TODAS.length} funciones habilitadas`
                + (emp.id === empresaActivaId() ? ' · es la empresa activa (tú siempre ves todo)' : '');
        };

        select.value = (PLANES[emp.plan] || emp.plan === 'personalizado') ? emp.plan : planDe(marcadas);
        pintarResumen();

        // Elegir plan -> marca sus funciones
        select.addEventListener('change', () => {
            const del = funcionesDelPlan(select.value);
            if (del) casillas().forEach((c) => { c.checked = del.includes(c.value); });
            pintarResumen();
        });
        // Cambiar una casilla -> el plan que coincida o "Personalizado"
        grupos.addEventListener('change', () => {
            select.value = planDe(elegidas());
            pintarResumen();
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const funciones = elegidas();
            const plan = select.value === 'personalizado' ? planDe(funciones) : select.value;
            const datos = { plan, funciones: plan === 'completo' ? null : funciones };
            guardar.disabled = true;
            const { data, error } = await db.from('empresas').update(datos).eq('id', emp.id).select('*').single();
            guardar.disabled = false;
            if (!activo) return;
            if (error) {
                console.error('Error al guardar el plan:', error);
                aviso.mostrar(['42703', 'PGRST204', '23514'].includes(error.code)
                    ? 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloque 22) en Supabase.'
                    : 'No se pudo guardar el plan. Revisa la conexión e intenta de nuevo.', 'error');
                return;
            }
            Object.assign(emp, data);
            select.value = data.plan;
            if (emp.id === empresaActivaId()) cambiarEmpresaActiva(data); // js/sesion.js
            aviso.mostrar(`Plan de ${emp.nombre}: ${select.options[select.selectedIndex].text}.`);
        });

        return form;
    }

    // ==================================================
    // CARGAR
    // ==================================================

    async function cargar() {
        const { data, error } = await db.from('empresas').select('*').order('codigo');
        if (!activo) return;
        if (error) {
            console.error('Error al cargar las empresas:', error);
            aviso.mostrar('No se pudieron cargar las empresas. Revisa la conexión.', 'error');
            return;
        }
        // Sin la columna "plan" la base todavía no tiene el bloque 22
        const falta = data.length > 0 && !('plan' in data[0]);
        enSeccion('#cfgPlaFaltaSql').hidden = !falta;
        lista.replaceChildren();
        if (falta) return;
        if (!data.length) {
            lista.appendChild(viaElemento('p', 'cfg-nota', 'Todavía no hay empresas (Tiendas → Empresas).'));
            return;
        }
        data.forEach((emp) => lista.appendChild(tarjetaEmpresa(emp)));
    }

    cargar();

    return () => { activo = false; };
});
