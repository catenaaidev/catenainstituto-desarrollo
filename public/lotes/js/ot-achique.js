/* ===== Lotes CIW — vasijas definitivas de la OT "Corte + achique" (puro) =====
 *
 * El Corte + achique junta los lotes de origen en un tanque pulmon (el lote
 * del corte) y, en la misma orden, reparte el pulmon en sus vasijas
 * definitivas (0943 Corte PN Grand Mere). Cada vasija definitiva es un lote:
 *   - el primer tanque se queda con el numero del corte (la "base"); sin
 *     tanques, la base son las chicas;
 *   - cada tanque mas es un lote NUEVO, hijo del corte, con sus mismos datos;
 *   - las barricas y T50 van juntas en UN destino 'chicas' y son un lote.
 * El pulmon siempre termina vacio.
 *
 *   ot.achique = { destinos: [{ tipo: 'tanque', num, clase, litros, lote, nuevo, mov_id }
 *                           | { tipo: 'chicas', barricas, t50, litros, lote, nuevo, mov_id }] }
 *
 * Al emitir muchas veces no se sabe todavia que tanque va a estar libre, ni
 * cuantas barricas salen, ni los litros de cada vasija. Por eso el tanque se
 * pide por TIPO (`clase` = { tipo, cap } del padron: "TANQUE AC.INOX. · 75 HL")
 * y el numero (`num` puede ser ''), las cantidades y los litros (`litros`
 * puede ser null) se completan al editar o al confirmar. Las OT viejas tienen
 * `num` y no tienen `clase`.
 *
 * La base no tiene movimiento (el vino ya es de ese lote); cada hijo tiene un
 * traspaso corte -> hijo, que es lo que arma el linaje.
 * Modulo puro (sin DOM ni nucleo.js) para testearlo en node. */
'use strict';

import { siguienteLote, validarNumeroLote, armarHijo } from './lote-nuevo.js';
import { nombreTanque } from './ot-vasijas.js';
import { normalizarNumVasija, buscarVasija } from './vasijas-padron.js';
import { NOMBRE_T50 } from './envases.js';
import { PENDIENTE } from './ot-movimientos.js';
import { LITROS_BARRICA, LITROS_T50 } from './ot-plantillas.js';
import { extrasDeOT, nombreExtra, esExtraMismoLote } from './ot-destinos.js';

const ent = x => { const v = Math.floor(Number(x)); return Number.isFinite(v) && v > 0 ? v : 0; };
const numONull = x => {
  if (x === '' || x == null) return null;
  const v = Number(String(x).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};
const txt = v => String(v ?? '').trim();
const sinT = num => txt(num).replace(/^t\s*/i, '');

export const litrosChicas = (barricas, t50) => ent(barricas) * LITROS_BARRICA + ent(t50) * LITROS_T50;

/* ---- Clases de tanque: tipo + capacidad del padron ---- */

// 7500 -> "75"; 2050 -> "20,5" (hectolitros, sin decimales si es entero).
const hl = cap => (Number(cap) / 100).toLocaleString('es-AR', { maximumFractionDigits: 2, useGrouping: false });

export const nombreClase = c => c && txt(c.tipo) ? `${txt(c.tipo)} · ${hl(c.cap)} HL` : '';

const limpiarClase = c => c && txt(c.tipo) && Number.isFinite(Number(c.cap))
  ? { tipo: txt(c.tipo), cap: Number(c.cap) } : null;

/* Una opcion por (tipo, cap_real) distinto de las vasijas activas del padron. */
export function clasesDeTanque(padron){
  const vistas = new Map();
  for (const v of padron || []){
    if (!v || v.activa === false) continue;
    const c = limpiarClase({ tipo: v.tipo, cap: v.cap_real });
    if (!c) continue;
    const k = c.tipo + '|' + c.cap;
    if (!vistas.has(k)) vistas.set(k, { ...c, nombre: nombreClase(c) });
  }
  return [...vistas.values()].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.cap - b.cap);
}

/* La clase del tanque con ese numero en el padron, o null si no esta. */
export function claseDeNum(padron, num){
  const v = txt(num) ? buscarVasija(padron, num) : null;
  return v ? limpiarClase({ tipo: v.tipo, cap: v.cap_real }) : null;
}

/* El tipo de un tanque mientras se escribe su numero. Si el tipo lo eligio la
 * persona (claseAuto false), manda el elegido. Si no, sale del padron en cada
 * tecla (claseAuto true): "2" -> "20" -> "209" no deja trabado el tipo del T 2;
 * un numero que no esta en el padron lo vuelve a dejar sin tipo.
 * claseAuto vive solo en el asistente: normalizarAchique no lo guarda. */
export function claseAlEscribirNum(d, padron){
  if (d && d.clase && !d.claseAuto) return { clase: d.clase, claseAuto: false };
  const c = claseDeNum(padron, d && d.num);
  return c ? { clase: c, claseAuto: true } : { clase: null, claseAuto: false };
}

