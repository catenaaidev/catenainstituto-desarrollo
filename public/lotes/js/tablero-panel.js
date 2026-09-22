/* ===== Lotes CIW — el panel "Estado de los N lotes" =====
 *
 * Dos modos con un toggle: mosaico (un cuadrado por lote) y numeros (seis
 * tarjetas). En el tablero original "numeros" era el fallback sin JS; aca es
 * un modo elegible, porque leer los seis ejes de un vistazo sirve solo.
 *
 * Solo arma HTML. Las cuentas estan en tablero-datos.js, que se puede testear
 * porque no importa nucleo.js (que toca window al cargarse).
 */
'use strict';

import { esc, escA } from './nucleo.js';
import { tarjetasDe, tonoMosaico } from './tablero-datos.js';

function htmlNumeros(kpis){
  return `<div class="tb-tarjetas">` + tarjetasDe(kpis).map(t => `
    <div class="tb-tarjeta${t.hi ? ' hi' : ''}">
      <div class="tb-pct">${t.pct}%</div>
      <div class="tb-label">${esc(t.label)}</div>
      <div class="tb-cant">${t.cantidad} de ${t.total}</div>
    </div>`).join('') + `</div>`;
}

function htmlMosaico(filas){
  return `<div class="tb-mosaico">` + filas.map(f => {
    const n = (f.condiciones || []).length;
    const tip = `${f.lote} · ${f.variedad ?? ''} · ${n} ${n === 1 ? 'condición' : 'condiciones'}`;
    return `<button class="tb-cuadro ${tonoMosaico(f)}" data-ficha="${escA(f.lote)}" title="${escA(tip)}"></button>`;
  }).join('') + `</div>`;
}

export function htmlPanel(kpis, filas, modo){
  const cuerpo = modo === 'mosaico' ? htmlMosaico(filas) : htmlNumeros(kpis);
  return `
    <div class="tb-panel">
      <div class="tb-panel-cab">
        <h3>Estado de los ${filas.length} lotes</h3>
        <div class="tb-toggle">
          <button data-modo="mosaico" class="${modo === 'mosaico' ? 'active' : ''}">Mosaico</button>
          <button data-modo="numeros" class="${modo === 'mosaico' ? '' : 'active'}">Números</button>
        </div>
      </div>
      ${cuerpo}
    </div>`;
}
