/* ===== Lotes CIW — cabecera de una orden de papel guardada (puro) =====
 *
 * Modulo puro: sin DOM, sin nucleo.js (que toca document/window al importarse
 * y rompe el test en Node/Workers). Lo usa vista-orden-guardada.js, que le
 * pone el cableado de clics (ejecutar/anular/reimprimir).
 */
'use strict';

import { fmtFecha } from './fechas.js';

const esc  = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escA = v => esc(v).replace(/"/g, '&quot;');

function _estado(orden){
  if (orden.estado === 'ejecutada'){
    return '✔ Ejecutada por ' + esc(orden.ejecutada_por) + ' el ' + esc(fmtFecha(orden.ejecutada_el));
  }
  if (orden.estado === 'anulada'){
    const a = orden.anulada || {};
    return '✕ Anulada por ' + esc(a.por) + ' el ' + esc(fmtFecha(a.en));
  }
  return '⏳ Pendiente';
}

/** Cabecera de una orden guardada (muestras/micro/agregados): estado y
 *  botones (ejecutar/anular solo si está pendiente y puedeEditar; reimprimir
 *  siempre). Puro: recibe `orden` ya resuelta, no toca DATOS() ni el DOM. */
export function htmlCabeceraOrden(orden, { puedeEditar } = {}){
  const pendiente = orden.estado === 'pendiente';
  const botones = [];
  if (pendiente && puedeEditar){
    botones.push('<button class="btn primary" data-oha="ejecutar" data-orden-id="' + escA(orden.id) + '">✔ Marcar ejecutada</button>');
    botones.push('<button class="btn" data-oha="anular" data-orden-id="' + escA(orden.id) + '">Anular</button>');
  }
  botones.push('<button class="btn" data-oha="reimprimir" data-orden-id="' + escA(orden.id) + '">🖨 Reimprimir</button>');

  const aviso = (orden.tipo === 'agregados' && pendiente)
    ? '<div style="color:var(--muted)">Al marcarla ejecutada se anotan en Análisis las dosis de este papel.</div>'
    : '';

  return '<div class="oh-guardada" data-orden="' + escA(orden.id) + '">' +
    '<div class="oh-estado"><b>' + esc(orden.ot) + '</b> · ' + esc(fmtFecha(orden.fecha)) + ' · ' + _estado(orden) + '</div>' +
    aviso +
    '<div class="oh-botones">' + botones.join(' ') + '</div>' +
    '</div>';
}
