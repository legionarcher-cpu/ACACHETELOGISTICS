-- 15 de 17 · sql/00_instalacion_completa.sql · Entrega: foto del comprobante de pago (efectivo, voucher o SINPE) (secciones 30 a 30).
-- Generado por herramientas\dividir_sql.ps1: NO editar aquí (se edita el original).
-- Ejecutar los archivos EN ORDEN (1, 2, 3...), cada uno con Run en el SQL Editor de Supabase.

-- ==================================================
-- 30. ENTREGA: FOTO DEL COMPROBANTE DE PAGO (sql/01 bloque 37)
--   Al marcar "Entregado", además de las fotos de lo entregado (tipo 'entrega'), el piloto
--   puede tomar la foto del COMPROBANTE DE PAGO (tipo 'pago'): el efectivo recibido, el
--   voucher de la tarjeta o el comprobante de SINPE Móvil. La caja lo muestra al lado del
--   cobro para verificar el SINPE. Se guardan en pedido_evidencias (Storage evidencias/pago/).
--   Se puede repetir.
-- ==================================================

alter table public.pedido_evidencias drop constraint if exists evidencias_tipo_valido;
alter table public.pedido_evidencias add constraint evidencias_tipo_valido
    check (tipo in ('entrega', 'mal_estado', 'retraso', 'recepcion', 'carga', 'pago'));

create index if not exists pedido_evidencias_tipo_idx on public.pedido_evidencias (pedido_id, tipo);

notify pgrst, 'reload schema';