export const mismaClase = (a, b) => !!(a && b) && txt(a.tipo).toUpperCase() === txt(b.tipo).toUpperCase()
  && Number(a.cap) === Number(b.cap);

export function nombreDestino(d){
  if (!d) return '';
  if (d.tipo === 'tanque') return txt(d.num) || !d.clase ? nombreTanque(sinT(d.num)) : nombreClase(d.clase);
  const b = ent(d.barricas), t = ent(d.t50);
  if (!b && !t) return 'Barricas / T50';
  const partes = [];
  if (b || !t) partes.push(b === 1 ? '1 barrica' : `${b} barricas`);
  if (t) partes.push(`${t} ${NOMBRE_T50}`);
  return partes.join(' + ');
}

/* Con numero y tipo: "T 209 · TANQUE AC.INOX. · 75 HL" (resumen y confirmar). */
export function nombreDestinoLargo(d){
  const n = nombreDestino(d);
  return d && d.tipo === 'tanque' && txt(d.num) && d.clase ? `${n} · ${nombreClase(d.clase)}` : n;
}

/* El destino_real de cada vasija definitiva al confirmar. En chicas, lo que
 * queda en la ficha segun la propuesta (llenas + barricas merma: 19 + 1 son
 * "20 barricas"); sin propuesta, lo que se lleno. */
export function destinoRealAchique(d, entrada, item){
  const e = entrada || {};
  if (d && d.tipo === 'tanque') return txt(e.vasija) || nombreDestino(d);
  const v = item && item.despues ? txt(item.despues.vasija_actual) : '';
  return v || nombreDestino({ tipo: 'chicas', barricas: e.barricas_llenas, t50: e.t50_llenas });
}

/* La columna Cantidad de la tabla del achique (0943: 1 por tanque). */
export function cantidadDestino(d){
  if (!d) return '';
  if (d.tipo === 'tanque') return '1';
  const b = ent(d.barricas), t = ent(d.t50);
  if (!b && !t) return '';   // todavia no se sabe: lo anota el operario
  if (b && t) return `${b} + ${t} ${NOMBRE_T50}`;
  return t ? `${t} ${NOMBRE_T50}` : String(b);
}

export function indiceBase(destinos){
  const ds = destinos || [];
  const t = ds.findIndex(d => d && d.tipo === 'tanque');
  return t !== -1 ? t : ds.findIndex(d => d && d.tipo === 'chicas');
}

const destinosDe = ot => (ot && ot.achique && ot.achique.destinos) || [];

export const destinoChicas = ot => destinosDe(ot).find(d => d && d.tipo === 'chicas') || null;

/* Pone el lote de cada destino: la base, el del corte; los demas conservan el
 * numero escrito y, si no tienen (o tenian el del corte porque antes eran la
 * base), el siguiente libre del año. Devuelve una copia. */
export function asignarLotes(destinos, { corte, lotes, anio }){
  const ds = destinos || [];
  const base = indiceBase(ds);
  const c = txt(corte);
  const tomados = new Set((lotes || []).map(l => txt(l && l.lote)));
  if (c) tomados.add(c);
  ds.forEach((d, i) => { if (i !== base && txt(d.lote) && txt(d.lote) !== c) tomados.add(txt(d.lote)); });
  return ds.map((d, i) => {
    if (i === base) return { ...d, lote: c, nuevo: false };
    let lote = txt(d.lote);
    if (!lote || lote === c){
      lote = siguienteLote([...tomados].map(x => ({ lote: x })), anio);
      tomados.add(lote);
    }
    return { ...d, lote, nuevo: true };
  });
}

/* `propios` = lotes hijos que esta misma OT ya creo (al editar): existen en la
 * tabla de Lotes pero no son un numero repetido. `padron` = DATOS().vasijas,
 * para ver que el numero escrito sea del tipo elegido.
 * Un tanque necesita su tipo o su numero; las cantidades de las chicas y los
 * litros son opcionales (se completan al confirmar). */
export function validarDestinos(destinos, { lotes, origenes, corte, propios, padron } = {}){
  const ds = destinos || [];
  const no = error => ({ ok: false, error });
  if (!ds.length) return no('Agregá al menos una vasija definitiva.');
  if (ds.filter(d => d.tipo === 'chicas').length > 1) return no('Las barricas y T50 van todas en una sola fila.');
  const tanques = new Set(), lotesVistos = new Set();
  for (const d of ds){
    if (d.tipo === 'tanque'){
      const n = txt(d.num) ? normalizarNumVasija(d.num) : '';
      if (!n && !limpiarClase(d.clase)) return no('Elegí el tipo de tanque.');
      if (n){
        if (tanques.has(n)) return no(`El ${nombreTanque(sinT(d.num))} está dos veces.`);
        tanques.add(n);
        const real = claseDeNum(padron, d.num);
        if (real && limpiarClase(d.clase) && !mismaClase(real, d.clase))
          return no(`El ${nombreTanque(sinT(d.num))} no es ${nombreClase(d.clase)} (es ${nombreClase(real)}).`);
      }
    }
    const l = numONull(d.litros);
    if (l != null && l <= 0) return no(`Los litros de ${nombreDestino(d)} tienen que ser más que 0.`);
    if (!d.nuevo) continue;
    const t = txt(d.lote);
    if (lotesVistos.has(t)) return no(`El lote ${t} está repetido en las vasijas.`);
    lotesVistos.add(t);
    if (t === txt(corte)) return no(`El lote ${t} es el lote del corte.`);
    if ((origenes || []).some(o => txt(o) === t)) return no(`El lote ${t} es uno de los lotes de origen del corte.`);
    if (!(propios && propios.has(t))){
      const v = validarNumeroLote(t, lotes || []);
      if (!v.ok) return no(v.error);
    }
  }
  return { ok: true };
}

