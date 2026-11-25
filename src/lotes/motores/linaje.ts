/**
 * Linaje de lotes y recorrido de vasijas — port de motor_linaje.py.
 *
 * Fusión y split NO son tipos de movimiento: se deducen del grafo. Un lote con
 * ≥2 padres es una fusión; uno con ≥2 hijos es un split.
 */

import { movimientosEjecutados } from './movimientos';
import type { Fila } from './fml';

/** Movimientos que crean una arista lote → lote. */
export const TIPOS_A_LOTE = ['traspaso', 'renombre'];

/**
 * Marcador de medición inválida. Se conserva en los datos guardados, pero
 * NUNCA debe mostrarse al usuario como un valor real.
 */
export const MARCADOR_INVALIDO = -999;

/**
 * ¿Es el marcador -999? Acepta número y texto numérico. Un negativo legítimo
 * que no sea exactamente -999 no se filtra.
 */
function esMarcador(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const n = typeof v === 'number' ? v : Number(v);
  return !Number.isNaN(n) && n === MARCADOR_INVALIDO;
}

/**
 * Normaliza un número de lote a texto limpio ('' si es null/undefined).
 *
 * Difiere de `String(v || '')` para v=0 (da "0", no "") o v=false (da "false").
 * Los números de lote nunca son 0 ni false, pero la fórmula es la del código
 * original, no una aproximación.
 *
 * Hogar único del normalizador: los demás módulos lo importan de acá.
 */
export function normalizarLote(v: unknown): string {
  return v !== null && v !== undefined ? String(v).trim() : '';
}

const sl = normalizarLote;

export interface Arista {
  lote: string;
  tipo: unknown;
  fecha: unknown;
  litros: unknown;
}

export interface Salida {
  destino: string;
  tipo: unknown;
  fecha: unknown;
  litros: unknown;
}

export interface Nodo {
  padres: Arista[];
  hijos: Arista[];
  salidas: Salida[];
}

export type Grafo = Map<string, Nodo>;

/**
 * Grafo de linaje: lote → {padres, hijos, salidas}.
 *
 * Un lote_destino que no existe en el maestro TAMBIÉN entra en el grafo: el
 * dato no se descarta, el aviso lo da el servidor.
 */
export function grafo(datos: Record<string, unknown> | null | undefined): Grafo {
  const d = datos ?? {};
  const g: Grafo = new Map();

  const nodo = (lote: string): Nodo => {
    let n = g.get(lote);
    if (!n) {
      n = { padres: [], hijos: [], salidas: [] };
      g.set(lote, n);
    }
    return n;
  };

  for (const l of (d.lotes as Fila[]) ?? []) nodo(sl((l ?? {}).lote));

  // Los pendientes todavía no movieron vino: no arman aristas de linaje.
  for (const raw of movimientosEjecutados((d.movimientos as Fila[]) ?? [])) {
    const m = raw ?? {};
    const origen = sl(m.lote);
    if (!origen) continue;

    const tipo = m.tipo;
    if (TIPOS_A_LOTE.includes(String(tipo))) {
      const destino = sl(m.lote_destino);
      if (!destino) continue;
      const base = { tipo, fecha: m.fecha, litros: m.litros };
      nodo(origen).hijos.push({ ...base, lote: destino });
      nodo(destino).padres.push({ ...base, lote: origen });
    } else if (tipo === 'salida') {
      nodo(origen).salidas.push({
        destino: sl(m.destino_externo),
        tipo,
        fecha: m.fecha,
        litros: m.litros,
      });
    } else {
      nodo(origen);
    }
  }

  return g;
}

/**
 * Lotes que recibieron vino de otro lote: los destinos de los traspasos y
 * renombres ejecutados. Es la misma arista padre→hijo que arma grafo(), sin
 * armar el grafo entero.
 */
