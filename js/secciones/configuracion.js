/* ==================================================
   SECCIÓN: CONFIGURACIÓN - LÓGICA
   ACACHETE LOGISTICS

   Organizada por MÓDULOS. Al entrar se ven solo las TARJETAS de los
   módulos que el rol puede usar (CFG_MODULOS). Cada módulo se abre al
   presionar su tarjeta: #configuracion?modulo=horarios (así funcionan el
   botón "atrás" del navegador y los enlaces directos).
   Por ahora: HORARIOS, VEHÍCULOS y PEDIDOS (Administrador, Admin G1 y Admin G2 por región).
   El módulo PEDIDOS vive en js/secciones/configuracion/pedidos.js (ver
   "MÓDULOS EN ARCHIVO APARTE" más abajo).

   MÓDULO HORARIOS (sql/12_horarios.sql):
     - Valores base (tabla "configuracion"):
         cantidad_marcas   -> cuántas marcas debe hacer el piloto (base 5)
         pedidos_por_marca -> pedidos máximos en cada marca (base 5)
       Al SUBIR la cantidad de marcas se crean las nuevas con horas
       sugeridas (continúan después de la última). Al BAJARLA se eliminan
       las últimas (pide confirmación).
     (En pantalla se dice "HORARIO"; las tablas siguen usando "marca".)
     - Horas de cada horario (tabla "marcas_horario"):
         ventana de inicio (desde / hasta) y hora de término.
     - Horario por día (sql/13_horario_dias.sql): un día de la semana puede
       quedar PREAJUSTADO con su propia cantidad de marcas y sus horas
       (tablas "horario_dias" y "marcas_dia"). Ej.: domingo con 1 marca,
       o 0 = sin marcas. Los días sin horario propio usan la base.
       "Usar base" borra el horario propio del día.
     - Pedidos por marca por región o tienda (tabla "capacidad_marcas").
       Prioridad: tienda > región > base.

   MÓDULO VEHÍCULOS (tabla "vehiculos", sql/08_vehiculos.sql):
     - Resumen por estado (disponible / en uso / mantenimiento); al
       presionar un cuadro se filtra la lista.
     - Lista con búsqueda (placa, marca o piloto) y filtro por estado.
     - Agregar, modificar (placa, marca, estado) y eliminar. Al eliminar,
       los pilotos que lo tenían quedan sin vehículo (on delete set null).
     - Muestra los pilotos asignados; la asignación se hace en Usuarios.

   Quién lo usa (ambos módulos, js/sesion.js):
     - Administrador y Admin G1: todo.
     - Admin G2 (solo SU región):
         Horarios  -> ve la base (solo lectura) y administra los pedidos por
                      marca de su región y de las tiendas de su región.
         Vehículos -> ve y modifica los vehículos asignados a pilotos de
                      tiendas de su región. Elimina solo si todos sus pilotos
                      son de su región. No agrega (un vehículo sin piloto no
                      es de ninguna región): los registra desde Usuarios.
     - Los demás roles no ven las tarjetas y, si escriben la dirección a
       mano, vuelven al inicio.
   Los elementos del HTML con data-solo-general se ocultan a Admin G2 y
   los que tienen data-nota-g2 solo los ve Admin G2.
   ⚠ Lo controla la página; la regla real llega en la Fase 7.

   HTML: secciones/configuracion.html
   Estilos: css/secciones/configuracion.css + css/componentes.css
   ================================================== */

// Valores por defecto si todavía no existen en la tabla "configuracion"
const CFG_POR_DEFECTO = {
    cantidad_marcas: 5,
    pedidos_por_marca: 5,
};

// Horas sugeridas para una marca nueva: ventana de 30 min y dura 2 horas
const CFG_VENTANA_MIN = 30;
const CFG_DURACION_MIN = 120;

// Días de la semana: 1 = lunes ... 7 = domingo (igual que en sql/13)
const CFG_DIAS = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 7: 'Domingo' };

// Estados de un vehículo (los mismos que permite sql/08) y su etiqueta
const CFG_ESTADOS_VEHICULO = {
    disponible:    { texto: 'Disponible',    color: 'etiqueta-verde' },
    en_uso:        { texto: 'En uso',        color: 'etiqueta-azul' },
    mantenimiento: { texto: 'Mantenimiento', color: 'etiqueta-naranja' },
};

// ==================================================
// MÓDULOS EN ARCHIVO APARTE
// Para que este archivo no crezca demasiado, un módulo grande puede ir en
// js/secciones/configuracion/<nombre>.js. Ese archivo llama a:
//   registrarModuloConfig('nombre', (seccion, ctx) => { ...; return limpieza; });
//     seccion -> el <section class="cfg-modulo" data-modulo="nombre">
//     ctx     -> { zona, aviso, pedirConfirmacion, esGeneral, regionG2 }
// El archivo se descarga la primera vez que se abre el módulo.
// ==================================================

const CFG_MODULOS_EXTERNOS = {};          // nombre -> función de inicio
const cfgScriptsModulos = new Map();       // nombre -> Promise<boolean>

function registrarModuloConfig(nombre, iniciar) {
    CFG_MODULOS_EXTERNOS[nombre] = iniciar;
}

function cargarScriptModuloConfig(nombre) {
    if (!cfgScriptsModulos.has(nombre)) {
        cfgScriptsModulos.set(nombre, new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = `js/secciones/configuracion/${nombre}.js`;
            script.onload = () => resolve(true);
            script.onerror = () => { script.remove(); cfgScriptsModulos.delete(nombre); resolve(false); };
            document.body.appendChild(script);
        }));
    }
    return cfgScriptsModulos.get(nombre);
}

