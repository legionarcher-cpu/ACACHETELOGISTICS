# Actualizaciones

Un archivo por cambio, con fecha: `AAAA-MM-DD_tema.sql` (ej. `2026-11-05_tarifa_recoleccion.sql`).

- Es lo **único** que se ejecuta en una base que ya está instalada.
- Cada archivo se puede ejecutar dos veces sin dañar nada (`if not exists`, `or replace`, `drop ... if exists`).
- El mismo cambio se hace también en el módulo de `../instalacion/` que corresponde.

Todavía no hay ninguno: la base se instala desde cero con `../instalacion/`.
