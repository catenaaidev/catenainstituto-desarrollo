/**
 * `?anios=` en las rutas que corren motores (dashboard, cruce, orden de
 * corrección). Sin el parámetro, idéntico a hoy; con él, recortado al año
 * pedido. El linaje (tienePadre, etapas) sigue viendo el documento entero: el
 * recorte es solo en qué lotes salen en la respuesta.
 */
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { rutasLotes, escribirDocumento } from '../src/lotes/rutas';

const EDITOR = 'editor@catenawines.com';

beforeAll(async () => {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre)
     VALUES (?, 'lotes', 'editor', 'Editor')`,
  ).bind(EDITOR).run();
  const actual = await env.DB.prepare("SELECT version FROM documento WHERE modulo='lotes'").first<{ version: number }>();
  const doc = {
    meta: { version: (actual?.version ?? 0) + 1 },
    lotes: [
      { lote: 25001, variedad: 'Malbec', litros_actuales: 225, cap225: 1 },
      { lote: 26001, variedad: 'Malbec', litros_actuales: 225, cap225: 1 },
    ],
    analisis: [
      { lote: '25001', fecha_analisis: '2026-09-01', so2_libre: 30, ph: 3.6 },
      { lote: '26001', fecha_analisis: '2026-09-01', so2_libre: 30, ph: 3.6 },
    ],
    movimientos: [],
  };
  await escribirDocumento(env, doc, EDITOR, actual?.version ?? 0);

  // Mapa de Barriles: un barril LLENO con el lote 25001, para los casos de
  // /cruce y /orden-correccion (misma forma que test/lotes-barriles-ruta.test.ts).
  await env.DB.prepare(
    `INSERT OR REPLACE INTO documento (modulo, json) VALUES ('barriles', ?)`,
  ).bind(JSON.stringify({
    version: 1,
    estado: {
      inventario: [
        { num: '1001', estado: 'LLENO', cap: 225, litros: 225, lote: '25001' },
      ],
    },
  })).run();
});

async function get(ruta: string) {
  const req = new Request('https://catenainstitute.example/lotes/api' + ruta, {
    headers: { 'Cf-Access-Authenticated-User-Email': EDITOR },
  });
  const ctx = createExecutionContext();
  const res = await rutasLotes(req, env, ctx, ruta.split('?')[0]);
  await waitOnExecutionContext(ctx);
  return res!;
}

const lotesDe = (j: { lotes?: { lote: unknown }[] }) => (j.lotes ?? []).map((l) => String(l.lote)).sort();

describe('GET /dashboard?anios=', () => {
  it('sin parámetro calcula con todos los años', async () => {
    const j = await (await get('/dashboard')).json<{ lotes: { lote: unknown }[] }>();
    expect(lotesDe(j)).toEqual(['25001', '26001']);
  });
  it('con anios=2026 solo trae los 26xxx', async () => {
    const j = await (await get('/dashboard?anios=2026')).json<{ lotes: { lote: unknown }[]; etapas: Record<string, unknown> }>();
    expect(lotesDe(j)).toEqual(['26001']);
    expect(Object.keys(j.etapas)).toEqual(['26001']);
  });
});

describe('GET /cruce?anios=', () => {
  it('sin parámetro el barril del 25001 aparece en lotes', async () => {
    const j = await (await get('/cruce')).json<{ lotes: { lote: unknown }[]; huerfanos: { lote: unknown }[] }>();
    expect(lotesDe(j)).toContain('25001');
  });
  it('con anios=2026 no quedan lotes ni huérfanos del 25001', async () => {
    const j = await (await get('/cruce?anios=2026')).json<{ lotes: { lote: unknown }[]; huerfanos: { lote: unknown }[] }>();
    expect(lotesDe(j).some((l) => l.startsWith('25'))).toBe(false);
    expect(j.huerfanos.some((h) => String(h.lote).startsWith('25'))).toBe(false);
  });
});

describe('GET /orden-correccion?anios=', () => {
  it('con anios=2026 ningún lote empieza con 25', async () => {
    const j = await (await get('/orden-correccion?anios=2026')).json<{ lotes: { lote: unknown }[] }>();
    expect(lotesDe(j).some((l) => l.startsWith('25'))).toBe(false);
  });
});
