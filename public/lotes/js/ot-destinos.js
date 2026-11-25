/* ===== Lotes CIW — tanques destino extra de una OT de trasiego (puro) =====
 *
 * Cuando por los litros el vino no entra en el destino de la OT (ot.destino),
 * se agregan tanques extra. Cada tanque extra es SIEMPRE un lote nuevo, hijo
 * del lote que lo llena (decision del usuario 2026-11-12): asi cada tanque
 * tiene sus litros exactos y nunca hay un lote repartido en dos tanques.
 *   - trasiego simple: ot.lotes[i].destinos_extra (cada lote a sus tanques);
 *   - Corte: ot.destinos_extra (hijos del lote del corte).
 * El item tiene la forma de un destino del achique (ot-achique.js):
 *   { tipo: 'tanque', num, litros, lote, nuevo: true, mov_id }
 *   { tipo: 'chicas', barricas, t50, litros, lote, nuevo: true, mov_id }
 * Las barricas y T50 de un extra van juntas en UNA fila y son un lote
 * (pedido del usuario 2026-11-13); las cantidades son opcionales al emitir
 * y se exigen al confirmar (llenas).
 * Cada extra tiene un traspaso padre -> hijo, que arma el linaje.
 * Excepcion (pedido 2026-11-16, OT 0967): el extra puede llevar el MISMO
 * numero del lote que lo llena (las barricas siguen siendo ese lote):
 *   - al emitir, solo en un Corte a un lote EXISTENTE (mismoLoteCorte);
 *   - al confirmar (lo que sobro, ot-sobrante.js), en el Corte y tambien en
 *     el trasiego simple (mismoLote = el lote de origen).
 * Ahi no hay hijo: el movimiento es un trasiego de ese lote y al confirmar
 * sus litros se suman a su item (propuesta-ot.js). */
'use strict';

import { siguienteLote, validarNumeroLote, armarHijo } from './lote-nuevo.js';
import { nombreTanque } from './ot-vasijas.js';
import { normalizarNumVasija } from './vasijas-padron.js';
import { PENDIENTE } from './ot-movimientos.js';
import { NOMBRE_T50 } from './envases.js';

