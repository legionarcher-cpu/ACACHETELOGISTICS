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

// ---------- Validación (Supabase Auth) ----------
// Inicia sesión en Supabase Auth con el correo interno del usuario ("jlopez01" ->
// jlopez01@acachete.interno, js/supabase.js: correoInterno) y trae su fila de usuarios.
// Devuelve { id, id_usuario, nombre, rol, permisos, tiendas: {id, codigo, nombre}, empresas }
// o null si el usuario o la contraseña no coinciden. Lanza un error si no hay conexión
// (err.status === 429: demasiados intentos seguidos, Supabase frena un rato).
//
// - El usuario NO distingue mayúsculas ("Admin" = "admin"); la contraseña SÍ.
// - Un usuario con aprobado = false (creado por un Admin G3) no puede entrar.
// - Todos llevan al final el ID de su empresa (ej. jlopez01). "admin" y "desar" no cambian.
// - La contraseña vive solo en Supabase Auth: la página nunca la lee.
async function validarCredenciales(usuario, clave) {
    const { data: acceso, error: errorAcceso } = await db.auth.signInWithPassword({ email: correoInterno(usuario), password: clave });
    if (errorAcceso) {
        if (errorAcceso.status === 400) return null; // usuario o contraseña incorrectos (no se dice cuál)
        throw errorAcceso;
    }

    // "tiendas(...)" trae los datos de su tienda y "empresas(*)" los de su empresa (con su paleta)
    const columnas = 'id, id_usuario, nombre, rol, region, aprobado, admin_ti, foto_url, cliente_id, '
        + 'tiendas(id, codigo, nombre), empresas(*)';
    const { data, error } = await db.from('usuarios').select(columnas).eq('auth_id', acceso.user.id).maybeSingle();
    if (error || !data) {
        await salirDeSupabase();
        if (error) throw error;
        return null; // tiene acceso pero ya no tiene usuario
    }

    // El Desarrollador no es de ninguna empresa: empieza con la primera activa
    // (la cambia en el menú del usuario)
    if (data.rol === 'desarrollador' && data.empresas === null) {
        const { data: primera } = await db.from('empresas')
            .select('*').eq('activa', true).order('codigo').limit(1).maybeSingle();
        data.empresas = primera || null;
    }
    // Sus módulos y funciones (su rol + lo que se le dio o quitó; js/sesion.js: puedeHacer)
    if (data.aprobado !== false) data.funciones = await leerMisFunciones();
    return data;
}

// Cierra la sesión de Supabase Auth si al final no puede entrar (sin aprobar, empresa inactiva...)
function salirDeSupabase() {
    return db.auth.signOut({ scope: 'local' }).catch(() => { /* sin conexión */ });
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
            mostrarError(err && err.status === 429
                ? 'Demasiados intentos seguidos. Espera unos minutos e intenta de nuevo.'
                : 'No se pudo conectar con el servidor. Intenta de nuevo.');
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
            salirDeSupabase();
            botonIngresar.disabled = false;
            botonIngresar.textContent = 'Ingresar';
            mostrarError(encontrado.rol === 'cliente'
                ? 'Tu solicitud todavía está en revisión. Podrás entrar cuando la empresa la apruebe.'
                : 'Tu usuario todavía no ha sido aprobado. Consulta con el administrador de tu región.');
            return;
        }

        // Empresa desactivada por el Desarrollador (Tiendas -> Empresas)
        if (encontrado.empresas && encontrado.empresas.activa === false && encontrado.rol !== 'desarrollador') {
            salirDeSupabase();
            botonIngresar.disabled = false;
            botonIngresar.textContent = 'Ingresar';
            mostrarError('Tu empresa está inactiva. Consulta con el administrador del sistema.');
            return;
        }

        // Se guardan los datos del usuario (sin la clave) en la sesión.
        // rol y tienda sirven para saber qué puede hacer y de qué tienda es
        // (ej. mostrar solo los pedidos de su tienda).
        guardarSesion({
            id: encontrado.id,
            usuario: encontrado.id_usuario,
            nombre: encontrado.nombre,
            rol: encontrado.rol,                    // administrador | admin_g1 | admin_g2 | admin_g3 | empleado | piloto | cliente
            tienda: encontrado.tiendas || null,     // { id, codigo, nombre } o null (administradores)
            region: encontrado.region || null,      // solo Admin G2 (ej. 'NOR')
            funciones: encontrado.funciones || {},  // { 'pedidos': true, 'pedidos.asignar': false, ... }
            admin_ti: !!encontrado.admin_ti,        // da la llave de soporte (Configuración -> Soporte)
            foto_url: encontrado.foto_url || null,  // foto del encabezado (js/avatar.js)
            empresa: datosEmpresaSesion(encontrado.empresas), // { id, codigo, nombre, actividades } (js/sesion.js)
            cliente_id: encontrado.cliente_id || null, // solo el rol cliente: su fila en la tabla clientes
        });
        registrarVisita('ingreso'); // reporte de Visitas del Desarrollador (js/sesion.js)

        botonIngresar.textContent = 'Ingresando...';

        // 1. El cuadro del login se desvanece (animación "saliendo")
        zona.querySelector('.login-contenedor').classList.add('saliendo');

        // 2. Al terminar, aparece el panel completo
        setTimeout(() => {
            // Desbloquea el menú según sus permisos, muestra el usuario y los
            // botones del pie (js/permisos.js)
            aplicarPermisos();
            animarMenu(); // repite la cascada para que se note el desbloqueo (js/menu-animado.js)

            // Si la URL ya pedía una sección (ej. app.html#pedidos) y el usuario
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

    montarSolicitudUsuario(zona, inputUsuario);
});

