/* ===== Lotes CIW — barricas mermas (puro) =====
 *
 * Una merma es una barrica que quedo con menos vino que su capacidad despues
 * de una OT. Mientras esta pendiente, lo que le falta se descuenta de los
 * litros del lote:
 *   litros_actuales = litrosDeEnvases(lote) - faltante de sus mermas pendientes
 * Se cierra sola cuando el Mapa de Barriles la muestra LLENO con el mismo lote
 * Y registro un cambio en esa barrica despues de la OT (llenaSegunMapa), a
 * mano, o cuando otra OT la vacia. */
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
  const falta = faltanteDeLote(mermas, lote.lote);
  // M1: sin mermas del lote no se redondea (3048,625 L de tanque quedan asi).
  if (falta === 0) return litrosDeEnvases(lote);
  return Math.max(0, r1(litrosDeEnvases(lote) - falta));
}

/* mapa_ts: el `ts` que tenia esa barrica en el Mapa al confirmar la OT (null
 * si no se sabia). Ver llenaSegunMapa. */
export function nuevaMerma({ lote, barril, cap, litros, desde, ot, mapa_ts = null }, id){
  const ts = mapa_ts == null || mapa_ts === '' ? null : Number(mapa_ts);
  return { id, lote: String(lote), barril: String(barril).trim(), cap: Number(cap), litros: Number(litros),
           desde: String(desde || ''), ot: String(ot || ''), mapa_ts: Number.isFinite(ts) ? ts : null,
           resuelta_el: '', resuelta_por: '', resuelta_como: '' };
}

/* b: la fila del Mapa para ese numero ({estado, lote, fecha, ts}) o null.
 *
 * C1: el escaner deja la barrica rellenada en LLENO con la fecha del dia de
 * trabajo, y volver a escanear una LLENO del mismo lote no mueve ni fecha ni
 * ts. Por eso "LLENO y fecha >= desde" la cerraba apenas se confirmaba la OT.
 * Ahora tiene que haber un cambio en el Mapa DESPUES de la OT:
 *   - si la merma guardo el ts del Mapa al confirmar (mapa_ts), un ts mayor;
 *   - si no (mermas viejas o el Mapa no tenia ts), una fecha estrictamente
 *     posterior a desde (la fecha de la OT).
 * Sin dato no se cierra: es preferible una merma de mas en la lista que una
 * barrica medio vacia que nadie recuerda. */
export function llenaSegunMapa(m, b){
  if (!m || !b || b.estado !== 'LLENO') return false;
  if (codigoLote(b.lote) !== codigoLote(m.lote)) return false;
  if (typeof m.mapa_ts === 'number' && Number.isFinite(m.mapa_ts)){
    const ts = b.ts == null || b.ts === '' ? NaN : Number(b.ts);
    return Number.isFinite(ts) && ts > m.mapa_ts;
  }
  const f = String(b.fecha || '');
  return !!f && f > String(m.desde || '');
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
