/* ===== Lotes CIW — la cuenta de la correccion de SO2 =====
 *
 * Modulo puro. La usan la calculadora de la pestaña Correcciones y el panel de
 * correcciones al lado de la hoja de la OT: una sola copia de la formula. */
'use strict';

/**
 * Calcula la corrección de SO2.
 * Fórmulas replicadas exactas desde motor_fml.py / Global Constraints.
 * @param {number|null} actual   SO2 libre actual (mg/L)
 * @param {number|null} deseado  SO2 libre deseado (mg/L)
 * @param {number|null} litros   Litros en vasija
 * @param {number|null} ph       pH (para SO2 molecular)
 * @returns {{ diferencia, mbk_a_agregar, ml_exactos, so2_molecular }|null}
 */
export function calcCorreccionSO2(actual, deseado, litros, ph){
  if (actual == null || deseado == null || litros == null) return null;
  const diferencia     = deseado - actual;
  const mbk_a_agregar  = ((diferencia * litros * 1.5) / 1000) * 2;
  const ml_exactos     = (diferencia * litros * 1.5) / 55;
  const so2_molecular  = (ph != null) ? (actual / (1 + Math.pow(10, ph - 1.8))) : null;
  return { diferencia, mbk_a_agregar, ml_exactos, so2_molecular };
}

/** El ultimo SO2 libre y el ultimo pH medidos del lote (cada uno por su lado;
 *  -999 es "sin dato"). El lote se compara como texto. */
export function ultimoSo2Ph(analisis, lote){
  const L = String(lote ?? '');
  const delLote = (analisis || [])
    .filter(a => String(a.lote ?? '') === L && a.fecha_analisis)
    .sort((a, b) => (b.fecha_analisis || '') > (a.fecha_analisis || '') ? 1 : -1);
  let so2 = null, ph = null;
  for (const a of delLote){
    if (so2 == null && a.so2_libre != null && a.so2_libre !== -999) so2 = a.so2_libre;
    if (ph  == null && a.ph        != null && a.ph        !== -999) ph  = a.ph;
    if (so2 != null && ph != null) break;
  }
  return { so2, ph };
}
