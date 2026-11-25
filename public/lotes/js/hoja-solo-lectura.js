/* ===== Lotes CIW — una hoja de papel en solo lectura =====
 *
 * Las hojas se pintan con los mismos campos que la vista previa editable
 * (hoja-campos.js) para que se vean tal cual se imprimieron; aca los
 * <input>/<textarea> se cambian por texto (el valor queda en la pagina, se
 * lee y se copia, y no hay nada para tipear) y se SACAN los botones de la
 * hoja (✕ quitar, ＋ agregar, 🎲): [hidden] no alcanza, el CSS de
 * .oh-agregar le pone display:block. Las clases oh-campo* / oh-celda (bordes
 * punteados de campo editable) no pasan al texto. Una fecha se escribe
 * dd/mm/aaaa, como la muestra el campo de fecha en el papel. */
'use strict';

import { fmtFecha } from './fechas.js';

export function hojaSoloLectura(pag){
  pag.querySelectorAll('.oh-quitar, .oh-agregar, .oh-dado').forEach(b => b.remove());
  pag.querySelectorAll('input, textarea, select').forEach(el => {
    const area = el.tagName === 'TEXTAREA';
    const titulo = el.classList.contains('oh-titulo');
    const t = document.createElement(area || titulo ? 'div' : 'span');
    t.className = [...el.classList].filter(c => !/^oh-(campo|celda)/.test(c)).join(' ');
    if (area) t.style.whiteSpace = 'pre-line';
    t.textContent = el.tagName === 'SELECT'
      ? ((el.selectedOptions[0] || {}).textContent || '')
      : el.type === 'date' ? fmtFecha(el.value) : el.value;
    el.replaceWith(t);
  });
}
