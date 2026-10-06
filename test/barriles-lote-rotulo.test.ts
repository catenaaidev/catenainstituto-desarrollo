/**
 * GET /lote-rotulo?lote=26124 — el título y si es orgánico, para los rótulos.
 *
 * La pantalla de Rótulos de Barriles necesita dos datos de Lotes: el título del
 * lote (id_texto, "MB Adrianna Ct. 6 River RS3") y si es orgánico (etiqueta verde)
 * o convencional (blanca). El operario de Barriles no necesariamente tiene permiso
 * en Lotes, y el documento de Lotes pesa ~4 MB: por eso esta ruta devuelve solo
 * esos dos datos de un lote, con el permiso de Barriles.
 */

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { rutasBarriles } from '../src/barriles/rutas';

const BODEGA = 'rotulos@catenawines.com';
const AJENO = 'ajeno-rotulos@catenawines.com';

beforeAll(async () => {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre) VALUES (?, 'barriles', 'editor', 'Bodega')`,
  ).bind(BODEGA).run();
  const lotes = {
    version: 7,
    lotes: [
      { lote: 26124, id_texto: 'MB Adrianna Ct. 6 River RS3', organico_convencional: 'Convencional' },
      { lote: '26200', id_texto: 'Malbec Orgánico Altamira', organico_convencional: ' orgánico ' },
      { lote: '26300', id_texto: 'Sin dato de manejo' },
    ],
  };
  await env.DB.prepare(
    `INSERT OR REPLACE INTO documento (modulo, version, json, autor, guardado)
     VALUES ('lotes', 7, ?, 'test', datetime('now'))`,
  ).bind(JSON.stringify(lotes)).run();
});

async function pedir(email: string, lote: string | null) {
  const q = lote === null ? '' : '?lote=' + encodeURIComponent(lote);
  const req = new Request('https://catenainstitute.example/barriles/api/lote-rotulo' + q, {
    headers: { 'Cf-Access-Authenticated-User-Email': email },
  });
  const ctx = createExecutionContext();
  const res = await rutasBarriles(req, env, ctx, '/lote-rotulo');
  await waitOnExecutionContext(ctx);
  return res!;
}

describe('GET /lote-rotulo', () => {
  it('devuelve el título y que es convencional (el lote guardado como número)', async () => {
    const res = await pedir(BODEGA, '26124');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ lote: '26124', titulo: 'MB Adrianna Ct. 6 River RS3', organico: false });
  });

  it('reconoce orgánico con tilde, espacios y mayúsculas', async () => {
    const res = await pedir(BODEGA, ' 26200 ');
    await expect(res.json()).resolves.toEqual({ lote: '26200', titulo: 'Malbec Orgánico Altamira', organico: true });
  });

  it('sin el campo de manejo, es convencional', async () => {
    const res = await pedir(BODEGA, '26300');
    await expect(res.json()).resolves.toMatchObject({ organico: false });
  });

  it('un lote que no está en Lotes es 404', async () => {
    expect((await pedir(BODEGA, '99999')).status).toBe(404);
  });

  it('sin lote es 400', async () => {
    expect((await pedir(BODEGA, null)).status).toBe(400);
  });

  it('pide permiso en Barriles', async () => {
    expect((await pedir(AJENO, '26124')).status).toBe(403);
  });
});
