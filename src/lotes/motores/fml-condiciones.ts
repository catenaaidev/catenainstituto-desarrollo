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

// -------------------------------------------------------------------- SO2

function molecularDe(libre: number, ph: number): number {
  return libre / (1 + Math.pow(10, ph - 1.8));
}

/** Ultimo pH valido del lote, con su fecha. Es el pH de referencia de respaldo. */
function ultimoPh(analisis: Fila[]): [number | null, string | null] {
  const ordenados = ordenarPorFecha(analisis);
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const v = valorValido(ordenados[i].ph);
    if (v !== null) return [v, String(ordenados[i].fecha_analisis).slice(0, 10)];
  }
  return [null, null];
}

function so2NoOk(a: Fila, eff: Criterios, phRespaldo: number | null): boolean | null {
  const libre = so2LibreDe(a);
  if (libre === null) return null;
  if (libre <= eff.so2_libre_piso) return true;
  const ph = valorValido(a.ph) ?? phRespaldo;
  if (ph === null) return null;
  return molecularDe(libre, ph) < eff.so2_molecular_objetivo;
}

export interface ResultadoSo2 {
  estado: 'ok' | 'no_ok' | 'no_aplica' | 'sin_datos';
  libre: number | null;
  libre_fecha: string | null;
  ph_referencia: number | null;
  ph_referencia_fecha: string | null;
  molecular: number | null;
  motivo: string;
  desde: string | null;
}

/**
 * Dos tramos, como el tablero: en el piso o por debajo es no OK sin mirar nada
 * mas; por encima, decide el molecular.
 *
 * El pH sale de la misma muestra cuando esta, y si no del ultimo pH valido del
 * lote. Verificado contra el tablero aprobado: su lote 26031 tiene el SO2 del
 * 19/08 y el pH del 11/09 y queda "ok", asi que el respaldo existe alla tambien.
 * ph_referencia_fecha deja ver de que muestra salio.
 */
export function estadoSo2(analisis: Fila[], eff: Criterios): ResultadoSo2 {
  const vacio = {
    libre: null, libre_fecha: null, ph_referencia: null,
    ph_referencia_fecha: null, molecular: null, desde: null,
  };

  if (String(eff.so2_aplica ?? 'si').trim().toLowerCase() === 'no') {
    return { ...vacio, estado: 'no_aplica', motivo: 'el proyecto no lleva adicion de SO2' };
  }

  const [phRespaldo, phRespaldoFecha] = ultimoPh(analisis);
  const ordenados = ordenarPorFecha(analisis);

  for (let i = ordenados.length - 1; i >= 0; i--) {
    const a = ordenados[i];
    const libre = so2LibreDe(a);
    if (libre === null) continue;

    const libre_fecha = String(a.fecha_analisis).slice(0, 10);
    const desde = () => desdeCuando(analisis, (f) => so2NoOk(f, eff, phRespaldo));

    if (libre <= eff.so2_libre_piso) {
      return {
        ...vacio, estado: 'no_ok', libre, libre_fecha,
        motivo: `SO2 libre ${libre} ppm, en o por debajo del piso de ${eff.so2_libre_piso}`,
        desde: desde(),
      };
    }

    const propio = valorValido(a.ph);
    const ph = propio ?? phRespaldo;
    if (ph === null) {
      return {
        ...vacio, estado: 'sin_datos', libre, libre_fecha,
        motivo: 'el lote no tiene ningun pH, no se puede calcular el molecular',
      };
    }

    const molecular = molecularDe(libre, ph);
    const bajo = molecular < eff.so2_molecular_objetivo;
    return {
      estado: bajo ? 'no_ok' : 'ok',
      libre, libre_fecha,
      ph_referencia: ph,
      ph_referencia_fecha: propio !== null ? libre_fecha : phRespaldoFecha,
      molecular,
      motivo: bajo
        ? `molecular ${molecular.toFixed(3)} mg/L, por debajo de ${eff.so2_molecular_objetivo}`
        : `molecular ${molecular.toFixed(3)} mg/L, suficiente`,
      desde: bajo ? desde() : null,
    };
  }

  return { ...vacio, estado: 'sin_datos', motivo: 'sin ninguna medicion de SO2 libre' };
}

// ----------------------------------------------------------------- Caida SO2

export interface ResultadoCaida {
  alerta: boolean;
  anterior: number | null; anterior_fecha: string | null;
  actual: number | null;   actual_fecha: string | null;
  caida: number | null;
  desde: string | null;
}

/**
 * Caida entre las dos ultimas FECHAS DISTINTAS con SO2 valido. Dos mediciones
 * del mismo dia son la misma foto, no una evolucion.
 */
export function caidaSo2(analisis: Fila[], eff: Criterios): ResultadoCaida {
  const vacio: ResultadoCaida = {
    alerta: false, anterior: null, anterior_fecha: null,
    actual: null, actual_fecha: null, caida: null, desde: null,
  };
  if (String(eff.so2_aplica ?? 'si').trim().toLowerCase() === 'no') return vacio;

  const porFecha = new Map<string, number>();
  for (const a of ordenarPorFecha(analisis)) {
    const v = so2LibreDe(a);
    if (v === null || fechaDia(a.fecha_analisis) === null) continue;
    porFecha.set(String(a.fecha_analisis).slice(0, 10), v); // la ultima del dia manda
  }
  const fechas = [...porFecha.keys()].sort();
  if (fechas.length < 2) return vacio;

  const actual_fecha = fechas[fechas.length - 1];
  const anterior_fecha = fechas[fechas.length - 2];
  const actual = porFecha.get(actual_fecha) as number;
  const anterior = porFecha.get(anterior_fecha) as number;
  const caida = anterior - actual;
  const alerta = caida > eff.so2_caida_max;

  return {
    alerta, anterior, anterior_fecha, actual, actual_fecha, caida,
    desde: alerta ? actual_fecha : null,
  };
}

