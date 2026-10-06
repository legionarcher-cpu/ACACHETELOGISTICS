/* ==================================================
   VIAJES (TRANSPORTE) - PIEZAS COMUNES
   ACACHETE LOGISTICS

   Diseño: docs/14-transporte.md. Base de datos: sql/01 bloque 19 (tablas viajes,
   cortesias, transporte_*; funciones viajes_solicitar, viajes_cancelar,
   viajes_cambiar_hora, viajes_avanzar, viajes_horas_disponibles...).

   Lo que comparten varias secciones:
     - Estados, formatos (dinero, hora, fecha) y mensajes de error.
     - tarjetaViaje(): la tarjeta de un viaje (Viajes e Inicio).
     - pintarCortesia(): avance del cliente hacia su viaje de cortesía.
     - Precio por franja y costos por vehículo (Configuración -> Transporte y reportes):
         precioFranja(), textoDias(), costosPorVehiculo(), costoDeViaje().
     - montarInicioViajes(zona): Inicio del cliente y de las empresas solo de viajes
       (js/secciones/inicio.js).
     - montarReporteViajes(caja, opciones): pestaña "Viajes" de Reportes, con su
       exportación a Excel y PDF (js/secciones/reportes.js).

   La página SOLO LEE viajes y cortesías: reservar, cambiar la hora, cancelar y
   avanzar el estado pasa por las funciones de la base (revisan las reglas y
   evitan que dos clientes tomen la misma hora).

   Se carga en app.html después de js/qr.js.
   ================================================== */

const VIA_MONEDA = '₡';
const VIA_MONEDA_PDF = 'CRC '; // la letra estándar del PDF no tiene el símbolo ₡

// Estado -> [texto, etiqueta de css/componentes.css]
const VIA_ESTADOS = {
    confirmado:     ['Confirmado', 'etiqueta-azul'],
    en_camino:      ['En camino', 'etiqueta-turquesa'],
    en_curso:       ['En curso', 'etiqueta-morada'],
    terminado:      ['Terminado', 'etiqueta-verde'],
    cancelado:      ['Cancelado', 'etiqueta-gris'],
    no_se_presento: ['No se presentó', 'etiqueta-rosada'],
};
const VIA_ACTIVOS = ['confirmado', 'en_camino', 'en_curso'];

// Días de la semana como en transporte_franjas.dias (1 = lunes ... 7 = domingo)
const VIA_DIAS = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 7: 'Domingo' };
const VIA_DIAS_CORTOS = { 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 7: 'Dom' };

// Viaje con su vehículo y su conductor (hay varias columnas que apuntan a usuarios)
const VIA_SELECT = '*, vehiculos(placa, marca, tipo), conductor:usuarios!conductor_id(nombre, telefono)';

// Valores de siempre de transporte_config (si la empresa todavía no guardó los suyos)
const VIA_CONFIG_BASE = {
    zona_horaria: 'America/Costa_Rica', acercamiento_min: 15, colchon_min: 10, velocidad_kmh: 30,
    anticipacion_min: 60, anticipacion_dias: 14, cancelar_horas: 2,
    pasajeros_incluidos: 1, recargo_pasajero: 0, recargo_mercaderia: 0, recargo_mascota: 0, redondeo: 100,
    cortesia_activa: true, cortesia_viajes: 5, cortesia_dias: 15, cortesia_vence_dias: 30, cortesia_radio_km: 8,
    precio_litro: 0,
};

// ==================================================
// FORMATOS Y AYUDAS
// ==================================================

