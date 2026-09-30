"""
==================================================
AGREGAR UNA EMPRESA NUEVA (multimarca)
ACACHETE LOGISTICS

Uso (en la terminal de VS Code, desde la carpeta del proyecto):
    python python/nueva_empresa.py

Pregunta los datos de la empresa y QUÉ ACTIVIDAD REALIZA, y la agrega a
empresas/empresas.js (sin escribir código). Al final puede dejarla como
empresa activa.

La empresa nueva queda con los colores originales de ACACHETE. Para su
paleta propia: pedirla indicando la empresa, y pegarla en su campo
"colores" de empresas/empresas.js.

Si la empresa tendrá su propia base de datos:
  1. Crear un proyecto nuevo en supabase.com.
  2. Ejecutar sql/00_instalacion_completa.sql (queda en blanco).
  3. Escribir aquí su Project URL y su clave "anon public".
==================================================
"""

import re
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARCHIVO = RAIZ / 'empresas' / 'empresas.js'
MARCA_FIN = '    // <<< FIN DE EMPRESAS'

ACTIVIDADES = {
    '1': (['tienda'], 'Entregas de tienda (supermercado: abarrotes, línea blanca, electrónica...)'),
    '2': (['encomiendas'], 'Encomiendas (cajas, bolsas, documentos, línea blanca...)'),
    '3': (['tienda', 'encomiendas'], 'Las dos'),
}


def preguntar(texto, por_defecto=''):
    extra = f' [{por_defecto}]' if por_defecto else ''
    respuesta = input(f'{texto}{extra}: ').strip()
    return respuesta or por_defecto


def clave_desde(nombre):
    """'Transportes Pérez & Hijos' -> 'transportes-perez-hijos'"""
    sin_tildes = unicodedata.normalize('NFKD', nombre).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', sin_tildes.lower()).strip('-')


def js(texto):
    """Texto entre comillas simples para JavaScript."""
    return "'" + texto.replace('\\', '\\\\').replace("'", "\\'") + "'"


def main():
    contenido = ARCHIVO.read_text(encoding='utf-8')
    if MARCA_FIN not in contenido:
        sys.exit('No se encontró la línea "<<< FIN DE EMPRESAS" en empresas/empresas.js.')

    print('Empresa nueva (Enter = valor entre corchetes)\n')
    nombre = preguntar('Nombre de la empresa')
    if not nombre:
        sys.exit('Falta el nombre.')
    clave = preguntar('Clave (sin espacios)', clave_desde(nombre))
    if f"'{clave}': {{" in contenido:
        sys.exit(f'Ya existe una empresa con la clave "{clave}".')

    titulo = preguntar('Título del encabezado', nombre)
    subtitulo = preguntar('Subtítulo', 'Panel de Control de Operaciones')

    encabezado = preguntar('Imagen de encabezado (vacío = usar el título en texto)', '')
    if encabezado and not (RAIZ / encabezado).exists():
        print(f'  ⚠ No existe {encabezado}: copia la imagen ahí antes de abrir la página.')

    print('\n¿Qué actividad realiza la empresa?')
    for numero, (_, texto) in ACTIVIDADES.items():
        print(f'  {numero}. {texto}')
    opcion = preguntar('Elige 1, 2 o 3', '3')
    if opcion not in ACTIVIDADES:
        sys.exit('Opción no válida.')
    actividades = ACTIVIDADES[opcion][0]

    pie = [preguntar('Texto del pie', 'Derechos Reservados Achete Logistics S.A.')]
    extra = preguntar('Segunda línea del pie (vacío = ninguna)', '')
    if extra:
        pie.append(extra)

    print('\nBase de datos propia (proyecto nuevo de Supabase con sql/00_instalacion_completa.sql)')
    print('  Vacío = usa la MISMA base que js/supabase.js y COMPARTE todos los datos con las otras empresas.')
    url = preguntar('  Project URL', '')
    anon = preguntar('  Clave anon public', '') if url else ''
    if url and not anon:
        sys.exit('Falta la clave anon public: sin ella la página no se puede conectar.')
    if not url:
        print('  ⚠ Sin base propia: esta empresa verá los mismos datos que las demás sin base propia.')

    bloque = f"""
    // ---------- {nombre} ----------
    {js(clave)}: {{
        nombre: {js(nombre)},
        titulo: {js(titulo)},
        subtitulo: {js(subtitulo)},
        encabezado: {js(encabezado)},
        pie: [{', '.join(js(p) for p in pie)}],
        actividades: [{', '.join(js(a) for a in actividades)}],
        supabase: {{ url: {js(url)}, anonKey: {js(anon)} }},
        // Paleta propia: pedirla y pegarla aquí. Vacío = colores originales de ACACHETE.
        colores: {{}},
    }},

"""
    contenido = contenido.replace(MARCA_FIN, bloque.lstrip('\n') + MARCA_FIN, 1)

    if preguntar('\n¿Dejarla como empresa activa? (s/n)', 's').lower().startswith('s'):
        contenido = re.sub(r"const EMPRESA_ACTIVA\s*=\s*'[^']*';", f"const EMPRESA_ACTIVA = {js(clave)};", contenido, count=1)
        activa = True
    else:
        activa = False

    ARCHIVO.write_text(contenido, encoding='utf-8')
    print(f'\n✔ Empresa "{nombre}" agregada a empresas/empresas.js' + (' y activada.' if activa else '.'))
    if url:
        print('  Recuerda ejecutar sql/00_instalacion_completa.sql en su proyecto de Supabase.')
    print('  Para su paleta de colores: pídela indicando la empresa y pégala en su campo "colores".')


if __name__ == '__main__':
    main()
