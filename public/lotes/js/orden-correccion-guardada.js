/* ===== Lotes CIW — la Orden de correccion de SO2 guardada =====
 *
 * Modulo puro (sin DOM, sin nucleo.js). Al imprimir, la orden se guarda en
 * DATOS().ordenes_correccion tal como salio en el papel: lotes, objetivo
 * vigente (el pisado a mano incluido), modo de cada lote y la dosis de cada
 * vasija en las dos unidades. Ejecutar lee ESTA copia y nunca recalcula: antes
 * se volvia a armar la lista al ejecutar y lo registrado no coincidia con el
 * papel (dosis o lotes distintos), que es el problema que esto arregla.
 *
 * Forma: ver docs/superpowers/specs/2026-11-02-lotes-orden-correccion-guardada-design.md */
'use strict';

import { armarCorreccion, aplicarCorreccion, revertirCorrecciones } from './so2-bitacora.js';
import { INSTRUCCIONES_SOLUCION } from './orden-correccion-papel.js';

/** Modo con el que arranca un lote. Generica (un renglon por tipo de vasija)
 *  solo si todas sus vasijas llevan exactamente la misma dosis: barricas con
 *  numero, misma capacidad y mismos litros. Si no, por barril, para que nadie
 *  tenga que adivinar cual de las barricas lleva distinto. */
export function modoPorDefecto(barricas, porVasija){
  if (porVasija) return 'barril';
  const bs = barricas || [];
  if (bs.length <= 1) return 'generica';
  if (bs.some(b => !b || !b.num)) return 'barril';
  const clave = b => String(b.cap ?? '') + '|' + String(b.litros_usados ?? '');
  const k = clave(bs[0]);
  return bs.every(b => clave(b) === k) ? 'generica' : 'barril';
}

/** La copia que se guarda al imprimir. `filas` son las de _ocBuildRows (las
 *  mismas que pintan el papel), `modos` el Map lote -> modo elegido a mano. */
export function armarOrdenGuardada({ id, numero, fecha, emitio = '', recibio = '', unidad,
                                     quien = '', ahora = '', filas, modos, titulo, instrucciones }){
  const lotes = [];
  let actual = null;
  for (const f of filas || []){
    if (f.tipo === 'lote'){
      actual = { lote: String(f.lote.lote), variedad: f.lote.variedad || '',
                 so2_libre: f.lote.so2_libre, objetivo: f.objetivo, diferencia: f.diferencia,
                 modo: null, vasijas: [], mbk_total_g: f.mbk_total_g, ml_total: f.ml_total };
      /* Sumado a mano estando fuera de la orden (en objetivo o corregido hace
       * poco): queda dicho en el Registro. */
      if (f.lote.fuera) actual.fuera = f.lote.fuera;
      /* Barril por barril (Task 7): cada vasija lleva su propio SO2 y objetivo,
       * asi que hay que guardarlos para que la ejecucion y "Ver la orden" los
       * conserven. */
      if (f.lote.por_vasija) actual.por_vasija = true;
      lotes.push(actual);
      continue;
    }
    if (f.tipo !== 'barrica' || !actual) continue;
    const b = f.barrica || {};
    const d = f.dosis || {};
    actual.vasijas.push({ num: String(b.num || ''), vasija: b.vasija || '', cap: b.cap ?? null,
                          litros: b.litros_usados, mbk_g: d.mbk_g, ml: d.ml_solucion,
                          ...(actual.por_vasija ? { so2_libre: b.so2_libre ?? null, objetivo: b.objetivo ?? null } : {}) });
  }
  for (const l of lotes){
    const m = modos && modos.get(l.lote);
    l.modo = l.por_vasija ? 'barril' : (m === 'generica' || m === 'barril') ? m
      : modoPorDefecto(l.vasijas.map(v => ({ num: v.num, cap: v.cap, litros_usados: v.litros })), !!l.por_vasija);
  }
  return { id, numero: String(numero ?? '').trim(), fecha, emitio, recibio,
           creada_por: quien, creada_en: ahora,
           unidad: unidad === 'mbk' ? 'mbk' : 'sol',
           /* Los textos que se escribieron sobre el papel: al Ver la orden se
            * redibuja la hoja tal como salio (textosPapelGuardado). */
           ...(typeof titulo === 'string' ? { titulo } : {}),
           ...(typeof instrucciones === 'string' ? { instrucciones } : {}),
           estado: 'pendiente', lotes, ejecucion: null, anulada: null };
}

/* ---------- el papel de una orden guardada ----------
 * Ver la orden (Pendientes / Historial) redibuja la hoja que se imprimio con
 * las mismas funciones del papel: las filas se rearman con la forma de
 * _ocBuildRows y pasan por filasPapelPorModo con el modo guardado. */

