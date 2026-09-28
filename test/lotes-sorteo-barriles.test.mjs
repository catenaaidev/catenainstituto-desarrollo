/* Tests del dado de la Orden de muestras: un barril LLENO al azar por lote. */
import { describe, it, expect } from 'vitest';
import { barrilesLlenos, sortearBarril, sortearOrden } from '../public/lotes/js/sorteo-barriles.js';

const B = (num, estado = 'LLENO') => ({ num, estado });

describe('barrilesLlenos', () => {
  it('descarta vacios y barriles sin numero', () => {
    const r = barrilesLlenos([B('101'), B('102', 'VACIO'), B(''), B('103', 'lleno')]);
    expect(r.map(b => b.num)).toEqual(['101', '103']);
  });
  it('tolera null', () => {
    expect(barrilesLlenos(undefined)).toEqual([]);
  });
});

describe('sortearBarril', () => {
  const lote = [B('101'), B('102'), B('103'), B('104', 'VACIO')];

  it('elige segun el azar, solo entre los llenos', () => {
    expect(sortearBarril(lote, '', () => 0)).toBe('101');
    expect(sortearBarril(lote, '', () => 0.5)).toBe('102');
    expect(sortearBarril(lote, '', () => 0.9999)).toBe('103');
  });

  it('nunca devuelve un vacio', () => {
    for (let i = 0; i < 50; i++) expect(sortearBarril(lote)).not.toBe('104');
  });

  it('volver a tirar no repite el barril que ya estaba', () => {
    expect(sortearBarril(lote, '101', () => 0)).toBe('102');
  });

  it('si hay uno solo lo repite', () => {
    expect(sortearBarril([B('101')], '101', () => 0)).toBe('101');
  });

  it('sin barriles llenos devuelve vacio', () => {
    expect(sortearBarril([B('101', 'VACIO')])).toBe('');
    expect(sortearBarril([])).toBe('');
  });
});

describe('sortearOrden', () => {
  it('pone un barril por fila y avisa los lotes sin barriles', () => {
    const filas = [{ lote: '26217' }, { lote: '26300' }, { lote: '' }];
    const { sinBarril } = sortearOrden(filas,
      { '26217': [B('101'), B('102')], '26300': [B('201', 'VACIO')] }, () => 0);
    expect(filas[0].barril).toBe('101');
    expect(filas[1].barril).toBe('');
    expect(filas[2].barril).toBeUndefined();
    expect(sinBarril).toEqual(['26300']);
  });

  it('un lote que no vino en la respuesta queda sin barril', () => {
    const filas = [{ lote: '26999', barril: '555' }];
    expect(sortearOrden(filas, {}).sinBarril).toEqual(['26999']);
    expect(filas[0].barril).toBe('');
  });
});