// ==================================================
// SOLICITAR USUARIO (clientes de cualquier empresa con Transporte o Encomiendas, sql/01 bloques 20 y 23)
//   "¿Eres cliente? Solicita tu usuario" aparece en el login de TODAS las marcas
//   (salvo registroClientes: false en empresas/empresas.js). ¿De qué empresa?
//     - enlace app.html#registro?empresa=02 (tarjeta, WhatsApp, QR) -> esa, ya puesta
//     - registroClientes: '02' en la marca -> esa, ya puesta
//     - si no -> el cliente escribe el CÓDIGO de su empresa (02, 03...), que ella le da
//   La base revisa que la empresa esté activa y haga viajes o encomiendas (registro_clientes_empresa).
//   La solicitud la guarda la base (solicitar_acceso_cliente): cliente y usuario
//   quedan SIN APROBAR y se avisa al Administrador y al G1 de la empresa, que la
//   aprueban en Clientes -> "Revisar".
// ==================================================
async function montarSolicitudUsuario(zona, inputUsuario) {
    const $ = (selector) => zona.querySelector(selector);
    const contenedor = $('.login-contenedor');
    const formLogin = $('#formLogin');
    const formRegistro = $('#formRegistro');
    const listo = $('#registroListo');
    const titulo = $('#login-titulo');
    const subtitulo = $('.login-subtitulo');
    const textosLogin = { titulo: titulo.textContent, subtitulo: subtitulo.textContent };
    const errorRegistro = $('#registroError');
    const campoCodigo = $('#regCampoEmpresa');
    const inputCodigo = $('#regEmpresa');
    const ayudaCodigo = $('#regEmpresaAyuda');

    const config = typeof EMPRESA !== 'undefined' ? EMPRESA.registroClientes : undefined;
    if (config === false) return; // esta marca no recibe solicitudes

    const desdeEnlace = nombreSeccionDeHash() === 'registro';
    const codigoFijo = String((desdeEnlace && parametrosSeccion().get('empresa'))
        || (typeof config === 'string' ? config : '') || '').trim();

    let codigo = '';     // empresa elegida ('02')
    let empresa = null;  // { nombre } si recibe solicitudes

    // ¿Esa empresa recibe solicitudes? Devuelve { nombre } o null (o lanza si no hay conexión)
    async function buscarEmpresa(cod) {
        const { data, error } = await db.rpc('registro_clientes_empresa', { p_codigo: cod });
        if (error && error.code !== 'PGRST202') throw error;
        return error ? null : data;
    }

    function pintarEmpresa() {
        subtitulo.textContent = empresa ? `Clientes de ${empresa.nombre}` : 'Escribe el código que te dio tu empresa';
        const base = baseUsuario();
        $('#regUsuarioAyuda').textContent = base ? `Entrarás como "${base}${codigo || '..'}"` : 'Letras y números, sin espacios';
    }

    // Empresa ya conocida (enlace o marca): se revisa una vez
    if (codigoFijo) {
        try {
            empresa = await buscarEmpresa(codigoFijo);
        } catch {
            empresa = null;
        }
        if (!zona.contains(formRegistro)) return; // ya se salió del login
        if (empresa) {
            codigo = codigoFijo;
            campoCodigo.hidden = true; // no hace falta escribirlo
        } else if (desdeEnlace) {
            $('#loginError').textContent = 'Este enlace de registro no es válido. Escribe el código de tu empresa en "Solicita tu usuario".';
        }
    }

    $('#loginRegistroEnlace').hidden = false;

    function mostrar(vista) {
        formLogin.hidden = vista !== 'login';
        formRegistro.hidden = vista !== 'registro';
        listo.hidden = vista !== 'listo';
        contenedor.classList.toggle('registrando', vista === 'registro');
        titulo.textContent = vista === 'login' ? textosLogin.titulo : vista === 'registro' ? 'Solicitar usuario' : 'Solicitud enviada';
        if (vista === 'login') subtitulo.textContent = textosLogin.subtitulo;
        else if (vista === 'registro') pintarEmpresa();
        else subtitulo.textContent = ''; // "Solicitud enviada": el texto de abajo dice la empresa
        // El # queda como enlace para compartir mientras se llena (sin recargar la sección)
        history.replaceState(null, '', vista === 'registro'
            ? `${location.pathname}${location.search}#registro${codigo ? `?empresa=${encodeURIComponent(codigo)}` : ''}`
            : location.pathname + location.search);
        if (vista === 'registro') (campoCodigo.hidden ? $('#regNombre') : inputCodigo).focus();
        if (vista === 'login') inputUsuario.focus();
    }

    $('#btnIrRegistro').addEventListener('click', () => mostrar('registro'));
    $('#btnVolverLogin').addEventListener('click', () => mostrar('login'));
    $('#btnListoLogin').addEventListener('click', () => mostrar('login'));

    // Código escrito por el cliente: al tener 2 números se busca la empresa
    let busqueda = 0;
    inputCodigo.addEventListener('input', async () => {
        inputCodigo.value = inputCodigo.value.replace(/\D/g, '').slice(0, 2);
        codigo = '';
        empresa = null;
        const cod = inputCodigo.value;
        ayudaCodigo.textContent = cod.length < 2 ? 'Son 2 números (ej. 02). Pídelo a tu empresa.' : 'Buscando...';
        pintarEmpresa();
        if (cod.length < 2) return;
        const esta = ++busqueda;
        let encontrada = null;
        try {
            encontrada = await buscarEmpresa(cod);
        } catch {
            if (esta === busqueda) ayudaCodigo.textContent = 'No se pudo revisar el código. Revisa tu conexión.';
            return;
        }
        if (esta !== busqueda) return; // ya escribió otro
        if (encontrada) {
            codigo = cod;
            empresa = encontrada;
            ayudaCodigo.textContent = `✔ ${encontrada.nombre}`;
        } else {
            ayudaCodigo.textContent = 'Ese código no recibe solicitudes. Revísalo con tu empresa.';
        }
        pintarEmpresa();
    });

    // "Entrarás como aramirez02" (si ya existe, la base le agrega un número)
    const baseUsuario = () => $('#regUsuario').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    $('#regUsuario').addEventListener('input', pintarEmpresa);
    formRegistro.addEventListener('input', () => { errorRegistro.textContent = ''; });

    formRegistro.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (!empresa) {
            errorRegistro.textContent = 'Escribe el código de tu empresa (2 números, te lo da la empresa).';
            inputCodigo.focus();
            return;
        }
        const valor = (id) => $(id).value.trim();
        const datos = {
            empresa: codigo,
            nombre: valor('#regNombre'),
            apellido1: valor('#regApellido1'),
            apellido2: valor('#regApellido2'),
            telefono: valor('#regTelefono'),
            correo: valor('#regCorreo'),
            usuario: baseUsuario(),
            clave: $('#regClave').value,
        };
        const fallo = (texto, campo) => { errorRegistro.textContent = texto; if (campo) $(campo).focus(); };
        if (datos.nombre.length < 2) return fallo('Escribe tu nombre.', '#regNombre');
        if (datos.apellido1.length < 2) return fallo('Escribe tu primer apellido.', '#regApellido1');
        const malTelefono = validarDato('telefono', datos.telefono, true); // formato de Costa Rica (js/componentes.js)
        if (malTelefono) return fallo(malTelefono, '#regTelefono');
        datos.telefono = datoConFormato('telefono', datos.telefono);
        if (datos.correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.correo)) return fallo('El correo no es válido.', '#regCorreo');
        if (!/^[a-z0-9]{3,20}$/.test(datos.usuario)) return fallo('El usuario: de 3 a 20 letras o números, sin espacios.', '#regUsuario');
        if (datos.clave.length < 6) return fallo('La contraseña debe tener al menos 6 caracteres.', '#regClave');
        if (datos.clave !== $('#regClave2').value) return fallo('Las contraseñas no coinciden.', '#regClave2');

        const terminar = (usuario) => {
            $('#registroListoTexto').textContent = `Tu usuario será "${usuario}". Cuando ${empresa.nombre} apruebe tu solicitud ` +
                'podrás entrar con ese usuario y la contraseña que escribiste.';
            inputUsuario.value = usuario;
            formRegistro.reset();
            if (campoCodigo.hidden) {
                inputCodigo.value = codigo; // empresa fija (enlace o marca): se conserva
            } else {
                codigo = '';                // escrita a mano: la próxima solicitud la vuelve a pedir
                empresa = null;
                ayudaCodigo.textContent = 'Son 2 números (ej. 02). Pídelo a tu empresa.';
            }
            mostrar('listo');
        };

        // Un robot llenó la trampa: se le muestra "enviada" sin guardar nada
        if ($('#regSitio').value) return terminar(`${datos.usuario}${codigo}`);

        const boton = $('#btnSolicitar');
        boton.disabled = true;
        boton.textContent = 'Enviando...';
        const { data, error: errorSolicitud } = await db.rpc('solicitar_acceso_cliente', { p: datos });
        boton.disabled = false;
        boton.textContent = 'Enviar solicitud';
        if (errorSolicitud) {
            console.error('Error al solicitar el usuario:', errorSolicitud);
            return fallo(errorSolicitud.code === 'P0001' ? errorSolicitud.message
                : errorSolicitud.code === 'PGRST202' ? 'La empresa todavía no tiene activo el registro de clientes.'
                    : 'No se pudo enviar la solicitud. Revisa tu conexión e intenta de nuevo.');
        }
        terminar(data.usuario);
    });

    if (desdeEnlace) mostrar('registro');
}
