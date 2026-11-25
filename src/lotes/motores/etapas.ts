/**
 * Etapa del proceso y avance por hitos — port de motor_etapas.py.
 *
 * Reusa los helpers de fml.ts (orden por fecha, marcador -999) en lugar de
 * duplicarlos: garantiza que los dos motores traten los datos exactamente
 * igual. Duplicar esa lógica sería peor que acoplarse a ella.
 */

import {
  analisisPorLote,
  criteriosEfectivos,
  evaluarLote,
  ordenarPorFecha,
  valorValido,
  type Criterios,
  type Fila,
  type ResultadoLote,
} from './fml';
import { filasDe } from './fml-condiciones';
import { lotesConPadre, normalizarLote } from './linaje';
import { movimientosEjecutados } from './movimientos';

export const ETAPAS = ['ingreso', 'fa', 'fml', 'crianza', 'cerrado'] as const;
export type Etapa = (typeof ETAPAS)[number];

/** Movimientos que explican que un lote se haya quedado sin litros. */
const TIPOS_EGRESO = ['traspaso', 'salida', 'renombre'];

const ORDEN: Record<string, number> = Object.fromEntries(ETAPAS.map((e, i) => [e, i]));

const CAMPOS_INGRESO = ['variedad', 'proyecto', 'fecha_ingreso', 'kilos', 'vasija_fa'];

/** Un lote que arranca de vino ya hecho no tiene datos de uva que pedirle. */
const CAMPOS_INGRESO_VINO = ['variedad', 'proyecto'];

/** Hitos de la fermentación alcohólica: pasaron en el lote de origen. */
const HITOS_SOLO_UVA = ['fa_finalizada', 'descube_cargado'];

/**
 * ¿El lote arranca de vino ya hecho (un corte, un traspaso) y no de uva?
 *
 * Lo dice la columna Origen. Si está vacía, se deduce del linaje: un lote sin
 * fecha de ingreso que recibió vino de otro lote es un lote de vino. Poner
 * 'Uva' a mano le gana a la deducción.
 */
export function esLoteDeVino(lote: Fila, tienePadre = false): boolean {
  const l = lote ?? {};
  const origen = String(l.origen ?? '').trim().toLowerCase();
  if (origen === 'vino') return true;
  if (origen === 'uva') return false;
  return tienePadre && !String(l.fecha_ingreso ?? '').trim();
}

/**
 * (clave, título, etapa desde la que aplica). "Desde" es inclusivo y hacia
 * adelante: un hito que aplica desde 'fa' también aplica en fml/crianza/cerrado.
 */
const DEFINICION_HITOS: [string, string, Etapa][] = [
  ['datos_ingreso', 'Datos de ingreso completos', 'ingreso'],
  ['fa_finalizada', 'FA finalizada', 'fa'],
  ['descube_cargado', 'Descube cargado', 'fa'],
  ['analisis_al_dia', 'Analisis al dia', 'fa'],
  ['fml_finalizada', 'FML finalizada', 'fml'],
  ['ph_ok', 'pH OK', 'fml'],
  ['so2_ok', 'SO2 OK', 'fml'],
  ['lleno', 'Lleno', 'fml'],
  ['trasiego_post_fml', 'Trasiego post-FML', 'crianza'],
];

function tieneDescube(lote: Fila, movimientos: Fila[]): boolean {
  for (const m of movimientos ?? []) if ((m ?? {}).tipo === 'descube') return true;
  return Boolean((lote ?? {}).descube_fa);
}

/**
 * Etapa que el motor propone.
 *
 * Cascada: cerrado → ingreso → fa → (crianza | fml). Ojo: crianza EXIGE
 * descube. Una blanca tiene fml_estado='excluida' desde el alta, así que sin
 * esa condición un lote recién ingresado caería en crianza.
 */
