/**
 * Guía de trabajos: las impresiones numeradas (tabla guia_impresas,
 * migración 0004). Cada fila es la foto de la hoja tal como salió en papel.
 */
import type { ResumenOrden } from './resumen';

export interface RenglonFoto { n: number; tipo: 'tarea' | 'nota' | 'orden'; texto: string }
export interface Foto { emitio: string; recibio: string; renglones: RenglonFoto[] }

const TIPOS = new Set(['tarea', 'nota', 'orden']);
const esTxt = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;

/** null = válida; si no, el motivo. */
export function problemaImpresa(numero: unknown, foto: unknown): string | null {
  if (typeof numero !== 'string' || !/^\d{4}$/.test(numero)) return 'N° inválido (4 dígitos).';
  if (!foto || typeof foto !== 'object') return 'Falta la hoja.';
  const f = foto as Record<string, unknown>;
  if (!esTxt(f.emitio, 120) || !esTxt(f.recibio, 120)) return 'Emitió/Recibió inválidos.';
  if (!Array.isArray(f.renglones) || f.renglones.length > 1000) return 'Renglones inválidos.';
  for (const r of f.renglones as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object' || !TIPOS.has(r.tipo as string) || !esTxt(r.texto, 500)
      || typeof r.n !== 'number' || !Number.isInteger(r.n) || r.n < 0) return 'Renglón inválido.';
  }
  return null;
}

export const normalizarFoto = (f: Foto): Foto => ({
  emitio: f.emitio, recibio: f.recibio,
  renglones: f.renglones.map((r) => ({ n: r.n, tipo: r.tipo, texto: r.texto })),
});

export async function guardarImpresa(env: Env, numero: string, foto: Foto, por: string): Promise<number> {
  const r = await env.DB.prepare('INSERT INTO guia_impresas (numero, fecha, por, json) VALUES (?, ?, ?, ?) RETURNING id')
    .bind(numero, new Date().toISOString(), por, JSON.stringify(normalizarFoto(foto))).first<{ id: number }>();
  return r!.id;
}

export async function leerImpresa(env: Env, id: number) {
  const f = await env.DB.prepare('SELECT id, numero, fecha, por, json FROM guia_impresas WHERE id = ?')
    .bind(id).first<{ id: number; numero: string; fecha: string; por: string | null; json: string }>();
  return f ? { id: f.id, numero: f.numero, fecha: f.fecha, por: f.por || '', foto: JSON.parse(f.json) as Foto } : null;
}

const esFaltaTabla = (e: unknown) => e instanceof Error && e.message.includes('no such table');

// fecha guarda un ISO en UTC, pero la hoja se imprime en hora local: el
// Historial tiene que listar el mismo día que vio quien imprimió, no el de
// slice(0,10) (que en la madrugada argentina cae un día adelantado).
const FORMATO_FECHA_AR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
const fechaLocalAR = (iso: string) => FORMATO_FECHA_AR.format(new Date(iso));

/** Para Historial. Sin la tabla (falta migrar) devuelve [] en vez de romper la lista. */
export async function resumenImpresas(env: Env): Promise<ResumenOrden[]> {
  try {
    const { results } = await env.DB.prepare('SELECT id, numero, fecha, por, json FROM guia_impresas')
      .all<{ id: number; numero: string; fecha: string; por: string | null; json: string }>();
    return (results ?? []).map((f) => {
      let emitio = '';
      try { emitio = String((JSON.parse(f.json) as Foto).emitio || ''); } catch { /* foto rota: sin firma */ }
      return {
        modulo: 'guia', id: String(f.id), fuente: 'guia_impresas', tipo: 'guia', numero: f.numero,
        fecha: fechaLocalAR(f.fecha), estado: 'ejecutada', lotes: [], lote_corte: '', emitio: emitio || f.por || '',
      } satisfies ResumenOrden;
    });
  } catch (e) {
    if (esFaltaTabla(e)) return [];
    throw e;
  }
}

/** Números de la serie principal usados por la guía. */
export async function numerosImpresas(env: Env): Promise<number[]> {
  try {
    const { results } = await env.DB.prepare('SELECT DISTINCT numero FROM guia_impresas').all<{ numero: string }>();
    return (results ?? []).map((f) => /^(\d{4})$/.exec(f.numero)).filter((m): m is RegExpExecArray => !!m)
      .map((m) => parseInt(m[1], 10));
  } catch (e) {
    if (esFaltaTabla(e)) return [];
    throw e;
  }
}
