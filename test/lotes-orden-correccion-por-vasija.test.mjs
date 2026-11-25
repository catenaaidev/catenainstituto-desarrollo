/* Dosis por vasija en lotes barril por barril (Task 4) y Planilla (Task 5).
 * vista-orden-correccion.js importa nucleo.js, que engancha listeners de
 * window/document al cargar: por eso el stub ANTES del import dinamico
 * (mismo patron que lotes-ot-hojas.test.mjs). orden-correccion-planilla.js no
 * toca window, asi que su import es estatico (arriba). */
import { describe, it, expect, beforeAll } from 'vitest';
import { pintarPlanilla, cartelPorVasija } from '../public/lotes/js/orden-correccion-planilla.js';
import { filasPapelPorModo, filaPapelLote } from '../public/lotes/js/orden-correccion-papel.js';

let _ocBuildRows, modoPorDefecto, armarOrdenGuardada, entradasDeEjecucion, filasDeGuardada, vasijasEjecutables, resumenEjecucion, _papel;
beforeAll(async () => {
  globalThis.window ??= { addEventListener(){} };
  globalThis.document ??= { addEventListener(){} };
  ({ _ocBuildRows } = await import('../public/lotes/js/vista-orden-correccion.js'));
  ({ modoPorDefecto, armarOrdenGuardada, entradasDeEjecucion, filasDeGuardada, vasijasEjecutables, resumenEjecucion } =
    await import('../public/lotes/js/orden-correccion-guardada.js'));
  ({ _papel } = await import('../public/lotes/js/vista-ordenes-correccion.js'));
}, 30000);

const b = (num, so2, objetivo, aviso) => ({ num, cap: 225, litros_usados: 225, so2_libre: so2, objetivo, aviso: aviso ?? null,
  fuente: so2 != null ? 'propio' : null });
const lotePV = () => ({ lote: '26056', variedad: 'Malbec', so2_libre: 6, objetivo_libre: 35, por_vasija: true,
  barricas: [b('1100923', 6, 35), b('1100305', 41, 35),
    b('1100051', null, null, 'sin análisis propio: medir o escribir la dosis a mano')] });

describe('_ocBuildRows por vasija', () => {
  it('cada vasija con su dosis; en objetivo da 0; sin analisis da null', () => {
    const filas = _ocBuildRows({ lotes: [lotePV()] }, new Set(), new Map(), [], {});
    const vs = filas.filter(f => f.tipo === 'barrica');
    expect(vs[0].dosis.ml_solucion).toBeCloseTo((29 * 225 * 1.5) / 55, 5);
    expect(vs[1].dosis.ml_solucion).toBe(0);
    expect(vs[2].dosis.ml_solucion).toBeNull();
    expect(filas[0].ml_total).toBeCloseTo(vs[0].dosis.ml_solucion, 5);
  });
  it('objetivo pisado del lote manda para todas', () => {
    const filas = _ocBuildRows({ lotes: [lotePV()] }, new Set(), new Map([['26056', 45]]), [], {});
    const vs = filas.filter(f => f.tipo === 'barrica');
    expect(vs[1].dosis.ml_solucion).toBeCloseTo((4 * 225 * 1.5) / 55, 5);
  });
});

describe('modoPorDefecto', () => {
  it('lote por vasija: siempre por barril', () => {
    expect(modoPorDefecto([{ num: '1', cap: 225, litros_usados: 225 }], true)).toBe('barril');
  });
});

const U = { col: 'mL SOL.', suf: 'mL', dec: 1, de: d => d.ml_solucion };

