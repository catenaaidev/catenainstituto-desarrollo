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
import { buscarVasija, normalizarNumVasija } from './vasijas-padron.js';
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
  let revisar = false;
  const antes = envasesDe(lote);
  const bs = (otLote && otLote.barriles) || [];
  if (origenTanque(plantilla)){
    const prev = numONull(otLote && otLote.litros_previstos);
    v.vasija_grande = prev != null && prev > 0 ? prev : antes.vasija_grande;
  } else if (bs.length){
    for (const x of bs){
      const c = capNormal(x.cap);
      if (c) v[CLAVE[c]]++;
      else avisos.push(`Barril ${x.num} sin capacidad conocida: no se descontó.`);
    }
  } else {
    // Sin foto de barriles: solo es seguro vaciar por litros_previstos si el
    // lote vive TODO en un tanque (tq-tq a mano). Si tiene barricas, no hay
    // forma de saber cuales vaciar: no se descuenta nada y se avisa (I1).
    const soloTanque = antes.vasija_grande > 0 && !antes.cap50 && !antes.cap200 && !antes.cap225 && !antes.cap500;
    if (soloTanque){
      const prev = numONull(otLote && otLote.litros_previstos);
      v.vasija_grande = prev != null && prev > 0 ? prev : antes.vasija_grande;
    } else {
      revisar = true;
      avisos.push('La OT no tiene la lista de barriles del lote: revisá el después a mano.');
    }
  }
  for (const k of ENV_KEYS){
    if (v[k] > antes[k]){
      avisos.push(`El lote tenía ${textoEnv(antes, k)} y la OT vació ${textoEnv(v, k)}: queda en 0.`);
      v[k] = antes[k];
    }
  }
  return { vaciado: v, avisos, revisar };
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
      // M4: el limite es la capacidad REAL del barril (p.ej. 228), no la
      // normalizada (225) que solo sirve para elegir la clave de envases.
      const capNum = Number(m.cap);
      const cap = Number.isFinite(capNum) && capNum > 0 ? capNum : LITROS_BARRICA;
      const clave = capNormal(cap) ?? 225;
      const l = numONull(m.litros);
      if (!String(m.barril || '').trim() || l == null || l <= 0 || l >= cap){
        bloqueado = true;
        avisos.push(`Merma ${m.barril || '(sin número)'}: los litros tienen que estar entre 0 y ${cap}.`);
        continue;
      }
      llenado[CLAVE[clave]]++;
      litros += l;
      mermas.push({ barril: String(m.barril).trim(), cap, litros: l });
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
        litros_despues: null, avisos: ['El lote no existe en la tabla de Lotes.'], bloqueado: true, revisar: false });
      return;
    }
    const { vaciado, avisos, revisar } = vaciadoDeLote(ol, lote, ot.plantilla);
    let env = sumar(envasesDe(lote), vaciado, -1);
    let vasija = lote.vasija_actual || '';
    let llegados = null, bloqueado = false, nuevas = [];
    if (!corte){
      const entrada = (entradas.por_lote || [])[i];
      const ll = llenadoDeEntrada(entrada, tipo, padron);
      llegados = ll.litros; bloqueado = ll.bloqueado; avisos.push(...ll.avisos);

      // I3: si el destino es el MISMO tanque que ya tiene vino de este lote, los
      // cm leidos son el contenido TOTAL del tanque, no algo que se suma.
      let mismoTanque = false;
      if (tipo === 'tanque' && env.vasija_grande > 0){
        const destNum = normalizarNumVasija(entrada && entrada.vasija);
        const grupos = String(lote.vasija_actual || '').match(/\d+/g) || [];
        mismoTanque = !!destNum && grupos.includes(destNum);
      }
      const quedaAlgo = litrosDeEnvases(env) > 0;   // lo que sobrevive al vaciado, antes de llenar
      const previo = env.vasija_grande;
      env = sumar(env, ll.llenado);
      if (mismoTanque && ll.litros != null){
        env = { ...env, vasija_grande: r1(ll.litros) };
        llegados = r1(ll.litros - previo);
        if (llegados < 0) avisos.push('Lo medido es menos de lo que ya había en el tanque.');
        avisos.push('El tanque ya tenía vino de este lote: lo medido se tomó como contenido total.');
      }

      // M2: si algo del lote no se vacio (barricas o tanque), el texto combina
      // lo nuevo con lo anterior en vez de pisarlo.
      const nuevo = ll.vasija_texto || '';
      if (mismoTanque) vasija = nuevo || vasija;
      else if (quedaAlgo && nuevo) vasija = vasija ? `${nuevo} + ${vasija}` : nuevo;
      else vasija = nuevo || vasija;

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
      litros_despues: null, avisos, bloqueado, revisar };
    recalcularItem(item, mermas);
    // En un corte el origen quedando en 0 es lo esperado; en un trasiego no.
    if (!corte && item.litros_despues <= 0) avisos.push('El lote queda en 0 L y pasa a inactivo.');
    items.push(item);
  });

  if (corte){
    const loteCorte = buscar(corte);
    const ll = llenadoDeEntrada(entradas.corte, 'tanque', padron);
    let corteItem;
    if (!loteCorte){
      corteItem = { lote: corte, indice: null, antes: null, despues: null, mermas_nuevas: [], mermas_cerradas: [],
        litros_origen: null, litros_llegados: ll.litros, merma_litros: null, litros_despues: null,
        avisos: ['El lote del corte no existe en la tabla de Lotes.'], bloqueado: true, revisar: false };
    } else {
      const env = sumar(envasesDe(loteCorte), ll.llenado);
      corteItem = { lote: corte, indice: null, antes: fotoLote(loteCorte),
        despues: { ...env, vasija_actual: ll.vasija_texto || loteCorte.vasija_actual || '' },
        mermas_nuevas: [], mermas_cerradas: [], litros_origen: null, litros_llegados: ll.litros,
        merma_litros: null, litros_despues: null, avisos: ll.avisos, bloqueado: ll.bloqueado, revisar: false };
      recalcularItem(corteItem, mermas);
      if (corteItem.litros_despues <= 0) corteItem.avisos.push('El lote del corte queda en 0 L.');
    }
    items.push(corteItem);

    // I2(a): si el corte no se puede aplicar (bloqueado o el lote no existe),
    // el vino de los origenes no tiene adonde ir: tambien quedan bloqueados.
    if (corteItem.bloqueado){
      for (const x of items){
        if (x.indice != null){
          x.bloqueado = true;
          x.avisos.push('El lote del corte no se puede aplicar: los lotes de origen tampoco.');
        }
      }
    }

    // La merma del corte es una sola (lo que salio menos lo que se midio en el
    // tanque) y se reparte entre los origenes segun sus litros. I4: si falta
    // el previsto de algun origen, no hay base para repartir: no se reparte.
    // M3: el ultimo origen se lleva el resto (no su propia cuota redondeada),
    // para que la suma de las partes de exactamente la merma total.
    const origenes = items.filter(x => x.indice != null);
    const sinPrevisto = origenes.some(x => x.litros_origen == null);
    if (sinPrevisto){
      corteItem.avisos.push('Hay lotes de origen sin litros previstos: la merma del corte no se reparte.');
    } else if (ll.litros != null && origenes.length){
      const total = origenes.reduce((s, x) => s + x.litros_origen, 0);
      if (total > 0){
        const merma = total - ll.litros;
        let acumulado = 0;
        origenes.forEach((x, idx) => {
          if (idx < origenes.length - 1){
            x.merma_litros = r1(merma * x.litros_origen / total);
            acumulado += x.merma_litros;
          } else {
            x.merma_litros = r1(merma - acumulado);
          }
        });
      }
    }
  }
  return { tipo, corte, items };
}

