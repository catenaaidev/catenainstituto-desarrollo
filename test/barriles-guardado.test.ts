/**
 * Dos dispositivos guardando a la vez.
 *
 * El chequeo de version estaba FUERA de la escritura: leer, comparar y despues
 * escribir con ON CONFLICT DO UPDATE, que escribe siempre. Dos celulares que
 * pasaban el chequeo con la misma version escribian los dos, y el segundo se
 * llevaba puesto el trabajo del primero sin dejar rastro.
 *
 * OJO al test de la carrera ('el segundo recibe 409 y no pisa al primero'):
 * depende de que los dos handlers tengan exactamente la misma cantidad de
 * awaits antes de leer(). Si alguien agrega un await extra antes de leer()
 * (flag, rate-limit, auditoria), el lockstep se rompe, el test deja de
 * ejercitar el compare-and-swap real y puede dar verde por el chequeo de
 * version secuencial. Ante una regresion inesperada en ese test, revisar
 * si se agrego un await asimetrico antes de leer().
 */

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { rutasBarriles, escribir } from '../src/barriles/rutas';

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
 * La version que hay AHORA. Con @cloudflare/vitest-pool-workers cada it()
 * corre en su propio isolate con storage revertido, asi que los describe NO
 * comparten almacenamiento: cada it arranca con la base limpia. El helper es
 * dinamico para que no haya que hardcodear la version inicial; si leer()
 * devuelve version: 0 sin fila, guardar con versionPrevia = 0 es correcto.
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
    // Primero guardamos datos reales para que haya una version actual > 0.
    const versionInicial = await versionActual();
    expect((await guardar(versionInicial, conOrdenes('x'))).status).toBe(200);
    // Ahora version actual es versionInicial + 1. Mandamos sin estado (malformado)
    // con la version vieja: tiene que ser 400 (malformado), no 409 (version vieja).
    const req = new Request('https://catenainstitute.example/barriles/api/estado', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cf-Access-Authenticated-User-Email': EDITOR,
      },
      body: JSON.stringify({ version: versionInicial }),  // version vieja, sin estado
    });
    const ctx = createExecutionContext();
    const res = await rutasBarriles(req, env, ctx, '/estado');
    await waitOnExecutionContext(ctx);
    expect(res!.status).toBe(400);
  });
});

describe('fila sembrada en version 0 (simula importacion a la nube)', () => {
  // importar.mjs siembra la fila directamente desde el json exportado. Si el
  // export no trae el campo version, la fila queda con version: 0 en la columna
  // y en el json. Con la implementacion anterior que ramificaba en versionPrevia
  // === 0, el INSERT ON CONFLICT DO NOTHING chocaba con la fila existente,
  // changes = 0, y devolver false para siempre: la app quedaba trabada en 409
  // sin poder escribir nunca mas.
  it('una fila en version 0 puede guardarse y no queda trabada en 409', async () => {
    // Sembrar la fila directamente, como lo hace importar.mjs con un export
    // cuyo json no trae el campo version (queda en 0).
    const docV0 = JSON.stringify({ version: 0, estado: conOrdenes('importado') });
    await env.DB.prepare(
      `INSERT OR REPLACE INTO documento (modulo, version, json, autor, guardado)
       VALUES ('barriles', 0, ?, 'importador', datetime('now'))`,
    ).bind(docV0).run();

    // El primer guardado desde version 0 tiene que funcionar, no quedar en 409.
    const res = await guardar(0, conOrdenes('importado', 'nuevo'));
    expect(res.status).toBe(200);

    // Y la version siguiente tiene que leerse correctamente.
    const doc = await leerDoc();
    expect(doc.version).toBe(1);
  });
});

describe('compare-and-swap: test unitario deterministico', () => {
  // El test de la carrera con Promise.all depende del planificador y puede dejar
  // de ejercitar el CAS si alguien agrega un await asimetrico antes de leer().
  // Este test fija el invariante sin depender del entrelazado: escribe en version
  // N y luego intenta escribir pasando una versionPrevia vieja — tiene que
  // devolver false sin importar el orden de ejecucion.
  it('escribir() devuelve false si la version cambio entre la lectura y la escritura', async () => {
    // Paso 1: guardamos el estado inicial para tener version 1 en la base.
    const versionInicial = await versionActual();
    const ok = await guardar(versionInicial, conOrdenes('base'));
    expect(ok.status).toBe(200);
    const versionActualAhora = await versionActual();  // deberia ser versionInicial + 1

    // Paso 2: simulamos que un dispositivo lento intenta escribir con la version
    // vieja (la que habia antes del guardado anterior). escribir() debe rechazarlo.
    const docDesactualizado = { version: versionActualAhora + 1, estado: conOrdenes('tarde') };
    const resultado = await escribir(env, docDesactualizado, EDITOR, versionInicial);
    // versionInicial ya no es la version actual, asi que el WHERE no se cumple.
    expect(resultado).toBe(false);

    // Paso 3: el documento no cambio.
    const docFinal = await leerDoc();
    expect(docFinal.version).toBe(versionActualAhora);
    const ids = (docFinal.estado.escaneos ?? []).map((o) => o.id);
    expect(ids).toContain('base');
    expect(ids).not.toContain('tarde');
  });
});
