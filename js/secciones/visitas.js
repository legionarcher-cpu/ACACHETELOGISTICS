/* ==================================================
   SECCIÓN: VISITAS - LÓGICA (#visitas, solo el Desarrollador)
   ACACHETE LOGISTICS

   Reporte de quién entra al sistema: empresa, usuario, dispositivo, dirección (IP)
   y pantallas abiertas. Guía: docs/secciones/visitas.md.
   - Los datos los da la función reporte_visitas (sql/01 bloque 36): la tabla visitas
     no se lee directo y la función solo responde si quien pide es Desarrollador.
   - Se guardan 3 días (la base borra lo viejo al anotar y al pedir el reporte).
   - Las anota js/sesion.js (registrarVisita): 'ingreso' al iniciar sesión (loggin.js)
     y 'pantalla' al abrir cada sección (pagina_inicial.js).
   - Vistas: "Por usuario" (resumen agrupado por empresa) y "Detalle" (cada visita).
   - Exportar Excel: hojas Por usuario y Detalle con los filtros aplicados.
   ================================================== */

const VIS_COLUMNAS_USUARIOS = 8;
const VIS_COLUMNAS_DETALLE = 7;
const VIS_MAX_FILAS = 500; // filas del detalle en pantalla (el Excel lleva todas)

const VIS_ROLES = {
    administrador: 'Administrador', admin_g1: 'Admin G1', admin_g2: 'Admin G2', admin_g3: 'Admin G3',
    empleado: 'Empleado', piloto: 'Piloto', cliente: 'Cliente',
};

// Secciones que no están en el menú (las demás toman el texto del menú: Pedidos, Viajes...)
const VIS_SECCIONES = {
    inicio: 'Inicio', perfil: 'Mi perfil', clientes: 'Clientes', 'empresas-internas': 'Empresas',
    envios: 'Mis envíos', visitas: 'Visitas',
};