export function etapaSugerida(
  lote: Fila,
  ev: Partial<ResultadoLote>,
  movimientos: Fila[],
  vino = false,
): Etapa {
  // Los pendientes son planes, no hechos: se filtra en el borde.
  const movs = movimientosEjecutados(movimientos ?? []);
  const l = lote ?? {};
  const litros = (ev ?? {}).litros ?? 0;

  // Un lote de vino no pasa por ingreso ni FA. Recién creado está en 0 litros
  // hasta que le entra el vino, así que solo se cierra si además hubo una
  // salida. Sin málico que diga lo contrario, la FML ya pasó en el origen.
  if (vino) {
    if (litros <= 0 && movs.some((m) => TIPOS_EGRESO.includes(String((m ?? {}).tipo)))) return 'cerrado';
    return (ev ?? {}).fml_estado === 'no_finalizada' ? 'fml' : 'crianza';
  }

  // litros<=0 es señal confiable de vaciado de verdad; fecha_ingreso descarta
  // los placeholders que nunca arrancaron, donde litros=0 es el estado inicial
  // y no un cierre.
  if (litros <= 0 && l.fecha_ingreso) return 'cerrado';
  if (!l.fecha_ingreso) return 'ingreso';
  if (!tieneDescube(l, movs)) return 'fa';
  if ((ev ?? {}).fml_estado === 'finalizada' || (ev ?? {}).fml_estado === 'excluida') return 'crianza';
  return 'fml';
}

/**
 * Fecha ISO del análisis que dio la FML por finalizada, o null.
 * Aplica las dos reglas de fml en orden cronológico y devuelve la primera
 * fecha en que alguna se cumplió.
 */
export function finFml(analisis: Fila[], eff: Criterios): string | null {
  const ordenados = ordenarPorFecha(analisis ?? []);
  const malicos: [number, string][] = [];
  for (const a of ordenados) {
    const v = valorValido((a ?? {}).malico);
    const f = (a ?? {}).fecha_analisis;
    if (v !== null && f) malicos.push([v, String(f).slice(0, 10)]);
  }
  for (let i = 0; i < malicos.length; i++) {
    const [v, f] = malicos[i];
    if (v < eff.fml_malico_finalizada) return f;
    if (i >= 1 && v < eff.fml_malico_2ultimas && malicos[i - 1][0] < eff.fml_malico_2ultimas) return f;
  }
  return null;
}

function faltantesIngreso(lote: Fila, vino: boolean): string[] {
  const campos = vino ? CAMPOS_INGRESO_VINO : CAMPOS_INGRESO;
  return campos.filter((c) => !String((lote ?? {})[c] ?? '').trim());
}

/** Movimiento de descube CON vasija destino cargada, o null. */
function movimientoDescube(movimientos: Fila[]): Fila | null {
  for (const raw of movimientos ?? []) {
    const m = raw ?? {};
    if (m.tipo === 'descube' && String(m.vasija_destino ?? '').trim()) return m;
  }
  return null;
}

/** Primer trasiego con fecha >= ref. null si no hay o si falta la referencia. */
function trasiegoDesde(movimientos: Fila[], ref: string | null): Fila | null {
  if (!ref) return null;
  for (const raw of movimientos ?? []) {
    const m = raw ?? {};
    if (m.tipo !== 'trasiego') continue;
    const f = String(m.fecha ?? '').slice(0, 10);
    if (f && f >= String(ref).slice(0, 10)) return m;
  }
  return null;
}

export interface Hito {
  clave: string;
  titulo: string;
  desde: Etapa;
  aplica: boolean;
  cumplido: boolean;
  detalle: string;
}

