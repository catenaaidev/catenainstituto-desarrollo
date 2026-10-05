/**
 * Lotes con autoguardado: la consulta liviana de version (para ver en vivo lo
 * que guardan los demas) y los respaldos a R2 como maximo cada 5 minutos
 * (spec 2026-10-05, secciones 3 y 4).
 */
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { rutasLotes, snapshotLotes, RESPALDO_CADA_MS } from '../src/lotes/rutas';

const EDITOR = 'editor@catenawines.com';

beforeAll(async () => {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre)
     VALUES (?, 'lotes', 'editor', 'Editor')`,
  ).bind(EDITOR).run();
});

async function pedir(ruta: string) {
  const req = new Request('https://catenainstitute.example/lotes/api' + ruta, {
    headers: { 'Cf-Access-Authenticated-User-Email': EDITOR },
  });
  const ctx = createExecutionContext();
  const res = await rutasLotes(req, env, ctx, ruta);
  await waitOnExecutionContext(ctx);
  return res!;
}

async function respaldos() {
  const l = await env.RESPALDOS.list({ prefix: 'lotes/datos-' });
  return l.objects.map((o) => o.key);
}

describe('GET /version', () => {
  it('devuelve version, autor y fecha del documento', async () => {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO documento (modulo, version, json, autor, guardado)
       VALUES ('lotes', 41, '{"meta":{"version":41}}', 'Oriana', '2026-10-05 10:00')`,
    ).run();
    const r = await pedir('/version');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ version: 41, autor: 'Oriana', guardado: '2026-10-05 10:00' });
  });
  it('sin documento: version 0', async () => {
    await env.DB.prepare(`DELETE FROM documento WHERE modulo = 'lotes'`).run();
    expect(await (await pedir('/version')).json()).toEqual({ version: 0, autor: '', guardado: '' });
  });
});

describe('snapshotLotes cada 5 minutos', () => {
  beforeEach(async () => {
    const l = await env.RESPALDOS.list({ prefix: 'lotes/' });
    for (const o of l.objects) await env.RESPALDOS.delete(o.key);
  });
  const d = { meta: { version: 1 }, lotes: [] };
  const t0 = Date.UTC(2026, 9, 5, 12, 0, 0);

  it('el primero siempre sube', async () => {
    expect(await snapshotLotes(env, d, 1, false, t0)).toBe(true);
    expect(await respaldos()).toHaveLength(1);
  });
  it('antes de 5 minutos no sube otro', async () => {
    await snapshotLotes(env, d, 1, false, t0);
    expect(await snapshotLotes(env, d, 2, false, t0 + RESPALDO_CADA_MS - 1)).toBe(false);
    expect(await respaldos()).toHaveLength(1);
  });
  it('a los 5 minutos sube', async () => {
    await snapshotLotes(env, d, 1, false, t0);
    expect(await snapshotLotes(env, d, 2, false, t0 + RESPALDO_CADA_MS)).toBe(true);
    expect(await respaldos()).toHaveLength(2);
  });
  it('un guardado forzado sube siempre', async () => {
    await snapshotLotes(env, d, 1, false, t0);
    expect(await snapshotLotes(env, d, 2, true, t0 + 1000)).toBe(true);
    expect(await respaldos()).toHaveLength(2);
  });
  it('la marca no se confunde con un respaldo', async () => {
    await snapshotLotes(env, d, 1, false, t0);
    const todo = (await env.RESPALDOS.list({ prefix: 'lotes/' })).objects.map((o) => o.key);
    expect(todo).toContain('lotes/_ultimo-respaldo');
    expect(await respaldos()).toHaveLength(1);
  });
});
