/**
 * El reporte de gerencia de Prensas muestra solo la vendimia más nueva, igual
 * que el Panel de la app cuando nadie tocó el selector de años. Si no, con dos
 * vendimias cargadas las tablas y los totales mezclarían 2025 con 2026.
 *
 * Los lotes sin año (no son 5 dígitos) quedan siempre, como en la app: misma
 * regla de anioDeLote que public/shared/anios.js.
 */
import { anioDeLote } from '../lotes/motores/anios';

const SECCIONES = ['lotes', 'analisis', 'degustaciones', 'agregados'] as const;

type Doc = Record<string, unknown>;
type Fila = Record<string, unknown>;

function filas(x: unknown): Fila[] {
  return Array.isArray(x) ? (x as Fila[]) : [];
}

export function recortarAlUltimoAnio<T extends Doc>(doc: T): T & Record<(typeof SECCIONES)[number], Fila[]> {
  let ultimo: number | null = null;
  for (const l of filas(doc.lotes)) {
    const a = anioDeLote(l?.lote);
    if (a !== null && (ultimo === null || a > ultimo)) ultimo = a;
  }
  if (ultimo === null) return doc as T & Record<(typeof SECCIONES)[number], Fila[]>;

  const queda = (f: Fila) => {
    const a = anioDeLote(f?.lote);
    return a === null || a === ultimo;
  };
  const r: Doc = { ...doc };
  for (const k of SECCIONES) {
    if (Array.isArray(doc[k])) r[k] = filas(doc[k]).filter(queda);
  }
  return r as T & Record<(typeof SECCIONES)[number], Fila[]>;
}
