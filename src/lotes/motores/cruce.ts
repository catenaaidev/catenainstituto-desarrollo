/**
 * Cruce del desglose de envases de Lotes contra el inventario real del Mapa de
 * Barriles — port de motor_cruce.py.
 *
 * Lógica pura: la lectura del mapa vive en mapa.ts. Este cruce es el que manda
 * a alguien a caminar la bodega a contar barricas, así que los umbrales se
 * portaron con sus valores exactos y sus razones.
 */

import { normalizarLote } from './linaje';
import { num, filasDe } from './fml-condiciones';
import type { Fila } from './fml';
import type { Unidad, MapaNormalizado } from './mapa';

/**
 * La severidad es el PEOR de dos criterios. Un umbral solo absoluto entierra
 * problemas reales: el 26172 declara cero envases estando cerrado y el mapa
 * tiene una barrica a su nombre. Son 50 L (ruido por tamaño) pero es el 100 %
 * del lote.
 */
export const UMBRAL_ABS_ALTA = 700;
export const UMBRAL_ABS_MEDIA = 250;
export const UMBRAL_REL_ALTA = 0.25;
export const UMBRAL_REL_MEDIA = 0.1;

/** Espejo exacto de CAPACIDADES de envases: mismo orden y mismos nombres. */
const CAPACIDADES: [string, number][] = [
  ['cap500', 500],
  ['cap225', 225],
  ['cap200', 200],
  ['cap50', 50],
];

/**
 * El mapa tiene 51 barricas de 228 L y una de 300 L, y Lotes no tiene esos
 * campos. Se cuentan como 225 y el informe declara cuántas se aproximaron: el
 * error es de 3 L por unidad de 228, o 0,04 % sobre 343.850 L.
 */
const EQUIV_CAP: Record<number, number> = { 228: 225, 300: 225 };

/** Un envase grande de margen para decidir que el lote está sin desglosar. */
const UMBRAL_REPRESENTACION = 250;

const ETAPAS_SIN_ENVASE_ESPERADO = ['ingreso', 'fa'];

/**
 * Las series 267xx, 268xx y 269xx son lotes prensa de OTRA aplicación. Son 206
 * unidades y 46.350 L: si se las deja entrar son el 72 % del ruido de huérfanos
 * (288 en vez de 82).
 */
export const PREFIJOS_PRENSA = ['267', '268', '269'];

const ORDEN_SEVERIDAD: Record<string, number> = { alta: 0, media: 1, baja: 2 };

/** Qué veredictos mandan a alguien a caminar. */
const SE_CAMINA = ['sin_barriles', 'sin_envase'];

/**
 * Entero ≥ 0. Trunca a entero, a diferencia del n0 de envases: acá se cuentan
 * envases (cantidades enteras), allá litros (donde el decimal es correcto).
 */
function n0(v: unknown): number {
  // num() acepta la coma: un "112,5" de litros en el Mapa sumaba 0 a huerfanos.
  const n = num(v);
  if (n === null || n <= 0) return 0;
  return Math.trunc(n);
}

export type Desglose = Record<string, number>;

/** Conteos de envases declarados en el lote, por nombre de campo. */
export function desgloseDeclarado(lote: Fila): Desglose {
  const out: Desglose = {};
  for (const [clave] of CAPACIDADES) out[clave] = n0(lote[clave]);
  return out;
}

/**
 * Conteos del mapa y cuántas unidades se aproximaron a 225.
 * Las unidades con cap vacía o no numérica se ignoran: hay 2 así en el
 * inventario real y no se les puede inventar una capacidad.
 */
