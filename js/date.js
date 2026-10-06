/* ==================================================
   FECHA Y HORA DEL ENCABEZADO
   ACACHETE LOGISTICS

   Qué hace: muestra el mes/año, el día y la hora actuales
   en el recuadro del calendario del encabezado, y los
   actualiza cada segundo.

   Dónde se usa: app.html, dentro de #fecha-primordial:
     .cal-mes-anio  -> "SEP 2026"
     .cal-dia       -> "28"
     .cal-hora      -> "14:05"

   Estilos relacionados:
     - Recuadro y textos -> css/index.css (#fecha-primordial y .cal-*)
   ================================================== */

function actualizarFecha() {
    const ahora = new Date();

    // Nombres cortos de los meses. Para mostrar el nombre completo,
    // cambiar por ['Enero', 'Febrero', ...] (el índice 0 es enero).
    const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

    const dia = ahora.getDate();
    const mes = meses[ahora.getMonth()];
    const anio = ahora.getFullYear();

    // Formato de la hora (24 h, sin segundos).
    // - Para mostrar segundos: agregar  second: '2-digit'
    // - Para formato 12 h (a. m./p. m.): agregar  hour12: true
    const hora = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    // Si se renombran estas clases en app.html, cambiarlas también aquí.
    document.querySelector('.cal-mes-anio').textContent = `${mes} ${anio}`;
    document.querySelector('.cal-dia').textContent = dia;
    document.querySelector('.cal-hora').textContent = hora;
}

// Se ejecuta una vez al cargar (para no esperar 1 s en blanco)
// y luego cada 1000 ms (1 segundo).
actualizarFecha();
setInterval(actualizarFecha, 1000);
