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
    (a, b) =>
      (fechaDia(a.fecha_analisis) ?? Number.MAX_SAFE_INTEGER) -
      (fechaDia(b.fecha_analisis) ?? Number.MAX_SAFE_INTEGER),
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

/**
 * Una fila cuenta como analisis si trae fecha y al menos una medicion INFORMADA.
 *
 * Informada no es lo mismo que usable: el -999 es el FOSS diciendo "corri y la
 * lectura salio fuera de rango". Hubo analisis, aunque el numero no sirva para
 * comparar contra un umbral. Por eso aca se pregunta con num() y no con
 * valorValido() (el original hace `row.get(metric) is not None`).
 *
 * El SO2 libre es la excepcion y sigue pasando por so2LibreDe(): su 0 es el
 * placeholder que deja el laboratorio cuando no midio, no una medicion.
 */
export function esMedicionUtil(a: Fila): boolean {
  if (fechaDia(a.fecha_analisis) === null) return false;
  return METRICAS_UTILES.some((m) => (m === 'so2_libre' ? so2LibreDe(a) : num(a[m])) !== null);
}

export function tieneAnalisisValido(analisis: Fila[]): boolean {
  return (analisis ?? []).some(esMedicionUtil);
}

/**
 * El control de proceso exige etanol, AV y malico en la MISMA fila: es una
 * corrida completa del FOSS. Mediciones sueltas no lo reemplazan, y por eso no
 * reinician la frecuencia.
 *
 * Lo que se pide es que las tres esten INFORMADAS, no que sean usables: un
 * -999 es el FOSS reportando fuera de rango, o sea que la corrida existio y la
 * frecuencia se reinicia igual. Por eso num() y no valorValido().
 */
