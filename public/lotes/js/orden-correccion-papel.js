/* ===== Lotes CIW — el papel de la Orden de correccion de SO2 =====
 *
 * Modulo puro (sin DOM, sin nucleo.js) para poder testearlo. Sigue el formato
 * de la orden en Excel de bodega (B219 Correccion SO2.xlsx): el operario solo
 * necesita el lote, el año, el numero de barril y cuanto agregar. pH, SO2,
 * objetivo, molecular, capacidad, estado, litros y los avisos del mapa quedan
 * en la tabla de pantalla, que es donde se decide la orden; al papel no van. */
'use strict';

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (v, dec) => (v != null && Number.isFinite(v)) ? Number(v).toFixed(dec) : '—';

/** Año de cosecha de un lote, sacado de su numero: los dos primeros digitos
 *  son el año (25009 -> 2025, 26014 -> 2026). Es como lo escribe la B219.
 *  Devuelve '' si el lote no empieza con dos digitos: mejor un casillero vacio
 *  que un año inventado. */
export function anioDeLote(lote){
  const m = /^\s*(\d{2})\d/.exec(String(lote ?? ''));
  return m ? '20' + m[1] : '';
}

/* Instrucciones de la solucion, copiadas de la B219. Solo tienen sentido si se
 * dosifica con la solucion d1030: con MBK en polvo no hay densidad que medir. */
export const INSTRUCCIONES_SOLUCION =
  '<div class="oh-instr">Chequear valor de solución con DMA.<br>' +
  'En caso que sea menor a 1,028, concentrar.<br>' +
  'En caso que sea mayor a 1,032, diluir.<br>' +
  'Homogeneizar.<br>' +
  'Densidad: ____________</div>';

export const COLUMNAS_PAPEL = 5;

export const COLGROUP_PAPEL =
  '<colgroup><col style="width:34px"><col style="width:110px"><col style="width:90px"><col style="width:120px"><col style="width:60px"></colgroup>';

/** Encabezado de la tabla. u = config de la unidad (col = titulo de la dosis).
 *  PRODUCTO va antes de la dosis, como en la B219 ("P - MBK - Sol1030"). */
export function theadPapel(u){
  return '<tr><th class="c oh-num">#</th><th class="c">BARRIL</th><th class="c">PRODUCTO</th>' +
         '<th class="c">' + esc(u.col) + '</th><th class="oh-check">Check</th></tr>';
}

/** Una fila del papel: separador de lote (lote · año) o barril.
 *  u = config de la unidad vigente ({prod, dec, de(dosis)}). El total del lote
 *  no va: el operario agrega barril por barril, y un total al lado de las
 *  dosis se confunde con una dosis mas. */
export function filaPapel({ numero, fila }, u){
  if (fila.tipo === 'lote'){
    const lote = fila.lote.lote;
    const anio = anioDeLote(lote);
    return '<tr class="oc-sep">' +
      '<td class="c oh-num"></td>' +
      '<td colspan="4"><b>' + esc(lote) + '</b>' + (anio ? ' · ' + anio : '') + '</td></tr>';
  }
  return '<tr>' +
    '<td class="c oh-num">' + numero + '</td>' +
    '<td class="c">' + esc(fila.barrica.num || '—') + '</td>' +
    '<td class="c">' + esc(u.prod) + '</td>' +
    '<td class="c"><b>' + fmt(u.de(fila.dosis), u.dec) + '</b></td>' +
    '<td class="oh-check"></td>' +
  '</tr>';
}
