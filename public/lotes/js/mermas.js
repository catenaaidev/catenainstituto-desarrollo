/* ===== Lotes CIW — barricas mermas (puro) =====
 *
 * Una merma es una barrica que quedo con menos vino que su capacidad despues
 * de una OT. Mientras esta pendiente, lo que le falta se descuenta de los
 * litros del lote:
 *   litros_actuales = litrosDeEnvases(lote) - faltante de sus mermas pendientes
 * Se cierra sola cuando el Mapa de Barriles la muestra LLENO con el mismo lote
 * y fecha posterior (cerrarLlenasSegunMapa), a mano, o cuando otra OT la vacia. */
'use strict';

import { litrosDeEnvases } from './envases.js';

const r1 = x => Math.round(x * 10) / 10;

/* Los 5 digitos del lote: el Mapa anota cosas como "26730 ROJO". */
export function codigoLote(v){
  const s = String(v ?? '').trim();
  const m = s.match(/\d{5}/);
  return m ? m[0] : s;
}

export function faltanteDe(m){
  const c = Number(m && m.cap), l = Number(m && m.litros);
  return Number.isFinite(c) && Number.isFinite(l) && c > l ? r1(c - l) : 0;
}

export const estaPendiente = m => !!m && !m.resuelta_el;

export function faltanteDeLote(mermas, lote){
  const L = codigoLote(lote);
  return r1((mermas || []).filter(m => estaPendiente(m) && codigoLote(m.lote) === L)
    .reduce((s, m) => s + faltanteDe(m), 0));
}

/* Nunca null y nunca negativo: motor_etapas lee litros_actuales <= 0 como lote cerrado. */
export function litrosDelLote(lote, mermas){
  if (!lote) return 0;
  return Math.max(0, r1(litrosDeEnvases(lote) - faltanteDeLote(mermas, lote.lote)));
}

export function nuevaMerma({ lote, barril, cap, litros, desde, ot }, id){
  return { id, lote: String(lote), barril: String(barril).trim(), cap: Number(cap), litros: Number(litros),
           desde: String(desde || ''), ot: String(ot || ''),
           resuelta_el: '', resuelta_por: '', resuelta_como: '' };
}

/* barrilMapa: la fila del Mapa para ese numero ({estado, lote, fecha}) o null.
 * Sin fecha en el Mapa no se cierra: es preferible una merma de mas en la lista
 * que una barrica medio vacia que nadie recuerda. */
export function llenaSegunMapa(m, b){
  if (!m || !b || b.estado !== 'LLENO') return false;
  if (codigoLote(b.lote) !== codigoLote(m.lote)) return false;
  const f = String(b.fecha || '');
  return !!f && f >= String(m.desde || '');
}

export function resolver(m, como, usuario, hoy){
  m.resuelta_el = hoy; m.resuelta_por = usuario || ''; m.resuelta_como = como;
}

export function cerrarLlenasSegunMapa(mermas, porNum, usuario, hoy){
  const lotes = new Set();
  for (const m of mermas || []){
    if (estaPendiente(m) && llenaSegunMapa(m, (porNum || {})[String(m.barril)])){
      resolver(m, 'mapa', usuario, hoy);
      lotes.add(codigoLote(m.lote));
    }
  }
  return lotes;
}

export function recalcularLitros(lotes, mermas, codigos){
  for (const l of lotes || []){
    if (codigos.has(codigoLote(l.lote))) l.litros_actuales = litrosDelLote(l, mermas);
  }
}
