# 9. Python (sin servidores)

Python se usa de dos formas, sin servidores propios:

| Dónde corre | Cómo | Necesita |
|---|---|---|
| **En el navegador** | Pyodide (Python dentro de la página), se descarga la primera vez | Internet y abrir con Live Server. No hay que instalar nada |
| **En VS Code** | Terminal: `python python/<archivo>.py` | Python 3 instalado (python.org). Solo librería estándar |

## Archivos (`python/`)

| Archivo | Dónde | Qué hace |
|---|---|---|
| `tarifas.py` | Navegador y VS Code | Precio del envío por peso: mínimo + kg adicionales después del mínimo (+ km), envío gratis. `matriz_precios_json` (la usa el **Simulador de precios** de Configuración → Pedidos: precio para cada peso × cada distancia en km; cada fila con su `tramo`: `base` o `adicional`). También `tabla_precios` y `resumen_tarifa`. En VS Code pregunta los valores (incluidos precio por km y distancia) y muestra la tarifa en palabras y la tabla |
| `pesos_promedio.py` | VS Code | Compara los pesos promedio del catálogo con los pesos reales de los pedidos. `--aplicar` guarda, `--agregar` suma artículos nuevos repetidos, `--minimo N` pedidos mínimos (5 por defecto) |
| `empresa_activa.py` | (ayuda) | Lee la empresa activa y su conexión, y consulta Supabase (REST) con `urllib` |

Agregar o cambiar empresas (marcas) ya no es un script de Python: `herramientas\empresas.bat` (PowerShell, no
necesita instalar nada). Ver [02-empresa-nueva.md](02-empresa-nueva.md).

## Python en la página

```js
const py = await cargarPython('python/tarifas.py');           // js/componentes.js
const texto = py.globals.get('tabla_precios_json')(JSON.stringify(tarifa), 1, 20, 1, 0);
const tabla = JSON.parse(texto);
```

- `cargarPython(ruta)` descarga Pyodide una vez (`PYODIDE_URL`) y ejecuta el archivo una vez.
- Pasar y recibir datos como **JSON** (texto): evita conversiones raras entre JS y Python.
- El bloque de uso en terminal de cada script va dentro de
  `if __name__ == '__main__' and sys.platform != 'emscripten':` para que no se ejecute en el navegador.

## Reglas

- **La fórmula del envío existe dos veces:** `python/tarifas.py` y `calcularEnvioTarifa` en
  `js/componentes.js` (la usan Pedidos, el Cotizador y Configuración), las dos con peso **y km**.
  Si cambia una, cambiar la otra.
- Los scripts de VS Code se conectan a la base de la **empresa activa** con la clave pública (`anon`).
  Nunca poner la clave `service_role` en el proyecto.
- Ejecutarlos desde la carpeta raíz del proyecto.

## Ideas para más adelante

Importar pedidos desde Excel (botón "Cargar Pedidos"), rutas óptimas con Google Maps, reportes
programados, WhatsApp automático. Algunas sí necesitarían un servicio aparte (ver la sección 32 de
`PROPUESTA-ESTRUCTURADA-V2.md`).
