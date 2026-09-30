/* ==================================================
   CONEXIÓN CON SUPABASE (base de datos)
   ACACHETE LOGISTICS

   Qué hace: crea "db", el objeto con el que todo el
   proyecto lee y escribe en la base de datos.

   Lo usan:
     - js/secciones/loggin.js   -> valida usuario y clave
     - js/secciones/usuarios.js -> lista, crea, modifica y elimina usuarios

   Necesita: la librería de Supabase cargada antes en index.html
   (https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2).

   Dónde se sacan estos datos:
     Supabase -> tu proyecto -> Project Settings -> API
       SUPABASE_URL      -> "Project URL"
       SUPABASE_ANON_KEY -> "anon public"

   La clave "anon" es PÚBLICA: está hecha para ir en la página.
   NUNCA poner aquí la clave "service_role" (da control total).

   Estructura de la base: sql/00_instalacion_completa.sql

   MULTIMARCA: si la empresa activa tiene su propia base de datos
   (campo "supabase" en empresas/empresas.js), se usa esa. Si no, la
   de abajo.
   ================================================== */

const SUPABASE_URL_BASE = 'https://cfypcaejgdomytgyltdf.supabase.co';
const SUPABASE_ANON_KEY_BASE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmeXBjYWVqZ2RvbXl0Z3lsdGRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MjYwMDYsImV4cCI6MjEwNjIwMjAwNn0.vs8RTsi5yg0sCPHA-RajOvV71Dwrh9WV1YGOjEynT2o';

const conexionEmpresa = (typeof EMPRESA !== 'undefined' && EMPRESA.supabase) || {};
const SUPABASE_URL = conexionEmpresa.url || SUPABASE_URL_BASE;
const SUPABASE_ANON_KEY = conexionEmpresa.anonKey || SUPABASE_ANON_KEY_BASE;

// Cliente de la base de datos. Ejemplo de uso:
//   const { data, error } = await db.from('usuarios').select('*');
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
