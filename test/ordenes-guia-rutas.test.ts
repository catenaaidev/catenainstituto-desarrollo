import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import worker from '../src/index';

const BASE = 'https://catenainstitute.example';
const LECTOR = 'lector-guia@catenawines.com';
const EDITOR = 'editor-guia@catenawines.com';
const SOLO_BARRILES = 'barriles-guia@catenawines.com';

async function pedir(ruta: string, email?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (email) headers['Cf-Access-Authenticated-User-Email'] = email;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(BASE + ruta, {
    method: body === undefined ? 'GET' : 'POST', headers, redirect: 'manual',
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const GUIA = { emitio: 'Oriana', recibio: 'Enzo', renglones: [{ id: 'r1', tipo: 'tarea', texto: 'Lavar barriles' }], hechas: [] };

beforeAll(async () => {
  const p = (e: string, m: string, r: string) =>
    env.DB.prepare('INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre) VALUES (?, ?, ?, ?)').bind(e, m, r, 'X').run();
  await p(LECTOR, 'lotes', 'lector');
  await p(EDITOR, 'prensas', 'editor');
  await p(SOLO_BARRILES, 'barriles', 'admin');
  await env.DB.prepare('INSERT OR REPLACE INTO documento (modulo, version, json, autor, guardado) VALUES (?, ?, ?, ?, ?)')
    .bind('lotes', 1, JSON.stringify({
      movimientos: [{ id: 'm1' }],
      ordenes_trabajo: [{ id: 'ot-1', ot: '0957', plantilla: 'traslado', fecha: '2026-11-03', estado: 'pendiente', lotes: [{ lote: '26329', mov_id: 'm1' }] }],
      ordenes_correccion: [{ id: 'oc-1', numero: 'B240', fecha: '2026-11-02', estado: 'ejecutada', lotes: [] }],
    }), 't', '2026-11-04').run();
});
beforeEach(async () => { await env.DB.prepare('DELETE FROM guia_trabajos').run(); });

describe('GET /ordenes/api/guia', () => {
  it('sin sesión: 401', async () => {
    expect((await pedir('/ordenes/api/guia')).status).toBe(401);
  });
  it('sin rol en prensas ni lotes: 403', async () => {
    expect((await pedir('/ordenes/api/guia', SOLO_BARRILES)).status).toBe(403);
  });
  it('sin guía guardada: guía vacía, versión 0, y solo las órdenes PENDIENTES', async () => {
    const r = await pedir('/ordenes/api/guia', LECTOR);
    expect(r.status).toBe(200);
    const j = await r.json() as any;
    expect(j.version).toBe(0);
    expect(j.guia).toEqual({ emitio: '', recibio: '', renglones: [], hechas: [] });
    expect(j.ordenes.map((o: any) => o.id)).toEqual(['ot-1']);
    expect(j.puedeEditar).toBe(false);
  });
  it('editor en prensas: puedeEditar', async () => {
    const j = await (await pedir('/ordenes/api/guia', EDITOR)).json() as any;
    expect(j.puedeEditar).toBe(true);
  });
});

describe('POST /ordenes/api/guia', () => {
  it('lector: 403 y no guarda', async () => {
    expect((await pedir('/ordenes/api/guia', LECTOR, { version: 0, guia: GUIA })).status).toBe(403);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM guia_trabajos').first<{ n: number }>();
    expect(n!.n).toBe(0);
  });
  it('primera escritura con versión 0 → versión 1, y el GET la devuelve', async () => {
    const r = await pedir('/ordenes/api/guia', EDITOR, { version: 0, guia: GUIA });
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).version).toBe(1);
    const j = await (await pedir('/ordenes/api/guia', LECTOR)).json() as any;
    expect(j.version).toBe(1);
    expect(j.guia).toEqual(GUIA);
  });
  it('versión vieja: 409 con la guía actual', async () => {
    await pedir('/ordenes/api/guia', EDITOR, { version: 0, guia: GUIA });
    const r = await pedir('/ordenes/api/guia', EDITOR, { version: 0, guia: { ...GUIA, emitio: 'Otro' } });
    expect(r.status).toBe(409);
    const j = await r.json() as any;
    expect(j.version).toBe(1);
    expect(j.guia.emitio).toBe('Oriana');
  });
  it('versión al día: guarda y sube', async () => {
    await pedir('/ordenes/api/guia', EDITOR, { version: 0, guia: GUIA });
    const r = await pedir('/ordenes/api/guia', EDITOR, { version: 1, guia: { ...GUIA, emitio: 'Ana' } });
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).version).toBe(2);
  });
  it('forma inválida: 400', async () => {
    for (const guia of [null, { renglones: 'x' }, { ...GUIA, renglones: [{ id: 'a', tipo: 'raro' }] },
      { ...GUIA, renglones: [{ id: 'a', tipo: 'tarea', texto: 'x'.repeat(501) }] }]) {
      expect((await pedir('/ordenes/api/guia', EDITOR, { version: 0, guia })).status).toBe(400);
    }
  });
  it('(hallazgo 1b) versión vieja: el 409 también trae `ordenes` y `modulos` frescos', async () => {
    await pedir('/ordenes/api/guia', EDITOR, { version: 0, guia: GUIA });
    const r = await pedir('/ordenes/api/guia', EDITOR, { version: 0, guia: { ...GUIA, emitio: 'Otro' } });
    expect(r.status).toBe(409);
    const j = (await r.json()) as any;
    // EDITOR solo tiene rol en prensas (sin documento en el beforeAll): el
    // punto es que los campos viajen, no cuáles órdenes trae en este caso.
    expect(Array.isArray(j.ordenes)).toBe(true);
    expect(j.modulos).toEqual({ prensas: 'editor' });
  });
  it('(hallazgo 6) un campo desconocido no se guarda tal cual', async () => {
    const conExtra = { ...GUIA, truchoTopLevel: 'x',
      renglones: [{ id: 'r1', tipo: 'tarea', texto: 'Lavar barriles', truchoRenglon: 'y' }],
      hechas: [{ id: 'h1', tipo: 'tarea', texto: 'Mechado', hecha: '2026-11-04T10:00:00Z', por: 'ana@x', lugar: 0, truchoHecha: 'z' }] };
    await pedir('/ordenes/api/guia', EDITOR, { version: 0, guia: conExtra });
    const j = (await (await pedir('/ordenes/api/guia', LECTOR)).json()) as any;
    expect(j.guia).not.toHaveProperty('truchoTopLevel');
    expect(j.guia.renglones[0]).not.toHaveProperty('truchoRenglon');
    expect(j.guia.hechas[0]).not.toHaveProperty('truchoHecha');
    expect(j.guia.hechas[0]).toEqual({ id: 'h1', tipo: 'tarea', texto: 'Mechado', hecha: '2026-11-04T10:00:00Z', por: 'ana@x', lugar: 0 });
  });
  it('(hallazgo 7) sin la tabla de la guía todavía: 503, no 500', async () => {
    await env.DB.exec('DROP TABLE guia_trabajos');
    try {
      const rGet = await pedir('/ordenes/api/guia', LECTOR);
      expect(rGet.status).toBe(503);
      expect(((await rGet.json()) as any).error).toBe('base_sin_inicializar');
      const rPost = await pedir('/ordenes/api/guia', EDITOR, { version: 0, guia: GUIA });
      expect(rPost.status).toBe(503);
    } finally {
      await env.DB.exec('CREATE TABLE IF NOT EXISTS guia_trabajos (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL DEFAULT 0, json TEXT NOT NULL, autor TEXT, guardado TEXT)');
    }
  });
});
