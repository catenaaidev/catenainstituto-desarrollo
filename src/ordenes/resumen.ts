/**
 * Lo que la sección Órdenes de trabajo necesita de cada orden, sin bajar el
 * documento entero al navegador (el de Lotes pesa ~3,9 MB).
 *
 * Puro: recibe el documento ya parseado. Las reglas son espejo de las de la
 * pantalla de Lotes: una OT sin ningún movimiento vivo es huérfana y no se
 * muestra (ot-lista.js filtrarOrdenes), salvo las OT sin movimientos (Muestras),
 * y el estado de una OT de movimientos sigue a esEjecutado (sin estado o con uno
 * raro = ejecutada).
 */
import { esEjecutado } from '../lotes/motores/movimientos';

export type EstadoOrden = 'pendiente' | 'ejecutada' | 'anulada';

export interface ResumenOrden {
  modulo: 'prensas' | 'lotes' | 'guia';
  id: string;
  fuente: 'ordenes_trabajo' | 'ordenes_correccion' | 'ordenes_hojas' | 'guia_impresas';
  /** Id de plantilla de OT ('barricas-barricas', 'traslado'…) o 'correccion'. */
  tipo: string;
  numero: string;
  fecha: string;
  estado: EstadoOrden;
  lotes: string[];
  lote_corte: string;
  emitio: string;
}

export type Fila = Record<string, unknown>;
const filas = (v: unknown): Fila[] =>
  Array.isArray(v) ? v.filter((x): x is Fila => !!x && typeof x === 'object') : [];
const txt = (v: unknown) => (v == null ? '' : String(v).trim());
const lotesDe = (o: Fila) => filas(o.lotes).map((l) => txt(l.lote)).filter(Boolean);

/** Muestras (0993): sin movimientos; sus lotes son los de su tabla (ot.muestras). */
const sinMovimientos = (ot: Fila) => ot.sin_movimientos === true;
const lotesDeOT = (ot: Fila) => sinMovimientos(ot)
  ? [...new Set(filas(ot.muestras).map((f) => txt(f.lote)).filter(Boolean))]
  : lotesDe(ot);

function deTrabajo(datos: Fila): ResumenOrden[] {
  const vivos = new Set(filas(datos.movimientos).map((m) => m.id));
  return filas(datos.ordenes_trabajo)
    .filter((ot) => sinMovimientos(ot) || filas(ot.lotes).some((l) => vivos.has(l.mov_id)))
    .map((ot) => ({
      modulo: 'lotes' as const,
      id: txt(ot.id),
      fuente: 'ordenes_trabajo' as const,
      tipo: txt(ot.plantilla),
      numero: txt(ot.ot),
      fecha: txt(ot.fecha),
      estado: esEjecutado(ot) ? ('ejecutada' as const) : ('pendiente' as const),
      lotes: lotesDeOT(ot),
      lote_corte: txt((ot.lote_corte as Fila | undefined)?.lote),
      emitio: txt(ot.emitio),
    }));
}

function deCorreccion(datos: Fila): ResumenOrden[] {
  return filas(datos.ordenes_correccion).map((o) => {
    const e = txt(o.estado);
    return {
      modulo: 'lotes' as const,
      id: txt(o.id),
      fuente: 'ordenes_correccion' as const,
      tipo: 'correccion',
      numero: txt(o.numero),
      fecha: txt(o.fecha),
      estado: (e === 'pendiente' || e === 'anulada' ? e : 'ejecutada') as EstadoOrden,
      lotes: lotesDe(o),
      lote_corte: '',
      emitio: txt(o.emitio),
    };
  });
}

function deHojas(datos: Fila, modulo: 'prensas' | 'lotes'): ResumenOrden[] {
  return filas(datos.ordenes_hojas).map((o) => {
    const e = txt(o.estado);
    return {
      modulo, id: txt(o.id), fuente: 'ordenes_hojas' as const, tipo: txt(o.tipo),
      numero: txt(o.ot), fecha: txt(o.fecha),
      estado: (e === 'pendiente' || e === 'anulada' ? e : 'ejecutada') as EstadoOrden,
      lotes: lotesDe(o), lote_corte: '', emitio: txt(o.emitida_por),
    };
  });
}

export function resumenOrdenes(modulo: 'prensas' | 'lotes', datos: Fila): ResumenOrden[] {
  const todas = modulo === 'lotes'
    ? [...deTrabajo(datos), ...deCorreccion(datos), ...deHojas(datos, 'lotes')]
    : deHojas(datos, 'prensas');
  return todas
    .filter((o) => o.id)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero));
}

// -------------------------------------------------------- números de OT

const RE_SERIE = { principal: /^(\d{4})(\s|\.|$)/, B: /^B(\d{3,4})(\s|\.|$)/i } as const;
export type Serie = keyof typeof RE_SERIE;

/* Espejo de TIPOS_HOJA_PRENSAS de public/prensas/js/hojas-prensas.js (Task 4):
 * la Task 4 suma un test que compara los dos mapas. */
export const SERIE_PRENSAS: Record<string, Serie> = {
  'prensas-muestras': 'principal', 'prensas-rellenos': 'principal',
  'prensas-accion': 'B', 'prensas-agregados': 'B',
};

const numeroDe = (v: unknown, serie: Serie) => {
  const m = RE_SERIE[serie].exec(txt(v));
  return m ? parseInt(m[1], 10) : null;
};

/**
 * Los números de OT que ya usa un documento, de una serie (sin repetir, de
 * menor a mayor). Espejo de `numerosWeb` de `public/lotes/js/numero-ot.js`:
 * Lotes y Prensas comparten la serie de la carpeta de OneDrive y no se pueden
 * pisar el número.
 */
export function numerosDeDocumento(modulo: 'prensas' | 'lotes', datos: Fila, serie: Serie): number[] {
  const crudos: unknown[] = [];
  if (modulo === 'prensas') {
    for (const o of filas(datos.ordenes_hojas)) if (SERIE_PRENSAS[txt(o.tipo)] === serie) crudos.push(o.ot);
  } else if (serie === 'B') {
    for (const a of filas(datos.analisis)) {
      crudos.push((a.correccion as Fila | undefined)?.ot_n);
      for (const ag of filas(a.agregados)) crudos.push(ag.ot_n);
    }
    for (const o of filas(datos.ordenes_correccion)) crudos.push(o.numero);
    for (const o of filas(datos.ordenes_hojas)) if (txt(o.tipo) === 'agregados') crudos.push(o.ot);
  } else {
    for (const m of [...filas(datos.movimientos), ...filas(datos.ordenes_trabajo)]) crudos.push(m.ot);
    for (const o of filas(datos.ordenes_hojas)) if (txt(o.tipo) !== 'agregados') crudos.push(o.ot);
  }
  const ns = crudos.map((v) => numeroDe(v, serie)).filter((n): n is number => n != null);
  return [...new Set(ns)].sort((a, b) => a - b);
}