/* Lo que se guarda en la OT: campos limpios, la base sin movimiento y un
 * mov_id por hijo (conserva el que ya tenia, para editar sin perderlo). */
export function normalizarAchique(achique, otId){
  const ds = (achique && achique.destinos) || [];
  if (!ds.length) return null;
  const base = indiceBase(ds);
  const usados = new Set(ds.map((d, i) => i !== base && d.mov_id).filter(Boolean));
  let k = 0;
  const nuevoId = () => { let id; do { id = `${otId}-a${k++}`; } while (usados.has(id)); usados.add(id); return id; };
  return { destinos: ds.map((d, i) => {
    const out = { tipo: d.tipo === 'chicas' ? 'chicas' : 'tanque' };
    if (out.tipo === 'tanque'){
      out.num = sinT(d.num);
      // Las OT viejas no tienen clase: no se agrega el campo.
      const c = limpiarClase(d.clase);
      if (c) out.clase = c;
    } else { out.barricas = ent(d.barricas); out.t50 = ent(d.t50); }
    out.litros = numONull(d.litros);
    out.lote = txt(d.lote);
    out.nuevo = i !== base;
    out.mov_id = i === base ? null : (d.mov_id || nuevoId());
    return out;
  }) };
}

/* Traspaso pendiente lote del corte -> cada hijo: el linaje solo arma padre ->
 * hijo con traspasos (TIPOS_A_LOTE de motores/linaje.ts). */
export function movimientosDeAchique(ot, usuario, hoy){
  const corte = ot && ot.lote_corte && txt(ot.lote_corte.lote);
  if (!corte) return [];
  return destinosDe(ot).filter(d => d.mov_id).map(d => ({
    id: d.mov_id, lote: corte, tipo: 'traspaso', fecha: ot.fecha,
    vasija_origen: ot.destino || '', vasija_destino: nombreDestino(d), litros: d.litros,
    lote_destino: txt(d.lote), destino_externo: '', estado: PENDIENTE, ot: ot.ot,
    operario: '', comentario: '', cargado_por: usuario || '', cargado_el: hoy,
  }));
}

export const movIdsDeOT = ot => [...((ot && ot.lotes) || []).map(l => l.mov_id),
  ...destinosDe(ot).map(d => d.mov_id).filter(Boolean), ...extrasDeOT(ot).map(x => x.d.mov_id).filter(Boolean)];

/* Achique: sus vasijas. Con tanques extra: el destino de la OT y los extra. */
export const textoDestinos = ot => {
  const ex = extrasDeOT(ot);
  if (!ex.length) return destinosDe(ot).map(nombreDestino).join(' + ');
  return [String((ot && ot.destino) || '').trim(), ...ex.map(x => nombreExtra(x.d) + (x.d.al_confirmar ? ' (agregado al confirmar)' : ''))].filter(Boolean).join(' + ');
};

/* Los lotes que esta OT dio de alta: el del corte (si no era uno existente) y
 * los hijos. Ninguno se borra solo al borrar o editar la OT. */
export function lotesCreadosPorOT(ot){
  const out = [];
  const c = ot && ot.lote_corte;
  if (c && txt(c.lote) && !c.existente) out.push(txt(c.lote));
  for (const d of destinosDe(ot)) if (d.nuevo && txt(d.lote)) out.push(txt(d.lote));
  for (const x of extrasDeOT(ot)) if (txt(x.d.lote) && !esExtraMismoLote(x)) out.push(txt(x.d.lote));
  return out;
}

/* Los lotes hijos a crear: copia de la ficha del corte (armarHijo: sin litros
 * ni envases, origen Vino) con el numero de cada destino nuevo que todavia no
 * esta en `existentes`. El numero va como numero, igual que en Nuevo lote. */
export function armarLotesHijos(destinos, fichaCorte, existentes){
  const hay = new Set((existentes || []).map(l => txt(l && l.lote)));
  return (destinos || []).filter(d => d.nuevo && txt(d.lote) && !hay.has(txt(d.lote))).map(d => {
    const h = armarHijo(fichaCorte || {});
    const n = Number(txt(d.lote));
    h.lote = Number.isFinite(n) ? n : txt(d.lote);
    // Nace en 0 L: la vasija del corte no es la suya (la pone la confirmacion).
    h.vasija_actual = '';
    return h;
  });
}