export function desgloseMapa(unidades: Unidad[]): { cont: Desglose; aproximadas: number } {
  const porCap = new Map<number, string>();
  for (const [clave, cap] of CAPACIDADES) porCap.set(cap, clave);

  const cont: Desglose = {};
  for (const [clave] of CAPACIDADES) cont[clave] = 0;

  let aproximadas = 0;
  for (const u of unidades) {
    // Number() en vez de parseInt para aceptar '225.0': con parseInt de un
    // '225.0' se perdería la parte decimal en silencio y con int() de Python
    // levantaría error. Un lote al que se le caen unidades parece tener
    // barricas faltantes. Va por num() y no por Number() directo para que una
    // cap "225,0" (coma decimal) no se pierda igual.
    const bruto = num(u.cap);
    if (bruto === null) continue;
    let cap = Math.trunc(bruto);
    if (cap in EQUIV_CAP) {
      aproximadas++;
      cap = EQUIV_CAP[cap];
    }
    const clave = porCap.get(cap);
    if (clave) cont[clave] += 1;
  }
  return { cont, aproximadas };
}

/**
 * Litros que suman esos conteos.
 *
 * Deliberadamente NO suma vasija_grande: el mapa no ve los tanques grandes, y
 * meterlos en la comparación inventaría diferencias que no existen.
 */
export function litrosDe(desglose: Desglose): number {
  let total = 0;
  for (const [clave, cap] of CAPACIDADES) total += n0(desglose[clave]) * cap;
  return total;
}

/**
 * Veredicto de un lote que no aparece en el mapa.
 *
 * El orden importa. De los 73 ausentes reales, 53 lo están legítimamente:
 * 31 cerrados, 13 solo en tanque grande, 7 fermentando y 2 con tanque asociado.
 */
function ausencia(
  declarado: Desglose,
  vasijaGrande: number,
  etapa: string,
  tieneTanque: boolean,
): [string, string | null, string] {
  if (Object.values(declarado).some((v) => v)) {
    return ['sin_barriles', 'alta', 'declara envases y no tiene ni una unidad en el mapa'];
  }
  if (tieneTanque) return ['ausente_ok', null, 'tiene tanque asociado en el mapa'];
  if (vasijaGrande > 0) return ['ausente_ok', null, 'solo vasija grande, que el mapa no ve'];
  if (etapa === 'cerrado') return ['ausente_ok', null, 'lote cerrado'];
  if (ETAPAS_SIN_ENVASE_ESPERADO.includes(etapa)) return ['ausente_ok', null, 'todavia en fermentacion'];
  return ['sin_envase', 'media', `en etapa ${etapa} sin envase declarado ni presencia en el mapa`];
}

/**
 * 'alta', 'media' o 'baja' para una diferencia de litros de envases.
 *
 * OJO: los litros que entran acá son SOLO los de envases de 50 a 500 L, sin
 * vasija_grande.
 */
export function severidad(litrosDeclarados: number, litrosMapa: number): string {
  const delta = Math.abs(litrosMapa - litrosDeclarados);
  const base = Math.max(litrosDeclarados, litrosMapa);
  if (base <= 0) return 'baja';
  const fraccion = delta / base;
  if (delta > UMBRAL_ABS_ALTA || fraccion >= UMBRAL_REL_ALTA) return 'alta';
  if (delta > UMBRAL_ABS_MEDIA || fraccion >= UMBRAL_REL_MEDIA) return 'media';
  return 'baja';
}

const mismoDesglose = (a: Desglose, b: Desglose) =>
  CAPACIDADES.every(([clave]) => (a[clave] ?? 0) === (b[clave] ?? 0));

const sumaDesglose = (d: Desglose) => CAPACIDADES.reduce((s, [c]) => s + (d[c] ?? 0), 0);

export interface Veredicto {
  lote: string;
  veredicto: string;
  severidad: string | null;
  declarado: Desglose;
  mapa: Desglose;
  litros_declarados: number;
  litros_mapa: number;
  delta: number;
  fraccion: number;
  vasija_grande: number;
  etapa: string;
  aproximadas: number;
  mezcla_distinta: boolean;
  motivo: string;
  unidades: Unidad[];
  posiciones?: string[];
  conflictos?: string[];
}

