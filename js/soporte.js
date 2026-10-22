/* ==================================================
   SOPORTE: AVISO Y LLAVE DEL DESARROLLADOR
   ACACHETE LOGISTICS

   Solo el Desarrollador. Arriba de la lista de la campana (notificaciones) se ve un
   cuadro fijo con lo que puede hacer en la empresa con la que trabaja
   (sql/instalacion/01_base.sql: soporte_estado):
     - Puesta en marcha: la empresa no tiene Admin TI -> cambia su configuración, tiendas
       y usuarios. Sus datos (clientes, pedidos, viajes...) piden la llave.
     - Sin llave: la empresa ya tiene Admin TI -> ve su configuración y sus usuarios.
     - Modo soporte: entró con la llave que le dio la empresa (solo ver, o ver y corregir)
       hasta la hora en que vence. La campana lleva un punto naranja mientras dura.
   No tapa la página: antes era una franja flotante debajo del encabezado.
   "Usar llave" pide el código (ej. K7M2-Q9XP) que genera el Admin TI en Configuración ->
   Soporte (soporte_usar_llave). Lo que ve y cambia queda en la bitácora de la empresa.
   Las acciones de emergencia (bloquear, desbloquear, cerrar sesiones) están en Usuarios.

   Lo pinta js/sesion.js (actualizarSegunEmpresa) al iniciar sesión, al abrir la página y
   al cambiar de empresa. HTML: #soporteAviso (dentro de #notiPanel) y #soporteDialogo
   en app.html.
   ================================================== */

let soporteVence = null; // vuelve a pintar el aviso cuando vence la llave

const soporteHora = (fecha) => new Date(fecha).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });

// Aviso emergente de la campana (js/notificaciones.js), si está cargada
function soporteAvisoEmergente(tipo, titulo, mensaje) {
    if (typeof mostrarAvisoNoti === 'function') mostrarAvisoNoti({ tipo, titulo, mensaje });
}

async function pintarAvisoSoporte() {
    const aviso = document.getElementById('soporteAviso');
    const campana = document.getElementById('notiCampana');
    if (!aviso) return;
    clearTimeout(soporteVence);
    const ocultar = () => {
        aviso.hidden = true;
        if (campana) campana.classList.remove('soporte-llave');
    };
    const sesion = obtenerSesion();
    const empresa = sesion && sesion.empresa;
    if (!sesion || sesion.rol !== 'desarrollador' || !empresa || typeof db === 'undefined') {
        ocultar();
        return;
    }
    const { data, error } = await db.rpc('soporte_estado', { p_empresa: empresa.id });
    const actual = obtenerSesion(); // pudo cambiar la sesión o la empresa mientras tanto
    if (!actual || !actual.empresa || actual.empresa.id !== empresa.id) return;
    if (error || !data) {
        if (error) console.warn('No se leyó el estado de soporte:', error.message);
        ocultar();
        return;
    }

    const llave = data.llave;
    aviso.dataset.modo = llave ? 'llave' : data.admin_ti ? 'sin-llave' : 'puesta';
    document.getElementById('soporteAvisoTexto').textContent = llave
        ? `Modo soporte · ${empresa.nombre} · ${llave.alcance === 'corregir' ? 'ver y corregir' : 'solo ver'} · vence a las ${soporteHora(llave.vence_en)}`
        : data.admin_ti
            ? `${empresa.nombre} tiene Admin TI: ves su configuración y sus usuarios. Sus datos piden la llave de soporte.`
            : `Puesta en marcha · ${empresa.nombre} no tiene Admin TI: puedes configurarla. Sus datos piden la llave de soporte.`;
    document.getElementById('soporteUsarLlave').hidden = !!llave && llave.alcance === 'corregir';
    aviso.hidden = false;
    if (campana) campana.classList.toggle('soporte-llave', !!llave);

    if (llave) {
        // Al vencer, el aviso cambia y la sección se vuelve a cargar (sin los datos)
        const espera = Math.min(new Date(llave.vence_en).getTime() - Date.now() + 1000, 2147483647);
        soporteVence = setTimeout(() => {
            soporteAvisoEmergente('info', 'Venció la llave de soporte', empresa.nombre);
            pintarAvisoSoporte();
            if (typeof mostrarSeccionActual === 'function') mostrarSeccionActual();
        }, Math.max(espera, 1000));
    }
}

// ---------- Ventana "Usar llave" ----------
document.addEventListener('DOMContentLoaded', () => {
    const dialogo = document.getElementById('soporteDialogo');
    const campo = document.getElementById('soporteCodigo');
    const error = document.getElementById('soporteError');
    if (!dialogo) return;
    pintarAvisoSoporte(); // al abrir la página

    document.getElementById('soporteUsarLlave').addEventListener('click', () => {
        const empresa = empresaActual();
        if (!empresa) return;
        const panel = document.getElementById('notiPanel');
        if (panel) panel.classList.remove('abierto');
        document.getElementById('soporteEmpresa').textContent = empresa.nombre;
        document.getElementById('soporteForm').reset();
        error.textContent = '';
        dialogo.showModal();
        campo.focus();
    });
    document.getElementById('soporteCancelar').addEventListener('click', () => dialogo.close());

    // Mayúsculas y el guion en medio (K7M2-Q9XP)
    campo.addEventListener('input', () => {
        const limpio = campo.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
        campo.value = limpio.length > 4 ? `${limpio.slice(0, 4)}-${limpio.slice(4)}` : limpio;
    });

    document.getElementById('soporteForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const empresa = empresaActual();
        if (!empresa) return;
        if (campo.value.replace('-', '').length !== 8) {
            error.textContent = 'El código tiene 8 letras y números (ej. K7M2-Q9XP).';
            campo.focus();
            return;
        }
        const boton = document.getElementById('soporteEntrar');
        boton.disabled = true;
        const { data, error: err } = await db.rpc('soporte_usar_llave', { p_empresa: empresa.id, p_codigo: campo.value });
        boton.disabled = false;
        if (err || !data || !data.ok) {
            if (err) console.error('Error al usar la llave de soporte:', err);
            error.textContent = err ? (err.code === 'PGRST202' ? 'Falta instalar la base de datos (sql/instalacion).' : 'No se pudo revisar el código. Intenta de nuevo.')
                : (data && data.mensaje) || 'Código equivocado.';
            campo.select();
            return;
        }
        dialogo.close();
        await pintarAvisoSoporte();
        soporteAvisoEmergente('aprobado', 'Modo soporte activo', `${empresa.nombre}. Detalle en la campana.`);
        if (typeof mostrarSeccionActual === 'function') mostrarSeccionActual(); // la sección ya trae los datos
    });
});