/** Los 9 hitos del lote, cada uno con cumplido / aplica / detalle. */
export function hitos(
  lote: Fila,
  analisis: Fila[],
  movimientos: Fila[],
  ev: Partial<ResultadoLote>,
  eff: Criterios,
  etapa: string,
  vino = false,
): Hito[] {
  const movs = movimientosEjecutados(movimientos ?? []);
  const l = lote ?? {};
  const e = ev ?? {};
  const idx = ORDEN[etapa] ?? 0;

  const faltan = faltantesIngreso(l, vino);
  const descube = movimientoDescube(movs);
  const excluida = e.fml_estado === 'excluida';

  // Referencia para el trasiego posterior a la FML. Una blanca nunca cruza el
  // umbral de málico, así que para las excluidas se usa la fecha del descube.
  let ref = finFml(analisis, eff);
  if (ref === null && excluida) {
    ref = String((descube ?? {}).fecha ?? l.descube_fa ?? '').slice(0, 10) || null;
  }
  const trasiego = trasiegoDesde(movs, ref);

  const calc: Record<string, [boolean, string, boolean]> = {
    datos_ingreso: [
      faltan.length === 0,
      faltan.length ? 'faltan: ' + faltan.join(', ') : 'completos',
      true,
    ],
    fa_finalizada: [
      e.fa_estado === 'finalizada',
      `FA ${e.fa_estado} (limite azucar reductor ${eff.fa_azucar_reductor_max})`,
      true,
    ],
    descube_cargado: [
      descube !== null,
      descube ? `descube a ${descube.vasija_destino}` : 'falta el movimiento de descube con vasija destino',
      true,
    ],
    // Al dia es estado_frecuencia === 'al_dia', no "no vencido": un lote sin
    // ningun control de proceso queda 'sin_datos' con vencido=false, y con
    // !e.vencido el hito salia cumplido justo en los lotes que nunca se
    // analizaron. El detalle cuenta desde el CONTROL de proceso, que es lo que
    // mide la frecuencia, y no desde cualquier analisis suelto.
    analisis_al_dia: [
      e.estado_frecuencia === 'al_dia',
      e.estado_frecuencia === 'sin_datos'
        ? `sin control de proceso (etanol, AV y malico en la misma fila; maximo ${e.frecuencia_max} dias)`
        : `${e.dias_desde_control} dias desde el ultimo control de proceso (maximo ${e.frecuencia_max})`,
      true,
    ],
    // En un lote de vino, sin málico cargado se asume que la FML pasó en el
    // origen (la misma regla que lo manda a crianza en etapaSugerida).
    fml_finalizada: [
      e.fml_estado === 'finalizada',
      `FML ${e.fml_estado}`,
      !excluida && !(vino && e.fml_estado === 'sin_dato'),
    ],
    ph_ok: [e.ph_ok === true, `limite pH ${eff.ph_max}`, true],
    so2_ok: [
      e.so2_ok === true,
      `SO2 molecular minimo ${eff.so2_molecular_objetivo} (piso ${eff.so2_libre_piso} ppm de libre)`,
      true,
    ],
    lleno: [e.estado_llenado === 'lleno', `estado de llenado: ${e.estado_llenado}`, true],
    trasiego_post_fml: [
      trasiego !== null,
      trasiego
        ? `trasiego del ${trasiego.fecha}`
        : ref
          ? `sin trasiego posterior al ${ref}`
          : 'FML sin terminar',
      ref !== null,
    ],
  };

  return DEFINICION_HITOS.map(([clave, titulo, desde]) => {
    const [cumplido, detalle, aplicaExtra] = calc[clave];
    const aplica =
      idx >= ORDEN[desde] && Boolean(aplicaExtra) && !(vino && HITOS_SOLO_UVA.includes(clave));
    return { clave, titulo, desde, aplica, cumplido: aplica ? Boolean(cumplido) : false, detalle };
  });
}

export interface Avance {
  pct: number;
  cumplidos: number;
  aplicables: number;
}

/** Barra de %: cumplidos sobre APLICABLES. Los que no aplican no cuentan. */
export function avance(hitosLista: Hito[]): Avance {
  const aplicables = (hitosLista ?? []).filter((h) => h.aplica);
  const cumplidos = aplicables.filter((h) => h.cumplido);
  const n = aplicables.length;
  return {
    pct: n ? Math.round((cumplidos.length * 100) / n) : 0,
    cumplidos: cumplidos.length,
    aplicables: n,
  };
}

/** El avance congelado solo vale si tiene la forma completa y con enteros. */
function avanceCongeladoValido(raw: unknown): Avance | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const { pct, cumplidos, aplicables } = o;
  if (![pct, cumplidos, aplicables].every((v) => typeof v === 'number' && Number.isInteger(v))) {
    return null;
  }
  return { pct: pct as number, cumplidos: cumplidos as number, aplicables: aplicables as number };
}

export interface ResultadoEtapa {
  etapa: string;
  etapa_sugerida: Etapa;
  hitos: Hito[];
  avance: Avance;
}

/**
 * Las etapas no retroceden: la sugerida nunca queda por debajo de la que una
 * persona confirmó. Sin esto, un málico alto después de cerrar la FML hacía
 * que la bandeja propusiera volver de crianza a fml (pedido del 2026-10-14).
 * 'cerrado' es aparte: un lote vaciado que vuelve a recibir vino sí sale,
 * pero sin litros sigue cerrado (sin fecha de ingreso el motor diría
 * 'ingreso', como en los 2025 viejos).
 */
