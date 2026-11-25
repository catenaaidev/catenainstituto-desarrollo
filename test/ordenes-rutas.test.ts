import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { rolOrdenes } from '../src/ordenes/rutas';

const BASE = 'https://catenainstitute.example';
const SOLO_LOTES = 'solo-lotes@catenawines.com';
const SOLO_BARRILES = 'solo-barriles@catenawines.com';
const AMBOS = 'ambos@catenawines.com';
const SOLO_PRENSAS = 'solo-prensas@catenawines.com';

async function pedir(ruta: string, email?: string) {
  const headers: Record<string, string> = {};
  if (email) headers['Cf-Access-Authenticated-User-Email'] = email;
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(BASE + ruta, { headers, redirect: 'manual' }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const DOC_LOTES = {
  meta: { version: 3 },
  movimientos: [{ id: 'm1' }],
  ordenes_trabajo: [{ id: 'ot-1', ot: '0945', plantilla: 'traslado', fecha: '2026-11-03', estado: 'pendiente',
    lotes: [{ lote: '26217', mov_id: 'm1' }] }],
  ordenes_correccion: [{ id: 'oc-1', numero: 'B240', fecha: '2026-11-02', estado: 'pendiente', lotes: [{ lote: '26100' }] }],
};

async function guardarDoc(modulo: string, version: number, datos: unknown) {
  await env.DB.prepare('INSERT OR REPLACE INTO documento (modulo, version, json, autor, guardado) VALUES (?, ?, ?, ?, ?)')
    .bind(modulo, version, JSON.stringify(datos), 'test', '2026-11-04').run();
}

beforeAll(async () => {
  const p = (e: string, m: string, r: string) =>
    env.DB.prepare('INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre) VALUES (?, ?, ?, ?)').bind(e, m, r, 'X').run();
  await p(SOLO_LOTES, 'lotes', 'lector');
  await p(SOLO_BARRILES, 'barriles', 'editor');
  await p(AMBOS, 'lotes', 'editor');
  await p(AMBOS, 'prensas', 'admin');
  await p(SOLO_PRENSAS, 'prensas', 'editor');
  await guardarDoc('lotes', 3, DOC_LOTES);
});

describe('rolOrdenes', () => {
  it('toma el mayor rol entre prensas y lotes, e ignora barriles', () => {
    expect(rolOrdenes({ lotes: 'lector', prensas: 'editor' })).toBe('editor');
    expect(rolOrdenes({ lotes: 'admin' })).toBe('admin');
    expect(rolOrdenes({ prensas: 'lector' })).toBe('lector');
    expect(rolOrdenes({ barriles: 'admin' })).toBeNull();
    expect(rolOrdenes({})).toBeNull();
  });
});

describe('GET /ordenes/api/lista', () => {
  it('sin sesión: 401', async () => {
    expect((await pedir('/ordenes/api/lista')).status).toBe(401);
  });
  it('sin rol en prensas ni lotes: 403', async () => {
    expect((await pedir('/ordenes/api/lista', SOLO_BARRILES)).status).toBe(403);
  });
  it('con rol en lotes: trae las órdenes de Lotes y dice sus roles', async () => {
    const r = await pedir('/ordenes/api/lista', SOLO_LOTES);
    expect(r.status).toBe(200);
    const j = await r.json() as { modulos: Record<string, string>; ordenes: { id: string }[] };
    expect(j.modulos).toEqual({ lotes: 'lector' });
    expect(j.ordenes.map((o) => o.id)).toEqual(['ot-1', 'oc-1']);
  });
  it('con rol en los dos: modulos tiene los dos (Prensas sin documento no rompe)', async () => {
    const j = await (await pedir('/ordenes/api/lista', AMBOS)).json() as { modulos: Record<string, string> };
    expect(j.modulos).toEqual({ lotes: 'editor', prensas: 'admin' });
  });
  it('solo rol en prensas: ve las filas de ordenes_hojas del documento de Prensas', async () => {
    await guardarDoc('prensas', 1, { ordenes_hojas: [
      { id: 'oh-1', tipo: 'prensas-muestras', ot: '0951', fecha: '2026-11-04', estado: 'pendiente', emitida_por: 'Ana', lotes: [] },
    ] });
    try {
      const r = await pedir('/ordenes/api/lista', SOLO_PRENSAS);
      expect(r.status).toBe(200);
      const j = await r.json() as { modulos: Record<string, string>; ordenes: { id: string; modulo: string }[] };
      expect(j.modulos).toEqual({ prensas: 'editor' });
      expect(j.ordenes.map((o) => [o.id, o.modulo])).toEqual([['oh-1', 'prensas']]);
      const j2 = await (await pedir('/ordenes/api/lista', AMBOS)).json() as { modulos: Record<string, string> };
      expect(j2.modulos).toEqual({ lotes: 'editor', prensas: 'admin' });
    } finally {
      await env.DB.prepare("DELETE FROM documento WHERE modulo = 'prensas'").run();
    }
  });
  it('otra ruta bajo /ordenes/api: 404', async () => {
    expect((await pedir('/ordenes/api/nada', AMBOS)).status).toBe(404);
  });
});

describe('GET /ordenes/api/numeros', () => {
  it('sin sesión: 401', async () => {
    expect((await pedir('/ordenes/api/numeros?serie=principal')).status).toBe(401);
  });
  it('serie inválida: 400', async () => {
    expect((await pedir('/ordenes/api/numeros?serie=X', AMBOS)).status).toBe(400);
  });
  it('sin rol en prensas ni lotes: 403', async () => {
    expect((await pedir('/ordenes/api/numeros?serie=principal', SOLO_BARRILES)).status).toBe(403);
  });
  it('trae los números de Lotes y de Prensas aunque el usuario solo tenga rol en Lotes', async () => {
    await guardarDoc('lotes', 3, { ...DOC_LOTES, movimientos: [{ id: 'm', ot: '0940' }], ordenes_trabajo: [] });
    await guardarDoc('prensas', 1, { ordenes_hojas: [{ id: 'a', tipo: 'prensas-muestras', ot: '0951' }] });
    try {
      const r = await pedir('/ordenes/api/numeros?serie=principal', SOLO_LOTES);
      expect(r.status).toBe(200);
      const j = await r.json() as { numeros: number[] };
      expect(j.numeros).toEqual([940, 951]);
    } finally {
      await guardarDoc('lotes', 3, DOC_LOTES);
      await env.DB.prepare("DELETE FROM documento WHERE modulo = 'prensas'").run();
    }
  });
});

describe('pantalla /ordenes/', () => {
  it('sin sesión: al login', async () => {
    const r = await pedir('/ordenes/');
    expect(r.status).toBe(302);
    expect(r.headers.get('Location')).toContain('/login.html');
  });
  it('sin rol en prensas ni lotes: al portal', async () => {
    const r = await pedir('/ordenes/', SOLO_BARRILES);
    expect(r.status).toBe(302);
    expect(new URL(r.headers.get('Location')!).pathname).toBe('/');
  });
});
