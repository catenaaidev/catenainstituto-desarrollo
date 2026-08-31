/* ===== Lotes CIW — orden de trabajo de un movimiento (modulo puro) =====
 *
 * OJO con el nombre: js/orden-filas.js es de la ORDEN DE MUESTRAS, que es de
 * laboratorio. Este es de las ORDENES DE TRABAJO de movimientos, que son de
 * operarios de bodega. Son dos documentos distintos.
 */
'use strict';

export const PENDIENTE = 'pendiente';
export const EJECUTADO = 'ejecutado';

// Estados que NO son un hecho consumado. La lista es de negacion a proposito:
// un valor inesperado (un typo en datos.json) cae del lado de "ejecutado",
// porque ignorar un movimiento real corrompe la etapa y el linaje en silencio,
// y contar de mas un plan solo produce un numero raro que alguien ve.
// CUALQUIER estado nuevo que no sea un hecho consumado (cancelado, anulado,
// rechazado) va ACA, o va a contar como ejecutado.
export const NO_EJECUTADOS = new Set([PENDIENTE]);

/* Espejo de motor_movimientos.es_ejecutado. Un movimiento sin `estado` es
 * ejecutado: los 338 historicos no tienen la clave y son hechos consumados.
 * Un valor inesperado tambien cuenta como ejecutado, igual que en Python:
 * ignorar un movimiento real corrompe la etapa y el linaje en silencio. */
export function esEjecutado(mov){
  const estado = (mov || {}).estado;
  if (!estado) return true;
  return !NO_EJECUTADOS.has(estado);
}

/* Siguiente numero de OT libre para el anio, con formato OT-<anio>-<NNN>.
 *
 * Se calcula del maximo existente en los movimientos y NO de un contador
 * guardado aparte: un contador se puede desincronizar de los datos (por un
 * borrado, un undo, una edicion a mano de datos.json) y despues emite numeros
 * repetidos sin que nadie se entere.
 *
 * Los `ot` con formato ajeno se ignoran en vez de romper: el campo es de texto
 * libre y editable, asi que puede tener cualquier cosa. */
export function proximoNumeroOT(movimientos, anio){
  const prefijo = `OT-${anio}-`;
  let max = 0;
  for (const m of (movimientos || [])){
    const ot = String((m || {}).ot ?? '').trim();
    if (!ot.startsWith(prefijo)) continue;
    const n = parseInt(ot.slice(prefijo.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return prefijo + String(max + 1).padStart(3, '0');
}
