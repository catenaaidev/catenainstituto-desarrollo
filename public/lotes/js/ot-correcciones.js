/* ===== Lotes CIW — las correcciones de una OT (panel al lado de la hoja) =====
 *
 * Modulo puro: no toca el DOM ni llama a markDirty. La tabla "Correccion" de
 * la hoja es solo papel; lo que se registra desde el panel va a los mismos
 * lugares que la pestaña Correcciones: el SO2 a la bitacora (so2-bitacora.js)
 * y el TH2 a Otros agregados (agregados.js), con el N° de la OT. */
'use strict';

import { bloquesDeOT } from './ot-bloques.js';
import { armarCorreccion, esAnulada } from './so2-bitacora.js';
import { buscarVasija } from './vasijas-padron.js';
import { litrosPorCm } from './cubicacion.js';
import { agregadosVigentes, normalizarItem, registrarAgregados } from './agregados.js';
import { esEjecutado } from './ot-movimientos.js';
import { extrasDeOT, nombreExtra, restoDestino1, esChicas, destinoDeLote } from './ot-destinos.js';
import { tipoDestino } from './propuesta-ot.js';

const _txt = v => String(v ?? '').trim();

/** Los lotes que se corrigen en esta OT: los de la OT, o el lote del corte si
 *  la tabla es el "Agregado" de la 0867, mas una tarjeta por cada tanque
 *  destino extra (cada uno es un lote hijo, con su propia vasija). Vacio si
 *  la hoja ya no tiene tabla. */
export function lotesACorregir(ot){
  const tabla = bloquesDeOT(ot).find(b => b && b.tipo === 'tabla-correccion');
  if (!tabla) return [];
  const extras = extrasDeOT(ot).map(x => {
    const padre = x.i == null ? ot.lote_corte : ot.lotes[x.i];
    return { lote: _txt(x.d.lote), id_texto: (padre && padre.id_texto) || '',
      litros_previstos: x.d.litros_reales ?? x.d.litros ?? null, vasija: nombreExtra(x.d), extra: true,
      ...(esChicas(x.d) ? { barricas: true } : {}) };
  });
  if (tabla.modelo === 'agregado-corte' && ot.lote_corte && _txt(ot.lote_corte.lote)){
    return [{ lote: _txt(ot.lote_corte.lote), id_texto: ot.lote_corte.id_texto || '', vasija: '', extra: false }, ...extras];
  }
  return (ot.lotes || []).map(l => {
    const base = { lote: _txt(l.lote), id_texto: l.id_texto || '', litros_previstos: l.litros_previstos, vasija: '', extra: false };
    const ds = (l.destinos_extra || []).filter(Boolean);
    if (!ds.length) return base;
    // Lote con tanques extra: su tarjeta es la del destino de la OT, con lo
    // que quedo ahi (los reales si se conocen todos; si no, el resto previsto).
    const reales = ds.every(d => d.litros_reales != null) ? l.litros_reales : null;
    return { ...base, litros_previstos: reales ?? restoDestino1(l.litros_previstos, ds),
      vasija: tipoDestino(ot.plantilla) === 'tanque' ? destinoDeLote(ot, l) : '', con_extras: true };
  }).concat(extras);
}

/** El panel de correcciones de la OT, o null si no lleva. Pendiente: para
 *  cargar, con todos los lotes a corregir. Ejecutada: solo para consultar lo
 *  registrado con ella (consulta = true), con los lotes que tienen algo; sin
 *  nada registrado no hay panel. */
export function panelDeOT(ot, analisis){
  const lotes = ot ? lotesACorregir(ot) : [];
  if (!lotes.length) return null;
  if (!esEjecutado(ot)) return { consulta: false, lotes };
  const con = lotes.filter(l => {
    const r = registradasDeOT(analisis, ot.ot, l.lote);
    return r.so2.length || r.th2.length;
  });
  return con.length ? { consulta: true, lotes: con } : null;
}

/** Lo ya registrado con esta OT para este lote (sin anuladas):
 *  { so2: [{fecha, correccion}], th2: [{fecha, ag}] }, por fecha. */
