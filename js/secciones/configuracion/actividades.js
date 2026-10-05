/* ==================================================
   CONFIGURACIÓN -> ACTIVIDADES (ventana flotante)
   ACACHETE LOGISTICS

   Lo carga js/secciones/configuracion.js la primera vez que se presiona
   la tarjeta "Actividades". A diferencia de los otros módulos, NO abre una
   página: abre la ventana flotante #cfgActDialogo encima de las tarjetas.
   Tabla: actividades (sql/00, sección 6).

   Qué se puede hacer:
     - Ver TODAS las actividades del sistema (son las mismas para todas las
       empresas), qué usa cada una, si están activas y si la empresa con la
       que se trabaja la realiza.
     - Nueva actividad: código (sale del nombre, no se cambia después),
       nombre, descripción, icono, activa y qué usa. Puede agregarse de una
       vez a la empresa con la que se trabaja (tabla empresas, columna
       actividades); las demás empresas la marcan en Tiendas -> Empresas.
     - Modificar nombre, descripción, icono, activa y qué usa en los pedidos.
       Una actividad ACTIVA queda disponible en TODAS las tiendas (no se
       elige por tienda).
       Lo que usa cada actividad decide qué partes muestra el formulario
       de Pedidos (bodega, punto de partida, tamaños, compra, alcohol).
       (No se eliminan desde aquí: pedidos, tarifas y categorías la usan.)

   Solo el Desarrollador (esDesarrollador, js/sesion.js); el Administrador no la ve.
   ⚠ Lo controla la página; la regla real llega en la Fase 7.

   Como es una ventana (no una página), devuelve { abrir, limpiar } en vez
   de solo la función de limpieza.
   ================================================== */

// Lo que puede usar una actividad (columnas usa_* de la tabla actividades) y su texto corto
const ACT_USOS = {
    usa_bodega:      'Bodega',
    usa_recoleccion: 'Punto de partida',
    usa_tamanos:     'Tamaños',
    usa_compra:      'Compra',
    permite_alcohol: 'Alcohol',
    usa_viajes:      'Viajes con agenda', // sql/01 bloque 19: sección Viajes en vez de Pedidos
};

// Código de una actividad: minúsculas, números y _ (ej. 'transporte', 'farmacia_24h')
const ACT_CODIGO_VALIDO = /^[a-z][a-z0-9_]{1,29}$/;

// 'Envíos Exprés 24h' -> 'envios_expres_24h'
function codigoDeActividad(nombre) {
    return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '_').replace(/^[_0-9]+|_+$/g, '').slice(0, 30);
}

