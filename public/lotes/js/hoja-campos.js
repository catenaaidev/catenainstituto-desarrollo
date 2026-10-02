/* ===== Lotes CIW — campos editables SOBRE la hoja de papel =====
 *
 * La Orden de muestras muestra en pantalla la hoja tal cual se imprime y se
 * edita encima (vista previa editable). Cada dato editable de la hoja es un
 * control con data-campo="<clave>": vista-orden.js escucha los input de toda
 * la hoja, guarda el valor en su estado y copia el texto a los demas controles
 * con la misma clave (el mismo dato se repite en cada pagina). Asi tipear no
 * repinta la hoja ni pierde el foco.
 *
 * Al imprimir los bordes desaparecen (CSS de printing-orden) y un campo vacio
 * con placeholder no se imprime (:placeholder-shown).
 *
 * Modulo puro (sin nucleo.js) para poder testearlo en node. */
'use strict';

const esc  = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escA = v => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/* tipo: 'text' (default) | 'date' | 'area' (textarea que crece con el texto,
 * un renglon por instruccion). cls: clases extra. ph: placeholder. */
export function campoHoja(k, valor, { tipo = 'text', cls = '', ph = '' } = {}){
  const c = `oh-campo${tipo === 'area' ? ' oh-campo-area' : ''}${cls ? ' ' + cls : ''}`;
  const attrs = `class="${c}" data-campo="${escA(k)}"${ph ? ` placeholder="${escA(ph)}"` : ''}`;
  if (tipo === 'area') return `<textarea ${attrs} rows="1">${esc(valor)}</textarea>`;
  return `<input ${attrs} type="${tipo === 'date' ? 'date' : 'text'}" value="${escA(valor)}">`;
}

/* hoyLocalISO vive en fechas.js; se re-exporta para vista-orden.js. */
export { hoyLocalISO } from './fechas.js';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/* Dia de la semana de una fecha 'YYYY-MM-DD' (en castellano, minusculas).
 * '' si la fecha no es valida. Se arma con los numeros, no con Date(iso), que
 * interpreta la cadena como UTC y corre el dia. */
export function diaDeSemana(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return '';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d) ? '' : DIAS[d.getDay()];
}
