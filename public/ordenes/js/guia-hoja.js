/* ===== Órdenes de trabajo — la hoja de la Guía de trabajos =====
 * La pantalla ES el papel (como la Orden de corrección en vivo): la misma
 * tabla se imprime; los controles van en celdas .gt-ctl que el @media print
 * oculta. El encabezado va en <thead> para que el navegador lo repita en
 * cada hoja si la guía no entra en una A4. */
'use strict';
import { vistaGuia, textoDeOrden } from './guia.js';
import { urlAbrir } from './lista.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const btn = (acc, id, txt, titulo) =>
  `<button type="button" class="ci-btn gt-b" data-acc="${acc}" data-id="${esc(id)}" title="${esc(titulo)}" aria-label="${esc(titulo)}">${txt}</button>`;
const editable = (puede, attrs, txt, ph) => puede
  ? `<div class="gt-txt" contenteditable="plaintext-only" ${attrs} data-ph="${esc(ph)}">${esc(txt)}</div>`
  : `<div class="gt-txt">${esc(txt)}</div>`;

function renglon(r, n, { puedeEditar, volver }){
  const num = r.tipo === 'nota' ? '' : String(n);
  const caja = r.tipo === 'nota' ? '' : '<span class="gt-caja" aria-hidden="true"></span>';
  const txt = r.tipo === 'orden'
    ? `<div class="gt-txt"><a class="gt-orden" href="${esc(urlAbrir(r.orden, volver))}">${esc(textoDeOrden(r.orden))}</a></div>`
    : editable(puedeEditar, `data-id="${esc(r.id)}"`, r.texto, r.tipo === 'nota' ? 'Nota…' : 'Escribí la tarea…');
  const ctl = !puedeEditar ? '' :
    `<td class="gt-ctl">` + btn('mover-arriba', r.id, '▲', 'Subir') + btn('mover-abajo', r.id, '▼', 'Bajar') +
    (r.tipo === 'tarea' ? btn('hecha', r.id, '✓', 'Marcar hecha') : '') +
    (r.tipo !== 'orden' ? btn('tipo', r.id, r.tipo === 'nota' ? '☐' : '¶', r.tipo === 'nota' ? 'Pasar a tarea' : 'Pasar a nota') : '') +
    btn('quitar', r.id, '✕', r.tipo === 'orden' ? 'Ocultar de la guía' : 'Quitar') + `</td>`;
  return `<tr class="gt-r gt-${r.tipo}" data-id="${esc(r.id)}"><td class="gt-num">${num}</td><td class="gt-chk">${caja}</td>` +
    `<td class="gt-cel">${txt}</td>${ctl}</tr>`;
}

const ENCAB = `<div class="gt-top"><span class="gt-empresa">CATENA INSTITUTE</span>` +
  `<span>ORDEN DE TRABAJO - RCI 08 - Rev. 02 &nbsp;·&nbsp; Aprobado por: Roy Urvieta &nbsp;·&nbsp; Emisión: 28/01/2013</span></div>`;

/* La hoja: encabezado (en <thead>, se repite si no entra en una A4), título
 * en caja, banda que abre el marco de los renglones, relleno que estira el
 * marco hasta el pie (como el Excel RCI 08) y firmas. */
function armarHoja({ cols, filas, vacia, fechaTxt, anio, numeroHtml, firmasHtml, despues = '' }){
  return `<div class="gt-hoja orden-hoja"><table class="gt-tabla">` +
    `<thead><tr><th colspan="${cols}">` + ENCAB +
      `<div class="gt-tit">Orden de Trabajo</div>` +
      `<div class="gt-meta"><span><b>Fecha:</b> ${esc(fechaTxt)}</span><span>${esc(anio)}</span>` +
      `<span class="gt-n"><b>N°</b> ${numeroHtml}</span></div>` +
      `<div class="gt-banda">GUÍA DE TRABAJOS, SEGUIR ORDEN INDICADO</div>` +
    `</th></tr></thead>` +
    `<tbody>${filas || `<tr><td colspan="${cols}" class="gt-vacia">${vacia}</td></tr>`}</tbody>` +
    `</table><div class="gt-relleno" aria-hidden="true"></div>` + despues +
    `<div class="gt-firmas">${firmasHtml}</div></div>`;
}

