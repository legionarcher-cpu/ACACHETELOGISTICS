/* ==================================================
   SECCIÓN: RUTAS Y ASIGNACIONES - LÓGICA
   ACACHETE LOGISTICS

   Tablas: rutas y rutas_pilotos (sql/00, sección 7).

   Qué se ve: un calendario de UNA semana (lunes a domingo) de UNA tienda:
     - una fila por ruta (nombre, actividad, activa)
     - una columna por día con el o los pilotos asignados ese día
   Qué se hace (Administrador, Admin G1 y Admin G2 de la región):
     - Crear, modificar y eliminar rutas de la tienda.
     - Asignar un piloto a una ruta por UN DÍA o por TODA LA SEMANA
       ("+" en el día, o el botón de la ruta). Una ruta puede tener varios
       pilotos el mismo día.
     - Quitar a un piloto (× en el día): se quita SOLO ese día; si estaba
       asignado toda la semana, los demás días se conservan (el período se
       parte en dos). También se puede quitar la semana completa.
     - PILOTOS: los de la tienda y los MULTITIENDA de otras tiendas de la misma
       región (columna usuarios.multitienda). Un piloto nunca puede estar en dos tiendas el mismo día.
       Si un piloto cambia de tienda, js/secciones/usuarios.js quita sus
       asignaciones futuras de la tienda anterior (salvo que sea multitienda).
   Admin G3: ve su tienda sin poder cambiar nada.
   Empleado y Piloto NO tienen acceso a esta sección (js/sesion.js); ven la
   ruta de cada pedido y las rutas del día en la sección Pedidos.

   Cómo se usa en Pedidos (js/secciones/pedidos.js): al registrar, el
   empleado elige la ruta y el piloto sale solo de esta asignación.
   ⚠ Lo controla la página; la regla real llega en la Fase 7.
   ================================================== */

// Nombres cortos de los días (lunes primero)
const RUT_DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

