/* ===== Lotes CIW — el lote nuevo que crea la OT de Corte (modulo puro) =====
 *
 * La OT de Corte junta varios lotes en un tanque y forma un lote que todavia
 * no existe: el asistente de vista-ot-corte.js lo pregunta de a un dato y lo
 * crea junto con la orden. Aca vive la parte sin DOM, para testearla.
 *
 * Reusa las preguntas y la validacion de "Nuevo lote" (lote-nuevo.js) para que
 * las dos pantallas no se desfasen. */
'use strict';

import { PASOS, validarNumeroLote } from './lote-nuevo.js';

/* Lo que se pregunta despues del numero de lote. La descripcion va primero
 * porque es el ID que sale en la banda, el ID y el rotulo de la hoja (0867):
 * en un corte casi nunca es la del lote de origen. */
export const PASOS_LOTE_CORTE = [
  { k: 'id_texto', label: 'Descripción del corte (el ID que va en la hoja y el rótulo)' },
  ...PASOS.filter(p => p.k !== 'lote'),
];

/* Numero nuevo, como en Nuevo lote, y ademas distinto de los lotes de origen:
 * un lote no se puede cortar consigo mismo. */
export function validarLoteDelCorte(texto, lotes, origenes){
  const v = validarNumeroLote(texto, lotes);
  if (!v.ok) return v;
  if ((origenes || []).some(o => String(o) === String(v.valor)))
    return { ok: false, error: `El lote ${v.valor} es uno de los lotes de origen del corte.` };
  return v;
}

/* Los valores con que arranca cada pregunta, sacados de la base (un lote en
 * blanco o armarHijo del padre elegido). El origen es Vino si no dice otra
 * cosa: un corte siempre sale de vino ya hecho. */
export function valoresIniciales(base){
  const vals = {};
  for (const p of PASOS_LOTE_CORTE) vals[p.k] = String((base || {})[p.k] ?? '');
  if (!vals.origen) vals.origen = 'Vino';
  return vals;
}

/* El lote que se guarda: la base con las respuestas encima y el numero ya
 * validado. Devuelve una copia: la base se sigue usando si el usuario vuelve
 * atras y cambia de padre. */
export function armarLoteDelCorte(base, vals, valor){
  const l = { ...base };
  for (const p of PASOS_LOTE_CORTE) if (p.k in (vals || {})) l[p.k] = vals[p.k];
  l.lote = valor;
  return l;
}