/** Las filas de la orden con la forma de _ocBuildRows (lote + una por vasija). */
export function filasDeGuardada(orden){
  const out = [];
  for (const l of (orden && orden.lotes) || []){
    const lote = { lote: l.lote, variedad: l.variedad, ...(l.por_vasija ? { por_vasija: true } : {}) };
    out.push({ tipo: 'lote', lote, objetivo: l.objetivo, diferencia: l.diferencia,
               mbk_total_g: l.mbk_total_g, ml_total: l.ml_total });
    for (const v of l.vasijas || []){
      out.push({ tipo: 'barrica', lote,
                 barrica: { num: v.num || '', vasija: v.vasija || '', cap: v.cap, litros_usados: v.litros,
                            so2_libre: v.so2_libre, objetivo: v.objetivo },
                 dosis: { mbk_g: v.mbk_g, ml_solucion: v.ml } });
    }
  }
  return out;
}

/** El modo de cada lote tal como se imprimio (para filasPapelPorModo). */
export function modoDeGuardada(orden){
  const modos = new Map(((orden && orden.lotes) || []).map(l => [l.lote, l.modo]));
  return lote => modos.get(lote.lote) || 'generica';
}

/** Titulo e instrucciones del papel. Las ordenes de antes de guardarlos
 *  salieron con los textos de siempre. */
export function textosPapelGuardado(orden){
  const o = orden || {};
  return {
    titulo: typeof o.titulo === 'string' ? o.titulo : 'Orden de corrección de SO₂',
    instrucciones: typeof o.instrucciones === 'string' ? o.instrucciones
      : (o.unidad === 'mbk' ? '' : INSTRUCCIONES_SOLUCION),
  };
}

/** Lote -> numero de la orden PENDIENTE que lo tiene. Una ejecutada o anulada
 *  ya no reserva el lote. */
export function lotesPendientes(ordenes){
  const m = new Map();
  for (const o of ordenes || []){
    if (!o || o.estado !== 'pendiente') continue;
    for (const l of o.lotes || []) if (l && l.lote != null) m.set(String(l.lote), String(o.numero ?? ''));
  }
  return m;
}

const so2Valido = v => v != null && v !== '' && v !== -999 && Number.isFinite(Number(v));

/** El ultimo analisis CON SO2 de cada lote de la orden, si es de un dia
 *  posterior a la orden. Solo para avisar al ejecutar: la orden se ejecuta con
 *  sus numeros igual, porque eso es lo que se hizo en la bodega. */
export function analisisPosterior(orden, analisis){
  const out = new Map();
  const lotes = new Set((orden.lotes || []).map(l => String(l.lote)));
  for (const a of analisis || []){
    if (!a) continue;
    const L = String(a.lote ?? '');
    if (!lotes.has(L)) continue;
    const f = a.fecha_analisis || '';
    if (!(f > (orden.fecha || ''))) continue;
    if (!so2Valido(a.so2_libre)) continue;
    const prev = out.get(L);
    if (!prev || f > prev.fecha) out.set(L, { fecha: f, so2_libre: a.so2_libre });
  }
  return out;
}

/** Como se dice la dosis de esta orden: la unidad con que se imprimio. */
export function unidadDe(orden){
  return (orden && orden.unidad === 'mbk')
    ? { suf: 'g', dec: 2, de: v => v.mbk_g, total: l => l.mbk_total_g }
    : { suf: 'mL', dec: 1, de: v => v.ml, total: l => l.ml_total };
}

const _orden = (datos, id) => ((datos && datos.ordenes_correccion) || []).find(o => o && o.id === id) || null;

/* Number(null) y Number('') dan 0 (no NaN): la finitud se mira sobre el valor
 * crudo, antes de sumar. */
const _esFinito = v => v != null && v !== '' && Number.isFinite(Number(v));
const _dosisValida = v => !!v && _esFinito(v.mbk_g) && _esFinito(v.ml);

/** Indices de las vasijas que se pueden tildar al ejecutar. Barril por barril:
 *  solo las que tienen dosis (una vasija sin analisis queda sin dosis hasta que
 *  se escriba en la orden). Los demas lotes: todas, como siempre. */
export function vasijasEjecutables(l){
  const vs = (l && l.vasijas) || [];
  return vs.map((_, i) => i).filter(i => !l.por_vasija || _dosisValida(vs[i]));
}

/** Lo que se registra al ejecutar. `tildes`: lote -> Set de indices de
 *  vasija tildados. En generica basta un indice cualquiera: el tilde es del
 *  lote entero. Las dosis salen de la copia guardada; nunca se recalculan. */