/**
 * Clasifica un lote contra sus unidades del mapa.
 *
 * El orden de evaluación importa porque las categorías se solapan: primero la
 * ausencia, después la coincidencia, después solo_representacion, y solo al
 * final la severidad. Si solo_representacion se evaluara después, el 26126
 * caería en la máxima prioridad y mandaría a alguien a buscar 2250 L que están
 * en su sitio.
 */
export function veredictoDeLote(
  lote: Fila,
  unidades: Unidad[],
  tieneTanque = false,
  etapaSugerida = '',
): Veredicto {
  const declarado = desgloseDeclarado(lote);
  const vasijaGrande = n0(lote.vasija_grande);
  const etapa = String(lote.etapa ?? '');
  // La ausencia se juzga con la etapa confirmada y, si nadie la confirmó
  // todavía, con la sugerida: un lote recién ingresado tiene etapa '' y con
  // eso caía en "sin_envase" y mandaba a buscar barricas de un vino que está
  // fermentando en tanque. `etapa` sigue siendo la confirmada en la respuesta.
  const etapaJuicio = etapa.trim() || etapaSugerida;
  const litrosDecl = litrosDe(declarado);

  const { cont: mapa, aproximadas } = desgloseMapa(unidades);
  const litrosMapa = litrosDe(mapa);

  let veredicto: string;
  let sev: string | null;
  let motivo: string;

  if (!unidades.length) {
    [veredicto, sev, motivo] = ausencia(declarado, vasijaGrande, etapaJuicio, tieneTanque);
  } else if (mismoDesglose(declarado, mapa)) {
    [veredicto, sev, motivo] = ['coincide', null, ''];
  } else if (
    vasijaGrande > 0 &&
    Math.abs(litrosDecl + vasijaGrande - litrosMapa) <= UMBRAL_REPRESENTACION
  ) {
    [veredicto, sev, motivo] = [
      'solo_representacion',
      null,
      'el total cierra: es vasija grande sin desglosar',
    ];
  } else {
    veredicto = 'difiere';
    sev = severidad(litrosDecl, litrosMapa);
    motivo = '';
  }

  const base = Math.max(litrosDecl, litrosMapa);

  return {
    lote: normalizarLote(lote.lote),
    veredicto,
    severidad: sev,
    declarado,
    mapa,
    litros_declarados: litrosDecl,
    litros_mapa: litrosMapa,
    delta: litrosMapa - litrosDecl,
    fraccion: base ? Math.abs(litrosMapa - litrosDecl) / base : 0,
    vasija_grande: vasijaGrande,
    etapa,
    aproximadas,
    mezcla_distinta:
      Boolean(unidades.length) &&
      sumaDesglose(declarado) === sumaDesglose(mapa) &&
      !mismoDesglose(declarado, mapa),
    motivo,
    unidades: [...unidades],
  };
}

/** ¿El lote pertenece a las series prensa de la otra aplicación? */
export function esSeriePrensa(lote: unknown): boolean {
  return PREFIJOS_PRENSA.includes(String(lote).slice(0, 3));
}

function claveResumen(v: Veredicto): string {
  return v.veredicto === 'difiere' ? `difiere_${v.severidad}` : v.veredicto;
}

/**
 * Los lotes que se caminan, ordenados por severidad y litros en juego.
 *
 * Los de severidad baja quedan afuera: son ±1 envase sobre 14 a 18, ≤250 L y
 * <10 % del lote, consistente con demora de registro y no con vino faltante.
 */
function aVerificar(resultados: Veredicto[]): Veredicto[] {
  return resultados
    .filter(
      (r) => (r.veredicto === 'difiere' && r.severidad !== 'baja') || SE_CAMINA.includes(r.veredicto),
    )
    .sort((a, b) => {
      const sa = ORDEN_SEVERIDAD[a.severidad ?? ''] ?? 9;
      const sb = ORDEN_SEVERIDAD[b.severidad ?? ''] ?? 9;
      return sa !== sb ? sa - sb : Math.abs(b.delta) - Math.abs(a.delta);
    });
}