const firmas = f => `<span><b>Emitió:</b> ${f('emitio')}</span><span><b>Firma:</b> ____________</span>` +
  `<span><b>Recibió:</b> ${f('recibio')}</span>`;

export function hojaGuia(guia, ordenes, { fechaTxt, anio, puedeEditar, volver, numero = '' }){
  const { visibles } = vistaGuia(guia, ordenes);
  let n = 0;
  const filas = visibles.map(r => renglon(r, r.tipo === 'nota' ? n : ++n, { puedeEditar, volver })).join('');
  const firma = campo => puedeEditar
    ? `<span class="gt-firma" contenteditable="plaintext-only" data-firma="${campo}">${esc(guia[campo])}</span>`
    : `<span class="gt-firma">${esc(guia[campo])}</span>`;
  const numeroHtml = puedeEditar
    ? `<span class="gt-numot" contenteditable="plaintext-only" data-numero>${esc(numero)}</span>`
    : `<span class="gt-numot">${esc(numero || '____')}</span>`;
  return armarHoja({
    cols: puedeEditar ? 4 : 3, filas, fechaTxt, anio, numeroHtml, firmasHtml: firmas(firma),
    vacia: 'La guía está vacía.' + (puedeEditar ? ' Agregá una tarea.' : ''),
    despues: puedeEditar ? `<div class="gt-agregar"><button type="button" class="ci-btn" data-acc="agregar">＋ Agregar tarea</button></div>` : '',
  });
}

/** Una guía ya impresa (guia_impresas), solo lectura. */
export function hojaImpresa({ numero, fechaTxt, anio, foto }){
  const filas = (foto.renglones || []).map(r => {
    const nota = r.tipo === 'nota';
    const txt = r.tipo === 'orden' ? `<span class="gt-ordtxt">${esc(r.texto)}</span>` : esc(r.texto);
    return `<tr class="gt-r gt-${r.tipo}"><td class="gt-num">${nota ? '' : esc(r.n)}</td>` +
      `<td class="gt-chk">${nota ? '' : '<span class="gt-caja" aria-hidden="true"></span>'}</td>` +
      `<td class="gt-cel"><div class="gt-txt">${txt}</div></td></tr>`;
  }).join('');
  return armarHoja({
    cols: 3, filas, fechaTxt, anio, vacia: 'La guía salió vacía.',
    numeroHtml: `<span class="gt-numot">${esc(numero || '____')}</span>`,
    firmasHtml: firmas(c => `<span class="gt-firma">${esc(foto[c])}</span>`),
  });
}

export function extrasGuia(guia, ordenes, { puedeEditar }){
  const { ocultas } = vistaGuia(guia, ordenes);
  const hechas = (guia.hechas || []).slice().reverse();
  const fecha = iso => /^\d{4}-\d{2}-\d{2}/.test(iso || '') ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '';
  let h = '';
  if (hechas.length) h += `<details class="gt-extra" data-k="hechas"><summary>Hechas (últimos 7 días): ${hechas.length}</summary><ul>` +
    hechas.map(x => `<li><span>${esc(x.texto)}</span> <span class="gt-mut">${esc(fecha(x.hecha))}${x.por ? ' · ' + esc(x.por) : ''}</span>` +
      (puedeEditar ? ' ' + btn('deshacer', x.id, 'Deshacer', 'Volver a la guía') : '') + `</li>`).join('') + `</ul></details>`;
  if (ocultas.length) h += `<details class="gt-extra" data-k="ocultas"><summary>Órdenes ocultas: ${ocultas.length}</summary><ul>` +
    ocultas.map(r => `<li><span>${esc(textoDeOrden(r.orden))}</span>` +
      (puedeEditar ? ' ' + btn('mostrar', r.id, 'Volver a mostrar', 'Volver a mostrar en la guía') : '') + `</li>`).join('') + `</ul></details>`;
  return h;
}
