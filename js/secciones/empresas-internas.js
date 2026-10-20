/* ==================================================
   SECCIÓN: EMPRESAS INTERNAS - LÓGICA (#empresas-internas, solo el Desarrollador)
   ACACHETE LOGISTICS

   Las empresas internas (01, 02...) de la base. No confundir con empresas/empresas.js,
   que define las MARCAS (logos, colores y base de cada copia del sistema) y además
   guarda los modelos de paleta que aquí se ofrecen (PALETAS_MODELO).
   Guía: docs/secciones/empresas-internas.md. Tabla empresas (sql/01 bloques 16 y 21).
   - Lista todas las empresas con cuántas regiones, tiendas y usuarios tiene cada
     una (db.fromTodas: sin el filtro de empresa de js/supabase.js).
   - Datos (sql/01 bloque 41, opcionales): razón social, cédula jurídica, teléfono, a qué se dedica,
     dirección y ubicación (botón "Mapa": elegirPuntoEnMapa de js/mapa.js).
   - Nueva / Modificar: ID (2 números, va al final de sus usuarios: jperez01;
     al cambiarlo se renombran todos sus usuarios con la función
     cambiar_codigo_empresa), nombre, actividades (entregas de tienda, encomiendas
     o las dos) y estado. Al crear se puede copiar la configuración de pedidos de
     la empresa activa. #empresas-internas?nuevo=1 (tarjeta de Configuración) abre "Nueva".
   - Paleta de colores (obligatorio elegirla al crear): un modelo de PALETAS_MODELO o 2
     colores propios (principal y botones); paletaDesdeColores (empresas/empresas.js)
     arma las 7 de la marca. Se guarda en empresas.colores (sql/01 bloque 21) y se pinta
     al iniciar sesión con un usuario de esa empresa.
   - Trabajar con esta: cambia la empresa activa del Desarrollador (js/sesion.js).
   - Limpiar datos: borra todo lo de la empresa (función limpiar_empresa, sql/01
     bloque 40), con la contraseña del Desarrollador y su ID para confirmar.
   - Eliminar: solo si no tiene nada (si no, marcarla Inactiva o limpiarla).
   ================================================== */

const EMP_COLUMNAS_TABLA = 8;
// '*': trae la paleta (colores) si la base ya tiene el bloque 21, y funciona sin él
const EMP_SELECT = '*';

// Datos de la empresa (sql/01 bloque 41): columna -> id del campo del formulario
const EMP_DATOS = {
    razon_social: 'empRazonSocial',
    cedula_juridica: 'empCedulaJuridica',
    telefono: 'empTelefono',
    giro: 'empGiro',
    direccion: 'empDireccion',
    ubicacion: 'empUbicacion',
};

// Opciones de la lista "Elegir": "Colores de la marca", los modelos de PALETAS_MODELO
// (empresas/empresas.js: ahí se agregan) y "Personalizada" (los 2 colores elegidos)
const EMP_OPCION_MARCA = 'marca';
const EMP_OPCION_PROPIA = 'propia';
const empOpcionesPaleta = () => ({
    [EMP_OPCION_MARCA]: { texto: 'Colores de la marca (sin paleta propia)' },
    ...PALETAS_MODELO,
    [EMP_OPCION_PROPIA]: { texto: 'Personalizada (elige los 2 colores)' },
});