export function lotesConPadre(movimientos: Fila[] | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const raw of movimientosEjecutados(movimientos ?? [])) {
    const m = raw ?? {};
    if (!TIPOS_A_LOTE.includes(String(m.tipo)) || !sl(m.lote)) continue;
    const destino = sl(m.lote_destino);
    if (destino) out.add(destino);
  }
  return out;
}

/**
 * Lotes que son el MISMO vino, siguiendo solo aristas de tipo renombre.
 *
 * Devuelve la cadena completa ordenada, incluyendo el lote consultado. Un
 * traspaso es mezcla, no continuidad, y no entra. Tolera ciclos.
 */
export function cadenaIdentidad(lote: unknown, g: Grafo | null): string[] {
  const inicio = sl(lote);
  const grafoSeguro = g ?? new Map<string, Nodo>();
  const vistos = new Set<string>();
  const pila = [inicio];

  // Tope de seguridad: un recorrido correcto visita cada nodo a lo sumo una
  // vez. Si se supera, la guarda de visitados falló: mejor un fallo ruidoso y
  // diagnosticable que un cuelgue silencioso. En producción es inalcanzable.
  const tope = grafoSeguro.size + 1;
  let pasos = 0;

  while (pila.length) {
    if (++pasos > tope) {
      throw new Error(
        `cadenaIdentidad: tope de seguridad superado al recorrer desde el lote ${inicio} ` +
          `(tope=${tope}). La guarda de visitados falló.`,
      );
    }
    const act = pila.pop()!;
    if (vistos.has(act)) continue;
    vistos.add(act);

    const nodo = grafoSeguro.get(act) ?? { padres: [], hijos: [], salidas: [] };
    for (const lado of ['padres', 'hijos'] as const) {
      for (const ar of nodo[lado] ?? []) {
        if (ar.tipo === 'renombre') {
          const otro = sl(ar.lote);
          if (otro && !vistos.has(otro)) pila.push(otro);
        }
      }
    }
  }

  return [...vistos].sort();
}

/**
 * Ciclos en el grafo de linaje. Lista vacía = grafo limpio.
 *
 * Sin esto, el render del árbol de linaje entraría en recursión infinita.
 * DFS iterativo con marcas: 0 = sin visitar, 1 = en el camino actual, 2 = cerrado.
 */
export function ciclos(datos: Record<string, unknown>): string[][] {
  const g = grafo(datos);
  const hijos = new Map<string, string[]>();
  for (const [n, d] of g) hijos.set(n, (d.hijos ?? []).map((a) => sl(a.lote)));

  const marca = new Map<string, number>();
  const encontrados: string[][] = [];

  const nNodos = hijos.size;
  let nAristas = 0;
  for (const v of hijos.values()) nAristas += v.length;

  // El DFS correcto abre cada nodo una vez y recorre cada arista una vez.
  const topeCiclos = nNodos + nAristas + 1;
  let pasos = 0;

  for (const raiz of [...hijos.keys()].sort()) {
    if (marca.get(raiz)) continue;

    const camino: string[] = [raiz];
    const pila: { nodo: string; i: number; lista: string[] }[] = [
      { nodo: raiz, i: 0, lista: hijos.get(raiz) ?? [] },
    ];
    marca.set(raiz, 1);

    while (pila.length) {
      if (++pasos > topeCiclos) {
        throw new Error(
          `ciclos: tope de seguridad superado (tope=${topeCiclos}). La lógica de marcas falló.`,
        );
      }
      const cima = pila[pila.length - 1];
      let avanzo = false;

      while (cima.i < cima.lista.length) {
        const h = cima.lista[cima.i++];
        if (marca.get(h) === 1) {
          // Ciclo: desde la primera aparición de h en el camino.
          const corte = camino.indexOf(h);
          encontrados.push([...camino.slice(corte >= 0 ? corte : 0), h]);
        } else if (!marca.get(h)) {
          marca.set(h, 1);
          camino.push(h);
          pila.push({ nodo: h, i: 0, lista: hijos.get(h) ?? [] });
          avanzo = true;
          break;
        }
      }

      if (!avanzo) {
        marca.set(cima.nodo, 2);
        pila.pop();
        camino.pop();
      }
    }
  }

  return encontrados;
}

