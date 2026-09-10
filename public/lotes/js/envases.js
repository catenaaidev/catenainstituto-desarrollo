/* ===== Lotes CIW — desglose de envases de un lote (subsistema H) =====
 *
 * Modulo PURO: sin DOM y sin imports. Lo importa tests/grilla.test.html, que
 * solo puede cargar modulos que no toquen el documento.
 *
 * Invariante del subsistema:
 *   litros_actuales = 50*cap50 + 200*cap200 + 225*cap225 + 500*cap500 + vasija_grande
 *
 * OJO CON LA ASIMETRIA: los cuatro capNNN son CANTIDADES de envases, mientras
 * que vasija_grande son LITROS directos. Por eso vasija_grande NO esta en
 * CAPACIDADES: si estuviera, se multiplicaria por una capacidad y daria un
 * numero absurdo. El espejo Python (motor_envases.py) tiene la misma nota.
 */
'use strict';

/* Orden DESCENDENTE de capacidad. resumenEnvases y tiposDeEnvase recorren este
   array en orden, y de ahi sale que su salida sea determinista y no dependa del
   orden de las claves del objeto lote. */
export const CAPACIDADES = [
  { k: 'cap500', cap: 500 },
  { k: 'cap225', cap: 225 },
  { k: 'cap200', cap: 200 },
  { k: 'cap50',  cap: 50  },
];

/* Numero positivo, o 0. null, undefined, '', negativos y basura valen 0.
 * Es deliberadamente indulgente: estos campos vienen de una migracion de Excel
 * y un valor raro no tiene que hacer explotar el render de la tabla. La
 * validacion de lo que el usuario tipea vive en el overlay, no aca. */
export function numPositivo(x){
  if (x == null || x === '') return 0;
  const v = Number(x);
  return (isFinite(v) && v > 0) ? v : 0;
}
/* Alias corto para el uso interno del modulo, que lo repite en cada formula. */
const n0 = numPositivo;

/** Litros que suman los envases del lote. */
export function litrosDeEnvases(lote){
  if (!lote) return 0;
  let t = 0;
  for (const c of CAPACIDADES) t += n0(lote[c.k]) * c.cap;
  return t + n0(lote.vasija_grande);
}

/** Resumen legible: '2×225 + 1×50', 'grande 3500', '2×225 + grande 1500', ''.
 *  Sin separador de miles, para que copiar la celda y pegarla en Excel de un
 *  texto limpio. */
export function resumenEnvases(lote){
  if (!lote) return '';
  const partes = [];
  for (const c of CAPACIDADES){
    const n = n0(lote[c.k]);
    if (n > 0) partes.push(n + '×' + c.cap);
  }
  const g = n0(lote.vasija_grande);
  if (g > 0) partes.push('grande ' + g);
  return partes.join(' + ');
}

/** Cantidad de envases del lote. El tanque cuenta como 1, sean 1500 o 7500 L. */
export function contarEnvases(lote){
  if (!lote) return 0;
  let n = 0;
  for (const c of CAPACIDADES) n += n0(lote[c.k]);
  return n + (n0(lote.vasija_grande) > 0 ? 1 : 0);
}

/** Claves de los tipos de envase presentes, p. ej. ['cap225','cap50'].
 *  El tanque aparece como 'vasija_grande' y siempre al final. Lo usa el filtro
 *  de la pestaña Lotes. */
export function tiposDeEnvase(lote){
  if (!lote) return [];
  const out = [];
  for (const c of CAPACIDADES) if (n0(lote[c.k]) > 0) out.push(c.k);
  if (n0(lote.vasija_grande) > 0) out.push('vasija_grande');
  return out;
}
