"""
==================================================
CALCULADORA DE PRECIOS DEL ENVÍO
ACACHETE LOGISTICS

Calcula cuánto cuesta un envío según su PESO con una tarifa de
Configuración -> Pedidos -> Tarifas:

    envío = cargo fijo + mínimo + kg adicionales × precio por kg
                                + km adicionales × precio por km
    kg adicionales = peso - kg que cubre el mínimo   (si da negativo, 0)
    km adicionales = km   - km que cubre el mínimo   (si da negativo, 0)
    gratis si el monto de la compra llega a "envío gratis desde"

Dicho en palabras (así lo muestra la calculadora):
    Hasta 2 kg      -> ₡2500 (precio base)
    Más de 2 kg     -> ₡2500 + ₡500 por cada kg sobre los 2 kg

Ejemplo (mínimo ₡2500 cubre 2 kg, ₡500 por kg adicional):
    1.5 kg -> ₡2500          (lo cubre el mínimo)
    4 kg   -> ₡2500 + 2 × ₡500 = ₡3500
    8 kg   -> ₡2500 + 6 × ₡500 = ₡5500

Dónde se usa (sin servidores):
  1. En la página: Configuración -> Pedidos -> "Calculadora de precios".
     Python corre DENTRO del navegador (Pyodide, js/componentes.js).
  2. En VS Code, para probar precios antes de guardarlos:
         python python/tarifas.py
     (pregunta los valores de la tarifa y muestra la tabla).

Es la misma fórmula que usan Pedidos, el Cotizador y Configuración
(calcularEnvioTarifa en js/componentes.js). Si se cambia una, cambiar la otra.
No necesita instalar nada: solo Python 3.
==================================================
"""

import json
import sys


def _numero(valor, por_defecto=0.0):
    """Convierte a número; vacío o None -> por_defecto."""
    if valor is None or valor == '':
        return por_defecto
    return float(valor)


def calcular_envio(tarifa, peso_kg, monto_compra=0.0, km=0.0):
    """
    Costo del envío de UN pedido.
      tarifa: dict con cargo_fijo, minimo, kg_incluidos, precio_kg,
              precio_km y envio_gratis_desde (None = nunca gratis)
      peso_kg: peso total del pedido
      monto_compra: lo que compró el cliente (solo entregas de tienda)
      km: distancia por calle de A a B (mapa del pedido / cotizador; 0 = sin distancia)
    Devuelve un dict con el desglose y el total ("envio").
    """
    cargo_fijo = _numero(tarifa.get('cargo_fijo'))
    minimo = _numero(tarifa.get('minimo'))
    kg_incluidos = _numero(tarifa.get('kg_incluidos'))
    precio_kg = _numero(tarifa.get('precio_kg'))
    precio_km = _numero(tarifa.get('precio_km'))
    km_incluidos = _numero(tarifa.get('km_incluidos'))
    gratis_desde = tarifa.get('envio_gratis_desde')
    gratis_desde = None if gratis_desde in (None, '') else float(gratis_desde)

    kg_adicional = round(max(0.0, peso_kg - kg_incluidos), 2)
    monto_kg = round(kg_adicional * precio_kg, 2)
    # Distancia: el mínimo cubre hasta km_incluidos; los km de más se cobran
    km_adicional = round(max(0.0, km - km_incluidos), 2)
    monto_km = round(km_adicional * precio_km, 2)
    bruto = round(cargo_fijo + minimo + monto_kg + monto_km, 2)
    gratis = gratis_desde is not None and monto_compra > 0 and monto_compra >= gratis_desde

    return {
        'peso_kg': round(peso_kg, 2),
        # 'base': lo que vale cualquier peso dentro de lo que cubre el mínimo
        'base': round(cargo_fijo + minimo, 2),
        # 'tramo': 'base' = lo cubre el mínimo | 'adicional' = paga kg adicionales
        'tramo': 'adicional' if kg_adicional > 0 and precio_kg > 0 else 'base',
        'cargo_fijo': cargo_fijo,
        'minimo': minimo,
        'kg_incluidos': kg_incluidos,
        'kg_adicional': kg_adicional,
        'precio_kg': precio_kg,
        'monto_kg': monto_kg,
        'km': round(km, 2),
        'km_incluidos': km_incluidos,
        'km_adicional': km_adicional,
        'monto_km': monto_km,
        'bruto': bruto,
        'gratis': gratis,
        'envio': 0.0 if gratis else bruto,
    }


