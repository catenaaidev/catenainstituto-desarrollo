/* ===== Órdenes de trabajo — Guía de trabajos (puro) =====
 * La guía guardada solo tiene los renglones escritos a mano y el LUGAR de cada
 * orden (ref = módulo:id); el texto de una orden se arma cada vez desde
 * Pendientes, así una orden ejecutada o anulada se va sola.
 * Cada cambio es una operación {op, …} que se puede re-aplicar sobre la
 * versión del servidor cuando otro guardó antes (409): por eso todas son
 * funciones (guia, op) → guia nueva, sin mutar, e idempotentes donde importa. */
'use strict';
import { nombreDeTipo } from './catalogo.js';

const SIETE_DIAS = 7 * 864e5;
const MAX_TEXTO = 500, MAX_FIRMA = 120;

export const guiaVacia = () => ({ emitio: '', recibio: '', renglones: [], hechas: [] });
export const refDe = o => o.modulo + ':' + o.id;
const moduloDeRef = ref => String(ref).split(':')[0];

export function textoDeOrden(o){
  const lotes = o.lotes || [];
  const lotesTxt = o.lote_corte
    ? `${o.lote_corte} (corte de ${lotes.length} lote${lotes.length === 1 ? '' : 's'})`
    : lotes.slice(0, 6).join(', ') + (lotes.length > 6 ? ` +${lotes.length - 6}` : '');
  return [nombreDeTipo(o.tipo), o.numero ? 'N° ' + o.numero : '', lotesTxt].filter(Boolean).join(' · ');
}

const pendientesPorRef = ordenes =>
  new Map((ordenes || []).filter(o => o.estado === 'pendiente').map(o => [refDe(o), o]));

/** modulosVisibles: módulos de los que este cliente VE pendientes (ver GET). Un
 * renglón de orden de un módulo que no está ahí no se puede juzgar con `ordenes`
 * (que solo trae lo visible para este cliente) y se conserva tal cual, en vez de
 * borrarse como si la orden ya no estuviera pendiente. Sin este argumento (uso
 * viejo, compatibilidad con los tests) se comporta como antes. */
export function unirGuia(guia, ordenes, modulosVisibles){
  const g = { ...guiaVacia(), ...guia };
  const pend = pendientesPorRef(ordenes);
  const visibles = modulosVisibles ? new Set(modulosVisibles) : null;
  const renglones = g.renglones.filter(r =>
    r.tipo !== 'orden' || pend.has(r.ref) || (visibles && !visibles.has(moduloDeRef(r.ref))));
  const conocidas = new Set(renglones.filter(r => r.tipo === 'orden').map(r => r.ref));
  const nuevas = [...pend.entries()].filter(([ref]) => !conocidas.has(ref))
    .sort(([, a], [, b]) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.numero).localeCompare(String(b.numero)))
    .map(([ref]) => ({ id: 'o_' + ref, tipo: 'orden', ref }));
  return { ...g, renglones: renglones.concat(nuevas) };
}

export function vistaGuia(guia, ordenes){
  const pend = pendientesPorRef(ordenes);
  const con = r => r.tipo === 'orden' ? { ...r, orden: pend.get(r.ref) } : r;
  const enLista = (guia.renglones || []).filter(r => r.tipo !== 'orden' || pend.has(r.ref));
  return { visibles: enLista.filter(r => !r.oculta).map(con), ocultas: enLista.filter(r => r.oculta).map(con) };
}

const cambiar = (g, id, f) => {
  const i = g.renglones.findIndex(r => r.id === id);
  if (i < 0) return g;
  const nuevo = f(g.renglones[i]);
  if (nuevo === g.renglones[i]) return g;
  const renglones = g.renglones.slice();
  renglones[i] = nuevo;
  return { ...g, renglones };
};

/** Un renglón de orden de un módulo que este cliente no ve pasa como si estuviera
 * oculto: no se le conoce el estado real (ejecutada/anulada), así que no se
 * reordena con ella en el medio (ver unirGuia). */
