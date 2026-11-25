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
import { esT50, NOMBRE_T50 } from './envases.js';
import { sumaLitros, nombreTanque } from './ot-vasijas.js';
import { normalizarAchique, movimientosDeAchique, movIdsDeOT, nombreDestino } from './ot-achique.js';
import { esSalida } from './ot-plantillas.js';
import { normalizarExtras, movimientosDeExtras, extrasDeOT, restoDestino1, nombreExtra, destinoDeLote, unirDestinos } from './ot-destinos.js';

const numOk = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null;

export function litrosPrevistos(barriles){
  return (barriles || []).reduce((s, b) => s + (numOk(b && b.cap) ?? 0), 0);
}

// 300 L separa barrica (225/228) de tanques chicos (t500) en el inventario.
const CAP_BARRICA = 300;

/* Los T50 se cuentan aparte: "2 T50", "10 barricas + 2 T50". El Mapa puede
 * traer cap como texto ('50'), por eso Number() y no numOk(). */
function resumenBarriles(l){
  const cantidad = Number(l && l.cantidad_barricas);
  if (Number.isInteger(cantidad) && cantidad > 0) return `${cantidad} Barricas`;
  const bs = (l && l.barriles) || [];
  if (!bs.length) return '';
  const t50 = bs.filter(b => esT50(b.cap)).length;
  if (bs.length === 1) return t50 ? `1 ${NOMBRE_T50} ${bs[0].num}` : `1 barrica ${bs[0].num}`;
  const resto = bs.filter(b => !esT50(b.cap));
  if (!resto.length) return `${t50} ${NOMBRE_T50}`;
  const todasBarricas = resto.every(b => (Number(b.cap) || 0) <= CAP_BARRICA);
  if (!todasBarricas) return `${bs.length} vasijas`;
  const barr = `${resto.length} ${resto.length === 1 ? 'barrica' : 'barricas'}`;
  return t50 ? `${barr} + ${t50} ${NOMBRE_T50}` : barr;
}

/* Barriles + tanques del padron + vasijas manuales: "10 barricas + T 201 +
 * IBC 1". Sin nada de eso, lo escrito a mano (OT viejas). */
export function resumenVasijas(l){
  const extra = [...((l && l.tanques) || []).map(t => nombreTanque(t.num)),
                 ...((l && l.otras) || []).map(o => o.nombre)];
  const todo = [resumenBarriles(l), ...extra].filter(Boolean);
  return todo.length ? todo.join(' + ') : String((l && l.vasijas_manual) || '');
}

/* Lote del corte (OT de barricas a tanque): el lote nuevo que se forma en el
 * tanque. null en las demás OT. */
function loteCorte(lc){
  const lote = String((lc && lc.lote) || '').trim();
  if (!lote) return null;
  const out = { lote, id_texto: String(lc.id_texto || '') };
  // El corte va a un lote que ya existia (no lo creo esta OT).
  if (lc.existente) out.existente = true;
  return out;
}

