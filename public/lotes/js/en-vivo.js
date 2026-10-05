/* ===== Lotes CIW — ver en vivo lo que guardan los demas =====
 * Puro. nucleo.js pregunta GET /version cada 15 s (solo con la pestaña a la
 * vista) y usa esto para decidir si baja el documento y redibuja.
 * Nunca mueve la pantalla mientras alguien escribe: con un overlay abierto, el
 * foco en un campo de un formulario o una celda a medio tipear, espera.
 * Spec: docs/superpowers/specs/2026-10-05-lotes-autoguardado-deshacer-design.md
 */
'use strict';

export const CADA_MS = 15000;

export function decidirActualizacion({ versionServidor, versionLocal, pendiente, ocupado }){
  const vs = Number(versionServidor), vl = Number(versionLocal);
  if (!Number.isFinite(vs) || !(vs > (Number.isFinite(vl) ? vl : -1))) return 'nada';
  // Lo mio sin subir: el autoguardado va a recibir un 409 y combinar.
  if (pendiente) return 'nada';
  if (ocupado) return 'esperar';
  return 'adoptar';
}

const CAMPOS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** activo: lo que tiene el foco, ya leido del DOM por nucleo.js:
 *  {tag, tipo, enTabla, valor, valorOriginal, editable} o null.
 *  En una tabla, una celda con foco pero sin tipear no frena (las grillas
 *  dejan el foco en la celda); fuera de las tablas, cualquier campo frena. */
export function ocupadoSegun({ overlayAbierto, activo }){
  if (overlayAbierto) return true;
  if (!activo) return false;
  if (activo.editable) return true;
  if (!CAMPOS.has(activo.tag)) return false;
  if (activo.tag === 'INPUT' && ['button', 'submit', 'checkbox', 'radio'].includes(activo.tipo)) return false;
  if (activo.enTabla) return activo.valor !== activo.valorOriginal;
  return true;
}