export function noRetroceder(sugerida: Etapa, confirmada: unknown, litros = 0): Etapa {
  const c = String(confirmada ?? '');
  if (c === 'cerrado') return litros > 0 ? sugerida : 'cerrado';
  if (!(c in ORDEN)) return sugerida;
  return ORDEN[sugerida] < ORDEN[c] ? (c as Etapa) : sugerida;
}

/**
 * Entrada única para el servidor: etapa confirmada, sugerida, hitos y avance.
 *
 * `config` es el dict de config del datos.json (con la clave criterios_fml).
 * La etapa que vale es la CONFIRMADA en el lote; la sugerida se informa aparte
 * para que el tablero arme la bandeja de confirmación.
 *
 * Si la etapa es 'cerrado' y el lote trae `avance_congelado` bien formado, se
 * devuelve ese valor: la barra queda congelada al momento del cierre. Los hitos
 * se siguen calculando para que la ficha los muestre como referencia histórica.
 *
 * `etapaForzada` calcula hitos y avance con el contexto de otra etapa, sin
 * mutar nada. Se usa para obtener el avance a congelar ANTES de confirmar el
 * cierre.
 *
 * `opciones.tienePadre` dice si el lote recibió vino de otro lote (ver
 * lotesConPadre en linaje.ts); con eso se deduce el origen cuando la columna
 * Origen está vacía (ver esLoteDeVino).
 */
export function evaluarEtapa(
  lote: Fila,
  analisis: Fila[],
  movimientos: Fila[],
  config: Record<string, unknown>,
  hoy: number,
  etapaForzada: string | null = null,
  opciones: { tienePadre?: boolean } = {},
): ResultadoEtapa {
  const movs = movimientosEjecutados(movimientos ?? []);
  const cfg = ((config ?? {}).criterios_fml as Record<string, unknown>) ?? {};
  const l = lote ?? {};
  const eff = criteriosEfectivos(cfg, l.variedad, l.proyecto);
  const ev = evaluarLote(l, analisis ?? [], cfg, hoy);
  const vino = esLoteDeVino(l, Boolean(opciones.tienePadre));
  const sug = noRetroceder(etapaSugerida(l, ev, movs, vino), l.etapa, ev.litros ?? 0);

  let etapa = String(l.etapa ?? '') || sug;
  if (!(ETAPAS as readonly string[]).includes(etapa)) etapa = sug;

  const etapaParaHitos =
    etapaForzada && (ETAPAS as readonly string[]).includes(etapaForzada) ? etapaForzada : etapa;
  const hs = hitos(l, analisis, movs, ev, eff, etapaParaHitos, vino);

  let av: Avance;
  if (etapa === 'cerrado' && etapaForzada === null) {
    av = avanceCongeladoValido(l.avance_congelado) ?? avance(hs);
  } else {
    av = avance(hs);
  }

  return { etapa, etapa_sugerida: sug, hitos: hs, avance: av };
}

/**
 * {lote: etapa sugerida} de TODOS los lotes, con los mismos insumos que usa el
 * tablero: análisis sin los "no usar" (analisisPorLote), movimientos del lote y
 * el linaje para deducir si es lote de vino.
 *
 * Lo usa el cruce con el Mapa: un lote que nadie confirmó todavía tiene etapa
 * '' y, sin esto, caía en "sin_envase" aunque estuviera fermentando. `datos`
 * es el documento entero de Lotes (config con criterios_fml adentro).
 */
export function etapasSugeridas(datos: Record<string, unknown>, hoy: number): Map<string, Etapa> {
  const d = datos ?? {};
  const config = (d.config as Record<string, unknown>) ?? {};
  const ans = analisisPorLote(d);
  const movsTodos = filasDe(d.movimientos);
  const movs = new Map<string, Fila[]>();
  for (const m of movsTodos) {
    const k = normalizarLote(m.lote);
    const lista = movs.get(k);
    if (lista) lista.push(m);
    else movs.set(k, [m]);
  }
  const conPadre = lotesConPadre(movsTodos);

  const out = new Map<string, Etapa>();
  for (const l of filasDe(d.lotes)) {
    const k = normalizarLote(l.lote);
    if (!k) continue;
    const r = evaluarEtapa(l, ans.get(k) ?? [], movs.get(k) ?? [], config, hoy, null, {
      tienePadre: conPadre.has(k),
    });
    out.set(k, r.etapa_sugerida);
  }
  return out;
}
