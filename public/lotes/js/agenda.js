/* ===== Lotes CIW — Agenda: que analizar y que trasegar, y cuando =====
 *
 * Modulo PURO. El plan no se guarda: se calcula en cada dibujo a partir de las
 * alertas del servidor (/dashboard), los lotes, los analisis, los movimientos
 * y config.agenda. Asi nunca queda viejo: entra un analisis y el item se va.
 */
'use strict';

import { sumarDias, difDias, lunesDe, esHabil, mapaFeriados, configAgenda, esIso } from './agenda-dias.js';
import { criteriosEfectivosJS, CRITERIOS_DEFAULT } from './criterios.js';

/* ---------- analisis ---------- */

/* Grupos de prioridad, en el orden que pidio el usuario (2026-10-13). */
const GRUPOS = {
  1: ['av_alerta', 'so2_caida_alerta'],
  2: ['frecuencia_vencida', 'sin_analisis_valido'],
  3: ['reanalisis_correccion'],
};
const ETIQUETA = {
  av_alerta: 'AV', so2_caida_alerta: 'Caída SO₂',
  frecuencia_vencida: 'Vencido', sin_analisis_valido: 'Sin análisis',
  reanalisis_correccion: 'Re-análisis',
};
export const GRUPOS_ANALISIS = {
  1: 'AV / caída de SO₂', 2: 'Vencidos', 3: 'Re-análisis post-corrección',
  4: 'Próximos a vencer', 5: 'Controles programados', 6: 'Ronda de tanques',
};

/**
 * Un item por lote activo que necesita analisis, con su motivo de mayor
 * prioridad. 1-3 son urgentes (van desde hoy); 4 y 5 apuntan a la fecha en
 * que vence la frecuencia (ultimo control + frecuencia_max). La 5 solo entra
 * si vence dentro del horizonte [hoy, fin].
 */
export function itemsAnalisis(dashLotes, cfg, hoy, fin){
  const out = [];
  for (const l of dashLotes || []){
    if (!l || l.activo === false) continue;
    const al = new Set(l.alarmas || []);
    let prioridad = null;
    for (const n of [1, 2, 3]) if (GRUPOS[n].some(k => al.has(k))){ prioridad = n; break; }

    const fm = Number(l.frecuencia_max);
    const vence = esIso(l.ultima_fecha_control) && Number.isFinite(fm) ? sumarDias(l.ultima_fecha_control, fm) : null;
    let objetivo = prioridad ? hoy : null;
    if (!prioridad && vence){
      if (difDias(hoy, vence) <= cfg.aviso_dias){ prioridad = 4; objetivo = vence < hoy ? hoy : vence; }
      else if (vence <= fin){ prioridad = 5; objetivo = vence; }
    }
    if (!prioridad) continue;

    const propias = prioridad <= 3 ? GRUPOS[prioridad].filter(k => al.has(k)) : [];
    const otras = [1, 2, 3].filter(n => n > prioridad).flatMap(n => GRUPOS[n].filter(k => al.has(k)));
    out.push({
      tipo: 'analisis',
      lote: String(l.lote ?? '').trim(),
      variedad: String(l.variedad ?? ''),
      prioridad,
      motivo: propias.length ? propias.map(k => ETIQUETA[k]).join(' + ') : GRUPOS_ANALISIS[prioridad],
      etiquetas: otras.map(k => ETIQUETA[k]),
      objetivo, vence,
      atraso: vence && vence < hoy ? difDias(vence, hoy) : null,
      urgente: prioridad <= 3,
      orden: prioridad,
      ordenFecha: vence || '0000-00-00',   // sin control: el mas viejo posible
    });
  }
  return out;
}

/* ---------- trasiegos ---------- */

/** Movimientos que realmente mueven el vino y reinician los 3 meses. */
export const TIPOS_MOV_REALES = ['trasiego', 'descube', 'traspaso'];
const RANGO = { alta: 1, media: 2, baja: 3 };