export function armarOT({ id, numero, plantilla, fecha, destino, emitio, lotes, lote_corte, achique, destinos_extra, mapaVersion, usuario, hoy }){
  const ot = {
    id, ot: numero, plantilla, fecha,
    estado: PENDIENTE,
    destino: String(destino || '').trim(),
    emitio: String(emitio || '').trim(),
    lote_corte: loteCorte(lote_corte),
    // Corte + achique: las vasijas definitivas del pulmon (ot-achique.js).
    achique: normalizarAchique(achique, id),
    lotes: (lotes || []).map((l, i) => {
      const n = Number(l.cantidad_barricas);
      const cantidad_barricas = Number.isInteger(n) && n > 0 ? n : null;
      const barriles = cantidad_barricas ? [] : (l.barriles || []).map(b => ({ ...b }));
      // Tanques del padron y vasijas fuera del sistema (IBC, bins): foto como
      // los barriles. Las filas vacias no se guardan.
      const tanques = (cantidad_barricas ? [] : (l.tanques || [])).filter(t => String(t.num ?? '').trim())
        .map(t => ({ num: String(t.num).trim(), litros: numOk(t.litros) }));
      const otras = (cantidad_barricas ? [] : (l.otras || [])).filter(o => String(o.nombre ?? '').trim())
        .map(o => ({ nombre: String(o.nombre).trim(), litros: numOk(o.litros) }));
      const hayVasijas = barriles.length || tanques.length || otras.length;
      const out = {
        lote: String(l.lote),
        id_texto: l.id_texto || '',
        organico: !!l.organico,
        barriles, tanques, otras, cantidad_barricas,
        vasijas_manual: cantidad_barricas ? '' : l.vasijas_manual || '',
        // Sin barriles no hay de donde sacar litros: litrosPrevistos([]) da 0 y
        // un lote manual sin litros cargados quedaria mintiendo "0 L" en la hoja.
        litros_previstos: l.litros_previstos ?? (hayVasijas ? sumaLitros({ barriles, tanques, otras }) : null),
        // Solo en las OT desde tanque: cuantas barricas se van a llenar (rotulos y
        // filas de la planilla de llenado). Con barriles del Mapa no hace falta.
        barricas_previstas: numOk(l.barricas_previstas),
        destino_real: '', litros_reales: null, merma: null,
        mov_id: `${id}-${i}`,
      };
      // Trasiego simple: el primer destino de este lote (conserva su numero).
      if (String(l.destino ?? '').trim()) out.destino = String(l.destino).trim();
      // Tanques destino extra de este lote (ot-destinos.js): cada uno hijo del lote.
      const extras = normalizarExtras(l.destinos_extra, id, `x${i}`);
      if (extras.length) out.destinos_extra = extras;
      return out;
    }),
    pasos_cumplidos: false,
    operario: '', comentario: '',
    emitida_por: usuario || '', emitida_el: hoy,
    confirmada_por: '', confirmada_el: '',
    mapa_version: mapaVersion ?? null,
  };
  // Sin destino de la OT: la lista de los destinos de cada lote.
  if (!ot.destino) ot.destino = unirDestinos(ot.lotes);
  // Corte: los tanques destino extra son hijos del lote del corte.
  const ex = ot.lote_corte ? normalizarExtras(destinos_extra, id, 'xc') : [];
  if (ex.length) ot.destinos_extra = ex;
  return ot;
}

/* En un corte cada lote de origen se TRASPASA al lote del corte: el linaje
 * solo arma padre -> hijo con traspasos, y el traspaso es además el egreso que
 * explica por qué el lote de origen se quedó sin vino. */
export function movimientosDeOT(ot, usuario, hoy){
  // Muestras (0993): la OT no mueve vino.
  if (ot && ot.sin_movimientos) return [];
  const corte = ot.lote_corte && ot.lote_corte.lote;
  // El lote del corte que tambien es origen no se traspasa a si mismo (el
  // linaje lo haria su propio padre): su vino solo cambia de vasija.
  const traspasa = l => !!corte && String(l.lote) !== String(corte);
  // Traslado: el vino se va de la bodega. ot.destino es la bodega destino, no
  // una vasija: va en destino_externo, como una salida cargada a mano.
  const sale = esSalida(ot.plantilla);
  const movs = ot.lotes.map(l => ({
    id: l.mov_id,
    lote: l.lote,
    tipo: sale ? 'salida' : traspasa(l) ? 'traspaso' : 'trasiego',
    fecha: ot.fecha,
    vasija_origen: resumenVasijas(l),
    vasija_destino: sale ? '' : destinoDeLote(ot, l),
    // Trasiego simple con tanques extra (todos con litros): al destino 1 va
    // solo el resto. En el Corte los extra salen del lote del corte.
    litros: corte ? l.litros_previstos : restoDestino1(l.litros_previstos, l.destinos_extra),
    lote_destino: traspasa(l) ? corte : '', destino_externo: sale ? ot.destino : '',
    estado: PENDIENTE,
    ot: ot.ot,
    operario: '', comentario: '',
    cargado_por: usuario || '', cargado_el: hoy,
  }));
  // Corte + achique: ademas, un traspaso del lote del corte a cada lote hijo.
  // Tanques destino extra: un traspaso padre -> hijo por cada uno.
  return movs.concat(movimientosDeAchique(ot, usuario, hoy), movimientosDeExtras(ot, usuario, hoy));
}

