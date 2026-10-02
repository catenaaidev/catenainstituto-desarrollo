/**
 * Pedidos raros que tumbaban el Worker (1101) en vez de responder 400, y la
 * consulta de versión que cada pestaña hace cada 3 segundos.
 *
 * Un 1101 no es solo feo: la pantalla lo recibía como "otro error" y se
 * quedaba en "sin conexión" para siempre, con lo pendiente atrapado.
 */

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { rutasBarriles } from '../src/barriles/rutas';
import { contarPerdidas, type Estado } from '../src/barriles/guardas';

const EDITOR = 'editor-robustez@catenawines.com';

beforeAll(async () => {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre)
     VALUES (?, 'barriles', 'editor', 'Editor')`,
  ).bind(EDITOR).run();
});

async function pedir(ruta: string, init: RequestInit = {}) {
  const req = new Request('https://catenainstitute.example/barriles/api' + ruta, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cf-Access-Authenticated-User-Email': EDITOR,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const ctx = createExecutionContext();
  const res = await rutasBarriles(req, env, ctx, ruta);
  await waitOnExecutionContext(ctx);
  return res!;
}

/** POST /estado con el cuerpo tal cual, sin pasar por JSON.stringify de un objeto. */
const postCrudo = (cuerpo: string) => pedir('/estado', { method: 'POST', body: cuerpo });

async function versionPorEstado() {
  return (await (await pedir('/estado')).json<{ version: number }>()).version;
}

describe('POST /estado con un cuerpo que no es un objeto', () => {
  // JSON válido que no es un objeto: pasaba el try del parseo y `pedido.estado`
  // tiraba TypeError.
  for (const cuerpo of ['null', '5', '"texto"', '[]', 'true']) {
    it(`responde 400 con ${cuerpo}`, async () => {
      const res = await postCrudo(cuerpo);
      expect(res.status).toBe(400);
    });
  }

  it('el documento no cambia', async () => {
    const antes = await versionPorEstado();
    await postCrudo('null');
    expect(await versionPorEstado()).toBe(antes);
  });
});

describe('boxes o palets que no son listas', () => {
  it('el freno no revienta con boxes como objeto', () => {
    const raro = { boxes: { a: 1 }, palets: 'x' } as unknown as Estado;
    const normal: Estado = { boxes: [{ id: 'b1', celdas: { '1-1-1': '100' } }] };
    expect(() => contarPerdidas(raro, normal)).not.toThrow();
    expect(() => contarPerdidas(normal, raro)).not.toThrow();
    // Desde un documento roto no hay celdas que perder; hacia uno roto, todas.
    expect(contarPerdidas(raro, normal).celdas).toBe(0);
    expect(contarPerdidas(normal, raro).celdas).toBe(1);
  });

  it('un POST con boxes como objeto se rechaza con 400, no con 1101', async () => {
    const version = await versionPorEstado();
    const res = await postCrudo(JSON.stringify({ version, estado: { boxes: { a: 1 } } }));
    expect(res.status).toBe(400);
  });

  it('un POST con palets como string se rechaza con 400', async () => {
    const version = await versionPorEstado();
    const res = await postCrudo(JSON.stringify({ version, estado: { boxes: [], palets: 'x' } }));
    expect(res.status).toBe(400);
  });

  it('un documento guardado con boxes roto no tumba el siguiente guardado', async () => {
    // Un documento así solo puede haber entrado por fuera de la API (importación
    // o SQL a mano); la API tiene que seguir respondiendo igual.
    await env.DB.prepare(
      `INSERT OR REPLACE INTO documento (modulo, version, json, autor, guardado)
       VALUES ('barriles', 3, ?, 'test', datetime('now'))`,
    ).bind(JSON.stringify({ version: 3, estado: { boxes: 'roto', palets: { x: 1 } } })).run();
    const res = await postCrudo(JSON.stringify({ version: 3, estado: { boxes: [], palets: [] } }));
    expect(res.status).toBe(200);
  });
});

describe('GET /version', () => {
  it('sin documento devuelve 0, igual que /estado', async () => {
    await env.DB.prepare(`DELETE FROM documento WHERE modulo = 'barriles'`).run();
    const v = await (await pedir('/version')).json<{ version: number }>();
    expect(v.version).toBe(0);
    expect(await versionPorEstado()).toBe(0);
  });

  it('después de guardar coincide con la versión de /estado y con la del POST', async () => {
    const antes = await versionPorEstado();
    const post = await pedir('/estado', {
      method: 'POST',
      body: JSON.stringify({ version: antes, estado: { boxes: [], escaneos: [] } }),
    });
    expect(post.status).toBe(200);
    const { version: delPost } = await post.json<{ version: number }>();
    const { version: deVersion } = await (await pedir('/version')).json<{ version: number }>();
    expect(deVersion).toBe(delPost);
    expect(deVersion).toBe(await versionPorEstado());
    expect(typeof deVersion).toBe('number');
  });
});
