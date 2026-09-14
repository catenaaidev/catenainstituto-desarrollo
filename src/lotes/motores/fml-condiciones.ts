/**
 * Helpers de bajo nivel compartidos por los motores de reglas FML y etapas.
 *
 * Se separan aqui para que las tareas que agregan reglas al tablero puedan
 * importarlos sin crear un ciclo con fml.ts. El tipo Criterios se trae solo
 * como tipo (TypeScript lo borra al compilar, asi que no hay ciclo en runtime).
 */

import type { Criterios } from './fml';

export type Fila = Record<string, unknown>;

/** Marca de dato medido pero invalido. No es lo mismo que "sin dato". */
export const INVALIDO = -999;

export const DIA_MS = 86_400_000;

export const FECHA_MAX = Number.MAX_SAFE_INTEGER;

// ----------------------------------------------------------------- numeros

export function num(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  if (typeof x === 'boolean') return null;
  const v = typeof x === 'number' ? x : Number(String(x).trim());
  return Number.isNaN(v) ? null : v;
}

// ------------------------------------------------------------------ fechas

/** Dia en UTC, para restar fechas sin que el huso mueva un dia. */
export function fechaDia(iso: unknown): number | null {
  if (!iso) return null;
  const s = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(s + 'T00:00:00Z');
  return Number.isNaN(t) ? null : t;
}

// --------------------------------------------------------------- validacion

/** null o -999 => invalido. */
export function valorValido(x: unknown): number | null {
  const v = num(x);
  return v === null || v === INVALIDO ? null : v;
}

// --------------------------------------------------------------- ordenamiento

/** Analisis ordenados por fecha ascendente; los que no tienen fecha van al final. */
export function ordenarPorFecha(analisis: Fila[]): Fila[] {
  return [...(analisis ?? [])].sort(
    (a, b) => (fechaDia(a.fecha_analisis) ?? FECHA_MAX) - (fechaDia(b.fecha_analisis) ?? FECHA_MAX),
  );
}

// ----------------------------------------------------------------- SO2 libre

/**
 * SO2 libre de una fila. El 0 es el placeholder que deja el laboratorio cuando
 * no midio, asi que no cuenta como medicion: tratarlo como valor real daria
 * "SO2 no OK" en lotes que nunca se analizaron.
 */
export function so2LibreDe(a: Fila): number | null {
  for (const campo of ['so2_libre_actual', 'so2_libre']) {
    let v = valorValido(a[campo]);
    if (v === null && a.correccion && typeof a.correccion === 'object') {
      v = valorValido((a.correccion as Fila)[campo]);
    }
    if (v !== null && v !== 0) return v;
  }
  return null;
}

// Re-exportar Criterios como tipo para que los consumidores de este modulo
// puedan tipear sus funciones sin importar desde fml.ts directamente.
export type { Criterios };
