"""
==================================================
PESOS PROMEDIO DE ARTÍCULOS (con los pesos reales de los pedidos)
ACACHETE LOGISTICS

Cuando se registra un pedido (tienda o encomienda), el peso de cada
artículo se llena con el PESO PROMEDIO del catálogo (Configuración ->
Pedidos -> Artículos frecuentes) y el empleado lo puede corregir.
Este script compara esos pesos con los que realmente se escribieron en
los pedidos y propone ajustarlos.

Uso (en la terminal de VS Code, desde la carpeta del proyecto):
    python python/pesos_promedio.py              -> solo muestra la comparación
    python python/pesos_promedio.py --aplicar    -> además guarda los promedios reales
    python python/pesos_promedio.py --minimo 10  -> exige al menos 10 pedidos por artículo (por defecto 5)
    python python/pesos_promedio.py --agregar    -> agrega al catálogo los artículos escritos
                                                    a mano que se repiten (con su promedio)

Se conecta a la base de la empresa activa (empresas/empresas.js).
Sin servidores ni instalaciones: solo Python 3.
Los pedidos anulados no se cuentan.
==================================================
"""

import argparse
import sys
from collections import defaultdict

from empresa_activa import Supabase, empresa_activa


def main():
    parser = argparse.ArgumentParser(description='Ajusta los pesos promedio del catálogo con los pedidos reales.')
    parser.add_argument('--aplicar', action='store_true', help='guardar los promedios reales en el catálogo')
    parser.add_argument('--agregar', action='store_true', help='agregar artículos nuevos que se repiten')
    parser.add_argument('--minimo', type=int, default=5, help='pedidos mínimos por artículo (por defecto 5)')
    args = parser.parse_args()

    db = Supabase()
    print(f'Empresa activa: {empresa_activa()}  ({db.url})\n')

    categorias = {c['id']: c for c in db.leer('categorias_mercaderia', 'select=id,actividad,nombre,tipo')}
    catalogo = db.leer('articulos_catalogo', 'select=id,categoria_id,nombre,peso_kg')
    # Artículos de pedidos no anulados (peso_kg = peso de CADA uno)
    usados = db.leer('pedido_articulos',
                     'select=categoria_id,descripcion,cantidad,peso_kg,pedidos!inner(anulado)'
                     '&pedidos.anulado=eq.false&categoria_id=not.is.null')

    # Promedio real por (categoría, artículo), pesado por la cantidad
    suma = defaultdict(float)
    unidades = defaultdict(int)
    pedidos = defaultdict(int)
    for a in usados:
        categoria = categorias.get(a['categoria_id'])
        if not categoria or categoria['tipo'] != 'articulos' or not a.get('descripcion'):
            continue
        clave = (a['categoria_id'], a['descripcion'].strip().lower())
        cantidad = int(a['cantidad'] or 1)
        suma[clave] += float(a['peso_kg'] or 0) * cantidad
        unidades[clave] += cantidad
        pedidos[clave] += 1

    def promedio(clave):
        return round(suma[clave] / unidades[clave], 2) if unidades[clave] else None

    def nombre_categoria(cid):
        c = categorias.get(cid, {})
        return f"{c.get('actividad', '?')} · {c.get('nombre', '?')}"

    # 1. Artículos del catálogo con suficientes pedidos
    print(f"{'Categoría':<32} {'Artículo':<34} {'Catálogo':>9} {'Real':>9} {'Pedidos':>8}")
    print('-' * 96)
    cambios = []
    en_catalogo = set()
    for item in sorted(catalogo, key=lambda x: (nombre_categoria(x['categoria_id']), x['nombre'])):
        clave = (item['categoria_id'], item['nombre'].strip().lower())
        en_catalogo.add(clave)
        if pedidos[clave] < args.minimo:
            continue
        real = promedio(clave)
        actual = float(item['peso_kg'])
        marca = '  <- ajustar' if abs(real - actual) >= 0.5 else ''
        print(f"{nombre_categoria(item['categoria_id']):<32} {item['nombre']:<34} {actual:>7.2f}kg {real:>7.2f}kg {pedidos[clave]:>8}{marca}")
        if marca:
            cambios.append((item, real))

    if not cambios:
        print(f'\nNingún artículo necesita ajuste (con al menos {args.minimo} pedidos y 0.5 kg de diferencia).')

    # 2. Artículos escritos a mano que se repiten (no están en el catálogo)
    nuevos = [(k, promedio(k)) for k in pedidos if k not in en_catalogo and pedidos[k] >= args.minimo]
    if nuevos:
        print('\nArtículos escritos a mano que se repiten (no están en el catálogo):')
        for (cid, nombre), real in nuevos:
            print(f'  {nombre_categoria(cid)} · {nombre}: {real} kg ({pedidos[(cid, nombre)]} pedidos)')

    # 3. Guardar
    if args.aplicar and cambios:
        for item, real in cambios:
            db.modificar('articulos_catalogo', f"id=eq.{item['id']}", {'peso_kg': real})
        print(f'\n✔ {len(cambios)} pesos promedio actualizados en el catálogo.')
    elif cambios:
        print('\nPara guardar estos promedios: python python/pesos_promedio.py --aplicar')

    if args.agregar and nuevos:
        for (cid, nombre), real in nuevos:
            db.agregar('articulos_catalogo', {'categoria_id': cid, 'nombre': nombre.capitalize(), 'peso_kg': real})
        print(f'✔ {len(nuevos)} artículos agregados al catálogo.')
    elif nuevos:
        print('Para agregarlos al catálogo: python python/pesos_promedio.py --agregar')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:  # mensaje claro en vez del detalle técnico
        print(f'No se pudo completar: {error}', file=sys.stderr)
        sys.exit(1)
