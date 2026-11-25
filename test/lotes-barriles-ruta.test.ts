/**
 * Barriles del Mapa por lote, para armar las OT de trasiego.
 *
 * Solo lectura: la OT nunca escribe en el Mapa (lo actualiza el escáner). El
 * motor es puro para poder probar la forma de los datos sin D1; la ruta se
 * prueba entera contra la D1 de test.
 */
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { barrilesDeLotes, barrilesPorNum, escaneosDeOT, claveOT } from '../src/lotes/motores/barriles-lote';
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
      lote: '26217', fecha: '', ts: null,
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

describe('barrilesPorNum', () => {
  it('trae cada numero pedido con su lote, o null si no existe', () => {
    const inv = [...INV, { num: '777', estado: 'LLENO', cap: 225, litros: 225, lote: '26730 ROJO', fecha: '2026-10-03' }];
    const r = barrilesPorNum({ inventario: inv }, ['777', ' 9001 ', 'nada']);
    expect(r['777']).toMatchObject({ lote: '26730 ROJO', fecha: '2026-10-03', estado: 'LLENO' });
    expect(r['9001']).toMatchObject({ lote: '26300' });
    expect(r['nada']).toBeNull();
  });

  it('trae el ts del Mapa (la merma lo usa para no cerrarse con su propio escaneo)', () => {
    const inv = [...INV, { num: '778', estado: 'LLENO', cap: 225, litros: 225, lote: '26217', fecha: '2026-10-01', ts: 1788912988373 }];
    expect(barrilesPorNum({ inventario: inv }, ['778'])['778']!.ts).toBe(1788912988373);
  });
});

/* Escaneos del Mapa por numero de OT (2026-11-10). El escaner guarda cada
 * vaciado y llenado con la OT, el lote y los codigos de barril: es la fuente
 * para saber que se movio de verdad. En la OT 0957 el Mapa vacio 6 de las 17
 * barricas que decia la OT para el lote 26236, y ninguna de 26235. */
const ESC = [
  { id: 'e1', fecha: '2026-10-27', ot: '957', lote: '26236', tipo: 'vaciado', codigos: ['2221713', '2221714', '9001'] },
  { id: 'e2', fecha: '2026-10-28', ot: 'OT-957', lote: '26305', tipo: 'llenado', codigos: ['451'] },
  { id: 'e3', fecha: '2026-10-28', ot: '0958', lote: '26236', tipo: 'vaciado', codigos: ['2221713'] },
  { id: 'e4', fecha: '2026-10-29', ot: '957', lote: '', tipo: 'vaciado', codigos: ['desconocido'] },
];

describe('claveOT', () => {
  it('iguala 0957, 957, OT-957 y OT 957', () => {
    for (const v of ['0957', '957', 'OT-957', 'OT 957', 'ot:957', ' 0957 ']) expect(claveOT(v)).toBe('957');
    expect(claveOT('OT-2026-019')).toBe('2026-019');
    expect(claveOT('B219')).toBe('b219');
    expect(claveOT('')).toBe('');
  });
});

describe('escaneosDeOT', () => {
  it('trae los escaneos de esa OT, en orden de fecha, con la capacidad de cada barril', () => {
    const r = escaneosDeOT({ inventario: INV, escaneos: ESC }, '0957');
    expect(r.map((e) => e.id)).toEqual(['e1', 'e2', 'e4']);
    expect(r[0]).toMatchObject({ id: 'e1', fecha: '2026-10-27', tipo: 'vaciado', lote: '26236' });
    expect(r[0].barriles).toEqual([
      { num: '2221713', cap: 225 }, { num: '2221714', cap: 225 }, { num: '9001', cap: 225 },
    ]);
    expect(r[1].barriles).toEqual([{ num: '451', cap: 500 }]);
    // Un codigo que no esta en el inventario vuelve sin capacidad.
    expect(r[2].barriles).toEqual([{ num: 'desconocido', cap: null }]);
  });

  it('sin escaneos de esa OT devuelve lista vacia; tolera un estado sin escaneos', () => {
    expect(escaneosDeOT({ inventario: INV, escaneos: ESC }, '0999')).toEqual([]);
    expect(escaneosDeOT({ inventario: INV }, '0957')).toEqual([]);
    expect(escaneosDeOT({ inventario: INV, escaneos: ESC }, '')).toEqual([]);
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

  it('400 sin lotes ni nums', async () => {
    expect((await pedir('')).status).toBe(400);
  });

  it('ot devuelve los escaneos de esa OT', async () => {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO documento (modulo, json) VALUES ('barriles', ?)`,
    ).bind(JSON.stringify({ version: 2305, estado: { inventario: INV, escaneos: ESC } })).run();
    const r = await pedir('?ot=0957');
    expect(r.status).toBe(200);
    const j = (await r.json()) as { version: number; escaneos_ot: { id: string }[] };
    expect(j.version).toBe(2305);
    expect(j.escaneos_ot.map((e) => e.id)).toEqual(['e1', 'e2', 'e4']);
  });

  it('nums devuelve por_num', async () => {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO documento (modulo, json) VALUES ('barriles', ?)`,
    ).bind(JSON.stringify({ version: 2304, estado: { inventario: INV } })).run();
    const r = await pedir('?nums=2221713,nada');
    expect(r.status).toBe(200);
    const j = (await r.json()) as { version: number; por_num: Record<string, unknown> };
    expect(j.version).toBe(2304);
    expect(j.por_num['2221713']).toMatchObject({ lote: '26217' });
    expect(j.por_num['nada']).toBeNull();
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
