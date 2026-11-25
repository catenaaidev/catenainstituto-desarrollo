import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import worker from '../src/index';

const BASE = 'https://catenainstitute.example';
const LECTOR = 'lector-imp@catenawines.com';
const EDITOR = 'editor-imp@catenawines.com';
const SOLO_BARRILES = 'barriles-imp@catenawines.com';

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

const FOTO = { emitio: 'Oriana', recibio: 'Enzo', renglones: [
  { n: 1, tipo: 'tarea', texto: 'Lavar barriles' },
  { n: 0, tipo: 'nota', texto: 'ojo' },
  { n: 2, tipo: 'orden', texto: 'Traslado · N° 0957 · 26329' },
] };

beforeAll(async () => {
  const p = (e: string, m: string, r: string) =>
    env.DB.prepare('INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre) VALUES (?, ?, ?, ?)').bind(e, m, r, 'X').run();
  await p(LECTOR, 'lotes', 'lector');
  await p(EDITOR, 'lotes', 'editor');
  await p(SOLO_BARRILES, 'barriles', 'admin');
  await env.DB.prepare('INSERT OR REPLACE INTO documento (modulo, version, json, autor, guardado) VALUES (?, ?, ?, ?, ?)')
    .bind('lotes', 1, JSON.stringify({ movimientos: [{ id: 'm1', ot: '0957' }],
      ordenes_trabajo: [{ id: 'ot-1', ot: '0957', plantilla: 'traslado', fecha: '2026-11-03', estado: 'pendiente', lotes: [{ lote: '26329', mov_id: 'm1' }] }] }),
      't', '2026-11-04').run();
});
beforeEach(async () => { await env.DB.prepare('DELETE FROM guia_impresas').run(); });

describe('POST /ordenes/api/guia/impresas', () => {
  it('sin rol o lector: 403', async () => {
    expect((await pedir('/ordenes/api/guia/impresas', SOLO_BARRILES, { numero: '0966', foto: FOTO })).status).toBe(403);
    expect((await pedir('/ordenes/api/guia/impresas', LECTOR, { numero: '0966', foto: FOTO })).status).toBe(403);
  });
  it('editor guarda y GET la devuelve', async () => {
    const r = await pedir('/ordenes/api/guia/impresas', EDITOR, { numero: '0966', foto: FOTO });
    expect(r.status).toBe(200);
    const { id } = await r.json() as { id: number };
    const g = await pedir('/ordenes/api/guia/impresas?id=' + id, LECTOR);
    expect(g.status).toBe(200);
    const j = await g.json() as any;
    expect(j.numero).toBe('0966');
    expect(j.por).toBe(EDITOR);
    expect(j.foto).toEqual(FOTO);
    expect(j.fecha).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it('rechaza número o foto inválidos', async () => {
    for (const body of [{ numero: '', foto: FOTO }, { numero: '0966' }, { numero: '0966', foto: { ...FOTO, renglones: 'x' } },
      { numero: '0966', foto: { ...FOTO, renglones: [{ n: 1, tipo: 'raro', texto: '' }] } }])
      expect((await pedir('/ordenes/api/guia/impresas', EDITOR, body)).status).toBe(400);
  });
  it('GET de un id que no existe: 404', async () => {
    expect((await pedir('/ordenes/api/guia/impresas?id=999', LECTOR)).status).toBe(404);
  });
});

describe('las impresas en lista y números', () => {
  it('/lista las trae como ejecutadas de la guía', async () => {
    await pedir('/ordenes/api/guia/impresas', EDITOR, { numero: '0966', foto: FOTO });
    const j = await (await pedir('/ordenes/api/lista', LECTOR)).json() as any;
    const g = j.ordenes.find((o: any) => o.modulo === 'guia');
    expect(g).toMatchObject({ fuente: 'guia_impresas', tipo: 'guia', numero: '0966', estado: 'ejecutada', emitio: 'Oriana', lotes: [] });
    expect(g.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('/numeros principal las cuenta', async () => {
    await pedir('/ordenes/api/guia/impresas', EDITOR, { numero: '0966', foto: FOTO });
    const j = await (await pedir('/ordenes/api/numeros?serie=principal', LECTOR)).json() as any;
    expect(j.numeros).toEqual([957, 966]);
    const b = await (await pedir('/ordenes/api/numeros?serie=B', LECTOR)).json() as any;
    expect(b.numeros).not.toContain(966);
  });
  it('la fecha listada es la local (America/Argentina/Buenos_Aires), no el slice UTC', async () => {
    // 2026-11-12T01:30 UTC = 2026-11-11 22:30 en Buenos Aires (UTC-3): el slice
    // crudo daría "2026-11-12", un día adelantado.
    await env.DB.prepare('INSERT INTO guia_impresas (numero, fecha, por, json) VALUES (?, ?, ?, ?)')
      .bind('0970', '2026-11-12T01:30:00.000Z', EDITOR, JSON.stringify(FOTO)).run();
    const j = await (await pedir('/ordenes/api/lista', LECTOR)).json() as any;
    const g = j.ordenes.find((o: any) => o.numero === '0970');
    expect(g.fecha).toBe('2026-11-11');
  });
});