registrarSeccion('visitas', (zona) => {

    const $ = (selector) => zona.querySelector(selector);
    const aviso = crearAviso($('#visAviso'), 5000);

    let visitas = [];
    const vistas = crearPestanas($('#visVistas'), [
        { valor: 'usuarios', texto: 'Por usuario', icono: 'bi-person-lines-fill' },
        { valor: 'detalle', texto: 'Detalle', icono: 'bi-list-ul' },
    ], 'usuarios', () => dibujar());

    // ---------- Textos ----------
    const nombreSeccion = (s) => {
        if (!s) return '—';
        if (VIS_SECCIONES[s]) return VIS_SECCIONES[s];
        const enMenu = document.querySelector(`.menu-item a[href="#${CSS.escape(s)}"]`);
        const texto = enMenu ? enMenu.textContent.trim() : '';
        return texto || s.charAt(0).toUpperCase() + s.slice(1);
    };
    const que = (v) => (v.tipo === 'ingreso' ? 'Inició sesión' : nombreSeccion(v.seccion));
    const rolTienda = (v) => [VIS_ROLES[v.rol] || v.rol || '—', v.tienda].filter(Boolean).join(' · ');
    const empresaTexto = (v) => (v.empresa_codigo ? `${v.empresa_codigo} · ${v.empresa_nombre || ''}`.trim() : 'Sin empresa');
    const equipoTexto = (v) => [v.dispositivo, v.navegador, v.app ? 'app instalada' : null].filter(Boolean).join(' · ') || '—';
    const fechaHora = (iso) => new Date(iso).toLocaleString('es-CR', {
        weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    });
    const diaDe = (iso) => {
        const d = new Date(iso);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    // IP con enlace a su ubicación aproximada (lo abre el Desarrollador; la página no la consulta sola)
    function celdaIp(v) {
        const td = document.createElement('td');
        td.className = 'vis-col-ip';
        if (!v.ip) {
            td.textContent = '—';
            return td;
        }
        const a = document.createElement('a');
        a.href = `https://ipinfo.io/${encodeURIComponent(v.ip)}`;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.title = 'Ver la ciudad aproximada de esta IP';
        a.textContent = v.ip;
        td.appendChild(a);
        if (v.pais) {
            const pais = document.createElement('small');
            pais.textContent = ` ${v.pais}`;
            td.appendChild(pais);
        }
        return td;
    }

    // ==================================================
    // CARGAR
    // ==================================================

    // Supabase da hasta 1000 filas por consulta: se piden de a 1000 (la función da hasta 5000)
    async function pedirVisitas() {
        const sesion = obtenerSesion();
        let todas = [];
        for (let desde = 0; desde < 5000; desde += 1000) {
            const { data, error } = await db.rpc('reporte_visitas', { p_usuario: sesion ? sesion.id : null })
                .range(desde, desde + 999);
            if (error) return { data: null, error };
            todas = todas.concat(data || []);
            if (!data || data.length < 1000) break;
        }
        return { data: todas, error: null };
    }

    async function cargar() {
        $('#visActualizar').disabled = true;
        const { data, error } = await pedirVisitas();
        $('#visActualizar').disabled = false;
        if (error) {
            console.error('Error al cargar las visitas:', error);
            const falta = ['PGRST202', '42883', 'PGRST205', '42P01'].includes(error.code);
            $('#visFaltaSql').hidden = !falta;
            if (!falta) aviso.mostrar(error.code === 'P0001' ? error.message : 'No se pudo cargar el reporte de visitas.', 'error');
            visitas = [];
            dibujar();
            $('#visContador').textContent = 'No se pudo cargar el reporte.';
            return;
        }
        $('#visFaltaSql').hidden = true;
        visitas = data || [];
        llenarFiltros();
        dibujar();
    }

    // Empresas y días que aparecen en las visitas (se conserva lo elegido)
    function llenarFiltros() {
        const selEmpresa = $('#visEmpresa');
        const elegida = selEmpresa.value;
        const empresas = new Map();
        visitas.forEach((v) => empresas.set(String(v.empresa_id ?? ''), empresaTexto(v)));
        selEmpresa.replaceChildren(new Option('Todas las empresas', ''),
            ...[...empresas].sort((a, b) => a[1].localeCompare(b[1])).map(([id, texto]) => new Option(texto, id || 'ninguna')));
        selEmpresa.value = [...selEmpresa.options].some((o) => o.value === elegida) ? elegida : '';

        const selDia = $('#visDia');
        const dia = selDia.value;
        const dias = [...new Set(visitas.map((v) => diaDe(v.creado_en)))].sort().reverse();
        selDia.replaceChildren(new Option('Los 3 días', ''), ...dias.map((d) => {
            const texto = new Date(`${d}T12:00:00`).toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });
            return new Option(texto.charAt(0).toUpperCase() + texto.slice(1), d);
        }));
        selDia.value = dias.includes(dia) ? dia : '';
    }

    function filtradas() {
        const empresa = $('#visEmpresa').value;
        const tipo = $('#visTipo').value;
        const dia = $('#visDia').value;
        const buscar = $('#visBuscar').value;
        return visitas.filter((v) =>
            (!empresa || String(v.empresa_id ?? 'ninguna') === empresa)
            && (!tipo || v.tipo === tipo)
            && (!dia || diaDe(v.creado_en) === dia)
            && coincideBusqueda([v.usuario, v.nombre, v.ip, v.dispositivo, v.navegador, v.tienda, v.empresa_nombre], buscar));
    }

    // Resumen por usuario: [{ empresa, usuario, filas... }] agrupado por empresa
    function porUsuario(lista) {
        const mapa = new Map();
        lista.forEach((v) => {
            const clave = v.usuario_id;
            if (!mapa.has(clave)) {
                // la lista viene de la más nueva a la más vieja: la primera es la última visita
                mapa.set(clave, { ultima: v, ingresos: 0, pantallas: 0, secciones: {} });
            }
            const u = mapa.get(clave);
            if (v.tipo === 'ingreso') u.ingresos++;
            else {
                u.pantallas++;
                u.secciones[v.seccion] = (u.secciones[v.seccion] || 0) + 1;
            }
        });
        return [...mapa.values()].map((u) => {
            const [masUsada] = Object.entries(u.secciones).sort((a, b) => b[1] - a[1])[0] || [];
            return { ...u, masUsada: masUsada ? nombreSeccion(masUsada) : '—' };
        });
    }

    // ==================================================
    // DIBUJAR
    // ==================================================

    function dibujar() {
        const lista = filtradas();
        const usuarios = new Set(lista.map((v) => v.usuario_id));
        const empresas = new Set(lista.map((v) => v.empresa_id));
        const totales = {
            ingresos: lista.filter((v) => v.tipo === 'ingreso').length,
            pantallas: lista.filter((v) => v.tipo === 'pantalla').length,
            usuarios: usuarios.size,
            empresas: empresas.size,
            celular: new Set(lista.filter((v) => /celular|tableta/.test(v.dispositivo || '')).map((v) => v.usuario_id)).size,
            app: new Set(lista.filter((v) => v.app).map((v) => v.usuario_id)).size,
        };
        zona.querySelectorAll('[data-total]').forEach((el) => { el.textContent = totales[el.dataset.total]; });
        $('#visContador').textContent = visitas.length
            ? `Últimos 3 días · ${plural(lista.length, 'visita', 'visitas')}${lista.length !== visitas.length ? ` (de ${visitas.length})` : ''}`
            : 'Últimos 3 días · todavía no hay visitas.';
        vistas.cuentas({ usuarios: usuarios.size, detalle: lista.length });

        const enDetalle = vistas.valor() === 'detalle';
        $('#visCajaUsuarios').hidden = enDetalle;
        $('#visCajaDetalle').hidden = !enDetalle;
        $('#visMas').hidden = true;
        if (enDetalle) dibujarDetalle(lista);
        else dibujarUsuarios(lista);
    }

    function dibujarUsuarios(lista) {
        const cuerpo = $('#visUsuarios');
        cuerpo.replaceChildren();
        const filas = porUsuario(lista);
        if (!filas.length) {
            cuerpo.appendChild(crearFilaVacia('No hay visitas con estos filtros.', VIS_COLUMNAS_USUARIOS));
            return;
        }
        // Un grupo por empresa (más visitas primero)
        const grupos = new Map();
        filas.forEach((f) => {
            const clave = empresaTexto(f.ultima);
            if (!grupos.has(clave)) grupos.set(clave, []);
            grupos.get(clave).push(f);
        });
        [...grupos].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).forEach(([empresa, delGrupo]) => {
            cuerpo.appendChild(crearFilaGrupo(empresa, null, plural(delGrupo.length, 'usuario', 'usuarios'), VIS_COLUMNAS_USUARIOS));
            delGrupo.sort((a, b) => new Date(b.ultima.creado_en) - new Date(a.ultima.creado_en)).forEach((f) => {
                const v = f.ultima;
                const tr = document.createElement('tr');
                const tdUsuario = document.createElement('td');
                const fuerte = document.createElement('strong');
                fuerte.textContent = v.usuario || '(usuario borrado)';
                const nombre = document.createElement('small');
                nombre.className = 'vis-sub';
                nombre.textContent = v.nombre || '';
                tdUsuario.append(fuerte, nombre);
                tr.append(
                    tdUsuario,
                    crearCelda(rolTienda(v)),
                    crearCelda(f.ingresos, 'vis-col-numero'),
                    crearCelda(f.pantallas, 'vis-col-numero'),
                    crearCelda(fechaHora(v.creado_en), 'vis-col-fecha'),
                    crearCelda(f.masUsada),
                    crearCelda(equipoTexto(v)),
                    celdaIp(v),
                );
                cuerpo.appendChild(tr);
            });
        });
    }

    function dibujarDetalle(lista) {
        const cuerpo = $('#visDetalle');
        cuerpo.replaceChildren();
        if (!lista.length) {
            cuerpo.appendChild(crearFilaVacia('No hay visitas con estos filtros.', VIS_COLUMNAS_DETALLE));
            return;
        }
        lista.slice(0, VIS_MAX_FILAS).forEach((v) => {
            const tr = document.createElement('tr');
            if (v.tipo === 'ingreso') tr.className = 'vis-ingreso';
            const tdQue = document.createElement('td');
            if (v.tipo === 'ingreso') {
                const etiqueta = document.createElement('span');
                etiqueta.className = 'etiqueta etiqueta-verde';
                etiqueta.textContent = que(v);
                tdQue.appendChild(etiqueta);
            } else {
                tdQue.textContent = que(v);
            }
            tr.append(
                crearCelda(fechaHora(v.creado_en), 'vis-col-fecha'),
                crearCelda(empresaTexto(v)),
                crearCelda(v.usuario ? `${v.usuario}${v.nombre ? ` · ${v.nombre}` : ''}` : '(usuario borrado)'),
                crearCelda(rolTienda(v)),
                tdQue,
                crearCelda(equipoTexto(v)),
                celdaIp(v),
            );
            cuerpo.appendChild(tr);
        });
        if (lista.length > VIS_MAX_FILAS) {
            $('#visMas').hidden = false;
            $('#visMas').textContent = `Se muestran las ${VIS_MAX_FILAS} más recientes de ${lista.length}. Usa los filtros o exporta a Excel para ver todas.`;
        }
    }

    // ==================================================
    // EXPORTAR
    // ==================================================

    async function exportarExcel() {
        const lista = filtradas();
        if (!lista.length) {
            aviso.mostrar('No hay visitas para exportar con estos filtros.', 'error');
            return;
        }
        try {
            await cargarLibreria(LIBRERIAS.xlsx);
        } catch {
            aviso.mostrar('No se pudo cargar el exportador de Excel (revisa internet).', 'error');
            return;
        }
        const XLSX = window.XLSX;
        const fecha = (iso) => new Date(iso).toLocaleString('es-CR');
        const libro = XLSX.utils.book_new();
        const resumen = porUsuario(lista).map((f) => {
            const v = f.ultima;
            return [empresaTexto(v), v.usuario || '(usuario borrado)', v.nombre || '', rolTienda(v), f.ingresos, f.pantallas,
                fecha(v.creado_en), f.masUsada, equipoTexto(v), v.ip || '', v.pais || ''];
        });
        const hoja1 = XLSX.utils.aoa_to_sheet([
            ['Reporte de visitas (últimos 3 días)'], [`Generado: ${new Date().toLocaleString('es-CR')}`], [],
            ['Empresa', 'Usuario', 'Nombre', 'Rol / tienda', 'Ingresos', 'Pantallas', 'Último acceso', 'Más usada', 'Dispositivo', 'IP', 'País'],
            ...resumen,
        ]);
        hoja1['!cols'] = [24, 14, 24, 22, 9, 9, 20, 16, 34, 16, 6].map((wch) => ({ wch }));
        XLSX.utils.book_append_sheet(libro, hoja1, 'Por usuario');
        const hoja2 = XLSX.utils.aoa_to_sheet([
            ['Fecha y hora', 'Empresa', 'Usuario', 'Nombre', 'Rol / tienda', 'Qué', 'Dispositivo', 'Navegador', 'App instalada', 'IP', 'País'],
            ...lista.map((v) => [fecha(v.creado_en), empresaTexto(v), v.usuario || '', v.nombre || '', rolTienda(v), que(v),
                v.dispositivo || '', v.navegador || '', v.app ? 'Sí' : 'No', v.ip || '', v.pais || '']),
        ]);
        hoja2['!cols'] = [20, 24, 14, 24, 22, 16, 18, 16, 8, 16, 6].map((wch) => ({ wch }));
        XLSX.utils.book_append_sheet(libro, hoja2, 'Detalle');
        XLSX.writeFile(libro, `visitas-${diaDe(new Date().toISOString())}.xlsx`);
        aviso.mostrar('Excel descargado.');
    }

    // ==================================================
    // EVENTOS
    // ==================================================

    ['#visEmpresa', '#visTipo', '#visDia'].forEach((s) => $(s).addEventListener('change', dibujar));
    $('#visBuscar').addEventListener('input', dibujar);
    $('#visActualizar').addEventListener('click', cargar);
    $('#visExcel').addEventListener('click', exportarExcel);

    cargar();

    return () => aviso.limpiar();
});
