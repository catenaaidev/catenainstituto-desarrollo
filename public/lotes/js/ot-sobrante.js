/* ===== Lotes CIW — sobrante al confirmar una OT de trasiego (puro) =====
 *
 * Al trasegar muchas veces el vino no entra todo en el destino y se llena
 * alguna vasija de mas (OT 0967: T 48 + 1 barrica + 1 T50). Al confirmar se
 * puede sumar a la OT (spec 2026-11-16-ot-sobrante-al-confirmar-design.md):
 *   - el Mapa lo detecta (llenados con el n° de esta OT que la OT no preveia);
 *   - o se carga a mano ("+ Sobro vino").
 * Lo agregado es un destino extra mas (ot-destinos.js) con al_confirmar: true;
 * si lleva el mismo lote que su padre, se suma al lote (sin hijo). */
'use strict';

import { capNormal, esItemCorte } from './propuesta-ot.js';
import { esChicas, nombreExtra, normalizarExtras, movimientosDeExtras, armarHijosExtra, validarExtras, validarExtrasEntreLotes,
         extrasDeOT } from './ot-destinos.js';
import { normalizarNumVasija } from './vasijas-padron.js';
import { movIdsDeOT } from './ot-achique.js';
import { codigoLote } from './mermas.js';

const txt = v => String(v ?? '').trim();

/* Los lotes que reciben vino en un TANQUE: el del corte, o cada origen en un
 * trasiego a tanque. Un lote que ya tiene barricas/T50 de destino (extra
 * 'chicas' o vasija 'chicas' del achique) no se mira: ahi los llenados del
 * Mapa son lo previsto. tipo = tipoDestino(ot.plantilla). */
export function sobranteSegunMapa(ot, porLote, tipo){
  if (tipo !== 'tanque' || !ot) return [];
  const corte = ot.lote_corte && txt(ot.lote_corte.lote);
  const candidatos = corte
    ? [{ i: null, lote: corte, tieneChicas: (ot.destinos_extra || []).some(esChicas)
        || ((ot.achique && ot.achique.destinos) || []).some(d => d && d.tipo === 'chicas') }]
    : (ot.lotes || []).map((l, i) => ({ i, lote: txt(l.lote), tieneChicas: (l.destinos_extra || []).some(esChicas) }));
  const out = [];
  for (const c of candidatos){
    if (c.tieneChicas) continue;
    const g = (porLote || {})[codigoLote(c.lote)];
    if (!g || !g.llenados || !g.llenados.length) continue;
    let barricas = 0, t50 = 0;
    const codigos = [], sinCap = [];
    for (const x of g.llenados){
      const cap = capNormal(x.cap);
      if (cap === 50){ t50++; codigos.push(String(x.num)); }
      else if (cap === 225){ barricas++; codigos.push(String(x.num)); }
      else sinCap.push(String(x.num));
    }
    if (barricas || t50) out.push({ i: c.i, lote: c.lote, barricas, t50, codigos, sinCap });
  }
  return out;
}

/* La fila que se guarda de un agregado (antes de normalizar). */
const filaDe = a => ({ ...(a.tipo === 'chicas' ? { tipo: 'chicas', barricas: a.barricas, t50: a.t50 } : { tipo: 'tanque', num: a.num }),
  litros: null, lote: txt(a.lote), al_confirmar: true, ...(a.codigos && a.codigos.length ? { codigos_mapa: a.codigos } : {}) });

/* Suma los agregados a `ot` (la muta). mov_id ${ot.id}-s-N sin chocar. */
function sumarAOT(ot, agregados){
  const ocupados = movIdsDeOT(ot);
  const nuevos = [];
  for (const a of agregados || []){
    const destino = a.i == null ? ot : ot.lotes[a.i];
    const [d] = normalizarExtras([filaDe(a)], ot.id, 's', [...ocupados, ...nuevos.map(x => x.mov_id)]);
    if (!d) continue;
    destino.destinos_extra = [...(destino.destinos_extra || []), d];
    nuevos.push(d);
  }
  return nuevos;
}

/* Copia de la OT con los agregados como destinos extra (para la propuesta
 * del paso 2). No toca `ot`. */
export function otConAgregados(ot, agregados){
  const c = { ...ot, lotes: (ot.lotes || []).map(l => ({ ...l, ...(l.destinos_extra ? { destinos_extra: [...l.destinos_extra] } : {}) })),
    ...(ot.destinos_extra ? { destinos_extra: [...ot.destinos_extra] } : {}) };
  sumarAOT(c, agregados);
  return c;
}

