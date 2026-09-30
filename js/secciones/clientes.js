/* ==================================================
   SECCIÓN: CLIENTES - LÓGICA
   ACACHETE LOGISTICS

   Base de datos de clientes compartida: un cliente puede estar
   asignado a VARIAS tiendas (tabla "clientes_tiendas").
   Tablas: "clientes" y "clientes_tiendas" (sql/00, sección 4).

   Se abre desde Tiendas. Parámetros del # (js/pagina_inicial.js):
     #clientes?tienda=3  -> filtra por esa tienda (y la marca al crear)
     #clientes?nuevo=1   -> abre el formulario "Nuevo cliente"

   QUIÉN VE QUÉ (alcance):
     Administrador / Admin G1 -> todos los clientes
     Admin G2                 -> clientes de tiendas de SU región
     Admin G3                 -> clientes de SU tienda
     Empleado                 -> clientes de SU tienda
     Piloto                   -> sin acceso (SECCIONES_POR_ROL en js/sesion.js)

   QUIÉN HACE QUÉ:
     Administrador / Admin G1 -> crear, modificar, eliminar, aprobar
     Admin G2                 -> lo mismo, solo en su región
     Admin G3                 -> lo mismo, solo en su tienda (aprueba a sus Empleados)
     Empleado                 -> crear y modificar, pero queda PENDIENTE
                                 DE APROBACIÓN; no elimina
       - Cliente nuevo: se guarda con aprobado = false y su tienda.
       - Modificación: se guarda en "cambios_pendientes" y los datos
         reales NO cambian hasta que se aprueba.
     Aprobar / rechazar: botón naranja "Revisar" (solo quien administra).
       - Rechazar un cliente nuevo lo elimina.
       - Rechazar cambios los descarta.
     Notificaciones (js/notificaciones.js): lo que propone un Empleado avisa
     SOLO al Admin G3 de su tienda (o al G2 de la región si la tienda no
     tiene G3); al aprobar/rechazar se avisa al Empleado.

   PENDIENTE (Fase 2 - Pedidos): calificación 1 a 5 por pedido y
   categoría según el promedio: A ≥ 4.5, B ≥ 3.5, C ≥ 2.5, D < 2.5.
   Por ahora todos aparecen como "Nuevo". Qué permite o bloquea cada
   categoría se definirá al construir Pedidos.

   ⚠ Modo rápido: estas reglas las aplica la página (Fase 7: base de datos).

   HTML: secciones/clientes.html
   Estilos: css/secciones/clientes.css (propios) + css/componentes.css (comunes)
   Funciones comunes: js/componentes.js
   ================================================== */

// Columnas que se traen. "clientes_tiendas(tienda_id)" = tiendas del cliente;
// "solicitante:usuarios!solicitado_por(nombre)" = quién pidió la aprobación.
const CLI_COLUMNAS = 'id, nombre, apellidos, telefono, direccion, ubicacion, aprobado, ' +
    'cambios_pendientes, solicitado_por, solicitado_en, ' +
    'clientes_tiendas(tienda_id), solicitante:usuarios!solicitado_por(nombre)';

// Datos del cliente que se pueden modificar (y su nombre para mostrar)
const CLI_CAMPOS = {
    nombre: 'Nombre',
    apellidos: 'Apellidos',
    telefono: 'Teléfono',
    direccion: 'Dirección',
    ubicacion: 'Ubicación',
};

// Número de columnas de la tabla (para las filas que ocupan todo el ancho)
const CLI_COLUMNAS_TABLA = 8;

