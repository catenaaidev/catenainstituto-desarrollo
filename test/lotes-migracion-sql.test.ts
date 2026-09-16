/**
 * El SQL de la migracion de FML, corrido contra D1 de verdad.
 *
 * Los tests de este repo corren dentro del runtime real de Workers, asi que
 * estas sentencias se ejecutan en el mismo motor que la nube. Es lo que hace
 * falta para confiar en las dos cosas que no se pueden verificar leyendo:
 * el limite de argumentos de `json_set` y el candado de version.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { construirSqlMigracion } from '../scripts/sql-migracion-fml.mjs';

const CRITERIOS = { config: { por_variedad: { 'Pinot Noir': { ph_max: 3.65 } }, por_proyecto: {} }, agregadas: ['Pinot Noir.ph_max'] };
const SIN_CRITERIOS = { config: {}, agregadas: [] };

/** Documento de lotes con `n` lotes sin decision de FML, en la version dada. */
async function sembrarDocumento(n: number, version = 16) {
  const doc = {
    meta: { version, autor: 'equipo', actualizado: '2026-09-08 16:38:47' },
    config: { criterios_fml: { default: { ph_max: 3.75 } }, destinos_externos: ['Bodega X'] },
    lotes: Array.from({ length: n }, (_, i) => ({ lote: String(26000 + i), variedad: 'Pinot Noir' })),
  };
  await env.DB.prepare(
    `INSERT OR REPLACE INTO documento (modulo, version, json, autor, guardado)
     VALUES ('lotes', ?, ?, 'equipo', '2026-09-08 16:38:47')`,
  )
    .bind(version, JSON.stringify(doc))
    .run();
}

async function correr(sentencias: string[]) {
  for (const s of sentencias) await env.DB.prepare(s).run();
}

async function leerDoc() {
  const fila = await env.DB.prepare('SELECT version, json FROM documento WHERE modulo = ?')
    .bind('lotes')
    .first<{ version: number; json: string }>();
  return { version: fila!.version, doc: JSON.parse(fila!.json) };
}

const cambio = (indice: number, valor = 'si') => ({
  indice,
  lote: String(26000 + indice),
  variedad: 'Pinot Noir',
  valor,
});

describe('SQL de la migracion de FML', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM documento').run();
    await env.DB.prepare('DELETE FROM historial').run();
  });

  it('escribe hace_fml en la fila que corresponde y no toca las otras', async () => {
    await sembrarDocumento(4);
    const { sentencias } = construirSqlMigracion({
      version: 16,
      cambios: [cambio(1, 'si'), cambio(3, 'no')],
      criterios: SIN_CRITERIOS,
      tieneConfig: true,
    });

    await correr(sentencias);

    const { doc } = await leerDoc();
    expect(doc.lotes.map((l: { hace_fml?: string }) => l.hace_fml)).toEqual([
      undefined, 'si', undefined, 'no',
    ]);
  });

  it('parte los json_set: 130 lotes pasan el limite de 127 argumentos de SQLite', async () => {
    // Cada campo son dos argumentos. En una sola sentencia, 130 lotes serian
    // 260 y SQLite la rechaza. Este test es la razon de que se partan.
    await sembrarDocumento(130);
    const { sentencias } = construirSqlMigracion({
      version: 16,
      cambios: Array.from({ length: 130 }, (_, i) => cambio(i)),
      criterios: SIN_CRITERIOS,
      tieneConfig: true,
    });

    await correr(sentencias);

    const { doc } = await leerDoc();
    expect(doc.lotes.filter((l: { hace_fml?: string }) => l.hace_fml === 'si')).toHaveLength(130);
  });

  it('el candado deja el documento intacto si alguien guardo en el medio', async () => {
    await sembrarDocumento(4, 17); // la base ya esta en 17
    const { sentencias } = construirSqlMigracion({
      version: 16, // pero la migracion se calculo sobre la 16
      cambios: [cambio(1)],
      criterios: CRITERIOS,
      tieneConfig: true,
    });

    await correr(sentencias);

    const { version, doc } = await leerDoc();
    expect(version).toBe(17);
    expect(doc.lotes[1].hace_fml).toBeUndefined();
    expect(doc.config.criterios_fml.default.ph_max).toBe(3.75);
  });

  it('el candado tampoco deja una fila de historial que mienta', async () => {
    await sembrarDocumento(4, 17);
    const { sentencias } = construirSqlMigracion({
      version: 16,
      cambios: [cambio(1)],
      criterios: SIN_CRITERIOS,
      tieneConfig: true,
    });

    await correr(sentencias);

    const { results } = await env.DB.prepare('SELECT * FROM historial').all();
    expect(results).toHaveLength(0);
  });

  it('siembra los criterios como objeto, no como texto', async () => {
    await sembrarDocumento(2);
    const { sentencias } = construirSqlMigracion({
      version: 16,
      cambios: [],
      criterios: CRITERIOS,
      tieneConfig: true,
    });

    await correr(sentencias);

    const { doc } = await leerDoc();
    expect(doc.config.criterios_fml.por_variedad['Pinot Noir'].ph_max).toBe(3.65);
    expect(doc.config.destinos_externos).toEqual(['Bodega X']); // el resto de config sobrevive
  });

  it('sube la version en la columna y en el meta, y firma el historial', async () => {
    await sembrarDocumento(2);
    const { sentencias } = construirSqlMigracion({
      version: 16,
      cambios: [cambio(0)],
      criterios: CRITERIOS,
      tieneConfig: true,
    });

    await correr(sentencias);

    const { version, doc } = await leerDoc();
    expect(version).toBe(17);
    expect(doc.meta.version).toBe(17);
    expect(doc.meta.autor).toBe('migracion-fml');

    const h = await env.DB.prepare('SELECT version, autor, resumen FROM historial').first<{
      version: number; autor: string; resumen: string;
    }>();
    expect(h!.version).toBe(17);
    expect(h!.autor).toBe('migracion-fml');
    expect(h!.resumen).toContain('1 decisiones');
  });

  it('crea config entero cuando el documento no lo trae', async () => {
    await env.DB.prepare(
      `INSERT INTO documento (modulo, version, json, autor, guardado)
       VALUES ('lotes', 16, ?, 'equipo', '')`,
    )
      .bind(JSON.stringify({ meta: { version: 16 }, lotes: [] }))
      .run();

    const { sentencias } = construirSqlMigracion({
      version: 16,
      cambios: [],
      criterios: CRITERIOS,
      tieneConfig: false,
    });

    await correr(sentencias);

    const { doc } = await leerDoc();
    expect(doc.config.criterios_fml.por_variedad['Pinot Noir'].ph_max).toBe(3.65);
  });

  it('cada sentencia va en una sola linea, como las espera wrangler', async () => {
    const { sentencias } = construirSqlMigracion({
      version: 16,
      cambios: [cambio(0)],
      criterios: CRITERIOS,
      tieneConfig: true,
    });

    for (const s of sentencias) expect(s).not.toContain('\n');
  });
});