registrarModuloConfig('actividades', (seccion, ctx) => {
    const { zona, aviso } = ctx;
    const $ = (selector) => zona.querySelector(selector);

    // ---------- Elementos ----------
    const ventana     = $('#cfgActDialogo');
    const cuerpo      = $('#cfgActLista');
    const faltaSql    = $('#cfgActFaltaSql');
    const editar      = $('#cfgActEditar');
    const form        = $('#cfgActForm');
    const errorCaja   = $('#cfgActError');
    const botonGuardar = $('#cfgActGuardar');
    const campos = {
        nombre:      $('#cfgActNombre'),
        codigo:      $('#cfgActCodigo'),
        descripcion: $('#cfgActDescripcion'),
        icono:       $('#cfgActIcono'),
        activa:      $('#cfgActActiva'),
        agregar:     $('#cfgActAgregar'),
    };
    const muestraIcono = $('#cfgActIconoMuestra');
    const soloCrear = [...zona.querySelectorAll('#cfgActEditar [data-solo-crear]')];
    const casillasUso = [...zona.querySelectorAll('#cfgActEditar [data-usa]')];
    const casillasPalabra = [...zona.querySelectorAll('#cfgActEditar [data-palabra]')]; // palabra_registro, ...

    // ---------- Datos ----------
    let actividades = [];        // [{ codigo, nombre, descripcion, icono, activa, usa_bodega, ..., palabra_registro, ... }]
    let tieneUsos = true;        // false si falta sql/01_actualizacion_base_existente (solo existe usa_bodega)
    let tienePalabras = true;    // false si falta el bloque 18 de sql/01 (palabras de la actividad)
    let editando = null;         // actividad que se está modificando (null = nueva)
    let creando = false;
    let codigoTocado = false;    // el código ya no sigue al nombre si se escribió a mano

    const faltaColumna = (e) => !!e && e.code === '42703';

    // ==================================================
    // LISTA
    // ==================================================

    async function cargar() {
        const base = 'codigo, nombre, descripcion, icono, activa, orden, usa_bodega';
        const conUsos = `${base}, ${Object.keys(ACT_USOS).filter((u) => u !== 'usa_bodega').join(', ')}`;
        // Columnas que pueden faltar: palabras (sql/01 bloque 18) y usos (sql/01 bloque 7)
        let act = await db.from('actividades').select(`${conUsos}, ${casillasPalabra.map((c) => c.dataset.palabra).join(', ')}`).order('orden');
        tienePalabras = !faltaColumna(act.error);
        if (!tienePalabras) act = await db.from('actividades').select(conUsos).order('orden');
        tieneUsos = !faltaColumna(act.error);
        if (!tieneUsos) act = await db.from('actividades').select(base).order('orden');

        if (act.error) {
            console.error('Error al cargar las actividades:', act.error);
            const falta = act.error.code === 'PGRST205' || act.error.code === '42P01';
            faltaSql.hidden = !falta;
            cuerpo.replaceChildren(crearFilaVacia(falta ? 'Sin datos.' : 'No se pudieron cargar las actividades.', 4));
            return;
        }
        faltaSql.hidden = true;
        // Todas: las actividades son del sistema. Se marca cuáles realiza la empresa.
        actividades = act.data;
        if (!tieneUsos) aviso.mostrar('Falta ejecutar sql/01_actualizacion_base_existente.sql en Supabase para elegir qué usa cada actividad.', 'error');
        dibujar();
    }

    function dibujar() {
        cuerpo.replaceChildren();
        if (!actividades.length) {
            cuerpo.appendChild(crearFilaVacia('Aún no hay actividades. Usa "Nueva actividad".', 4));
            return;
        }
        actividades.forEach((a) => {
            const tr = document.createElement('tr');

            // Icono + nombre (+ descripción chica)
            const tdNombre = document.createElement('td');
            const icono = document.createElement('i');
            icono.className = `bi ${a.icono} cfg-icono-fila`;
            tdNombre.append(icono, ` ${a.nombre}`);
            if (!empresaTieneActividad(a.codigo)) {
                const marca = document.createElement('span');
                marca.className = 'etiqueta etiqueta-gris';
                marca.textContent = 'No la realiza esta empresa';
                tdNombre.append(' ', marca);
            }
            if (a.descripcion) {
                const desc = document.createElement('small');
                desc.className = 'cfg-act-desc';
                desc.textContent = a.descripcion;
                tdNombre.appendChild(desc);
            }
            // Palabras propias (ej. "Se llama: viaje · conductor"); sin traducir
            const propias = [a.palabra_registro, a.palabra_conductor].filter(Boolean);
            if (propias.length) {
                const pal = document.createElement('small');
                pal.className = 'cfg-act-desc';
                pal.dataset.sinPalabras = '';
                pal.textContent = `Se llama: ${propias.join(' · ')}`;
                tdNombre.appendChild(pal);
            }

            const usos = Object.entries(ACT_USOS).filter(([col]) => a[col]).map(([, texto]) => texto);
            tr.append(
                tdNombre,
                crearCelda(usos.join(', ') || 'Solo lo básico'),
                a.activa ? crearCeldaEtiqueta('Activa · todas las tiendas', 'etiqueta-verde') : crearCeldaEtiqueta('Inactiva', 'etiqueta-gris'),
                crearCeldaAcciones(crearBotonIcono('editar', a.codigo, 'bi-pencil', 'Modificar actividad')),
            );
            cuerpo.appendChild(tr);
        });
    }

    cuerpo.addEventListener('click', (evento) => {
        const boton = evento.target.closest('button[data-accion="editar"]');
        if (!boton) return;
        const actividad = actividades.find((a) => a.codigo === boton.dataset.id);
        if (actividad) abrirFormulario(actividad);
    });

    $('#cfgActCerrar').addEventListener('click', () => ventana.close());
    $('#cfgActNueva').addEventListener('click', () => abrirFormulario(null));

    // ==================================================
    // NUEVA / MODIFICAR (ventana encima de la lista)
    // ==================================================

    function ponerIcono(valor) {
        // Un icono que no está en la lista (puesto por SQL) se agrega para no perderlo
        if (![...campos.icono.options].some((o) => o.value === valor)) campos.icono.add(new Option(valor, valor));
        campos.icono.value = valor;
        muestraIcono.className = `bi ${valor}`;
    }

    function abrirFormulario(a) {
        editando = a;
        creando = !a;
        codigoTocado = false;
        errorCaja.textContent = '';
        $('#cfgActEditarTitulo').textContent = a ? `Modificar: ${a.nombre}` : 'Nueva actividad';
        campos.nombre.value = a ? a.nombre : '';
        campos.codigo.value = a ? a.codigo : '';
        campos.descripcion.value = a ? a.descripcion || '' : '';
        campos.activa.checked = a ? a.activa : true;
        ponerIcono(a ? a.icono || 'bi-box-seam' : 'bi-box-seam');

        // Código y "agregar a la empresa": solo al crear
        soloCrear.forEach((el) => { el.hidden = !creando; });
        const empresa = typeof empresaActual === 'function' ? empresaActual() : null;
        $('#cfgActAgregarCampo').hidden = !creando || !empresa;
        $('#cfgActAgregarEmpresa').textContent = empresa ? `${empresa.codigo || ''} · ${empresa.nombre}` : '';
        campos.agregar.checked = true;

        // Cómo se llama el registro y el conductor (sin el bloque 18 no se muestra)
        $('#cfgActPalabras').hidden = !tienePalabras;
        casillasPalabra.forEach((c) => { c.value = a ? a[c.dataset.palabra] || '' : ''; });

        // Qué usa (sin la actualización de la base solo se puede cambiar la bodega)
        casillasUso.forEach((c) => {
            c.checked = a ? !!a[c.dataset.usa] : false;
            c.disabled = !tieneUsos && c.dataset.usa !== 'usa_bodega';
        });

        editar.showModal();
        campos.nombre.focus();
    }

    // El código sigue al nombre mientras no se escriba a mano
    campos.nombre.addEventListener('input', () => {
        if (creando && !codigoTocado) campos.codigo.value = codigoDeActividad(campos.nombre.value);
    });
    campos.codigo.addEventListener('input', () => {
        codigoTocado = true;
        campos.codigo.value = campos.codigo.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    });
    campos.icono.addEventListener('change', () => { muestraIcono.className = `bi ${campos.icono.value}`; });

    $('#cfgActCancelar').addEventListener('click', () => editar.close());
    editar.addEventListener('close', () => { editando = null; creando = false; });

    // Suma la actividad nueva a la empresa con la que se trabaja (tabla empresas)
    // y actualiza la sesión, para que aparezca enseguida en Pedidos, Reportes...
    async function agregarAEmpresa(codigo) {
        const empresa = empresaActual();
        const lista = [...new Set([...(empresa.actividades || []), codigo])];
        const { data, error } = await db.from('empresas').update({ actividades: lista })
            .eq('id', empresa.id).select('id, codigo, nombre, actividades, activa').single();
        if (error) return error;
        cambiarEmpresaActiva(data); // js/sesion.js
        return null;
    }

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (!esDesarrollador() || (!editando && !creando)) return;
        errorCaja.textContent = '';

        const nombre = campos.nombre.value.trim();
        if (!nombre) {
            errorCaja.textContent = 'Escribe el nombre.';
            campos.nombre.focus();
            return;
        }
        const datos = {
            nombre,
            descripcion: campos.descripcion.value.trim() || null,
            icono: campos.icono.value,
            activa: campos.activa.checked,
        };
        casillasUso.filter((c) => !c.disabled).forEach((c) => { datos[c.dataset.usa] = c.checked; });

        // Palabras: en minúsculas; singular y plural van juntos
        if (tienePalabras) {
            casillasPalabra.forEach((c) => { datos[c.dataset.palabra] = c.value.trim().toLowerCase() || null; });
            const incompleta = [['palabra_registro', 'palabra_registros', 'el registro'], ['palabra_conductor', 'palabra_conductores', 'el conductor']]
                .find(([s, p]) => !datos[s] !== !datos[p]);
            if (incompleta) {
                errorCaja.textContent = `Escribe ${incompleta[2]} en singular y en plural (o deja los dos vacíos).`;
                return;
            }
        }

        let codigo = editando ? editando.codigo : campos.codigo.value.trim();
        if (creando) {
            if (!ACT_CODIGO_VALIDO.test(codigo)) {
                errorCaja.textContent = 'El código: de 2 a 30 letras minúsculas, números o _, y empieza con una letra (ej. transporte).';
                campos.codigo.focus();
                return;
            }
            if (actividades.some((a) => a.codigo === codigo)) {
                errorCaja.textContent = 'Ya existe una actividad con ese código.';
                campos.codigo.focus();
                return;
            }
            datos.codigo = codigo;
            datos.orden = Math.max(0, ...actividades.map((a) => a.orden || 0)) + 1;
        }

        botonGuardar.disabled = true;
        const { error } = creando
            ? await db.from('actividades').insert(datos)
            : await db.from('actividades').update(datos).eq('codigo', codigo);

        if (error) {
            botonGuardar.disabled = false;
            console.error('Error al guardar la actividad:', error);
            errorCaja.textContent = error.code === '23505' ? 'Ya existe una actividad con ese código.' : 'No se pudo guardar. Intenta de nuevo.';
            return;
        }

        let mensaje = creando ? `Actividad "${nombre}" creada.` : `Actividad "${nombre}" actualizada.`;
        let tipo = 'ok';
        if (creando) {
            if (!$('#cfgActAgregarCampo').hidden && campos.agregar.checked) {
                const errEmpresa = await agregarAEmpresa(codigo);
                if (errEmpresa) {
                    console.error('Error al agregar la actividad a la empresa:', errEmpresa);
                    mensaje += ' No se pudo agregar a la empresa: márcala en Tiendas → Empresas.';
                    tipo = 'error';
                } else {
                    mensaje += ` Ya la realiza ${empresaActual().nombre}: crea su tarifa general en Configuración → Pedidos.`;
                }
            } else if (!empresaActual()) {
                mensaje += ' Agrega su código a "actividades" en empresas/empresas.js para que aparezca.';
            }
        }
        botonGuardar.disabled = false;
        editar.close();
        aviso.mostrar(mensaje, tipo);
        cargar();
        if (typeof cargarPalabras === 'function') cargarPalabras(); // js/palabras.js: Pedido -> Viaje al instante
    });

    // ==================================================
    // ABRIR Y LIMPIAR
    // ==================================================

    return {
        abrir() {
            cuerpo.replaceChildren(crearFilaVacia('Cargando actividades...', 4));
            ventana.showModal();
            cargar();
        },
        limpiar() {
            [editar, ventana].forEach((d) => { if (d.open) d.close(); });
        },
    };
});
