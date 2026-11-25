/* ===== Lotes que la Orden de correccion deja afuera, sumables a mano =====
 *
 * Pedido 2026-11-02: a veces hay que corregir un lote que ya esta en objetivo,
 * o uno corregido hace poco (los que la orden esconde 30 dias). El servidor los
 * manda en orden.activables con el mismo detalle que orden.lotes; un boton de
 * la pantalla los suma de forma temporal: aparecen en "Fuera de esta orden",
 * se tildan los que se quieren y se apaga solo al imprimir o al Recargar.
 *
 * Modulo puro: sin DOM ni estado, para poder testearlo. */
'use strict';

/** Como se nombra en pantalla y en el Registro por que el lote estaba afuera. */
export const ETIQUETA_FUERA = {
  en_objetivo: 'en objetivo',
  corregido: 'corregido hace poco',
};

/** Los activables que manda el servidor (lista vacia si no hay). */
export function activablesDe(orden){
  return (orden && Array.isArray(orden.activables)) ? orden.activables : [];
}

/** La orden que ve la pantalla: con el boton prendido, los activables van al
 *  final de orden.lotes (el orden por urgencia del servidor no los mezcla con
 *  los que si necesitan SO2). Apagado, la orden tal cual. No toca la original. */
export function ordenConActivables(orden, activo){
  if (!orden || !activo) return orden;
  const extra = activablesDe(orden);
  if (!extra.length) return orden;
  return { ...orden, lotes: [...(orden.lotes || []), ...extra] };
}

/** Diferencia con la que se dosifica: nunca negativa. Un lote en objetivo
 *  tiene objetivo <= SO2 actual y daria dosis negativas. */
export function diferenciaDosificable(objetivo, so2){
  const d = objetivo - so2;
  return Number.isFinite(d) && d > 0 ? d : 0;
}