/** Clave de orden por fecha ISO. Los sin fecha van primero (dato incompleto). */
function fechaOrden(v: unknown): string {
  return sl(v).slice(0, 10);
}

function delLote(lote: unknown, movimientos: Fila[]): Fila[] {
  const clave = sl(lote);
  return (movimientos ?? [])
    .map((m) => m ?? {})
    .filter((m) => sl(m.lote) === clave)
    .sort((a, b) => {
      const fa = fechaOrden(a.fecha);
      const fb = fechaOrden(b.fecha);
      return fa < fb ? -1 : fa > fb ? 1 : 0;
    });
}

export interface Estadia {
  vasija: string;
  desde: string | null;
  hasta: string | null;
  litros: unknown;
}

/**
 * Estadías en vasija del lote, en orden. La última queda con hasta = null.
 *
 * Fronteras de estadía por tipo de movimiento:
 *   descube  → cierra la anterior y abre una nueva.
 *   trasiego → cierra la anterior y abre una nueva.
 *   relleno  → NO cierra ni abre (agrega volumen donde ya está el vino).
 *   traspaso → cierra la abierta sin abrir una nueva (el vino sale del lote).
 *   renombre → ídem.
 *   salida   → ídem.
 *
 * Las vasijas "sin dato" de la migración se incluyen: mostrar el hueco es
 * mejor que esconderlo.
 */
export function recorridoVasijas(lote: unknown, movimientos: Fila[]): Estadia[] {
  const movs = movimientosEjecutados(movimientos ?? []);
  const estadias: Estadia[] = [];

  for (const m of delLote(lote, movs)) {
    const tipo = sl(m.tipo);
    const fecha = sl(m.fecha).slice(0, 10) || null;
    const destino = sl(m.vasija_destino);

    // Un relleno no desplaza el vino: no abre ni cierra estadía.
    if (tipo === 'relleno') continue;

    if (estadias.length && estadias[estadias.length - 1].hasta === null) {
      estadias[estadias.length - 1].hasta = fecha;
    }
    // Traspaso, renombre y salida: el vino sale del lote. Si traen vasija_destino
    // (p. ej. el traspaso del corte a un hijo del achique), esa vasija es la del
    // otro lote, no una estadía de este.
    if (tipo === 'traspaso' || tipo === 'renombre' || tipo === 'salida') continue;
    if (destino) estadias.push({ vasija: destino, desde: fecha, hasta: null, litros: m.litros });
  }

  return estadias;
}

/**
 * El registro de análisis existe solo para llevar otros agregados (TH2,
 * quitosano...): no tiene química ni corrección. No es un análisis: no mueve
 * la fecha del último análisis ni sale como evento "Analisis". Espejo de
 * esSoloAgregados en public/lotes/js/agregados.js.
 */
export function esSoloAgregados(a: Fila): boolean {
  if (!a || !Array.isArray(a.agregados)) return false;
  return Object.keys(a).every(
    (k) => k === 'lote' || k === 'fecha_analisis' || k === 'agregados' || a[k] == null || a[k] === '',
  );
}

/** Los agregados no anulados de un registro (anulada: {} no cuenta como anulada). */
function agregadosVigentes(a: Fila): Fila[] {
  const lista = Array.isArray(a?.agregados) ? (a.agregados as Fila[]) : [];
  const veraz = (v: unknown) =>
    Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : Boolean(v);
  return lista.filter((ag) => ag && sl(ag.producto) && !veraz(ag.anulada));
}

function tieneCorreccion(a: Fila): boolean {
  const c = ((a ?? {}).correccion as Fila) ?? {};
  return ['so2_deseado', 'mbk_a_agregar', 'ml_exactos', 'ot_n'].some((k) => Boolean(sl(c[k])));
}

export interface Evento {
  fecha: string;
  clase: string;
  titulo: string;
  detalle: string;
}

