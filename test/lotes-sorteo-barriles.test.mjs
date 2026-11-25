/* Tests del dado de la Orden de muestras: un barril LLENO al azar por lote. */
import { describe, it, expect } from 'vitest';
import { barrilesLlenos, sortearBarril, sortearOrden, vecesPorLote,
         registrosDeImpresion, opcionesBarril, sortearFila,
         avisoBarril, expandirPorBarril, colapsarPorLote } from '../public/lotes/js/sorteo-barriles.js';

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

describe('opcionesBarril (desplegable de la fila)', () => {
  it('solo los llenos, primero los menos muestreados y despues por numero', () => {
    const veces = new Map([['101', 2], ['103', 1]]);
    const r = opcionesBarril([B('103'), B('101'), B('104', 'VACIO'), B('20'), B('102')], veces);
    expect(r).toEqual([
      { num: '20', veces: 0 }, { num: '102', veces: 0 }, { num: '103', veces: 1 }, { num: '101', veces: 2 },
    ]);
  });
  it('sin barriles devuelve lista vacia', () => {
    expect(opcionesBarril(undefined)).toEqual([]);
  });
});

describe('sortearFila (el dado de una sola fila)', () => {
  const porLote = { '26217': [B('101'), B('102'), B('103')] };

  it('sortea solo esa fila y no toca las demas', () => {
    const f = [{ lote: '26217', barril: '' }, { lote: '26300', barril: '9' }];
    expect(sortearFila(f, 0, porLote, () => 0, [])).toBe('101');
    expect(f[0].barril).toBe('101');
    expect(f[1].barril).toBe('9');
  });

  it('no repite el barril que ya tiene otra fila del mismo lote', () => {
    const f = [{ lote: '26217', barril: '101' }, { lote: '26217', barril: '' }];
    sortearFila(f, 1, porLote, () => 0, []);
    expect(f[1].barril).toBe('102');
  });

  it('respeta la rotacion del historial', () => {
    const f = [{ lote: '26217', barril: '' }];
    const hist = [{ lote: '26217', barril: '101' }, { lote: '26217', barril: '102' }];
    sortearFila(f, 0, porLote, () => 0, hist);
    expect(f[0].barril).toBe('103');
  });

  it('volver a tirar cambia el barril', () => {
    const f = [{ lote: '26217', barril: '101' }];
    sortearFila(f, 0, porLote, () => 0, []);
    expect(f[0].barril).toBe('102');
  });

  it('lote sin barriles llenos deja la fila vacia', () => {
    const f = [{ lote: '26999', barril: '5' }];
    expect(sortearFila(f, 0, {}, () => 0, [])).toBe('');
    expect(f[0].barril).toBe('');
  });
});

describe('avisoBarril (celda amarilla)', () => {
  const lista = [B('101'), B('102', 'VACIO')];
  it('sin aviso si es un lleno del lote, si esta vacia o si todavia no se consulto el Mapa', () => {
    expect(avisoBarril('26217', '101', lista)).toBe('');
    expect(avisoBarril('26217', '', lista)).toBe('');
    expect(avisoBarril('26217', '555', undefined)).toBe('');
  });
  it('avisa si el barril figura vacio', () => {
    expect(avisoBarril('26217', '102', lista)).toMatch(/vac[ií]o/i);
  });
  it('avisa si el barril no es de ese lote', () => {
    expect(avisoBarril('26217', '555', lista)).toMatch(/no figura.*26217/);
  });
});

describe('expandirPorBarril (barriles especificos: todos los llenos)', () => {
  const porLote = { '26217': [B('103'), B('101'), B('102', 'VACIO')], '26300': [] };
  it('una fila por barril lleno, en orden de numero, copiando los datos del lote', () => {
    const filas = [{ lote: '26217', variedad: 'Malbec', cantidad: 2, barril: '' }, { lote: '26300', variedad: 'Syrah', barril: '' }, { lote: '' }];
    const r = expandirPorBarril(filas, porLote);
    expect(r.map(f => [f.lote, f.barril])).toEqual([['26217', '101'], ['26217', '103'], ['26300', ''], ['', undefined]]);
    expect(r[1]).toMatchObject({ variedad: 'Malbec', cantidad: 2 });
    expect(r[0]).not.toBe(r[1]);
    expect(filas[0].barril).toBe('');   // no muta
  });
  it('un lote repetido en la orden no se duplica', () => {
    const r = expandirPorBarril([{ lote: '26217' }, { lote: '26217' }], porLote);
    expect(r.map(f => f.barril)).toEqual(['101', '103']);
  });
  it('un lote que el Mapa no devolvio queda como estaba', () => {
    const r = expandirPorBarril([{ lote: '26999', barril: '5' }], porLote);
    expect(r).toEqual([{ lote: '26999', barril: '5' }]);
  });
});

describe('colapsarPorLote (volver a la orden generica)', () => {
  it('una fila por lote, sin barril; las filas sin lote quedan', () => {
    const r = colapsarPorLote([{ lote: '26217', barril: '101' }, { lote: '26217', barril: '103' }, { lote: '' }, { lote: '26300', barril: '' }]);
    expect(r).toEqual([{ lote: '26217', barril: '' }, { lote: '' }, { lote: '26300', barril: '' }]);
  });
});

describe('expandirPorBarril con soloLotes', () => {
  it('no revive barriles borrados de un lote ya expandido; expande solo el que entra', () => {
    const porLote = { '26217': [B('101'), B('103')], '26400': [B('7'), B('8')] };
    const filas = [{ lote: '26217', barril: '103', porBarril: true }, { lote: '26400', barril: '' }];
    const r = expandirPorBarril(filas, porLote, new Set(['26400']));
    expect(r.map(f => [f.lote, f.barril])).toEqual([['26217', '103'], ['26400', '7'], ['26400', '8']]);
    expect(r[1].porBarril).toBe(true);
  });
  it('colapsar saca la marca porBarril', () => {
    expect(colapsarPorLote([{ lote: '1', barril: '7', porBarril: true }])).toEqual([{ lote: '1', barril: '' }]);
  });
});
