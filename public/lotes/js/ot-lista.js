/* ===== Lotes CIW — la lista de la sub-pestaña Órdenes de trabajo (puro) =====
 * Filtra y ordena DATOS().ordenes_trabajo y arma el renglon de lotes de cada
 * OT. Aparte de la vista para poder testearlo en node. */
'use strict';

import { esEjecutado } from './ot-movimientos.js';

const lotesDe = ot => (ot.lotes || []).map(l => String(l.lote ?? ''));

/* `movimientos`: si viene, se ocultan las OT a las que no les queda ningun
 * movimiento (las que quedaron huerfanas cuando el Historial borraba solo la
 * fila, antes de que borrar una fila de una OT borrara la OT entera). */
export function filtrarOrdenes(ordenes, { soloPendientes = true, busca = '', movimientos = null } = {}){
  const q = String(busca || '').trim().toLowerCase();
  const vivos = movimientos ? new Set(movimientos.map(m => m && m.id)) : null;
  return (ordenes || [])
    .filter(ot => !vivos || (ot.lotes || []).some(l => vivos.has(l.mov_id)))
    .filter(ot => !soloPendientes || !esEjecutado(ot))
    .filter(ot => !q ||
      String(ot.ot || '').toLowerCase().includes(q) ||
      lotesDe(ot).some(l => l.toLowerCase().includes(q)) ||
      String((ot.lote_corte && ot.lote_corte.lote) || '').toLowerCase().includes(q))
    .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) ||
                    String(b.ot || '').localeCompare(String(a.ot || '')));
}

// Un corte de treinta lotes no entra en un renglon: se nombra por el lote que forma.
export function resumenLotes(ot){
  const ls = lotesDe(ot);
  if (ot.lote_corte && ot.lote_corte.lote) return `${ot.lote_corte.lote} (corte de ${ls.length} lotes)`;
  return ls.length > 4 ? `${ls.slice(0, 4).join(' · ')} +${ls.length - 4}` : ls.join(' · ');
}
