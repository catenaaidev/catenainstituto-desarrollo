/* ===== Lotes CIW — propuesta "asi queda cada lote" al confirmar una OT (puro) =====
 *
 *   envases despues = envases antes - vaciado + llenado
 *   litros despues  = litrosDeEnvases(despues) - faltante de las mermas pendientes
 *
 * Vaciado: lo que la OT dice que se vacio: la foto de barriles por capacidad,
 * los tanques del padron, la cantidad generica de barricas y las vasijas
 * manuales que nombran envases ("17 Barricas"); si el origen es tanque (o la
 * OT no tiene vasijas), los litros previstos (ver vaciadoDeLote).
 * Llenado: un tanque (cm -> litros con la cubicacion, o litros a mano) o N
 * barricas llenas + las mermas. En un corte los origenes solo vacian y el lote
 * del corte recibe el tanque. Nada se aplica aca: ver aplicarPropuesta. */
'use strict';

import { litrosDeEnvases, resumenEnvases, NOMBRE_T50, RE_T50 } from './envases.js';
import { litrosPorCm } from './cubicacion.js';
import { buscarVasija, normalizarNumVasija } from './vasijas-padron.js';
import { codigoLote, faltanteDe, estaPendiente, nuevaMerma, resolver, litrosDelLote } from './mermas.js';
import { origenTanque, LITROS_BARRICA, LITROS_T50 } from './ot-plantillas.js';
import { indiceBase, claseDeNum, mismaClase, nombreClase } from './ot-achique.js';
import { extrasDeOT, nombreExtra, esChicas, esExtraMismoLote } from './ot-destinos.js';

export const DESTINO_POR_PLANTILLA = {
  'barricas-barricas': 'barricas',
  'tq-barricas': 'barricas',
  'barrica-tanque': 'tanque',
  'tq-tq': 'tanque',
  'barricas-tanque': 'tanque',   // Corte
  'corte-achique': 'tanque',
  traslado: 'salida',            // el vino se va: solo se vacia
};
export const tipoDestino = pl => DESTINO_POR_PLANTILLA[pl] || 'tanque';

// El item del lote del corte (no un origen, ni un lote hijo del achique, ni
// un tanque destino extra).
export const esItemCorte = it => it.indice == null && it.hijo == null && it.extra == null;

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

/* Lo que una vasija manual de la OT dice que es, en envases del lote: "17
 * Barricas" son 17 de 225, "2 T50" dos de 50, "11 barricas + 1 T50" las dos
 * cosas. Un nombre sin cantidad ("Barricas", "IBC 1", "Barrica 2240553": ese
 * numero es del barril) no se adivina: null.
 *
 * Existe por la OT 0957 (2026-10-27): el Mapa no tenia los barriles de 9
 * lotes y se cargaron a mano como "17 Barricas · 3825 L"; al confirmar no se
 * desconto nada y los lotes siguieron con sus barricas aunque el vino ya
 * estaba en el tanque. */
const RE_ENVASE_NOMBRADO = /(\d+)\s*(?:x\s*)?(barric\w*|t\s*50\b|t\s*200\b|t\s*500\b)/gi;
export function envasesDeNombre(nombre){
  const txt = String(nombre || '');
  const e = vacio();
  let hubo = false;
  for (const m of txt.matchAll(RE_ENVASE_NOMBRADO)){
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    const que = m[2].toLowerCase().replace(/\s+/g, '');
    const k = que.startsWith('barric') ? 'cap225' : que === 't50' ? 'cap50' : que === 't200' ? 'cap200' : 'cap500';
    e[k] += n;
    hubo = true;
  }
  if (!hubo) return null;
  delete e.vasija_grande;
  return e;
}

/* Litros sin envase conocido (una vasija manual "IBC 1", o una OT sin ninguna
 * vasija pero con litros previstos): se sacan de lo que queda del lote. Si
 * cubren todo lo que queda, el lote se vacia entero (lo normal cuando se
 * trasiega un lote completo). Si no, primero el tanque y despues barricas
 * enteras de 225, y se pide revisar porque es una suposicion. */
function vaciarPorLitros(v, antes, litros, avisos, queHay){
  const resta = k => Math.max(0, antes[k] - v[k]);
  const quedan = r1(litrosDeEnvases({ cap50: resta('cap50'), cap200: resta('cap200'), cap225: resta('cap225'),
    cap500: resta('cap500'), vasija_grande: resta('vasija_grande') }));
  if (quedan <= 0) return false;
  if (litros >= quedan){
    for (const k of ENV_KEYS) v[k] = antes[k];
    return false;
  }
  const delTanque = Math.min(litros, resta('vasija_grande'));
  v.vasija_grande = r1(v.vasija_grande + delTanque);
  const barricas = Math.min(resta('cap225'), Math.round((litros - delTanque) / LITROS_BARRICA));
  v.cap225 += barricas;
  const partes = [];
  if (delTanque > 0) partes.push(`${delTanque} L del tanque`);
  if (barricas > 0) partes.push(barricas === 1 ? '1 barrica' : `${barricas} barricas`);
  avisos.push(partes.length
    ? `${queHay}: se descontaron ${partes.join(' y ')} por los ${litros} L: revisá el después a mano.`
    : `${queHay}: no se supo qué envases descontar por los ${litros} L: revisá el después a mano.`);
  return true;
}

