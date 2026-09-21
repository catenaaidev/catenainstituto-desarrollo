/**
 * Dos dispositivos guardando Prensas a la vez.
 *
 * Mismo defecto que ya se cerró en Barriles y en Lotes: el chequeo de version
 * quedaba FUERA de la escritura, y el ON CONFLICT DO UPDATE escribe siempre.
 *
 * OJO al test de la carrera: depende de que los dos handlers tengan la misma
 * cantidad de awaits antes de leerDocumento(). Si alguien agrega un await
 * asimétrico antes, el lockstep se rompe y el test puede dar verde por el
 * chequeo de version secuencial sin ejercitar el compare-and-swap. Por eso está
 * además el test unitario determinista del final.
 */

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { rutasPrensas, escribirDocumento } from '../src/prensas/rutas';

const EDITOR = 'editor@catenawines.com';

beforeAll(async () => {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre)
     VALUES (?, 'prensas', 'editor', 'Editor')`,
  ).bind(EDITOR).run();
});

/** Un documento de Prensas con las secciones obligatorias. */
function datos(version: number, ...numerosDeLote: string[]) {
  return {
    meta: { version },
    lotes: numerosDeLote.map((lote) => ({ lote, variedad: 'Malbec' })),
    analisis: [],
    degustaciones: [],
    agregados: [],
  };
}

/** Un POST /datos como lo manda la pantalla. */
async function guardar(cuerpo: unknown) {
  const req = new Request('https://catenainstitute.example/prensas/api/datos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cf-Access-Authenticated-User-Email': EDITOR,
    },
    body: JSON.stringify(cuerpo),
  });
  const ctx = createExecutionContext();
  const res = await rutasPrensas(req, env, ctx, '/datos');
  await waitOnExecutionContext(ctx);
  return res!;
}

/**
 * El documento completo. GET /datos puede avanzar el mes solo (y escribir), pero
 * eso no afecta a lo que estos tests miran: la version que devuelve es siempre
 * la vigente.
 */
async function leerDoc() {
  const req = new Request('https://catenainstitute.example/prensas/api/datos', {
    headers: { 'Cf-Access-Authenticated-User-Email': EDITOR },
  });
  const ctx = createExecutionContext();
  const res = await rutasPrensas(req, env, ctx, '/datos');
  await waitOnExecutionContext(ctx);
  return res!.json<{ meta: { version: number }; lotes: { lote: string }[] }>();
}

async function versionActual() {
  return (await leerDoc()).meta.version;
}

describe('dos guardados de Prensas desde la misma version', () => {
  it('el segundo recibe 409 y no pisa al primero', async () => {
    const base = await versionActual();
    expect((await guardar(datos(base, '26001'))).status).toBe(200);
    const version = await versionActual();

    const [a, b] = await Promise.all([
      guardar(datos(version, '26001', 'pc-A')),
      guardar(datos(version, '26001', 'pc-B')),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);

    const doc = await leerDoc();
    const lotes = doc.lotes.map((l) => l.lote);
    expect(lotes).toContain('26001');
    expect(lotes.includes('pc-A') !== lotes.includes('pc-B')).toBe(true);
  });

  it('el historial no anota el guardado que no llegó a escribirse', async () => {
    const base = await versionActual();
    expect((await guardar(datos(base, '26001'))).status).toBe(200);
    const version = await versionActual();

    await Promise.all([
      guardar(datos(version, '26001', 'pc-A')),
      guardar(datos(version, '26001', 'pc-B')),
    ]);

    const fila = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM historial WHERE modulo = 'prensas' AND version = ?`,
    ).bind(version + 1).first<{ n: number }>();
    expect(fila!.n).toBe(1);
  });
});

describe('fila de Prensas sembrada en version 0 (simula importar.mjs)', () => {
  it('una fila en version 0 puede guardarse y no queda trabada en 409', async () => {
    const docV0 = JSON.stringify(datos(0, 'importado'));
    await env.DB.prepare(
      `INSERT OR REPLACE INTO documento (modulo, version, json, autor, guardado)
       VALUES ('prensas', 0, ?, 'importacion', '')`,
    ).bind(docV0).run();

    expect((await guardar(datos(0, 'importado', 'nuevo'))).status).toBe(200);
    expect((await leerDoc()).meta.version).toBe(1);
  });
});

describe('compare-and-swap de Prensas: test unitario determinista', () => {
  it('escribirDocumento() devuelve false si la version cambió entre la lectura y la escritura', async () => {
    const versionInicial = await versionActual();
    expect((await guardar(datos(versionInicial, 'base'))).status).toBe(200);
    const versionAhora = await versionActual();

    const tarde = datos(versionAhora + 1, 'tarde');
    expect(await escribirDocumento(env, tarde, EDITOR, versionInicial)).toBe(false);

    const doc = await leerDoc();
    expect(doc.meta.version).toBe(versionAhora);
    const lotes = doc.lotes.map((l) => l.lote);
    expect(lotes).toContain('base');
    expect(lotes).not.toContain('tarde');
  });

  it('escribirDocumento() devuelve true cuando la version es la esperada', async () => {
    const versionInicial = await versionActual();
    const doc = datos(versionInicial + 1, 'ok');
    expect(await escribirDocumento(env, doc, EDITOR, versionInicial)).toBe(true);
    expect((await leerDoc()).meta.version).toBe(versionInicial + 1);
  });
});
