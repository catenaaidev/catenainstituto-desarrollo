/**
 * GET /info — cómo se conecta el celular.
 *
 * En la app de la bodega esta ruta devolvía las IPs de la red local para armar
 * el QR de emparejamiento. Acá no hay red que descubrir: la dirección es una
 * sola, pública y fija, así que `urls` va vacía.
 *
 * Por eso hace falta `modo`. La pantalla es el MISMO archivo en los dos lados
 * (se sincroniza copiándolo), así que tiene que poder distinguir en tiempo de
 * ejecución dónde está corriendo. Sin esa marca, una lista vacía es ambigua:
 * puede significar "acá no hace falta ninguna IP" o "la PC se quedó sin WiFi",
 * y la pantalla termina mandando al operario a prender un `servidor.py` que en
 * la web no existe. Que es exactamente lo que pasaba.
 */

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { rutasBarriles } from '../src/barriles/rutas';

const BODEGA = 'bodega@catenawines.com';
const AJENO = 'ajeno@catenawines.com';

beforeAll(async () => {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre)
     VALUES (?, 'barriles', 'editor', 'Bodega')`,
  )
    .bind(BODEGA)
    .run();
});

/** Pide /info como lo haría la pantalla, con la identidad que pone Access. */
async function pedirInfo(email: string) {
  const req = new Request('https://catenainstitute.example/barriles/api/info', {
    headers: { 'Cf-Access-Authenticated-User-Email': email },
  });
  const ctx = createExecutionContext();
  const res = await rutasBarriles(req, env, ctx, '/info');
  await waitOnExecutionContext(ctx);
  return res!;
}

describe('GET /info', () => {
  it('se identifica como web, para que la pantalla no busque una red local', async () => {
    const res = await pedirInfo(BODEGA);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ modo: 'web', urls: [] });
  });

  it('sigue pidiendo permiso en el módulo', async () => {
    const res = await pedirInfo(AJENO);

    expect(res.status).toBe(403);
  });
});
