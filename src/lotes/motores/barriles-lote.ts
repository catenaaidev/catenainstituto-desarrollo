/**
 * Barriles del Mapa agrupados por lote, con los campos de la "Planilla de
 * movimiento de barriles" (N° barril, capacidad, año, proveedor, origen,
 * tratamiento). Lo usan las OT de trasiego.
 *
 * Por qué no reusa normalizarMapa(): esa normalización descarta anio, marca,
 * origen y trat, y la usan /cruce y /orden-correccion. Sumarle campos la haría
 * más pesada para dos consumidores que no los necesitan.
 */
import { normalizarLote } from './linaje';
import { num, filasDe } from './fml-condiciones';

export interface BarrilOT {
  num: string;
  estado: string;
  cap: number | null;
  litros: number | null;
  anio: string;
  marca: string;
  origen: string;
  trat: string;
  lote: string;
  fecha: string;
  /** Momento (ms) del ultimo cambio de esa barrica en el Mapa. Las mermas de
   * Lotes lo guardan al confirmar la OT para no cerrarse con su propio escaneo. */
  ts: number | null;
}

/** Números que vienen del Excel como texto ('225'), con coma o vacíos. Es el
 *  num() compartido: la copia local leia un '  ' como 0. */
const numero = num;

const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

/**
 * Filas del inventario que se pueden leer. El Array.isArray solo no alcanzaba:
 * el guardado de Barriles acepta entradas null, y un b.lote sobre null tira
 * TypeError, el Worker cae con un 1101 y la OT de trasiego no abre.
 */
function filasInventario(estado: Record<string, unknown> | null | undefined): Record<string, unknown>[] {
  return filasDe((estado ?? {}).inventario);
}

function aBarrilOT(b: Record<string, unknown>): BarrilOT {
  return {
    num: txt(b.num),
    estado: txt(b.estado),
    cap: numero(b.cap),
    litros: numero(b.litros),
    anio: txt(b.anio),
    marca: txt(b.marca),
    origen: txt(b.origen),
    trat: txt(b.trat),
    lote: txt(b.lote),
    fecha: txt(b.fecha),
    ts: numero(b.ts),
  };
}

export function barrilesDeLotes(
  estado: Record<string, unknown>,
  lotes: string[],
): Record<string, BarrilOT[]> {
  const out: Record<string, BarrilOT[]> = {};
  for (const l of lotes) {
    const L = normalizarLote(l);
    if (L) out[L] = [];
  }
  for (const b of filasInventario(estado)) {
    const L = normalizarLote(b.lote);
    if (!L || !(L in out)) continue;
    out[L].push(aBarrilOT(b));
  }
  return out;
}

/**
 * Barriles del Mapa por número, sin importar el lote. Lo usan las barricas
 * mermas de Lotes: validar que el barril existe y ver si ya se llenó, aunque
 * el Mapa le haya anotado el lote distinto ("26730 ROJO").
 */
export function barrilesPorNum(
  estado: Record<string, unknown>,
  nums: string[],
): Record<string, BarrilOT | null> {
  const out: Record<string, BarrilOT | null> = {};
  for (const n of nums) {
    const k = txt(n);
    if (k) out[k] = null;
  }
  for (const b of filasInventario(estado)) {
    const k = txt(b.num);
    if (k in out && out[k] === null) out[k] = aBarrilOT(b);
  }
  return out;
}
