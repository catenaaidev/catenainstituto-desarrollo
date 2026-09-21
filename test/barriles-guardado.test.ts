/**
 * Dos dispositivos guardando a la vez.
 *
 * El chequeo de version estaba FUERA de la escritura: leer, comparar y despues
 * escribir con ON CONFLICT DO UPDATE, que escribe siempre. Dos celulares que
 * pasaban el chequeo con la misma version escribian los dos, y el segundo se
 * llevaba puesto el trabajo del primero sin dejar rastro.
 */

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { rutasBarriles } from '../src/barriles/rutas';

const EDITOR = 'editor@catenawines.com';

beforeAll(async () => {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre)
     VALUES (?, 'barriles', 'editor', 'Editor')`,
  ).bind(EDITOR).run();
});

/** Un POST /estado como lo manda la pantalla. */
async function guardar(version: number, estado: unknown) {
  const req = new Request('https://catenainstitute.example/barriles/api/estado', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cf-Access-Authenticated-User-Email': EDITOR,
    },
    body: JSON.stringify({ version, estado }),
  });
  const ctx = createExecutionContext();
  const res = await rutasBarriles(req, env, ctx, '/estado');
  await waitOnExecutionContext(ctx);
  return res!;
}

/** El documento completo, como lo baja la pantalla. */
async function leerDoc() {
  const req = new Request('https://catenainstitute.example/barriles/api/estado', {
    headers: { 'Cf-Access-Authenticated-User-Email': EDITOR },
  });
  const ctx = createExecutionContext();
  const res = await rutasBarriles(req, env, ctx, '/estado');
  await waitOnExecutionContext(ctx);
  return res!.json<{ version: number; estado: { escaneos?: { id: string }[] } }>();
}

/**
 * La version que hay AHORA. Los describe de este archivo comparten
 * almacenamiento, asi que despues del primer guardado la version ya no es 0:
 * asumirlo hacia que el test rompiera por 409 y no por el defecto que persigue.
 */
async function versionActual() {
  return (await leerDoc()).version;
}

function conOrdenes(...ids: string[]) {
  return { boxes: [], palets: [], inventario: [], tanques: [],
           escaneos: ids.map((id) => ({ id, ot: '1', lote: '1', tipo: 'vaciado', codigos: [] })) };
}

describe('dos guardados desde la misma version', () => {
  // OJO: en secuencia esto NO prueba nada. El chequeo `pedido.version !==
  // doc.version` YA existe y devuelve 409 para el segundo, asi que un test
  // secuencial pasa igual sin compare-and-swap.
  //
  // La carrera real es que los dos lean ANTES de que cualquiera escriba. Con
  // Promise.all en un isolate de un solo hilo, los dos llegan a su `await
  // leer(env)` y ceden; cuando resuelven, los dos tienen la misma version y los
  // dos pasan el chequeo. Ahi es donde el ON CONFLICT DO UPDATE escribe dos
  // veces y el segundo se lleva puesto al primero.
  it('el segundo recibe 409 y no pisa al primero', async () => {
    const base = await versionActual();
    expect((await guardar(base, conOrdenes('a'))).status).toBe(200);
    const version = await versionActual();

    const [a, b] = await Promise.all([
      guardar(version, conOrdenes('a', 'celular-A')),
      guardar(version, conOrdenes('a', 'celular-B')),
    ]);

    const estados = [a.status, b.status].sort();
    expect(estados).toEqual([200, 409]);

    // Y el que gano sigue estando: no quedaron los dos escritos ni se perdieron
    // los dos.
    const doc = await leerDoc();
    const ids = (doc.estado.escaneos ?? []).map((o) => o.id);
    expect(ids).toContain('a');
    expect(ids.includes('celular-A') !== ids.includes('celular-B')).toBe(true);
  });

  it('una version vieja tambien se rechaza', async () => {
    const version = await versionActual();
    expect((await guardar(version, conOrdenes('a', 'nuevo'))).status).toBe(200);
    expect((await guardar(version, conOrdenes('a', 'tarde'))).status).toBe(409);
  });
});

describe('un POST sin estado', () => {
  it('se rechaza con 400 en vez de borrar todo', async () => {
    const req = new Request('https://catenainstitute.example/barriles/api/estado', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cf-Access-Authenticated-User-Email': EDITOR,
      },
      body: JSON.stringify({ version: await versionActual() }),   // sin campo `estado`
    });
    const ctx = createExecutionContext();
    const res = await rutasBarriles(req, env, ctx, '/estado');
    await waitOnExecutionContext(ctx);
    expect(res!.status).toBe(400);
  });

  it('se rechaza tambien con una version vieja: malformado es malformado', async () => {
    const req = new Request('https://catenainstitute.example/barriles/api/estado', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cf-Access-Authenticated-User-Email': EDITOR,
      },
      body: JSON.stringify({ version: 0 }),
    });
    const ctx = createExecutionContext();
    const res = await rutasBarriles(req, env, ctx, '/estado');
    await waitOnExecutionContext(ctx);
    expect(res!.status).toBe(400);
  });
});
