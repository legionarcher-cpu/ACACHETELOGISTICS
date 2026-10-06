"""
==================================================
EMPRESA ACTIVA Y CONEXIÓN CON SUPABASE (para los scripts de Python)
ACACHETE LOGISTICS

Lee empresas/empresas.js (la misma configuración que usa la página) para
saber qué empresa está activa y a qué base de datos conectarse. Si la
empresa no tiene base propia, usa la de js/supabase.js.

Se conecta con la API REST de Supabase usando solo la librería estándar
de Python (urllib): no hay que instalar nada ni levantar servidores.

Lo usan: python/pesos_promedio.py (y los scripts nuevos que lo necesiten).
==================================================
"""

import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

# Carpeta raíz del proyecto (la de app.html)
RAIZ = Path(__file__).resolve().parent.parent
ARCHIVO_EMPRESAS = RAIZ / 'empresas' / 'empresas.js'
ARCHIVO_SUPABASE = RAIZ / 'js' / 'supabase.js'


def empresa_activa():
    """Clave de la empresa activa (EMPRESA_ACTIVA en empresas/empresas.js)."""
    texto = ARCHIVO_EMPRESAS.read_text(encoding='utf-8')
    m = re.search(r"const EMPRESA_ACTIVA\s*=\s*'([^']+)'", texto)
    if not m:
        raise RuntimeError('No se encontró EMPRESA_ACTIVA en empresas/empresas.js')
    return m.group(1)


def conexion():
    """(url, anon_key) de la empresa activa o, si no tiene, la de js/supabase.js."""
    clave = empresa_activa()
    texto = ARCHIVO_EMPRESAS.read_text(encoding='utf-8')
    inicio = texto.find(f"'{clave}': {{")
    if inicio >= 0:
        m = re.search(r"supabase:\s*\{\s*url:\s*'([^']*)',\s*anonKey:\s*'([^']*)'", texto[inicio:])
        if m and m.group(1) and m.group(2):
            return m.group(1), m.group(2)

    base = ARCHIVO_SUPABASE.read_text(encoding='utf-8')
    url = re.search(r"SUPABASE_URL_BASE\s*=\s*'([^']+)'", base)
    key = re.search(r"SUPABASE_ANON_KEY_BASE\s*=\s*'([^']+)'", base)
    if not url or not key:
        raise RuntimeError('No se encontró la conexión en js/supabase.js')
    return url.group(1), key.group(1)


class Supabase:
    """Cliente mínimo de la API REST de Supabase (leer y modificar tablas)."""

    def __init__(self):
        self.url, self.key = conexion()

    def _pedir(self, metodo, ruta, datos=None, cabeceras=None):
        todas = {
            'apikey': self.key,
            'Authorization': f'Bearer {self.key}',
            'Content-Type': 'application/json',
        }
        todas.update(cabeceras or {})
        cuerpo = json.dumps(datos).encode('utf-8') if datos is not None else None
        pedido = urllib.request.Request(f'{self.url}/rest/v1/{ruta}', data=cuerpo, headers=todas, method=metodo)
        with urllib.request.urlopen(pedido, timeout=30) as respuesta:
            texto = respuesta.read().decode('utf-8')
            return json.loads(texto) if texto else None

    def leer(self, tabla, consulta='select=*'):
        """Todas las filas (de 1000 en 1000). consulta: formato de PostgREST."""
        filas = []
        desde = 0
        while True:
            lote = self._pedir('GET', f'{tabla}?{consulta}', cabeceras={'Range': f'{desde}-{desde + 999}'})
            filas.extend(lote)
            if len(lote) < 1000:
                return filas
            desde += 1000

    def modificar(self, tabla, filtro, datos):
        """Ej.: modificar('articulos_catalogo', 'id=eq.5', {'peso_kg': 42})"""
        return self._pedir('PATCH', f'{tabla}?{filtro}', datos)

    def agregar(self, tabla, datos):
        return self._pedir('POST', tabla, datos)


def texto_url(valor):
    """Escapa un valor para ponerlo en la dirección (filtros de PostgREST)."""
    return urllib.parse.quote(str(valor))