const txt = v => String(v ?? '').trim();
const sinT = num => txt(num).replace(/^t\s*/i, '');
const numONull = x => {
  if (x === '' || x == null) return null;
  const v = Number(String(x).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

const ent = x => { const v = Math.floor(Number(x)); return Number.isFinite(v) && v > 0 ? v : 0; };
export const esChicas = d => !!d && d.tipo === 'chicas';

/* x = un item de extrasDeOT. El extra que sigue siendo el lote que lo llena
 * (Corte: el lote del corte; trasiego simple: el lote de origen). */
export const esExtraMismoLote = x => !!x && !!txt(x.d && x.d.lote) && txt(x.d.lote) === txt(x.padre);

const PLANTILLAS = new Set(['barricas-barricas', 'tq-barricas', 'barrica-tanque', 'tq-tq', 'barricas-tanque']);
export const admiteExtras = id => PLANTILLAS.has(id);

/* El primer destino de cada lote (pedido 2026-11-13): en los trasiegos
 * simples se elige por lote (lotes[i].destino) y conserva el numero del lote;
 * ot.destino queda con la lista de todos (papel, listado, OT viejas). Una OT
 * vieja no tiene lotes[i].destino: vale el de la OT. */
export const destinoDeLote = (ot, l) => txt(l && l.destino) || txt(ot && ot.destino);
export const unirDestinos = lotes => [...new Set((lotes || []).map(l => txt(l && l.destino)).filter(Boolean))].join(' + ');

export function nombreExtra(d){
  if (!esChicas(d)) return nombreTanque(sinT(d && d.num));
  const b = ent(d.barricas), t = ent(d.t50);
  if (!b && !t) return 'Barricas / T50';
  const partes = [];
  if (b || !t) partes.push(b === 1 ? '1 barrica' : `${b} barricas`);
  if (t) partes.push(`${t} ${NOMBRE_T50}`);
  return partes.join(' + ');
}

/* Lo que se guarda: filas con numero de tanque, sin la "T" (o la fila de
 * barricas/T50), litros numericos o null, y un mov_id por fila (conserva el
 * que ya tenia, para editar).
 * `ocupados` (opcional): ids que los nuevos no pueden tomar. */
export function normalizarExtras(lista, otId, prefijo, ocupados){
  const ds = (lista || []).filter(d => d && (esChicas(d) || sinT(d.num)));
  const usados = new Set([...ds.map(d => d.mov_id).filter(Boolean), ...(ocupados || [])]);
  let k = 0;
  const nuevoId = () => { let id; do { id = `${otId}-${prefijo}-${k++}`; } while (usados.has(id)); usados.add(id); return id; };
  return ds.map(d => ({ ...(esChicas(d) ? { tipo: 'chicas', barricas: ent(d.barricas), t50: ent(d.t50) }
    : { tipo: 'tanque', num: sinT(d.num) }), litros: numONull(d.litros), lote: txt(d.lote),
    nuevo: true, mov_id: d.mov_id || nuevoId(),
    ...(d.al_confirmar ? { al_confirmar: true } : {}),
    ...(Array.isArray(d.codigos_mapa) && d.codigos_mapa.length ? { codigos_mapa: d.codigos_mapa.map(String) } : {}) }));
}

/* Pone el lote a los que no tienen: el siguiente libre del año, sin chocar con
 * los lotes existentes, con lo ya escrito ni con `reservados` (los hijos de
 * otros lotes de la misma OT). Devuelve una copia. */
export function asignarLotesExtra(lista, { lotes, anio, reservados }){
  const tomados = new Set([...(lotes || []).map(l => txt(l && l.lote)), ...(reservados || []).map(txt)]);
  for (const d of lista || []) if (txt(d.lote)) tomados.add(txt(d.lote));
  return (lista || []).map(d => {
    let lote = txt(d.lote);
    if (!lote){ lote = siguienteLote([...tomados].map(x => ({ lote: x })), anio); tomados.add(lote); }
    return { ...d, lote };
  });
}

/* `propios` = hijos que esta misma OT ya creo (al editar): estan en Lotes pero
 * no son un numero ocupado. `destino1` = ot.destino. `mismoLoteCorte`: el
 * Corte va a un lote existente y un extra puede llevar ese mismo numero.
 * `mismoLote` (agregados al confirmar): el lote que llena estos extras; los
 * que lo llevan solo se validan por tanque (pueden ser varios). */
export function validarExtras(lista, { lotes, padron, origenes, loteCorte, destino1, propios, mismoLoteCorte, mismoLote } = {}){
  const no = error => ({ ok: false, error });
  const d1 = txt(destino1) ? normalizarNumVasija(destino1) : '';
  const tanques = new Set(), vistos = new Set();
  if ((lista || []).filter(esChicas).length > 1) return no('Las barricas y T50 extra van todas en una sola fila.');
  for (const d of lista || []){
    // "del T 214" / "de las barricas" en los mensajes.
    const de = esChicas(d) ? 'de las barricas' : 'del ' + nombreExtra(d);
    if (!esChicas(d)){
      if (!sinT(d.num)) return no('Falta el número de un tanque destino extra.');
      const n = normalizarNumVasija(d.num);
      if (d1 && n === d1) return no(`El ${nombreExtra(d)} ya es el destino de la OT.`);
      if (tanques.has(n)) return no(`El ${nombreExtra(d)} está dos veces.`);
      tanques.add(n);
    }
    const l = numONull(d.litros);
    if (l != null && l <= 0) return no(`Los litros ${de} tienen que ser más que 0.`);
    const t = txt(d.lote);
    if (!t) return no(`Falta el lote ${de}.`);
    if (txt(mismoLote) && t === txt(mismoLote)) continue;
    if (vistos.has(t)) return no(`El lote ${t} está repetido en los destinos.`);
    vistos.add(t);
    if (txt(loteCorte) && t === txt(loteCorte)){
      if (mismoLoteCorte) continue;
      return no(`El lote ${t} es el lote del corte.`);
    }
    if ((origenes || []).some(o => txt(o) === t)) return no(`El lote ${t} es uno de los lotes de origen.`);
    if (!(propios && propios.has(t))){
      const v = validarNumeroLote(t, lotes || []);
      if (!v.ok) return no(v.error);
    }
  }
  return { ok: true };
}

/* Entre los lotes de una misma OT (`listas` = los extra de cada lote): un
 * tanque extra no puede estar en dos lotes, ni un lote nuevo en dos tanques.
 * Los repetidos dentro de una misma lista los ve validarExtras. */
export function validarExtrasEntreLotes(listas){
  const tanques = new Map(), lotes = new Map();
  for (const [j, lista] of (listas || []).entries()){
    for (const d of lista || []){
      if (!d || (!esChicas(d) && !sinT(d.num))) continue;
      if (!esChicas(d)){
        const n = normalizarNumVasija(d.num);
        if (tanques.has(n) && tanques.get(n) !== j) return { ok: false, error: `El ${nombreExtra(d)} está en dos lotes.` };
        tanques.set(n, j);
      }
      const t = txt(d.lote);
      if (!t) continue;
      if (lotes.has(t) && lotes.get(t) !== j) return { ok: false, error: `El lote ${t} está en dos destinos extra.` };
      lotes.set(t, j);
    }
  }
  return { ok: true };
}

/* Litros que van al destino 1 (ot.destino): los previstos menos los de los
 * extra, solo si se conocen todos (los previstos y los de cada extra). Si
 * no, los previstos tal cual. Sin extras, siempre los previstos tal cual. */
export function restoDestino1(previstos, extras){
  const ds = (extras || []).filter(Boolean);
  const p = numONull(previstos);
  if (!ds.length || p == null || ds.some(d => numONull(d.litros) == null)) return previstos;
  return Math.round((p - ds.reduce((s, d) => s + numONull(d.litros), 0)) * 10) / 10;
}

/* Todos los extra de la OT con su lote padre. i = indice del lote (null en el Corte). */
export function extrasDeOT(ot){
  if (!ot) return [];
  const out = [];
  const corte = ot.lote_corte && txt(ot.lote_corte.lote);
  if (corte) (ot.destinos_extra || []).forEach((d, k) => out.push({ i: null, k, d, padre: corte }));
  else (ot.lotes || []).forEach((l, i) => (l.destinos_extra || []).forEach((d, k) => out.push({ i, k, d, padre: txt(l.lote) })));
  return out;
}

/* Mismo lote del corte: trasiego (el vino solo cambia de vasija), sin
 * lote_destino, asi el linaje no lo hace su propio padre. */
export function movimientosDeExtras(ot, usuario, hoy){
  return extrasDeOT(ot).map(x => ({ ...x, mismo: esExtraMismoLote(x) })).map(({ i, d, padre, mismo }) => ({
    id: d.mov_id, lote: padre, tipo: mismo ? 'trasiego' : 'traspaso', fecha: ot.fecha,
    vasija_origen: (i == null ? txt(ot.destino) : destinoDeLote(ot, ot.lotes[i])) || '', vasija_destino: nombreExtra(d), litros: d.litros,
    lote_destino: mismo ? '' : txt(d.lote), destino_externo: '', estado: PENDIENTE, ot: ot.ot,
    operario: '', comentario: '', cargado_por: usuario || '', cargado_el: hoy,
  }));
}

/* Lotes hijos a crear: copia de la ficha del padre (armarHijo: sin litros ni
 * envases), en 0 L y sin vasija, con el numero del extra; los que ya estan en
 * `existentes` no se repiten. */
export function armarHijosExtra(ot, fichaDe, existentes){
  const hay = new Set((existentes || []).map(l => txt(l && l.lote)));
  const out = [];
  for (const { d, padre } of extrasDeOT(ot)){
    const t = txt(d.lote);
    if (!t || hay.has(t) || t === txt(padre)) continue;
    hay.add(t);
    const h = armarHijo(fichaDe(padre) || {});
    const n = Number(t);
    h.lote = Number.isFinite(n) ? n : t;
    h.vasija_actual = '';
    out.push(h);
  }
  return out;
}