describe('Planilla barril por barril', () => {
  const l = { ...lotePV(), ph: 3.6, so2_min: 6, so2_max: 41, fecha_por_vasija: '2026-10-09' };
  it('cartel con cantidad, fecha y rango', () => {
    expect(cartelPorVasija(l)).toBe('⚠ Barril por barril: 2 vasijas con análisis propio del 09/10 · SO₂ entre 6 y 41 ppm · cada una lleva su dosis');
    expect(cartelPorVasija({ ...l, por_vasija: undefined })).toBe('');
  });
  it('cartel: cuenta solo las de análisis propio; sin rango si no hay so2_min', () => {
    const conLote = { ...l, barricas: [...l.barricas, { ...b('', 20, 35), fuente: 'lote', vasija: 'T 201' }] };
    expect(cartelPorVasija(conLote)).toMatch(/^⚠ Barril por barril: 2 vasijas con análisis propio/);
    expect(cartelPorVasija({ ...l, so2_min: undefined, so2_max: undefined }))
      .toBe('⚠ Barril por barril: 2 vasijas con análisis propio del 09/10 · cada una lleva su dosis');
  });
  it('vasija sin análisis propio: SO2, deseado y diferencia en —, no los del lote', () => {
    const filas = _ocBuildRows({ lotes: [l] }, new Set(), new Map(), [], {});
    const html = pintarPlanilla({ filas, u: U, modoDe: () => 'barril' });
    const fila = html.split('<tr class="ocp-v').find(x => x.includes('1100051'));
    expect(fila).not.toContain('6.0');
    expect(fila).not.toContain('35.0');
    expect((fila.match(/<td class="n ocp-sin">—<\/td>/g) || []).length).toBe(3);
  });
  it('vasija en objetivo: la diferencia dice "en objetivo", no un número negativo', () => {
    const filas = _ocBuildRows({ lotes: [l] }, new Set(), new Map(), [], {});
    const html = pintarPlanilla({ filas, u: U, modoDe: () => 'barril' });
    const fila = html.split('<tr class="ocp-v').find(x => x.includes('1100305'));
    expect(fila).toContain('en objetivo');
    expect(fila).not.toContain('-6.0');
  });
  it('objetivo pisado: viene explícito en la fila del lote y manda en la planilla', () => {
    const filas = _ocBuildRows({ lotes: [l] }, new Set(), new Map([['26056', 45]]), [], {});
    expect(filas[0].pisado).toBe(true);
    expect(_ocBuildRows({ lotes: [l] }, new Set(), new Map(), [], {})[0].pisado).toBeUndefined();
    const html = pintarPlanilla({ filas, u: U, modoDe: () => 'barril' });
    const fila = html.split('<tr class="ocp-v').find(x => x.includes('1100305'));
    expect(fila).toContain('<td class="n">45.0</td>');
    // pisado igual al del servidor: sigue mandando el pisado (no se infiere comparando)
    const igual = _ocBuildRows({ lotes: [{ ...l, barricas: [b('1100305', 41, 50)] }] }, new Set(), new Map([['26056', 35]]), [], {});
    const h2 = pintarPlanilla({ filas: igual, u: U, modoDe: () => 'barril' });
    expect(h2).toContain('<td class="n">35.0</td>');
    expect(h2).not.toContain('50.0');
  });
  it('dosis a mano: se oculta el aviso de la vasija', () => {
    const filas = _ocBuildRows({ lotes: [l] }, new Set(), new Map(), [], {})
      .map(f => f.tipo === 'barrica' && f.barrica.num === '1100051' ? { ...f, manual: true, dosis: { mbk_g: 1, ml_solucion: 5 } } : f);
    const html = pintarPlanilla({ filas, u: U, modoDe: () => 'barril' });
    expect(html).not.toContain('sin análisis propio');
  });
  it('renglón de tanque con el SO2 del lote: tiene dosis en el cliente', () => {
    const tanque = { num: '', cap: null, vasija: 'T 201', litros_usados: 1000, so2_libre: 20, ph: 3.6, objetivo: 35, fuente: 'lote', aviso: null };
    const filas = _ocBuildRows({ lotes: [{ ...l, barricas: [...l.barricas, tanque] }] }, new Set(), new Map(), [], {});
    const t = filas.find(f => f.tipo === 'barrica' && f.barrica.vasija === 'T 201');
    expect(t.dosis.ml_solucion).toBeCloseTo((15 * 1000 * 1.5) / 55, 5);
  });
  it('fila de vasija con su SO2 y su objetivo; select bloqueado', () => {
    const filas = _ocBuildRows({ lotes: [l] }, new Set(), new Map(), [], {});
    const html = pintarPlanilla({ filas, u: U, modoDe: () => 'barril', avisosDe: () => [cartelPorVasija(l)] });
    expect(html).toContain('<td class="n">41.0</td>');
    expect(html).toMatch(/data-oc-modo="26056"[^>]*disabled/);
    expect(html).toContain('Barril por barril');
    expect(html).toContain('sin análisis propio');
  });
});

