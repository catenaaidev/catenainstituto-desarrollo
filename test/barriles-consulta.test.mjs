/**
 * La consulta de inventario del operario (solo lectura) y la corrección única de
 * las 19 fechas mal importadas de la Planilla scaner.
 *
 * Va en .mjs por lo mismo que barriles-inventario.test.mjs: importa scripts
 * clásicos que se cuelgan de globalThis y no tienen tipos.
 */

import { describe, it, expect } from 'vitest';
import '../public/barriles/js/consulta-inv.js';
import '../public/barriles/js/correccion-fechas.js';
import '../public/barriles/js/registro.js';

const { filtrarInventario, contarEstados, resumenPorLote,
        CORRECCION_FECHAS_2026_10, planCorreccionFechas, otLimpia } = globalThis;

const fila = (num, estado, lote = '', extra = {}) =>
  ({ num: String(num), estado, lote, cap: 225, litros: estado === 'VACIO' ? 0 : 225, marca: 'NADALIE', cosecha: '', ...extra });

const INV = [
  fila('2180036', 'LLENO', '26277', { cosecha: '2026', fecha: '2026-08-24' }),
  fila('2180002', 'LLENO', '26277', { cosecha: '2026', marca: 'SEGUIN MOREAU' }),
  fila('2180741', 'MERMO', '26277', { cosecha: '2026', litros: 180 }),
  fila('1110778', 'VACIO'),
  fila('458', 'LLENO', 'PRENSA CRIOLLA', { cap: 500, litros: 400, marca: 'TANQUE INOX 500' }),
  fila('50116', 'LLENO', '25832-T50', { cap: 50, litros: 50, marca: 'TANQUE 50' }),
  fila('50117', 'VACIO', '', { cap: 50, litros: 0, marca: 'TANQUE 50' }),
];
const nums = arr => arr.map(r => r.num);

describe('filtrarInventario', () => {
  it('sin filtros devuelve todo', () => {
    expect(filtrarInventario(INV, {})).toHaveLength(INV.length);
  });
  it('por estado', () => {
    expect(nums(filtrarInventario(INV, { estado: 'MERMO' }))).toEqual(['2180741']);
    expect(nums(filtrarInventario(INV, { estado: 'VACIO' }))).toEqual(['1110778', '50117']);
  });
  it('por tipo: tanques de 50 L y barricas y vasijas', () => {
    expect(nums(filtrarInventario(INV, { tipo: 'tanque50' }))).toEqual(['50116', '50117']);
    expect(nums(filtrarInventario(INV, { tipo: 'barrica' }))).not.toContain('50116');
  });
  it('el texto busca en número, lote y marca, sin mayúsculas', () => {
    expect(nums(filtrarInventario(INV, { texto: 'seguin' }))).toEqual(['2180002']);
    expect(nums(filtrarInventario(INV, { texto: 'criolla' }))).toEqual(['458']);
    expect(nums(filtrarInventario(INV, { texto: '21807' }))).toEqual(['2180741']);
  });
  it('sin acentos: "francois" encuentra "FRANÇOIS FRÈRES"', () => {
    const inv = [...INV, fila('7', 'VACIO', '', { marca: 'FRANÇOIS FRÈRES' })];
    expect(nums(filtrarInventario(inv, { texto: 'francois freres' }))).toEqual(['7']);
  });
  it('un lote exacto trae solo ese lote (no los que lo contienen)', () => {
    const inv = [...INV, fila('9', 'LLENO', '262770')];
    expect(nums(filtrarInventario(inv, { texto: '26277' }))).toEqual(['2180036', '2180002', '2180741']);
  });
  it('combina texto y estado', () => {
    expect(nums(filtrarInventario(INV, { texto: '26277', estado: 'LLENO' }))).toEqual(['2180036', '2180002']);
  });
  it('no modifica la lista original', () => {
    const copia = JSON.stringify(INV);
    filtrarInventario(INV, { texto: 'x', estado: 'LLENO' });
    expect(JSON.stringify(INV)).toBe(copia);
  });
});

describe('contarEstados', () => {
  it('cuenta por estado y total', () => {
    expect(contarEstados(INV)).toEqual({ total: 7, LLENO: 4, MERMO: 1, VACIO: 2 });
  });
  it('estado vacío o raro cuenta solo en el total', () => {
    expect(contarEstados([fila('1', '')])).toEqual({ total: 1, LLENO: 0, MERMO: 0, VACIO: 0 });
  });
});

describe('resumenPorLote', () => {
  it('un renglón por lote con llenos, mermos, litros y cosecha; sin vacíos', () => {
    const r = resumenPorLote(INV);
    expect(r.map(x => x.lote)).toEqual(['26277', '25832-T50', 'PRENSA CRIOLLA']);
    expect(r[0]).toEqual({ lote: '26277', cosecha: '2026', llenos: 2, mermos: 1, vasijas: 3, litros: 630 });
  });
  it('ordena por cantidad de vasijas y después por lote', () => {
    const r = resumenPorLote([fila('1', 'LLENO', 'B'), fila('2', 'LLENO', 'A'), fila('3', 'LLENO', 'B')]);
    expect(r.map(x => x.lote)).toEqual(['B', 'A']);
  });
});

describe('planCorreccionFechas', () => {
  it('la lista tiene las 19 correcciones revisadas con el usuario', () => {
    expect(CORRECCION_FECHAS_2026_10).toHaveLength(19);
    for (const c of CORRECCION_FECHAS_2026_10) {
      expect(c.id).toMatch(/^imp\d{4}$/);
      expect(c.a <= '2026-10-06').toBe(true);
      expect(c.de).not.toBe(c.a);
    }
  });
  it('propone solo las que siguen con la fecha mala', () => {
    const esc = [
      { id: 'imp0108', fecha: '2026-11-01', lote: '24362' },
      { id: 'imp0110', fecha: '2026-02-11', lote: '25312' },   // ya corregida a mano
      { id: 'e123', fecha: '2026-11-01' },                      // no es de la lista
    ];
    expect(planCorreccionFechas(esc)).toEqual([{ id: 'imp0108', de: '2026-11-01', a: '2026-02-11', lote: '24362' }]);
  });
  it('sin pendientes, lista vacía', () => {
    expect(planCorreccionFechas([])).toEqual([]);
  });
});

describe('otLimpia con OT que empiezan con letra', () => {
  it('"OT-D024", "ot  D026" y "OT d025" pierden el prefijo', () => {
    expect(otLimpia('OT-D024')).toBe('D024');
    expect(otLimpia('ot  D026')).toBe('D026');
    expect(otLimpia('OT d025')).toBe('d025');
    expect(otLimpia('OT OT-91')).toBe('91');
  });
  it('una palabra que empieza con OT no se toca', () => {
    expect(otLimpia('OTOÑO')).toBe('OTOÑO');
  });
});
