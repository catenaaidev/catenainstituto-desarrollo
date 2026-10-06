/**
 * El Registro del operario: buscar, filtrar y agrupar las órdenes del escáner.
 *
 * Va en .mjs por lo mismo que barriles-inventario.test.mjs: importa un .js
 * clásico que se cuelga de globalThis y no tiene tipos.
 * Diseño: docs/superpowers/specs/2026-10-06-barriles-operario-registro-design.md
 */

import { describe, it, expect } from 'vitest';
import '../public/barriles/js/registro.js';

const { interpretarBusqueda, mesDeOrden, mesesConOrdenes, filtrarOrdenes, agruparPorMes,
        historiaDeBarril, resumenDeLote, nombreMes, fechaCorta } = globalThis;

// Tres órdenes del Excel "Datos Ori" (14/01/26) y dos de enero 12 importadas con `mes`.
const ORD = [
  { id: 'a', fecha: '2026-01-12', ot: '700', lote: '25265', tipo: 'vaciado', codigos: ['50157'], mes: '2026-01' },
  { id: 'b', fecha: '2025-12-03', ot: '650', lote: '25242', tipo: 'llenado', codigos: ['2180036', '2181088'] },
  { id: 'c', fecha: '2026-01-14', ot: '812', lote: '25242', tipo: 'vaciado', codigos: ['2180036', '2181088', '2150485'] },
  { id: 'd', fecha: '2026-01-14', ot: '813', lote: '25306', tipo: 'llenado', codigos: ['1250341', '25242'] },
  { id: 'e', fecha: '2026-01-14', ot: '', lote: 'VERMUT', tipo: 'llenado_vaciado', codigos: ['1260018'] },
];

describe('interpretarBusqueda', () => {
  it('vacío', () => {
    expect(interpretarBusqueda('   ', ORD)).toEqual({ tipo: 'vacio', valor: '' });
  });
  it('7 dígitos es barril', () => {
    expect(interpretarBusqueda(' 2180036 ', ORD)).toEqual({ tipo: 'barril', valor: '2180036' });
  });
  it('5 dígitos que es un lote cargado es lote', () => {
    expect(interpretarBusqueda('25306', ORD)).toEqual({ tipo: 'lote', valor: '25306' });
  });
  it('5 dígitos que es lote y también barril: gana lote y ofrece el barril', () => {
    expect(interpretarBusqueda('25242', ORD)).toEqual({ tipo: 'lote', valor: '25242', alternativa: 'barril' });
  });
  it('5 dígitos que no es lote es barril (los barriles 50157 existen)', () => {
    expect(interpretarBusqueda('50157', ORD)).toEqual({ tipo: 'barril', valor: '50157' });
  });
  it('"barril X" fuerza barril', () => {
    expect(interpretarBusqueda('barril 25242', ORD)).toEqual({ tipo: 'barril', valor: '25242' });
    expect(interpretarBusqueda('B25242', ORD)).toEqual({ tipo: 'barril', valor: '25242' });
  });
  it('"b" seguido de letras no es barril (lote BLEND)', () => {
    expect(interpretarBusqueda('blend', [{ lote: 'BLEND', codigos: [] }])).toEqual({ tipo: 'lote', valor: 'blend' });
  });
  it('"lote X" fuerza lote', () => {
    expect(interpretarBusqueda('lote 99999', ORD)).toEqual({ tipo: 'lote', valor: '99999' });
  });
  it('OT en sus formas', () => {
    for (const t of ['OT 812', 'ot812', 'ot: 812', 'OT-812'])
      expect(interpretarBusqueda(t, ORD)).toEqual({ tipo: 'ot', valor: '812' });
  });
  it('fecha ISO', () => {
    expect(interpretarBusqueda('2026-01-14', ORD)).toEqual({ tipo: 'fecha', valor: '2026-01-14' });
  });
  it('fecha d/m sin año toma el año más reciente con órdenes ese día', () => {
    expect(interpretarBusqueda('14/1', ORD)).toEqual({ tipo: 'fecha', valor: '2026-01-14' });
    expect(interpretarBusqueda('3/12', ORD)).toEqual({ tipo: 'fecha', valor: '2025-12-03' });
  });
  it('fecha d/m sin órdenes ese día usa el año más reciente cargado', () => {
    expect(interpretarBusqueda('1/2', ORD)).toEqual({ tipo: 'fecha', valor: '2026-02-01' });
  });
  it('fecha con año de 2 y 4 dígitos', () => {
    expect(interpretarBusqueda('14/01/26', ORD)).toEqual({ tipo: 'fecha', valor: '2026-01-14' });
    expect(interpretarBusqueda('14-1-2025', ORD)).toEqual({ tipo: 'fecha', valor: '2025-01-14' });
  });
  it('día o mes imposibles no son fecha', () => {
    expect(interpretarBusqueda('32/1', ORD).tipo).toBe('texto');
    expect(interpretarBusqueda('1/13', ORD).tipo).toBe('texto');
  });
  it('lote con letras, sin importar mayúsculas', () => {
    expect(interpretarBusqueda('vermut', ORD)).toEqual({ tipo: 'lote', valor: 'vermut' });
  });
  it('dígitos cortos son texto libre', () => {
    expect(interpretarBusqueda('218', ORD)).toEqual({ tipo: 'texto', valor: '218' });
  });
});