describe('papel barril por barril', () => {
  it('el papel no lleva rótulo de barril por barril (pedido del usuario: el aviso va solo en pantalla)', () => {
    const filas = _ocBuildRows({ lotes: [lotePV()] }, new Set(), new Map(), [], {});
    const g = filasPapelPorModo(filas, () => 'barril', { ...U, prod: 'Sol1030' });
    g.forEach((x, i) => { x.primero = i === 0; });
    const u = { ...U, prod: 'Sol1030' };
    expect(filaPapelLote({ numero: 1, fila: g[0] }, u)).not.toContain('BARRIL POR BARRIL');
    expect(filaPapelLote({ numero: 2, fila: g[1] }, u)).not.toContain('BARRIL POR BARRIL');
  });
});

describe('guardada y ejecución barril por barril', () => {
  let filas, o;
  beforeAll(() => {
    filas = _ocBuildRows({ lotes: [lotePV()] }, new Set(), new Map(), [], {});
    o = armarOrdenGuardada({ id: 'x', numero: 'B300', fecha: '2026-11-13', unidad: 'sol', filas, modos: new Map() });
  });
  it('guarda por_vasija, modo barril y el SO2 de cada vasija', () => {
    expect(o.lotes[0]).toMatchObject({ por_vasija: true, modo: 'barril' });
    expect(o.lotes[0].vasijas[1]).toMatchObject({ num: '1100305', so2_libre: 41, objetivo: 35 });
  });
  it('Ver la orden conserva el rótulo', () => {
    expect(filasDeGuardada(o)[0].lote.por_vasija).toBe(true);
  });
  it('ejecutar registra el detalle de las vasijas tildadas', () => {
    const { entradas } = entradasDeEjecucion(o, new Map([['26056', new Set([0, 1])]]), '2026-11-14');
    expect(entradas[0].correccion.vasijas.map(v => v.num)).toEqual(['1100923', '1100305']);
    expect(entradas[0].correccion.vasijas[0].so2_libre).toBe(6);
  });
  it('una vasija sin dosis tildada no tira el lote: se registran las demás', () => {
    const { entradas, hechos } = entradasDeEjecucion(o, new Map([['26056', new Set([0, 1, 2])]]), '2026-11-14');
    expect(entradas).toHaveLength(1);
    expect(entradas[0].correccion.vasijas.map(v => v.num)).toEqual(['1100923', '1100305']);
    expect(hechos[0].vasijas).toEqual(['1100923', '1100305']);
    expect(entradas[0].correccion.ml_exactos).toBeCloseTo(o.lotes[0].vasijas[0].ml + o.lotes[0].vasijas[1].ml, 6);
  });
  it('solo la vasija sin dosis tildada: el lote no se registra', () => {
    const { entradas } = entradasDeEjecucion(o, new Map([['26056', new Set([2])]]), '2026-11-14');
    expect(entradas).toEqual([]);
  });
  it('resumen del overlay: cuenta solo lo que se va a registrar', () => {
    expect(resumenEjecucion(o, new Map([['26056', new Set([2])]]))).toEqual({ nLotes: 0, mbk_g: 0, ml: 0 });
    const r = resumenEjecucion(o, new Map([['26056', new Set([0, 2])]]));
    expect(r.nLotes).toBe(1);
    expect(r.ml).toBeCloseTo(o.lotes[0].vasijas[0].ml, 6);
  });
  it('vasijasEjecutables: solo las que tienen dosis', () => {
    expect(vasijasEjecutables(o.lotes[0])).toEqual([0, 1]);
    expect(vasijasEjecutables({ por_vasija: false, vasijas: [{ mbk_g: null, ml: null }, { mbk_g: 1, ml: 2 }] })).toEqual([0, 1]);
  });
  it('"Ver la orden" redibuja la hoja sin rótulo de barril por barril', () => {
    const html = _papel(o);
    expect(html).toContain('26056');
    expect(html).not.toContain('BARRIL POR BARRIL');
  });
});
