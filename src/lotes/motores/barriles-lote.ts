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

export interface BarrilOT {
  num: string;
  estado: string;
  cap: number | null;
  litros: number | null;
  anio: string;
  marca: string;
  origen: string;
  trat: string;
}

/** Números que vienen del Excel como texto ('225') o vacíos. */
function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

export function barrilesDeLotes(
  estado: Record<string, unknown>,
  lotes: string[],
): Record<string, BarrilOT[]> {
  const out: Record<string, BarrilOT[]> = {};
  for (const l of lotes) {
    const L = normalizarLote(l);
    if (L) out[L] = [];
  }
  const inventario = Array.isArray(estado.inventario) ? (estado.inventario as Record<string, unknown>[]) : [];
  for (const b of inventario) {
    const L = normalizarLote(b.lote);
    if (!L || !(L in out)) continue;
    out[L].push({
      num: txt(b.num),
      estado: txt(b.estado),
      cap: numero(b.cap),
      litros: numero(b.litros),
      anio: txt(b.anio),
      marca: txt(b.marca),
      origen: txt(b.origen),
      trat: txt(b.trat),
    });
  }
  return out;
}