registrarSeccion('clientes', (zona) => {

    // ---------- Elementos de la página ----------
    const $ = (selector) => zona.querySelector(selector);

    const contador     = $('#cliContador');
    const buscador     = $('#cliBuscar');
    const filtroTienda = $('#cliFiltroTienda');
    const filtroEstado = $('#cliFiltroEstado');
    const cuerpo       = $('#cliCuerpo');
    const botonNuevo   = $('#cliNuevo');

    const dialogo      = $('#cliDialogo');
    const form         = $('#cliForm');
    const tituloForm   = $('#cliDialogoTitulo');
    const errorForm    = $('#cliFormError');
    const botonGuardar = $('#cliGuardar');
    const campoTiendas = $('#cliCampoTiendas');
    const cajaTiendas  = $('#cliTiendas');
    const campos = {
        nombre:    $('#cliNombre'),
        apellidos: $('#cliApellidos'),
        telefono:  $('#cliTelefono'),
        direccion: $('#cliDireccion'),
        ubicacion: $('#cliUbicacion'),
    };

    const revisar        = $('#cliRevisar');
    const revisarTexto   = $('#cliRevisarTexto');
    const revisarCambios = $('#cliRevisarCambios');

    const confirmar       = $('#cliConfirmar');
    const confirmarTexto  = $('#cliConfirmarTexto');
    const botonSiEliminar = $('#cliSiEliminar');

    // Avisos verdes/rojos (crearAviso está en js/componentes.js)
    const aviso = crearAviso($('#cliAviso'), 5000);

    // ---------- Permisos del usuario conectado (js/sesion.js) ----------
    const sesion     = obtenerSesion();
    const admin      = esAdministrador();
    const g1         = esAdminG1();
    const g2         = esAdminG2();
    const g3         = esAdminG3();
    const miRegion   = regionActual();
    const esEmpleado = rolActual() === 'empleado';
    const miTienda   = tiendaActual(); // Admin G3 y Empleado

    const administra = admin || g1 || g2 || g3;    // crea/modifica directo, elimina, aprueba
    const puedeCrear = administra || esEmpleado;   // el Empleado crea con aprobación

    if (!puedeCrear) {
        botonNuevo.hidden = true;
        zona.querySelector('th.tabla-col-acciones').remove();
    }
    const columnas = puedeCrear ? CLI_COLUMNAS_TABLA : CLI_COLUMNAS_TABLA - 1;

    // ---------- Estado ----------
    let clientes = [];          // clientes dentro del alcance del usuario
    let todasTiendas = [];      // todas las tiendas (para mostrar códigos)
    let tiendasAlcance = [];    // tiendas que el usuario puede ver/asignar
    let editando = null;        // null = creando; objeto = cliente que se modifica
    let revisando = null;       // cliente cuya solicitud se revisa
    let eliminandoId = null;

    const idsAlcance = () => new Set(tiendasAlcance.map((t) => t.id));
    const idsTiendasDe = (c) => (c.clientes_tiendas || []).map((ct) => ct.tienda_id);

    // ¿El cliente está dentro del alcance del usuario?
    function enAlcance(c) {
        if (admin || g1) return true;
        const alcance = idsAlcance();
        return idsTiendasDe(c).some((id) => alcance.has(id));
    }

    // ¿Puede modificarlo directo, eliminarlo y aprobar sus solicitudes?
    //   Admin / G1 -> todos | G2 -> su región | G3 -> su tienda
    const puedeAdministrar = (c) => (admin || g1) || ((g2 || g3) && enAlcance(c));

    // ¿Puede abrir el formulario de modificar? (el Empleado, con aprobación)
    const puedeModificar = (c) => puedeAdministrar(c) || (esEmpleado && enAlcance(c));

    // ¿Tiene algo esperando aprobación?
    const esPendiente = (c) => !c.aprobado || !!c.cambios_pendientes;

    // ==================================================
    // CARGAR DATOS
    // ==================================================

    async function cargarTiendas() {
        const { data, error } = await db.from('tiendas').select('id, codigo, nombre, region, estado').order('codigo');
        if (error) {
            console.error('Error al cargar tiendas:', error);
            return;
        }
        todasTiendas = data;

        // Tiendas que el usuario puede ver y asignar
        if (admin || g1) tiendasAlcance = data;
        else if (g2) tiendasAlcance = data.filter((t) => t.region === miRegion);
        else if (g3 || esEmpleado) tiendasAlcance = data.filter((t) => t.id === miTienda);
        else tiendasAlcance = [];

        // Filtro de tiendas
        tiendasAlcance.forEach((t) => filtroTienda.appendChild(new Option(`${t.codigo} · ${t.nombre}`, t.id)));

        // Casillas del formulario
        cajaTiendas.replaceChildren();
        tiendasAlcance.forEach((t) => {
            const etiqueta = document.createElement('label');
            etiqueta.className = 'cli-tienda-opcion';
            const casilla = document.createElement('input');
            casilla.type = 'checkbox';
            casilla.value = t.id;
            const texto = document.createElement('span');
            texto.textContent = `${t.codigo} · ${t.nombre}`;
            etiqueta.append(casilla, texto);
            cajaTiendas.appendChild(etiqueta);
        });
    }

    async function cargarClientes() {
        const { data, error } = await db.from('clientes').select(CLI_COLUMNAS).order('apellidos');
        if (error) {
            console.error('Error al cargar clientes:', error);
            contador.textContent = 'No se pudo cargar la lista.';
            aviso.mostrar(error.code === '42P01' || error.code === 'PGRST205'
                ? 'Falta instalar la base de datos (sql/00_instalacion_completa.sql).'
                : 'No se pudieron cargar los clientes. Revisa la conexión.', 'error');
            return;
        }
        clientes = data.filter(enAlcance);
        dibujarTabla();
    }

    // ==================================================
    // TABLA
    // ==================================================

    // ¿Es un enlace web? (solo http/https, por seguridad)
    function esEnlace(texto) {
        if (!/^https?:\/\//i.test(texto || '')) return false;
        try { new URL(texto); return true; } catch { return false; }
    }

    // Celda de ubicación: enlace "Ver en mapa" o el texto de referencia
    function celdaUbicacion(ubicacion) {
        if (!esEnlace(ubicacion)) return crearCelda(ubicacion);
        const td = document.createElement('td');
        const enlace = document.createElement('a');
        enlace.className = 'cli-mapa';
        enlace.href = ubicacion;
        enlace.target = '_blank';
        enlace.rel = 'noopener noreferrer';
        enlace.innerHTML = '<i class="bi bi-geo-alt"></i>';
        enlace.append(' Ver en mapa');
        td.appendChild(enlace);
        return td;
    }

    // Celda "Nombre Apellidos" + (si está pendiente) "Solicitado por ..."
    function celdaCliente(c) {
        const td = crearCelda(`${c.nombre} ${c.apellidos}`);
        if (esPendiente(c) && c.solicitante) {
            const detalle = document.createElement('span');
            detalle.className = 'celda-detalle'; // css/componentes.css
            const fecha = c.solicitado_en ? new Date(c.solicitado_en).toLocaleDateString('es') : '';
            detalle.textContent = `Solicitado por ${c.solicitante.nombre}${fecha ? ' el ' + fecha : ''}`;
            td.appendChild(detalle);
        }
        return td;
    }

    // Códigos de las tiendas del cliente: "CEN-001, NOR-002"
    function textoTiendas(c) {
        return idsTiendasDe(c)
            .map((id) => (todasTiendas.find((t) => t.id === id) || {}).codigo)
            .filter(Boolean)
            .sort()
            .join(', ');
    }

    function celdaEstado(c) {
        if (!c.aprobado) return crearCeldaEtiqueta('Nuevo · pendiente', 'etiqueta-naranja');
        if (c.cambios_pendientes) return crearCeldaEtiqueta('Cambios pendientes', 'etiqueta-naranja');
        return crearCeldaEtiqueta('Aprobado', 'etiqueta-verde');
    }

    function crearFilaCliente(c) {
        const tr = document.createElement('tr');
        tr.appendChild(celdaCliente(c));
        tr.appendChild(crearCelda(c.telefono));
        tr.appendChild(crearCelda(c.direccion));
        tr.appendChild(celdaUbicacion(c.ubicacion));
        tr.appendChild(crearCelda(textoTiendas(c), 'texto-codigo'));
        // Categoría: se calculará con las calificaciones de Pedidos (Fase 2)
        tr.appendChild(crearCeldaEtiqueta('Nuevo', 'etiqueta-gris'));
        tr.appendChild(celdaEstado(c));

        if (puedeCrear) {
            const botones = [];

            // Revisar (aprobar/rechazar): solo quien administra y si hay algo pendiente
            if (esPendiente(c) && puedeAdministrar(c)) {
                botones.push(crearBotonIcono('revisar', c.id, 'bi-clipboard-check', 'Revisar solicitud (aprobar o rechazar)'));
            }

            botones.push(crearBotonIcono('editar', c.id, 'bi-pencil',
                puedeModificar(c)
                    ? (esEmpleado ? 'Proponer cambios (requieren aprobación)' : `Modificar a ${c.nombre}`)
                    : 'No tienes permiso para modificar este cliente',
                !puedeModificar(c)));

            botones.push(crearBotonIcono('eliminar', c.id, 'bi-trash3',
                puedeAdministrar(c) ? `Eliminar a ${c.nombre}` : 'Solo un administrador puede eliminar clientes',
                !puedeAdministrar(c)));

            tr.appendChild(crearCeldaAcciones(...botones));
        }
        return tr;
    }

    function dibujarTabla() {
        const tienda = filtroTienda.value;
        const estado = filtroEstado.value;
        const filtro = buscador.value.trim();

        const visibles = clientes.filter((c) =>
            (!tienda || idsTiendasDe(c).includes(Number(tienda))) &&
            (!estado || (estado === 'pendiente' ? esPendiente(c) : !esPendiente(c))) &&
            coincideBusqueda([c.nombre, c.apellidos, `${c.nombre} ${c.apellidos}`, c.telefono, c.direccion], filtro)
        );

        cuerpo.replaceChildren();
        if (visibles.length === 0) {
            cuerpo.appendChild(crearFilaVacia(
                clientes.length ? 'No hay clientes que coincidan con los filtros.' : 'Aún no hay clientes. Agrega el primero con "Nuevo cliente".',
                columnas
            ));
        }
        visibles.forEach((c) => cuerpo.appendChild(crearFilaCliente(c)));

        // "12 clientes · 2 pendientes de aprobación"
        const pendientes = clientes.filter(esPendiente).length;
        contador.textContent = plural(clientes.length, 'cliente', 'clientes') +
            (pendientes ? ` · ${plural(pendientes, 'pendiente', 'pendientes')} de aprobación` : '');
    }

    buscador.addEventListener('input', dibujarTabla);
    filtroTienda.addEventListener('change', dibujarTabla);
    filtroEstado.addEventListener('change', dibujarTabla);

    // Un solo "escuchador" para todos los botones de la tabla
    cuerpo.addEventListener('click', (evento) => {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton || boton.disabled) return;
        const cliente = clientes.find((c) => c.id === Number(boton.dataset.id));
        if (!cliente) return;

        if (boton.dataset.accion === 'revisar' && puedeAdministrar(cliente)) abrirRevision(cliente);
        if (boton.dataset.accion === 'editar' && puedeModificar(cliente)) abrirFormulario(cliente);
        if (boton.dataset.accion === 'eliminar' && puedeAdministrar(cliente)) pedirConfirmacion(cliente);
    });

    // ==================================================
    // CREAR / MODIFICAR
    // ==================================================

    function abrirFormulario(cliente = null) {
        editando = cliente;
        form.reset();
        errorForm.textContent = '';
        tituloForm.textContent = cliente ? 'Modificar cliente' : 'Nuevo cliente';

        // Empleado: aviso de aprobación y sin casillas de tienda (va su tienda)
        $('#cliAvisoAprobacion').hidden = !esEmpleado;
        campoTiendas.hidden = esEmpleado;

        // Datos: si el Empleado ya propuso cambios, se muestran los propuestos
        const datos = cliente
            ? { ...cliente, ...(esEmpleado && cliente.cambios_pendientes ? cliente.cambios_pendientes : {}) }
            : {};
        Object.keys(CLI_CAMPOS).forEach((campo) => { campos[campo].value = datos[campo] || ''; });

        // Casillas: tiendas del cliente; al crear, la del filtro
        // (o la única que tiene, ej. el Admin G3)
        const marcadas = cliente
            ? idsTiendasDe(cliente)
            : filtroTienda.value ? [Number(filtroTienda.value)]
            : tiendasAlcance.length === 1 ? [tiendasAlcance[0].id]
            : [];
        cajaTiendas.querySelectorAll('input').forEach((casilla) => {
            casilla.checked = marcadas.includes(Number(casilla.value));
        });

        dialogo.showModal();
        campos.nombre.focus();
    }

    botonNuevo.addEventListener('click', () => {
        if (puedeCrear) abrirFormulario();
    });
    $('#cliCancelar').addEventListener('click', () => dialogo.close());

    function fallo(mensaje, campo) {
        errorForm.textContent = mensaje;
        if (campo) campo.focus();
        return null;
    }

    // Lee y valida. Devuelve { datos, tiendas } o null.
    function leerFormulario() {
        const datos = {};
        Object.keys(CLI_CAMPOS).forEach((campo) => {
            datos[campo] = campos[campo].value.trim() || null;
        });

        if (!datos.nombre) return fallo('Escribe el nombre.', campos.nombre);
        if (!datos.apellidos) return fallo('Escribe los apellidos.', campos.apellidos);
        if (!datos.telefono) return fallo('Escribe el teléfono.', campos.telefono);

        const tiendas = [...cajaTiendas.querySelectorAll('input:checked')].map((c) => Number(c.value));
        if (!esEmpleado && tiendas.length === 0) {
            return fallo('Marca al menos una tienda que atienda a este cliente.');
        }
        if (esEmpleado && !miTienda) {
            return fallo('Tu usuario no tiene tienda asignada. Pide a un administrador que lo revise.');
        }
        return { datos, tiendas };
    }

    // Asigna/quita tiendas (solo dentro del alcance del usuario)
    async function sincronizarTiendas(clienteId, actuales, elegidas) {
        const alcance = idsAlcance();
        const agregar = elegidas.filter((id) => !actuales.includes(id));
        const quitar = actuales.filter((id) => alcance.has(id) && !elegidas.includes(id));

        if (agregar.length) {
            const { error } = await db.from('clientes_tiendas')
                .insert(agregar.map((tienda_id) => ({ cliente_id: clienteId, tienda_id })));
            if (error) return error;
        }
        if (quitar.length) {
            const { error } = await db.from('clientes_tiendas')
                .delete().eq('cliente_id', clienteId).in('tienda_id', quitar);
            if (error) return error;
        }
        return null;
    }

    // Guarda según quién es y si crea o modifica. Devuelve { error, mensaje }.
    async function guardar({ datos, tiendas }) {
        const ahora = new Date().toISOString();

        // --- Empleado: todo queda pendiente de aprobación ---
        if (esEmpleado) {
            if (!editando) {
                const { data, error } = await db.from('clientes')
                    .insert({ ...datos, aprobado: false, solicitado_por: sesion.id, solicitado_en: ahora })
                    .select('id').single();
                if (error) return { error };
                const errorTienda = await sincronizarTiendas(data.id, [], [miTienda]);
                if (errorTienda) return { error: errorTienda };

                // Solicitud de tienda: se avisa SOLO al Admin G3 de la tienda
                // (o al G2 de la región si no hay G3) - js/notificaciones.js
                notificarPendiente({
                    referenciaTipo: 'cliente', referenciaId: data.id, tiendaId: miTienda, soloTienda: true,
                    titulo: 'Cliente nuevo por aprobar',
                    mensaje: `${sesion.nombre} agregó a ${datos.nombre} ${datos.apellidos} (tel. ${datos.telefono}).`,
                    enlace: `#clientes?tienda=${miTienda}`,
                });
                return { mensaje: 'Solicitud enviada: el cliente quedará pendiente hasta que un administrador lo apruebe.' };
            }

            // Un cliente nuevo que aún no se aprueba se corrige directo (sigue pendiente)
            if (!editando.aprobado) {
                const { error } = await db.from('clientes')
                    .update({ ...datos, solicitado_por: sesion.id, solicitado_en: ahora }).eq('id', editando.id);
                return error ? { error } : { mensaje: 'Solicitud actualizada. Sigue pendiente de aprobación.' };
            }

            // Cliente aprobado: solo se guardan los datos que cambian, como propuesta
            const cambios = {};
            Object.keys(CLI_CAMPOS).forEach((campo) => {
                if ((datos[campo] || null) !== (editando[campo] || null)) cambios[campo] = datos[campo];
            });
            if (Object.keys(cambios).length === 0) {
                return { error: { mensajePropio: 'No cambiaste ningún dato.' } };
            }
            const { error } = await db.from('clientes')
                .update({ cambios_pendientes: cambios, solicitado_por: sesion.id, solicitado_en: ahora })
                .eq('id', editando.id);
            if (error) return { error };

            // Solicitud de tienda: se avisa SOLO al Admin G3 de la tienda (o al G2 si no hay G3)
            notificarPendiente({
                referenciaTipo: 'cliente', referenciaId: editando.id, tiendaId: miTienda, soloTienda: true,
                titulo: 'Cambios de cliente por aprobar',
                mensaje: `${sesion.nombre} propuso cambios para ${editando.nombre} ${editando.apellidos} ` +
                    `(${Object.keys(cambios).map((c) => CLI_CAMPOS[c].toLowerCase()).join(', ')}).`,
                enlace: `#clientes?tienda=${miTienda}`,
            });
            return { mensaje: 'Cambios enviados para aprobación.' };
        }

        // --- Administrador / Admin G1 / Admin G2: se guarda directo ---
        if (!editando) {
            const { data, error } = await db.from('clientes').insert(datos).select('id').single();
            if (error) return { error };
            const errorTiendas = await sincronizarTiendas(data.id, [], tiendas);
            if (errorTiendas) return { error: errorTiendas };
            return { mensaje: `Cliente "${datos.nombre} ${datos.apellidos}" creado.` };
        }

        const { error } = await db.from('clientes').update(datos).eq('id', editando.id);
        if (error) return { error };
        const errorTiendas = await sincronizarTiendas(editando.id, idsTiendasDe(editando), tiendas);
        if (errorTiendas) return { error: errorTiendas };
        return { mensaje: `Cliente "${datos.nombre} ${datos.apellidos}" actualizado.` };
    }

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (!puedeCrear) return;
        errorForm.textContent = '';

        const leido = leerFormulario();
        if (!leido) return;

        botonGuardar.disabled = true;
        botonGuardar.textContent = 'Guardando...';
        const { error, mensaje } = await guardar(leido);
        botonGuardar.disabled = false;
        botonGuardar.textContent = 'Guardar';

        if (error) {
            console.error('Error al guardar cliente:', error);
            errorForm.textContent = error.mensajePropio || 'No se pudo guardar. Revisa la conexión e intenta de nuevo.';
            return;
        }

        dialogo.close();
        aviso.mostrar(mensaje);
        cargarClientes();
    });

    // ==================================================
    // REVISAR SOLICITUD (aprobar / rechazar)
    // ==================================================

    function abrirRevision(cliente) {
        revisando = cliente;
        const quien = cliente.solicitante ? cliente.solicitante.nombre : 'un empleado';
        const cuerpoCambios = revisarCambios.querySelector('tbody');
        cuerpoCambios.replaceChildren();

        if (!cliente.aprobado) {
            // Cliente nuevo
            revisarTexto.textContent = `${quien} pidió agregar a "${cliente.nombre} ${cliente.apellidos}" ` +
                `(tel. ${cliente.telefono}) en ${textoTiendas(cliente) || 'su tienda'}. ` +
                'Si lo rechazas, el cliente se elimina.';
            revisarCambios.hidden = true;
        } else {
            // Cambios propuestos: tabla Dato | Actual | Propuesto
            revisarTexto.textContent = `${quien} propuso estos cambios para "${cliente.nombre} ${cliente.apellidos}":`;
            Object.entries(cliente.cambios_pendientes || {}).forEach(([campo, propuesto]) => {
                const tr = document.createElement('tr');
                tr.appendChild(crearCelda(CLI_CAMPOS[campo] || campo));
                tr.appendChild(crearCelda(cliente[campo]));
                tr.appendChild(crearCelda(propuesto));
                cuerpoCambios.appendChild(tr);
            });
            revisarCambios.hidden = false;
        }
        revisar.showModal();
    }

    $('#cliRevisarCerrar').addEventListener('click', () => revisar.close());

    // Enlace a la sección Clientes filtrada por la (primera) tienda del cliente
    const enlaceDeCliente = (c) => {
        const tienda = idsTiendasDe(c)[0];
        return tienda ? `#clientes?tienda=${tienda}` : '#clientes';
    };

    // Limpia los datos de la solicitud
    const sinSolicitud = { cambios_pendientes: null, solicitado_por: null, solicitado_en: null };

    $('#cliAprobar').addEventListener('click', async () => {
        const c = revisando;
        if (!c || !puedeAdministrar(c)) return revisar.close();

        const cambios = c.aprobado
            ? { ...(c.cambios_pendientes || {}), ...sinSolicitud } // aplica los cambios propuestos
            : { aprobado: true, ...sinSolicitud };                   // aprueba el cliente nuevo

        const { error } = await db.from('clientes').update(cambios).eq('id', c.id);
        revisar.close();
        if (error) {
            console.error('Error al aprobar:', error);
            aviso.mostrar('No se pudo aprobar. Intenta de nuevo.', 'error');
            return;
        }
        // Notificaciones (js/notificaciones.js): avisar al empleado y cerrar los "pendiente"
        notificarResultado({
            usuarioId: c.solicitado_por, aprobado: true,
            titulo: c.aprobado ? 'Cambios de cliente aprobados' : 'Cliente aprobado',
            mensaje: c.aprobado
                ? `Se aplicaron tus cambios a ${c.nombre} ${c.apellidos}.`
                : `${c.nombre} ${c.apellidos} ya está aprobado.`,
            enlace: enlaceDeCliente(c), referenciaTipo: 'cliente', referenciaId: c.id,
        });
        resolverPendientes('cliente', c.id);

        aviso.mostrar(c.aprobado ? 'Cambios aprobados y aplicados.' : `Cliente "${c.nombre} ${c.apellidos}" aprobado.`);
        cargarClientes();
    });

    $('#cliRechazar').addEventListener('click', async () => {
        const c = revisando;
        if (!c || !puedeAdministrar(c)) return revisar.close();

        // Cliente nuevo rechazado -> se elimina | Cambios rechazados -> se descartan
        const { error } = c.aprobado
            ? await db.from('clientes').update(sinSolicitud).eq('id', c.id)
            : await db.from('clientes').delete().eq('id', c.id);

        revisar.close();
        if (error) {
            console.error('Error al rechazar:', error);
            aviso.mostrar('No se pudo rechazar. Intenta de nuevo.', 'error');
            return;
        }
        // Notificaciones: avisar al empleado y cerrar los "pendiente"
        notificarResultado({
            usuarioId: c.solicitado_por, aprobado: false,
            titulo: c.aprobado ? 'Cambios de cliente rechazados' : 'Cliente rechazado',
            mensaje: c.aprobado
                ? `No se aplicaron tus cambios a ${c.nombre} ${c.apellidos}.`
                : `${c.nombre} ${c.apellidos} no se agregó.`,
            enlace: enlaceDeCliente(c),
        });
        resolverPendientes('cliente', c.id);

        aviso.mostrar(c.aprobado ? 'Cambios rechazados.' : 'Solicitud rechazada: el cliente no se agregó.');
        cargarClientes();
    });

    // ==================================================
    // ELIMINAR (solo quien administra)
    // ==================================================

    function pedirConfirmacion(cliente) {
        eliminandoId = cliente.id;
        confirmarTexto.textContent = `¿Seguro que quieres eliminar a "${cliente.nombre} ${cliente.apellidos}"? ` +
            'Se quitará de todas sus tiendas. Esta acción no se puede deshacer.';
        confirmar.showModal();
    }

    $('#cliNoEliminar').addEventListener('click', () => confirmar.close());

    botonSiEliminar.addEventListener('click', async () => {
        const c = clientes.find((x) => x.id === eliminandoId);
        if (!c || !puedeAdministrar(c)) return confirmar.close();

        botonSiEliminar.disabled = true;
        const { error } = await db.from('clientes').delete().eq('id', c.id);
        botonSiEliminar.disabled = false;
        confirmar.close();

        if (error) {
            console.error('Error al eliminar cliente:', error);
            aviso.mostrar('No se pudo eliminar el cliente. Intenta de nuevo.', 'error');
            return;
        }
        // Si tenía algo pendiente, esos avisos ya no aplican
        if (esPendiente(c)) resolverPendientes('cliente', c.id);

        aviso.mostrar(`Cliente "${c.nombre} ${c.apellidos}" eliminado.`);
        cargarClientes();
    });

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================

    // Parámetros del # (ej. #clientes?tienda=3&nuevo=1) - js/pagina_inicial.js
    const parametros = parametrosSeccion();

    cargarTiendas().then(async () => {
        // ?tienda=3 -> se filtra por esa tienda (si está en su alcance)
        const tiendaPedida = parametros.get('tienda');
        if (tiendaPedida && tiendasAlcance.some((t) => String(t.id) === tiendaPedida)) {
            filtroTienda.value = tiendaPedida;
        }

        await cargarClientes();

        // ?nuevo=1 -> abre el formulario directamente
        if (parametros.get('nuevo') === '1' && puedeCrear) abrirFormulario();
    });

    // Se ejecuta al salir de la sección (js/pagina_inicial.js)
    return () => {
        aviso.limpiar();
        [dialogo, revisar, confirmar].forEach((d) => { if (d.open) d.close(); });
    };
});