export function compararConMapa(item, otLote, barrilesDelLote, otFecha = ''){
  if (!Array.isArray(barrilesDelLote)) return { estado: 'sin-datos', texto: 'No se pudo comparar con el Mapa' };
  // M1: un barril LLENO con el mismo numero solo es "todavia sin escanear" si
  // el Mapa no tiene fecha (dato viejo) o su fecha es anterior a la OT; con
  // fecha posterior ya se vacio y se volvio a llenar para otra cosa.
  const porNum = new Map(barrilesDelLote.map(x => [String(x.num), x]));
  const sinEscanear = ((otLote && otLote.barriles) || []).some(x => {
    const b = porNum.get(String(x.num));
    if (!b || b.estado !== 'LLENO') return false;
    const f = String(b.fecha || '');
    return !f || f < String(otFecha || '');
  });
  if (sinEscanear) return { estado: 'sin-escanear', texto: 'Todavía sin escanear el vaciado' };
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
 * overlay de Envases deja los vacios); litros_actuales nunca null.
 * Idempotente: un item cuyo destino ya tiene un `aplicado` (de una corrida
 * anterior) se deja intacto, no se reaplica. I2(b): en un corte, si el lote
 * del corte no queda realmente aplicado (sin check, bloqueado o faltante),
 * los origenes tampoco se aplican: el vino no tendria adonde ir. */
export function aplicarPropuesta(datos, ot, propuesta, aplicar, usuario, hoy){
  if (!Array.isArray(datos.mermas)) datos.mermas = [];
  const corteItem = propuesta.items.find(x => x.indice == null) || null;
  const esCorte = !!(ot.lote_corte && corteItem);
  const corteAplicable = !esCorte || (!corteItem.bloqueado && !!corteItem.despues && aplicar.has(corteItem.lote));

  for (const item of propuesta.items){
    const destino = item.indice == null ? ot.lote_corte : ot.lotes[item.indice];
    if (destino && destino.aplicado && typeof destino.aplicado === 'object') continue;   // ya aplicado antes

    const lote = (datos.lotes || []).find(l => String(l.lote) === String(item.lote));
    const seAplica = !!lote && !item.bloqueado && !!item.despues && aplicar.has(item.lote)
      && (item.indice == null || corteAplicable);
    if (!seAplica){
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