def tabla_precios(tarifa, desde=1.0, hasta=20.0, paso=1.0, monto_compra=0.0, km=0.0):
    """Precio del envío para cada peso, de 'desde' a 'hasta' cada 'paso' kg (con 'km' de distancia)."""
    return [calcular_envio(tarifa, peso, monto_compra, km) for peso in _serie(desde, hasta, paso)]


def resumen_tarifa(tarifa):
    """
    La tarifa en pocas reglas, para explicarla en palabras:
      base          -> lo que vale un envío hasta 'kg_incluidos' kg (cargo fijo + mínimo)
      kg_incluidos  -> hasta cuántos kg vale la base
      precio_kg     -> cuánto se suma por cada kg después de 'kg_incluidos'
      precio_km     -> cuánto se suma por km (0 = no cobra distancia)
      gratis_desde  -> compra desde la que el envío es gratis (None = nunca)
      ejemplo       -> un peso que ya paga kg adicionales, calculado
    """
    kg_incluidos = _numero(tarifa.get('kg_incluidos'))
    gratis_desde = tarifa.get('envio_gratis_desde')
    return {
        'base': round(_numero(tarifa.get('cargo_fijo')) + _numero(tarifa.get('minimo')), 2),
        'kg_incluidos': kg_incluidos,
        'precio_kg': _numero(tarifa.get('precio_kg')),
        'precio_km': _numero(tarifa.get('precio_km')),
        'km_incluidos': _numero(tarifa.get('km_incluidos')),
        'gratis_desde': None if gratis_desde in (None, '') else float(gratis_desde),
        'ejemplo': calcular_envio(tarifa, kg_incluidos + 2),
    }


def tabla_precios_json(tarifa_json, desde, hasta, paso, monto_compra=0.0):
    """Igual que tabla_precios, pero recibe y devuelve JSON (la usa la página)."""
    tarifa = json.loads(tarifa_json)
    return json.dumps(tabla_precios(tarifa, float(desde), float(hasta), float(paso), float(monto_compra)))


def _serie(desde, hasta, paso):
    """Números de 'desde' a 'hasta' cada 'paso' (ej. 0, 5, 10, 15, 20)."""
    if paso <= 0:
        raise ValueError('El paso debe ser mayor que 0.')
    valores = []
    i = 0
    while True:
        v = round(desde + i * paso, 2)
        if v > hasta + 1e-9:
            break
        valores.append(v)
        i += 1
    return valores


def matriz_precios(tarifa, pesos, kms, monto_compra=0.0):
    """
    Precio del envío para cada PESO (filas) y cada DISTANCIA en km (columnas).
    Devuelve una fila por peso:
      { peso_kg, tramo, kg_adicional, gratis, precios: [envío con cada km] }
    """
    filas = []
    for peso in pesos:
        con_cada_km = [calcular_envio(tarifa, peso, monto_compra, km) for km in kms]
        primero = con_cada_km[0]
        filas.append({
            'peso_kg': primero['peso_kg'],
            'tramo': primero['tramo'],
            'kg_adicional': primero['kg_adicional'],
            'gratis': primero['gratis'],
            'precios': [c['envio'] for c in con_cada_km],
        })
    return filas


def matriz_precios_json(tarifa_json, peso_desde, peso_hasta, peso_cada, km_desde, km_hasta, km_cada, monto_compra=0.0):
    """
    La usa la página (Configuración -> Pedidos -> Simulador de precios).
    Devuelve JSON: { pesos, kms, filas } (ver matriz_precios).
    """
    tarifa = json.loads(tarifa_json)
    pesos = _serie(float(peso_desde), float(peso_hasta), float(peso_cada))
    kms = _serie(float(km_desde), float(km_hasta), float(km_cada))
    return json.dumps({'pesos': pesos, 'kms': kms, 'filas': matriz_precios(tarifa, pesos, kms, float(monto_compra))})