registrarSeccion('configuracion', (zona) => {

    // ---------- Elementos ----------
    const $ = (selector) => zona.querySelector(selector);
    const aviso = crearAviso($('#cfgAviso'), 4000); // js/componentes.js

    const inputCantidad = $('#cfgCantidadMarcas');
    const inputPedidos  = $('#cfgPedidosMarca');
    const errorBase     = $('#cfgBaseError');
    const botonBase     = $('#cfgGuardarBase');
    const cuerpoMarcas  = $('#cfgMarcas');
    const cuerpoAjustes = $('#cfgAjustes');
    const cuerpoDias    = $('#cfgDias');

    const diaDialogo = $('#cfgDiaDialogo');
    const diaError   = $('#cfgDiaError');
    const diaCantidad = $('#cfgDiaCantidad');
    const diaFilas   = $('#cfgDiaMarcas');
    const diaVacio   = $('#cfgDiaVacio');
    const diaOtros   = $('#cfgDiaOtros');

    const marcaDialogo = $('#cfgMarcaDialogo');
    const marcaError   = $('#cfgMarcaError');
    const marcaCampos  = { desde: $('#cfgInicioDesde'), hasta: $('#cfgInicioHasta'), fin: $('#cfgFin') };

    const ajusteDialogo = $('#cfgAjusteDialogo');
    const ajusteError   = $('#cfgAjusteError');
    const ajusteTipo    = $('#cfgAjusteTipo');
    const ajusteDestino = $('#cfgAjusteDestino');
    const ajustePedidos = $('#cfgAjustePedidos');

    const confirmar      = $('#cfgConfirmar');
    const confirmarTexto = $('#cfgConfirmarTexto');

    // ---------- Permisos (js/sesion.js) ----------
    // Administrador y Admin G1: todo. Admin G2: solo lo de SU región.
    const esGeneral = esAdministrador() || esAdminG1();
    const regionG2 = esAdminG2() ? regionActual() : null; // ej. 'CEN' (null si no es G2)
    // Valores base, horas de las marcas, horario por día y agregar vehículos
    const puedeModificar = esGeneral;
    // Pedidos por marca y vehículos (G2: los de su región)
    const puedeRegional = esGeneral || !!regionG2;

    // ---------- Estado ----------
    let config = { ...CFG_POR_DEFECTO };
    let marcas = [];        // [{ numero, inicio_desde, inicio_hasta, fin }]
    let ajustes = [];       // [{ id, region, tienda_id, pedidos_por_marca, regiones, tiendas }]
    let regiones = [];
    let tiendas = [];
    let dias = [];          // días con horario propio: [{ dia, cantidad_marcas, marcas_dia: [...] }]
    let faltaSqlDias = false; // true si todavía no se ejecutó sql/13
    let editandoDia = null; // número del día (1 a 7) que se está editando
    let editandoMarca = null;
    let editandoAjuste = null;
    let accionConfirmada = null; // función que se ejecuta al presionar "Confirmar"

    // ==================================================
    // AYUDAS DE HORAS
    // ==================================================

    // "07:30:00" -> "07:30"
    const hhmm = (hora) => (hora || '').slice(0, 5);

    // "07:30" -> 450 (minutos desde medianoche)
    const aMinutos = (hora) => {
        const [h, m] = hhmm(hora).split(':').map(Number);
        return h * 60 + m;
    };

    // 450 -> "07:30" (máximo 23:59)
    const aHora = (minutos) => {
        const total = Math.min(minutos, 23 * 60 + 59);
        return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    };

    // 150 -> "2 h 30 min"
    const textoDuracion = (minutos) => {
        const h = Math.floor(minutos / 60);
        const m = minutos % 60;
        return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 min';
    };

    // ==================================================
    // MÓDULOS (tarjetas en el inicio de Configuración)
    // Para agregar un módulo: su tarjeta y su <section> en el HTML, y aquí
    //   nombre: { permitido: () => true/false, abrir: () => { ...cargar datos... } }
    // ==================================================

    const CFG_MODULOS = {
        horarios: {
            permitido: () => puedeRegional, // G2 entra, pero solo cambia lo de su región
            abrir: () => cargarTodo(),
        },
        vehiculos: {
            permitido: () => puedeRegional,
            abrir: () => cargarVehiculos(),
        },
        // Tarifas, descuentos, categorías... (js/secciones/configuracion/pedidos.js)
        pedidos: {
            permitido: () => puedeRegional,
            abrir: () => abrirModuloExterno('pedidos'),
        },
    };

    // ---------- Módulos en archivo aparte ----------
    let limpiezaModulo = null;   // función de limpieza del módulo externo abierto
    let seccionActiva = true;    // false cuando se sale de Configuración

    async function abrirModuloExterno(nombre) {
        const existe = await cargarScriptModuloConfig(nombre);
        if (!seccionActiva) return; // el usuario ya se fue a otra sección
        const iniciar = CFG_MODULOS_EXTERNOS[nombre];
        if (!existe || !iniciar) {
            aviso.mostrar('No se pudo cargar el módulo. Revisa la conexión.', 'error');
            return;
        }
        const seccion = zona.querySelector(`.cfg-modulo[data-modulo="${nombre}"]`);
        const limpiar = iniciar(seccion, { zona, aviso, pedirConfirmacion, esGeneral, regionG2 });
        if (typeof limpiar === 'function') limpiezaModulo = limpiar;
    }

    // Muestra las tarjetas que el rol puede usar (o un mensaje si no hay ninguna)
    function mostrarInicio() {
        let disponibles = 0;
        zona.querySelectorAll('.cfg-modulo-tarjeta').forEach((tarjeta) => {
            const modulo = CFG_MODULOS[tarjeta.dataset.modulo];
            const permitido = !!modulo && modulo.permitido();
            tarjeta.hidden = !permitido;
            if (permitido) disponibles++;
        });
        $('#cfgInicio').hidden = false;
        $('#cfgSinModulos').hidden = disponibles > 0;
    }

    // Abre un módulo: oculta las tarjetas y muestra solo su sección
    function abrirModulo(nombre) {
        $('#cfgInicio').hidden = true;
        $('#cfgSinModulos').hidden = true;
        zona.querySelectorAll('.cfg-modulo').forEach((m) => { m.hidden = m.dataset.modulo !== nombre; });

        // Admin G2: se ocultan los botones que no le tocan y se muestra su nota
        zona.querySelectorAll('[data-solo-general]').forEach((el) => { el.hidden = !puedeModificar; });
        zona.querySelectorAll('[data-nota-g2]').forEach((el) => { el.hidden = !regionG2; });
        zona.querySelectorAll('[data-region-g2]').forEach((el) => { el.textContent = regionG2 || ''; });

        CFG_MODULOS[nombre].abrir();
    }

    // Clic en una tarjeta -> cambia la dirección (#configuracion?modulo=...)
    $('#cfgInicio').addEventListener('click', (evento) => {
        const tarjeta = evento.target.closest('.cfg-modulo-tarjeta');
        if (tarjeta) location.hash = `configuracion?modulo=${tarjeta.dataset.modulo}`;
    });

    // ==================================================
    // CARGAR DATOS
    // ==================================================

    async function cargarTodo() {
        const [conf, marc, ajus, reg, tie, dia] = await Promise.all([
            db.from('configuracion').select('clave, valor'),
            db.from('marcas_horario').select('numero, inicio_desde, inicio_hasta, fin').order('numero'),
            db.from('capacidad_marcas').select('id, region, tienda_id, pedidos_por_marca, regiones(nombre), tiendas(codigo, nombre, region)'),
            db.from('regiones').select('codigo, nombre').order('nombre'),
            db.from('tiendas').select('id, codigo, nombre, region').order('codigo'),
            db.from('horario_dias').select('dia, cantidad_marcas, marcas_dia(numero, inicio_desde, inicio_hasta, fin)').order('dia'),
        ]);

        // El horario por día es aparte (sql/13): si falta, el resto sigue funcionando
        faltaSqlDias = !!dia.error;
        if (dia.error) console.error('Error al cargar el horario por día:', dia.error);
        dias = dia.error ? [] : dia.data;
        dias.forEach((d) => d.marcas_dia.sort((a, b) => a.numero - b.numero));

        const error = conf.error || marc.error || ajus.error || reg.error || tie.error;
        if (error) {
            console.error('Error al cargar la configuración:', error);
            aviso.mostrar(error.code === 'PGRST205' || error.code === '42P01'
                ? 'Falta ejecutar sql/12_horarios.sql en Supabase.'
                : 'No se pudo cargar la configuración. Revisa la conexión.', 'error');
            return;
        }

        config = { ...CFG_POR_DEFECTO };
        conf.data.forEach((fila) => { config[fila.clave] = fila.valor; });
        marcas = marc.data;
        ajustes = ajus.data;
        regiones = reg.data;
        tiendas = tie.data;

        // Admin G2: solo su región, las tiendas de su región y sus ajustes
        if (regionG2) {
            regiones = regiones.filter((r) => r.codigo === regionG2);
            tiendas = tiendas.filter((t) => t.region === regionG2);
            ajustes = ajustes.filter((a) => a.region === regionG2 || (a.tiendas && a.tiendas.region === regionG2));
        }

        inputCantidad.value = config.cantidad_marcas;
        inputPedidos.value = config.pedidos_por_marca;
        // Los valores base solo los cambian Administrador y Admin G1
        inputCantidad.disabled = !puedeModificar;
        inputPedidos.disabled = !puedeModificar;
        dibujarMarcas();
        dibujarDias();
        dibujarAjustes();
    }

    // ==================================================
    // 1. VALORES BASE
    // ==================================================

    // Guarda valores en la tabla "configuracion" (crea la clave si no existe)
    async function guardarConfig(valores) {
        const ahora = new Date().toISOString();
        const filas = Object.entries(valores).map(([clave, valor]) => ({ clave, valor, actualizado_en: ahora }));
        return db.from('configuracion').upsert(filas);
    }

    // Crea las marcas que faltan hasta llegar a "cantidad", con horas sugeridas
    // que continúan después de la última marca
    async function crearMarcasFaltantes(cantidad) {
        const nuevas = [];
        let inicio = marcas.length ? aMinutos(marcas[marcas.length - 1].fin) : 7 * 60; // 07:00 si no hay ninguna
        for (let numero = marcas.length + 1; numero <= cantidad; numero++) {
            // No caben más marcas antes de medianoche con las horas sugeridas
            if (inicio + CFG_DURACION_MIN > 23 * 60 + 59) {
                return { error: { mensajePropio: `No caben ${cantidad} horarios antes de medianoche. ` +
                    'Ajusta primero las horas de los últimos horarios para que terminen más temprano.' } };
            }
            nuevas.push({
                numero,
                inicio_desde: aHora(inicio),
                inicio_hasta: aHora(inicio + CFG_VENTANA_MIN),
                fin: aHora(inicio + CFG_DURACION_MIN),
            });
            inicio += CFG_DURACION_MIN;
        }
        return nuevas.length ? db.from('marcas_horario').insert(nuevas) : { error: null };
    }

    async function guardarBase(cantidad, pedidos) {
        botonBase.disabled = true;

        // Primero las marcas (crear o eliminar), luego los valores
        let resultado = { error: null };
        if (cantidad > marcas.length) {
            resultado = await crearMarcasFaltantes(cantidad);
        } else if (cantidad < marcas.length) {
            resultado = await db.from('marcas_horario').delete().gt('numero', cantidad);
        }
        if (!resultado.error) {
            resultado = await guardarConfig({ cantidad_marcas: cantidad, pedidos_por_marca: pedidos });
        }

        botonBase.disabled = false;
        if (resultado.error) {
            console.error('Error al guardar valores base:', resultado.error);
            aviso.mostrar(resultado.error.mensajePropio || 'No se pudieron guardar los valores. Intenta de nuevo.', 'error');
            return;
        }
        aviso.mostrar('Valores base guardados.');
        cargarTodo();
    }

    $('#cfgBaseForm').addEventListener('submit', (evento) => {
        evento.preventDefault();
        if (!puedeModificar) return;
        errorBase.textContent = '';

        const cantidad = Number(inputCantidad.value);
        const pedidos = Number(inputPedidos.value);
        if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 24) {
            errorBase.textContent = 'La cantidad de horarios debe ser un número entero de 1 a 24.';
            return;
        }
        if (!Number.isInteger(pedidos) || pedidos < 0 || pedidos > 999) {
            errorBase.textContent = 'Los pedidos por horario deben ser un número entero de 0 a 999.';
            return;
        }

        // Bajar la cantidad elimina las últimas marcas: se pide confirmación
        if (cantidad < marcas.length) {
            const quitar = marcas.filter((m) => m.numero > cantidad).map((m) => m.numero).join(', ');
            pedirConfirmacion(
                `Al bajar a ${cantidad} horarios se eliminarán los horarios ${quitar} y sus horas. ¿Continuar?`,
                () => guardarBase(cantidad, pedidos)
            );
            return;
        }
        guardarBase(cantidad, pedidos);
    });

    // ==================================================
    // 2. HORAS DE CADA MARCA
    // ==================================================

    function dibujarMarcas() {
        cuerpoMarcas.replaceChildren();
        if (marcas.length === 0) {
            cuerpoMarcas.appendChild(crearFilaVacia('No hay horarios. Indica la cantidad en "Valores base".', puedeModificar ? 5 : 4));
            return;
        }

        marcas.forEach((m) => {
            const tr = document.createElement('tr');

            const tdNumero = document.createElement('td');
            const circulo = document.createElement('span');
            circulo.className = 'cfg-numero-marca';
            circulo.textContent = m.numero;
            tdNumero.append(circulo, `Horario ${m.numero}`);
            tr.appendChild(tdNumero);

            tr.appendChild(crearCelda(`${hhmm(m.inicio_desde)} a ${hhmm(m.inicio_hasta)}`, 'texto-codigo'));
            tr.appendChild(crearCelda(hhmm(m.fin), 'texto-codigo'));
            tr.appendChild(crearCelda(textoDuracion(aMinutos(m.fin) - aMinutos(m.inicio_desde))));

            if (puedeModificar) {
                tr.appendChild(crearCeldaAcciones(
                    crearBotonIcono('editar', m.numero, 'bi-pencil', `Modificar horas del horario ${m.numero}`)
                ));
            }
            cuerpoMarcas.appendChild(tr);
        });
    }

    cuerpoMarcas.addEventListener('click', (evento) => {
        const boton = evento.target.closest('button[data-accion="editar"]');
        if (!boton || !puedeModificar) return;
        const marca = marcas.find((m) => m.numero === Number(boton.dataset.id));
        if (marca) abrirMarca(marca);
    });

    function abrirMarca(marca) {
        editandoMarca = marca;
        marcaError.textContent = '';
        $('#cfgMarcaTitulo').textContent = `Horas del horario ${marca.numero}`;
        marcaCampos.desde.value = hhmm(marca.inicio_desde);
        marcaCampos.hasta.value = hhmm(marca.inicio_hasta);
        marcaCampos.fin.value = hhmm(marca.fin);
        marcaDialogo.showModal();
        marcaCampos.desde.focus();
    }

    $('#cfgMarcaCancelar').addEventListener('click', () => marcaDialogo.close());

    $('#cfgMarcaForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (!puedeModificar || !editandoMarca) return;

        const desde = marcaCampos.desde.value;
        const hasta = marcaCampos.hasta.value;
        const fin = marcaCampos.fin.value;

        if (!desde || !hasta || !fin) {
            marcaError.textContent = 'Completa las tres horas.';
            return;
        }
        if (aMinutos(hasta) < aMinutos(desde)) {
            marcaError.textContent = '"Inicia hasta" no puede ser antes de "Inicia desde".';
            return;
        }
        if (aMinutos(fin) <= aMinutos(hasta)) {
            marcaError.textContent = 'La hora de término debe ser después de la ventana de inicio.';
            return;
        }

        const { error } = await db.from('marcas_horario')
            .update({ inicio_desde: desde, inicio_hasta: hasta, fin, actualizado_en: new Date().toISOString() })
            .eq('numero', editandoMarca.numero);

        if (error) {
            console.error('Error al guardar la marca:', error);
            marcaError.textContent = 'No se pudo guardar. Intenta de nuevo.';
            return;
        }
        marcaDialogo.close();
        aviso.mostrar(`Horario ${editandoMarca.numero}: inicia de ${desde} a ${hasta} y termina a las ${fin}.`);
        cargarTodo();
    });

    // ==================================================
    // 3. HORARIO POR DÍA DE LA SEMANA (sql/13_horario_dias.sql)
    // Un día con fila en "horario_dias" usa SUS marcas ("marcas_dia");
    // si no tiene, usa la base (valores base + horas de cada marca).
    // ==================================================

    // Marcas que aplican a un día: las propias o las de la base
    const diaPropio = (numero) => dias.find((d) => d.dia === numero);
    const marcasDelDia = (numero) => { const d = diaPropio(numero); return d ? d.marcas_dia : marcas; };

    function dibujarDias() {
        cuerpoDias.replaceChildren();
        const columnas = puedeModificar ? 5 : 4;
        if (faltaSqlDias) {
            cuerpoDias.appendChild(crearFilaVacia('Falta ejecutar sql/13_horario_dias.sql en Supabase.', columnas));
            return;
        }

        Object.entries(CFG_DIAS).forEach(([numeroTexto, nombre]) => {
            const numero = Number(numeroTexto);
            const propio = diaPropio(numero);
            const lista = marcasDelDia(numero);
            const tr = document.createElement('tr');

            tr.appendChild(crearCelda(nombre));

            // Tipo: base / personalizado / sin marcas
            if (!propio) tr.appendChild(crearCeldaEtiqueta('Base', 'etiqueta-gris'));
            else if (propio.cantidad_marcas === 0) tr.appendChild(crearCeldaEtiqueta('Sin horarios', 'etiqueta-rosada'));
            else tr.appendChild(crearCeldaEtiqueta('Personalizado', 'etiqueta-naranja'));

            tr.appendChild(crearCelda(plural(lista.length, 'horario', 'horarios'))); // js/componentes.js
            tr.appendChild(crearCelda(lista.length
                ? `${hhmm(lista[0].inicio_desde)} → ${hhmm(lista[lista.length - 1].fin)}`
                : '—', 'texto-codigo'));

            if (puedeModificar) {
                const botones = [crearBotonIcono('editar', numero, 'bi-pencil', `Personalizar el horario del ${nombre.toLowerCase()}`)];
                if (propio) {
                    botones.push(crearBotonIcono('base', numero, 'bi-arrow-counterclockwise', `Volver a la base el ${nombre.toLowerCase()}`));
                }
                tr.appendChild(crearCeldaAcciones(...botones));
            }
            cuerpoDias.appendChild(tr);
        });
    }

    cuerpoDias.addEventListener('click', (evento) => {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton || !puedeModificar) return;
        const numero = Number(boton.dataset.id);

        if (boton.dataset.accion === 'editar') abrirDia(numero);
        if (boton.dataset.accion === 'base') {
            pedirConfirmacion(
                `¿Quitar el horario propio del ${CFG_DIAS[numero].toLowerCase()}? Volverá a usar la base (${plural(marcas.length, 'horario', 'horarios')}).`,
                async () => {
                    // on delete cascade: también borra sus filas de "marcas_dia"
                    const { error } = await db.from('horario_dias').delete().eq('dia', numero);
                    if (error) {
                        console.error('Error al volver a la base:', error);
                        aviso.mostrar('No se pudo quitar el horario del día.', 'error');
                        return;
                    }
                    aviso.mostrar(`${CFG_DIAS[numero]}: usa la base.`);
                    cargarTodo();
                }
            );
        }
    });

    // ---------- Ventana del día ----------

    // Una fila de la ventana: "Marca N" + 3 horas
    function crearFilaDia(numero, valores) {
        const fila = document.createElement('div');
        fila.className = 'cfg-dia-fila';

        const nombre = document.createElement('span');
        nombre.className = 'cfg-dia-nombre';
        const circulo = document.createElement('span');
        circulo.className = 'cfg-numero-marca';
        circulo.textContent = numero;
        nombre.append(circulo, `Horario ${numero}`);
        fila.appendChild(nombre);

        [['desde', 'Inicia desde'], ['hasta', 'Inicia hasta'], ['fin', 'Termina']].forEach(([campo, texto]) => {
            const input = document.createElement('input');
            input.type = 'time';
            input.className = 'campo-input';
            input.dataset.campo = campo;
            input.value = valores[campo] || '';
            input.setAttribute('aria-label', `Horario ${numero}: ${texto.toLowerCase()}`);
            fila.appendChild(input);
        });
        return fila;
    }

    // Lee las horas que hay escritas en la ventana: [{ desde, hasta, fin }]
    const leerFilasDia = () => [...diaFilas.children].map((fila) => {
        const valor = (campo) => fila.querySelector(`[data-campo="${campo}"]`).value;
        return { desde: valor('desde'), hasta: valor('hasta'), fin: valor('fin') };
    });

    // Arma "cantidad" filas. Conserva lo ya escrito; las nuevas toman las
    // horas de la base o, si la base no tiene esa marca (o se encimaría con
    // la anterior), continúan después de la anterior con las horas sugeridas.
    function armarFilasDia(cantidad) {
        const actuales = leerFilasDia();
        diaFilas.replaceChildren();
        for (let numero = 1; numero <= cantidad; numero++) {
            let valores = actuales[numero - 1];
            if (!valores) {
                const base = marcas.find((m) => m.numero === numero);
                const anterior = numero > 1 ? leerFilasDia()[numero - 2] : null;
                const encima = base && anterior && anterior.fin && aMinutos(base.inicio_desde) < aMinutos(anterior.fin);
                if (base && !encima) {
                    valores = { desde: hhmm(base.inicio_desde), hasta: hhmm(base.inicio_hasta), fin: hhmm(base.fin) };
                } else {
                    const inicio = anterior && anterior.fin ? aMinutos(anterior.fin) : 7 * 60;
                    valores = inicio + CFG_DURACION_MIN > 23 * 60 + 59
                        ? {} // no cabe con las horas sugeridas: se deja en blanco para escribirla
                        : { desde: aHora(inicio), hasta: aHora(inicio + CFG_VENTANA_MIN), fin: aHora(inicio + CFG_DURACION_MIN) };
                }
            }
            diaFilas.appendChild(crearFilaDia(numero, valores));
        }
        diaVacio.hidden = cantidad > 0;
        $('.cfg-dia-encabezado').hidden = cantidad === 0;
    }

    function abrirDia(numero) {
        editandoDia = numero;
        diaError.textContent = '';
        $('#cfgDiaTitulo').textContent = `Horario del ${CFG_DIAS[numero].toLowerCase()}`;

        // Parte de lo que el día tiene hoy (propio o base)
        const lista = marcasDelDia(numero);
        diaFilas.replaceChildren();
        lista.forEach((m) => diaFilas.appendChild(crearFilaDia(m.numero, {
            desde: hhmm(m.inicio_desde), hasta: hhmm(m.inicio_hasta), fin: hhmm(m.fin),
        })));
        diaCantidad.value = lista.length;
        armarFilasDia(lista.length);

        // Casillas "Aplicar también a" (todos los días menos este)
        diaOtros.replaceChildren();
        Object.entries(CFG_DIAS).filter(([n]) => Number(n) !== numero).forEach(([n, nombre]) => {
            const label = document.createElement('label');
            const casilla = document.createElement('input');
            casilla.type = 'checkbox';
            casilla.value = n;
            label.append(casilla, nombre);
            diaOtros.appendChild(label);
        });

        diaDialogo.showModal();
        diaCantidad.focus();
    }

    // Al cambiar la cantidad se agregan o quitan filas
    diaCantidad.addEventListener('input', () => {
        const cantidad = Number(diaCantidad.value);
        if (Number.isInteger(cantidad) && cantidad >= 0 && cantidad <= 24) armarFilasDia(cantidad);
    });

    $('#cfgDiaCancelar').addEventListener('click', () => diaDialogo.close());

    $('#cfgDiaForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (!puedeModificar || !editandoDia) return;
        diaError.textContent = '';

        const cantidad = Number(diaCantidad.value);
        if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > 24) {
            diaError.textContent = 'La cantidad de horarios debe ser un número entero de 0 a 24.';
            return;
        }

        // Revisar las horas de cada marca (y que no se encimen)
        const filas = leerFilasDia();
        for (let i = 0; i < filas.length; i++) {
            const { desde, hasta, fin } = filas[i];
            const n = i + 1;
            if (!desde || !hasta || !fin) {
                diaError.textContent = `Completa las tres horas del horario ${n}.`;
                return;
            }
            if (aMinutos(hasta) < aMinutos(desde)) {
                diaError.textContent = `Horario ${n}:"Inicia hasta" no puede ser antes de "Inicia desde".`;
                return;
            }
            if (aMinutos(fin) <= aMinutos(hasta)) {
                diaError.textContent = `Horario ${n}:la hora de término debe ser después de la ventana de inicio.`;
                return;
            }
            if (i > 0 && aMinutos(desde) < aMinutos(filas[i - 1].fin)) {
                diaError.textContent = `El horario ${n} empieza antes de que termine el horario ${n - 1}.`;
                return;
            }
        }

        // Este día + los marcados en "Aplicar también a"
        const destinos = [editandoDia, ...[...diaOtros.querySelectorAll('input:checked')].map((c) => Number(c.value))];
        const ahora = new Date().toISOString();
        const botonGuardar = $('#cfgDiaGuardar');
        botonGuardar.disabled = true;

        // 1. El día (o días) con su cantidad  2. Borrar sus marcas anteriores  3. Guardar las nuevas
        let resultado = await db.from('horario_dias')
            .upsert(destinos.map((dia) => ({ dia, cantidad_marcas: cantidad, actualizado_en: ahora })));
        if (!resultado.error) {
            resultado = await db.from('marcas_dia').delete().in('dia', destinos);
        }
        if (!resultado.error && filas.length) {
            resultado = await db.from('marcas_dia').insert(destinos.flatMap((dia) => filas.map((f, i) => ({
                dia, numero: i + 1, inicio_desde: f.desde, inicio_hasta: f.hasta, fin: f.fin,
            }))));
        }

        botonGuardar.disabled = false;
        if (resultado.error) {
            console.error('Error al guardar el horario del día:', resultado.error);
            diaError.textContent = 'No se pudo guardar. Intenta de nuevo.';
            return;
        }
        diaDialogo.close();
        const nombres = destinos.map((d) => CFG_DIAS[d]).join(', ');
        aviso.mostrar(cantidad
            ? `${nombres}: horario guardado (${plural(cantidad, 'horario', 'horarios')}).`
            : `${nombres}: sin horarios.`);
        cargarTodo();
    });

    // ==================================================
    // 4. PEDIDOS POR MARCA SEGÚN REGIÓN O TIENDA
    // ==================================================

    const textoDestino = (a) => (a.region
        ? `Región ${a.regiones ? a.regiones.nombre : a.region} (${a.region})`
        : a.tiendas ? `${a.tiendas.codigo} · ${a.tiendas.nombre}` : 'Tienda eliminada');

    function dibujarAjustes() {
        cuerpoAjustes.replaceChildren();
        if (ajustes.length === 0) {
            cuerpoAjustes.appendChild(crearFilaVacia(
                `Sin ajustes: ${regionG2 ? 'las tiendas de tu región' : 'todas las tiendas'} usan la base (${config.pedidos_por_marca} pedidos por horario).`,
                puedeRegional ? 4 : 3
            ));
            return;
        }

        // Primero regiones, luego tiendas
        [...ajustes].sort((a, b) => (a.region ? 0 : 1) - (b.region ? 0 : 1) || textoDestino(a).localeCompare(textoDestino(b)))
            .forEach((a) => {
                const tr = document.createElement('tr');
                tr.appendChild(crearCelda(textoDestino(a)));
                tr.appendChild(a.region
                    ? crearCeldaEtiqueta('Región', 'etiqueta-turquesa')
                    : crearCeldaEtiqueta('Tienda', 'etiqueta-azul'));
                tr.appendChild(crearCelda(`${a.pedidos_por_marca} pedidos`));
                if (puedeRegional) {
                    tr.appendChild(crearCeldaAcciones(
                        crearBotonIcono('editar', a.id, 'bi-pencil', 'Modificar ajuste'),
                        crearBotonIcono('eliminar', a.id, 'bi-trash3', 'Quitar ajuste (vuelve a la base)')
                    ));
                }
                cuerpoAjustes.appendChild(tr);
            });
    }

    // Opciones de "¿Cuál?" según el tipo, sin las que ya tienen ajuste
    function llenarDestinos() {
        const tipo = ajusteTipo.value;
        const usados = new Set(ajustes
            .filter((a) => a !== editandoAjuste)
            .map((a) => (tipo === 'region' ? a.region : a.tienda_id))
            .filter(Boolean));

        ajusteDestino.replaceChildren(new Option('Selecciona...', ''));
        if (tipo === 'region') {
            regiones.filter((r) => !usados.has(r.codigo))
                .forEach((r) => ajusteDestino.appendChild(new Option(`${r.nombre} (${r.codigo})`, r.codigo)));
        } else {
            tiendas.filter((t) => !usados.has(t.id))
                .forEach((t) => ajusteDestino.appendChild(new Option(`${t.codigo} · ${t.nombre}`, t.id)));
        }
    }

    function abrirAjuste(ajuste = null) {
        editandoAjuste = ajuste;
        ajusteError.textContent = '';
        $('#cfgAjusteTitulo').textContent = ajuste ? 'Modificar ajuste' : 'Agregar ajuste';

        ajusteTipo.value = ajuste && ajuste.tienda_id ? 'tienda' : 'region';
        llenarDestinos();
        if (ajuste) ajusteDestino.value = ajuste.region || ajuste.tienda_id;
        ajustePedidos.value = ajuste ? ajuste.pedidos_por_marca : config.pedidos_por_marca;

        // Al modificar no se cambia a quién aplica (se elimina y se crea otro)
        ajusteTipo.disabled = !!ajuste;
        ajusteDestino.disabled = !!ajuste;

        ajusteDialogo.showModal();
        (ajuste ? ajustePedidos : ajusteTipo).focus();
    }

    ajusteTipo.addEventListener('change', llenarDestinos);
    $('#cfgNuevoAjuste').addEventListener('click', () => { if (puedeRegional) abrirAjuste(); });
    $('#cfgAjusteCancelar').addEventListener('click', () => ajusteDialogo.close());

    // (Admin G2 solo tiene en "ajustes" los de su región: no puede tocar otros)
    cuerpoAjustes.addEventListener('click', (evento) => {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton || !puedeRegional) return;
        const ajuste = ajustes.find((a) => a.id === Number(boton.dataset.id));
        if (!ajuste) return;

        if (boton.dataset.accion === 'editar') abrirAjuste(ajuste);
        if (boton.dataset.accion === 'eliminar') {
            pedirConfirmacion(
                `¿Quitar el ajuste de ${textoDestino(ajuste)}? Volverá a usar la base (${config.pedidos_por_marca} pedidos por horario).`,
                async () => {
                    const { error } = await db.from('capacidad_marcas').delete().eq('id', ajuste.id);
                    if (error) {
                        console.error('Error al quitar ajuste:', error);
                        aviso.mostrar('No se pudo quitar el ajuste.', 'error');
                        return;
                    }
                    aviso.mostrar('Ajuste quitado.');
                    cargarTodo();
                }
            );
        }
    });

    $('#cfgAjusteForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (!puedeRegional) return;
        ajusteError.textContent = '';

        const destino = ajusteDestino.value;
        const pedidos = Number(ajustePedidos.value);
        if (!destino) {
            ajusteError.textContent = 'Elige la región o la tienda.';
            return;
        }
        if (!Number.isInteger(pedidos) || pedidos < 0 || pedidos > 999) {
            ajusteError.textContent = 'Los pedidos por horario deben ser un número entero de 0 a 999.';
            return;
        }

        const { error } = editandoAjuste
            ? await db.from('capacidad_marcas').update({ pedidos_por_marca: pedidos }).eq('id', editandoAjuste.id)
            : await db.from('capacidad_marcas').insert(ajusteTipo.value === 'region'
                ? { region: destino, pedidos_por_marca: pedidos }
                : { tienda_id: Number(destino), pedidos_por_marca: pedidos });

        if (error) {
            console.error('Error al guardar ajuste:', error);
            ajusteError.textContent = error.code === '23505'
                ? 'Esa región o tienda ya tiene un ajuste. Modifícalo desde la lista.'
                : 'No se pudo guardar. Intenta de nuevo.';
            return;
        }
        ajusteDialogo.close();
        aviso.mostrar('Ajuste guardado.');
        cargarTodo();
    });

    // ==================================================
    // MÓDULO VEHÍCULOS (tabla "vehiculos")
    // ==================================================

    const cuerpoVehiculos = $('#cfgVehiculos');
    const vehBuscar       = $('#cfgVehBuscar');
    const vehFiltroEstado = $('#cfgVehFiltroEstado');
    const vehDialogo      = $('#cfgVehDialogo');
    const vehError        = $('#cfgVehError');
    const vehCampos       = { placa: $('#cfgVehPlaca'), marca: $('#cfgVehMarca'), estado: $('#cfgVehEstado') };

    let vehiculos = [];          // [{ id, placa, marca, estado, pilotos: [{ nombre, id_usuario }] }]
    let editandoVehiculo = null;

    // "p 123 abc" -> "P123ABC" (igual que en Usuarios)
    const normalizarPlaca = (texto) => texto.toUpperCase().replace(/\s+/g, '');

    async function cargarVehiculos() {
        const [veh, pil] = await Promise.all([
            db.from('vehiculos').select('id, placa, marca, estado').order('placa'),
            // tiendas(region): la región del piloto (para Admin G2)
            db.from('usuarios').select('nombre, id_usuario, vehiculo_id, tiendas(region)')
                .eq('rol', 'piloto').not('vehiculo_id', 'is', null).order('nombre'),
        ]);

        const error = veh.error || pil.error;
        if (error) {
            console.error('Error al cargar vehículos:', error);
            aviso.mostrar('No se pudieron cargar los vehículos. Revisa la conexión.', 'error');
            return;
        }

        // A cada vehículo se le agregan los pilotos que lo tienen asignado
        vehiculos = veh.data.map((v) => ({ ...v, pilotos: pil.data.filter((p) => p.vehiculo_id === v.id) }));

        // Admin G2: solo los vehículos con algún piloto de su región
        if (regionG2) vehiculos = vehiculos.filter((v) => v.pilotos.some(esDeMiRegion));
        dibujarVehiculos();
    }

    // ¿El piloto es de una tienda de la región del Admin G2?
    const esDeMiRegion = (piloto) => !!piloto.tiendas && piloto.tiendas.region === regionG2;

    // Admin G2 elimina solo si TODOS los pilotos del vehículo son de su región
    // (si lo comparte con otra región, eliminarlo les quitaría el vehículo a ellos)
    const puedeEliminarVehiculo = (v) => esGeneral || (!!regionG2 && v.pilotos.every(esDeMiRegion));

    function dibujarVehiculos() {
        // Resumen por estado
        $('[data-cuenta=""]').textContent = vehiculos.length;
        Object.keys(CFG_ESTADOS_VEHICULO).forEach((estado) => {
            $(`[data-cuenta="${estado}"]`).textContent = vehiculos.filter((v) => v.estado === estado).length;
        });
        zona.querySelectorAll('.resumen-item').forEach((item) => {
            item.classList.toggle('activo', item.dataset.estado === vehFiltroEstado.value);
        });

        // Lista filtrada
        const texto = vehBuscar.value.trim();
        const estado = vehFiltroEstado.value;
        const visibles = vehiculos.filter((v) => (!estado || v.estado === estado) &&
            coincideBusqueda([v.placa, v.marca, ...v.pilotos.flatMap((p) => [p.nombre, p.id_usuario])], texto));

        $('#cfgVehContador').textContent = visibles.length === vehiculos.length
            ? plural(vehiculos.length, 'vehículo registrado', 'vehículos registrados')
            : `${visibles.length} de ${plural(vehiculos.length, 'vehículo', 'vehículos')}`;

        cuerpoVehiculos.replaceChildren();
        const columnas = puedeRegional ? 5 : 4;
        if (visibles.length === 0) {
            let vacio = 'Ningún vehículo coincide con la búsqueda.';
            if (!vehiculos.length) {
                vacio = regionG2
                    ? 'No hay vehículos asignados a pilotos de tu región.'
                    : 'No hay vehículos registrados. Usa "Agregar vehículo".';
            }
            cuerpoVehiculos.appendChild(crearFilaVacia(vacio, columnas));
            return;
        }

        visibles.forEach((v) => {
            const tr = document.createElement('tr');
            tr.appendChild(crearCelda(v.placa, 'texto-codigo'));
            tr.appendChild(crearCelda(v.marca));
            const info = CFG_ESTADOS_VEHICULO[v.estado] || { texto: v.estado, color: 'etiqueta-gris' };
            tr.appendChild(crearCeldaEtiqueta(info.texto, info.color));

            // Pilotos asignados (nombre + usuario), o "Sin asignar"
            if (v.pilotos.length) {
                const tdPilotos = document.createElement('td');
                const lista = document.createElement('div');
                lista.className = 'cfg-pilotos';
                v.pilotos.forEach((p) => {
                    const linea = document.createElement('span');
                    const usuario = document.createElement('small');
                    usuario.textContent = ` · ${p.id_usuario}`;
                    linea.append(p.nombre, usuario);
                    lista.appendChild(linea);
                });
                tdPilotos.appendChild(lista);
                tr.appendChild(tdPilotos);
            } else {
                tr.appendChild(crearCeldaEtiqueta('Sin asignar', 'etiqueta-gris'));
            }

            if (puedeRegional) {
                const eliminable = puedeEliminarVehiculo(v);
                tr.appendChild(crearCeldaAcciones(
                    crearBotonIcono('editar', v.id, 'bi-pencil', `Modificar ${v.placa}`),
                    crearBotonIcono('eliminar', v.id, 'bi-trash3', eliminable
                        ? `Eliminar ${v.placa}`
                        : 'No se puede eliminar: también lo usan pilotos de otra región', !eliminable)
                ));
            }
            cuerpoVehiculos.appendChild(tr);
        });
    }

    // Búsqueda, filtro y cuadros del resumen
    vehBuscar.addEventListener('input', dibujarVehiculos);
    vehFiltroEstado.addEventListener('change', dibujarVehiculos);
    $('#cfgVehResumen').addEventListener('click', (evento) => {
        const item = evento.target.closest('.resumen-item');
        if (!item) return;
        // Presionar el cuadro ya activo quita el filtro
        vehFiltroEstado.value = vehFiltroEstado.value === item.dataset.estado ? '' : item.dataset.estado;
        dibujarVehiculos();
    });

    function abrirVehiculo(vehiculo = null) {
        editandoVehiculo = vehiculo;
        vehError.textContent = '';
        $('#cfgVehTitulo').textContent = vehiculo ? `Modificar ${vehiculo.placa}` : 'Agregar vehículo';
        vehCampos.placa.value = vehiculo ? vehiculo.placa : '';
        vehCampos.marca.value = vehiculo ? vehiculo.marca : '';
        vehCampos.estado.value = vehiculo ? vehiculo.estado : 'disponible';
        vehDialogo.showModal();
        vehCampos.placa.focus();
    }

    $('#cfgVehNuevo').addEventListener('click', () => { if (puedeModificar) abrirVehiculo(); });
    $('#cfgVehCancelar').addEventListener('click', () => vehDialogo.close());

    // (Admin G2 solo tiene en "vehiculos" los de su región)
    cuerpoVehiculos.addEventListener('click', (evento) => {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton || !puedeRegional) return;
        const vehiculo = vehiculos.find((v) => v.id === Number(boton.dataset.id));
        if (!vehiculo) return;
        if (boton.dataset.accion === 'eliminar' && !puedeEliminarVehiculo(vehiculo)) return;

        if (boton.dataset.accion === 'editar') abrirVehiculo(vehiculo);
        if (boton.dataset.accion === 'eliminar') {
            const textoPilotos = vehiculo.pilotos.length
                ? ` Lo tiene asignado: ${vehiculo.pilotos.map((p) => p.nombre).join(', ')}; quedará sin vehículo.`
                : '';
            pedirConfirmacion(`¿Eliminar el vehículo ${vehiculo.placa} (${vehiculo.marca})?${textoPilotos}`, async () => {
                const { error } = await db.from('vehiculos').delete().eq('id', vehiculo.id);
                if (error) {
                    console.error('Error al eliminar vehículo:', error);
                    aviso.mostrar('No se pudo eliminar el vehículo.', 'error');
                    return;
                }
                aviso.mostrar(`Vehículo ${vehiculo.placa} eliminado.`);
                cargarVehiculos();
            });
        }
    });

    $('#cfgVehForm').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        // Agregar: Administrador y Admin G1. Modificar: también Admin G2 (su región)
        if (editandoVehiculo ? !puedeRegional : !puedeModificar) return;
        vehError.textContent = '';

        const placa = normalizarPlaca(vehCampos.placa.value);
        const marca = vehCampos.marca.value.trim();
        const estado = vehCampos.estado.value;
        if (!placa) {
            vehError.textContent = 'Escribe la placa.';
            vehCampos.placa.focus();
            return;
        }
        if (!/^[A-Z0-9-]+$/.test(placa)) {
            vehError.textContent = 'La placa solo puede tener letras, números y guion.';
            vehCampos.placa.focus();
            return;
        }
        if (!marca) {
            vehError.textContent = 'Escribe la marca.';
            vehCampos.marca.focus();
            return;
        }

        const botonGuardar = $('#cfgVehGuardar');
        botonGuardar.disabled = true;
        const datos = { placa, marca, estado };
        const { error } = editandoVehiculo
            ? await db.from('vehiculos').update(datos).eq('id', editandoVehiculo.id)
            : await db.from('vehiculos').insert(datos);
        botonGuardar.disabled = false;

        if (error) {
            console.error('Error al guardar vehículo:', error);
            vehError.textContent = error.code === '23505'
                ? `Ya existe un vehículo con la placa ${placa}.`
                : 'No se pudo guardar. Intenta de nuevo.';
            return;
        }
        vehDialogo.close();
        aviso.mostrar(editandoVehiculo ? `Vehículo ${placa} actualizado.` : `Vehículo ${placa} agregado.`);
        cargarVehiculos();
    });

    // ==================================================
    // CONFIRMAR (ventana reutilizable)
    // ==================================================

    function pedirConfirmacion(texto, accion) {
        confirmarTexto.textContent = texto;
        accionConfirmada = accion;
        confirmar.showModal();
    }

    $('#cfgConfirmarNo').addEventListener('click', () => confirmar.close());
    $('#cfgConfirmarSi').addEventListener('click', () => {
        confirmar.close();
        if (accionConfirmada) accionConfirmada();
        accionConfirmada = null;
    });

    // ==================================================
    // ARRANQUE Y LIMPIEZA
    // ==================================================

    // ¿La dirección pide un módulo? (#configuracion?modulo=horarios)
    // Solo se abre si existe y el rol puede usarlo; si no, se muestran las tarjetas.
    const pedido = parametrosSeccion().get('modulo'); // js/pagina_inicial.js
    if (pedido && CFG_MODULOS[pedido] && CFG_MODULOS[pedido].permitido()) {
        abrirModulo(pedido);
    } else {
        mostrarInicio();
    }

    return () => {
        seccionActiva = false;
        if (limpiezaModulo) limpiezaModulo();
        aviso.limpiar();
        [marcaDialogo, diaDialogo, ajusteDialogo, vehDialogo, confirmar].forEach((d) => { if (d.open) d.close(); });
    };
});
