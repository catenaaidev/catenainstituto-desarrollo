/* Tests de la vista Planilla de la Orden de correccion de SO2. */
import { describe, it, expect } from 'vitest';
import { tipoVasija, bloquesPlanilla, pintarPlanilla, filtrarVasijas, ordenarVasijas, valorVasija }
  from '../public/lotes/js/orden-correccion-planilla.js';

const U = { col: 'mL SOL.', suf: 'mL', dec: 1, de: d => d.ml_solucion };
const lote = (n, extra) => ({ lote: n, variedad: 'Malbec', ph: 3.6, so2_libre: 20, objetivo_libre: 40, barricas: [], ...extra });
const filas = [
  { tipo: 'lote', lote: lote('26005'), objetivo: 40, diferencia: 20 },
  { tipo: 'barrica', lote: lote('26005'), barrica: { num: '1100001', cap: 225, litros_usados: 225 }, dosis: { ml_solucion: 100, mbk_g: 11 }, clave: 'n:1100001', manual: false },
  { tipo: 'barrica', lote: lote('26005'), barrica: { num: '50099', cap: 50, litros_usados: 50 }, dosis: { ml_solucion: 30, mbk_g: 3.3 }, clave: 'n:50099', manual: true },
  { tipo: 'lote', lote: lote('26150'), objetivo: 35, diferencia: 15 },
  { tipo: 'barrica', lote: lote('26150'), barrica: { num: '', vasija: 'T 201', litros_usados: 900 }, dosis: { ml_solucion: 368, mbk_g: 40 }, clave: 'i:0', manual: false },
];

describe('tipoVasija', () => {
  it('barrica, T50, tanque y sin ubicar', () => {
    expect(tipoVasija({ num: '12', cap: 225 })).toEqual({ tipo: 'Barrica', vasija: 'Barrica 12' });
    expect(tipoVasija({ num: '9', cap: 50 }).tipo).toBe('T50');
    expect(tipoVasija({ vasija: 'T 201' })).toEqual({ tipo: 'Tanque', vasija: 'T 201' });
    expect(tipoVasija({}).tipo).toBe('Sin ubicar');
  });
});

describe('bloquesPlanilla', () => {
  it('una entrada por lote con sus vasijas', () => {
    const b = bloquesPlanilla(filas);
    expect(b.map(x => x.lote.lote)).toEqual(['26005', '26150']);
    expect(b[0].vasijas.map(v => v.clave)).toEqual(['n:1100001', 'n:50099']);
    expect(b[0].vasijas[1].manual).toBe(true);
  });
});

describe('pintarPlanilla', () => {
  const html = pintarPlanilla({ filas, u: U, organico: n => n === '26005',
    modoDe: l => l.lote === '26150' ? 'barril' : 'generica',
    fuera: [lote('26277', { barricas: [{ num: '1', cap: 225, litros_usados: 225 }] })],
    motivoFuera: () => 'sacado a mano', cab: { nro: 'B001', fecha: '2026-11-11' } });

  it('una fila por vasija, con la dosis editable por vasija', () => {
    expect(html.match(/<tr class="ocp-v[" ]/g)).toHaveLength(3);
    expect(html).toContain('data-oc-vdosis="26005" data-oc-clave="n:50099"');
  });
  it('orgánico en verde, convencional sin color', () => {
    expect(html).toContain('<span class="ocp-lote ocp-org" title="Orgánico">26005</span>');
    expect(html).toContain('<span class="ocp-lote">26150</span>');
  });
  it('conserva los controles por lote: incluir, objetivo y Genérica / Por barril', () => {
    expect(html).toContain('data-oc-lote="26005"');
    expect(html).toContain('data-oc-obj="26150"');
    expect(html).toMatch(/data-oc-modo="26150"[^]*?<option value="barril" selected>/);
  });
  it('la dosis a mano se marca y trae ↺', () => {
    expect(html).toContain('data-oc-vdosis-reset="26005" data-oc-clave="n:50099"');
  });
  it('totales de litros y dosis', () => {
    expect(html).toMatch(/Total a corregir · 2 lotes · 3 vasijas<\/td><td class="n">1175<\/td>/);
    expect(html).toContain('498 mL');
  });
  it('los de afuera van grises al final con su casilla destildada', () => {
    expect(html).toMatch(/ocp-fuera"><td><label class="ocp-incl"><input type="checkbox" data-oc-lote="26277"/);
    expect(html.indexOf('ocp-fuera')).toBeGreaterThan(html.indexOf('ocp-total'));
  });
});

describe('filtrarVasijas', () => {
  it('saca las vasijas que no pasan, rehace el total y saca el lote vacío', () => {
    const conTot = filas.map(f => f.tipo === 'lote' ? { ...f, ml_total: 999, mbk_total_g: 999 } : f);
    const r = filtrarVasijas(conTot, f => valorVasija('tipo', f, U) === 'Barrica');
    expect(r.filter(f => f.tipo === 'lote').map(f => f.lote.lote)).toEqual(['26005']);
    expect(r.filter(f => f.tipo === 'barrica')).toHaveLength(1);
    expect(r[0].ml_total).toBe(100);
  });
});

describe('ordenarVasijas', () => {
  it('ordena las vasijas dentro de cada lote por la columna de vasija', () => {
    const r = ordenarVasijas(filas, { key: 'litros', dir: 1 }, U);
    expect(r.filter(f => f.tipo === 'barrica').map(f => f.clave)).toEqual(['n:50099', 'n:1100001', 'i:0']);
    expect(r.map(f => f.tipo)).toEqual(['lote', 'barrica', 'barrica', 'lote', 'barrica']);
  });
  it('con una columna de lote no toca nada', () => {
    expect(ordenarVasijas(filas, { key: 'so2', dir: -1 }, U)).toEqual(filas);
  });
});
