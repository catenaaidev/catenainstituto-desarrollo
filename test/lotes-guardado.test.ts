/**
 * Dos dispositivos guardando Lotes a la vez.
 *
 * Mismo defecto que ya se cerró en Barriles: el chequeo de version estaba FUERA
 * de la escritura (leer, comparar, y después escribir con ON CONFLICT DO UPDATE,
 * que escribe siempre). Dos navegadores que pasaban el chequeo con la misma
 * version escribían los dos, y el segundo se llevaba puesto el trabajo del
 * primero sin dejar rastro.
 *
 * OJO al test de la carrera: depende de que los dos handlers tengan exactamente
 * la misma cantidad de awaits antes de leerDocumento(). Si alguien agrega un
 * await asimétrico antes (flag, rate-limit, auditoría), el lockstep se rompe, el
 * test deja de ejercitar el compare-and-swap y puede dar verde por el chequeo de
 * version secuencial. Por eso está además el test unitario determinista del
 * final, que fija el invariante sin depender del entrelazado.
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
});

/** Un documento de Lotes con las secciones obligatorias. */
function datos(version: number, ...numerosDeLote: string[]) {
  return {
    meta: { version },
    lotes: numerosDeLote.map((lote) => ({ lote, variedad: 'Malbec' })),
    analisis: [],
    movimientos: [],
  };
}

/** Un POST /datos como lo manda la pantalla. */
async function guardar(cuerpo: unknown) {
  const req = new Request('https://catenainstitute.example/lotes/api/datos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cf-Access-Authenticated-User-Email': EDITOR,
    },
    body: JSON.stringify(cuerpo),
  });
  const ctx = createExecutionContext();
  const res = await rutasLotes(req, env, ctx, '/datos');
  await waitOnExecutionContext(ctx);
  return res!;
}

/** El documento completo, como lo baja la pantalla. */
async function leerDoc() {
  const req = new Request('https://catenainstitute.example/lotes/api/datos', {
    headers: { 'Cf-Access-Authenticated-User-Email': EDITOR },
  });
  const ctx = createExecutionContext();
  const res = await rutasLotes(req, env, ctx, '/datos');
  await waitOnExecutionContext(ctx);
  return res!.json<{ meta: { version: number }; lotes: { lote: string }[] }>();
}

async function versionActual() {
  return (await leerDoc()).meta.version;
}

describe('dos guardados de Lotes desde la misma version', () => {
  // En SECUENCIA esto no probaría nada: el chequeo `vc !== va` ya existe y
  // devuelve 409 para el segundo. La carrera real es que los dos lean ANTES de
  // que cualquiera escriba; con Promise.all en un isolate de un solo hilo los
  // dos ceden en su `await leerDocumento(env)` y vuelven con la misma version.
  it('el segundo recibe 409 y no pisa al primero', async () => {
    const base = await versionActual();
    expect((await guardar(datos(base, '26001'))).status).toBe(200);
    const version = await versionActual();

    const [a, b] = await Promise.all([
      guardar(datos(version, '26001', 'pc-A')),
      guardar(datos(version, '26001', 'pc-B')),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);

    // El que ganó sigue estando: no quedaron los dos escritos ni se perdieron
    // los dos.
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

    // Un historial que anota una escritura que nunca ocurrió arruina la próxima
    // investigación: dice que se guardó algo que no está en el documento.
    const fila = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM historial WHERE modulo = 'lotes' AND version = ?`,
    ).bind(version + 1).first<{ n: number }>();
    expect(fila!.n).toBe(1);
  });
});

describe('fila de Lotes sembrada en version 0 (simula importar.mjs)', () => {
  // La trampa que ya se pagó una vez en Barriles: ramificar según
  // `versionPrevia === 0` para distinguir "no hay fila" de "hay fila", cuando
  // leerDocumento() devuelve version 0 en los dos casos. Una fila sembrada por
  // importar.mjs en version 0 dejaba la app devolviendo 409 en cada guardado,
  // sin salida. Por eso el compare-and-swap va en UNA sola sentencia.
  it('una fila en version 0 puede guardarse y no queda trabada en 409', async () => {
    const docV0 = JSON.stringify(datos(0, 'importado'));
    await env.DB.prepare(
      `INSERT OR REPLACE INTO documento (modulo, version, json, autor, guardado)
       VALUES ('lotes', 0, ?, 'importacion', '')`,
    ).bind(docV0).run();

    expect((await guardar(datos(0, 'importado', 'nuevo'))).status).toBe(200);
    expect((await leerDoc()).meta.version).toBe(1);
  });
});

describe('compare-and-swap de Lotes: test unitario determinista', () => {
  it('escribirDocumento() devuelve false si la version cambió entre la lectura y la escritura', async () => {
    const versionInicial = await versionActual();
    expect((await guardar(datos(versionInicial, 'base'))).status).toBe(200);
    const versionAhora = await versionActual();

    // Un dispositivo lento que leyó antes del guardado anterior e intenta
    // escribir ahora con esa version vieja: el WHERE no se cumple.
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
