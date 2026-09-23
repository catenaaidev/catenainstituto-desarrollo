/**
 * Barriles del Mapa por lote, para armar las OT de trasiego.
 *
 * Solo lectura: la OT nunca escribe en el Mapa (lo actualiza el escáner). El
 * motor es puro para poder probar la forma de los datos sin D1; la ruta se
 * prueba entera contra la D1 de test.
 */
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { barrilesDeLotes } from '../src/lotes/motores/barriles-lote';
import { rutasLotes } from '../src/lotes/rutas';

const INV = [
  { num: '2221713', estado: 'LLENO', cap: 225, litros: 225, anio: 2022, marca: 'TARANSAUD',
    origen: 'FRANCES', trat: 'REF.101 M', uso: '', lote: '26217', cosecha: 2026 },
  { num: '2221714', estado: 'LLENO', cap: '225', litros: 225, anio: '2021', marca: 'SEGUIN',
    origen: 'FRANCES', trat: 'M+', lote: ' 26217 ' },
  { num: '451', estado: 'VACIO', cap: 500, litros: 0, anio: '', marca: 'TANQUE INOX 500',
    origen: '-', trat: '-', lote: '' },
  { num: '9001', estado: 'LLENO', cap: 225, litros: 225, lote: '26300' },
];

describe('barrilesDeLotes', () => {
  it('agrupa por lote normalizado y trae los campos de la planilla', () => {
    const r = barrilesDeLotes({ inventario: INV }, ['26217']);
    expect(r['26217'].map((b) => b.num)).toEqual(['2221713', '2221714']);
    expect(r['26217'][0]).toEqual({
      num: '2221713', estado: 'LLENO', cap: 225, litros: 225,
      anio: '2022', marca: 'TARANSAUD', origen: 'FRANCES', trat: 'REF.101 M',
    });
    expect(r['26217'][1].cap).toBe(225); // '225' del Excel se vuelve número
  });

  it('un lote pedido sin barriles devuelve lista vacia, no falta la clave', () => {
    expect(barrilesDeLotes({ inventario: INV }, ['26999'])).toEqual({ '26999': [] });
  });

  it('no trae lotes que no se pidieron', () => {
    expect(Object.keys(barrilesDeLotes({ inventario: INV }, ['26217']))).toEqual(['26217']);
  });

  it('tolera un estado sin inventario', () => {
    expect(barrilesDeLotes({}, ['26217'])).toEqual({ '26217': [] });
  });
});

const EDITOR = 'editor-barriles@catenawines.com';

async function pedir(qs: string) {
  const req = new Request('https://catenainstitute.example/lotes/api/barriles' + qs, {
    headers: { 'Cf-Access-Authenticated-User-Email': EDITOR },
  });
  const ctx = createExecutionContext();
  const res = await rutasLotes(req, env, ctx, '/barriles');
  await waitOnExecutionContext(ctx);
  return res!;
}

describe('GET /barriles', () => {
  beforeAll(async () => {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre) VALUES (?, 'lotes', 'editor', 'Editor')`,
    ).bind(EDITOR).run();
  });

  it('503 si todavia no hay documento del Mapa', async () => {
    await env.DB.prepare(`DELETE FROM documento WHERE modulo = 'barriles'`).run();
    expect((await pedir('?lotes=26217')).status).toBe(503);
  });

  it('400 sin lotes', async () => {
    expect((await pedir('')).status).toBe(400);
  });

  it('devuelve version y barriles de los lotes pedidos', async () => {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO documento (modulo, json) VALUES ('barriles', ?)`,
    ).bind(JSON.stringify({ version: 2304, estado: { inventario: INV } })).run();
    const r = await pedir('?lotes=26217,%2026300');
    expect(r.status).toBe(200);
    const d = await r.json<{ version: number; por_lote: Record<string, { num: string }[]> }>();
    expect(d.version).toBe(2304);
    expect(d.por_lote['26217']).toHaveLength(2);
    expect(d.por_lote['26300'].map((b) => b.num)).toEqual(['9001']);
  });
});