// ----------------------------------------------------------------- Alerta AV

export interface ResultadoAv {
  alerta: boolean;
  motivo: 'umbral' | 'aumento' | 'fuera_rango_foss' | null;
  valor: number | null;
  fecha: string | null;
  delta: number | null;
  desde: string | null;
}

/**
 * Tres motivos, en orden de prioridad: el FOSS fuera de rango, el umbral y el
 * salto. El -999 gana porque significa que el valor no es confiable.
 */
export function alertaAv(analisis: Fila[], eff: Criterios): ResultadoAv {
  const ordenados = ordenarPorFecha(analisis);
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const a = ordenados[i];
    const raw = num(a.av);
    if (raw === null) continue;

    const fecha = String(a.fecha_analisis).slice(0, 10);
    if (raw === INVALIDO) {
      return { alerta: true, motivo: 'fuera_rango_foss', valor: null, fecha, delta: null, desde: fecha };
    }

    const fUltimo = fechaDia(a.fecha_analisis);
    if (raw > eff.av_max) {
      return {
        alerta: true, motivo: 'umbral', valor: raw, fecha, delta: null,
        desde: desdeCuando(analisis, (f) => {
          const v = valorValido(f.av);
          return v === null ? null : v > eff.av_max;
        }),
      };
    }

    for (let j = i - 1; j >= 0; j--) {
      const fp = fechaDia(ordenados[j].fecha_analisis);
      const pav = valorValido(ordenados[j].av);
      if (fp === null || fUltimo === null || pav === null || fp >= fUltimo) continue;
      if (fUltimo - fp <= eff.av_delta_dias * DIA_MS && raw - pav > eff.av_delta_max) {
        return { alerta: true, motivo: 'aumento', valor: raw, fecha, delta: raw - pav, desde: fecha };
      }
    }

    return { alerta: false, motivo: null, valor: raw, fecha, delta: null, desde: null };
  }
  return { alerta: false, motivo: null, valor: null, fecha: null, delta: null, desde: null };
}

// ----------------------------------------------------------------- FML y FA

function textoDe(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

/**
 * La variedad define el caso general y el lote es la excepcion puntual, asi que
 * lo que diga la fila del lote pisa a lo que diga config.
 */
export function estadoFml(analisis: Fila[], eff: Criterios, lote: Fila) {
  const decisionLote = textoDe(lote.hace_fml);
  const excluidaLote = textoDe(lote.fml_excluida);

  // Los nombres de origen son los del tablero (columna fml_excluida_origen).
  let excluida = false;
  let origen: 'lote' | 'variedad_blanca' | 'sin_dato' = 'sin_dato';
  if (excluidaLote === 'si' || decisionLote === 'no') {
    excluida = true; origen = 'lote';
  } else if (decisionLote === 'si' || excluidaLote === 'no') {
    origen = 'lote';
  } else if (textoDe(eff.hace_fml) === 'no') {
    excluida = true; origen = 'variedad_blanca';
  }
  if (excluida) return { estado: 'excluida', origen, desde: null };

  const malicos = ordenarPorFecha(analisis)
    .map((a) => valorValido(a.malico))
    .filter((v): v is number => v !== null);

  if (!malicos.length) return { estado: 'sin_dato', origen: null, desde: null };

  const ultimo = malicos[malicos.length - 1];
  const cierra =
    ultimo < eff.fml_malico_finalizada ||
    (malicos.length >= 2 &&
      ultimo < eff.fml_malico_2ultimas &&
      malicos[malicos.length - 2] < eff.fml_malico_2ultimas);

  if (cierra) return { estado: 'finalizada', origen: null, desde: null };

  return {
    estado: 'no_finalizada',
    origen,
    desde: desdeCuando(analisis, (a) => {
      const v = valorValido(a.malico);
      return v === null ? null : v >= eff.fml_malico_finalizada;
    }),
  };
}

export function estadoFa(analisis: Fila[], eff: Criterios) {
  const ordenados = ordenarPorFecha(analisis);
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const v = valorValido(ordenados[i].azucar_reductor);
    if (v === null) continue;
    const abierta = v > eff.fa_azucar_reductor_max;
    return {
      estado: abierta ? 'no_finalizada' : 'finalizada',
      desde: abierta
        ? desdeCuando(analisis, (a) => {
            const x = valorValido(a.azucar_reductor);
            return x === null ? null : x > eff.fa_azucar_reductor_max;
          })
        : null,
    };
  }
  return { estado: 'sin_dato', desde: null };
}

/** Hay decision de FML si la trae el lote o si la variedad la define por config. */
export function decisionFmlPresente(lote: Fila, eff: Criterios): boolean {
  const decisionLote = textoDe(lote.hace_fml);
  const excluidaLote = textoDe(lote.fml_excluida);
  if (decisionLote === 'si' || decisionLote === 'no') return true;
  if (excluidaLote === 'si' || excluidaLote === 'no') return true;
  return textoDe(eff.hace_fml) === 'no';
}

// Re-exportar Criterios como tipo para que los consumidores de este modulo
// puedan tipear sus funciones sin importar desde fml.ts directamente.
export type { Criterios };
