/* ===== Lotes CIW — deshacer una OT aplicada al borrarla (puro) =====
 *
 * Al confirmar, cada lote de la OT guarda en `aplicado` la foto de como estaba
 * (`antes`), como quedo (`despues`) y que mermas creo o cerro. Borrar la OT
 * puede devolver los lotes al `antes`, pero solo los que siguen exactamente
 * como los dejo la OT: si alguien los cambio despues (otra OT, el overlay de
 * Envases, la grilla), volver al `antes` pisaria ese cambio, asi que esos no
 * se tocan y se avisa. */
'use strict';

import { ENV_KEYS, fotoLote } from './propuesta-ot.js';

const CAMPOS = [...ENV_KEYS, 'litros_actuales', 'vasija_actual'];
const igualCampo = (a, b) => (a ?? null) === (b ?? null) || (a == null && b === '') || (a === '' && b == null)
  || (a != null && b != null && String(a) === String(b));

function sigueIgual(lote, despues){
  const ahora = fotoLote(lote);
  return CAMPOS.every(k => igualCampo(ahora[k], despues[k]));
}

/* { aplicada, items: [{lote, accion: 'volver'|'cambiado'|'falta', antes, ahora}],
 *   mermasBorrar: [id], mermasReabrir: [id] }
 * Las mermas de un lote cambiado o faltante tampoco se tocan. */
export function planDeshacer(datos, ot){
  const destinos = [...(ot.lotes || []), ...(ot.lote_corte ? [ot.lote_corte] : [])]
    .filter(d => d && d.aplicado && typeof d.aplicado === 'object');
  const plan = { aplicada: destinos.length > 0, items: [], mermasBorrar: [], mermasReabrir: [] };
  for (const d of destinos){
    const a = d.aplicado;
    const lote = (datos.lotes || []).find(l => String(l.lote) === String(d.lote));
    if (!lote){ plan.items.push({ lote: String(d.lote), accion: 'falta', antes: a.antes, ahora: null }); continue; }
    const volver = sigueIgual(lote, a.despues || {});
    plan.items.push({ lote: String(d.lote), accion: volver ? 'volver' : 'cambiado', antes: a.antes, ahora: fotoLote(lote) });
    if (!volver) continue;
    plan.mermasBorrar.push(...(a.mermas_creadas || []));
    plan.mermasReabrir.push(...(a.mermas_cerradas || []));
  }
  return plan;
}

/* Aplica el plan. Devuelve cuantos lotes volvieron al `antes`. Una merma
 * cerrada por la OT solo se reabre si sigue cerrada como 'vaciada': si despues
 * la resolvio alguien a mano o el Mapa, esa resolucion se respeta. */
export function aplicarDeshacer(datos, plan){
  let n = 0;
  for (const it of plan.items){
    if (it.accion !== 'volver') continue;
    const lote = (datos.lotes || []).find(l => String(l.lote) === it.lote);
    if (!lote) continue;
    for (const k of CAMPOS) lote[k] = it.antes[k] ?? (k === 'litros_actuales' ? 0 : k === 'vasija_actual' ? '' : null);
    n++;
  }
  if (Array.isArray(datos.mermas)){
    const borrar = new Set(plan.mermasBorrar);
    datos.mermas = datos.mermas.filter(m => !borrar.has(m.id));
    for (const id of plan.mermasReabrir){
      const m = datos.mermas.find(x => x.id === id);
      if (m && m.resuelta_como === 'vaciada'){ m.resuelta_el = ''; m.resuelta_por = ''; m.resuelta_como = ''; }
    }
  }
  return n;
}
