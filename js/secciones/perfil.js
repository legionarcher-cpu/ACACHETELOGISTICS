/* ==================================================
   SECCIÓN: MI PERFIL - LÓGICA
   ACACHETE LOGISTICS

   Qué hace:
     - Muestra los datos del usuario conectado (leídos de Supabase).
     - "Cambiar foto": elige una imagen, la valida (JPG/PNG/WEBP,
       máx. 2 MB), la achica y la sube. Se ve al instante aquí y
       en el encabezado.
     - "Quitar foto": borra la foto y vuelve a mostrar las iniciales.

   Las funciones de fotos están en js/avatar.js (compartidas con
   el encabezado y la sección Usuarios).

   HTML: secciones/perfil.html
   Estilos: css/secciones/perfil.css (propios) + css/componentes.css (comunes)
   ================================================== */

// Nombre para mostrar de cada rol
const PRF_ROLES = {
    desarrollador: 'Desarrollador',
    administrador: 'Administrador',
    admin_g1: 'Admin G1',
    admin_g2: 'Admin G2',
    admin_g3: 'Admin G3',
    empleado: 'Empleado',
    piloto: 'Piloto',
};

// Tiempo que se muestra el aviso verde (ms)
const PRF_DURACION_AVISO = 4000;

registrarSeccion('perfil', (zona) => {

    // ---------- Elementos ----------
    const $ = (selector) => zona.querySelector(selector);

    const avatar       = $('#prfAvatar');
    const archivo      = $('#prfArchivo');
    const botonCambiar = $('#prfCambiar');
    const botonQuitar  = $('#prfQuitar');

    // Avisos verdes/rojos (crearAviso está en js/componentes.js)
    const aviso = crearAviso($('#prfAviso'), PRF_DURACION_AVISO);
    const mostrarAviso = aviso.mostrar;

    const sesion = obtenerSesion(); // js/sesion.js
    let usuario = null;             // datos frescos de la base de datos
    let ocupado = false;            // evita dos subidas al mismo tiempo

    // Pinta foto, datos y el estado de los botones
    function dibujar() {
        pintarAvatar(avatar, usuario.nombre, usuario.foto_url); // js/avatar.js
        botonQuitar.hidden = !usuario.foto_url; // "Quitar foto" solo si tiene foto

        $('#prfNombre').textContent   = usuario.nombre || '—';
        $('#prfUsuario').textContent  = usuario.id_usuario || '—';
        $('#prfRol').textContent      = PRF_ROLES[usuario.rol] || usuario.rol || '—';
        // Empleado/Piloto: su tienda | Admin G2: su región
        $('#prfTienda').textContent   = usuario.tiendas
            ? `${usuario.tiendas.codigo} · ${usuario.tiendas.nombre}`
            : usuario.region ? `Región ${usuario.regiones ? usuario.regiones.nombre : usuario.region}` : '—';
        $('#prfTelefono').textContent = usuario.telefono || '—';

        // Vehículo asignado: solo para pilotos
        $('#prfDatoVehiculo').hidden = usuario.rol !== 'piloto';
        $('#prfVehiculo').textContent = usuario.vehiculos
            ? `${usuario.vehiculos.placa} · ${usuario.vehiculos.marca}`
            : 'Sin vehículo asignado';
    }

    // Mientras sube o borra: botones desactivados y texto de espera
    function marcarOcupado(estado, texto) {
        ocupado = estado;
        botonCambiar.disabled = estado;
        botonQuitar.disabled = estado;
        avatar.classList.toggle('cargando', estado); // animación en css/secciones/perfil.css
        if (texto) botonCambiar.querySelector('span').textContent = texto;
    }

    // ---------- Cargar datos ----------
    async function cargarUsuario() {
        const { data, error } = await db
            .from('usuarios')
            .select('id, nombre, id_usuario, telefono, rol, region, foto_url, tiendas(codigo, nombre), regiones(nombre), vehiculos(placa, marca)')
            .eq('id', sesion.id)
            .maybeSingle();

        if (error || !data) {
            console.error('Error al cargar el perfil:', error);
            mostrarAviso('No se pudieron cargar tus datos. Revisa la conexión.', 'error');
            // Se muestra al menos lo que hay en la sesión
            usuario = { nombre: sesion.nombre, id_usuario: sesion.usuario, rol: sesion.rol, tiendas: sesion.tienda, region: sesion.region, foto_url: sesion.foto_url };
            dibujar();
            botonCambiar.disabled = true;
            return;
        }

        usuario = data;
        dibujar();
    }

    // ---------- Cambiar foto ----------
    botonCambiar.addEventListener('click', () => {
        if (!ocupado) archivo.click(); // abre el selector de archivos
    });

    archivo.addEventListener('change', async () => {
        const elegido = archivo.files[0];
        archivo.value = ''; // permite volver a elegir el mismo archivo después
        if (!elegido) return;

        // Revisión rápida antes de subir (tipo y 2 MB)
        const problema = validarFoto(elegido);
        if (problema) {
            mostrarAviso(problema, 'error');
            return;
        }

        marcarOcupado(true, 'Subiendo...');
        try {
            usuario.foto_url = await subirFotoUsuario(usuario.id, elegido); // js/avatar.js
            dibujar();
            mostrarAviso('Foto actualizada.');
        } catch (err) {
            mostrarAviso(err.message, 'error');
        } finally {
            marcarOcupado(false, 'Cambiar foto');
        }
    });

    // ---------- Quitar foto ----------
    botonQuitar.addEventListener('click', async () => {
        if (ocupado) return;
        if (!confirm('¿Quitar tu foto de perfil?')) return;

        marcarOcupado(true);
        try {
            await quitarFotoUsuario(usuario.id); // js/avatar.js
            usuario.foto_url = null;
            dibujar();
            mostrarAviso('Foto quitada.');
        } catch (err) {
            mostrarAviso(err.message, 'error');
        } finally {
            marcarOcupado(false);
        }
    });

    // ---------- Arranque y limpieza ----------
    cargarUsuario();

    return () => aviso.limpiar();
});