export function registradasDeOT(analisis, otN, lote){
  const OT = _txt(otN), L = _txt(lote);
  const so2 = [], th2 = [];
  for (const a of (analisis || [])){
    if (_txt(a.lote) !== L) continue;
    const c = a.correccion;
    if (c && typeof c === 'object' && !esAnulada(c) && _txt(c.ot_n) === OT){
      so2.push({ fecha: a.fecha_analisis || c.fecha || '', correccion: c });
    }
    for (const ag of agregadosVigentes(a)){
      if (_txt(ag.ot_n) === OT && _txt(ag.producto).toUpperCase() === 'TH2'){
        th2.push({ fecha: a.fecha_analisis || '', ag });
      }
    }
  }
  const porFecha = (x, y) => x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0;
  return { so2: so2.sort(porFecha), th2: th2.sort(porFecha) };
}

/** Registra el TH2 de un lote con la OT. MUTA `analisis`. Devuelve el snap de
 *  registrarAgregados, o null si no hay cantidad.
 *
 *  registrarAgregados reemplaza TODO lo vigente de esa OT en ese lote y fecha;
 *  para no borrar otro agregado registrado con la misma OT (quitosano, etc.),
 *  se le pasan de nuevo los que no son TH2. */
export function registrarTH2(analisis, { lote, fecha, cantidad, unidad, ot, quien, cuando }){
  const item = normalizarItem({ producto: 'TH2', cantidad, unidad });
  if (!item || item.cantidad == null) return null;
  const OT = _txt(ot);
  const snap = registrarAgregados(analisis, { lote, fecha, items: [item], ot: OT, quien, cuando });
  // Los otros de esa OT en ese registro vuelven tal cual estaban (con su
  // registrado_por/en y su dosis por vasija).
  const otros = (snap.antes || []).filter(ag => agregadosVigentes({ agregados: [ag] }).length &&
    _txt(ag.ot_n) === OT && _txt(ag.producto).toUpperCase() !== 'TH2');
  if (otros.length) snap.ref.agregados = [...snap.ref.agregados, ...otros];
  return snap;
}

const _fmtL = n => Math.round(n).toLocaleString('es-AR');

/** Litros de un tanque del padron con esos cm de merma, con la misma cuenta
 *  que Confirmar OT (cubicacion.js: manda la Cap REAL). Devuelve
 *  { litros, texto, vasija }: litros null cuando no se puede calcular, y
 *  `texto` dice por que (se muestra al lado; los litros quedan a mano). */
export function litrosDeTanque(padron, tanque, cm){
  if (!_txt(tanque)) return { litros: null, texto: '', vasija: null };
  const v = buscarVasija(padron, tanque);
  if (!v) return { litros: null, texto: 'no está en el padrón: cargá los litros', vasija: null };
  if (!v.tabla) return { litros: null, texto: `${v.tipo} · sin tabla: cargá los litros`, vasija: v };
  if (!_txt(cm)) return { litros: null, texto: `${v.tipo} · ${_fmtL(v.cap_real)} L: cargá los cm de merma`, vasija: v };
  const r = litrosPorCm(v, cm);
  if (r.error === 'fuera-de-rango') return { litros: null, texto: `fuera de la tabla (máx. ${r.max} cm)`, vasija: v };
  if (r.error) return { litros: null, texto: 'cm inválido', vasija: v };
  return { litros: Math.round(r.litros), texto: `${v.tipo} · ${_fmtL(r.litros)} L de ${_fmtL(v.cap_real)}`, vasija: v };
}

/** El tanque que se propone en la tarjeta: la vasija de la tarjeta (el extra),
 *  o si no la vasija actual del lote o, si no, el destino de la OT; solo si
 *  es una vasija del padron. '' si no. */
export function tanquePropuesto(padron, lote, ot, vasija){
  for (const t of [vasija, lote && lote.vasija_actual, ot && ot.destino]){
    const v = _txt(t) && buscarVasija(padron, t);
    if (v) return String(v.num);
  }
  return '';
}

/** La correccion de la bitacora (armarCorreccion) mas de donde salieron los
 *  litros: `litros`, y si se cargaron, `vasija` (numero del padron, o lo
 *  tipeado si no esta) y `cm_merma`. */
export function correccionDeOT({ litros, vasija, cm, padron, ...resto }){
  const c = armarCorreccion(resto);
  if (litros != null) c.litros = litros;
  if (_txt(vasija)){
    const v = buscarVasija(padron, vasija);
    c.vasija = v ? String(v.num) : _txt(vasija);
  }
  const x = _txt(cm) === '' ? null : Number(_txt(cm).replace(',', '.'));
  if (x != null && Number.isFinite(x)) c.cm_merma = x;
  return c;
}
