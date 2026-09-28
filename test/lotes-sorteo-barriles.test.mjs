/* Tests del dado de la Orden de muestras: un barril LLENO al azar por lote. */
import { describe, it, expect } from 'vitest';
import { barrilesLlenos, sortearBarril, sortearOrden, vecesPorLote,
         registrosDeImpresion } from '../public/lotes/js/sorteo-barriles.js';

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

describe('rotacion sin repetir', () => {
  const lote = { '26217': [B('101'), B('102'), B('103')] };
  const H = (barril, fecha = '2026-09-01') => ({ lote: '26217', barril, fecha, orden: '' });

  it('vecesPorLote cuenta por lote y barril', () => {
    const v = vecesPorLote([H('101'), H('101', '2026-09-08'), H('102'), { lote: '26300', barril: '9' }]);
    expect(v['26217'].get('101')).toBe(2);
    expect(v['26217'].get('102')).toBe(1);
    expect(v['26300'].get('9')).toBe(1);
  });

  it('sortea solo entre los que todavia no salieron', () => {
    for (let i = 0; i < 30; i++){
      const f = [{ lote: '26217' }];
      sortearOrden(f, lote, Math.random, [H('101'), H('102')]);
      expect(f[0].barril).toBe('103');
    }
  });

  it('cuando todos salieron, arranca otra vuelta', () => {
    const f = [{ lote: '26217' }];
    sortearOrden(f, lote, () => 0, [H('101'), H('102'), H('103')]);
    expect(f[0].barril).toBe('101');
  });

  it('un barril recien llenado entra antes que los ya muestreados', () => {
    const f = [{ lote: '26217' }];
    sortearOrden(f, { '26217': [B('101'), B('104')] }, () => 0, [H('101')]);
    expect(f[0].barril).toBe('104');
  });

  it('el mismo lote dos veces en la orden recibe barriles distintos', () => {
    const f = [{ lote: '26217' }, { lote: '26217' }];
    sortearOrden(f, lote, () => 0, []);
    expect(f[0].barril).not.toBe(f[1].barril);
  });

  it('recorre el lote entero en tantas ordenes como barriles tenga', () => {
    const hist = [];
    for (let d = 1; d <= 3; d++){
      const f = [{ lote: '26217' }];
      sortearOrden(f, lote, Math.random, hist);
      hist.push(...registrosDeImpresion(f, hist, '2026-09-0' + d, 'OT-' + d));
    }
    expect(hist.map(h => h.barril).sort()).toEqual(['101', '102', '103']);
  });
});

describe('registrosDeImpresion', () => {
  it('anota las filas con barril, con fecha y orden', () => {
    const r = registrosDeImpresion([{ lote: '26217', barril: '101' }, { lote: '26300', barril: '' }],
      [], '2026-09-28', ' OT-7 ');
    expect(r).toEqual([{ lote: '26217', barril: '101', fecha: '2026-09-28', orden: 'OT-7' }]);
  });

  it('reimprimir la misma orden no cuenta doble', () => {
    const hist = [{ lote: '26217', barril: '101', fecha: '2026-09-28', orden: 'OT-7' }];
    expect(registrosDeImpresion([{ lote: '26217', barril: '101' }], hist, '2026-09-28', 'OT-7')).toEqual([]);
  });
});