/**
 * {lote: [num, ...]} de las unidades contradictorias que lo tocan.
 *
 * Se indexa por los DOS lotes en pugna: el mapa le está atribuyendo la misma
 * barrica a uno y a otro, así que los dos merecen el aviso.
 */
function conflictosPorLote(conflictos: { num: string; lote_inventario: string; lote_tanques: string }[]) {
  const out = new Map<string, string[]>();
  for (const c of conflictos) {
    for (const clave of ['lote_inventario', 'lote_tanques'] as const) {
      const L = c[clave];
      if (!L) continue;
      const lista = out.get(L);
      if (lista) lista.push(c.num);
      else out.set(L, [c.num]);
    }
  }
  return out;
}

export interface InformeCruce {
  procedencia: unknown;
  lotes: Veredicto[];
  resumen: Record<string, number>;
  a_verificar: Veredicto[];
  huerfanos: { lote: string; unidades: number; litros: number }[];
  serie_prensa: { lotes: number; unidades: number; litros: number };
  conflictos: unknown[];
  salteados_por_prensa: string[];
}

/**
 * Informe completo del cruce entre los lotes y el mapa.
 *
 * `etapasSugeridas` ({lote: etapa}, ver etapasSugeridas() en etapas.ts) es
 * opcional: sin ella los lotes sin etapa confirmada se juzgan con etapa '',
 * como antes.
 */
export function cruzar(
  lotes: Fila[],
  mapa: MapaNormalizado,
  etapasSugeridas: Map<string, string> | null = null,
): InformeCruce {
  const unidadesPorLote = mapa.unidades_por_lote ?? new Map<string, Unidad[]>();
  const conTanque = mapa.lotes_con_tanque ?? new Set<string>();
  const posiciones = mapa.posiciones ?? new Map<string, string[]>();
  const conflictos = [...(mapa.conflictos ?? [])];
  const confPorLote = conflictosPorLote(conflictos);

  const resultados: Veredicto[] = [];
  const vistos = new Set<string>();
  const salteadosPorPrensa: string[] = [];

  for (const l of filasDe(lotes)) {
    const L = normalizarLote(l.lote);
    if (!L) continue;
    vistos.add(L);

    if (esSeriePrensa(L)) {
      // Se registran para que nunca desaparezca un lote sin dejar rastro: si la
      // numeración propia llega a 26700, lotes vivos empezarían a caer acá.
      salteadosPorPrensa.push(L);
      continue;
    }

    const v = veredictoDeLote(
      l,
      unidadesPorLote.get(L) ?? [],
      conTanque.has(L),
      etapasSugeridas?.get(L) ?? '',
    );
    v.posiciones = posiciones.get(L) ?? [];
    // El lote se compara igual, pero queda advertido: si una de sus unidades
    // está en pugna, su conteo es dudoso y el operario tiene que saberlo.
    v.conflictos = confPorLote.get(L) ?? [];
    resultados.push(v);
  }

  const huerfanos: { lote: string; unidades: number; litros: number }[] = [];
  const prensa = { lotes: 0, unidades: 0, litros: 0 };

  for (const L of [...unidadesPorLote.keys()].sort()) {
    const us = unidadesPorLote.get(L)!;
    const litros = us.reduce((s, u) => s + n0(u.litros), 0);
    if (esSeriePrensa(L)) {
      prensa.lotes += 1;
      prensa.unidades += us.length;
      prensa.litros += litros;
    } else if (!vistos.has(L)) {
      huerfanos.push({ lote: L, unidades: us.length, litros });
    }
  }

  const resumen: Record<string, number> = {};
  for (const v of resultados) {
    const clave = claveResumen(v);
    resumen[clave] = (resumen[clave] ?? 0) + 1;
  }

  return {
    procedencia: mapa.procedencia ?? {},
    lotes: resultados,
    resumen,
    a_verificar: aVerificar(resultados),
    huerfanos,
    serie_prensa: prensa,
    conflictos,
    salteados_por_prensa: [...salteadosPorPrensa].sort(),
  };
}