/* La bodega destino de un Traslado va en destino_externo, que la grilla de
 * Movimientos valida contra config.destinos_externos: si no esta, se suma a
 * la lista (sin repetir por mayusculas). Devuelve el nombre como quedo en la
 * lista, o '' si no hay destino. */
export function sumarDestinoExterno(config, destino){
  const v = String(destino || '').trim();
  if (!v) return '';
  if (!Array.isArray(config.destinos_externos)) config.destinos_externos = [];
  const ya = config.destinos_externos.find(d => String(d).toLowerCase() === v.toLowerCase());
  if (ya) return ya;
  config.destinos_externos.push(v);
  return v;
}

export function confirmarOT(ot, movimientos, reales, usuario, hoy){
  const porId = new Map((movimientos || []).map(m => [m.id, m]));
  const faltan = [];
  ot.lotes.forEach((l, i) => {
    const r = (reales.por_lote || [])[i] || {};
    l.destino_real = String(r.destino_real || '').trim();
    l.litros_reales = r.litros_reales ?? null;
    // merma_litros (2026-10-01) reemplaza al campo viejo sin unidad; merma se
    // sigue llenando para que las hojas ya impresas lean lo mismo.
    l.merma_litros = r.merma_litros ?? null;
    l.merma = r.merma_litros ?? r.merma ?? null;
    const m = porId.get(l.mov_id);
    if (!m){ faltan.push(l.mov_id); return; }
    // Los reales PISAN a los previstos: desde aca el movimiento es el registro
    // de lo que paso, y recien ahora cuenta para etapas y linaje.
    if (m.tipo === 'salida') m.destino_externo = l.destino_real || ot.destino;
    else m.vasija_destino = l.destino_real || ot.destino;
    m.litros = l.litros_reales;
    m.merma_litros = l.merma_litros;
    m.operario = reales.operario;
    m.estado = EJECUTADO;
  });
  // Corte + achique: lo que llego a cada vasija definitiva. El traspaso al
  // hijo toma esos litros; la base no tiene movimiento.
  ((ot.achique && ot.achique.destinos) || []).forEach((d, k) => {
    const r = (reales.achique || [])[k] || {};
    d.destino_real = String(r.destino_real || '').trim();
    d.litros_reales = r.litros_reales ?? null;
    if (!d.mov_id) return;
    const m = porId.get(d.mov_id);
    if (!m){ faltan.push(d.mov_id); return; }
    m.vasija_destino = d.destino_real || nombreDestino(d);
    m.litros = d.litros_reales;
    m.merma_litros = null;
    m.operario = reales.operario;
    m.estado = EJECUTADO;
  });
  // Tanques destino extra: cada uno con lo medido y su propia merma.
  for (const r of reales.extras || []){
    const d = r.i == null ? (ot.destinos_extra || [])[r.k] : (((ot.lotes || [])[r.i] || {}).destinos_extra || [])[r.k];
    if (!d) continue;
    d.destino_real = String(r.destino_real || '').trim();
    d.litros_reales = r.litros_reales ?? null;
    d.merma_litros = r.merma_litros ?? null;
    const m = porId.get(d.mov_id);
    if (!m){ faltan.push(d.mov_id); continue; }
    m.vasija_destino = d.destino_real || nombreExtra(d);
    m.litros = d.litros_reales;
    m.merma_litros = d.merma_litros;
    m.operario = reales.operario;
    m.estado = EJECUTADO;
  }
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
  return (ordenes || []).find(o => movIdsDeOT(o).includes(id)) || null;
}

/* Borra la OT y TODOS sus movimientos: borrar en el Historial una fila de una
 * OT borra la OT entera (decision del usuario), para que no quede una OT sin
 * movimientos en la lista. El lote que haya creado un Corte no se toca. Borra
 * en el lugar (las vistas tienen referencias a estos arrays) y devuelve
 * cuantos movimientos saco. */
export function eliminarOT(datos, ot){
  const ids = new Set(movIdsDeOT(ot));
  const movs = datos.movimientos || [];
  const antes = movs.length;
  for (let i = movs.length - 1; i >= 0; i--) if (ids.has(movs[i].id)) movs.splice(i, 1);
  const ordenes = datos.ordenes_trabajo || [];
  const i = ordenes.indexOf(ot);
  if (i !== -1) ordenes.splice(i, 1);
  return antes - movs.length;
}
