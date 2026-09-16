/* ===== Lotes CIW — Tablero FML =====
 *
 * Reemplaza la pestana "Seguimiento FML". Orquesta: pide los datos, arma los
 * filtros, pinta la lista y abre la ficha. Todo lo que se puede decidir sin
 * DOM vive en tablero-datos.js.
 *
 * El motor decide y la vista dibuja: aca no se recalcula ninguna regla.
 */
'use strict';

import { $, esc, DATOS, dashData, cargarDashboard, registrarVista } from './nucleo.js';

/** Los lotes del dashboard cruzados con su fila de DATOS() (proyecto, vasija). */
export function filasTablero(){
  const dash = dashData();
  if (!dash) return [];
  const info = new Map((DATOS().lotes || []).map(l => [String(l.lote ?? ''), l]));
  return (dash.lotes || [])
    .filter(l => l.activo)
    .map(l => ({ ...l, _info: info.get(String(l.lote ?? '')) || {} }));
}

export async function renderTablero(){
  const sec = $('tab-tablero');
  if (!dashData()) { sec.innerHTML = '<p>Cargando…</p>'; await cargarDashboard(); }
  const filas = filasTablero();
  sec.innerHTML = `<p>Estado de los ${esc(filas.length)} lotes.</p>`;
}

registrarVista('tablero', () => renderTablero());
