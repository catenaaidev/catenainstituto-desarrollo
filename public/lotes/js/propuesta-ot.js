/* ===== Lotes CIW — propuesta "asi queda cada lote" al confirmar una OT (puro) =====
 *
 *   envases despues = envases antes - vaciado + llenado
 *   litros despues  = litrosDeEnvases(despues) - faltante de las mermas pendientes
 *
 * Vaciado: la foto de barriles de la OT por capacidad; si el origen es tanque
 * (o la OT no tiene barriles), los litros previstos salen de vasija_grande.
 * Llenado: un tanque (cm -> litros con la cubicacion, o litros a mano) o N
 * barricas llenas + las mermas. En un corte los origenes solo vacian y el lote
 * del corte recibe el tanque. Nada se aplica aca: ver aplicarPropuesta. */
'use strict';

import { litrosDeEnvases, resumenEnvases } from './envases.js';
import { litrosPorCm } from './cubicacion.js';
import { buscarVasija } from './vasijas-padron.js';
import { codigoLote, faltanteDe, estaPendiente, nuevaMerma, resolver, litrosDelLote } from './mermas.js';
import { origenTanque, LITROS_BARRICA } from './ot-plantillas.js';

export const DESTINO_POR_PLANTILLA = {
  'barricas-barricas': 'barricas',
  'tq-barricas': 'barricas',
  'barrica-tanque': 'tanque',
  'tq-tq': 'tanque',
  'barricas-tanque': 'tanque',   // Corte
};
export const tipoDestino = pl => DESTINO_POR_PLANTILLA[pl] || 'tanque';

export const ENV_KEYS = ['cap50', 'cap200', 'cap225', 'cap500', 'vasija_grande'];
const CLAVE = { 50: 'cap50', 200: 'cap200', 225: 'cap225', 500: 'cap500' };
const EQUIV = { 228: 225, 300: 225 };   // mismo criterio que EQUIV_CAP de cruce.ts