registrarSeccion('empresas-internas', (zona) => {

    const $ = (selector) => zona.querySelector(selector);
    const aviso = crearAviso($('#empAviso'), 6000);

    const dialogo = $('#empDialogo');
    const errorForm = $('#empFormError');
    const cuerpo = $('#empLista');

    let empresas = [];
    let actividades = []; // [{ codigo, nombre, descripcion }] de la tabla actividades
    let cuentas = { regiones: {}, tiendas: {}, usuarios: {} }; // tabla -> { empresa_id: cantidad }
    let editando = null;

    const nombreActividad = (codigo) => (actividades.find((a) => a.codigo === codigo) || {}).nombre || codigo;

    // ==================================================
    // CARGAR
    // ==================================================

    async function contar(tabla) {
        const { data, error } = await db.fromTodas(tabla).select('empresa_id');
        if (error) return {};
        return data.reduce((m, f) => { m[f.empresa_id] = (m[f.empresa_id] || 0) + 1; return m; }, {});
    }

    async function cargar() {
        const [emp, act] = await Promise.all([
            db.from('empresas').select(EMP_SELECT).order('codigo'),
            db.from('actividades').select('codigo, nombre, descripcion, activa').order('orden'),
        ]);
        if (emp.error) {
            console.error('Error al cargar empresas:', emp.error);
            $('#empFaltaSql').hidden = !['42P01', 'PGRST205', '42703'].includes(emp.error.code);
            $('#empContador').textContent = 'No se pudo cargar la lista.';
            $('#empNueva').disabled = true;
            return;
        }
        empresas = emp.data;
        actividades = act.data || [];
        pintarActividades();
        const [regiones, tiendas, usuarios] = await Promise.all([contar('regiones'), contar('tiendas'), contar('usuarios')]);
        cuentas = { regiones, tiendas, usuarios };
        dibujar();
    }

    // Casillas del formulario: una por actividad (las inactivas no se ofrecen)
    function pintarActividades() {
        const caja = $('#empActividades');
        caja.replaceChildren(...actividades.filter((a) => a.activa !== false).map((a) => {
            const label = document.createElement('label');
            label.className = 'emp-actividad';
            const casilla = document.createElement('input');
            casilla.type = 'checkbox';
            casilla.name = 'empActividad';
            casilla.value = a.codigo;
            const textos = document.createElement('span');
            const t = document.createElement('strong');
            t.textContent = a.nombre;
            textos.appendChild(t);
            if (a.descripcion) {
                const d = document.createElement('small');
                d.textContent = a.descripcion;
                textos.appendChild(d);
            }
            label.append(casilla, textos);
            return label;
        }));
    }

    function dibujar() {
        cuerpo.replaceChildren();
        const actual = empresaActivaId();
        if (!empresas.length) cuerpo.appendChild(crearFilaVacia('Aún no hay empresas.', EMP_COLUMNAS_TABLA));
        empresas.forEach((e) => {
            const tr = document.createElement('tr');
            if (e.id === actual) tr.classList.add('emp-actual');

            // ID + número interno (el de sus logos en css/encabezados.css: nunca se repite)
            const tdId = crearCelda(e.codigo, 'texto-codigo emp-col-id');
            const interno = document.createElement('small');
            interno.className = 'emp-interno';
            interno.textContent = `N.º ${e.id}`;
            interno.title = `Número interno ${e.id}: con él se ponen sus logos (css/encabezados.css, html[data-empresa-id="${e.id}"]). No se repite aunque se borre la empresa.`;
            tdId.append(document.createElement('br'), interno);
            tr.appendChild(tdId);
            const tdNombre = document.createElement('td');
            // Punto con su paleta (principal y botones); sin paleta propia, los de la marca
            const c = { ...(e.colores || {}) }; // copia: no se toca la fila cargada
            const punto = document.createElement('span');
            punto.className = 'emp-paleta-punto';
            const esPrincipal = e.codigo === EMPRESA_PRINCIPAL;
            punto.title = esPrincipal ? 'Empresa principal: colores originales'
                : c['color-azul'] ? `Paleta: ${c['color-azul']} y ${c['color-naranja']}` : 'Colores de la marca';
            const originales = esPrincipal ? coloresOriginales() : {};
            if (originales['color-azul']) Object.assign(c, { 'color-azul': originales['color-azul'], 'color-naranja': originales['color-naranja'] });
            punto.style.background = c['color-azul']
                ? `linear-gradient(135deg, ${c['color-azul']} 50%, ${c['color-naranja']} 50%)` : '';
            tdNombre.append(punto, e.nombre);
            if (e.id === actual) {
                const marca = document.createElement('span');
                marca.className = 'etiqueta etiqueta-azul emp-actual-marca';
                marca.textContent = 'Trabajando con esta';
                tdNombre.appendChild(marca);
            }
            // Razón social, cédula jurídica, a qué se dedica y teléfono (bloque 41), si los tiene
            const datos = [e.razon_social, e.cedula_juridica && `Céd. ${e.cedula_juridica}`, e.giro, e.telefono]
                .filter(Boolean).join(' · ');
            if (datos) {
                const linea = document.createElement('small');
                linea.className = 'emp-datos';
                linea.textContent = datos;
                tdNombre.appendChild(linea);
            }
            tr.appendChild(tdNombre);

            const tdAct = document.createElement('td');
            const etiquetas = document.createElement('div');
            etiquetas.className = 'emp-etiquetas';
            (e.actividades || []).forEach((a) => {
                const s = document.createElement('span');
                s.className = `etiqueta ${a === 'tienda' ? 'etiqueta-naranja' : a === 'encomiendas' ? 'etiqueta-verde' : 'etiqueta-azul'}`;
                s.textContent = nombreActividad(a);
                etiquetas.appendChild(s);
            });
            tdAct.appendChild(etiquetas);
            tr.appendChild(tdAct);

            tr.appendChild(crearCelda(cuentas.regiones[e.id] || 0, 'emp-col-numero'));
            tr.appendChild(crearCelda(cuentas.tiendas[e.id] || 0, 'emp-col-numero'));
            tr.appendChild(crearCelda(cuentas.usuarios[e.id] || 0, 'emp-col-numero'));
            tr.appendChild(e.activa ? crearCeldaEtiqueta('Activa', 'etiqueta-verde') : crearCeldaEtiqueta('Inactiva', 'etiqueta-gris'));

            const vacia = !(cuentas.regiones[e.id] || cuentas.tiendas[e.id] || cuentas.usuarios[e.id]);
            const motivoNoEliminar = e.id === actual ? 'Es la empresa con la que trabajas: elige otra primero.'
                : !vacia ? 'Tiene regiones, tiendas o usuarios: márcala Inactiva.' : null;
            tr.appendChild(crearCeldaAcciones(
                crearBotonIcono('usar', e.id, 'bi-box-arrow-in-right', e.id === actual ? 'Ya trabajas con esta' : `Trabajar con ${e.nombre}`, e.id === actual),
                crearBotonIcono('editar', e.id, 'bi-pencil', `Modificar ${e.nombre}`),
                crearBotonIcono('limpiar', e.id, 'bi-eraser', `Limpiar datos de ${e.nombre}`),
                crearBotonIcono('eliminar', e.id, 'bi-trash3', motivoNoEliminar || `Eliminar ${e.nombre}`, !!motivoNoEliminar)));
            cuerpo.appendChild(tr);
        });
        const activas = empresas.filter((e) => e.activa).length;
        $('#empContador').textContent = `${plural(empresas.length, 'empresa', 'empresas')} · ${activas} activa${activas === 1 ? '' : 's'}`;
    }

    // ==================================================
    // NUEVA / MODIFICAR
    // ==================================================

    // Siguiente ID libre: "01", "02"... (el mayor + 1)
    function siguienteCodigo() {
        const usados = empresas.map((e) => Number(e.codigo) || 0);
        const n = (usados.length ? Math.max(...usados) : 0) + 1;
        return n > 99 ? '' : String(n).padStart(2, '0');
    }

    function abrirFormulario(empresa = null) {
        editando = empresa;
        $('#empForm').reset();
        errorForm.textContent = '';
        $('#empDialogoTitulo').textContent = empresa ? `Modificar ${empresa.codigo} · ${empresa.nombre}` : 'Nueva empresa';
        $('#empCodigo').value = empresa ? empresa.codigo : siguienteCodigo();
        // La empresa principal siempre es la 01: su ID no se cambia
        $('#empCodigo').disabled = !!empresa && empresa.codigo === EMPRESA_PRINCIPAL;
        $('#empNombre').value = empresa ? empresa.nombre : '';
        Object.entries(EMP_DATOS).forEach(([columna, id]) => ponerDato($(`#${id}`), (empresa && empresa[columna]) || ''));
        const acts = empresa ? empresa.actividades || [] : actividades.filter((a) => a.activa !== false).map((a) => a.codigo);
        zona.querySelectorAll('input[name="empActividad"]').forEach((c) => { c.checked = acts.includes(c.value); });
        $('#empEstado').value = !empresa || empresa.activa ? 'activa' : 'inactiva';
        ponerPaleta(empresa);
        const origen = empresaActual();
        $('#empCopiarCampo').hidden = !!empresa || !origen;
        $('#empCopiarDe').textContent = origen ? `${origen.codigo || ''} · ${origen.nombre}` : '';
        pintarCodigo();
        dialogo.showModal();
        (empresa ? $('#empNombre') : $('#empCodigo')).focus();
    }

    // Ejemplo de usuarios y aviso si se cambia el ID de una empresa con usuarios
    function pintarCodigo() {
        const c = $('#empCodigo').value.trim();
        const ok = /^[0-9]{2}$/.test(c);
        $('#empCodigoEjemplo').textContent = ok ? `jperez${c}` : 'jperez02';
        const avisoCodigo = $('#empCodigoAviso');
        const usuarios = editando ? cuentas.usuarios[editando.id] || 0 : 0;
        avisoCodigo.hidden = !(editando && ok && c !== editando.codigo && usuarios);
        if (!avisoCodigo.hidden) {
            avisoCodigo.textContent = `Al guardar se renombran ${plural(usuarios, 'usuario', 'usuarios')} de esta empresa ` +
                `(…${editando.codigo} → …${c}, salvo "admin") y deberán iniciar sesión con el nombre nuevo.`;
        }
    }

    $('#empCodigo').addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 2);
        pintarCodigo();
    });

    // ---------- Paleta de colores ----------
    const selPaleta = $('#empPaletaModelo');
    const colorPrincipal = $('#empColorPrincipal');
    const colorAccion = $('#empColorAccion');

    const opciones = empOpcionesPaleta();

    function llenarModelos(conVacio) {
        const lista = Object.entries(opciones).map(([valor, p]) => new Option(p.texto, valor));
        if (conVacio) lista.unshift(new Option('Elige la paleta de la empresa…', ''));
        selPaleta.replaceChildren(...lista);
    }

    // Colores que se guardarán ({} = los de la marca) o null si aún no se eligió
    function paletaElegida() {
        if (!selPaleta.value) return null;
        if (selPaleta.value === EMP_OPCION_MARCA) return {};
        return paletaDesdeColores(colorPrincipal.value, colorAccion.value); // empresas/empresas.js
    }

    function pintarMuestra() {
        const marca = selPaleta.value === EMP_OPCION_MARCA || !selPaleta.value;
        colorPrincipal.disabled = colorAccion.disabled = marca;
        // Marca: los originales de css/variables.css + los colores de la marca activa
        // (la empresa principal, solo los originales)
        const principal = editando && editando.codigo === EMPRESA_PRINCIPAL;
        const colores = marca
            ? { ...coloresOriginales(), ...(principal ? {} : EMPRESA.colores || {}) }
            : paletaElegida();
        const muestra = $('#empPaletaMuestra');
        Object.entries(colores).forEach(([nombre, valor]) => muestra.style.setProperty(`--m-${nombre.replace('color-', '')}`, valor));
    }

    // Al abrir: la paleta guardada de la empresa (modelo si coincide, si no "Personalizada");
    // empresa nueva: hay que elegirla
    function ponerPaleta(empresa) {
        // Empresa principal (01): siempre los colores originales; no se elige paleta
        const principal = !!empresa && empresa.codigo === EMPRESA_PRINCIPAL; // empresas/empresas.js
        llenarModelos(!empresa);
        selPaleta.disabled = principal;
        if (principal) {
            selPaleta.replaceChildren(new Option('Colores originales de ACACHETE (empresa principal)', EMP_OPCION_MARCA));
            selPaleta.value = EMP_OPCION_MARCA;
            pintarMuestra();
            return;
        }
        const c = (empresa && empresa.colores) || {};
        if (!empresa) {
            selPaleta.value = '';
        } else if (!c['color-azul'] || !c['color-naranja']) {
            selPaleta.value = EMP_OPCION_MARCA;
        } else {
            colorPrincipal.value = c['color-azul'].toLowerCase();
            colorAccion.value = c['color-naranja'].toLowerCase();
            const modelo = Object.entries(opciones).find(([, p]) => p.colores
                && p.colores[0].toLowerCase() === colorPrincipal.value && p.colores[1].toLowerCase() === colorAccion.value);
            selPaleta.value = modelo ? modelo[0] : EMP_OPCION_PROPIA;
        }
        pintarMuestra();
    }

    selPaleta.addEventListener('change', () => {
        const modelo = opciones[selPaleta.value];
        if (modelo && modelo.colores) [colorPrincipal.value, colorAccion.value] = modelo.colores.map((x) => x.toLowerCase());
        pintarMuestra();
    });
    [colorPrincipal, colorAccion].forEach((input) => input.addEventListener('input', () => {
        selPaleta.value = EMP_OPCION_PROPIA;
        pintarMuestra();
    }));

    // Copia a la empresa nueva la configuración de pedidos de la empresa activa
    // (solo de las actividades que hará): categorías con sus artículos (pesos),
    // tarifas generales y descuentos generales. Devuelve el primer error o null.
    async function copiarConfiguracion(destinoId, acts) {
        const cat = await db.from('categorias_mercaderia')
            .select('id, actividad, nombre, tipo, icono, peso_referencia, activa, orden').in('actividad', acts);
        if (cat.error) return cat.error;
        if (cat.data.length) {
            const art = await db.from('articulos_catalogo').select('categoria_id, nombre, peso_kg, activo, orden')
                .in('categoria_id', cat.data.map((c) => c.id));
            if (art.error) return art.error;
            for (const c of cat.data) {
                const { id, ...datos } = c;
                const nueva = await db.from('categorias_mercaderia').insert({ ...datos, empresa_id: destinoId }).select('id').single();
                if (nueva.error) return nueva.error;
                const suyos = art.data.filter((a) => a.categoria_id === id).map((a) => ({ ...a, categoria_id: nueva.data.id }));
                if (suyos.length) {
                    const r = await db.from('articulos_catalogo').insert(suyos);
                    if (r.error) return r.error;
                }
            }
        }
        // Tarifas generales (sin región ni tienda) de sus actividades
        const tar = await db.from('tarifas').select('*').in('actividad', acts).is('region', null).is('tienda_id', null);
        if (tar.error) return tar.error;
        if (tar.data.length) {
            const r = await db.from('tarifas').insert(tar.data.map(({ id, actualizado_en, ...t }) => ({ ...t, empresa_id: destinoId })));
            if (r.error) return r.error;
        }
        // Descuentos generales (sin región) de todas o de sus actividades
        const des = await db.from('descuentos').select('nombre, tipo, valor, actividad, activo').is('region', null);
        if (des.error) return des.error;
        const susDescuentos = des.data.filter((d) => !d.actividad || acts.includes(d.actividad));
        if (susDescuentos.length) {
            const r = await db.from('descuentos').insert(susDescuentos.map((d) => ({ ...d, empresa_id: destinoId })));
            if (r.error) return r.error;
        }
        return null;
    }

    $('#empForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        errorForm.textContent = '';
        const codigo = $('#empCodigo').value.trim();
        const nombre = $('#empNombre').value.trim();
        const acts = [...zona.querySelectorAll('input[name="empActividad"]:checked')].map((c) => c.value);
        if (!/^[0-9]{2}$/.test(codigo)) { errorForm.textContent = 'El ID son 2 números (ej. 02).'; $('#empCodigo').focus(); return; }
        // El 01 es solo de la empresa principal: las demás parten de la 02
        if (codigo === EMPRESA_PRINCIPAL && !(editando && editando.codigo === EMPRESA_PRINCIPAL)) {
            errorForm.textContent = 'El ID 01 es de la empresa principal: usa 02 o mayor.';
            $('#empCodigo').focus();
            return;
        }
        if (empresas.some((e) => e.codigo === codigo && (!editando || e.id !== editando.id))) {
            errorForm.textContent = 'Ese ID ya lo usa otra empresa.';
            $('#empCodigo').focus();
            return;
        }
        if (!nombre) { errorForm.textContent = 'Escribe el nombre de la empresa.'; $('#empNombre').focus(); return; }
        if (!acts.length) { errorForm.textContent = 'Marca al menos una actividad.'; return; }
        // Cédula jurídica y teléfono (opcionales) con el formato de Costa Rica (js/componentes.js)
        for (const [tipo, id] of [['cedula_juridica', 'empCedulaJuridica'], ['telefono', 'empTelefono']]) {
            const mal = validarDato(tipo, $(`#${id}`).value);
            if (mal) { errorForm.textContent = mal; $(`#${id}`).focus(); return; }
        }
        const colores = paletaElegida();
        if (!colores) { errorForm.textContent = 'Elige la paleta de colores de la empresa.'; selPaleta.focus(); return; }

        const datos = { nombre, actividades: acts, activa: $('#empEstado').value === 'activa', colores };
        if (!editando) datos.codigo = codigo; // empresa nueva: el ID va directo (aún no tiene usuarios)

        // Razón social, cédula jurídica, teléfono, giro, dirección y ubicación: solo las columnas
        // que la base ya tiene (bloque 41; cedula_juridica se agregó después al mismo bloque)
        const extra = Object.fromEntries(Object.entries(EMP_DATOS)
            .map(([columna, id]) => [columna, $(`#${id}`).dataset.formato
                ? datoConFormato($(`#${id}`).dataset.formato, $(`#${id}`).value)
                : $(`#${id}`).value.trim().replace(/\s+/g, ' ') || null]));
        const faltan = Object.keys(extra).filter((columna) => !empresas.some((e) => columna in e));
        if (faltan.some((columna) => extra[columna])) {
            errorForm.textContent = 'Para guardar los datos de la empresa (razón social, cédula jurídica, teléfono...) falta ejecutar sql/01 (bloque 41).';
            return;
        }
        faltan.forEach((columna) => delete extra[columna]);
        Object.assign(datos, extra);

        const boton = $('#empGuardar');
        boton.disabled = true;
        // ID cambiado: primero se renombran sus usuarios (todo o nada, en la base)
        if (editando && codigo !== editando.codigo) {
            const r = await db.rpc('cambiar_codigo_empresa', { p_empresa_id: editando.id, p_codigo: codigo });
            if (r.error) {
                boton.disabled = false;
                console.error('Error al cambiar el ID de la empresa:', r.error);
                errorForm.textContent = r.error.code === '23505'
                    ? 'No se pudo: ese ID ya existe o algún usuario quedaría repetido.'
                    : r.error.code === 'PGRST202' ? 'Falta ejecutar sql/01 (bloque 16: empresas).'
                    : 'No se pudo cambiar el ID. Intenta de nuevo.';
                return;
            }
        }
        const { data, error } = editando
            ? await db.from('empresas').update(datos).eq('id', editando.id).select(EMP_SELECT).single()
            : await db.from('empresas').insert(datos).select(EMP_SELECT).single();
        if (error) {
            boton.disabled = false;
            console.error('Error al guardar la empresa:', error);
            errorForm.textContent = error.code === '23505' ? 'Ya existe una empresa con ese nombre o ese ID.'
                : error.code === '23514' ? 'Revisa el ID (2 números) y las actividades.'
                : ['PGRST204', '42703'].includes(error.code) ? 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloque 21: paleta de colores).'
                : 'No se pudo guardar. Intenta de nuevo.';
            return;
        }

        let nota = '';
        if (!editando && $('#empCopiar').checked && !$('#empCopiarCampo').hidden) {
            boton.textContent = 'Copiando configuración...';
            const errCopia = await copiarConfiguracion(data.id, acts);
            boton.textContent = 'Guardar';
            if (errCopia) {
                console.error('Error al copiar la configuración:', errCopia);
                nota = ' No se pudo copiar toda la configuración de pedidos: revísala en Configuración → Pedidos.';
            }
        }
        boton.disabled = false;
        // Si se modificó la empresa con la que trabaja, se actualiza la sesión (ID y actividades)
        if (editando && editando.id === empresaActivaId()) cambiarEmpresaActiva(data);
        dialogo.close();
        aviso.mostrar(editando ? `Empresa ${data.codigo} · "${nombre}" actualizada.${nota}`
            : `Empresa ${data.codigo} · "${nombre}" creada. Usa "Trabajar con esta" para crear sus regiones, tiendas y usuarios.${nota}`,
            nota ? 'error' : 'ok');
        cargar();
    });

    // Ubicación: se elige en el mapa (js/mapa.js) y queda como "9.930000, -84.080000"
    $('#empUbicacionMapa').addEventListener('click', async () => {
        const campo = $('#empUbicacion');
        const punto = await elegirPuntoEnMapa({
            titulo: 'Ubicación de la empresa',
            inicial: puntoDeTexto(campo.value),
            buscar: puntoDeTexto(campo.value) ? '' : $('#empDireccion').value.trim(),
            confirmar: 'Usar este punto',
        });
        if (punto) campo.value = `${punto.lat.toFixed(6)}, ${punto.lng.toFixed(6)}`;
    });

    $('#empNueva').addEventListener('click', () => abrirFormulario());
    $('#empCancelar').addEventListener('click', () => dialogo.close());

    // ==================================================
    // ACCIONES
    // ==================================================

    cuerpo.addEventListener('click', async (evento) => {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton || boton.disabled) return;
        const empresa = empresas.find((e) => e.id === Number(boton.dataset.id));
        if (!empresa) return;

        if (boton.dataset.accion === 'editar') abrirFormulario(empresa);
        if (boton.dataset.accion === 'limpiar') abrirLimpiar(empresa);

        if (boton.dataset.accion === 'usar') {
            cambiarEmpresaActiva(empresa); // js/sesion.js
            aviso.mostrar(`Ahora trabajas con ${empresa.codigo} · "${empresa.nombre}".`);
            dibujar();
        }

        if (boton.dataset.accion === 'eliminar') {
            if (!confirm(`¿Eliminar la empresa ${empresa.codigo} · "${empresa.nombre}"? No se puede deshacer.`)) return;
            // ¿Tiene datos de trabajo? (clientes, pedidos, vehículos, rutas, viajes): entonces no se borra
            const conDatos = [];
            for (const [tabla, texto] of [['clientes', 'clientes'], ['pedidos', 'pedidos'], ['vehiculos', 'vehículos'], ['rutas', 'rutas'], ['viajes', 'viajes']]) {
                const r = await db.fromTodas(tabla).select('id').eq('empresa_id', empresa.id).limit(1);
                if (!r.error && r.data.length) conDatos.push(texto);
            }
            if (conDatos.length) {
                aviso.mostrar(`No se puede eliminar: tiene ${conDatos.join(', ')}. Márcala Inactiva o límpiala con "Limpiar datos".`, 'error');
                return;
            }
            // Solo le queda la configuración que se copió al crearla: se borra primero
            // (los artículos frecuentes se van con sus categorías)
            for (const tabla of ['tarifas', 'descuentos', 'categorias_mercaderia']) {
                const r = await db.fromTodas(tabla).delete().eq('empresa_id', empresa.id);
                if (r.error) console.error(`Error al borrar ${tabla} de la empresa:`, r.error);
            }
            const { error } = await db.from('empresas').delete().eq('id', empresa.id);
            if (error) {
                console.error('Error al eliminar la empresa:', error);
                aviso.mostrar(error.code === '23503'
                    ? 'No se puede eliminar: tiene datos (clientes, pedidos, tarifas, mercadería...). Márcala Inactiva.'
                    : 'No se pudo eliminar la empresa.', 'error');
                return;
            }
            // Sus logos (si tenía) van por su número interno: no pasan a otra empresa
            aviso.mostrar(`Empresa "${empresa.nombre}" eliminada. Si tenía logos propios, borra su bloque ` +
                `html[data-empresa-id="${empresa.id}"] de css/encabezados.css.`);
            cargar();
        }
    });

    // ==================================================
    // LIMPIAR DATOS (sql/01 bloque 40: limpiar_empresa)
    // Lo mismo que herramientas/vaciar_base_datos.sql, modo empresa. La base pide
    // la contraseña del Desarrollador y el ID de la empresa: si no, no borra nada.
    // ==================================================

    const dialogoLimpiar = $('#empLimpiarDialogo');
    const errorLimpiar = $('#empLimpiarError');
    let limpiando = null;

    function abrirLimpiar(empresa) {
        limpiando = empresa;
        $('#empLimpiarForm').reset();
        errorLimpiar.textContent = '';
        $('#empLimpiarTitulo').textContent = `Limpiar datos de ${empresa.codigo} · ${empresa.nombre}`;
        $('#empLimpiarId').textContent = empresa.codigo;
        // La empresa con la que trabaja no se borra (sí se limpia)
        const borrar = $('#empLimpiarBorrar');
        borrar.disabled = empresa.id === empresaActivaId() || empresa.codigo === EMPRESA_PRINCIPAL;
        borrar.closest('label').title = borrar.disabled ? 'La empresa principal o la empresa con la que trabajas no se borra.' : '';
        dialogoLimpiar.showModal();
        $('#empLimpiarConfirmar').focus();
    }

    $('#empLimpiarConfirmar').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 2); });
    $('#empLimpiarCancelar').addEventListener('click', () => dialogoLimpiar.close());

    $('#empLimpiarForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        errorLimpiar.textContent = '';
        const confirmar = $('#empLimpiarConfirmar').value.trim();
        const clave = $('#empLimpiarClave').value;
        if (confirmar !== limpiando.codigo) {
            errorLimpiar.textContent = `Escribe el ID de la empresa (${limpiando.codigo}) para confirmar.`;
            $('#empLimpiarConfirmar').focus();
            return;
        }
        if (!clave) { errorLimpiar.textContent = 'Escribe tu contraseña.'; $('#empLimpiarClave').focus(); return; }

        const boton = $('#empLimpiarAceptar');
        boton.disabled = true;
        boton.textContent = 'Limpiando...';
        const { data, error } = await db.rpc('limpiar_empresa', { p: {
            usuario_id: obtenerSesion().id,
            clave,
            empresa_id: limpiando.id,
            confirmar,
            conservar_administradores: $('#empLimpiarAdmins').checked,
            borrar_empresa: $('#empLimpiarBorrar').checked && !$('#empLimpiarBorrar').disabled,
        } });
        boton.disabled = false;
        boton.textContent = 'Limpiar';
        if (error) {
            console.error('Error al limpiar la empresa:', error);
            errorLimpiar.textContent = error.code === 'PGRST202' ? 'Falta ejecutar sql/01 (bloque 40: limpiar empresa).'
                : error.code === 'P0001' ? error.message
                : 'No se pudo limpiar. Intenta de nuevo.';
            return;
        }
        dialogoLimpiar.close();
        const f = data.filas || {};
        const resumen = [['pedidos', 'pedidos'], ['viajes', 'viajes'], ['clientes', 'clientes'], ['usuarios', 'usuarios'],
            ['tiendas', 'tiendas'], ['rutas', 'rutas'], ['vehiculos', 'vehículos'], ['productos', 'productos']]
            .filter(([k]) => f[k]).map(([k, texto]) => `${f[k]} ${texto}`).join(', ');
        aviso.mostrar(`Empresa ${data.empresa} · "${data.nombre}" ${data.borrada ? 'limpiada y borrada' : 'limpia'}. ` +
            (resumen ? `Se borró: ${resumen}.` : 'No tenía datos.'));
        cargar();
    });

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================

    cargar().then(() => {
        if (parametrosSeccion().get('nuevo') === '1' && !$('#empNueva').disabled) abrirFormulario();
    });

    return () => {
        aviso.limpiar();
        if (dialogo.open) dialogo.close();
        if (dialogoLimpiar.open) dialogoLimpiar.close();
    };
});