/* Al aplicar: los agregados quedan en la OT viva, cada uno con su movimiento
 * (PENDIENTE: confirmarOT lo pasa a EJECUTADO con los reales) y, si es lote
 * nuevo, su lote hijo. Devuelve los hijos creados (para fijarlos en la grilla). */
export function incorporarAgregados(datos, ot, agregados, usuario, hoy, fichaDe){
  const nuevos = new Set(sumarAOT(ot, agregados).map(d => d.mov_id));
  if (!Array.isArray(datos.movimientos)) datos.movimientos = [];
  datos.movimientos.push(...movimientosDeExtras(ot, usuario, hoy).filter(m => nuevos.has(m.id)));
  const soloNuevos = { ...ot, destinos_extra: (ot.destinos_extra || []).filter(d => nuevos.has(d.mov_id)),
    lotes: (ot.lotes || []).map(l => ({ ...l, destinos_extra: (l.destinos_extra || []).filter(d => nuevos.has(d.mov_id)) })) };
  if (!Array.isArray(datos.lotes)) datos.lotes = [];
  const hijos = armarHijosExtra(soloNuevos, fichaDe, datos.lotes);
  for (const h of hijos) datos.lotes.unshift(h);
  return { hijos };
}

/* Los lugares (clave 'c' = el corte, '0','1'... = lote i) que de verdad se
 * aplican: los de los items aplicables (indices ks de propuesta.items). Un
 * lote va entero con sus extras y el corte todo o nada (ver _aplicables). */
export function lugaresAplicados(items, ks){
  const out = new Set();
  for (const k of ks || []){
    const it = (items || [])[k];
    if (!it) continue;
    if (esItemCorte(it)) out.add('c');
    else if (it.indice != null) out.add(String(it.indice));
  }
  return out;
}

/* Solo se guardan los agregados de un lugar que se aplica: si no (cancelar,
 * "No tocar", bloqueado), no queda nada guardado de ellos. Van al final de
 * cada lista: saltearlos no corre los {i,k} de los que quedan. */
export function agregadosAplicables(agregados, lugares){
  return (agregados || []).filter(a => lugares.has(a.i == null ? 'c' : String(a.i)));
}

/* Validaciones de destino de lo que sobro, como al emitir (validarExtras):
 * sobre la OT con los agregados (otConAgregados), solo en los lugares que
 * tienen alguno. Los extras que ya tenia la OT pasaron al emitirse: sus
 * lotes cuentan como propios (el hijo puede estar creado). Ademas un tanque
 * agregado no puede ser el destino de ningun lugar de la OT.
 *   destinos: clave del lugar ('c' | i) -> tanque destino cargado en el paso 1;
 *   tanquesOT: todos los tanques destino de la OT (lotes, corte, achique). */
export function validarAgregados(otV, { lotes, destinos, tanquesOT } = {}){
  const corte = otV.lote_corte && txt(otV.lote_corte.lote);
  const lugares = corte ? [{ clave: 'c', padre: corte, lista: otV.destinos_extra || [] }]
    : (otV.lotes || []).map((l, i) => ({ clave: String(i), padre: txt(l.lote), lista: l.destinos_extra || [] }));
  const origenes = (otV.lotes || []).map(l => txt(l.lote));
  for (const L of lugares){
    if (!L.lista.some(d => d && d.al_confirmar)) continue;
    const propios = new Set(L.lista.filter(d => d && !d.al_confirmar).map(d => txt(d.lote)));
    const r = validarExtras(L.lista, { lotes, origenes, loteCorte: corte || '', destino1: (destinos || {})[L.clave],
      propios, mismoLote: L.padre });
    if (!r.ok) return r;
  }
  const ocupados = new Set((tanquesOT || []).map(t => txt(t) ? normalizarNumVasija(t) : '').filter(Boolean));
  for (const x of extrasDeOT(otV)){
    if (!x.d.al_confirmar || esChicas(x.d)) continue;
    if (ocupados.has(normalizarNumVasija(x.d.num))) return { ok: false, error: `El ${nombreExtra(x.d)} ya es el destino de la OT.` };
  }
  return corte ? { ok: true } : validarExtrasEntreLotes(lugares.map(L => L.lista));
}
