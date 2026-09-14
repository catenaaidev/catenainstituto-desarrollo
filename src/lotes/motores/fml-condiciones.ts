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

// -------------------------------------------------------- medicion y controles

const METRICAS_UTILES = ['ph', 'av', 'malico', 'azucar_reductor', 'so2_libre', 'etanol'];
const METRICAS_PROCESO = ['etanol', 'av', 'malico'];

/** Una fila cuenta como analisis si trae fecha y al menos una medicion real. */
export function esMedicionUtil(a: Fila): boolean {
  if (fechaDia(a.fecha_analisis) === null) return false;
  return METRICAS_UTILES.some((m) => (m === 'so2_libre' ? so2LibreDe(a) : valorValido(a[m])) !== null);
}

export function tieneAnalisisValido(analisis: Fila[]): boolean {
  return (analisis ?? []).some(esMedicionUtil);
}

/**
 * El control de proceso exige etanol, AV y malico en la MISMA fila: es una
 * corrida completa del FOSS. Mediciones sueltas no lo reemplazan, y por eso no
 * reinician la frecuencia.
 */
export function ultimoControlProceso(analisis: Fila[]): Fila | null {
  const ordenados = ordenarPorFecha(analisis);
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const a = ordenados[i];
    if (fechaDia(a.fecha_analisis) === null) continue;
    if (METRICAS_PROCESO.every((m) => valorValido(a[m]) !== null)) return a;
  }
  return null;
}

export interface ResultadoFrecuencia {
  estado: 'al_dia' | 'vencido' | 'sin_datos';
  ultima_fecha_control: string | null;
  dias_desde_control: number | null;
  frecuencia_max: number;
  control_proceso_pendiente: boolean;
  desde: string | null;   // fecha en que vencio
}

export function estadoFrecuencia(
  analisis: Fila[],
  eff: Criterios,
  fmlEstado: string,
  hoy: number,
): ResultadoFrecuencia {
  // Solo aflojan a 30 dias los lotes con la FML cerrada o excluida. "sin_dato"
  // se trata como no terminada: no saber no es una razon para espaciar.
  const terminada = fmlEstado === 'finalizada' || fmlEstado === 'excluida';
  const frecuencia_max = terminada ? eff.frecuencia_terminada : eff.frecuencia_no_terminada;
  const control = ultimoControlProceso(analisis);

  if (!control) {
    return {
      estado: 'sin_datos',
      ultima_fecha_control: null,
      dias_desde_control: null,
      frecuencia_max,
      control_proceso_pendiente: true,
      desde: null,
    };
  }

  const f = fechaDia(control.fecha_analisis) as number;
  const dias = Math.round((hoy - f) / DIA_MS);
  const vencido = dias > frecuencia_max;

  return {
    estado: vencido ? 'vencido' : 'al_dia',
    ultima_fecha_control: String(control.fecha_analisis).slice(0, 10),
    dias_desde_control: dias,
    frecuencia_max,
    control_proceso_pendiente: false,
    desde: vencido ? new Date(f + frecuencia_max * DIA_MS).toISOString().slice(0, 10) : null,
  };
}

/**
 * Desde cuando rige una condicion: se camina el historial hacia atras mientras
 * se siga cumpliendo y se devuelve la fecha de la mas vieja de esa corrida.
 *
 * Las filas que no traen el dato devuelven null y se saltean sin cortar: un
 * analisis de AV en el medio no "arregla" un pH alto que nadie volvio a medir.
 */
export function desdeCuando(
  analisis: Fila[],
  cumple: (a: Fila) => boolean | null,
): string | null {
  const ordenados = ordenarPorFecha(analisis).filter((a) => fechaDia(a.fecha_analisis) !== null);
  let desde: string | null = null;
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const v = cumple(ordenados[i]);
    if (v === null) continue;
    if (!v) break;
    desde = String(ordenados[i].fecha_analisis).slice(0, 10);
  }
  return desde;
}

/**
 * El tablero usa "> 3.65", "> 3.75" y ">= 3.79": el Cabernet es inclusivo y el
 * resto no. La clave ph_max_inclusive lo hace explicito en vez de esconderlo en
 * un 3.789 magico.
 */
export function phFueraDeCriterio(ph: number, eff: Criterios): boolean {
  const inclusive = String(eff.ph_max_inclusive ?? 'no').trim().toLowerCase() === 'si';
  return inclusive ? ph >= eff.ph_max : ph > eff.ph_max;
}

export interface ResultadoPh {
  estado: 'ok' | 'no_ok' | 'sin_datos';
  valor: number | null;
  fecha: string | null;
  desde: string | null;
}

export function estadoPh(analisis: Fila[], eff: Criterios): ResultadoPh {
  const ordenados = ordenarPorFecha(analisis);
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const v = valorValido(ordenados[i].ph);
    if (v === null) continue;
    const fuera = phFueraDeCriterio(v, eff);
    return {
      estado: (fuera ? 'no_ok' : 'ok') as 'ok' | 'no_ok' | 'sin_datos',
      valor: v,
      fecha: String(ordenados[i].fecha_analisis).slice(0, 10),
      desde: fuera
        ? desdeCuando(analisis, (a) => {
            const p = valorValido(a.ph);
            return p === null ? null : phFueraDeCriterio(p, eff);
          })
        : null,
    };
  }
  return { estado: 'sin_datos' as const, valor: null, fecha: null, desde: null };
}

// Re-exportar Criterios como tipo para que los consumidores de este modulo
// puedan tipear sus funciones sin importar desde fml.ts directamente.
export type { Criterios };
