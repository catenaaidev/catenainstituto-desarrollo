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

describe('guardado forzado: respalda también lo que pisa', () => {
  beforeEach(async () => {
    const l = await env.RESPALDOS.list({ prefix: 'lotes/' });
    for (const o of l.objects) await env.RESPALDOS.delete(o.key);
  });

  async function postear(cuerpo: unknown, forzar: boolean) {
    const req = new Request('https://catenainstitute.example/lotes/api/datos' + (forzar ? '?forzar=1' : ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cf-Access-Authenticated-User-Email': EDITOR },
      body: JSON.stringify(cuerpo),
    });
    const ctx = createExecutionContext();
    const res = await rutasLotes(req, env, ctx, '/datos');
    await waitOnExecutionContext(ctx);
    return res!;
  }

  it('deja un respaldo con el documento de la versión anterior', async () => {
    const antes = {
      meta: { version: 70 },
      lotes: [{ lote: '26001', variedad: 'Malbec' }, { lote: '26002', variedad: 'Syrah' }],
      analisis: [], movimientos: [],
    };
    await env.DB.prepare(
      `INSERT OR REPLACE INTO documento (modulo, version, json, autor, guardado)
       VALUES ('lotes', 70, ?, 'Oriana', '2026-10-05 10:00')`,
    ).bind(JSON.stringify(antes)).run();

    const r = await postear({ meta: { version: 70 }, lotes: [], analisis: [], movimientos: [] }, true);
    expect(r.status).toBe(200);

    const claves = await respaldos();
    const viejo = claves.find((k) => k.startsWith('lotes/datos-v00070-'));
    const nuevo = claves.find((k) => k.startsWith('lotes/datos-v00071-'));
    expect(viejo).toBeDefined();
    expect(nuevo).toBeDefined();
    const contenido = JSON.parse(await (await env.RESPALDOS.get(viejo!))!.text());
    expect(contenido.lotes.map((l: { lote: string }) => l.lote)).toEqual(['26001', '26002']);
  });
});
