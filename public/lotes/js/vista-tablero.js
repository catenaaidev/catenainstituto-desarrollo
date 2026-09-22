/* ===== Lotes CIW — Tablero FML =====
 *
 * Reemplaza la pestana "Seguimiento FML". Orquesta: pide los datos, arma los
 * filtros, pinta la lista y abre la ficha. Todo lo que se puede decidir sin
 * DOM vive en tablero-datos.js.
 *
 * El motor decide y la vista dibuja: aca no se recalcula ninguna regla.
 */
'use strict';

import { $, DATOS, dashData, dashLoading, cargarDashboard, registrarVista } from './nucleo.js';
import { htmlPanel } from './tablero-panel.js';

let _modoPanel = 'numeros';

/** Los lotes del dashboard cruzados con su fila de DATOS() (proyecto, vasija). */
export function filasTablero(){
  const dash = dashData();
  if (!dash) return [];
  const info = new Map((DATOS().lotes || []).map(l => [String(l.lote ?? ''), l]));
  return (dash.lotes || [])
    .filter(l => l.activo)
    .map(l => ({ ...l, _info: info.get(String(l.lote ?? '')) || {} }));
}

export function renderTablero(){
  const sec = $('tab-tablero');
  if (!sec) return;

  if (!dashData()){
    sec.innerHTML = '<div class="msg info" style="margin-top:10px">Cargando datos del motor FML…</div>';
    if (!dashLoading()) cargarDashboard();
    return;
  }

  const filas = filasTablero();
  sec.innerHTML = htmlPanel(dashData().kpis || {}, filas, _modoPanel);

  if (!sec._wiredTablero){
    sec._wiredTablero = true;
    sec.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-modo]');
      if (!b) return;
      _modoPanel = b.dataset.modo;
      renderTablero();
    });
  }
}

registrarVista('tablero', () => renderTablero());
