/* ===== Lotes CIW — la lista de la sub-pestaña Órdenes de trabajo (puro) =====
 * Filtra y ordena DATOS().ordenes_trabajo y arma el renglon de lotes de cada
 * OT. Aparte de la vista para poder testearlo en node. */
'use strict';

import { esEjecutado } from './ot-movimientos.js';

const lotesDe = ot => (ot.lotes || []).map(l => String(l.lote ?? ''));

export function filtrarOrdenes(ordenes, { soloPendientes = true, busca = '' } = {}){
  const q = String(busca || '').trim().toLowerCase();
  return (ordenes || [])
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
