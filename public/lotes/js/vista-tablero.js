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

  /* --- si aun no hay datos del dashboard, mostrar placeholder y disparar carga --- */
  if (!dashData()){
    sec.innerHTML = '<div class="msg info" style="margin-top:10px">Cargando datos del motor FML…</div>';
    if (!dashLoading()) cargarDashboard();
    return;
  }

  const filas = filasTablero();
  sec.innerHTML = `<p>Estado de los ${filas.length} lotes.</p>`;
}

registrarVista('tablero', () => renderTablero());
