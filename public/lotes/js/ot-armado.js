/* ===== Lotes CIW — armado y confirmacion de las OT de trasiego (puro) =====
 *
 * Una OT agrupa uno o mas lotes que van al mismo destino. Genera UN movimiento
 * por lote, porque etapas y linaje leen movimientos por lote y no saben nada de
 * OT: asi un corte de tres lotes queda en el historial de cada uno.
 *
 * Los barriles se guardan como FOTO al emitir: la hoja impresa tiene que
 * coincidir con el sistema aunque el Mapa cambie despues (y va a cambiar apenas
 * el operario escanee el vaciado). */
'use strict';

import { PENDIENTE, EJECUTADO } from './ot-movimientos.js';

const numOk = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null;

export function litrosPrevistos(barriles){
  return (barriles || []).reduce((s, b) => s + (numOk(b && b.cap) ?? 0), 0);
}

// 300 L separa barrica (225/228) de tanques chicos (t500) en el inventario.
const CAP_BARRICA = 300;

export function resumenVasijas(l){
  const bs = (l && l.barriles) || [];
  if (!bs.length) return String((l && l.vasijas_manual) || '');
  if (bs.length === 1) return `1 barrica ${bs[0].num}`;
  const todasBarricas = bs.every(b => (numOk(b.cap) ?? 0) <= CAP_BARRICA);
  return `${bs.length} ${todasBarricas ? 'barricas' : 'vasijas'}`;
}

/* Lote del corte (OT de barricas a tanque): el lote nuevo que se forma en el
 * tanque. null en las demás OT. */
function loteCorte(lc){
  const lote = String((lc && lc.lote) || '').trim();
  return lote ? { lote, id_texto: String(lc.id_texto || '') } : null;
}

export function armarOT({ id, numero, plantilla, fecha, destino, emitio, lotes, lote_corte, mapaVersion, usuario, hoy }){
  return {
    id, ot: numero, plantilla, fecha,
    estado: PENDIENTE,
    destino: String(destino || '').trim(),
    emitio: String(emitio || '').trim(),
    lote_corte: loteCorte(lote_corte),
    lotes: (lotes || []).map((l, i) => {
      const barriles = (l.barriles || []).map(b => ({ ...b }));
      return {
        lote: String(l.lote),
        id_texto: l.id_texto || '',
        organico: !!l.organico,
        barriles,
        vasijas_manual: l.vasijas_manual || '',
        // Sin barriles no hay de donde sacar litros: litrosPrevistos([]) da 0 y
        // un lote manual sin litros cargados quedaria mintiendo "0 L" en la hoja.
        litros_previstos: l.litros_previstos ?? (barriles.length ? litrosPrevistos(barriles) : null),
        // Solo en las OT desde tanque: cuantas barricas se van a llenar (rotulos y
        // filas de la planilla de llenado). Con barriles del Mapa no hace falta.
        barricas_previstas: numOk(l.barricas_previstas),
        destino_real: '', litros_reales: null, merma: null,
        mov_id: `${id}-${i}`,
      };
    }),
    pasos_cumplidos: false,
    operario: '', comentario: '',
    emitida_por: usuario || '', emitida_el: hoy,
    confirmada_por: '', confirmada_el: '',
    mapa_version: mapaVersion ?? null,
  };
}

/* En un corte cada lote de origen se TRASPASA al lote del corte: el linaje
 * solo arma padre -> hijo con traspasos, y el traspaso es además el egreso que
 * explica por qué el lote de origen se quedó sin vino. */
export function movimientosDeOT(ot, usuario, hoy){
  const corte = ot.lote_corte && ot.lote_corte.lote;
  return ot.lotes.map(l => ({
    id: l.mov_id,
    lote: l.lote,
    tipo: corte ? 'traspaso' : 'trasiego',
    fecha: ot.fecha,
    vasija_origen: resumenVasijas(l),
    vasija_destino: ot.destino,
    litros: l.litros_previstos,
    lote_destino: corte || '', destino_externo: '',
    estado: PENDIENTE,
    ot: ot.ot,
    operario: '', comentario: '',
    cargado_por: usuario || '', cargado_el: hoy,
  }));
}

export function confirmarOT(ot, movimientos, reales, usuario, hoy){
  const porId = new Map((movimientos || []).map(m => [m.id, m]));
  const faltan = [];
  ot.lotes.forEach((l, i) => {
    const r = (reales.por_lote || [])[i] || {};
    l.destino_real = String(r.destino_real || '').trim();
    l.litros_reales = r.litros_reales ?? null;
    l.merma = r.merma ?? null;
    const m = porId.get(l.mov_id);
    if (!m){ faltan.push(l.mov_id); return; }
    // Los reales PISAN a los previstos: desde aca el movimiento es el registro
    // de lo que paso, y recien ahora cuenta para etapas y linaje.
    m.vasija_destino = l.destino_real || ot.destino;
    m.litros = l.litros_reales;
    m.operario = reales.operario;
    m.estado = EJECUTADO;
  });
  ot.estado = EJECUTADO;
  ot.operario = reales.operario;
  ot.pasos_cumplidos = !!reales.pasos_cumplidos;
  ot.comentario = String(reales.comentario || '').trim();
  ot.confirmada_por = usuario || '';
  ot.confirmada_el = hoy;
  return faltan;
}

export function sinEscanear(ot, porLote){
  const out = [];
  for (const l of ot.lotes){
    const llenos = new Set(((porLote || {})[l.lote] || [])
      .filter(b => b.estado === 'LLENO').map(b => String(b.num)));
    for (const b of l.barriles){
      if (llenos.has(String(b.num))) out.push({ lote: l.lote, num: String(b.num) });
    }
  }
  return out;
}

export function otDeMovimiento(ordenes, mov){
  const id = mov && mov.id;
  if (!id) return null;
  return (ordenes || []).find(o => (o.lotes || []).some(l => l.mov_id === id)) || null;
}
