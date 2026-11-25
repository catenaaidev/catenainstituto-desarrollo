/* ===== Lotes CIW — inventario de tanques (puro) =====
 *
 * Que hay en cada vasija fija del padron. NO se guarda: se calcula cada vez
 * cruzando padron x lotes x OT pendientes x recorridas, asi confirmar, borrar
 * o deshacer una OT cambia el inventario sin tocar nada mas.
 * Spec: docs/superpowers/specs/2026-10-14-lotes-inventario-tanques-design.md */
'use strict';

import { normalizarNumVasija } from './vasijas-padron.js';
import { esOrganico, numerosDeTanque, litrosEnTanque } from './envases.js';
import { PENDIENTE } from './ot-movimientos.js';
import { esSalida } from './ot-plantillas.js';
import { extrasDeOT } from './ot-destinos.js';

const numOk = v => { const x = Number(v); return v !== '' && v != null && Number.isFinite(x) ? x : null; };
/* "H 170 + Barricas" -> ['170']; "H 183 + 1 t200" -> ['183']. La regla vive en
 * envases.js (numerosDeTanque); `lote` es opcional y decide si un "T 200"
 * suelto es el tonel (el lote tiene cap200) o el tanque 200 del padron. */
export function partesVasija(texto, lote){
  return numerosDeTanque(texto, lote);
}

/* El lote no tiene campo cosecha: 25313 -> '2025'. */
export function cosechaDeLote(lote){
  const s = String(lote ?? '').trim();
  return /^\d{5}$/.test(s) ? '20' + s.slice(0, 2) : '';
}

/* Que lote hay en cada vasija. Las vasijas que NO son del padron activo (un
 * tanque de la bodega, "T60", o una vasija dada de baja) con vino adentro van
 * a `extras` y se listan con las del padron: son vino que hay que recorrer
 * (2026-11-18, antes quedaban en una tabla aparte abajo). `sinVasija` queda
 * solo para el lote con litros en tanque y ningun numero de vasija escrito. */
export function ocupacion(padron, lotes){
  const activas = new Map(), inactivas = new Set();
  for (const v of padron || []){
    if (!v) continue;
    const n = normalizarNumVasija(v.num);
    if (v.activa === false) inactivas.add(n); else activas.set(n, v);
  }
  const porVasija = new Map();
  const sinVasija = [];
  const extras = new Map();
  for (const l of lotes || []){
    const litrosLote = numOk(l && l.litros_actuales) ?? 0;
    if (!l || litrosLote <= 0) continue;
    // Con envases chicos y sin vasija_grande el vino esta en barricas y el
    // tanque del texto quedo viejo: 0 en tanque, no se lista.
    const enTanque = litrosEnTanque(l);
    if (!(enTanque > 0)) continue;
    const partes = partesVasija(l.vasija_actual, l);
    const enPadron = partes.filter(p => activas.has(p));
    // Si nombra alguna del padron, manda esa (un numero suelto que no esta no es otra vasija).
    const nums = enPadron.length ? enPadron : partes;
    if (!nums.length){
      sinVasija.push({ lote: String(l.lote), vasija_actual: String(l.vasija_actual ?? ''), litros: enTanque, motivo: 'no-en-padron' });
      continue;
    }
    if (!enPadron.length) for (const n of nums) if (!extras.has(n))
      extras.set(n, { num: n, motivo: inactivas.has(n) ? 'vasija-inactiva' : 'no-en-padron' });
    const enVarias = nums.length > 1;
    for (const n of nums){
      if (!porVasija.has(n)) porVasija.set(n, []);
      porVasija.get(n).push({
        lote: String(l.lote), cosecha: cosechaDeLote(l.lote), variedad: String(l.variedad ?? ''),
        id_texto: String(l.id_texto ?? ''), organico: esOrganico(l), etapa: String(l.etapa ?? ''),
        litros: enVarias ? null : enTanque, enVarias,
      });
    }
  }
  return { porVasija, sinVasija, extras: [...extras.values()] };
}

/* La lista de la Hoja1 del Excel de Oriana, en su orden. */
export const ESTADOS_MANUALES = ['FUERA DE SERVICIO', 'TRASLADO', 'TRASIEGO', 'MOSTO', 'FERMENTANDO',
  'DESBORRE', 'MERMO', 'DESCUBE', 'NO SO2', 'VINO TERMINADO'];

const TOLERANCIA_L = 1;

/* La ultima fila que mide cada vasija, en cualquier recorrida. Una recorrida
 * puede cubrir solo algunas vasijas. A igual fecha gana la que viene despues.
 * soloConCm: solo las filas con cm (una fila de solo obs/velo no tapa el cm). */
export function ultimasMediciones(recorridas, { soloConCm = false } = {}){
  const out = new Map();
  const orden = [...(recorridas || [])].filter(Boolean)
    .map((r, i) => ({ r, i })).sort((a, b) => String(a.r.fecha).localeCompare(String(b.r.fecha)) || a.i - b.i);
  for (const { r } of orden){
    for (const f of r.filas || []){
      if (!f || (soloConCm && f.cm == null)) continue;
      out.set(normalizarNumVasija(f.vasija), { ...f, fecha: r.fecha, por: r.por, recorrida_id: r.id });
    }
  }
  return out;
}

