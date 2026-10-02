/**
 * Combinar lo que cargaron dos personas a la vez (shared/fusion.js).
 *
 * Va en .mjs por lo mismo que barriles-inventario.test.mjs: importa un .js
 * clásico que se cuelga de globalThis y no tiene tipos.
 */

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import '../public/shared/fusion.js';
import { rutasPrensas } from '../src/prensas/rutas';

const { fusionar, fusionarDocumento, clonar } = globalThis.CIWFusion;

describe('dos dispositivos guardando Prensas a la vez, de punta a punta', () => {
  const EDITOR = 'editor@catenawines.com';

  beforeAll(async () => {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre) VALUES (?, 'prensas', 'editor', 'Editor')`,
    ).bind(EDITOR).run();
  });

  async function pedir(metodo, cuerpo) {
    const req = new Request('https://catenainstitute.example/prensas/api/datos', {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'Cf-Access-Authenticated-User-Email': EDITOR },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const ctx = createExecutionContext();
    const res = await rutasPrensas(req, env, ctx, '/datos');
    await waitOnExecutionContext(ctx);
    return res;
  }

  it('el segundo combina con lo del primero y guarda: no se pierde ningún análisis', async () => {
    const inicial = { meta: { version: 0 }, lotes: [{ lote: '26001', variedad: 'Malbec' }],
      analisis: [], degustaciones: [], agregados: [] };
    expect((await pedir('POST', inicial)).status).toBe(200);

    // Los dos abren la misma versión.
    const leido = await (await pedir('GET')).json();
    const baseA = clonar(leido), baseB = clonar(leido);
    const pantallaA = clonar(leido), pantallaB = clonar(leido);
    pantallaA.analisis.push({ lote: '26001', fecha: '2026-10-02', ph: 3.5 });
    pantallaB.analisis.push({ lote: '26001', fecha: '2026-10-02', ph: 3.9, av: 0.4 });
    pantallaB.lotes.push({ lote: '26002', variedad: 'Syrah' });

    expect((await pedir('POST', pantallaA)).status).toBe(200);

    // B choca, combina con lo que vino en el 409 (como hace app.js) y reintenta.
    const choque = await pedir('POST', pantallaB);
    expect(choque.status).toBe(409);
    const { actual } = await choque.json();
    const combinado = fusionarDocumento(baseB, pantallaB, actual);
    expect((await pedir('POST', combinado)).status).toBe(200);

    const final = await (await pedir('GET')).json();
    expect(final.analisis).toHaveLength(2);
    expect(final.lotes.map((l) => l.lote)).toEqual(['26001', '26002']);
    void baseA;
  });

  it('un guardado viejo recibe 409 aunque el freno lo hubiera parado (así la app puede combinar)', async () => {
    const lotes = Array.from({ length: 30 }, (_, i) => ({ lote: String(27000 + i), variedad: 'Malbec' }));
    const actual = await (await pedir('GET')).json();
    const v = actual.meta.version;
    expect((await pedir('POST', { ...actual, lotes })).status).toBe(200);
    // Una pantalla que abrió antes no tiene esos 30 lotes: sin el orden nuevo,
    // el freno la tomaba por un borrado masivo (400) en vez de un 409.
    const viejo = { ...actual, meta: { ...actual.meta, version: v } };
    expect((await pedir('POST', viejo)).status).toBe(409);
  });
});

const base = () => ({
  meta: { version: 7, autor: 'A' },
  lotes: [
    { lote: 101, variedad: 'Malbec', litros: 1000, comentario: '' },
    { lote: 102, variedad: 'Cabernet', litros: 800, comentario: '' },
  ],
  analisis: [
    { lote: 101, fecha: '2026-09-01', ph: 3.5 },
    { lote: 101, fecha: '2026-09-15', ph: 3.6 },
  ],
  estado_lote: { 101: { etapa: 'fml' } },
});

describe('fusionar documentos de módulo', () => {
  it('dos personas cargan análisis a la vez: quedan los dos', () => {
    const b = base();
    const yo = base(); yo.analisis.push({ lote: 102, fecha: '2026-10-01', ph: 3.7 });
    const otro = base(); otro.analisis.push({ lote: 101, fecha: '2026-10-01', ph: 3.4 }); otro.meta.version = 8;

    const r = fusionarDocumento(b, yo, otro);
    expect(r.analisis).toHaveLength(4);
    expect(r.analisis).toContainEqual({ lote: 102, fecha: '2026-10-01', ph: 3.7 });
    expect(r.analisis).toContainEqual({ lote: 101, fecha: '2026-10-01', ph: 3.4 });
    // Se reintenta contra la versión del servidor.
    expect(r.meta.version).toBe(8);
  });

  it('dos personas editan campos distintos del mismo lote: quedan las dos ediciones', () => {
    const b = base();
    const yo = base(); yo.lotes[0].comentario = 'trasegar';
    const otro = base(); otro.lotes[0].litros = 950;

    const r = fusionarDocumento(b, yo, otro);
    expect(r.lotes[0]).toMatchObject({ lote: 101, comentario: 'trasegar', litros: 950 });
  });

  it('el mismo dato cambiado por los dos: gana el que está guardando', () => {
    const b = base();
    const yo = base(); yo.lotes[1].litros = 700;
    const otro = base(); otro.lotes[1].litros = 750;
    expect(fusionarDocumento(b, yo, otro).lotes[1].litros).toBe(700);
  });

  it('lotes nuevos de los dos lados se suman', () => {
    const b = base();
    const yo = base(); yo.lotes.push({ lote: 200, variedad: 'Syrah', litros: 300 });
    const otro = base(); otro.lotes.push({ lote: 201, variedad: 'Merlot', litros: 400 });
    expect(fusionarDocumento(b, yo, otro).lotes.map((l) => l.lote)).toEqual([101, 102, 201, 200]);
  });

  it('un borrado se respeta si el otro no tocó esa fila', () => {
    const b = base();
    const yo = base(); yo.analisis.splice(0, 1);
    const otro = base(); otro.analisis.push({ lote: 102, fecha: '2026-10-02', ph: 3.3 });
    const r = fusionarDocumento(b, yo, otro);
    expect(r.analisis).not.toContainEqual({ lote: 101, fecha: '2026-09-01', ph: 3.5 });
    expect(r.analisis).toHaveLength(2);
  });

  it('si uno borra un lote y el otro lo edita, gana la edición (no se pierde)', () => {
    const b = base();
    const yo = base(); yo.lotes.splice(1, 1);
    const otro = base(); otro.lotes[1].comentario = 'ojo AV';
    expect(fusionarDocumento(b, yo, otro).lotes.find((l) => l.lote === 102)).toMatchObject({ comentario: 'ojo AV' });
  });

  it('editar una fila de análisis mientras el otro agrega otra', () => {
    const b = base();
    const yo = base(); yo.analisis[1] = { ...yo.analisis[1], ph: 3.65 };
    const otro = base(); otro.analisis.push({ lote: 102, fecha: '2026-10-03', ph: 3.2 });
    const r = fusionarDocumento(b, yo, otro);
    expect(r.analisis).toHaveLength(3);
    expect(r.analisis).toContainEqual({ lote: 101, fecha: '2026-09-15', ph: 3.65 });
    expect(r.analisis).not.toContainEqual({ lote: 101, fecha: '2026-09-15', ph: 3.6 });
  });

  it('la misma fila exacta cargada por los dos queda una sola (es el mismo dato)', () => {
    const fila = { lote: 102, fecha: '2026-10-04', ph: 3.5 };
    const b = base();
    const yo = base(); yo.analisis.push({ ...fila });
    const otro = base(); otro.analisis.push({ ...fila });
    expect(fusionarDocumento(b, yo, otro).analisis.filter((a) => a.lote === 102)).toHaveLength(1);
  });

  it('dos análisis distintos del mismo lote en listas cortas no se funden en uno', () => {
    // Con una fila por lado, "lote" no se repite: antes se lo tomaba como clave
    // y el análisis de una persona pisaba el de la otra.
    const b = { meta: { version: 1 }, lotes: [{ lote: '26001' }], analisis: [] };
    const yo = { ...clonar(b), analisis: [{ lote: '26001', fecha: '2026-10-02', ph: 3.9 }] };
    const otro = { ...clonar(b), analisis: [{ lote: '26001', fecha: '2026-10-02', ph: 3.5 }] };
    expect(fusionarDocumento(b, yo, otro).analisis).toHaveLength(2);
  });

  it('objetos por clave (estado_lote) se combinan clave por clave', () => {
    const b = base();
    const yo = base(); yo.estado_lote[102] = { etapa: 'crianza' };
    const otro = base(); otro.estado_lote[101] = { etapa: 'crianza' };
    expect(fusionarDocumento(b, yo, otro).estado_lote).toEqual({ 101: { etapa: 'crianza' }, 102: { etapa: 'crianza' } });
  });

  it('el orden de las claves no cuenta como cambio', () => {
    const b = base();
    const yo = base(); yo.lotes[0] = { comentario: '', litros: 1000, variedad: 'Malbec', lote: 101 };
    const otro = base(); otro.lotes[0].litros = 900;
    expect(fusionarDocumento(b, yo, otro).lotes[0].litros).toBe(900);
  });

  it('dos agregados nuevos con el mismo id (el mayor + 1) quedan los dos, con ids distintos', () => {
    const b = { meta: { version: 1 }, agregados: [{ id: 10, lote: 101, tipo: 'SO2' }] };
    const yo = clonar(b); yo.agregados.push({ id: 11, lote: 101, tipo: 'TH2', cantidad: 5 });
    const otro = clonar(b); otro.agregados.push({ id: 11, lote: 102, tipo: 'SO2', cantidad: 3 });
    const r = fusionarDocumento(b, yo, otro).agregados;
    expect(r).toHaveLength(3);
    expect(r).toContainEqual({ id: 11, lote: 102, tipo: 'SO2', cantidad: 3 });
    expect(r.find((a) => a.tipo === 'TH2')).toMatchObject({ id: 12, lote: 101 });
    expect(new Set(r.map((a) => a.id)).size).toBe(3);
  });

  it('si un guardado llegó pero se perdió la respuesta, reintentar no duplica filas', () => {
    const b = base();
    const yo = base(); yo.analisis.push({ lote: 102, fecha: '2026-10-01', ph: 3.7 });
    // El servidor ya tiene esa fila (el guardado anterior entró) y una de otro.
    const serv = base(); serv.analisis.push({ lote: 102, fecha: '2026-10-01', ph: 3.7 });
    serv.analisis.push({ lote: 101, fecha: '2026-10-02', ph: 3.3 });
    yo.analisis.push({ lote: 101, fecha: '2026-10-05', ph: 3.2 });   // y sigo cargando
    const r = fusionarDocumento(b, yo, serv).analisis;
    expect(r.filter((a) => a.lote === 102 && a.fecha === '2026-10-01')).toHaveLength(1);
    expect(r).toHaveLength(5);
  });

  it('un lote con número en blanco no hace que se dupliquen los demás al editarlos', () => {
    const b = base(); b.lotes.push({ lote: null, variedad: '' });
    const yo = clonar(b); yo.lotes[0].comentario = 'trasegar';
    const otro = clonar(b); otro.lotes[0].litros = 950;
    const r = fusionarDocumento(b, yo, otro).lotes;
    expect(r.filter((l) => l.lote === 101)).toHaveLength(1);
    expect(r.find((l) => l.lote === 101)).toMatchObject({ comentario: 'trasegar', litros: 950 });
    expect(r).toHaveLength(3);
  });

  it('degustaciones: una por lote y mes, se combinan campo por campo', () => {
    const b = { meta: { version: 1 }, degustaciones: [{ lote: 101, mes: 9, estado: null, comentario: '' }] };
    const yo = clonar(b); yo.degustaciones[0].comentario = 'reducido';
    const otro = clonar(b); otro.degustaciones[0].estado = 'nook';
    const r = fusionarDocumento(b, yo, otro).degustaciones;
    expect(r).toEqual([{ lote: 101, mes: 9, estado: 'nook', comentario: 'reducido' }]);
  });

  it('no muta los documentos que recibe', () => {
    const b = base(); const yo = base(); yo.lotes[0].litros = 1; const otro = base(); otro.lotes[1].litros = 2;
    const copia = JSON.stringify([b, yo, otro]);
    fusionarDocumento(b, yo, otro);
    expect(JSON.stringify([b, yo, otro])).toBe(copia);
  });
});
