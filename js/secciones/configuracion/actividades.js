/* ==================================================
   CONFIGURACIÓN -> ACTIVIDADES (ventana flotante)
   ACACHETE LOGISTICS

   Lo carga js/secciones/configuracion.js la primera vez que se presiona
   la tarjeta "Actividades". A diferencia de los otros módulos, NO abre una
   página: abre la ventana flotante #cfgActDialogo encima de las tarjetas.
   Tabla: actividades (sql/00, sección 6).

   Qué se puede hacer:
     - Ver las actividades de la EMPRESA (las que indica empresas/empresas.js),
       qué usa cada una y si están activas.
     - Modificar nombre, descripción, activa y qué usa en los pedidos.
       Una actividad ACTIVA queda disponible en TODAS las tiendas (no se
       elige por tienda).
       Lo que usa cada actividad decide qué partes muestra el formulario
       de Pedidos (bodega, recolección, tamaños, compra, alcohol).
       (No se agregan ni se eliminan desde aquí.)

   Solo el Desarrollador (esDesarrollador, js/sesion.js); el Administrador no la ve.
   ⚠ Lo controla la página; la regla real llega en la Fase 7.

   Como es una ventana (no una página), devuelve { abrir, limpiar } en vez
   de solo la función de limpieza.
   ================================================== */

// Lo que puede usar una actividad (columnas usa_* de la tabla actividades) y su texto corto
const ACT_USOS = {
    usa_bodega:      'Bodega',
    usa_recoleccion: 'Recolección',
    usa_tamanos:     'Tamaños',
    usa_compra:      'Compra',
    permite_alcohol: 'Alcohol',
};

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
        descripcion: $('#cfgActDescripcion'),
        activa:      $('#cfgActActiva'),
    };
    const casillasUso = [...zona.querySelectorAll('#cfgActEditar [data-usa]')];

    // ---------- Datos ----------
    let actividades = [];        // [{ codigo, nombre, descripcion, icono, activa, usa_bodega, ... }]
    let tieneUsos = true;        // false si falta sql/01_actualizacion_base_existente (solo existe usa_bodega)
    let editando = null;         // actividad que se está modificando

    const faltaColumna = (e) => !!e && e.code === '42703';

    // ==================================================
    // LISTA
    // ==================================================

    async function cargar() {
        const base = 'codigo, nombre, descripcion, icono, activa, orden, usa_bodega';
        let act = await db.from('actividades').select(`${base}, ${Object.keys(ACT_USOS).filter((u) => u !== 'usa_bodega').join(', ')}`).order('orden');
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
        // Solo las actividades que realiza la empresa (empresas/empresas.js)
        actividades = actividadesDeLaEmpresa(act.data);
        if (!tieneUsos) aviso.mostrar('Falta ejecutar sql/01_actualizacion_base_existente.sql en Supabase para elegir qué usa cada actividad.', 'error');
        dibujar();
    }

    function dibujar() {
        cuerpo.replaceChildren();
        if (!actividades.length) {
            cuerpo.appendChild(crearFilaVacia('La empresa no tiene actividades (revisa empresas/empresas.js).', 4));
            return;
        }
        actividades.forEach((a) => {
            const tr = document.createElement('tr');

            // Icono + nombre (+ descripción chica)
            const tdNombre = document.createElement('td');
            const icono = document.createElement('i');
            icono.className = `bi ${a.icono} cfg-icono-fila`;
            tdNombre.append(icono, ` ${a.nombre}`);
            if (a.descripcion) {
                const desc = document.createElement('small');
                desc.className = 'cfg-act-desc';
                desc.textContent = a.descripcion;
                tdNombre.appendChild(desc);
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
        if (actividad) abrirEdicion(actividad);
    });

    $('#cfgActCerrar').addEventListener('click', () => ventana.close());

    // ==================================================
    // MODIFICAR (ventana encima de la lista)
    // ==================================================

    function abrirEdicion(a) {
        editando = a;
        errorCaja.textContent = '';
        $('#cfgActEditarTitulo').textContent = `Modificar: ${a.nombre}`;
        campos.nombre.value = a.nombre;
        campos.descripcion.value = a.descripcion || '';
        campos.activa.checked = a.activa;

        // Qué usa (sin la actualización de la base solo se puede cambiar la bodega)
        casillasUso.forEach((c) => {
            c.checked = !!a[c.dataset.usa];
            c.disabled = !tieneUsos && c.dataset.usa !== 'usa_bodega';
        });

        editar.showModal();
        campos.nombre.focus();
    }

    $('#cfgActCancelar').addEventListener('click', () => editar.close());
    editar.addEventListener('close', () => { editando = null; });

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (!editando || !esDesarrollador()) return;
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
            activa: campos.activa.checked,
        };
        casillasUso.filter((c) => !c.disabled).forEach((c) => { datos[c.dataset.usa] = c.checked; });

        botonGuardar.disabled = true;
        const { error } = await db.from('actividades').update(datos).eq('codigo', editando.codigo);
        botonGuardar.disabled = false;

        if (error) {
            console.error('Error al guardar la actividad:', error);
            errorCaja.textContent = 'No se pudo guardar. Intenta de nuevo.';
            return;
        }
        editar.close();
        aviso.mostrar(`Actividad "${nombre}" actualizada.`);
        cargar();
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
