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

/* Corte hacia un lote que YA existe: el vino de los origenes se suma a ese
 * lote y no se crea ninguno. Puede ser uno de los origenes (pedido 2026-10-27:
 * un corte de varias anadas que conserva el lote de una de ellas): pasa con un
 * aviso. Al confirmar, ese lote se vacia como origen y recibe el tanque como
 * lote del corte (ver proponer en propuesta-ot.js). */
export function validarLoteExistente(texto, lotes, origenes){
  const t = String(texto ?? '').trim();
  if (!t) return { ok: false, error: 'Escribí el número del lote existente.' };
  const ficha = (lotes || []).find(l => String(l.lote) === t);
  if (!ficha) return { ok: false, error: `El lote ${t} no existe.` };
  if ((origenes || []).some(o => String(o) === t))
    return { ok: true, valor: t, ficha,
             aviso: `El lote ${t} también es uno de los lotes de origen del corte: el vino de los demás se suma a él.` };
  return { ok: true, valor: t, ficha };
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
  // Lote recien nacido: todavia no tiene vino, no hereda la vasija del padre.
  l.vasija_actual = '';
  return l;
}

/* El lote_corte que guarda la OT al editarla. ✎ Editar abre siempre en modo
 * 'existente' (el lote ya esta en Lotes), pero si es el MISMO lote que esta OT
 * habia creado, sigue siendo creado por ella: sin `existente`, para que borrar
 * la OT lo siga nombrando y el aviso de "sigue en la lista" siga saliendo. */
export function loteCorteDeEdicion(existente, v, previo, idTextoNuevo){
  if (!existente) return { lote: String(v.valor), id_texto: idTextoNuevo || '' };
  const out = { lote: String(v.valor), id_texto: (v.ficha && v.ficha.id_texto) || '' };
  const creadoPorLaOT = !!previo && !previo.existente && String(previo.lote) === String(v.valor);
  if (!creadoPorLaOT) out.existente = true;
  return out;
}