const viaDinero = (n, pdf = false) => `${pdf ? VIA_MONEDA_PDF : VIA_MONEDA}${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const viaHora = (t) => new Date(t).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: false });
const viaFecha = (t, larga = false) => new Date(t).toLocaleDateString('es-CR',
    larga ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });
const viaKm = (n) => `${Math.round(Number(n || 0) * 10) / 10} km`;

// Fecha local "2026-10-07" (desplazada n días)
function viaFechaISO(base = new Date(), dias = 0) {
    const d = new Date(base);
    d.setDate(d.getDate() + dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Inicio y fin de un día local en ISO (para filtrar por la hora de recogida)
function viaRangoDia(desde, hasta = desde) {
    const ini = new Date(`${desde}T00:00:00`);
    const fin = new Date(`${hasta}T00:00:00`);
    fin.setDate(fin.getDate() + 1);
    return [ini.toISOString(), fin.toISOString()];
}

// Mensaje claro de un error de la base (las funciones de viajes explican el motivo)
function viaErrorTexto(error, accion = 'completar la acción') {
    if (!error) return '';
    if (error.code === 'P0001') return error.message;
    if (['PGRST202', '42883', '42P01', 'PGRST205', '42703', 'PGRST200'].includes(error.code)) {
        return 'Falta ejecutar sql/01_actualizacion_base_existente.sql (bloque 19: transporte) en Supabase.';
    }
    return `No se pudo ${accion}. Revisa la conexión e intenta de nuevo.`;
}

function viaElemento(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
}

function viaEtiqueta(estado) {
    const [texto, color] = VIA_ESTADOS[estado] || [estado, 'etiqueta-gris'];
    return viaElemento('span', `etiqueta ${color}`, texto);
}

function viaBoton(texto, icono, clase = 'boton-secundario', datos = {}) {
    const b = viaElemento('button', `boton ${clase} boton-chico`);
    b.type = 'button';
    if (icono) b.appendChild(viaElemento('i', `bi ${icono}`));
    b.append(viaElemento('span', null, texto));
    Object.entries(datos).forEach(([k, v]) => { b.dataset[k] = v; });
    return b;
}

// Reglas de transporte de la empresa activa (con los valores de siempre si no hay)
async function cargarConfigTransporte() {
    const { data, error } = await db.from('transporte_config').select('*').maybeSingle();
    return { config: { ...VIA_CONFIG_BASE, ...(data || {}) }, error };
}

// ==================================================
// PRECIO POR FRANJA Y COSTOS (la base usa la misma fórmula: viaje_precio)
// ==================================================

// "Lun a Vie" | "Lun, Mié, Vie" | "Todos los días"
function textoDias(dias) {
    const lista = [...(dias || [])].map(Number).sort((a, b) => a - b);
    if (lista.length === 7) return 'Todos los días';
    const seguidos = lista.length > 2 && lista.every((d, i) => i === 0 || d === lista[i - 1] + 1);
    if (seguidos) return `${VIA_DIAS_CORTOS[lista[0]]} a ${VIA_DIAS_CORTOS[lista[lista.length - 1]]}`;
    return lista.map((d) => VIA_DIAS_CORTOS[d]).join(', ');
}

const viaHHMM = (hora) => String(hora || '').slice(0, 5);
const nombreFranja = (f) => f.nombre || `${viaHHMM(f.desde)}–${viaHHMM(f.hasta)}`;

// Precio del viaje en una franja (sin recargos): máximo(mínimo, base + km × precio), redondeado hacia arriba
function precioFranja(f, km, config = VIA_CONFIG_BASE) {
    let precio = Math.max(Number(f.minimo || 0), Number(f.cargo_base || 0) + Number(km || 0) * Number(f.precio_km || 0));
    const redondeo = Number(config.redondeo || 0);
    if (redondeo > 0) precio = Math.ceil(precio / redondeo) * redondeo;
    return precio;
}

// Recargos fijos de un viaje
function recargosViaje({ personas = 1, mascotas = 0, mercaderia = false }, config = VIA_CONFIG_BASE) {
    const pasajeros = Math.max(0, personas - Number(config.pasajeros_incluidos || 0)) * Number(config.recargo_pasajero || 0);
    const merc = mercaderia ? Number(config.recargo_mercaderia || 0) : 0;
    const masc = mascotas * Number(config.recargo_mascota || 0);
    return { pasajeros, mercaderia: merc, mascotas: masc, total: pasajeros + merc + masc };
}

// Costos de cada vehículo (Configuración -> Transporte):
//   fijos  (cuota, seguro, marchamo, salario...) ÷ horas del mes = costo por hora
//   variables (mantenimiento, llantas...) ÷ km del mes + combustible (precio litro ÷ km por litro) = costo por km
//   Los gastos sin vehículo son de la empresa y se reparten igual entre los vehículos.
//   "Real": con los viajes terminados de los últimos 30 días (km y minutos de cada uno).
// Devuelve { porVehiculo: Map(id -> {...}), empresa: { costoHora, costoKm, costoKmTotal } }
function costosPorVehiculo(vehiculos, costos, config, viajes30 = []) {
    const suma = (lista, tipo) => lista.filter((c) => c.tipo === tipo).reduce((s, c) => s + Number(c.monto_mes || 0), 0);
    const generales = costos.filter((c) => !c.vehiculo_id);
    const n = Math.max(1, vehiculos.length);
    const repartoFijo = suma(generales, 'fijo') / n;
    const repartoVariable = suma(generales, 'variable') / n;
    const precioLitro = Number(config.precio_litro || 0);
    const porVehiculo = new Map();
    let totFijos = 0; let totVar = 0; let totHoras = 0; let totKm = 0; let totComb = 0; let conComb = 0;

    vehiculos.forEach((v) => {
        const propios = costos.filter((c) => c.vehiculo_id === v.id);
        const fijos = suma(propios, 'fijo') + repartoFijo;
        const variables = suma(propios, 'variable') + repartoVariable;
        const horasMes = Number(v.horas_mes || 0);
        const kmMes = Number(v.km_mes || 0);
        const combustibleKm = precioLitro > 0 && Number(v.km_por_litro || 0) > 0 ? precioLitro / Number(v.km_por_litro) : 0;
        const suyos = viajes30.filter((x) => x.vehiculo_id === v.id && x.estado === 'terminado');
        const horasReal = suyos.reduce((s, x) => s + Number(x.minutos || 0), 0) / 60;
        const kmReal = suyos.reduce((s, x) => s + Number(x.km || 0), 0);
        porVehiculo.set(v.id, {
            fijos, variables, horasMes, kmMes, combustibleKm,
            costoHora: horasMes > 0 ? fijos / horasMes : null,
            costoKm: (kmMes > 0 ? variables / kmMes : 0) + combustibleKm,
            horasReal, kmReal, viajesReal: suyos.length,
            costoHoraReal: horasReal > 0 ? fijos / horasReal : null,
            costoKmReal: kmReal > 0 ? variables / kmReal + combustibleKm : null,
        });
        totFijos += fijos; totVar += variables; totHoras += horasMes; totKm += kmMes;
        if (combustibleKm) { totComb += combustibleKm; conComb++; }
    });
    const costoHora = totHoras > 0 ? totFijos / totHoras : null;
    const costoKm = (totKm > 0 ? totVar / totKm : 0) + (conComb ? totComb / conComb : 0);
    // Costo de recorrer 1 km contando el tiempo (a la velocidad de referencia): para comparar con el precio por km
    const costoKmTotal = costoKm + (costoHora ? costoHora / Math.max(1, Number(config.velocidad_kmh || 30)) : 0);
    return { porVehiculo, empresa: { costoHora, costoKm, costoKmTotal, fijos: totFijos, variables: totVar } };
}

// Costo estimado de un viaje con los costos de su vehículo
function costoDeViaje(viaje, costoVehiculo) {
    if (!costoVehiculo) return 0;
    return (Number(viaje.minutos || 0) / 60) * Number(costoVehiculo.costoHora || 0) + Number(viaje.km || 0) * Number(costoVehiculo.costoKm || 0);
}

// ==================================================
// TARJETA DE UN VIAJE
//   tarjetaViaje(v, { verCliente: true, acciones: [{ texto, icono, accion, clase }] })
//   Los botones llevan data-accion y data-id (la sección decide qué hacer).
// ==================================================
function tarjetaViaje(v, { verCliente = false, verConductor = true, acciones = [] } = {}) {
    const art = viaElemento('article', `via-viaje via-estado-${v.estado}`);
    art.dataset.id = v.id;

    const hora = viaElemento('div', 'via-viaje-hora');
    hora.append(viaElemento('strong', null, viaHora(v.inicio)), viaElemento('small', null, viaFecha(v.inicio)));

    const cuerpo = viaElemento('div', 'via-viaje-cuerpo');
    const cab = viaElemento('div', 'via-viaje-cabecera');
    cab.append(viaElemento('span', 'texto-codigo', v.codigo || ''), viaEtiqueta(v.estado));
    if (v.es_cortesia) {
        const c = viaElemento('span', 'etiqueta etiqueta-naranja');
        c.innerHTML = '<i class="bi bi-gift"></i> ';
        c.append('Cortesía');
        cab.appendChild(c);
    }
    cuerpo.appendChild(cab);

    if (verCliente) {
        const cli = viaElemento('p', 'via-viaje-cliente');
        cli.innerHTML = '<i class="bi bi-person"></i> ';
        cli.append(v.cliente_nombre || '');
        if (v.cliente_telefono) {
            const tel = viaElemento('a', null, ` · ${v.cliente_telefono}`);
            tel.href = `tel:${String(v.cliente_telefono).replace(/[^\d+]/g, '')}`;
            cli.appendChild(tel);
        }
        cuerpo.appendChild(cli);
    }

    ['origen', 'destino'].forEach((lado, i) => {
        const p = viaElemento('p', 'via-ruta');
        p.append(viaElemento('b', `via-punto via-punto-${i ? 'b' : 'a'}`, i ? 'B' : 'A'), viaElemento('span', null, v[`${lado}_direccion`] || ''));
        cuerpo.appendChild(p);
    });

    const chips = viaElemento('div', 'via-chips');
    const chip = (icono, texto) => {
        const s = viaElemento('span', 'via-chip');
        s.innerHTML = `<i class="bi ${icono}"></i> `;
        s.append(texto);
        chips.appendChild(s);
    };
    if (v.personas) chip('bi-people', plural(v.personas, 'persona', 'personas'));
    if (v.mascotas) chip('bi-heart', plural(v.mascotas, 'mascota', 'mascotas') + (v.mascotas_nota ? ` · ${v.mascotas_nota}` : ''));
    if (v.lleva_mercaderia) chip('bi-box-seam', ['Mercadería', v.mercaderia_bultos ? plural(v.mercaderia_bultos, 'bulto', 'bultos') : null,
        v.mercaderia_kg ? `${v.mercaderia_kg} kg` : null].filter(Boolean).join(' · '));
    chip('bi-signpost', `${viaKm(v.km)} · unos ${v.minutos} min`);
    cuerpo.appendChild(chips);

    const pie = viaElemento('div', 'via-viaje-pie');
    const quien = viaElemento('span', 'via-viaje-vehiculo');
    if (verConductor && (v.vehiculos || v.conductor)) {
        quien.innerHTML = '<i class="bi bi-car-front"></i> ';
        quien.append([v.vehiculos ? `${v.vehiculos.marca} ${v.vehiculos.placa}` : null, v.conductor ? v.conductor.nombre : null].filter(Boolean).join(' · '));
        if (v.conductor && v.conductor.telefono && VIA_ACTIVOS.includes(v.estado)) {
            const tel = viaElemento('a', null, ' · Llamar');
            tel.href = `tel:${String(v.conductor.telefono).replace(/[^\d+]/g, '')}`;
            quien.appendChild(tel);
        }
    }
    const total = viaElemento('strong', 'via-viaje-total', viaDinero(v.total));
    if (v.es_cortesia) total.title = `Viaje de cortesía: solo se cobran los recargos (${viaDinero(v.recargos)})`;
    pie.append(quien, total);
    cuerpo.appendChild(pie);

    if (v.estado === 'cancelado' && v.motivo_cancelacion) cuerpo.appendChild(viaElemento('p', 'via-viaje-nota', `Motivo: ${v.motivo_cancelacion}`));
    if (v.notas) cuerpo.appendChild(viaElemento('p', 'via-viaje-nota', `Nota: ${v.notas}`));

    if (acciones.length) {
        const caja = viaElemento('div', 'via-viaje-acciones');
        acciones.forEach((a) => {
            if (a.href) {
                const enlace = viaElemento('a', `boton ${a.clase || 'boton-secundario'} boton-chico`);
                enlace.href = a.href;
                if (a.externo) { enlace.target = '_blank'; enlace.rel = 'noopener'; }
                enlace.innerHTML = `<i class="bi ${a.icono}"></i> `;
                enlace.append(viaElemento('span', null, a.texto));
                caja.appendChild(enlace);
            } else {
                caja.appendChild(viaBoton(a.texto, a.icono, a.clase, { accion: a.accion, id: v.id }));
            }
        });
        cuerpo.appendChild(caja);
    }

    art.append(hora, cuerpo);
    return art;
}

// ==================================================
// CORTESÍA DEL CLIENTE (Inicio y Viajes)
//   estado: lo que devuelve la función viajes_estado_cliente de la base
// ==================================================
function pintarCortesia(caja, estado) {
    caja.replaceChildren();
    caja.hidden = !estado || !estado.activa;
    if (caja.hidden) return;
    const titulo = viaElemento('h3', 'via-tarjeta-titulo');
    titulo.innerHTML = '<i class="bi bi-gift"></i> ';
    titulo.append('Viaje de cortesía');
    caja.appendChild(titulo);

    const fecha = (t) => new Date(t).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const cortesias = estado.cortesias || [];
    if (cortesias.length) {
        const p = viaElemento('p', 'via-cortesia-ganada');
        p.append(viaElemento('strong', null, cortesias.length === 1 ? 'Tienes 1 viaje de cortesía' : `Tienes ${cortesias.length} viajes de cortesía`),
            ` · el primero vence el ${fecha(cortesias[0].vence_en)}.`);
        caja.appendChild(p);
        caja.appendChild(viaElemento('p', 'via-nota-chica',
            `Se aplica solo en tu próximo viaje de hasta ${estado.radio_km} km (los recargos se cobran igual).`));
    }
    const necesarios = Number(estado.necesarios || 5);
    const contados = Number(estado.contados || 0);
    const barra = viaElemento('div', 'via-barra');
    barra.setAttribute('role', 'progressbar');
    barra.setAttribute('aria-valuemin', '0');
    barra.setAttribute('aria-valuemax', String(necesarios));
    barra.setAttribute('aria-valuenow', String(contados));
    const relleno = viaElemento('span');
    relleno.style.width = `${Math.min(100, (contados / necesarios) * 100)}%`;
    barra.appendChild(relleno);
    caja.append(viaElemento('p', 'via-cortesia-avance', `${contados} de ${necesarios} viajes`), barra);
    caja.appendChild(viaElemento('p', 'via-nota-chica', contados
        ? `Te faltan ${necesarios - contados}. Cuentan los viajes terminados hasta el ${fecha(estado.cuenta_hasta)} (${estado.dias} días).`
        : `Haz ${necesarios} viajes en ${estado.dias} días y el siguiente es gratis.`));
}

// ==================================================
// INICIO DE VIAJES (cliente · conductor · personal)
// ==================================================
function montarInicioViajes(zona) {
    zona.innerHTML = `
        <div class="pagina ini via-inicio">
            <div class="ini-saludo">
                <div>
                    <h2 data-iv="saludo" class="pagina-titulo">Hola</h2>
                    <p data-iv="fecha" class="pagina-subtitulo"></p>
                </div>
                <div data-iv="accesos" class="ini-accesos"></div>
            </div>
            <p data-iv="aviso" class="aviso" role="status"></p>
            <div data-iv="alertas" class="via-alertas" hidden></div>
            <div data-iv="kpis" class="ini-kpis" hidden></div>
            <div class="via-columnas">
                <section class="tarjeta via-tarjeta" data-iv="proximos-caja">
                    <div class="via-tarjeta-cabecera">
                        <h3 class="via-tarjeta-titulo" data-iv="proximos-titulo"><i class="bi bi-calendar-event"></i> Próximos viajes</h3>
                        <a href="#viajes" class="ini-enlace">Ver todos</a>
                    </div>
                    <div data-iv="proximos" class="via-lista"></div>
                </section>
                <section class="tarjeta via-tarjeta via-cortesia" data-iv="cortesia" hidden></section>
            </div>
        </div>`;
    const $ = (n) => zona.querySelector(`[data-iv="${n}"]`);
    const aviso = crearAviso($('aviso'), 6000);
    const sesion = obtenerSesion() || {};
    const modo = esCliente() ? 'cliente' : rolActual() === 'piloto' ? 'conductor' : 'personal';
    let activa = true;

    const h = new Date().getHours();
    const nombre = (sesion.nombre || '').split(' ')[0];
    $('saludo').textContent = `${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}${nombre ? `, ${nombre}` : ''}`;
    const fecha = new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const empresa = empresaActual();
    $('fecha').textContent = [fecha.charAt(0).toUpperCase() + fecha.slice(1), empresa ? empresa.nombre : null].filter(Boolean).join(' · ');

    // Accesos rápidos según quién entra
    const accesos = modo === 'cliente'
        ? [['Solicitar viaje', 'bi-plus-circle', '#viajes?nuevo=1', true], ['Mis viajes', 'bi-list-ul', '#viajes'],
            // La empresa también hace encomiendas: "Mis envíos" (js/secciones/envios.js)
            tienePermiso('envios') ? ['Solicitar envío', 'bi-box-arrow-up-right', '#envios?nuevo=1'] : null].filter(Boolean)
        : modo === 'conductor'
            ? [['Mis viajes de hoy', 'bi-list-ul', '#viajes', true]]
            : [['Solicitar viaje', 'bi-plus-circle', '#viajes?nuevo=1', true], ['Agenda de viajes', 'bi-calendar3', '#viajes'],
                tienePermiso('reportes') ? ['Reportes', 'bi-bar-chart-line', '#reportes?actividad=viajes'] : null].filter(Boolean);
    $('accesos').replaceChildren(...accesos.map(([texto, icono, enlace, principal]) => {
        const a = viaElemento('a', `boton ${principal ? 'boton-principal' : 'boton-secundario'}`);
        a.href = enlace;
        a.innerHTML = `<i class="bi ${icono}"></i> `;
        a.append(viaElemento('span', null, texto));
        return a;
    }));

    function kpi(valor, texto, color, enlace, icono) {
        const el = viaElemento(enlace ? 'a' : 'div', `resumen-item ${color} ini-kpi`);
        if (enlace) el.href = enlace;
        const cab = viaElemento('span', 'resumen-texto');
        cab.innerHTML = `<i class="bi ${icono}"></i> `;
        cab.append(texto);
        el.append(cab, viaElemento('span', 'resumen-numero', String(valor)));
        return el;
    }

    async function cargar() {
        const ahora = new Date();
        let q = db.from('viajes').select(VIA_SELECT).order('inicio');
        if (modo === 'cliente') {
            q = q.eq('cliente_id', clienteActual() || 0).in('estado', VIA_ACTIVOS)
                .gte('inicio', new Date(ahora.getTime() - 6 * 3600000).toISOString()).limit(5);
        } else {
            const [ini] = viaRangoDia(viaFechaISO());
            const [, fin] = viaRangoDia(viaFechaISO(ahora, 1));
            q = q.gte('inicio', ini).lt('inicio', fin);
            if (modo === 'conductor') q = q.eq('conductor_id', sesion.id || 0);
        }
        const { data, error } = await q;
        if (!activa) return;
        if (error) {
            aviso.mostrar(viaErrorTexto(error, 'cargar los viajes'), 'error');
            $('proximos').replaceChildren(viaElemento('p', 'via-vacio', 'Sin datos.'));
            return;
        }
        const hoy = viaFechaISO();
        const deHoy = data.filter((v) => viaFechaISO(new Date(v.inicio)) === hoy);

        if (modo !== 'cliente') {
            const noCancel = deHoy.filter((v) => !['cancelado', 'no_se_presento'].includes(v.estado));
            const k = $('kpis');
            k.hidden = false;
            k.replaceChildren(
                kpi(noCancel.length, modo === 'conductor' ? 'Mis viajes de hoy' : 'Viajes de hoy', 'resumen-azul', '#viajes', 'bi-calendar-day'),
                kpi(noCancel.filter((v) => ['confirmado', 'en_camino'].includes(v.estado)).length, 'Por hacer', 'resumen-naranja', '#viajes', 'bi-hourglass-split'),
                kpi(noCancel.filter((v) => v.estado === 'en_curso').length, 'En curso', 'resumen-morada', '#viajes', 'bi-car-front'),
                kpi(noCancel.filter((v) => v.estado === 'terminado').length, 'Terminados', 'resumen-verde', '#viajes', 'bi-check2-circle'),
                ...(modo === 'personal' ? [kpi(viaDinero(noCancel.reduce((s, v) => s + Number(v.total || 0), 0)), 'Ingresos de hoy', 'resumen-azul', null, 'bi-cash-coin')] : []),
            );
        }

        // Próximos: los que todavía no terminan (cliente: los suyos; conductor: los suyos de hoy y mañana)
        const proximos = data.filter((v) => VIA_ACTIVOS.includes(v.estado)).slice(0, modo === 'personal' ? 10 : 6);
        $('proximos-titulo').lastChild.textContent = modo === 'cliente' ? ' Mis próximos viajes' : ' Próximos viajes (hoy y mañana)';
        $('proximos').replaceChildren(...(proximos.length
            ? proximos.map((v) => tarjetaViaje(v, { verCliente: modo !== 'cliente' }))
            : [viaElemento('p', 'via-vacio', modo === 'cliente' ? 'No tienes viajes próximos. Usa "Solicitar viaje".' : 'No hay viajes pendientes para hoy ni mañana.')]));
    }

    // Personal: avisos si falta configurar algo para poder reservar
    async function revisarConfiguracion() {
        if (modo !== 'personal') return;
        const [fr, veh, pil] = await Promise.all([
            db.from('transporte_franjas').select('id').eq('activa', true).limit(1),
            db.from('vehiculos').select('id, placa, asientos, estado'),
            db.from('usuarios').select('vehiculo_id').eq('rol', 'piloto').not('vehiculo_id', 'is', null),
        ]);
        if (!activa || fr.error || veh.error) return;
        const conConductor = new Set((pil.data || []).map((u) => u.vehiculo_id));
        const listos = veh.data.filter((v) => v.estado !== 'mantenimiento' && Number(v.asientos || 0) > 0 && conConductor.has(v.id));
        const alertas = [];
        if (!fr.data.length) alertas.push(['No hay franjas de precio: nadie puede reservar todavía.', '#configuracion?modulo=transporte', 'Configurar franjas']);
        if (!listos.length) alertas.push(['Ningún vehículo está listo para viajes (necesita asientos y un conductor asignado).', '#configuracion?modulo=vehiculos', 'Revisar vehículos']);
        const caja = $('alertas');
        caja.hidden = !alertas.length;
        caja.replaceChildren(...alertas.map(([texto, enlace, boton]) => {
            const p = viaElemento('p', 'via-alerta');
            p.innerHTML = '<i class="bi bi-exclamation-triangle"></i> ';
            p.append(texto, ' ');
            if (tienePermiso('configuracion')) {
                const a = viaElemento('a', null, boton);
                a.href = enlace;
                p.appendChild(a);
            }
            return p;
        }));
    }

    async function cargarCortesia() {
        if (modo !== 'cliente') return;
        const { data, error } = await db.rpc('viajes_estado_cliente', { p_cliente: clienteActual() || 0 });
        if (!activa || error) return;
        pintarCortesia($('cortesia'), data);
    }

    cargar();
    revisarConfiguracion();
    cargarCortesia();
    const reloj = setInterval(cargar, 60000);
    return () => {
        activa = false;
        clearInterval(reloj);
        aviso.limpiar();
    };
}

// ==================================================
// REPORTE DE VIAJES (pestaña "Viajes" de Reportes)
//   montarReporteViajes(caja, { puedeExportar, aviso }) -> { limpiar }
//   Filtros: fechas (hora de recogida), vehículo y estado. Exporta lo que se ve.
// ==================================================
function montarReporteViajes(caja, { puedeExportar = false, aviso } = {}) {
    caja.innerHTML = `
        <div class="tarjeta via-filtros">
            <div class="campo">
                <label class="campo-etiqueta" for="rvDesde">Desde</label>
                <input id="rvDesde" type="date" class="campo-input">
            </div>
            <div class="campo">
                <label class="campo-etiqueta" for="rvHasta">Hasta</label>
                <input id="rvHasta" type="date" class="campo-input">
            </div>
            <div class="via-atajos">
                <button type="button" class="boton boton-secundario boton-chico" data-rv="hoy">Hoy</button>
                <button type="button" class="boton boton-secundario boton-chico" data-rv="semana">Semana</button>
                <button type="button" class="boton boton-secundario boton-chico" data-rv="mes">Este mes</button>
                <button type="button" class="boton boton-secundario boton-chico" data-rv="mes_anterior">Mes anterior</button>
            </div>
            <div class="campo">
                <label class="campo-etiqueta" for="rvVehiculo">Vehículo</label>
                <select id="rvVehiculo" class="campo-input"><option value="">Todos</option></select>
            </div>
            <div class="campo">
                <label class="campo-etiqueta" for="rvEstado">Estado</label>
                <select id="rvEstado" class="campo-input"><option value="">Todos</option></select>
            </div>
            <div class="via-filtros-botones" ${puedeExportar ? '' : 'hidden'}>
                <button type="button" id="rvExcel" class="boton boton-secundario"><i class="bi bi-file-earmark-excel"></i> <span>Excel</span></button>
                <button type="button" id="rvPdf" class="boton boton-principal"><i class="bi bi-file-earmark-pdf"></i> <span>PDF</span></button>
            </div>
        </div>
        <div id="rvKpis" class="via-kpis"></div>
        <div class="via-columnas">
            <section class="tarjeta via-tarjeta">
                <h3 class="via-tarjeta-titulo"><i class="bi bi-clock"></i> Por franja horaria</h3>
                <div class="tabla-caja"><table class="tabla"><thead><tr><th>Franja</th><th class="via-num">Viajes</th><th class="via-num">Km</th><th class="via-num">Ingresos</th></tr></thead><tbody id="rvFranjas"></tbody></table></div>
            </section>
            <section class="tarjeta via-tarjeta">
                <h3 class="via-tarjeta-titulo"><i class="bi bi-car-front"></i> Por vehículo</h3>
                <div class="tabla-caja"><table class="tabla"><thead><tr><th>Vehículo</th><th class="via-num">Viajes</th><th class="via-num">Km</th><th class="via-num">Horas</th><th class="via-num">Ingresos</th><th class="via-num">Costo est.</th><th class="via-num">Margen</th></tr></thead><tbody id="rvVehiculos"></tbody></table></div>
                <p class="via-nota-chica">Costo estimado con los gastos de Configuración → Transporte (horas × costo por hora + km × costo por km).</p>
            </section>
        </div>
        <section class="tarjeta via-tarjeta">
            <div class="via-tarjeta-cabecera">
                <h3 class="via-tarjeta-titulo"><i class="bi bi-list-ul"></i> Viajes del reporte</h3>
                <div class="buscador"><i class="bi bi-search"></i><input id="rvBuscar" type="search" class="buscador-input" placeholder="Buscar código, cliente o dirección" aria-label="Buscar viajes"></div>
            </div>
            <div class="tabla-caja"><table class="tabla"><thead id="rvCabecera"></thead><tbody id="rvDetalle"></tbody></table></div>
            <div class="via-paginas">
                <button type="button" id="rvAnterior" class="boton boton-secundario boton-chico"><i class="bi bi-chevron-left"></i></button>
                <span id="rvPagina"></span>
                <button type="button" id="rvSiguiente" class="boton boton-secundario boton-chico"><i class="bi bi-chevron-right"></i></button>
            </div>
        </section>`;
    const $ = (s) => caja.querySelector(s);
    const avisar = (t, tipo) => (aviso ? aviso.mostrar(t, tipo) : console.warn(t));
    const POR_PAGINA = 25;
    let viajes = [];
    let vehiculos = [];
    let costos = [];
    let config = { ...VIA_CONFIG_BASE };
    let costosVeh = { porVehiculo: new Map(), empresa: {} };
    let pagina = 0;
    let activo = true;

    Object.entries(VIA_ESTADOS).forEach(([valor, [texto]]) => $('#rvEstado').appendChild(new Option(texto, valor)));

    function atajo(tipo) {
        const d = new Date();
        let desde = new Date(d);
        let hasta = new Date(d);
        if (tipo === 'semana') desde.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        if (tipo === 'mes') desde = new Date(d.getFullYear(), d.getMonth(), 1);
        if (tipo === 'mes_anterior') { desde = new Date(d.getFullYear(), d.getMonth() - 1, 1); hasta = new Date(d.getFullYear(), d.getMonth(), 0); }
        $('#rvDesde').value = viaFechaISO(desde);
        $('#rvHasta').value = viaFechaISO(hasta);
        caja.querySelectorAll('[data-rv]').forEach((b) => b.classList.toggle('activo', b.dataset.rv === tipo));
    }

    // Columnas del detalle (las mismas en pantalla, Excel y PDF)
    const COLUMNAS = [
        ['Código', (v) => v.codigo],
        ['Fecha', (v) => new Date(v.inicio).toLocaleDateString('es-CR')],
        ['Hora', (v) => viaHora(v.inicio)],
        ['Cliente', (v) => v.cliente_nombre],
        ['Teléfono', (v) => v.cliente_telefono || ''],
        ['Punto A', (v) => v.origen_direccion],
        ['Punto B', (v) => v.destino_direccion],
        ['Km', (v) => Number(v.km || 0), true],
        ['Personas', (v) => v.personas, true],
        ['Mascotas', (v) => v.mascotas, true],
        ['Vehículo', (v) => (v.vehiculos ? v.vehiculos.placa : '')],
        ['Conductor', (v) => (v.conductor ? v.conductor.nombre : '')],
        ['Franja', (v) => (v.desglose && v.desglose.franja) || ''],
        ['Estado', (v) => (VIA_ESTADOS[v.estado] || [v.estado])[0]],
        ['Cortesía', (v) => (v.es_cortesia ? 'Sí' : '')],
        ['Total', (v) => Number(v.total || 0), true, true],
    ];

    const visibles = () => {
        const veh = Number($('#rvVehiculo').value) || null;
        const est = $('#rvEstado').value;
        const texto = $('#rvBuscar').value.trim();
        return viajes.filter((v) => (!veh || v.vehiculo_id === veh) && (!est || v.estado === est)
            && coincideBusqueda([v.codigo, v.cliente_nombre, v.cliente_telefono, v.origen_direccion, v.destino_direccion], texto));
    };

    function resumen(lista) {
        const validos = lista.filter((v) => !['cancelado', 'no_se_presento'].includes(v.estado));
        const terminados = lista.filter((v) => v.estado === 'terminado');
        const cortesias = terminados.filter((v) => v.es_cortesia);
        const costo = terminados.reduce((s, v) => s + costoDeViaje(v, costosVeh.porVehiculo.get(v.vehiculo_id)), 0);
        const ingresos = terminados.reduce((s, v) => s + Number(v.total || 0), 0);
        return {
            total: validos.length,
            terminados: terminados.length,
            pendientes: validos.filter((v) => VIA_ACTIVOS.includes(v.estado)).length,
            cancelados: lista.filter((v) => v.estado === 'cancelado').length,
            noSePresento: lista.filter((v) => v.estado === 'no_se_presento').length,
            ingresos,
            porCobrar: validos.filter((v) => VIA_ACTIVOS.includes(v.estado)).reduce((s, v) => s + Number(v.total || 0), 0),
            km: terminados.reduce((s, v) => s + Number(v.km || 0), 0),
            personas: terminados.reduce((s, v) => s + Number(v.personas || 0), 0),
            cortesias: cortesias.length,
            valorCortesias: cortesias.reduce((s, v) => s + Number((v.desglose && v.desglose.viaje) || v.precio_viaje || 0), 0),
            costo,
            margen: ingresos - costo,
        };
    }

    // [texto, valor en pantalla, detalle] (igual en pantalla, Excel y PDF)
    function kpisDe(r, pdf = false) {
        return [
            ['Viajes', String(r.total), `${r.terminados} terminados · ${r.pendientes} por hacer`],
            ['Ingresos (terminados)', viaDinero(r.ingresos, pdf), `${viaDinero(r.porCobrar, pdf)} por cobrar en viajes pendientes`],
            ['Km recorridos', viaKm(r.km), `${plural(r.personas, 'persona transportada', 'personas transportadas')}`],
            ['Cancelados', String(r.cancelados), `${r.noSePresento} no se presentaron`],
            ['Cortesías dadas', String(r.cortesias), `Valor: ${viaDinero(r.valorCortesias, pdf)}`],
            ['Costo estimado', viaDinero(r.costo, pdf), `Margen: ${viaDinero(r.margen, pdf)}${r.ingresos ? ` (${Math.round((r.margen / r.ingresos) * 100)} %)` : ''}`],
        ];
    }

    function porFranja(lista) {
        const m = new Map();
        lista.filter((v) => !['cancelado', 'no_se_presento'].includes(v.estado)).forEach((v) => {
            const k = (v.desglose && v.desglose.franja) || 'Sin franja';
            const f = m.get(k) || { viajes: 0, km: 0, ingresos: 0 };
            f.viajes++; f.km += Number(v.km || 0); f.ingresos += Number(v.total || 0);
            m.set(k, f);
        });
        return [...m.entries()].sort((a, b) => b[1].viajes - a[1].viajes);
    }

    function porVehiculo(lista) {
        const m = new Map();
        lista.filter((v) => v.estado === 'terminado').forEach((v) => {
            const k = v.vehiculo_id || 0;
            const f = m.get(k) || { nombre: v.vehiculos ? `${v.vehiculos.placa}${v.conductor ? ` · ${v.conductor.nombre}` : ''}` : 'Sin vehículo', viajes: 0, km: 0, horas: 0, ingresos: 0, costo: 0 };
            f.viajes++; f.km += Number(v.km || 0); f.horas += Number(v.minutos || 0) / 60; f.ingresos += Number(v.total || 0);
            f.costo += costoDeViaje(v, costosVeh.porVehiculo.get(v.vehiculo_id));
            m.set(k, f);
        });
        return [...m.values()].sort((a, b) => b.ingresos - a.ingresos);
    }

    function celda(tr, texto, numero = false) {
        const td = viaElemento('td', numero ? 'via-num' : null, texto);
        tr.appendChild(td);
    }

    function dibujar() {
        const lista = visibles();
        const r = resumen(lista);
        $('#rvKpis').replaceChildren(...kpisDe(r).map(([t, v, d], i) => {
            const el = viaElemento('div', `resumen-item ${['resumen-azul', 'resumen-verde', 'resumen-azul', 'resumen-naranja', 'resumen-morada', 'resumen-azul'][i]} via-kpi`);
            el.append(viaElemento('span', 'resumen-texto', t), viaElemento('span', 'resumen-numero', v), viaElemento('span', 'via-kpi-detalle', d));
            return el;
        }));

        const franjas = porFranja(lista);
        $('#rvFranjas').replaceChildren(...(franjas.length ? franjas.map(([k, f]) => {
            const tr = document.createElement('tr');
            celda(tr, k); celda(tr, String(f.viajes), true); celda(tr, viaKm(f.km), true); celda(tr, viaDinero(f.ingresos), true);
            return tr;
        }) : [crearFilaVacia('Sin viajes.', 4)]));

        const veh = porVehiculo(lista);
        $('#rvVehiculos').replaceChildren(...(veh.length ? veh.map((f) => {
            const tr = document.createElement('tr');
            celda(tr, f.nombre); celda(tr, String(f.viajes), true); celda(tr, viaKm(f.km), true);
            celda(tr, `${Math.round(f.horas * 10) / 10} h`, true); celda(tr, viaDinero(f.ingresos), true);
            celda(tr, viaDinero(f.costo), true); celda(tr, viaDinero(f.ingresos - f.costo), true);
            return tr;
        }) : [crearFilaVacia('Sin viajes terminados.', 7)]));

        const cab = document.createElement('tr');
        COLUMNAS.forEach(([t, , numero]) => cab.appendChild(viaElemento('th', numero ? 'via-num' : null, t)));
        $('#rvCabecera').replaceChildren(cab);
        const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
        pagina = Math.min(pagina, paginas - 1);
        const filas = lista.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
        $('#rvDetalle').replaceChildren(...(filas.length ? filas.map((v) => {
            const tr = document.createElement('tr');
            COLUMNAS.forEach(([, valor, numero, dinero]) => {
                const x = valor(v);
                celda(tr, dinero ? viaDinero(x) : String(x === '' || x == null ? '—' : x), numero);
            });
            return tr;
        }) : [crearFilaVacia('No hay viajes con estos filtros.', COLUMNAS.length)]));
        $('#rvPagina').textContent = lista.length ? `${pagina * POR_PAGINA + 1}–${Math.min((pagina + 1) * POR_PAGINA, lista.length)} de ${lista.length}` : '';
        $('#rvAnterior').disabled = pagina === 0;
        $('#rvSiguiente').disabled = pagina >= paginas - 1;
    }

    async function cargar() {
        if ($('#rvDesde').value > $('#rvHasta').value) {
            avisar('La fecha "Desde" no puede ser después de "Hasta".', 'error');
            return;
        }
        const [ini, fin] = viaRangoDia($('#rvDesde').value, $('#rvHasta').value);
        const hace30 = new Date(Date.now() - 30 * 86400000).toISOString();
        const [via, veh, cos, cfg, v30] = await Promise.all([
            db.from('viajes').select(VIA_SELECT).gte('inicio', ini).lt('inicio', fin).order('inicio', { ascending: false }).limit(5000),
            db.from('vehiculos').select('id, placa, marca, horas_mes, km_mes, km_por_litro').order('placa'),
            db.from('transporte_costos').select('vehiculo_id, tipo, monto_mes'),
            cargarConfigTransporte(),
            db.from('viajes').select('vehiculo_id, estado, km, minutos').eq('estado', 'terminado').gte('inicio', hace30),
        ]);
        if (!activo) return;
        const error = via.error || veh.error;
        if (error) {
            avisar(viaErrorTexto(error, 'cargar el reporte de viajes'), 'error');
            return;
        }
        viajes = via.data;
        vehiculos = veh.data;
        costos = cos.error ? [] : cos.data;
        config = cfg.config;
        costosVeh = costosPorVehiculo(vehiculos, costos, config, v30.error ? [] : v30.data);
        const actual = $('#rvVehiculo').value;
        $('#rvVehiculo').replaceChildren(new Option('Todos', ''), ...vehiculos.map((v) => new Option(`${v.placa} · ${v.marca}`, v.id)));
        $('#rvVehiculo').value = vehiculos.some((v) => String(v.id) === actual) ? actual : '';
        pagina = 0;
        dibujar();
    }

    // ---------- Exportar (con el nombre y los colores de la empresa) ----------
    const titulo = () => `Reporte de viajes · del ${new Date(`${$('#rvDesde').value}T12:00:00`).toLocaleDateString('es-CR')} al ${new Date(`${$('#rvHasta').value}T12:00:00`).toLocaleDateString('es-CR')}`;
    const filtrosTexto = () => [
        $('#rvVehiculo').value ? `Vehículo: ${$('#rvVehiculo').selectedOptions[0].textContent}` : 'Todos los vehículos',
        $('#rvEstado').value ? `Estado: ${$('#rvEstado').selectedOptions[0].textContent}` : 'Todos los estados',
    ].join(' · ');
    const archivo = (ext) => `reporte-viajes-${$('#rvDesde').value}-a-${$('#rvHasta').value}.${ext}`;

    async function exportarExcel() {
        try {
            await cargarLibreria(LIBRERIAS.xlsx);
        } catch (e) {
            avisar('No se pudo cargar el exportador de Excel (revisa internet).', 'error');
            return;
        }
        const XLSX = window.XLSX;
        const lista = visibles();
        const libro = XLSX.utils.book_new();
        const hoja1 = [[`${nombreEmpresaExportar()} - ${titulo()}`], [filtrosTexto()], [`Generado: ${new Date().toLocaleString('es-CR')}`], [],
            ['Indicador', 'Valor', 'Detalle'], ...kpisDe(resumen(lista))];
        XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(hoja1), 'Resumen');
        XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Franja', 'Viajes', 'Km', 'Ingresos'],
            ...porFranja(lista).map(([k, f]) => [k, f.viajes, Math.round(f.km * 10) / 10, f.ingresos])]), 'Por franja');
        XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Vehículo', 'Viajes', 'Km', 'Horas', 'Ingresos', 'Costo estimado', 'Margen'],
            ...porVehiculo(lista).map((f) => [f.nombre, f.viajes, Math.round(f.km * 10) / 10, Math.round(f.horas * 10) / 10,
                f.ingresos, Math.round(f.costo), Math.round(f.ingresos - f.costo)])]), 'Por vehículo');
        const detalle = XLSX.utils.aoa_to_sheet([COLUMNAS.map(([t]) => t), ...lista.map((v) => COLUMNAS.map(([, valor]) => valor(v)))]);
        detalle['!cols'] = COLUMNAS.map(([, , numero]) => ({ wch: numero ? 10 : 20 }));
        XLSX.utils.book_append_sheet(libro, detalle, 'Viajes');
        XLSX.writeFile(libro, archivo('xlsx'));
        avisar('Excel descargado.');
    }

    async function exportarPdf() {
        try {
            await cargarLibreria(LIBRERIAS.jspdf);
            await cargarLibreria(LIBRERIAS.autotable);
        } catch (e) {
            avisar('No se pudo cargar el exportador de PDF (revisa internet).', 'error');
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const ancho = doc.internal.pageSize.getWidth();
        const lista = visibles();
        const oscuro = colorDeVariable('--color-azul-marino', [7, 48, 92]);
        const tabla = colorDeVariable('--color-azul', [42, 120, 214]);
        const dineroPdf = (n) => viaDinero(n, true);

        doc.setFillColor(...oscuro);
        doc.rect(0, 0, ancho, 20, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(15);
        const nombre = nombreEmpresaExportar().toUpperCase();
        doc.text(nombre, 12, 13, { maxWidth: ancho / 2 });
        const anchoNombre = Math.min(doc.getTextWidth(nombre), ancho / 2);
        doc.setFontSize(10);
        doc.text(titulo(), 12 + anchoNombre + 8, 13);
        doc.setTextColor(60, 60, 60);
        doc.setFontSize(9);
        doc.text(`${filtrosTexto()}   |   Generado: ${new Date().toLocaleString('es-CR')}`, 12, 27);

        doc.autoTable({
            startY: 32, head: [['Indicador', 'Valor', 'Detalle']], body: kpisDe(resumen(lista), true), theme: 'grid',
            styles: { fontSize: 8, cellPadding: 1.8 }, headStyles: { fillColor: tabla }, margin: { left: 12, right: ancho / 2 + 4 },
        });
        doc.autoTable({
            startY: 32, head: [['Franja', 'Viajes', 'Km', 'Ingresos']],
            body: porFranja(lista).map(([k, f]) => [k, f.viajes, viaKm(f.km), dineroPdf(f.ingresos)]), theme: 'grid',
            styles: { fontSize: 8, cellPadding: 1.8 }, headStyles: { fillColor: tabla }, margin: { left: ancho / 2 + 4, right: 12 },
        });
        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 6, head: [['Vehículo', 'Viajes', 'Km', 'Horas', 'Ingresos', 'Costo est.', 'Margen']],
            body: porVehiculo(lista).map((f) => [f.nombre, f.viajes, viaKm(f.km), `${Math.round(f.horas * 10) / 10} h`,
                dineroPdf(f.ingresos), dineroPdf(f.costo), dineroPdf(f.ingresos - f.costo)]), theme: 'grid',
            styles: { fontSize: 8, cellPadding: 1.8 }, headStyles: { fillColor: tabla }, margin: { left: ancho / 2 + 4, right: 12 },
        });

        doc.addPage();
        doc.setFontSize(11);
        doc.setTextColor(30, 30, 30);
        doc.text(`Viajes del reporte (${lista.length})`, 12, 14);
        doc.autoTable({
            startY: 18, head: [COLUMNAS.map(([t]) => t)],
            body: lista.map((v) => COLUMNAS.map(([, valor, , dinero]) => (dinero ? dineroPdf(valor(v)) : String(valor(v) ?? '')))),
            styles: { fontSize: 6.5, cellPadding: 1.2 }, headStyles: { fillColor: oscuro },
            alternateRowStyles: { fillColor: [245, 247, 250] }, margin: { left: 6, right: 6 },
        });
        const total = doc.getNumberOfPages();
        for (let i = 1; i <= total; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(140, 140, 140);
            doc.text(`Página ${i} de ${total}`, ancho - 30, doc.internal.pageSize.getHeight() - 6);
        }
        doc.save(archivo('pdf'));
        avisar('PDF descargado.');
    }

    // ---------- Eventos ----------
    caja.querySelectorAll('[data-rv]').forEach((b) => b.addEventListener('click', () => { atajo(b.dataset.rv); cargar(); }));
    ['#rvDesde', '#rvHasta'].forEach((s) => $(s).addEventListener('change', () => {
        caja.querySelectorAll('[data-rv]').forEach((b) => b.classList.remove('activo'));
        cargar();
    }));
    ['#rvVehiculo', '#rvEstado'].forEach((s) => $(s).addEventListener('change', () => { pagina = 0; dibujar(); }));
    $('#rvBuscar').addEventListener('input', () => { pagina = 0; dibujar(); });
    $('#rvAnterior').addEventListener('click', () => { pagina--; dibujar(); });
    $('#rvSiguiente').addEventListener('click', () => { pagina++; dibujar(); });
    $('#rvExcel').addEventListener('click', () => { if (puedeExportar) exportarExcel(); });
    $('#rvPdf').addEventListener('click', () => { if (puedeExportar) exportarPdf(); });

    atajo('mes');
    cargar();
    return { limpiar() { activo = false; } };
}