describe('mesDeOrden y mesesConOrdenes', () => {
  it('el campo mes manda sobre la fecha', () => {
    expect(mesDeOrden({ fecha: '2026-02-01', mes: '2026-01' })).toBe('2026-01');
    expect(mesDeOrden({ fecha: '2026-02-01' })).toBe('2026-02');
    expect(mesDeOrden({ fecha: '' })).toBe('');
  });
  it('meses sin repetir, más nuevo primero', () => {
    expect(mesesConOrdenes(ORD)).toEqual(['2026-01', '2025-12']);
  });
});

describe('filtrarOrdenes', () => {
  const ids = arr => arr.map(o => o.id);
  it('sin búsqueda filtra por mes', () => {
    expect(ids(filtrarOrdenes(ORD, { tipo: 'vacio', valor: '' }, '2025-12'))).toEqual(['b']);
    expect(ids(filtrarOrdenes(ORD, { tipo: 'vacio', valor: '' }, ''))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('barril busca en todos los meses e ignora el mes', () => {
    expect(ids(filtrarOrdenes(ORD, { tipo: 'barril', valor: '2180036' }, '2025-12'))).toEqual(['b', 'c']);
  });
  it('barril es coincidencia exacta', () => {
    expect(ids(filtrarOrdenes(ORD, { tipo: 'barril', valor: '218003' }, ''))).toEqual([]);
  });
  it('lote sin importar mayúsculas', () => {
    expect(ids(filtrarOrdenes(ORD, { tipo: 'lote', valor: 'vermut' }, ''))).toEqual(['e']);
    expect(ids(filtrarOrdenes(ORD, { tipo: 'lote', valor: '25242' }, ''))).toEqual(['b', 'c']);
  });
  it('OT y fecha', () => {
    expect(ids(filtrarOrdenes(ORD, { tipo: 'ot', valor: '812' }, ''))).toEqual(['c']);
    expect(ids(filtrarOrdenes(ORD, { tipo: 'fecha', valor: '2026-01-14' }, ''))).toEqual(['c', 'd', 'e']);
  });
  it('texto libre busca en lote, OT y códigos', () => {
    expect(ids(filtrarOrdenes(ORD, { tipo: 'texto', valor: '218' }, ''))).toEqual(['b', 'c']);
    // '81' está en la OT 812 y 813, y también dentro del código 2181088
    expect(ids(filtrarOrdenes(ORD, { tipo: 'texto', valor: '81' }, ''))).toEqual(['b', 'c', 'd']);
  });
});

describe('agruparPorMes', () => {
  it('meses y órdenes de más nuevo a más viejo; mismo día, la última cargada primero', () => {
    const g = agruparPorMes(ORD);
    expect(g.map(x => x.mes)).toEqual(['2026-01', '2025-12']);
    expect(g[0].ordenes.map(o => o.id)).toEqual(['e', 'd', 'c', 'a']);
  });
  it('las órdenes sin fecha ni mes van al final, en un grupo con mes vacío', () => {
    const g = agruparPorMes([{ id: 'x', fecha: '' }, ORD[1]]);
    expect(g.map(x => x.mes)).toEqual(['2025-12', '']);
  });
});

describe('historiaDeBarril', () => {
  it('cada orden donde aparece, la más vieja primero', () => {
    expect(historiaDeBarril('2180036', ORD)).toEqual([
      { id: 'b', fecha: '2025-12-03', tipo: 'llenado', lote: '25242', ot: '650' },
      { id: 'c', fecha: '2026-01-14', tipo: 'vaciado', lote: '25242', ot: '812' },
    ]);
  });
  it('sin órdenes, lista vacía', () => {
    expect(historiaDeBarril('9999999', ORD)).toEqual([]);
  });
});

describe('resumenDeLote', () => {
  it('cuenta barriles sin repetir por operación y la última fecha', () => {
    expect(resumenDeLote('25242', ORD)).toEqual({ ordenes: 2, llenados: 2, vaciados: 3, ultimaFecha: '2026-01-14' });
  });
  it('llenado y vaciado cuenta para los dos', () => {
    expect(resumenDeLote('vermut', ORD)).toEqual({ ordenes: 1, llenados: 1, vaciados: 1, ultimaFecha: '2026-01-14' });
  });
});

describe('nombreMes y fechaCorta', () => {
  it('formatos', () => {
    expect(nombreMes('2026-01')).toBe('Enero 2026');
    expect(nombreMes('2025-12')).toBe('Diciembre 2025');
    expect(nombreMes('raro')).toBe('raro');
    expect(fechaCorta('2026-01-14')).toBe('14/01/26');
    expect(fechaCorta('')).toBe('');
  });
});