const r1 = x => Math.round(x * 10) / 10;
const n0 = x => { const v = Number(x); return Number.isFinite(v) && v > 0 ? v : 0; };
const numONull = x => {
  if (x === '' || x == null) return null;
  const v = typeof x === 'number' ? x : parseFloat(String(x).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};
const vacio = () => ({ cap50: 0, cap200: 0, cap225: 0, cap500: 0, vasija_grande: 0 });

export function capNormal(cap){
  const n = Number(cap);
  if (!Number.isFinite(n)) return null;
  const c = EQUIV[n] ?? n;
  return CLAVE[c] ? c : null;
}

export function envasesDe(lote){
  const e = vacio();
  for (const k of ENV_KEYS) e[k] = n0(lote && lote[k]);
  return e;
}

export function fotoLote(lote){
  const f = {};
  for (const k of ENV_KEYS) f[k] = lote[k] ?? null;
  f.litros_actuales = lote.litros_actuales ?? 0;
  f.vasija_actual = lote.vasija_actual ?? '';
  return f;
}

const textoEnv = (e, k) => k === 'vasija_grande' ? `${e[k]} L en tanque` : `${e[k]} de ${k.slice(3)} L`;

export function vaciadoDeLote(otLote, lote, plantilla){
  const v = vacio(), avisos = [];
  const antes = envasesDe(lote);
  const bs = (otLote && otLote.barriles) || [];
  if (origenTanque(plantilla) || !bs.length){
    const prev = numONull(otLote && otLote.litros_previstos);
    v.vasija_grande = prev != null && prev > 0 ? prev : antes.vasija_grande;
    if (!bs.length && !origenTanque(plantilla) && !antes.vasija_grande)
      avisos.push('La OT no tiene barriles ni tanque de origen: no se descontó nada.');
  } else {
    for (const x of bs){
      const c = capNormal(x.cap);
      if (c) v[CLAVE[c]]++;
      else avisos.push(`Barril ${x.num} sin capacidad conocida: no se descontó.`);
    }
  }
  for (const k of ENV_KEYS){
    if (v[k] > antes[k]){
      avisos.push(`El lote tenía ${textoEnv(antes, k)} y la OT vació ${textoEnv(v, k)}: queda en 0.`);
      v[k] = antes[k];
    }
  }
  return { vaciado: v, avisos };
}

export function llenadoDeEntrada(entrada, tipo, padron){
  const e = entrada || {};
  const llenado = vacio(), avisos = [], mermas = [];
  let litros = null, bloqueado = false, vasija_texto = '';

  if (tipo === 'tanque'){
    const v = buscarVasija(padron, e.vasija);
    vasija_texto = String(e.vasija || '').trim() || (v ? 'T ' + v.num : '');
    if (v && /^\d+$/.test(vasija_texto)) vasija_texto = 'T ' + vasija_texto;
    const cmDado = e.cm !== '' && e.cm != null;
    if (v && v.tabla && cmDado){
      const r = litrosPorCm(v, e.cm);
      if (r.error === 'fuera-de-rango'){ bloqueado = true; avisos.push(`Los cm están fuera de la tabla (máximo ${r.max} cm).`); }
      else if (r.error){ bloqueado = true; avisos.push('Los cm no son un número válido.'); }
      else litros = r.litros;
    } else {
      litros = numONull(e.litros_manual);
      if (litros == null || litros < 0){
        bloqueado = true; litros = null;
        avisos.push(v && v.tabla ? 'Faltan los cm de merma del tanque.' : 'Faltan los litros del tanque.');
      }
    }
    if (litros != null) llenado.vasija_grande = litros;
    if (!v && vasija_texto) avisos.push(`La vasija ${vasija_texto} no está en el padrón: se usan los litros a mano.`);
  } else {
    const n = Math.max(0, Math.floor(n0(e.barricas_llenas)));
    llenado.cap225 = n;
    litros = n * LITROS_BARRICA;
    for (const m of e.mermas || []){
      const c = capNormal(m.cap ?? LITROS_BARRICA) ?? LITROS_BARRICA;
      const l = numONull(m.litros);
      if (!String(m.barril || '').trim() || l == null || l <= 0 || l >= c){
        bloqueado = true;
        avisos.push(`Merma ${m.barril || '(sin número)'}: los litros tienen que estar entre 0 y ${c}.`);
        continue;
      }
      llenado[CLAVE[c]]++;
      litros += l;
      mermas.push({ barril: String(m.barril).trim(), cap: c, litros: l });
    }
    const total = n + mermas.length;
    vasija_texto = total === 1 ? '1 barrica' : `${total} barricas`;
  }
  return { llenado, litros: litros == null ? null : r1(litros), mermas, vasija_texto, avisos, bloqueado };
}

function sumar(a, b, signo = 1){
  const out = vacio();
  for (const k of ENV_KEYS) out[k] = r1(Math.max(0, a[k] + signo * b[k]));
  return out;
}

/* Litros despues del item, contando las mermas que quedan pendientes. */
export function recalcularItem(item, mermas){
  const L = codigoLote(item.lote);
  const cerradas = new Set(item.mermas_cerradas || []);
  const faltante = (mermas || [])
    .filter(m => estaPendiente(m) && codigoLote(m.lote) === L && !cerradas.has(m.id))
    .concat(item.mermas_nuevas || [])
    .reduce((s, m) => s + faltanteDe(m), 0);
  item.litros_despues = Math.max(0, r1(litrosDeEnvases(item.despues) - faltante));
}

export function proponer({ ot, lotes, mermas, padron, entradas, hoy }){
  const tipo = tipoDestino(ot.plantilla);
  const corte = (ot.lote_corte && String(ot.lote_corte.lote || '').trim()) || null;
  const buscar = num => (lotes || []).find(l => String(l.lote) === String(num));
  const items = [];

  ot.lotes.forEach((ol, i) => {
    const lote = buscar(ol.lote);
    if (!lote){
      items.push({ lote: String(ol.lote), indice: i, antes: null, despues: null, mermas_nuevas: [],
        mermas_cerradas: [], litros_origen: null, litros_llegados: null, merma_litros: null,
        litros_despues: null, avisos: ['El lote no existe en la tabla de Lotes.'], bloqueado: true });
      return;
    }
    const { vaciado, avisos } = vaciadoDeLote(ol, lote, ot.plantilla);
    let env = sumar(envasesDe(lote), vaciado, -1);
    let vasija = lote.vasija_actual || '';
    let llegados = null, bloqueado = false, nuevas = [];
    if (!corte){
      const ll = llenadoDeEntrada((entradas.por_lote || [])[i], tipo, padron);
      env = sumar(env, ll.llenado);
      llegados = ll.litros; bloqueado = ll.bloqueado; avisos.push(...ll.avisos);
      vasija = ll.vasija_texto || vasija;
      nuevas = ll.mermas.map(m => ({ lote: String(ol.lote), barril: m.barril, cap: m.cap, litros: m.litros,
        desde: hoy, ot: ot.ot }));
    } else if (litrosDeEnvases(env) <= 0) vasija = '';
    const vaciados = new Set(((ol.barriles) || []).map(x => String(x.num)));
    const cerradas = (mermas || []).filter(m => estaPendiente(m) && codigoLote(m.lote) === codigoLote(ol.lote)
      && vaciados.has(String(m.barril))).map(m => m.id);
    const origen = numONull(ol.litros_previstos);
    const item = { lote: String(ol.lote), indice: i, antes: fotoLote(lote), despues: { ...env, vasija_actual: vasija },
      mermas_nuevas: nuevas, mermas_cerradas: cerradas, litros_origen: origen, litros_llegados: llegados,
      merma_litros: origen != null && llegados != null ? r1(origen - llegados) : null,
      litros_despues: null, avisos, bloqueado };
    recalcularItem(item, mermas);
    // En un corte el origen quedando en 0 es lo esperado; en un trasiego no.
    if (!corte && item.litros_despues <= 0) avisos.push('El lote queda en 0 L y pasa a inactivo.');
    items.push(item);
  });

  if (corte){
    const lote = buscar(corte);
    const ll = llenadoDeEntrada(entradas.corte, 'tanque', padron);
    if (!lote){
      items.push({ lote: corte, indice: null, antes: null, despues: null, mermas_nuevas: [], mermas_cerradas: [],
        litros_origen: null, litros_llegados: ll.litros, merma_litros: null, litros_despues: null,
        avisos: ['El lote del corte no existe en la tabla de Lotes.'], bloqueado: true });
    } else {
      const env = sumar(envasesDe(lote), ll.llenado);
      const item = { lote: corte, indice: null, antes: fotoLote(lote),
        despues: { ...env, vasija_actual: ll.vasija_texto || lote.vasija_actual || '' },
        mermas_nuevas: [], mermas_cerradas: [], litros_origen: null, litros_llegados: ll.litros,
        merma_litros: null, litros_despues: null, avisos: ll.avisos, bloqueado: ll.bloqueado };
      recalcularItem(item, mermas);
      if (item.litros_despues <= 0) item.avisos.push('El lote del corte queda en 0 L.');
      items.push(item);
    }
    // La merma del corte es una sola (lo que salio menos lo que se midio en el
    // tanque) y se reparte entre los origenes segun sus litros.
    const origenes = items.filter(x => x.indice != null && x.litros_origen != null);
    const total = origenes.reduce((s, x) => s + x.litros_origen, 0);
    if (ll.litros != null && total > 0){
      const merma = total - ll.litros;
      for (const x of origenes) x.merma_litros = r1(merma * x.litros_origen / total);
    }
  }
  return { tipo, corte, items };
}

export function compararConMapa(item, otLote, barrilesDelLote){
  if (!Array.isArray(barrilesDelLote)) return { estado: 'sin-datos', texto: 'No se pudo comparar con el Mapa' };
  const llenos = new Set(barrilesDelLote.filter(x => x.estado === 'LLENO').map(x => String(x.num)));
  if (((otLote && otLote.barriles) || []).some(x => llenos.has(String(x.num))))
    return { estado: 'sin-escanear', texto: 'Todavía sin escanear el vaciado' };
  const cuenta = vacio();
  for (const x of barrilesDelLote){
    if (x.estado !== 'LLENO' && x.estado !== 'MERMO') continue;
    const c = capNormal(x.cap);
    if (c) cuenta[CLAVE[c]]++;
  }
  const d = (item && item.despues) || {};
  const igual = ['cap50', 'cap200', 'cap225', 'cap500'].every(k => cuenta[k] === n0(d[k]));
  if (igual) return { estado: 'coincide', texto: '✓ coincide con el Mapa' };
  return { estado: 'difiere', texto: '⚠ el Mapa dice ' + (resumenEnvases(cuenta) || 'ninguna barrica') };
}

/* Aplica los items con check. Los envases en 0 se guardan como null (como el
 * overlay de Envases deja los vacios); litros_actuales nunca null. */
export function aplicarPropuesta(datos, ot, propuesta, aplicar, usuario, hoy){
  if (!Array.isArray(datos.mermas)) datos.mermas = [];
  for (const item of propuesta.items){
    const lote = (datos.lotes || []).find(l => String(l.lote) === String(item.lote));
    const destino = item.indice == null ? ot.lote_corte : ot.lotes[item.indice];
    if (!lote || item.bloqueado || !item.despues || !aplicar.has(item.lote)){
      if (destino) destino.aplicado = null;
      continue;
    }
    const antes = fotoLote(lote);
    for (const k of ENV_KEYS) lote[k] = n0(item.despues[k]) > 0 ? r1(n0(item.despues[k])) : null;
    lote.vasija_actual = String(item.despues.vasija_actual || '').trim();
    for (const id of item.mermas_cerradas){
      const m = datos.mermas.find(x => x.id === id);
      if (m && estaPendiente(m)) resolver(m, 'vaciada', usuario, hoy);
    }
    item.mermas_nuevas.forEach((m, j) =>
      datos.mermas.push(nuevaMerma(m, `mer-${ot.id}-${codigoLote(item.lote)}-${j}`)));
    lote.litros_actuales = litrosDelLote(lote, datos.mermas);
    if (destino) destino.aplicado = { antes, despues: fotoLote(lote), por: usuario || '', el: hoy };
  }
}