registrarSeccion('rutas', (zona) => {

    const $ = (selector) => zona.querySelector(selector);
    const aviso = crearAviso($('#rutAviso'), 4000);

    // ---------- Permisos (js/sesion.js) ----------
    const sesion = obtenerSesion() || {};
    const esGeneral = esAdministrador() || esAdminG1();
    const regionG2 = esAdminG2() ? regionActual() : null;
    const puedeGestionar = esGeneral || !!regionG2;

    // ---------- Elementos ----------
    const selTienda = $('#rutTienda');
    const inputFecha = $('#rutFecha');
    const cuerpo = $('#rutCuerpo');
    const dlgRuta = $('#rutRutaDialogo');
    const dlgAsignar = $('#rutAsignarDialogo');
    const dlgConfirmar = $('#rutConfirmar');

    // ---------- Estado ----------
    let tiendas = [];
    let actividades = [];
    let rutas = [];         // rutas de la tienda elegida
    let asignaciones = [];  // rutas_pilotos que tocan la semana
    let pilotos = [];       // pilotos de la tienda + multitienda de la región
    let nombresExtra = [];  // pilotos asignados que ya no están en la lista (solo el nombre)
    let semana = [];        // 7 fechas "2026-09-29" (lunes a domingo)
    let editandoRuta = null;
    let asignandoRuta = null;
    let accionConfirmada = null;

    // ==================================================
    // FECHAS
    // ==================================================

    // Fecha local -> "2026-09-29"
    const aTexto = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // "2026-09-29" -> Date (a mediodía, para evitar saltos por zona horaria)
    const aFecha = (t) => new Date(`${t}T12:00:00`);
    const hoy = aTexto(new Date());
    const corta = (t) => t.slice(8, 10) + '/' + t.slice(5, 7); // "29/09"

    // Las 7 fechas (lunes a domingo) de la semana de un día
    function semanaDe(texto) {
        const d = aFecha(texto);
        const desdeLunes = (d.getDay() + 6) % 7; // domingo = 6
        d.setDate(d.getDate() - desdeLunes);
        return Array.from({ length: 7 }, (_, i) => {
            const x = new Date(d);
            x.setDate(d.getDate() + i);
            return aTexto(x);
        });
    }

    function moverSemana(dias) {
        const d = aFecha(inputFecha.value || hoy);
        d.setDate(d.getDate() + dias);
        inputFecha.value = aTexto(d);
        cargarSemana();
    }

    // ==================================================
    // CARGAR
    // ==================================================

    async function cargarBase() {
        let q = db.from('tiendas').select('id, codigo, nombre, region').order('codigo');
        if (regionG2) q = q.eq('region', regionG2);
        else if (!esGeneral) q = q.eq('id', tiendaActual() || 0);
        const [tie, act] = await Promise.all([
            q,
            db.from('actividades').select('codigo, nombre').eq('activa', true).order('orden'),
        ]);
        if (tie.error || act.error) return tie.error || act.error;
        tiendas = tie.data;
        actividades = actividadesDeLaEmpresa(act.data); // solo las de la empresa (empresas/empresas.js)

        selTienda.replaceChildren();
        tiendas.forEach((t) => selTienda.appendChild(new Option(`${t.codigo} · ${t.nombre}`, t.id)));
        // Se puede abrir con #rutas?tienda=3
        const pedida = Number(parametrosSeccion().get('tienda'));
        if (pedida && tiendas.some((t) => t.id === pedida)) selTienda.value = String(pedida);
        // Los administradores (G2 o superior) siempre pueden cambiar de tienda,
        // aunque por ahora haya una sola
        selTienda.disabled = !puedeGestionar;
        return null;
    }

    async function cargarSemana() {
        const tiendaId = Number(selTienda.value);
        semana = semanaDe(inputFecha.value || hoy);
        dibujarCabecera();
        if (!tiendaId) {
            cuerpo.replaceChildren(crearFilaVacia('No tienes tiendas asignadas.', 8));
            return;
        }

        const [rut, pil] = await Promise.all([
            db.from('rutas').select('id, nombre, actividad, activa, orden').eq('tienda_id', tiendaId).order('orden').order('nombre'),
            cargarPilotos(tiendaId),
        ]);
        if (rut.error || pil.error) {
            const error = rut.error || pil.error;
            console.error('Error al cargar rutas:', error);
            if (error.code === 'PGRST205' || error.code === '42P01') $('#rutFaltaSql').hidden = false;
            else aviso.mostrar('No se pudieron cargar las rutas. Revisa la conexión.', 'error');
            cuerpo.replaceChildren();
            return;
        }
        rutas = rut.data;
        pilotos = pil.data;

        asignaciones = [];
        if (rutas.length) {
            const asi = await db.from('rutas_pilotos').select('id, ruta_id, piloto_id, fecha_desde, fecha_hasta')
                .in('ruta_id', rutas.map((r) => r.id)).lte('fecha_desde', semana[6]).gte('fecha_hasta', semana[0]);
            if (asi.error) console.error('Error al cargar asignaciones:', asi.error);
            else asignaciones = asi.data;
        }

        // Nombres de pilotos asignados que ya no están en la lista (ej. cambiaron de tienda)
        const faltan = [...new Set(asignaciones.map((a) => a.piloto_id))].filter((id) => !pilotos.some((p) => p.id === id));
        if (faltan.length) {
            const { data } = await db.from('usuarios').select('id, nombre').in('id', faltan);
            nombresExtra = data || [];
        }
        dibujar();
        dibujarQrPilotos();
    }

    // ==================================================
    // VALIDACIÓN DEL DÍA (G2 o superior): QR de hoy de cada piloto (js/qr.js)
    //   qr_piloto_dia(piloto) -> "ACACHETE-PILOTO:<token>" (solo sirve hoy)
    //   pilotos_dia.validado_en -> la tienda ya lo escaneó y confirmó su foto
    // ==================================================

    async function dibujarQrPilotos() {
        const caja = $('#rutQrCaja');
        caja.hidden = !puedeGestionar;
        if (!puedeGestionar) return;
        const ul = $('#rutQrPilotos');
        ul.replaceChildren();
        if (!pilotos.length) {
            const li = document.createElement('li');
            li.className = 'rut-qr-vacio';
            li.textContent = 'Esta tienda no tiene pilotos.';
            ul.appendChild(li);
            return;
        }
        const { data: hoyDatos, error } = await db.from('pilotos_dia').select('piloto_id, validado_en')
            .in('piloto_id', pilotos.map((p) => p.id)).eq('fecha', hoy);
        if (error) console.error('Error al cargar la validación del día (¿falta sql/01, bloque 14?):', error);
        pilotos.forEach((p) => {
            const li = document.createElement('li');
            li.className = 'rut-qr-piloto';
            const foto = document.createElement('span');
            foto.className = 'avatar avatar-chico';
            pintarAvatar(foto, p.nombre, p.foto_url); // js/avatar.js
            const textos = document.createElement('span');
            textos.className = 'rut-qr-textos';
            const nombre = document.createElement('strong');
            nombre.textContent = p.nombre;
            const estado = document.createElement('span');
            const v = (hoyDatos || []).find((x) => x.piloto_id === p.id && x.validado_en);
            estado.className = `etiqueta ${v ? 'etiqueta-verde' : 'etiqueta-gris'}`;
            estado.textContent = v
                ? `Validado ${new Date(v.validado_en).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}`
                : 'Sin validar hoy';
            textos.append(nombre, estado);
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'boton boton-secundario boton-chico';
            b.innerHTML = '<i class="bi bi-qr-code"></i> <span>QR de hoy</span>';
            b.addEventListener('click', () => mostrarQrPiloto(p));
            li.append(foto, textos, b);
            ul.appendChild(li);
        });
    }

    async function mostrarQrPiloto(p) {
        const { data, error } = await db.rpc('qr_piloto_dia', { p_piloto: p.id });
        if (error) {
            console.error('Error al obtener el QR del piloto:', error);
            aviso.mostrar(error.code === 'PGRST202' || error.code === '42883'
                ? 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloque 14: QR).'
                : 'No se pudo obtener el QR del piloto.', 'error');
            return;
        }
        mostrarQrEnVentana({ // js/qr.js
            titulo: 'QR del piloto · hoy',
            subtitulo: new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' }),
            texto: data,
            nombre: p.nombre,
            foto: p.foto_url,
            nota: 'La tienda lo escanea con "Escanear QR" al empezar el día y confirma que la foto coincide. Solo sirve hoy.',
            archivo: `qr-piloto-${p.id_usuario}-${hoy}`,
        });
    }

    // Pilotos que se pueden asignar a las rutas de una tienda:
    //   - los de la tienda (su tienda base)
    //   - los MULTITIENDA de otras tiendas de la misma región
    // Si todavía no existe la columna multitienda, solo los de la tienda.
    async function cargarPilotos(tiendaId) {
        const region = (tiendas.find((t) => t.id === tiendaId) || {}).region;
        const columnas = 'id, nombre, id_usuario, tienda_id, foto_url, tiendas(codigo, region)';
        let r = await db.from('usuarios').select(`${columnas}, multitienda`)
            .eq('rol', 'piloto').eq('aprobado', true)
            .or(`tienda_id.eq.${tiendaId},multitienda.eq.true`).order('nombre');
        if (r.error && r.error.code === '42703') { // base sin la columna multitienda: solo los de la tienda
            r = await db.from('usuarios').select(columnas)
                .eq('rol', 'piloto').eq('aprobado', true).eq('tienda_id', tiendaId).order('nombre');
        }
        if (r.error) return r;
        return {
            data: r.data.filter((p) => p.tienda_id === tiendaId || (p.multitienda && p.tiendas && p.tiendas.region === region)),
            error: null,
        };
    }

    // ==================================================
    // DIBUJAR
    // ==================================================

    function dibujarCabecera() {
        const tr = $('#rutCabecera');
        tr.replaceChildren();
        const th = document.createElement('th');
        th.textContent = 'Ruta';
        tr.appendChild(th);
        semana.forEach((f, i) => {
            const thDia = document.createElement('th');
            if (f === hoy) thDia.className = 'rut-hoy';
            const caja = document.createElement('span');
            caja.className = 'rut-dia';
            const nombre = document.createElement('span');
            nombre.textContent = RUT_DIAS[i];
            const fecha = document.createElement('small');
            fecha.textContent = corta(f);
            caja.append(nombre, fecha);
            thDia.appendChild(caja);
            tr.appendChild(thDia);
        });
        $('#rutSubtitulo').textContent = `Semana del ${corta(semana[0])} al ${corta(semana[6])}/${semana[6].slice(0, 4)}`;
    }

    const nombreActividad = (c) => (actividades.find((a) => a.codigo === c) || {}).nombre || c;
    const nombrePiloto = (id) => (pilotos.find((p) => p.id === id) || nombresExtra.find((p) => p.id === id) || {}).nombre || 'Piloto';
    // Piloto de otra tienda (multitienda): se muestra su tienda base
    const esDeOtraTienda = (p) => p.tienda_id !== Number(selTienda.value);

    function dibujar() {
        cuerpo.replaceChildren();
        if (!rutas.length) {
            cuerpo.appendChild(crearFilaVacia(puedeGestionar
                ? 'Esta tienda no tiene rutas. Usa "Nueva ruta".'
                : 'Esta tienda todavía no tiene rutas.', 8));
            return;
        }

        rutas.forEach((r) => {
            const tr = document.createElement('tr');

            // Columna de la ruta
            const tdRuta = document.createElement('td');
            const caja = document.createElement('div');
            caja.className = 'rut-ruta';
            const nombre = document.createElement('strong');
            nombre.textContent = r.nombre;
            caja.appendChild(nombre);
            const tipo = document.createElement('span');
            tipo.className = `etiqueta ${r.actividad ? 'etiqueta-naranja' : 'etiqueta-azul'}`;
            tipo.textContent = r.actividad ? `Solo ${nombreActividad(r.actividad)}` : 'Todas las actividades';
            caja.appendChild(tipo);
            if (!r.activa) {
                const inactiva = document.createElement('span');
                inactiva.className = 'etiqueta etiqueta-gris';
                inactiva.textContent = 'Inactiva';
                caja.appendChild(inactiva);
            }
            if (puedeGestionar) {
                const botones = document.createElement('div');
                botones.className = 'rut-ruta-botones';
                botones.append(
                    boton('asignar', r.id, 'bi-person-plus', `Asignar piloto a ${r.nombre}`, 'boton-icono-ver'),
                    boton('editar', r.id, 'bi-pencil', `Modificar ${r.nombre}`, 'boton-icono-editar'),
                    boton('eliminar', r.id, 'bi-trash3', `Eliminar ${r.nombre}`, 'boton-icono-eliminar'),
                );
                caja.appendChild(botones);
            }
            tdRuta.appendChild(caja);
            tr.appendChild(tdRuta);

            // Un día por columna
            semana.forEach((f) => {
                const td = document.createElement('td');
                if (f === hoy) td.className = 'rut-hoy';
                const lista = document.createElement('div');
                lista.className = 'rut-pilotos';
                const delDia = asignaciones.filter((a) => a.ruta_id === r.id && a.fecha_desde <= f && a.fecha_hasta >= f);
                delDia.forEach((a) => lista.appendChild(chip(a, f)));
                if (!delDia.length) {
                    const vacio = document.createElement('span');
                    vacio.className = 'rut-vacio';
                    vacio.textContent = 'Sin piloto';
                    lista.appendChild(vacio);
                }
                if (puedeGestionar) {
                    const mas = document.createElement('button');
                    mas.type = 'button';
                    mas.className = 'rut-agregar';
                    mas.dataset.accion = 'asignar';
                    mas.dataset.id = r.id;
                    mas.dataset.dia = f;
                    mas.innerHTML = '<i class="bi bi-plus"></i> Piloto';
                    mas.setAttribute('aria-label', `Asignar piloto a ${r.nombre} el ${corta(f)}`);
                    lista.appendChild(mas);
                }
                td.appendChild(lista);
                tr.appendChild(td);
            });
            cuerpo.appendChild(tr);
        });
    }

    function boton(accion, id, icono, texto, clase) {
        const b = crearBotonIcono(accion, id, icono, texto); // js/componentes.js
        b.classList.add(clase);
        return b;
    }

    // Piloto asignado (verde agua si es por varios días). dia = la columna donde está
    function chip(a, dia) {
        const variosDias = a.fecha_desde !== a.fecha_hasta;
        const c = document.createElement('span');
        c.className = `rut-chip${variosDias ? ' rut-chip-semana' : ''}`;
        c.title = variosDias ? `Del ${corta(a.fecha_desde)} al ${corta(a.fecha_hasta)}` : `Solo el ${corta(a.fecha_desde)}`;
        const nombre = document.createElement('span');
        nombre.textContent = nombrePiloto(a.piloto_id);
        c.appendChild(nombre);
        if (puedeGestionar) {
            const quitar = document.createElement('button');
            quitar.type = 'button';
            quitar.dataset.accion = 'quitar';
            quitar.dataset.id = a.id;
            quitar.dataset.dia = dia;
            quitar.innerHTML = '<i class="bi bi-x"></i>';
            quitar.setAttribute('aria-label', `Quitar a ${nombre.textContent} el ${corta(dia)}`);
            c.appendChild(quitar);
        }
        return c;
    }

    // ==================================================
    // ACCIONES
    // ==================================================

    cuerpo.addEventListener('click', (evento) => {
        const b = evento.target.closest('button[data-accion]');
        if (!b || !puedeGestionar) return;
        const id = Number(b.dataset.id);

        if (b.dataset.accion === 'asignar') abrirAsignar(rutas.find((r) => r.id === id), b.dataset.dia || null);
        if (b.dataset.accion === 'editar') abrirRuta(rutas.find((r) => r.id === id));
        if (b.dataset.accion === 'eliminar') {
            const r = rutas.find((x) => x.id === id);
            pedirConfirmacion(`¿Eliminar la ruta "${r.nombre}"? Se quitan sus pilotos asignados. Los pedidos que la usaban quedan sin ruta.`, async () => {
                const { error } = await db.from('rutas').delete().eq('id', id);
                if (error) {
                    console.error('Error al eliminar ruta:', error);
                    aviso.mostrar('No se pudo eliminar la ruta.', 'error');
                    return;
                }
                aviso.mostrar(`Ruta "${r.nombre}" eliminada.`);
                cargarSemana();
            });
        }
        if (b.dataset.accion === 'quitar') {
            const a = asignaciones.find((x) => x.id === id);
            const r = rutas.find((x) => x.id === a.ruta_id);
            const dia = b.dataset.dia;
            const nombre = nombrePiloto(a.piloto_id);
            const variosDias = a.fecha_desde !== a.fecha_hasta;
            const diaTexto = `${RUT_DIAS[semana.indexOf(dia)] || ''} ${corta(dia)}`.trim();

            // Quitar SOLO ese día (si era de varios días, el resto se conserva)
            const soloEseDia = async () => {
                const error = await quitarUnDia(a, dia);
                if (error) {
                    console.error('Error al quitar piloto:', error);
                    aviso.mostrar('No se pudo quitar el piloto.', 'error');
                    return;
                }
                aviso.mostrar(`${nombre} quitado de ${r.nombre} el ${diaTexto}.`);
                cargarSemana();
            };
            // Quitar el período completo (ej. toda la semana)
            const todo = async () => {
                const { error } = await db.from('rutas_pilotos').delete().eq('id', id);
                if (error) {
                    console.error('Error al quitar piloto:', error);
                    aviso.mostrar('No se pudo quitar el piloto.', 'error');
                    return;
                }
                aviso.mostrar(`${nombre} quitado de ${r.nombre} del ${corta(a.fecha_desde)} al ${corta(a.fecha_hasta)}.`);
                cargarSemana();
            };

            pedirConfirmacion(
                `¿Quitar a ${nombre} de "${r.nombre}" el ${diaTexto}?` +
                (variosDias ? ` Los demás días (del ${corta(a.fecha_desde)} al ${corta(a.fecha_hasta)}) se conservan.` : '') +
                ' Los pedidos ya asignados no cambian.',
                soloEseDia,
                variosDias ? {
                    texto: a.fecha_desde === semana[0] && a.fecha_hasta === semana[6] ? 'Toda la semana' : 'Todo el período',
                    accion: todo,
                } : null,
            );
        }
    });

    // ---------- Crear / modificar ruta ----------
    function abrirRuta(ruta = null) {
        editandoRuta = ruta;
        $('#rutRutaTitulo').textContent = ruta ? `Modificar ${ruta.nombre}` : 'Nueva ruta';
        $('#rutRutaError').textContent = '';
        const selAct = $('#rutActividad');
        selAct.replaceChildren(new Option('Todas las actividades', ''));
        actividades.forEach((a) => selAct.appendChild(new Option(`Solo ${a.nombre}`, a.codigo)));
        $('#rutNombre').value = ruta ? ruta.nombre : `Ruta ${rutas.length + 1}`;
        selAct.value = ruta && ruta.actividad ? ruta.actividad : '';
        $('#rutOrden').value = ruta ? ruta.orden : rutas.length + 1;
        $('#rutActiva').checked = ruta ? ruta.activa : true;
        dlgRuta.showModal();
        $('#rutNombre').focus();
    }

    $('#rutNueva').addEventListener('click', () => { if (puedeGestionar) abrirRuta(); });
    $('#rutRutaCancelar').addEventListener('click', () => dlgRuta.close());

    $('#rutRutaForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (!puedeGestionar) return;
        const error = $('#rutRutaError');
        const nombre = $('#rutNombre').value.trim();
        if (!nombre) {
            error.textContent = 'Escribe el nombre de la ruta.';
            return;
        }
        const datos = {
            nombre,
            actividad: $('#rutActividad').value || null,
            orden: Number($('#rutOrden').value) || 0,
            activa: $('#rutActiva').checked,
        };
        const { error: e } = editandoRuta
            ? await db.from('rutas').update(datos).eq('id', editandoRuta.id)
            : await db.from('rutas').insert({ ...datos, tienda_id: Number(selTienda.value) });
        if (e) {
            console.error('Error al guardar la ruta:', e);
            error.textContent = e.code === '23505' ? 'Esta tienda ya tiene una ruta con ese nombre.' : 'No se pudo guardar. Intenta de nuevo.';
            return;
        }
        dlgRuta.close();
        aviso.mostrar(editandoRuta ? 'Ruta actualizada.' : `Ruta "${nombre}" creada.`);
        cargarSemana();
    });

    // ---------- Asignar piloto (un día o la semana) ----------
    function abrirAsignar(ruta, dia = null) {
        asignandoRuta = ruta;
        $('#rutAsignarTitulo').textContent = `Asignar piloto a ${ruta.nombre}`;
        $('#rutAsignarError').textContent = '';

        const selPiloto = $('#rutPiloto');
        selPiloto.replaceChildren(new Option('Selecciona...', ''));
        pilotos.forEach((p) => selPiloto.appendChild(new Option(
            `${p.nombre} (${p.id_usuario})${esDeOtraTienda(p) ? ` · multitienda, base ${p.tiendas ? p.tiendas.codigo : ''}` : ''}`, p.id)));
        if (!pilotos.length) selPiloto.replaceChildren(new Option('Esta tienda no tiene pilotos', ''));

        const selDia = $('#rutDia');
        selDia.replaceChildren();
        semana.forEach((f, i) => selDia.appendChild(new Option(`${RUT_DIAS[i]} ${corta(f)}`, f)));
        selDia.value = dia || (semana.includes(hoy) ? hoy : semana[0]);

        // Desde el "+" de un día: "Un día"; desde el botón de la ruta: "Toda la semana"
        zona.querySelector(`input[name="rutPeriodo"][value="${dia ? 'dia' : 'semana'}"]`).checked = true;
        $('#rutDiaCaja').hidden = !dia;
        dlgAsignar.showModal();
        selPiloto.focus();
    }

    dlgAsignar.addEventListener('change', (evento) => {
        if (evento.target.name === 'rutPeriodo') $('#rutDiaCaja').hidden = evento.target.value !== 'dia';
    });
    $('#rutAsignarCancelar').addEventListener('click', () => dlgAsignar.close());

    $('#rutAsignarForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (!puedeGestionar || !asignandoRuta) return;
        const error = $('#rutAsignarError');
        const piloto = Number($('#rutPiloto').value);
        if (!piloto) {
            error.textContent = 'Elige el piloto.';
            return;
        }
        const porDia = zona.querySelector('input[name="rutPeriodo"]:checked').value === 'dia';
        const desde = porDia ? $('#rutDia').value : semana[0];
        const hasta = porDia ? $('#rutDia').value : semana[6];

        // Si ya lo tiene en esas fechas, no se duplica
        const repetido = asignaciones.some((a) => a.ruta_id === asignandoRuta.id && a.piloto_id === piloto &&
            a.fecha_desde <= desde && a.fecha_hasta >= hasta);
        if (repetido) {
            error.textContent = 'Ese piloto ya está asignado a esta ruta en esas fechas.';
            return;
        }

        // Nunca en dos tiendas el mismo día (pilotos multitienda)
        const otras = await db.from('rutas_pilotos').select('fecha_desde, fecha_hasta, rutas(nombre, tienda_id, tiendas(codigo))')
            .eq('piloto_id', piloto).lte('fecha_desde', hasta).gte('fecha_hasta', desde);
        const choque = (otras.data || []).find((a) => a.rutas && a.rutas.tienda_id !== Number(selTienda.value));
        if (choque) {
            error.textContent = `${nombrePiloto(piloto)} ya está en "${choque.rutas.nombre}" de ` +
                `${choque.rutas.tiendas ? choque.rutas.tiendas.codigo : 'otra tienda'} ese día (${corta(choque.fecha_desde > desde ? choque.fecha_desde : desde)}). ` +
                'Un piloto no puede estar en dos tiendas el mismo día.';
            return;
        }

        const { error: e } = await db.from('rutas_pilotos').insert({
            ruta_id: asignandoRuta.id, piloto_id: piloto, fecha_desde: desde, fecha_hasta: hasta, creado_por: sesion.id || null,
        });
        if (e) {
            console.error('Error al asignar piloto:', e);
            error.textContent = 'No se pudo asignar. Intenta de nuevo.';
            return;
        }
        dlgAsignar.close();
        aviso.mostrar(`${nombrePiloto(piloto)} asignado a ${asignandoRuta.nombre} ${porDia ? `el ${corta(desde)}` : 'toda la semana'}.`);
        cargarSemana();
    });

    // Quita a un piloto de UN día de su asignación:
    //   un solo día             -> se borra
    //   primer o último día      -> se acorta el período
    //   un día del medio         -> se parte en dos (antes y después de ese día)
    const sumarDias = (texto, n) => { const d = aFecha(texto); d.setDate(d.getDate() + n); return aTexto(d); };

    async function quitarUnDia(a, dia) {
        if (a.fecha_desde === a.fecha_hasta) return (await db.from('rutas_pilotos').delete().eq('id', a.id)).error;
        if (dia === a.fecha_desde) return (await db.from('rutas_pilotos').update({ fecha_desde: sumarDias(dia, 1) }).eq('id', a.id)).error;
        if (dia === a.fecha_hasta) return (await db.from('rutas_pilotos').update({ fecha_hasta: sumarDias(dia, -1) }).eq('id', a.id)).error;
        const antes = await db.from('rutas_pilotos').update({ fecha_hasta: sumarDias(dia, -1) }).eq('id', a.id);
        if (antes.error) return antes.error;
        const despues = await db.from('rutas_pilotos').insert({
            ruta_id: a.ruta_id, piloto_id: a.piloto_id, fecha_desde: sumarDias(dia, 1), fecha_hasta: a.fecha_hasta,
            creado_por: sesion.id || null,
        });
        return despues.error;
    }

    // ---------- Confirmación ----------
    // otra = { texto, accion } -> segundo botón opcional (ej. "Toda la semana")
    let accionOtra = null;
    function pedirConfirmacion(texto, accion, otra = null) {
        $('#rutConfirmarTexto').textContent = texto;
        accionConfirmada = accion;
        accionOtra = otra ? otra.accion : null;
        const botonOtra = $('#rutConfirmarTodo');
        botonOtra.hidden = !otra;
        if (otra) botonOtra.textContent = otra.texto;
        $('#rutConfirmarSi').textContent = otra ? 'Solo ese día' : 'Confirmar';
        dlgConfirmar.showModal();
    }
    $('#rutConfirmarNo').addEventListener('click', () => dlgConfirmar.close());
    $('#rutConfirmarSi').addEventListener('click', () => {
        dlgConfirmar.close();
        if (accionConfirmada) accionConfirmada();
        accionConfirmada = null;
    });
    $('#rutConfirmarTodo').addEventListener('click', () => {
        dlgConfirmar.close();
        if (accionOtra) accionOtra();
        accionOtra = null;
    });

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================

    $('#rutNueva').hidden = !puedeGestionar;
    $('#rutSoloVer').hidden = puedeGestionar;
    inputFecha.value = hoy;
    inputFecha.addEventListener('change', cargarSemana);
    selTienda.addEventListener('change', cargarSemana);
    $('#rutAnterior').addEventListener('click', () => moverSemana(-7));
    $('#rutSiguiente').addEventListener('click', () => moverSemana(7));
    $('#rutHoy').addEventListener('click', () => { inputFecha.value = hoy; cargarSemana(); });

    (async () => {
        const error = await cargarBase();
        if (error) {
            console.error('Error al cargar tiendas:', error);
            aviso.mostrar('No se pudo cargar la información. Revisa la conexión.', 'error');
            return;
        }
        cargarSemana();
    })();

    return () => {
        aviso.limpiar();
        [dlgRuta, dlgAsignar, dlgConfirmar].forEach((d) => { if (d.open) d.close(); });
    };
});
