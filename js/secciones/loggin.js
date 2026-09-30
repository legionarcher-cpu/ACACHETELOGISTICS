/* ==================================================
   SECCIÓN: LOGIN - LÓGICA
   ACACHETE LOGISTICS

   Qué hace:
     1. Valida usuario y contraseña contra la tabla "usuarios"
        de Supabase (conexión en js/supabase.js).
     2. Si son correctos, guarda la sesión con sus permisos
        (js/sesion.js), desbloquea el menú
        (js/permisos.js) y muestra la sección que corresponde,
        todo SIN recargar la página.
     3. Si no, muestra un mensaje de error y sacude el cuadro.

   Este archivo lo carga js/pagina_inicial.js una sola vez.
   La función de registrarSeccion() se ejecuta CADA VEZ que
   se muestra el login (ej. después de cerrar sesión), porque
   el HTML del formulario es nuevo cada vez.

   HTML: secciones/loggin.html | estilos: css/secciones/loggin.css
   ================================================== */

// Duración de la animación de salida del cuadro (debe coincidir con
// .login-contenedor.saliendo en css/secciones/loggin.css)
const DURACION_SALIDA_LOGIN = 250;

// ---------- Validación (Supabase) ----------
// Busca en la tabla "usuarios" una fila con ese id_usuario y esa clave.
// Devuelve { id, id_usuario, nombre, rol, permisos, tiendas: {id, codigo, nombre} }
// o null si no coincide. Lanza un error si no hay conexión con la base de datos.
//
// - El id_usuario NO distingue mayúsculas ("Admin" = "admin"): la página
//   de usuarios lo guarda siempre en minúsculas y aquí se compara igual.
// - Un usuario con aprobado = false (creado por un Admin G3) no puede entrar.
// - Admin G3, empleados y pilotos escriben el usuario compuesto (ej. cen-001-jperez);
//   Administrador, Admin G1 y Admin G2 solo su usuario (ej. admin, jlopez).
// - La clave SÍ distingue mayúsculas.
//
// ⚠ VERSIÓN RÁPIDA: la clave se compara tal cual está guardada.
// En la versión segura esto se reemplaza por Supabase Auth.
async function validarCredenciales(usuario, clave) {
    const { data, error } = await db
        .from('usuarios')
        // la clave NO se trae; "tiendas(...)" trae los datos de su tienda
        .select('id, id_usuario, nombre, rol, region, aprobado, permisos, foto_url, tiendas(id, codigo, nombre)')
        .eq('id_usuario', usuario.toLowerCase())
        .eq('clave', clave)
        .maybeSingle(); // una fila o null

    if (error) throw error;
    return data;
}