# --------------------------------------------------
# Uso desde VS Code:  python python/tarifas.py
# (no se ejecuta dentro del navegador)
# --------------------------------------------------

def _preguntar(texto, por_defecto):
    respuesta = input(f'{texto} [{por_defecto}]: ').strip()
    return float(respuesta) if respuesta else float(por_defecto)


def _principal():
    print('Calculadora de precios del envío (misma fórmula que el sistema)\n')
    tarifa = {
        'cargo_fijo': _preguntar('Envío fijo (₡)', 0),
        'minimo': _preguntar('Mínimo (₡)', 2500),
        'kg_incluidos': _preguntar('Kg que cubre el mínimo', 2),
        'precio_kg': _preguntar('Precio por kg adicional (₡)', 500),
        'precio_km': _preguntar('Precio por km adicional (₡, 0 = no cobra distancia)', 0),
    }
    tarifa['km_incluidos'] = _preguntar('Km que cubre el mínimo', 0) if tarifa['precio_km'] > 0 else 0.0
    gratis = input('Envío gratis desde (₡ de compra, vacío = nunca): ').strip()
    tarifa['envio_gratis_desde'] = float(gratis) if gratis else None
    desde = _preguntar('Desde (kg)', 1)
    hasta = _preguntar('Hasta (kg)', 20)
    paso = _preguntar('Cada (kg)', 1)
    monto = _preguntar('Monto de la compra (₡)', 0)
    km = _preguntar('Distancia del envío (km)', 0) if tarifa['precio_km'] > 0 else 0.0

    # La tarifa en palabras
    r = resumen_tarifa(tarifa)
    kg = f"{r['kg_incluidos']:g}"
    print('\nLa tarifa en palabras:')
    if r['precio_kg'] <= 0:
        print(f"  Cualquier peso: ₡{r['base']:,.2f}")
    elif r['kg_incluidos'] <= 0:
        print(f"  Base ₡{r['base']:,.2f} + ₡{r['precio_kg']:,.2f} por cada kg")
    else:
        print(f"  Hasta {kg} kg:  ₡{r['base']:,.2f}")
        print(f"  Más de {kg} kg: ₡{r['base']:,.2f} + ₡{r['precio_kg']:,.2f} por cada kg sobre los {kg} kg")
        e = r['ejemplo']
        print(f"  Ejemplo: {e['peso_kg']:g} kg = ₡{r['base']:,.2f} + {e['kg_adicional']:g} × ₡{r['precio_kg']:,.2f}"
              f" = ₡{e['envio']:,.2f}")
    if r['precio_km'] > 0:
        incluidos = f" sobre los {r['km_incluidos']:g} km" if r['km_incluidos'] > 0 else ''
        extra = max(0.0, km - r['km_incluidos'])
        print(f"  Distancia: + ₡{r['precio_km']:,.2f} por cada km{incluidos}"
              f" (en esta tabla: {km:g} km = + ₡{extra * r['precio_km']:,.2f})")
    if r['gratis_desde'] is not None:
        print(f"  Envío gratis con compras desde ₡{r['gratis_desde']:,.2f}")

    print()
    print(f"{'Peso':>8} | {'Cómo se calcula':<34} | {'Envío':>12}")
    print('-' * 62)
    for fila in tabla_precios(tarifa, desde, hasta, paso, monto, km):
        envio = 'Gratis' if fila['gratis'] else f"₡{fila['envio']:,.2f}"
        if fila['tramo'] == 'base':
            como = f"precio base (hasta {kg} kg)"
        else:
            como = f"base + {fila['kg_adicional']:g} kg × ₡{fila['precio_kg']:,.0f}"
        if fila['monto_km']:
            como += f" + {fila['km_adicional']:g} km adic."
        print(f"{fila['peso_kg']:>6g} kg | {como:<34} | {envio:>12}")


if __name__ == '__main__' and sys.platform != 'emscripten':
    _principal()