/**
 * Todos los eventos del lote en un solo eje, ordenados por fecha.
 *
 * Clases: ingreso, movimiento, analisis, correccion, agregado, etapa. Los eventos sin
 * fecha se descartan: no se pueden ubicar en el eje.
 */
export function lineaTiempo(
  lote: Fila,
  analisis: Fila[],
  movimientos: Fila[],
  historialEtapas: Fila[],
): Evento[] {
  const movs = movimientosEjecutados(movimientos ?? []);
  const l = lote ?? {};
  const clave = sl(l.lote);
  const ev: Evento[] = [];

  const fIng = sl(l.fecha_ingreso).slice(0, 10);
  if (fIng) {
    ev.push({
      fecha: fIng,
      clase: 'ingreso',
      titulo: 'Ingreso',
      detalle: `${l.kilos || '?'} kg, vasija ${l.vasija_fa || '?'}`,
    });
  }

  for (const raw of movs ?? []) {
    const m = raw ?? {};
    if (sl(m.lote) !== clave) continue;
    const f = sl(m.fecha).slice(0, 10);
    if (!f) continue;

    const destino = sl(m.lote_destino) || sl(m.destino_externo) || sl(m.vasija_destino);
    const partes: string[] = [];
    if (sl(m.vasija_origen)) partes.push(`de ${m.vasija_origen}`);
    if (destino) partes.push(`a ${destino}`);
    if (sl(m.litros)) partes.push(`${m.litros} L`);

    const tipo = sl(m.tipo);
    ev.push({
      fecha: f,
      clase: 'movimiento',
      titulo: tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1).toLowerCase() : '',
      detalle: partes.join(', '),
    });
  }

  for (const raw of analisis ?? []) {
    const a = raw ?? {};
    if (sl(a.lote) !== clave) continue;
    const f = sl(a.fecha_analisis).slice(0, 10);
    if (!f) continue;

    const campos: [string, unknown][] = [
      ['pH', a.ph],
      ['AV', a.av],
      ['malico', a.malico],
      ['SO2 libre', a.so2_libre],
    ];
    const detalle = campos
      .filter(([, v]) => sl(v) && !esMarcador(v))
      .map(([n, v]) => `${n} ${v}`)
      .join(', ');

    if (!esSoloAgregados(a)) ev.push({ fecha: f, clase: 'analisis', titulo: 'Analisis', detalle });

    const ags = agregadosVigentes(a);
    if (ags.length) {
      const ots = [...new Set(ags.map((ag) => sl(ag.ot_n)).filter(Boolean))];
      ev.push({
        fecha: f,
        clase: 'agregado',
        titulo: 'Agregado',
        detalle:
          ags.map((ag) => [sl(ag.producto), sl(ag.cantidad), sl(ag.unidad)].filter(Boolean).join(' ')).join(', ') +
          `, OT ${ots.join(', ') || '-'}`,
      });
    }

    if (tieneCorreccion(a)) {
      const c = (a.correccion as Fila) ?? {};
      ev.push({
        fecha: sl(c.fecha).slice(0, 10) || f,
        clase: 'correccion',
        titulo: 'Correccion SO2',
        detalle: `deseado ${c.so2_deseado || '?'}, MBK ${c.mbk_a_agregar || '?'} g, OT ${c.ot_n || '-'}`,
      });
    }
  }

  for (const raw of historialEtapas ?? []) {
    const h = raw ?? {};
    const f = sl(h.desde).slice(0, 10);
    if (!f) continue;
    ev.push({
      fecha: f,
      clase: 'etapa',
      titulo: `Etapa: ${sl(h.etapa)}`,
      detalle: `confirmada por ${h.por || '?'}`,
    });
  }

  return ev.sort((a, b) =>
    a.fecha !== b.fecha ? (a.fecha < b.fecha ? -1 : 1) : a.clase < b.clase ? -1 : a.clase > b.clase ? 1 : 0,
  );
}
