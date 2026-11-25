/* ===== Lotes CIW — inventario de tanques: textos de avisos y borrador de recorrida (puro) =====
 * Los avisos se muestran como etiquetas con texto (el ⚠ con title no se leía en
 * la tablet). El borrador guarda la recorrida a medio cargar para que Cancelar
 * por error o un F5 no la borren. */
'use strict';

export const AVISO_TXT = {
  'dos-lotes': 'Hay más de un lote en esta vasija',
  'excede': 'Más litros que la Cap REAL',
  'diferencia': 'Lo medido no coincide con la web',
  'sin-reparto': 'El lote está en varias vasijas: no se sabe cuántos litros hay en cada una',
  'medicion-vieja': 'La web cambió después de la última medición: hay que volver a medir',
  'medido-en-vacia': 'Se midió vino en una vasija que la web da vacía',
  'vasija-inactiva': 'La vasija está inactiva en el padrón y tiene vino',
};
export const AVISO_CORTO = {
  'dos-lotes': '2 lotes',
  'excede': 'excede cap',
  'diferencia': 'difiere',
  'sin-reparto': 'sin reparto',
  'medicion-vieja': 'medir de nuevo',
  'medido-en-vacia': 'vacía con vino',
  'vasija-inactiva': 'inactiva',
};

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escA = v => esc(v).replace(/"/g, '&quot;');

/** Etiquetas de los avisos de una fila. `sacar` son los que ya se ven en otra columna. */
export function avisosHTML(avisos, sacar = []){
  return (avisos || []).filter(a => !sacar.includes(a) && AVISO_CORTO[a])
    .map(a => `<span class="inv-chip inv-chip-${escA(a)}" title="${escA(AVISO_TXT[a])}">${esc(AVISO_CORTO[a])}</span>`).join('');
}

/** Leyenda de los avisos que aparecen en las filas visibles, en el orden de AVISO_CORTO. */
export function leyendaAvisosHTML(filas, sacar = []){
  const hay = new Set();
  for (const f of filas || []) for (const a of f.avisos || []) if (!sacar.includes(a)) hay.add(a);
  const items = Object.keys(AVISO_CORTO).filter(a => hay.has(a))
    .map(a => `<li><span class="inv-chip inv-chip-${escA(a)}">${esc(AVISO_CORTO[a])}</span> ${esc(AVISO_TXT[a])}</li>`);
  return items.length ? `<ul class="inv-leyenda">${items.join('')}</ul>` : '';
}

/* ---------- borrador de la recorrida ---------- */

const tieneAlgo = e => !!e && (String(e.cm ?? '').trim() !== '' || e.velo === true || e.velo === false
  || String(e.obs ?? '').trim() !== '' || e.estado_manual != null);

/** Cuántas vasijas tienen algo cargado (tocado) en la recorrida. */
export function contarCargadas(entradas){
  let n = 0;
  for (const e of (entradas || new Map()).values()) if (tieneAlgo(e)) n++;
  return n;
}

/** Texto para localStorage; null si no hay nada cargado (hay que borrar el borrador). */
export function serializarBorrador(fecha, entradas){
  if (!contarCargadas(entradas)) return null;
  return JSON.stringify({ fecha: String(fecha || ''), entradas: [...entradas.entries()] });
}

/** Lee el borrador guardado; null si no hay o está roto. */
export function leerBorrador(texto){
  if (!texto) return null;
  let o;
  try { o = JSON.parse(texto); } catch (e) { return null; }
  if (!o || !/^\d{4}-\d{2}-\d{2}$/.test(String(o.fecha || '')) || !Array.isArray(o.entradas)) return null;
  const entradas = new Map();
  for (const par of o.entradas){
    if (!Array.isArray(par) || par.length !== 2 || !par[1] || typeof par[1] !== 'object') continue;
    const e = par[1], limpio = {};
    if (e.cm != null) limpio.cm = String(e.cm);
    if (typeof e.velo === 'boolean') limpio.velo = e.velo;
    if (e.obs != null) limpio.obs = String(e.obs);
    if (e.estado_manual != null) limpio.estado_manual = String(e.estado_manual);
    entradas.set(String(par[0]), limpio);
  }
  return contarCargadas(entradas) ? { fecha: o.fecha, entradas } : null;
}