export function entradasDeEjecucion(orden, tildes, fecha){
  const entradas = [], hechos = [];
  for (const l of orden.lotes || []){
    const t = tildes && tildes.get(l.lote);
    if (!t || !t.size) continue;
    let idx = l.modo === 'generica'
      ? l.vasijas.map((_, i) => i)
      : [...t].filter(i => l.vasijas[i]).sort((a, b) => a - b);
    /* Barril por barril: una vasija sin dosis no tira el lote entero; se
     * registran las demas. Si no queda ninguna, el lote no se registra. */
    if (l.por_vasija) idx = idx.filter(i => _dosisValida(l.vasijas[i]));
    if (!idx.length) continue;
    /* Igual que la ejecucion vieja: un NaN pasaria a null por JSON y dejaria
     * una dosis falsa en el registro. Mejor no registrar y que el lote vuelva.
     * Number(null) y Number('') dan 0 (no NaN), asi que el chequeo de
     * finitud tiene que hacerse ANTES de sumar: si se suma primero, una sola
     * vasija con dosis null se cuela como 0 y el resto de la suma lo tapa. */
    const dosisInvalida = idx.some(i => !_dosisValida(l.vasijas[i]));
    if (dosisInvalida) continue;
    const mbk = idx.reduce((s, i) => s + Number(l.vasijas[i].mbk_g), 0);
    const ml  = idx.reduce((s, i) => s + Number(l.vasijas[i].ml), 0);
    const correccion = armarCorreccion({
      so2Actual: l.so2_libre, so2Deseado: l.objetivo, mbk, ml, ot: orden.numero, fecha });
    /* Barril por barril: ademas del total, queda el detalle de cada vasija
     * tildada (su SO2, su objetivo y su dosis) para no perderlo al ejecutar. */
    if (l.por_vasija){
      correccion.vasijas = idx.map(i => ({ num: l.vasijas[i].num,
        so2_libre: l.vasijas[i].so2_libre ?? null, objetivo: l.vasijas[i].objetivo ?? null,
        mbk_g: Number(l.vasijas[i].mbk_g), ml: Number(l.vasijas[i].ml) }));
    }
    entradas.push({ lote: l.lote, correccion });
    hechos.push({ lote: l.lote, vasijas: idx.map(i => l.vasijas[i].num || l.vasijas[i].vasija),
                  mbk_g: mbk, ml });
  }
  return { entradas, hechos };
}

/** Lo que muestra el overlay de ejecutar: sale de entradasDeEjecucion, asi
 *  un lote que no se va a registrar no se cuenta. */
export function resumenEjecucion(orden, tildes){
  const { hechos } = entradasDeEjecucion(orden, tildes, '');
  return { nLotes: hechos.length,
           mbk_g: hechos.reduce((s, h) => s + h.mbk_g, 0),
           ml: hechos.reduce((s, h) => s + h.ml, 0) };
}

/** Ejecuta la orden: escribe una correccion por lote tildado (por
 *  aplicarCorreccion, el mismo camino que la calculadora y el panel de la OT)
 *  y deja la orden ejecutada. MUTA `datos`. Devuelve los snaps para
 *  revertirEjecucion si el guardado falla. */
export function escribirEjecucion(datos, ordenId, { tildes, fecha, quien = '', ahora = '' }){
  const orden = _orden(datos, ordenId);
  if (!orden) return { ok: false, motivo: 'No se encontró la orden.' };
  if (orden.estado !== 'pendiente') return { ok: false, motivo: 'La orden ' + orden.numero + ' ya no está pendiente.' };
  const { entradas, hechos } = entradasDeEjecucion(orden, tildes, fecha);
  if (!entradas.length) return { ok: false, motivo: 'No hay ningún lote tildado.' };
  if (!Array.isArray(datos.analisis)) datos.analisis = [];
  const snaps = entradas.map(e => {
    const r = aplicarCorreccion(datos.analisis, e.lote, fecha, e.correccion);
    return { tipo: r.que, ref: r.ref, corrAnterior: r.anterior, lote: r.lote,
             fecha: r.fecha, escrita: r.escrita, convive: r.convive };
  });
  orden.estado = 'ejecutada';
  orden.ejecucion = { fecha, por: quien, en: ahora, hechos };
  return { ok: true, snaps, entradas, conviven: snaps.filter(s => s.convive != null).map(s => s.lote) };
}

/** Deshace escribirEjecucion sobre `datos`, que puede ser OTRO documento (el
 *  fusionado despues de un 409): la orden se busca por id y las correcciones
 *  por contenido (revertirCorrecciones). */
export function revertirEjecucion(datos, ordenId, snaps){
  revertirCorrecciones((datos && datos.analisis) || [], snaps || []);
  const orden = _orden(datos, ordenId);
  if (orden){ orden.estado = 'pendiente'; orden.ejecucion = null; }
}

/** Anula una orden PENDIENTE. No la borra: queda tachada en el Registro. */
export function anularOrden(datos, ordenId, quien, fecha){
  const orden = _orden(datos, ordenId);
  if (!orden || orden.estado !== 'pendiente') return false;
  orden.estado = 'anulada';
  orden.anulada = { por: quien || '', fecha };
  return true;
}

export function revertirAnulacionOrden(datos, ordenId){
  const orden = _orden(datos, ordenId);
  if (orden && orden.estado === 'anulada'){ orden.estado = 'pendiente'; orden.anulada = null; }
}
