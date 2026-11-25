/* ===== Lotes CIW — la OT a medio armar, a salvo de una recarga (puro) =====
 *
 * Emitir OT y el asistente del Corte guardan su sesion en localStorage en
 * cada cambio; al volver a abrir Emitir OT se ofrece retomarla. Aca vive lo
 * que no toca el DOM: pasar los Set de barriles tildados a arrays y de vuelta,
 * leer el borrador (vence a los 7 dias) y describirlo. */
'use strict';

export const CLAVE_BORRADOR = 'lotes_ot_borrador';
const VENCE_MS = 7 * 24 * 3600 * 1000;

export function fotoLotes(lotes){
  return (lotes || []).map(l => ({ ...l, tildados: [...(l.tildados || [])] }));
}

export function lotesDeFoto(foto){
  if (!Array.isArray(foto)) return [];
  return foto.filter(l => l && l.lote != null).map(l => ({
    ...l,
    barriles: Array.isArray(l.barriles) ? l.barriles : [],
    tildados: new Set(Array.isArray(l.tildados) ? l.tildados : []),
    tanques: Array.isArray(l.tanques) ? l.tanques : [],
    otras: Array.isArray(l.otras) ? l.otras : [],
  }));
}

export function leerBorrador(storage, ahora = Date.now()){
  try {
    const txt = storage && storage.getItem(CLAVE_BORRADOR);
    if (!txt) return null;
    const b = JSON.parse(txt);
    if (!b || (b.tipo !== 'emitir' && b.tipo !== 'corte')) return null;
    if (!(Number(b.ts) > ahora - VENCE_MS)) return null;
    return b;
  } catch { return null; }
}

export function resumenBorrador(b){
  const num = b && b.cab && String(b.cab.numero || '').trim();
  const lotes = ((b && b.lotes) || []).map(l => l.lote);
  return (b && b.tipo === 'corte' ? 'Corte' : 'OT') + (num ? ' · N° ' + num : ' sin número') +
    ' · ' + (lotes.length ? 'lotes ' + lotes.join(', ') : 'sin lotes');
}
