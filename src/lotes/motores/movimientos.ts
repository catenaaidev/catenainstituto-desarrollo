/**
 * Estado de ejecución de un movimiento — port de motor_movimientos.py.
 *
 * Un movimiento nace `pendiente` cuando se emite su orden de trabajo, y pasa a
 * `ejecutado` cuando alguien confirma que el trabajo se hizo. Los pendientes
 * son planes, no hechos: no cuentan para etapas ni para linaje.
 *
 * El default es lo que hace que no haga falta migración: los movimientos ya
 * cargados no tienen la clave `estado` y son hechos consumados, así que la
 * ausencia de la clave TIENE que significar ejecutado.
 */

export const PENDIENTE = 'pendiente';
export const EJECUTADO = 'ejecutado';

/**
 * Estados que NO son un hecho consumado. La lista es de negación a propósito:
 * un valor inesperado (un typo en datos.json) cae del lado de "ejecutado",
 * porque ignorar un movimiento REAL corrompe la etapa y el linaje en silencio,
 * mientras que contar de más un plan solo produce un número raro que alguien ve.
 *
 * CUALQUIER estado nuevo que no sea un hecho consumado (cancelado, anulado,
 * rechazado) va ACÁ, o va a contar como ejecutado.
 */
export const NO_EJECUTADOS: ReadonlySet<string> = new Set([PENDIENTE]);

/**
 * ¿El movimiento ya se hizo? Único lugar donde vive el default: nadie compara
 * el string a mano.
 */
export function esEjecutado(mov: Record<string, unknown> | null | undefined): boolean {
  const estado = (mov ?? {}).estado;
  if (!estado) return true;
  return !NO_EJECUTADOS.has(String(estado));
}

/** Solo los movimientos que ya se hicieron. */
export function movimientosEjecutados<T extends Record<string, unknown>>(
  movimientos: T[] | null | undefined,
): T[] {
  return (movimientos ?? []).filter(esEjecutado);
}
