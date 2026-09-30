/* ===== Lotes CIW — los pasos propios de UNA orden de trabajo (puro) =====
 *
 * La hoja de una OT sale de los bloques de su plantilla (ot-plantillas.js).
 * Si el usuario cambia los textos de los pasos de ESA orden, la OT se guarda su
 * propia copia en ot.bloques y desde ahi la hoja usa la copia. La copia se crea
 * recien en la primera edicion: una OT que nunca se toco no suma nada al
 * documento (que ya pesa ~1,6 MB y el plan Free corta a 10 ms de CPU).
 *
 * Una copia entera y no "diferencias por renglon": insertar o quitar un paso
 * corre los indices, y una diferencia guardada caeria en el paso equivocado.
 *
 * Solo se editan los bloques de texto (paso, dato). Las tablas, los ID y el
 * rotular salen de los datos de la OT: no se editan ni se quitan.
 *
 * Nunca muta PLANTILLAS_OT. */
'use strict';

import { plantillaPorId } from './ot-plantillas.js';
import { esEjecutado } from './ot-movimientos.js';

export const TIPOS_TEXTO = new Set(['paso', 'dato']);

export function bloquesDeOT(ot){
  if (ot && Array.isArray(ot.bloques)) return ot.bloques;
  const pl = plantillaPorId(ot && ot.plantilla);
  return pl ? pl.bloques : [];
}

export function tieneTextosPropios(ot){
  return !!ot && Array.isArray(ot.bloques);
}

// Una OT confirmada es registro de calidad: se ve e imprime, no se toca.
export function esEditable(ot){
  return !!ot && !esEjecutado(ot) && bloquesDeOT(ot).length > 0;
}

function propios(ot){
  if (!Array.isArray(ot.bloques)) ot.bloques = structuredClone(bloquesDeOT(ot));
  return ot.bloques;
}

const esTexto = b => !!b && TIPOS_TEXTO.has(b.tipo);

export function editarTexto(ot, i, texto){
  const b = bloquesDeOT(ot)[i];
  const nuevo = String(texto ?? '');
  if (!esTexto(b) || b.texto === nuevo) return false;
  propios(ot)[i].texto = nuevo;
  return true;
}

export function insertarPaso(ot, i){
  const bs = propios(ot);
  const j = Math.min(Math.max(Number(i) + 1, 0), bs.length);
  bs.splice(j, 0, { tipo: 'paso', texto: '' });
  return j;
}

export function quitarBloque(ot, i){
  if (!esTexto(bloquesDeOT(ot)[i])) return false;
  propios(ot).splice(i, 1);
  return true;
}

export function volverAPlantilla(ot){
  if (!tieneTextosPropios(ot)) return false;
  delete ot.bloques;
  return true;
}