export function ultimoControlProceso(analisis: Fila[]): Fila | null {
  const ordenados = ordenarPorFecha(analisis);
  for (let i = ordenados.length - 1; i >= 0; i--) {
    const a = ordenados[i];
    if (fechaDia(a.fecha_analisis) === null) continue;
    if (METRICAS_PROCESO.every((m) => num(a[m]) !== null)) return a;
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

/** Si a este proyecto se le agrega SO2. Lo usan veredictoSo2 y, para pintar la
 *  celda, veredictosAnalisis: en un proyecto sin sulfitado no hay nivel de SO2
 *  que este "mal". */
export function so2Aplica(eff: Criterios): boolean {
  return String(eff.so2_aplica ?? 'si').trim().toLowerCase() !== 'no';
}

/** Veredicto de SO2 de UNA fila. `fuera === null` significa "no hay veredicto". */
export interface VeredictoSo2 {
  fuera: boolean | null;
  libre: number | null;
  /** pH usado para el molecular: el propio de la fila o el de respaldo. */
  ph: number | null;
  ph_propio: boolean;
  molecular: number | null;
  motivo: string;
}

/**
 * LA regla de SO2: la usan estadoSo2 (veredicto del lote) y flagsAnalisis (la
 * celda roja de la tabla de Analisis), asi que no pueden contradecirse.
 *
 * Dos tramos, como el tablero: en el piso o por debajo es fuera de criterio sin
 * mirar nada mas; por encima decide el molecular. Devuelve `fuera: null` cuando
 * no hay con que pronunciarse (proyecto sin SO2, fila sin medicion, o sin
 * ningun pH por encima del piso).
 *
 * `phRespaldo` es el ultimo pH valido del lote. Quien juzga una fila suelta
 * (flagsAnalisis) no lo tiene y pasa null: ahi, sin pH propio y por encima del
 * piso, no hay veredicto.
 */
export function veredictoSo2(
  a: Fila,
  eff: Criterios,
  phRespaldo: number | null = null,
): VeredictoSo2 {
  const vacio = { libre: null, ph: null, ph_propio: false, molecular: null };

  if (!so2Aplica(eff)) {
    return { ...vacio, fuera: null, motivo: 'el proyecto no lleva adicion de SO2' };
  }

  const libre = so2LibreDe(a);
  if (libre === null) {
    return { ...vacio, fuera: null, motivo: 'sin medicion de SO2 libre' };
  }

  if (libre <= eff.so2_libre_piso) {
    return {
      ...vacio,
      fuera: true,
      libre,
      motivo: `SO2 libre ${libre} ppm, en o por debajo del piso de ${eff.so2_libre_piso}`,
    };
  }

  const propio = valorValido(a.ph);
  const ph = propio ?? phRespaldo;
  if (ph === null) {
    return {
      ...vacio,
      fuera: null,
      libre,
      motivo: 'el lote no tiene ningun pH, no se puede calcular el molecular',
    };
  }

  const molecular = molecularDe(libre, ph);
  const bajo = molecular < eff.so2_molecular_objetivo;
  return {
    fuera: bajo,
    libre,
    ph,
    ph_propio: propio !== null,
    molecular,
    motivo: bajo
      ? `molecular ${molecular.toFixed(3)} mg/L, por debajo de ${eff.so2_molecular_objetivo}`
      : `molecular ${molecular.toFixed(3)} mg/L, suficiente`,
  };
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
 * Veredicto de SO2 del lote: se busca la ultima fila con SO2 libre medido y se
 * la juzga con veredictoSo2(). La regla no vive aca, vive alla.
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

  if (!so2Aplica(eff)) {
    return { ...vacio, estado: 'no_aplica', motivo: 'el proyecto no lleva adicion de SO2' };
  }

  const [phRespaldo, phRespaldoFecha] = ultimoPh(analisis);
  const ordenados = ordenarPorFecha(analisis);

  for (let i = ordenados.length - 1; i >= 0; i--) {
    const a = ordenados[i];
    const v = veredictoSo2(a, eff, phRespaldo);
    if (v.libre === null) continue;

    const libre_fecha = String(a.fecha_analisis).slice(0, 10);

    // Hay SO2 medido pero el lote no tiene ningun pH: no se puede calcular el
    // molecular y el valor esta por encima del piso, asi que no hay veredicto.
    if (v.fuera === null) {
      return { ...vacio, estado: 'sin_datos', libre: v.libre, libre_fecha, motivo: v.motivo };
    }

    return {
      estado: v.fuera ? 'no_ok' : 'ok',
      libre: v.libre,
      libre_fecha,
      ph_referencia: v.ph,
      ph_referencia_fecha: v.ph === null ? null : v.ph_propio ? libre_fecha : phRespaldoFecha,
      molecular: v.molecular,
      motivo: v.motivo,
      desde: v.fuera
        ? desdeCuando(analisis, (f) => veredictoSo2(f, eff, phRespaldo).fuera)
        : null,
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
  if (!so2Aplica(eff)) return vacio;

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
 * Si este lote queda FUERA del seguimiento de FML, y por que.
 *
 * La variedad define el caso general y el lote es la excepcion puntual, asi que
 * lo que diga la fila del lote pisa a lo que diga config — en las DOS
 * direcciones: un Chardonnay (variedad configurada con hace_fml 'no') que trae
 * hace_fml 'si' en su ficha SI se sigue.
 *
 * Vive aparte de estadoFml porque tiene un segundo consumidor que no tiene el
 * historial de analisis a mano: veredictosAnalisis, que necesita saber si la
 * celda de malico se puede juzgar. Con la regla copiada en los dos lados, una
 * pantalla terminaria marcando fuera de criterio un malico que el tablero
 * considera excluido.
 *
 * Los nombres de origen son los del tablero (columna fml_excluida_origen).
 */
export function fmlExcluida(lote: Fila, eff: Criterios): {
  excluida: boolean;
  origen: 'lote' | 'variedad_blanca' | 'sin_dato';
} {
  const decisionLote = textoDe((lote ?? {}).hace_fml);
  const excluidaLote = textoDe((lote ?? {}).fml_excluida);

  if (excluidaLote === 'si' || decisionLote === 'no') return { excluida: true, origen: 'lote' };
  if (decisionLote === 'si' || excluidaLote === 'no') return { excluida: false, origen: 'lote' };
  if (textoDe(eff.hace_fml) === 'no') return { excluida: true, origen: 'variedad_blanca' };
  return { excluida: false, origen: 'sin_dato' };
}

export function estadoFml(analisis: Fila[], eff: Criterios, lote: Fila) {
  const { excluida, origen } = fmlExcluida(lote, eff);
  if (excluida) return { estado: 'excluida', origen, desde: null };

  const malicos = ordenarPorFecha(analisis)
    .map((a) => valorValido(a.malico))
    .filter((v): v is number => v !== null);

  if (!malicos.length) return { estado: 'sin_dato', origen, desde: null };

  const ultimo = malicos[malicos.length - 1];
  const cierra =
    ultimo < eff.fml_malico_finalizada ||
    (malicos.length >= 2 &&
      ultimo < eff.fml_malico_2ultimas &&
      malicos[malicos.length - 2] < eff.fml_malico_2ultimas);

  if (cierra) return { estado: 'finalizada', origen, desde: null };

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