const _pos = (x) => { const n = Number(String(x ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };
const _clave = (x) => String(x ?? '').trim();
const _pendiente = (m) => String((m && m.estado) ?? '') === 'pendiente';
const _f10 = (x) => String(x ?? '').slice(0, 10);

/** Barricas: cap225/cap500 o el texto. cap200 son tanques t200, no barricas. */
export function estaEnBarricas(l){
  return _pos(l.cap225) > 0 || _pos(l.cap500) > 0 || /barric/i.test(String(l.vasija_actual ?? ''));
}

/** d = dias desde el vencimiento (negativo = falta). */
export function prioridadAuto(d){
  if (d > 15) return 'alta';
  if (d >= -15) return 'media';
  return 'baja';
}

/** Desde cuando se cuentan los 3 meses del lote. */
export function fechaBaseTrasiego(l, movsDelLote, analisisDelLote){
  let mejor = null;
  for (const m of movsDelLote || []){
    if (!TIPOS_MOV_REALES.includes(m.tipo) || _pendiente(m)) continue;
    const f = _f10(m.fecha);
    if (esIso(f) && (!mejor || f > mejor)) mejor = f;
  }
  if (mejor) return { fecha: mejor, origen: 'movimiento' };
  const ing = _f10(l.fecha_ingreso);
  if (esIso(ing)) return { fecha: ing, origen: 'ingreso' };
  const h = Array.isArray(l.historial_etapas) ? l.historial_etapas[0] : null;
  const de = _f10(h && h.desde);
  if (esIso(de)) return { fecha: de, origen: 'etapa' };
  const fs = (analisisDelLote || []).map(a => _f10(a.fecha_analisis)).filter(esIso).sort();
  return fs.length ? { fecha: fs[0], origen: 'analisis' } : null;
}

function _agrupar(lista, claves){
  const m = new Map();
  for (const x of lista || []){
    if (!x || typeof x !== 'object') continue;
    for (const k of new Set(claves.map(c => _clave(x[c])).filter(Boolean))){
      const arr = m.get(k); if (arr) arr.push(x); else m.set(k, [x]);
    }
  }
  return m;
}

const _diasValidos = (n) => Number.isInteger(n) && n >= 1;

/**
 * Cada cuantos dias se trasiega este lote: la columna "Trasiego cada (d)" de la
 * tabla de criterios, con la misma precedencia que el resto (proyecto pisa a
 * variedad, variedad al general). Un valor invalido cae al general, y un
 * general invalido al default de 90.
 */
export function diasTrasiegoDe(l, config){
  const n = Number(criteriosEfectivosJS(config || {}, l && l.variedad, l && l.proyecto).frecuencia_trasiego);
  if (_diasValidos(n)) return n;
  const g = Number(criteriosEfectivosJS(config || {}, null, null).frecuencia_trasiego);
  return _diasValidos(g) ? g : CRITERIOS_DEFAULT.frecuencia_trasiego;
}

/** Un item por lote activo en barricas: cuando vence su trasiego y con que prioridad. */
export function itemsTrasiego(lotes, movimientos, analisis, cfg, hoy, config = {}){
  const movsPor = _agrupar(movimientos, ['lote', 'lote_destino']);
  const anPor = _agrupar(analisis, ['lote']);
  const out = [];
  for (const l of lotes || []){
    if (!l || _pos(l.litros_actuales) === 0 || !estaEnBarricas(l)) continue;
    const k = _clave(l.lote);
    const movs = movsPor.get(k) || [];
    const pend = movs.filter(m => _pendiente(m) && TIPOS_MOV_REALES.includes(m.tipo) && esIso(_f10(m.fecha)))
      .sort((a, b) => (_f10(a.fecha) < _f10(b.fecha) ? -1 : 1))[0];
    const enCurso = pend ? { fecha: _f10(pend.fecha), ot: String(pend.ot ?? '') } : null;
    const base = fechaBaseTrasiego(l, movs, anPor.get(k) || []);
    const comun = { tipo: 'trasiego', lote: k, variedad: String(l.variedad ?? ''),
                    barriles: Math.round(_pos(l.cap225) + _pos(l.cap500)), enCurso };
    if (!base){
      out.push({ ...comun, base: null, origen: null, vencimiento: null, d: null, prioridad: 'media',
        prioridadAuto: 'media', objetivo: null, urgente: false, sinBase: true, orden: RANGO.media, ordenFecha: '9999-99-99' });
      continue;
    }
    const dias_trasiego = diasTrasiegoDe(l, config);
    const vencimiento = sumarDias(base.fecha, dias_trasiego);
    const d = difDias(vencimiento, hoy);
    const p = prioridadAuto(d);
    out.push({ ...comun, base: base.fecha, origen: base.origen, dias_trasiego, vencimiento, d, prioridad: p, prioridadAuto: p,
      objetivo: d >= 0 ? hoy : vencimiento, urgente: d >= 0, sinBase: false, orden: RANGO[p], ordenFecha: vencimiento });
  }
  return out;
}

/**
 * Trasiegos reprogramados a mano: datos.agenda, clase 'fijado', tipo
 * 'trasiego'. Lote -> fecha. Si hay varios del mismo lote gana el ultimo (por
 * `el`). Vale hasta que se cumple: un movimiento real ejecutado del lote con
 * fecha >= el dia en que se reprogramo (spec §5). No se poda: los cumplidos
 * quedan como historia y aca se ignoran.
 */
export function fijadosTrasiego(agenda, movimientos){
  const ult = new Map();
  for (const a of Array.isArray(agenda) ? agenda : []){
    if (!a || a.clase !== 'fijado' || a.tipo !== 'trasiego' || !esIso(_f10(a.fecha))) continue;
    const k = _clave(a.lote);
    if (!k) continue;
    const prev = ult.get(k);
    if (!prev || String(a.el ?? '') >= String(prev.el ?? '')) ult.set(k, a);
  }
  const movsPor = _agrupar(movimientos, ['lote', 'lote_destino']);
  const out = new Map();
  for (const [k, a] of ult){
    const desde = _f10(a.el);
    const cumplido = (movsPor.get(k) || []).some(m => TIPOS_MOV_REALES.includes(m.tipo) && !_pendiente(m)
      && esIso(_f10(m.fecha)) && (!esIso(desde) || _f10(m.fecha) >= desde));
    if (!cumplido) out.set(k, _f10(a.fecha));
  }
  return out;
}

/* ---------- reparto ---------- */

export function armarDias(desde, cantidad, mapaFer){
  const out = [];
  for (let k = 0; k < cantidad; k++){
    const fecha = sumarDias(desde, k);
    out.push({ fecha, habil: esHabil(fecha, mapaFer), feriado: mapaFer.get(fecha) ?? null });
  }
  return out;
}

const _cmpLote = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

/**
 * Ubica cada item en un dia, respetando el cupo de cada dia.
 *  1. En curso (OT emitida): el dia de su OT; si ya paso, hoy y "atrasado".
 *  2. Reprogramados a mano (it.fijado): su dia, aunque exceda el cupo o no sea
 *     habil. Si ese dia ya paso vuelven al reparto automatico como "atrasado".
 *  3. El resto por (orden, ordenFecha, lote):
 *     - urgente: primer dia habil desde hoy con lugar;
 *     - no urgente: su fecha objetivo; si esta llena, dias habiles ANTERIORES
 *       hasta hoy (para no dejarlo vencer) y despues POSTERIORES.
 *  Los no habiles nunca reciben items, salvo los en curso (OT emitida). Lo que vence despues del horizonte no
 *  se ubica (programado null, sinLugar false); lo que no entra, sinLugar true.
 */
export function repartir(items, dias, cupoDe, hoy){
  const asign = new Map(dias.map(d => [d.fecha, []]));
  const ultimo = dias.length ? dias[dias.length - 1].fecha : hoy;
  const habiles = dias.filter(d => d.habil && d.fecha >= hoy).map(d => d.fecha);
  const lleno = (f) => asign.get(f).length >= cupoDe(f);
  const poner = (it, f) => { asign.get(f).push(it); it.programado = f; it.sinLugar = false; };

  for (const it of items){ it.programado = null; it.sinLugar = false; it.atrasado = false; }

  for (const it of items.filter(i => i.enCurso)){
    let f = it.enCurso.fecha;
    if (f < hoy){ f = hoy; it.atrasado = true; }
    if (it.fijado) it.fijado = null;   // la OT emitida manda
    if (asign.has(f)) poner(it, f);
  }

  for (const it of items.filter(i => !i.enCurso && i.fijado)){
    if (it.fijado < hoy){ it.fijado = null; it.atrasado = true; continue; }
    if (asign.has(it.fijado)) poner(it, it.fijado);
  }

  const resto = items.filter(i => !i.enCurso && !i.programado && i.objetivo)
    .sort((a, b) => a.orden - b.orden || (a.ordenFecha < b.ordenFecha ? -1 : a.ordenFecha > b.ordenFecha ? 1 : 0)
      || _cmpLote(a.lote, b.lote));

  for (const it of resto){
    let candidatos;
    if (it.urgente) candidatos = habiles;
    else {
      if (it.objetivo > ultimo) continue;                       // fuera del horizonte
      const t = it.objetivo < hoy ? hoy : it.objetivo;
      candidatos = habiles.filter(f => f <= t).reverse().concat(habiles.filter(f => f > t));
    }
    const f = candidatos.find(x => !lleno(x));
    if (f) poner(it, f); else it.sinLugar = true;
  }
  return asign;
}

/* ---------- ronda semanal de tanques ---------- */

/**
 * Una vez por semana se analizan todos los lotes activos que NO estan en
 * barricas (config.agenda.ronda_tanques_dia: 1 = lunes … 5 = viernes; 0 = sin
 * ronda; por defecto el jueves). Si ese dia no es habil pasa al siguiente
 * habil de la misma semana; si no queda ninguno, esa semana no hay ronda.
 * Lleva cupo aparte: no le saca lugar a las alertas. Un lote no se repite:
 * queda afuera si esa semana ya tiene un analisis cargado o uno programado
 * por alerta (asignA = reparto de los analisis, fecha -> items).
 * Devuelve fecha -> items de la ronda.
 */
export function rondaTanques(lotes, analisis, dias, asignA, cfg, hoy){
  const out = new Map();
  const dia = cfg.ronda_tanques_dia;
  if (!dia) return out;
  const tanques = (lotes || []).filter(l => l && _pos(l.litros_actuales) > 0 && !estaEnBarricas(l))
    .sort((a, b) => _cmpLote(a.lote, b.lote));
  if (!tanques.length) return out;
  const habil = new Map(dias.map(d => [d.fecha, d.habil]));
  const fechasAn = _agrupar(analisis, ['lote']);
  for (let k = 0; k < dias.length; k += 7){
    const lunes = dias[k].fecha, domingo = sumarDias(lunes, 6), viernes = sumarDias(lunes, 4);
    let f = sumarDias(lunes, dia - 1);
    while (f <= viernes && !habil.get(f)) f = sumarDias(f, 1);
    if (f > viernes || f < hoy) continue;
    const yaEnSemana = new Set();
    for (let j = 0; j < 7; j++) for (const it of asignA.get(sumarDias(lunes, j)) || []) yaEnSemana.add(it.lote);
    const items = [];
    for (const l of tanques){
      const k2 = _clave(l.lote);
      if (yaEnSemana.has(k2)) continue;
      if ((fechasAn.get(k2) || []).some(a => { const fa = _f10(a.fecha_analisis); return fa >= lunes && fa <= domingo; })) continue;
      items.push({ tipo: 'analisis', ronda: true, lote: k2, variedad: String(l.variedad ?? ''), prioridad: 6,
                   motivo: GRUPOS_ANALISIS[6], vasija: String(l.vasija_actual ?? ''), programado: f });
    }
    out.set(f, items);
  }
  return out;
}

/* ---------- plan completo ---------- */

const _cmpBandejaT = (a, b) => a.orden - b.orden || (b.d ?? -1e9) - (a.d ?? -1e9) || _cmpLote(a.lote, b.lote);

export function planificar({ lotes = [], analisis = [], movimientos = [], dashLotes = null, agenda = [], config = {}, hoy }){
  const cfg = configAgenda(config);
  const fer = mapaFeriados(cfg.feriados);
  const dias = armarDias(lunesDe(hoy), cfg.horizonte_semanas * 7, fer);
  const fin = dias[dias.length - 1].fecha;

  const ia = dashLotes ? itemsAnalisis(dashLotes, cfg, hoy, fin) : [];
  const it = itemsTrasiego(lotes, movimientos, analisis, cfg, hoy, config);
  const fij = fijadosTrasiego(agenda, movimientos);
  for (const t of it) t.fijado = fij.get(t.lote) || null;
  const ra = repartir(ia, dias, () => cfg.cupo_analisis, hoy);
  const rt = repartir(it, dias, () => cfg.cupo_trasiegos, hoy);
  const rr = rondaTanques(lotes, analisis, dias, ra, cfg, hoy);

  return {
    cfg, hoy,
    sinAlertas: !dashLotes,
    dias: dias.map(d => {
      const a = ra.get(d.fecha), t = rt.get(d.fecha);
      return { ...d, cupoA: cfg.cupo_analisis, cupoT: cfg.cupo_trasiegos, analisis: a, trasiegos: t, ronda: rr.get(d.fecha) || [],
               excedidoA: a.length > cfg.cupo_analisis, excedidoT: t.length > cfg.cupo_trasiegos };
    }),
    bandeja: {
      analisis: ia.filter(i => i.prioridad <= 4)
        .sort((a, b) => a.prioridad - b.prioridad || (a.ordenFecha < b.ordenFecha ? -1 : a.ordenFecha > b.ordenFecha ? 1 : 0)
          || _cmpLote(a.lote, b.lote)),
      trasiegos: it.filter(t => t.sinBase || t.enCurso || t.d >= 0).sort(_cmpBandejaT),
    },
  };
}
