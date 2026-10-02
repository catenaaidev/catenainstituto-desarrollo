/**
 * Desglose de envases de un lote — port de motor_envases.py.
 *
 * Invariante del subsistema:
 *   litros_actuales = 50·cap50 + 200·cap200 + 225·cap225 + 500·cap500 + vasija_grande
 *   … menos lo que les falta a las barricas mermas pendientes del lote
 *   (DATOS().mermas, ver mermas.js). Con 0 mermas es exactamente esta suma.
 *
 * OJO CON LA ASIMETRÍA: los cuatro capNNN son CANTIDADES de envases, mientras
 * que vasija_grande son LITROS directos. Por eso vasija_grande no está en
 * CAPACIDADES: si estuviera, se multiplicaría por una capacidad y daría un
 * número absurdo.
 */

import { num } from './fml-condiciones';

/** Orden descendente de capacidad, igual que en js/envases.js. */
const CAPACIDADES: [string, number][] = [
  ['cap500', 500],
  ['cap225', 225],
  ['cap200', 200],
  ['cap50', 50],
];

/**
 * Número positivo finito, o 0. null, '', negativos, NaN e infinito valen 0.
 *
 * Deliberadamente indulgente: estos campos vienen de una migración de Excel y
 * un valor raro no tiene que hacer explotar un reporte. La validación de lo que
 * el usuario tipea vive en el front, no acá.
 */
function n0(x: unknown): number {
  // num() es el parser compartido: acepta la coma decimal ("1500,5" de
  // vasija_grande valia 0) y trata la celda vacia como sin dato.
  const v = num(x);
  return v !== null && v > 0 ? v : 0;
}

/** Litros que suman los envases del lote. */
export function litrosDeEnvases(lote: Record<string, unknown> | null | undefined): number {
  if (!lote) return 0;
  let total = 0;
  for (const [clave, cap] of CAPACIDADES) total += n0(lote[clave]) * cap;
  return total + n0(lote.vasija_grande);
}