registrarSeccion('loggin', (zona) => {

    // ---------- Elementos del formulario ----------
    const formLogin     = zona.querySelector('#formLogin');
    const inputUsuario  = zona.querySelector('#inputUsuario');
    const inputClave    = zona.querySelector('#inputClave');
    const textoError    = zona.querySelector('#loginError');
    const tarjeta       = zona.querySelector('.login-tarjeta');
    const botonIngresar = zona.querySelector('#btnIngresar');
    const botonVerClave = zona.querySelector('#btnVerClave');
    const cajas         = zona.querySelectorAll('.login-input-caja');

    inputUsuario.focus(); // el cursor empieza en "Usuario"

    // ---------- Mensajes de error ----------
    function mostrarError(mensaje) {
        textoError.textContent = mensaje;
        cajas.forEach((caja) => caja.classList.add('con-error'));

        // Reinicia la animación de sacudida (ver @keyframes sacudirLogin)
        tarjeta.classList.remove('sacudir');
        void tarjeta.offsetWidth;
        tarjeta.classList.add('sacudir');
    }

    function limpiarError() {
        textoError.textContent = '';
        cajas.forEach((caja) => caja.classList.remove('con-error'));
    }

    tarjeta.addEventListener('animationend', () => tarjeta.classList.remove('sacudir'));

    // Al escribir de nuevo se quita el error
    inputUsuario.addEventListener('input', limpiarError);
    inputClave.addEventListener('input', limpiarError);

    // ---------- Mostrar / ocultar contraseña (icono del ojo) ----------
    botonVerClave.addEventListener('click', () => {
        const oculta = inputClave.type === 'password';
        inputClave.type = oculta ? 'text' : 'password';
        botonVerClave.innerHTML = oculta ? '<i class="bi bi-eye-slash"></i>' : '<i class="bi bi-eye"></i>';
        botonVerClave.setAttribute('aria-label', oculta ? 'Ocultar contraseña' : 'Mostrar contraseña');
        inputClave.focus();
    });

    // ---------- Enviar el formulario ----------
    formLogin.addEventListener('submit', async (evento) => {
        evento.preventDefault(); // evita que la página se recargue

        const usuario = inputUsuario.value.trim();
        const clave = inputClave.value;

        if (!usuario || !clave) {
            mostrarError('Ingresa tu usuario y contraseña.');
            return;
        }

        // Mientras se consulta la base de datos, el botón queda deshabilitado
        botonIngresar.disabled = true;
        botonIngresar.textContent = 'Verificando...';

        let encontrado;
        try {
            encontrado = await validarCredenciales(usuario, clave);
        } catch (err) {
            console.error('Error al validar en Supabase:', err);
            botonIngresar.disabled = false;
            botonIngresar.textContent = 'Ingresar';
            mostrarError('No se pudo conectar con el servidor. Intenta de nuevo.');
            return;
        }

        // Mensaje genérico a propósito: no se dice si falló el usuario o la
        // contraseña, para no dar pistas de qué usuarios existen.
        if (!encontrado) {
            botonIngresar.disabled = false;
            botonIngresar.textContent = 'Ingresar';
            mostrarError('Usuario o contraseña incorrectos.');
            inputClave.value = '';
            inputClave.focus();
            return;
        }

        // Usuario creado por un Admin G3 que aún no fue aprobado (columna aprobado)
        if (encontrado.aprobado === false) {
            botonIngresar.disabled = false;
            botonIngresar.textContent = 'Ingresar';
            mostrarError('Tu usuario todavía no ha sido aprobado. Consulta con el administrador de tu región.');
            return;
        }

        // Se guardan los datos del usuario (sin la clave) en la sesión.
        // rol y tienda sirven para saber qué puede hacer y de qué tienda es
        // (ej. mostrar solo los pedidos de su tienda).
        guardarSesion({
            id: encontrado.id,
            usuario: encontrado.id_usuario,
            nombre: encontrado.nombre,
            rol: encontrado.rol,                    // administrador | admin_g1 | admin_g2 | admin_g3 | empleado | piloto
            tienda: encontrado.tiendas || null,     // { id, codigo, nombre } o null (administradores)
            region: encontrado.region || null,      // solo Admin G2 (ej. 'NOR')
            permisos: encontrado.permisos || [],
            foto_url: encontrado.foto_url || null,  // foto del encabezado (js/avatar.js)
        });

        botonIngresar.textContent = 'Ingresando...';

        // 1. El cuadro del login se desvanece (animación "saliendo")
        zona.querySelector('.login-contenedor').classList.add('saliendo');

        // 2. Al terminar, aparece el panel completo
        setTimeout(() => {
            // Desbloquea el menú según sus permisos, muestra el usuario y los
            // botones del pie (js/permisos.js)
            aplicarPermisos();
            animarMenu(); // repite la cascada para que se note el desbloqueo (js/menu-animado.js)

            // Si la URL ya pedía una sección (ej. index.html#pedidos) y el usuario
            // puede verla, se abre esa; si no, la sección inicial.
            // irA y SECCION_INICIAL están en js/pagina_inicial.js.
            // (nombreSeccionDeHash quita los parámetros: "clientes?tienda=1" -> "clientes")
            const pedida = nombreSeccionDeHash();
            if (pedida && pedida !== SECCION_LOGIN && tienePermiso(pedida)) {
                mostrarSeccionActual(); // se abre la sección pedida (con sus parámetros)
            } else {
                irA(SECCION_INICIAL);
            }
        }, DURACION_SALIDA_LOGIN);
    });
});