/* num de vasija -> numero de la primera OT pendiente que sale de ella o entra en ella. */
function otsPorVasija(ots){
  const out = new Map();
  const anotar = (n, ot) => { if (n && !out.has(n)) out.set(n, String(ot.ot ?? '')); };
  for (const ot of ots || []){
    if (!ot || ot.estado !== PENDIENTE) continue;
    // Traslado: el destino es otra bodega, no un tanque ("Bodega 2" no es el T 2).
    if (!esSalida(ot.plantilla)) for (const n of partesVasija(ot.destino)) anotar(n, ot);
    for (const l of ot.lotes || []){
      for (const n of partesVasija(l && l.vasijas_manual)) anotar(n, ot);
      for (const n of partesVasija(l && l.destino)) anotar(n, ot);
      for (const n of partesVasija(l && l.destino_real)) anotar(n, ot);
    }
    // Corte + achique: los tanques definitivos tambien estan en trasiego. Uno
    // pedido solo por tipo (sin numero todavia) no es ninguna vasija.
    for (const d of (ot.achique && ot.achique.destinos) || []){
      const num = d && d.tipo === 'tanque' ? String(d.num ?? '').trim() : '';
      if (num) for (const n of partesVasija('T ' + num)) anotar(n, ot);
    }
    // Tanques destino extra de un trasiego o de un Corte.
    for (const x of extrasDeOT(ot)) if (x.d.tipo !== 'chicas') for (const n of partesVasija('T ' + x.d.num)) anotar(n, ot);
  }
  return out;
}

function estadoPorEtapa(etapa){
  if (etapa === 'ingreso') return 'MOSTO';
  if (etapa === 'fa') return 'FERMENTANDO';
  return 'VINO TERMINADO';
}

export function inventarioTanques({ padron, lotes, ots, recorridas }){
  const { porVasija, sinVasija, extras } = ocupacion(padron, lotes);
  const medidas = ultimasMediciones(recorridas);
  const medidasCm = ultimasMediciones(recorridas, { soloConCm: true });
  const otDe = otsPorVasija(ots);
  const filas = [];
  // Despues del padron (el orden de la hoja de Oriana), las vasijas con vino
  // que no estan en el: tanques de la bodega y vasijas dadas de baja.
  const inactivaDe = new Map((padron || []).filter(v => v && v.activa === false).map(v => [normalizarNumVasija(v.num), v]));
  const deFuera = [...extras].sort((a, b) => Number(a.num) - Number(b.num) || a.num.localeCompare(b.num)).map(x =>
    x.motivo === 'vasija-inactiva' ? { ...inactivaDe.get(x.num), num: x.num, fuera: x.motivo }
      : { num: x.num, tipo: 'BODEGA (fuera del padrón CIW)', cap_real: null, tabla: null, fuera: x.motivo });
  for (const v of [...(padron || []).filter(v => v && v.activa !== false), ...deFuera]){
    const num = normalizarNumVasija(v.num);
    const ocupantes = porVasija.get(num) || [];
    const sinReparto = ocupantes.some(o => o.litros == null);
    const litros = sinReparto ? null : ocupantes.reduce((s, o) => s + o.litros, 0);
    const ultima = medidas.get(num) || null;          // velo, obs, estado a mano
    const medicion = medidasCm.get(num) || null;      // la ultima con cm: MERMO y diferencia
    const loteUnico = ocupantes.length === 1 ? ocupantes[0].lote : null;
    const mismoLote = !!medicion && loteUnico != null && String(medicion.lote) === loteUnico;
    // Vigente: la web sigue en los litros de cuando se midio (o en lo medido, si
    // se aplico). Un relleno o un trasiego despues de medir la deja vieja.
    const refL = !medicion ? null : numOk(medicion.aplicado ? medicion.litros_medidos : medicion.litros_web);
    const vigente = mismoLote && litros != null && refL != null && Math.abs(litros - refL) <= TOLERANCIA_L;

    let estado, estado_origen, ot = '';
    if (ultima && ultima.estado_manual){ estado = ultima.estado_manual; estado_origen = 'manual'; }
    else if (otDe.has(num)){ ot = otDe.get(num); estado = `TRASIEGO (OT ${ot})`; estado_origen = 'ot'; }
    else if (!ocupantes.length){ estado = 'VACÍA'; estado_origen = 'auto'; }
    else if (vigente && Number(medicion.cm) > 0){ estado = 'MERMO'; estado_origen = 'medicion'; }
    else { estado = estadoPorEtapa(ocupantes[0].etapa); estado_origen = 'auto'; }

    const avisos = [];
    if (ocupantes.length > 1) avisos.push('dos-lotes');
    if (sinReparto) avisos.push('sin-reparto');
    if (v.fuera === 'vasija-inactiva') avisos.push('vasija-inactiva');
    if (litros != null && Number(v.cap_real) > 0 && litros > Number(v.cap_real)) avisos.push('excede');
    if (vigente && !medicion.aplicado && medicion.litros_medidos != null
        && Math.abs(Number(medicion.litros_medidos) - litros) > TOLERANCIA_L) avisos.push('diferencia');
    if (mismoLote && !vigente) avisos.push('medicion-vieja');
    if (!ocupantes.length && medicion && String(medicion.lote ?? '') === ''
        && (medicion.litros_medidos == null || Number(medicion.litros_medidos) > 0)) avisos.push('medido-en-vacia');

    filas.push({ num, tipo: String(v.tipo ?? ''), cap_real: Number(v.cap_real) || null, tabla: v.tabla ?? null,
      lotes: ocupantes, litros, estado, estado_origen, ot, fuera_padron: !!v.fuera,
      velo: !!(ultima && ultima.velo), obs: String((ultima && ultima.obs) || ''), ultima, medicion, avisos });
  }
  const totales = {
    ocupadas: filas.filter(f => f.lotes.length).length,
    vacias: filas.filter(f => !f.lotes.length).length,
    litros: filas.reduce((s, f) => s + (f.litros || 0), 0),
    mermos: filas.filter(f => f.estado === 'MERMO').length,
    conAviso: filas.filter(f => f.avisos.length).length,
  };
  return { filas, sinVasija, totales };
}
