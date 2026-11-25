/* ===== Lotes CIW — la lista de la sub-pestaña Órdenes de trabajo (puro) =====
 * Filtra y ordena DATOS().ordenes_trabajo y arma el renglon de lotes de cada
 * OT. Aparte de la vista para poder testearlo en node. */
'use strict';

import { esEjecutado } from './ot-movimientos.js';
import { textoDestinos, movIdsDeOT } from './ot-achique.js';
import { esSinMovimientos, lotesDeMuestras } from './ot-muestras.js';
import { extrasDeOT } from './ot-destinos.js';

// Muestras (0993): los lotes son los de su tabla, no tiene ot.lotes.
const lotesDe = ot => esSinMovimientos(ot) ? lotesDeMuestras(ot) : (ot.lotes || []).map(l => String(l.lote ?? ''));

/* `movimientos`: si viene, se ocultan las OT a las que no les queda ningun
 * movimiento (las que quedaron huerfanas cuando el Historial borraba solo la
 * fila, antes de que borrar una fila de una OT borrara la OT entera).
 * Una OT sin movimientos (Muestras) nunca es huérfana. */
export function filtrarOrdenes(ordenes, { soloPendientes = true, busca = '', movimientos = null } = {}){
  const q = String(busca || '').trim().toLowerCase();
  const vivos = movimientos ? new Set(movimientos.map(m => m && m.id)) : null;
  return (ordenes || [])
    .filter(ot => !vivos || esSinMovimientos(ot) || (ot.lotes || []).some(l => vivos.has(l.mov_id)))
    .filter(ot => !soloPendientes || !esEjecutado(ot))
    .filter(ot => !q ||
      String(ot.ot || '').toLowerCase().includes(q) ||
      lotesDe(ot).some(l => l.toLowerCase().includes(q)) ||
      String((ot.lote_corte && ot.lote_corte.lote) || '').toLowerCase().includes(q) ||
      ((ot.achique && ot.achique.destinos) || []).some(d => String(d.lote || '').toLowerCase().includes(q)) ||
      extrasDeOT(ot).some(x => String(x.d.lote || '').toLowerCase().includes(q)))
    .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) ||
                    String(b.ot || '').localeCompare(String(a.ot || '')));
}

/* Los ids de todos los movimientos que salieron de una OT. Se arma una vez
 * por dibujo del Historial, no una vez por fila. */
export function idsDeOrdenes(ordenes){
  return new Set((ordenes || []).flatMap(movIdsDeOT).filter(Boolean));
}

/* Las OT se ven siempre, prenda el año que prenda (pedido 2026-11-03: un
 * traslado de un lote 2025 desaparecia con solo 2026 prendido). Un movimiento
 * suelto sigue el selector de años: se ve si su lote o su lote_destino se ve
 * (un traspaso 25xxx -> 26xxx aparece en los dos años). Manda el id del
 * movimiento, no el texto de la columna OT, que se escribe a mano. */
export function movimientoVisible(m, idsOT, visible){
  if (!m) return false;
  if (m.id && idsOT && idsOT.has(m.id)) return true;
  return visible(m.lote) || (!!m.lote_destino && visible(m.lote_destino));
}

// Un corte de treinta lotes no entra en un renglon: se nombra por el lote que forma.
export function resumenLotes(ot){
  const ls = lotesDe(ot);
  const destinos = textoDestinos(ot);
  if (ot.lote_corte && ot.lote_corte.lote)
    return `${ot.lote_corte.lote} (corte de ${ls.length} lotes)` + (destinos ? ` → ${destinos}` : '');
  const base = ls.length > 4 ? `${ls.slice(0, 4).join(' · ')} +${ls.length - 4}` : ls.join(' · ');
  return extrasDeOT(ot).length ? `${base} → ${destinos}` : base;
}

/* Fecha programada: una OT pendiente para un dia que todavia no llego. */
export function esProgramada(ot, hoy){
  const f = String((ot && ot.fecha) || '');
  return !!f && f > String(hoy || '') && !esEjecutado(ot);
}

// Sin fecha programada, la OT es para hoy.
export const fechaOHoy = (fecha, hoy) => String(fecha || '').trim() || hoy;
