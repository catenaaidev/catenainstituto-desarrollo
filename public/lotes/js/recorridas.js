/* ===== Lotes CIW — recorridas del inventario de tanques (puro) =====
 *
 * Una recorrida es lo que se mide mirando el tanque: cm de merma (0 = lleno),
 * velo, observacion y un estado a mano. Los litros salen de la cubicacion
 * (manda la Cap REAL). Si no coinciden con la web, "Aplicar diferencias"
 * corrige el lote, siempre con check manual. */
'use strict';

import { litrosPorCm } from './cubicacion.js';
import { litrosDelLote } from './mermas.js';
import { partesVasija } from './inventario-tanques.js';
import { normalizarNumVasija } from './vasijas-padron.js';

function leerCm(cm){
  if (cm === '' || cm == null) return null;
  const x = typeof cm === 'number' ? cm : parseFloat(String(cm).replace(',', '.'));
  return Number.isFinite(x) && x >= 0 ? x : null;
}

export function medirFila(filaInv, entrada){
  const e = entrada || {};
  const cm = leerCm(e.cm);
  const velo = !!e.velo, obs = String(e.obs || '').trim(), estado_manual = String(e.estado_manual || '');
  if (cm == null && !velo && !obs && !estado_manual) return null;
  const vasija = { num: filaInv.num, cap_real: filaInv.cap_real, tabla: filaInv.tabla };
  const r = cm == null ? null : litrosPorCm(vasija, cm);
  const ocup = filaInv.lotes || [];
  return {
    vasija: String(filaInv.num),
    lote: ocup.length === 1 ? String(ocup[0].lote) : ocup.map(o => o.lote).join(' + '),
    cm, litros_medidos: r && !r.error ? r.litros : null, litros_web: filaInv.litros ?? null,
    velo, obs, estado_manual, aplicado: null,
  };
}

export function nuevaRecorrida({ id, fecha, por, filas }){
  return { id, fecha, por: String(por || ''), filas: (filas || []).filter(Boolean) };
}

export function aplicarDiferencias(datos, items, usuario, hoy){
  const aplicados = [], salteados = [];
  const saltear = (vasija, motivo) => salteados.push({ vasija: String(vasija), motivo });
  for (const it of items || []){
    const rec = (datos.recorridas || []).find(r => r && r.id === it.recorrida_id);
    const num = normalizarNumVasija(it.vasija);
    const f = rec && (rec.filas || []).find(x => x && normalizarNumVasija(x.vasija) === num);
    if (!f){ saltear(it.vasija, 'no-encontrada'); continue; }
    if (f.aplicado){ saltear(it.vasija, 'ya-aplicada'); continue; }
    if (f.litros_medidos == null){ saltear(it.vasija, 'sin-litros'); continue; }
    const lote = (datos.lotes || []).find(l => l && String(l.lote) === String(f.lote));
    const partes = lote ? partesVasija(lote.vasija_actual, lote) : [];
    if (!lote || !partes.includes(num)){ saltear(it.vasija, 'lote-movido'); continue; }
    // Las partes que NO son esta vasija pueden ser tanques fuera del padron;
    // igual no hay forma de repartir vasija_grande entre dos tanques.
    if (new Set(partes).size > 1){ saltear(it.vasija, 'varias-vasijas'); continue; }
    // Si la web cambio despues de medir (un relleno, otra correccion), lo medido ya no vale.
    const webHoy = Number(lote.vasija_grande ?? lote.litros_actuales);
    if (f.litros_web == null || !Number.isFinite(webHoy) || Math.abs(webHoy - Number(f.litros_web)) > 1){
      saltear(it.vasija, 'web-cambio'); continue;
    }
    const antes = { vasija_grande: lote.vasija_grande ?? null, litros_actuales: lote.litros_actuales ?? null };
    lote.vasija_grande = f.litros_medidos;
    lote.litros_actuales = litrosDelLote(lote, datos.mermas);
    f.aplicado = { el: hoy, por: usuario || '', antes };
    aplicados.push(String(lote.lote));
  }
  return { aplicados, salteados };
}
