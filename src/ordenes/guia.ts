/**
 * Guía de trabajos: una sola fila en `guia_trabajos`. Acá vive la forma del
 * JSON y su validación; las rutas están en rutas.ts.
 */
export interface Renglon { id: string; tipo: 'tarea' | 'nota' | 'orden'; texto?: string; ref?: string; oculta?: boolean }
export interface Hecha { id: string; tipo: string; texto: string; hecha: string; por: string; lugar: number }
export interface Guia { emitio: string; recibio: string; renglones: Renglon[]; hechas: Hecha[] }

export const guiaVacia = (): Guia => ({ emitio: '', recibio: '', renglones: [], hechas: [] });

// 300 se quedaba corto: las órdenes pendientes entran solas (unirGuia) y se
// suman a mano a lo escrito, así que el techo real es más alto que lo que
// alguien tipea.
const MAX_RENGLONES = 1000, MAX_HECHAS = 500, MAX_TEXTO = 500, MAX_FIRMA = 120;
const TIPOS = new Set(['tarea', 'nota', 'orden']);
const esTxt = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
const esLugar = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** null = válida; si no, el motivo (va en `detalles` del 400). */
export function problemaGuia(g: unknown): string | null {
  if (!g || typeof g !== 'object') return 'La guía no es un objeto.';
  const x = g as Record<string, unknown>;
  if (!esTxt(x.emitio, MAX_FIRMA) || !esTxt(x.recibio, MAX_FIRMA)) return 'Emitió/Recibió inválidos.';
  if (!Array.isArray(x.renglones) || x.renglones.length > MAX_RENGLONES) return 'Renglones inválidos.';
  if (!Array.isArray(x.hechas) || x.hechas.length > MAX_HECHAS) return 'Hechas inválidas.';
  const ids = new Set<string>();
  for (const r of x.renglones as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object' || !esTxt(r.id, 80) || !r.id || ids.has(r.id as string)) return 'Renglón sin id o repetido.';
    ids.add(r.id as string);
    if (!TIPOS.has(r.tipo as string)) return 'Tipo de renglón inválido.';
    if (r.tipo === 'orden' ? !esTxt(r.ref, 200) : !esTxt(r.texto ?? '', MAX_TEXTO)) return 'Texto o referencia inválidos.';
  }
  for (const h of x.hechas as Record<string, unknown>[]) {
    if (!h || typeof h !== 'object' || !esTxt(h.id, 80) || !esTxt(h.texto ?? '', MAX_TEXTO) || !esTxt(h.hecha, 40)) return 'Hecha inválida.';
    if (!TIPOS.has(h.tipo as string)) return 'Tipo de hecha inválido.';
    if (!esLugar(h.lugar)) return 'Lugar de hecha inválido.';
  }
  return null;
}

/** Se guarda solo lo conocido: si algún día se cuela un campo de más (un bug
 * de cliente, un campo viejo que ya no se usa), no queda pegado para siempre
 * en la fila de D1. Se llama DESPUÉS de problemaGuia, que ya garantizó la
 * forma de cada campo. */
export function normalizarGuia(g: Guia): Guia {
  return {
    emitio: g.emitio, recibio: g.recibio,
    renglones: g.renglones.map((r) => {
      const base: Renglon = { id: r.id, tipo: r.tipo };
      if (r.tipo === 'orden') base.ref = r.ref;
      else base.texto = r.texto ?? '';
      if (r.oculta) base.oculta = true;
      return base;
    }),
    hechas: g.hechas.map((h) => ({
      id: h.id, tipo: h.tipo, texto: h.texto, hecha: h.hecha,
      por: String(h.por ?? ''), lugar: Number(h.lugar) || 0,
    })),
  };
}

export async function leerGuia(env: Env): Promise<{ version: number; guia: Guia }> {
  const f = await env.DB.prepare('SELECT version, json FROM guia_trabajos WHERE id = 1').first<{ version: number; json: string }>();
  return f ? { version: f.version, guia: JSON.parse(f.json) } : { version: 0, guia: guiaVacia() };
}

/** true = guardó; false = la versión no coincidía (otro guardó antes). */
export async function escribirGuia(env: Env, version: number, guia: Guia, autor: string): Promise<boolean> {
  const json = JSON.stringify(guia), ahora = new Date().toISOString();
  const r = version === 0
    ? await env.DB.prepare('INSERT INTO guia_trabajos (id, version, json, autor, guardado) VALUES (1, 1, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
      .bind(json, autor, ahora).run()
    : await env.DB.prepare('UPDATE guia_trabajos SET version = version + 1, json = ?, autor = ?, guardado = ? WHERE id = 1 AND version = ?')
      .bind(json, autor, ahora, version).run();
  return (r.meta?.changes ?? 0) > 0;
}