function mover(g, id, delta, modulosVisibles){
  const visibles = modulosVisibles ? new Set(modulosVisibles) : null;
  const noVisible = r => r.tipo === 'orden' && visibles && !visibles.has(moduloDeRef(r.ref));
  const lista = g.renglones;
  const idx = lista.findIndex(r => r.id === id);
  const vis = lista.map((r, i) => (r.oculta || noVisible(r)) ? -1 : i).filter(i => i >= 0);
  const k = vis.indexOf(idx);
  if (k < 0 || k + delta < 0 || k + delta >= vis.length) return g;
  const destino = vis[k + delta];
  const renglones = lista.slice();
  const [r] = renglones.splice(idx, 1);
  renglones.splice(destino, 0, r);
  return { ...g, renglones };
}

export function aplicar(guia, op, modulosVisibles){
  const g = { ...guiaVacia(), ...guia };
  switch (op && op.op){
    case 'agregar':
      if (g.renglones.some(r => r.id === op.id)) return g;
      return { ...g, renglones: g.renglones.concat({ id: op.id, tipo: op.tipo === 'nota' ? 'nota' : 'tarea', texto: op.texto || '' }) };
    case 'texto':
      return cambiar(g, op.id, r => r.tipo === 'orden' ? r : { ...r, texto: String(op.texto ?? '').slice(0, MAX_TEXTO) });
    case 'tipo':
      return cambiar(g, op.id, r => r.tipo === 'orden' ? r : { ...r, tipo: r.tipo === 'tarea' ? 'nota' : 'tarea' });
    case 'mover':
      return mover(g, op.id, op.delta < 0 ? -1 : 1, modulosVisibles);
    case 'quitar': {
      const r = g.renglones.find(x => x.id === op.id);
      if (!r) return g;
      if (r.tipo === 'orden') return cambiar(g, op.id, x => ({ ...x, oculta: true }));
      return { ...g, renglones: g.renglones.filter(x => x.id !== op.id) };
    }
    case 'mostrar':
      return cambiar(g, op.id, r => r.tipo === 'orden' ? { ...r, oculta: false } : r);
    case 'hecha': {
      const lugar = g.renglones.findIndex(r => r.id === op.id);
      const r = g.renglones[lugar];
      if (!r || r.tipo !== 'tarea') return g;
      return { ...g, renglones: g.renglones.filter(x => x.id !== op.id),
        hechas: g.hechas.concat({ id: r.id, tipo: r.tipo, texto: r.texto || '', hecha: op.ahora, por: op.por || '', lugar }) };
    }
    case 'deshacer': {
      const h = g.hechas.find(x => x.id === op.id);
      if (!h || g.renglones.some(r => r.id === h.id)) return g;
      const renglones = g.renglones.slice();
      renglones.splice(Math.min(h.lugar, renglones.length), 0, { id: h.id, tipo: 'tarea', texto: h.texto });
      return { ...g, renglones, hechas: g.hechas.filter(x => x.id !== op.id) };
    }
    case 'firma':
      return op.campo === 'emitio' || op.campo === 'recibio' ? { ...g, [op.campo]: String(op.valor ?? '').slice(0, MAX_FIRMA) } : g;
    default:
      return g;
  }
}

export function podarHechas(guia, ahoraISO){
  const corte = Date.parse(ahoraISO) - SIETE_DIAS;
  const hechas = (guia.hechas || []).filter(h => Date.parse(h.hecha) >= corte);
  return hechas.length === (guia.hechas || []).length ? guia : { ...guia, hechas };
}

/** La hoja tal como sale en papel, para guardarla con su N° (guia_impresas). */
export function fotoImpresa(guia, ordenes){
  const { visibles } = vistaGuia(guia, ordenes);
  let n = 0;
  return {
    emitio: guia.emitio || '', recibio: guia.recibio || '',
    renglones: visibles.map(r => ({
      n: r.tipo === 'nota' ? 0 : ++n,
      tipo: r.tipo,
      texto: String(r.tipo === 'orden' ? textoDeOrden(r.orden) : (r.texto || '')).slice(0, MAX_TEXTO),
    })),
  };
}