export function vaciadoDeLote(otLote, lote, plantilla){
  const v = vacio(), avisos = [];
  let revisar = false;
  const antes = envasesDe(lote);
  const bs = (otLote && otLote.barriles) || [];
  const tqs = (otLote && otLote.tanques) || [];
  const otras = (otLote && otLote.otras) || [];
  const cantidadN = Number(otLote && otLote.cantidad_barricas);
  const cantidad = Number.isInteger(cantidadN) && cantidadN > 0 ? cantidadN : 0;

  // 1. Lo que la OT identifica: la foto de barriles del Mapa, los tanques del
  // padron, la cantidad generica de barricas (modo "Cantidad" al emitir) y las
  // vasijas manuales que nombran envases ("17 Barricas", "2 T50").
  for (const x of bs){
    const c = capNormal(x.cap);
    if (c) v[CLAVE[c]]++;
    else avisos.push(`Barril ${x.num} sin capacidad conocida: no se descontó.`);
  }
  v.vasija_grande = r1(tqs.reduce((s, t) => s + n0(t.litros), 0));
  if (cantidad) v.cap225 += cantidad;
  let sueltos = 0;
  const sinEnvase = [];
  for (const o of otras){
    const e = envasesDeNombre(o.nombre);
    if (e){ for (const k of Object.keys(e)) v[k] += e[k]; }
    else { sueltos += n0(o.litros); sinEnvase.push(String(o.nombre || '').trim() || '(sin nombre)'); }
  }
  const identificado = bs.length > 0 || tqs.length > 0 || cantidad > 0 || otras.length > sinEnvase.length;

  if (origenTanque(plantilla) && !tqs.length && !cantidad && !otras.length){
    // Desde tanque sin detalle (como siempre): los litros previstos del tanque,
    // o todo el tanque. Los barriles del Mapa no cuentan: desde tanque son de
    // otra partida del lote y no van en la hoja.
    for (const k of ENV_KEYS) v[k] = 0;
    const prev = numONull(otLote && otLote.litros_previstos);
    v.vasija_grande = prev != null && prev > 0 ? prev : antes.vasija_grande;
  } else if (sinEnvase.length && sueltos > 0){
    // Vasijas manuales que no nombran envases (IBC, bins): sus litros.
    const txt = (sinEnvase.length === 1 ? 'La vasija ' : 'Las vasijas ') + sinEnvase.join(', ')
      + (sinEnvase.length === 1 ? ' no está' : ' no están') + ' en los envases del lote';
    if (vaciarPorLitros(v, antes, sueltos, avisos, txt)) revisar = true;
  } else if (!identificado){
    // Sin ninguna vasija en la OT: los litros previstos dicen cuanto se vacio.
    const prev = numONull(otLote && otLote.litros_previstos);
    const soloTanque = antes.vasija_grande > 0 && !antes.cap50 && !antes.cap200 && !antes.cap225 && !antes.cap500;
    if (prev != null && prev > 0){
      if (vaciarPorLitros(v, antes, prev, avisos, 'La OT no lista las vasijas')) revisar = true;
    } else if (soloTanque){
      v.vasija_grande = antes.vasija_grande;
    } else {
      // Sin vasijas ni litros no hay forma de saber que vaciar: no se descuenta
      // nada y se avisa (I1).
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

/* Escaneos del Mapa de esta OT (GET /barriles?ot=), agrupados por lote:
 * { '26236': { vaciados: [{num, cap}], llenados: [{num, cap}], fechas: [...] } }.
 * Lo que el escaner vacio y lleno con el numero de esta OT. */
export function escaneosPorLote(escaneos){
  const out = {};
  for (const e of escaneos || []){
    const L = codigoLote(e && e.lote);
    if (!L) continue;
    const g = out[L] || (out[L] = { vaciados: [], llenados: [], fechas: [] });
    const lista = e.tipo === 'llenado' ? g.llenados : e.tipo === 'vaciado' ? g.vaciados : null;
    if (!lista) continue;
    for (const x of e.barriles || []) lista.push({ num: String(x.num), cap: x.cap });
    const f = String(e.fecha || '');
    if (f && !g.fechas.includes(f)) g.fechas.push(f);
  }
  return out;
}

const hayEscaneos = porLote => Object.keys(porLote || {}).length > 0;

/* Vaciado del lote con el Mapa como fuente (2026-11-10): si el escaner
 * registro vaciados de este lote con el numero de esta OT, eso es lo que se
 * vacio (la OT dice lo previsto, y en la 0957 preveia 17 barricas del 26236
 * y se vaciaron 6). Los tanques no se escanean: se toman de la OT. Si el
 * Mapa no tiene nada de este lote pero si de otros lotes de la OT, se propone
 * lo que dice la OT marcado "revisar"; sin escaneos de la OT, la OT manda. */
export function vaciadoSegunMapa(otLote, lote, plantilla, porLote){
  const deOT = vaciadoDeLote(otLote, lote, plantilla);
  const g = (porLote || {})[codigoLote(otLote && otLote.lote)];
  if (!g || !g.vaciados.length){
    // Solo se extrana el escaneo si la OT vacia barriles: los tanques no se
    // escanean, asi que una OT desde tanque sin vaciados del Mapa es normal.
    const vaciaChicos = ['cap500', 'cap225', 'cap200', 'cap50'].some(k => deOT.vaciado[k] > 0);
    if (hayEscaneos(porLote) && vaciaChicos){
      deOT.revisar = true;
      deOT.avisos.push('El Mapa no tiene escaneos de este lote en esta OT: se propone lo que dice la OT.');
    }
    return { ...deOT, fuente: 'ot' };
  }
  const antes = envasesDe(lote);
  const v = vacio(), avisos = [];
  for (const x of g.vaciados){
    const c = capNormal(x.cap);
    if (c) v[CLAVE[c]]++;
    else avisos.push(`Barril ${x.num} del Mapa sin capacidad conocida: no se descontó.`);
  }
  // El escaner no mide tanques: lo que la OT dice del tanque sigue valiendo.
  v.vasija_grande = deOT.vaciado.vasija_grande;
  let revisar = false;
  const chicos = ['cap500', 'cap225', 'cap200', 'cap50'];
  const dif = chicos.filter(k => v[k] !== deOT.vaciado[k]);
  if (dif.length){
    const lista = e => chicos.filter(k => e[k] > 0).map(k => textoEnv(e, k)).join(' + ') || 'ninguna barrica';
    const deMas = chicos.some(k => v[k] > deOT.vaciado[k]);
    avisos.push(`La OT decía ${lista(deOT.vaciado)}; el Mapa vació ${lista(v)}: ${deMas ? 'revisá qué pasó.' : 'queda lo que el Mapa no vació.'}`);
    if (deMas) revisar = true;
  }
  for (const k of ENV_KEYS){
    if (v[k] > antes[k]){
      avisos.push(`El lote tenía ${textoEnv(antes, k)} y el Mapa vació ${textoEnv(v, k)}: queda en 0.`);
      v[k] = antes[k];
      revisar = true;
    }
  }
  return { vaciado: v, avisos, revisar, fuente: 'mapa' };
}

/* Barricas y T50 que el escaner lleno con este lote y esta OT (para
 * precargar "Barricas llenas" del destino). null si no hay llenados. */
export function llenadoSegunMapa(g){
  if (!g || !g.llenados || !g.llenados.length) return null;
  let barricas = 0, t50 = 0;
  for (const x of g.llenados){
    const c = capNormal(x.cap);
    if (c === 50) t50++; else if (c) barricas++;
  }
  return { barricas, t50 };
}

/* Paso 2 de Confirmar OT (2026-11-10): por cada tipo de vasija que tenia el
 * lote, cuantas se trasegaron y cuantas quedan. El item guarda lo vaciado
 * (item.vaciado) y lo que recibe de la OT (item.recibe) por separado, asi
 * editar lo que quedo no pisa lo que llego (tanque a barricas: el lote vacia
 * el tanque y recibe barricas).
 *
 *   despues[k] = antes[k] - vaciado[k] + recibe[k]                        */
const ORDEN_FILAS = ['cap500', 'cap225', 'cap200', 'cap50', 'vasija_grande'];
const ETIQUETA_FILA = { cap500: 'T500', cap225: 'Barricas 225', cap200: 'T200', cap50: NOMBRE_T50, vasija_grande: 'Tanque (L)' };

/* Anota en el item lo vaciado y lo recibido. Sin vaciado (lote del corte,
 * lotes hijos) todo lo que cambio es recibido. */
function anotarVaciado(item, vaciado){
  if (!item.antes || !item.despues) return;
  const a = envasesDe(item.antes), d = envasesDe(item.despues);
  const v = vaciado ? envasesDe(vaciado) : vacio();
  item.vaciado = v;
  item.recibe = {};
  for (const k of ENV_KEYS) item.recibe[k] = r1(d[k] - Math.max(0, a[k] - v[k]));
}

/* Lo que queda del lote despues de vaciar (sin contar lo que recibe). */
export function quedaDe(item){
  const a = envasesDe(item.antes), v = envasesDe(item.vaciado || vacio()), q = {};
  for (const k of ENV_KEYS) q[k] = r1(Math.max(0, a[k] - v[k]));
  return q;
}

/* Las filas editables: solo los lotes de origen, y solo los tipos que tenia. */
export function filasVaciado(item){
  if (!item || item.indice == null || !item.antes || !item.vaciado) return [];
  const a = envasesDe(item.antes), q = quedaDe(item);
  return ORDEN_FILAS.filter(k => a[k] > 0).map(k => ({
    clave: k, etiqueta: ETIQUETA_FILA[k], tenia: a[k], trasegaron: r1(a[k] - q[k]), quedan: q[k],
  }));
}

/* campo: 'trasegaron' o 'quedan'; el otro se ajusta solo. */
export function fijarTrasegado(item, clave, campo, valor, mermas, padron){
  if (!item || !item.vaciado || !item.recibe || !ENV_KEYS.includes(clave)) return;
  const tenia = envasesDe(item.antes)[clave];
  let n = Number(valor);
  if (!Number.isFinite(n)) n = 0;
  n = Math.max(0, Math.min(tenia, n));
  n = clave === 'vasija_grande' ? r1(n) : Math.round(n);
  const trasegaron = campo === 'quedan' ? tenia - n : n;
  item.vaciado[clave] = r1(trasegaron);
  item.despues[clave] = r1(Math.max(0, tenia - trasegaron + (item.recibe[clave] || 0)));
  // El texto de la vasija se rearma: lo que recibe (destino de la OT) y lo
  // que queda de cada tipo.
  item.despues.vasija_actual = unirVasijas(item.vasija_recibe || '',
    vasijaSegunEnvases((item.antes && item.antes.vasija_actual) || '', quedaDe(item), padron));
  recalcularItem(item, mermas);
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
    // T50 llenos (Corte + achique a barricas/T50): van como envases de 50.
    const n50 = Math.max(0, Math.floor(n0(e.t50_llenas)));
    llenado.cap225 = n;
    llenado.cap50 = n50;
    litros = n * LITROS_BARRICA + n50 * LITROS_T50;
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
      // C1: el ts del Mapa de esa barrica al confirmar (vista-ot-confirmar.js
      // lo copia de la lectura del paso 2): la merma solo se cierra sola con
      // un cambio del Mapa POSTERIOR a este.
      const ts = m.mapa_ts == null || m.mapa_ts === '' ? null : Number(m.mapa_ts);
      mermas.push({ barril: String(m.barril).trim(), cap, litros: l, mapa_ts: Number.isFinite(ts) ? ts : null });
    }
    // Los T50 merma no son barricas: "11 barricas + 1 T50".
    const t50 = llenado.cap50;
    // t50 = todos los T50 (llenos + mermas); las mermas que no son T50 son barricas.
    const barr = n + mermas.length - (t50 - n50);
    const partes = [];
    if (barr || !t50) partes.push(barr === 1 ? '1 barrica' : `${barr} barricas`);
    if (t50) partes.push(`${t50} ${NOMBRE_T50}`);
    vasija_texto = partes.join(' + ');
  }
  return { llenado, litros: litros == null ? null : r1(litros), mermas, vasija_texto, avisos, bloqueado };
}

/* Corte + achique emitido por tipo: lo que no se supo al emitir se pide al
 * confirmar. Las chicas sin ninguna barrica/T50 cargada no se pueden aplicar
 * (bloquea); un tanque de otro tipo que el pedido solo avisa. */
function revisarVasijaAchique(d, entrada, padron){
  const e = entrada || {}, avisos = [];
  let bloqueado = false;
  if (d && d.tipo === 'chicas'){
    const llenas = Math.floor(n0(e.barricas_llenas)) + Math.floor(n0(e.t50_llenas));
    if (!llenas && !(e.mermas || []).length){
      bloqueado = true;
      avisos.push('Faltan cuántas barricas o T50 se llenaron.');
    }
  } else if (d && !String(e.vasija ?? '').trim()){
    // Sin tanque no hay adonde poner el vino (no depende del freno de la vista).
    bloqueado = true;
    avisos.push('Falta el número de tanque.');
  } else if (d && d.clase){
    const v = buscarVasija(padron, e.vasija);
    const real = v ? claseDeNum(padron, v.num) : null;
    if (real && !mismaClase(real, d.clase))
      avisos.push(`La OT pedía ${nombreClase(d.clase)} y se usó el T ${v.num} (${nombreClase(real)}).`);
  }
  return { avisos, bloqueado };
}

/* Partes de vasija_actual ("T 201 + Barricas") que siguen siendo ciertas con
 * los envases que quedan: sin litros en tanque se van las vasijas del padron;
 * sin envases chicos, las barricas. Lo demas ("Nave 2") no se toca. */
const ES_BARRICA = new RegExp('barric|' + RE_T50.source, 'i');
export function sinLoVaciado(texto, env, padron){
  const sinTanque = !(env.vasija_grande > 0);
  const sinChicos = !(env.cap50 > 0 || env.cap200 > 0 || env.cap225 > 0 || env.cap500 > 0);
  return String(texto || '').split('+').map(s => s.trim()).filter(s => {
    if (!s) return false;
    if (ES_BARRICA.test(s)) return !sinChicos;
    if (sinTanque && (s.match(/\d+/g) || []).some(d => buscarVasija(padron, d))) return false;
    return true;
  }).join(' + ');
}

/* El texto de vasija_actual segun lo que queda de cada tipo (2026-11-10):
 * se van las partes de un tipo que quedo en 0 ("Barricas + t200" sin
 * barricas -> "t200"), la cantidad escrita se actualiza ("17 Barricas" ->
 * "11 Barricas"), un tipo que queda y no esta nombrado se agrega, y los
 * tanques (del padron o con forma "Tq 25000", "H172") se van si no quedan
 * litros en tanque. Lo demas ("Nave 2") se deja. Un lote vacio: ''. */
const TIPO_PARTE = [[/\bt\s*50\b/i, 'cap50'], [/\bt\s*200\b/i, 'cap200'], [/\bt\s*500\b/i, 'cap500'], [/barric/i, 'cap225']];
const PARECE_TANQUE = /^(tq|tanque|t|h|e|p|f|pileta|foudre|huevo)\s*\.?\s*\d/i;
const NOMBRE_SUMA = {
  cap225: n => n === 1 ? '1 barrica' : `${n} barricas`,
  cap500: n => `${n} t500`, cap200: n => `${n} t200`, cap50: n => `${n} ${NOMBRE_T50}`,
};
export function vasijaSegunEnvases(texto, env, padron){
  const e = envasesDe(env);
  if (litrosDeEnvases(e) <= 0) return '';
  const vistos = new Set(), out = [];
  for (const parte of String(texto || '').split('+').map(x => x.trim()).filter(Boolean)){
    const tipo = TIPO_PARTE.find(([re]) => re.test(parte));
    if (tipo){
      const k = tipo[1];
      if (!(e[k] > 0) || vistos.has(k)) continue;
      vistos.add(k);
      out.push(parte.replace(/^\d+(?=\s)/, String(e[k])));
      continue;
    }
    const esTanque = PARECE_TANQUE.test(parte) || (parte.match(/\d+/g) || []).some(d => buscarVasija(padron, d));
    if (esTanque && !(e.vasija_grande > 0)) continue;
    out.push(parte);
  }
  for (const k of ['cap225', 'cap500', 'cap200', 'cap50']) if (e[k] > 0 && !vistos.has(k)) out.push(NOMBRE_SUMA[k](e[k]));
  return out.join(' + ');
}

/* "T 201" + "T 201 + 6 Barricas" -> "T 201 + 6 Barricas": sin repetir partes. */
function unirVasijas(...textos){
  const vistas = new Set(), out = [];
  for (const t of textos) for (const p of String(t || '').split('+').map(x => x.trim()).filter(Boolean)){
    const k = p.toLowerCase().replace(/\s+/g, '');
    if (!vistas.has(k)){ vistas.add(k); out.push(p); }
  }
  return out.join(' + ');
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

/* Un destino extra: lote hijo que recibe lo medido en su tanque (o las
 * barricas/T50 llenas y sus barricas merma). La merma es la escrita o, si
 * no, previstos - medidos (0 sin previstos). */
/* Lo que se lleno en un destino extra (tanque o barricas/T50). */
function llenadoExtra(x, entrada, padron){
  const e = entrada || {};
  const ll = esChicas(x.d) ? llenadoDeEntrada(e, 'barricas', padron)
    : llenadoDeEntrada({ ...e, vasija: String(e.vasija ?? '').trim() || nombreExtra(x.d) }, 'tanque', padron);
  if (esChicas(x.d) && !ll.litros && !ll.mermas.length && !ll.bloqueado){
    ll.bloqueado = true;
    ll.avisos.push('Faltan cuántas barricas o T50 se llenaron.');
  }
  return ll;
}

function itemExtra(x, entrada, buscar, padron, mermas, ot, hoy){
  const e = entrada || {};
  const chicas = esChicas(x.d);
  const ll = llenadoExtra(x, e, padron);
  const mermasNuevas = ll.mermas.map(m => ({ lote: String(x.d.lote), barril: m.barril, cap: m.cap, litros: m.litros,
    desde: (ot && ot.fecha) || hoy, ot: ot && ot.ot, mapa_ts: m.mapa_ts ?? null }));
  const lote = buscar(x.d.lote);
  const escrita = numONull(e.merma);
  const merma = escrita != null ? escrita
    : x.d.litros != null && ll.litros != null ? r1(x.d.litros - ll.litros) : 0;
  const extra = { i: x.i, k: x.k };
  if (!lote) return { lote: String(x.d.lote), indice: null, extra, antes: null, despues: null, mermas_nuevas: [],
    mermas_cerradas: [], litros_origen: null, litros_llegados: ll.litros, merma_litros: merma, litros_despues: null,
    avisos: [`El lote ${x.d.lote} no existe en la tabla de Lotes.`], bloqueado: true, revisar: false };
  const antesH = envasesDe(lote);
  const it = { lote: String(x.d.lote), indice: null, extra, antes: fotoLote(lote),
    despues: { ...sumar(antesH, ll.llenado), vasija_actual: ll.vasija_texto || nombreExtra(x.d) },
    mermas_nuevas: mermasNuevas, mermas_cerradas: [], litros_origen: null, litros_llegados: ll.litros,
    merma_litros: merma, litros_despues: null, avisos: [...ll.avisos], bloqueado: ll.bloqueado, revisar: false };
  // Agregado al confirmar desde el Mapa como lote NUEVO: el Mapa sigue con el lote viejo.
  if (x.d.codigos_mapa && x.d.codigos_mapa.length)
    it.avisos.push(`Re-rotulá en el Mapa ${x.d.codigos_mapa.join(', ')} al lote ${x.d.lote}.`);
  if (merma < 0) it.avisos.push(chicas ? 'Llegó más de lo que salió a estas barricas.' : 'Llegó más de lo que salió a este tanque.');
  recalcularItem(it, mermas);
  return it;
}

export function proponer({ ot, lotes, mermas, padron, entradas, hoy, escaneos }){
  const tipo = tipoDestino(ot.plantilla);
  const porLote = escaneosPorLote(escaneos);
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
    const { vaciado, avisos, revisar, fuente } = vaciadoSegunMapa(ol, lote, ot.plantilla, porLote);
    let env = sumar(envasesDe(lote), vaciado, -1);
    let vasija = lote.vasija_actual || '';
    let vasijaRecibe = '';
    let llegados = null, bloqueado = false, nuevas = [];
    if (tipo === 'salida'){
      // Traslado: no se llena nada. "Llegados" son los litros que salieron
      // (caudalimetro), y de la vasija actual se va lo que quedo vacio.
      llegados = numONull((entradas.por_lote || [])[i] && entradas.por_lote[i].litros_salida);
      if (llegados == null || llegados < 0){
        llegados = null; bloqueado = true;
        avisos.push('Faltan los litros que salieron.');
      }
      vasija = vasijaSegunEnvases(vasija, env, padron);
    } else if (!corte){
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
      const restante = env;
      const previo = env.vasija_grande;
      env = sumar(env, ll.llenado);
      if (mismoTanque && ll.litros != null){
        env = { ...env, vasija_grande: r1(ll.litros) };
        llegados = r1(ll.litros - previo);
        if (llegados < 0) avisos.push('Lo medido es menos de lo que ya había en el tanque.');
        avisos.push('El tanque ya tenía vino de este lote: lo medido se tomó como contenido total.');
      }

      // M2: si algo del lote no se vacio (barricas o tanque), el texto combina
      // lo nuevo con lo anterior en vez de pisarlo. Del anterior se saca lo que
      // el vaciado dejo vacio (2026-10-15): si no, "T 201 + Barricas" vaciado a
      // barricas quedaba "13 barricas + T 201 + Barricas" y el Inventario de
      // tanques lo seguia mostrando en el T 201.
      const nuevo = ll.vasija_texto || '';
      vasijaRecibe = nuevo;
      if (mismoTanque) vasija = nuevo || vasija;
      else if (quedaAlgo && nuevo){
        const viejo = vasijaSegunEnvases(vasija, restante, padron);
        vasija = unirVasijas(nuevo, viejo);
      }
      else vasija = nuevo || vasija;

      // C1: desde es la fecha de TRABAJO de la OT (la que anota el escaner),
      // no la del dia en que alguien la confirma.
      nuevas = ll.mermas.map(m => ({ lote: String(ol.lote), barril: m.barril, cap: m.cap, litros: m.litros,
        desde: ot.fecha || hoy, ot: ot.ot, mapa_ts: m.mapa_ts ?? null }));
    } else vasija = vasijaSegunEnvases(vasija, env, padron);   // origen de un corte
    const vaciados = new Set(((ol.barriles) || []).map(x => String(x.num)));
    const cerradas = (mermas || []).filter(m => estaPendiente(m) && codigoLote(m.lote) === codigoLote(ol.lote)
      && vaciados.has(String(m.barril))).map(m => m.id);
    const origen = numONull(ol.litros_previstos);
    const item = { lote: String(ol.lote), indice: i, antes: fotoLote(lote), despues: { ...env, vasija_actual: vasija },
      mermas_nuevas: nuevas, mermas_cerradas: cerradas, litros_origen: origen, litros_llegados: llegados,
      merma_litros: origen != null && llegados != null ? r1(origen - llegados) : null,
      litros_despues: null, avisos, bloqueado, revisar, fuente, vasija_recibe: vasijaRecibe };
    anotarVaciado(item, vaciado);
    recalcularItem(item, mermas);
    // I3: barricas_llenas arranca con las previstas; si ademas se agrega la
    // merma, esa barrica se cuenta dos veces y la merma da negativa.
    if (item.merma_litros != null && item.merma_litros < 0){
      avisos.push(tipo === 'barricas'
        ? 'Llegaron más litros de los que salieron: ¿contaste la barrica merma dentro de las llenas?'
        : 'Llegaron más litros de los que salieron.');
    }
    // En un corte el origen quedando en 0 es lo esperado; en un trasiego no.
    if (!corte && item.litros_despues <= 0) avisos.push('El lote queda en 0 L y pasa a inactivo.');
    items.push(item);
  });

  // Tanques destino extra de un trasiego simple: un item por tanque; el
  // lote de origen se lleva el resto de la merma (o la escrita) y va entero
  // o nada con sus extra.
  const extras = extrasDeOT(ot);
  if (!corte && extras.length){
    // Extras del mismo lote (agregados al confirmar): no tienen fila; lo
    // llenado se suma al item de su lote, como en el Corte.
    for (const x of extras.filter(esExtraMismoLote)){
      const o = items.find(y => y.indice === x.i);
      if (!o || !o.despues) continue;
      const ll = llenadoExtra(x, (((entradas.por_lote || [])[x.i] || {}).extras || [])[x.k], padron);
      const v = ll.vasija_texto || nombreExtra(x.d);
      o.despues = { ...sumar(o.despues, ll.llenado), vasija_actual: [String(o.despues.vasija_actual || '').trim(), v].filter(Boolean).join(' + ') };
      o.litros_llegados = o.litros_llegados == null || ll.litros == null ? null : r1(o.litros_llegados + ll.litros);
      // La merma escrita a mano del lote manda (como con los extra de lote nuevo).
      const escrita = numONull(((entradas.por_lote || [])[x.i] || {}).merma);
      o.merma_litros = escrita != null ? escrita
        : o.litros_origen != null && o.litros_llegados != null ? r1(o.litros_origen - o.litros_llegados) : null;
      o.mermas_nuevas.push(...ll.mermas.map(m => ({ lote: String(x.d.lote), barril: m.barril, cap: m.cap, litros: m.litros,
        desde: ot.fecha || hoy, ot: ot.ot, mapa_ts: m.mapa_ts ?? null })));
      o.avisos.push(...ll.avisos);
      if (ll.bloqueado) o.bloqueado = true;
      (o.extras_mismo || (o.extras_mismo = [])).push({ i: x.i, k: x.k, litros: ll.litros, vasija: v });
      anotarVaciado(o, o.vaciado);
      recalcularItem(o, mermas);
    }
    for (const x of extras.filter(y => !esExtraMismoLote(y))){
      const it = itemExtra(x, (((entradas.por_lote || [])[x.i] || {}).extras || [])[x.k], buscar, padron, mermas, ot, hoy);
      items.push(it);
    }
    for (const o of items.filter(y => y.indice != null)){
      const suyos = items.filter(y => y.extra && y.extra.i === o.indice);
      if (!suyos.length) continue;
      const escrita = numONull(((entradas.por_lote || [])[o.indice] || {}).merma);
      const algunoSinLitros = suyos.some(y => y.litros_llegados == null);
      o.merma_litros = escrita != null ? escrita
        : o.litros_origen == null || o.litros_llegados == null || algunoSinLitros ? null
        : r1(o.litros_origen - o.litros_llegados - suyos.reduce((s, y) => s + y.litros_llegados + y.merma_litros, 0));
      // El aviso de "llegaron mas" se escribio con la merma sin los extra.
      if (o.merma_litros == null || o.merma_litros >= 0) o.avisos = o.avisos.filter(a => !a.startsWith('Llegaron más litros'));
      else if (!o.avisos.some(a => a.startsWith('Llegaron más litros'))) o.avisos.push('Llegaron más litros de los que salieron.');
      if (suyos.some(y => y.bloqueado) && !o.bloqueado){ o.bloqueado = true; o.avisos.push('Un tanque destino extra no se puede aplicar: el lote va entero o nada.'); }
      if (o.bloqueado) for (const y of suyos) if (!y.bloqueado){ y.bloqueado = true; y.avisos.push('El lote de origen no se puede aplicar: su tanque extra tampoco.'); }
    }
  }

  if (corte){
    const loteCorte = buscar(corte);
    // Corte + achique: el lote del corte es la vasija BASE (primer tanque o
    // las chicas) y cada vasija mas es un lote hijo. Sin achique, el tanque del corte.
    const dest = (ot.achique && ot.achique.destinos && ot.achique.destinos.length) ? ot.achique.destinos : null;
    const iBase = dest ? indiceBase(dest) : -1;
    const entCorte = dest ? ((entradas.destinos || [])[iBase] || {}) : entradas.corte;
    const tipoCorte = dest && dest[iBase].tipo === 'chicas' ? 'barricas' : 'tanque';
    const mermasDe = (ll, lote) => ll.mermas.map(m => ({ lote: String(lote), barril: m.barril, cap: m.cap, litros: m.litros,
      desde: ot.fecha || hoy, ot: ot.ot, mapa_ts: m.mapa_ts ?? null }));
    const ll = llenadoDeEntrada(entCorte, tipoCorte, padron);
    // Extras que siguen siendo el lote del corte (OT 0967): no son un item
    // aparte, lo que se lleno en ellos se suma al lote del corte.
    const mismosX = extras.filter(esExtraMismoLote);
    const mismos = mismosX.map(x => llenadoExtra(x, (entradas.extras || [])[x.k], padron));
    let corteItem;
    if (!loteCorte){
      corteItem = { lote: corte, indice: null, antes: null, despues: null, mermas_nuevas: [], mermas_cerradas: [],
        litros_origen: null, litros_llegados: ll.litros, merma_litros: null, litros_despues: null,
        avisos: ['El lote del corte no existe en la tabla de Lotes.'], bloqueado: true, revisar: false };
    } else {
      // Corte a un lote que ya existia: si ya tenia vino en el MISMO tanque
      // que se mide, lo medido es el contenido TOTAL (como I3 del trasiego) y
      // lo que llego es medido - lo que habia. Si estaba en otro lado, se suma
      // y el texto de la vasija combina lo nuevo con lo anterior (M2).
      //
      // Si el lote del corte es tambien uno de los origenes, se parte de lo que
      // le queda DESPUES de vaciarse como origen: los dos items escriben el
      // mismo lote y el del corte, que se aplica ultimo, es el que queda. Si se
      // partiera de la ficha, el vino que salio del origen se contaria dos veces.
      const comoOrigen = items.find(x => x.indice != null && x.lote === corte && x.despues);
      const base = comoOrigen ? comoOrigen.despues : envasesDe(loteCorte);
      const antesEnv = envasesDe(base);
      const vasijaBase = comoOrigen
        ? sinLoVaciado(base.vasija_actual || '', antesEnv, padron) : String(loteCorte.vasija_actual || '');
      const destNum = tipoCorte === 'tanque' ? normalizarNumVasija(entCorte && entCorte.vasija) : '';
      const grupos = vasijaBase.match(/\d+/g) || [];
      const mismoTanque = antesEnv.vasija_grande > 0 && !!destNum && grupos.includes(destNum);
      let env = sumar(antesEnv, ll.llenado);
      const avisos = [...ll.avisos];
      if (comoOrigen) avisos.push('El lote del corte también es lote de origen: se parte de lo que le queda después de vaciarse.');
      let llegados = ll.litros;
      const nuevo = [ll.vasija_texto || '', ...mismos.map(m => m.vasija_texto || '')].filter(Boolean).join(' + ');
      const viejo = vasijaBase.trim();
      let vasija = nuevo || viejo;
      if (mismoTanque && ll.litros != null){
        env = { ...env, vasija_grande: r1(ll.litros) };
        llegados = r1(ll.litros - antesEnv.vasija_grande);
        if (llegados < 0) avisos.push('Lo medido es menos de lo que ya había en el tanque.');
        avisos.push('El tanque ya tenía vino de este lote: lo medido se tomó como contenido total.');
      } else if (nuevo && viejo && litrosDeEnvases(antesEnv) > 0){
        vasija = `${nuevo} + ${viejo}`;
      }
      for (const m of mismos){
        env = sumar(env, m.llenado);
        llegados = llegados == null || m.litros == null ? null : r1(llegados + m.litros);
        avisos.push(...m.avisos);
      }
      corteItem = { lote: corte, indice: null, antes: fotoLote(loteCorte),
        despues: { ...env, vasija_actual: vasija },
        // Las mermas que cierra como origen tampoco cuentan en sus litros finales.
        mermas_nuevas: [ll, ...mismos].flatMap(x => mermasDe(x, corte)), mermas_cerradas: comoOrigen ? [...comoOrigen.mermas_cerradas] : [], litros_origen: null, litros_llegados: llegados,
        merma_litros: null, litros_despues: null, avisos, bloqueado: ll.bloqueado || mismos.some(m => m.bloqueado), revisar: false,
        extras_mismo: mismosX.map((x, j) => ({ i: null, k: x.k, litros: mismos[j].litros, vasija: mismos[j].vasija_texto || nombreExtra(x.d) })) };
      if (dest){
        const rv = revisarVasijaAchique(dest[iBase], entCorte, padron);
        corteItem.avisos.push(...rv.avisos);
        if (rv.bloqueado) corteItem.bloqueado = true;
      }
      recalcularItem(corteItem, mermas);
      if (corteItem.litros_despues <= 0) corteItem.avisos.push('El lote del corte queda en 0 L.');
    }
    items.push(corteItem);

    // Lotes hijos del achique: cada uno recibe lo medido en su vasija.
    const hijos = (dest || []).map((d, k) => {
      if (k === iBase) return null;
      const lh = llenadoDeEntrada((entradas.destinos || [])[k], d.tipo === 'chicas' ? 'barricas' : 'tanque', padron);
      const lote = buscar(d.lote);
      if (!lote) return { lote: String(d.lote), indice: null, hijo: k, antes: null, despues: null, mermas_nuevas: [],
        mermas_cerradas: [], litros_origen: null, litros_llegados: lh.litros, merma_litros: null, litros_despues: null,
        avisos: [`El lote ${d.lote} no existe en la tabla de Lotes.`], bloqueado: true, revisar: false };
      const antesH = envasesDe(lote);
      const nuevo = lh.vasija_texto || '';
      const viejo = String(lote.vasija_actual || '').trim();
      const vasijaH = nuevo && viejo && litrosDeEnvases(antesH) > 0 ? `${nuevo} + ${viejo}` : (nuevo || viejo);
      const it = { lote: String(d.lote), indice: null, hijo: k, antes: fotoLote(lote),
        despues: { ...sumar(antesH, lh.llenado), vasija_actual: vasijaH },
        mermas_nuevas: mermasDe(lh, d.lote), mermas_cerradas: [], litros_origen: null, litros_llegados: lh.litros,
        merma_litros: null, litros_despues: null, avisos: [...lh.avisos], bloqueado: lh.bloqueado, revisar: false };
      const rv = revisarVasijaAchique(d, (entradas.destinos || [])[k], padron);
      it.avisos.push(...rv.avisos);
      if (rv.bloqueado) it.bloqueado = true;
      recalcularItem(it, mermas);
      return it;
    }).filter(Boolean);
    items.push(...hijos);
    // Tanques destino extra del corte: lotes hijos del lote del corte.
    const extrasItems = extras.filter(x => !esExtraMismoLote(x)).map(x => itemExtra(x, (entradas.extras || [])[x.k], buscar, padron, mermas, ot, hoy));
    items.push(...extrasItems);

    // I2(a): si el corte no se puede aplicar (bloqueado o el lote no existe),
    // el vino de los origenes no tiene adonde ir: tambien quedan bloqueados.
    // Con achique es igual con cualquier vasija definitiva: el corte se
    // aplica entero o nada.
    if (corteItem.bloqueado){
      for (const x of items){
        if (x.indice != null){
          x.bloqueado = true;
          x.avisos.push('El lote del corte no se puede aplicar: los lotes de origen tampoco.');
        } else if ((x.hijo != null || x.extra) && !x.bloqueado){
          x.bloqueado = true;
          x.avisos.push('El lote del corte no se puede aplicar: los lotes hijos tampoco.');
        }
      }
    } else if ([...hijos, ...extrasItems].some(h => h.bloqueado)){
      for (const x of items){
        if (x.bloqueado) continue;
        x.bloqueado = true;
        x.avisos.push('Una vasija definitiva no se puede aplicar: el corte se aplica entero o nada.');
      }
    }

    // La merma del corte es una sola (lo que salio menos lo que se midio en
    // TODAS las vasijas definitivas) y se reparte entre los origenes segun
    // sus litros. I4: si falta el previsto de algun origen, no hay base para
    // repartir: no se reparte. M3: el ultimo origen se lleva el resto (no su
    // propia cuota redondeada), para que la suma de las partes de exactamente
    // la merma total.
    const destinosItems = [corteItem, ...hijos];
    // Cada tanque extra cuenta lo medido + su propia merma (ya anotada en el).
    const llegadosTotal = destinosItems.some(x => x.litros_llegados == null) || extrasItems.some(x => x.litros_llegados == null) ? null
      : r1(destinosItems.reduce((s, x) => s + x.litros_llegados, 0) + extrasItems.reduce((s, x) => s + x.litros_llegados + x.merma_litros, 0));
    const origenes = items.filter(x => x.indice != null);
    const sinPrevisto = origenes.some(x => x.litros_origen == null);
    if (sinPrevisto){
      corteItem.avisos.push('Hay lotes de origen sin litros previstos: la merma del corte no se reparte.');
    } else if (llegadosTotal != null && origenes.length){
      const total = origenes.reduce((s, x) => s + x.litros_origen, 0);
      if (total > 0){
        const merma = total - llegadosTotal;
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
  // Lote del corte y lotes hijos: no vacian, solo reciben.
  for (const x of items) if (x.antes && x.despues && !x.vaciado) anotarVaciado(x, null);
  return { tipo, corte, items };
}

/* Lo que se registra al confirmar de cada destino extra: los que tienen fila
 * (lote nuevo) con lo medido y su merma; los del mismo lote, con lo llenado
 * (su merma ya esta en la del lote). entradaExtra({i,k}) = entrada del paso 1. */
export function realesDeExtras(propuesta, entradaExtra){
  const out = [];
  for (const it of propuesta.items){
    if (it.extra){
      const e = entradaExtra(it.extra) || {};
      out.push({ i: it.extra.i, k: it.extra.k,
        destino_real: String(e.vasija || '').trim() || String((it.despues && it.despues.vasija_actual) || ''),
        litros_reales: it.litros_llegados, merma_litros: it.merma_litros });
    }
    for (const m of it.extras_mismo || [])
      out.push({ i: m.i, k: m.k, destino_real: m.vasija, litros_reales: m.litros, merma_litros: null });
  }
  return out;
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
 * los origenes ni los lotes hijos tampoco se aplican: el vino no tendria
 * adonde ir. */
export function aplicarPropuesta(datos, ot, propuesta, aplicar, usuario, hoy){
  if (!Array.isArray(datos.mermas)) datos.mermas = [];
  const corteItem = propuesta.items.find(esItemCorte) || null;
  const esCorte = !!(ot.lote_corte && corteItem);
  // Corte + achique: el corte va entero o nada; si un hijo no se aplica (sin
  // check o bloqueado), tampoco el lote del corte ni los origenes.
  // Los tanques destino extra del corte son hijos igual que los del achique.
  const hijosAplicables = propuesta.items.filter(x => x.hijo != null || (x.extra != null && x.extra.i == null))
    .every(h => !h.bloqueado && !!h.despues && aplicar.has(h.lote));
  const corteAplicable = !esCorte || (!corteItem.bloqueado && !!corteItem.despues && aplicar.has(corteItem.lote)
    && hijosAplicables);

  // Trasiego simple con extras: el lote de origen y sus tanques extra van juntos.
  const okItem = it => !it.bloqueado && !!it.despues && aplicar.has(it.lote);
  const loteEntero = new Map();
  for (const it of propuesta.items.filter(x => x.extra && x.extra.i != null)){
    const o = propuesta.items.find(y => y.indice === it.extra.i);
    const ok = (loteEntero.get(it.extra.i) ?? (o ? okItem(o) : false)) && okItem(it);
    loteEntero.set(it.extra.i, ok);
  }

  for (const item of propuesta.items){
    const destino = item.extra ? (item.extra.i == null ? (ot.destinos_extra || [])[item.extra.k]
        : ((ot.lotes[item.extra.i] || {}).destinos_extra || [])[item.extra.k])
      : item.indice != null ? ot.lotes[item.indice]
      : item.hijo != null ? ((ot.achique && ot.achique.destinos) || [])[item.hijo]
      : ot.lote_corte;
    if (destino && destino.aplicado && typeof destino.aplicado === 'object') continue;   // ya aplicado antes

    const lote = (datos.lotes || []).find(l => String(l.lote) === String(item.lote));
    const seAplica = !!lote && !item.bloqueado && !!item.despues && aplicar.has(item.lote)
      && corteAplicable
      && (item.extra ? (item.extra.i == null || loteEntero.get(item.extra.i))
        : item.indice == null || !loteEntero.has(item.indice) || loteEntero.get(item.indice));
    if (!seAplica){
      if (destino) destino.aplicado = null;
      continue;
    }
    const antes = fotoLote(lote);
    for (const k of ENV_KEYS) lote[k] = n0(item.despues[k]) > 0 ? r1(n0(item.despues[k])) : null;
    lote.vasija_actual = String(item.despues.vasija_actual || '').trim();
    // Las mermas que toca quedan anotadas en `aplicado`: borrar la OT las
    // deshace (ot-deshacer.js) y no hay otra forma de saber quien las cerro.
    const cerradas = [];
    for (const id of item.mermas_cerradas){
      const m = datos.mermas.find(x => x.id === id);
      if (m && estaPendiente(m)){ resolver(m, 'vaciada', usuario, hoy); cerradas.push(id); }
    }
    const creadas = item.mermas_nuevas.map((m, j) => {
      const nueva = nuevaMerma(m, `mer-${ot.id}-${codigoLote(item.lote)}-${j}`);
      datos.mermas.push(nueva);
      return nueva.id;
    });
    lote.litros_actuales = litrosDelLote(lote, datos.mermas);
    if (destino) destino.aplicado = { antes, despues: fotoLote(lote), por: usuario || '', el: hoy,
      mermas_creadas: creadas, mermas_cerradas: cerradas };
  }
}
