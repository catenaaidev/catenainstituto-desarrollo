/* Tests del orden de la tabla de la Orden de correccion de SO2. */
import { describe, it, expect } from 'vitest';
import { ciclarOrdenOc, ordenarLotesOc, OC_ORDEN_INICIAL }
  from '../public/lotes/js/orden-correccion-orden.js';

const L = (lote, extra) => ({ lote, variedad: 'Malbec', ph: 3.6, so2_libre: 20,
  objetivo_libre: 40, barricas: [{ litros_usados: 225 }], ...extra });

describe('ciclarOrdenOc', () => {
  it('cicla ascendente, descendente y vuelve al orden normal (lote ▲)', () => {
    let st = { key: null, dir: 1 };
    st = ciclarOrdenOc(st, 'ph');  expect(st).toEqual({ key: 'ph', dir: 1 });
    st = ciclarOrdenOc(st, 'ph');  expect(st).toEqual({ key: 'ph', dir: -1 });
    st = ciclarOrdenOc(st, 'ph');  expect(st).toEqual({ key: 'lote', dir: 1 });
  });
  it('otra columna arranca ascendente', () => {
    expect(ciclarOrdenOc({ key: 'ph', dir: -1 }, 'so2')).toEqual({ key: 'so2', dir: 1 });
  });
});

describe('ordenarLotesOc', () => {
  const urg = [L('26247'), L('26005'), L('26133')];

  it('sin columna respeta el orden de urgencia del servidor', () => {
    expect(ordenarLotesOc(urg, { key: null, dir: 1 }).map(l => l.lote))
      .toEqual(['26247', '26005', '26133']);
  });

  it('no toca el array original', () => {
    ordenarLotesOc(urg, { key: 'lote', dir: 1 });
    expect(urg.map(l => l.lote)).toEqual(['26247', '26005', '26133']);
  });

  it('lote ordena como numero, en los dos sentidos', () => {
    const ls = [L('26247'), L('9'), L('26005')];
    expect(ordenarLotesOc(ls, { key: 'lote', dir: 1 }).map(l => l.lote)).toEqual(['9', '26005', '26247']);
    expect(ordenarLotesOc(ls, { key: 'lote', dir: -1 }).map(l => l.lote)).toEqual(['26247', '26005', '9']);
  });

  it('los vacios van al final en los dos sentidos', () => {
    const ls = [L('1', { ph: null }), L('2', { ph: 3.9 }), L('3', { ph: 3.5 })];
    expect(ordenarLotesOc(ls, { key: 'ph', dir: 1 }).map(l => l.lote)).toEqual(['3', '2', '1']);
    expect(ordenarLotesOc(ls, { key: 'ph', dir: -1 }).map(l => l.lote)).toEqual(['2', '3', '1']);
  });

  it('el objetivo es el vigente (el pisado a mano gana)', () => {
    const ls = [L('1', { objetivo_libre: 50 }), L('2', { objetivo_libre: 40 })];
    const pisado = l => (l.lote === '2' ? 60 : l.objetivo_libre);
    expect(ordenarLotesOc(ls, { key: 'objetivo', dir: 1 }, pisado).map(l => l.lote)).toEqual(['1', '2']);
  });

  it('la dosis pesa la diferencia por los litros de todas las barricas', () => {
    const ls = [
      L('chico', { so2_libre: 10, barricas: [{ litros_usados: 50 }] }),              // 30 x 50
      L('grande', { so2_libre: 30, barricas: [{ litros_usados: 225 }, { litros_usados: 225 }] }), // 10 x 450
    ];
    expect(ordenarLotesOc(ls, { key: 'dosis', dir: -1 }).map(l => l.lote)).toEqual(['grande', 'chico']);
  });

  it('empates conservan el orden de urgencia', () => {
    const ls = [L('a'), L('b'), L('c')];
    expect(ordenarLotesOc(ls, { key: 'variedad', dir: -1 }).map(l => l.lote)).toEqual(['a', 'b', 'c']);
  });
});

describe('OC_ORDEN_INICIAL', () => {
  it('abre por lote creciente, como se recorre la bodega al corregir', () => {
    const urg = [L('26277'), L('26003'), L('26150'), L('26126')];
    expect(ordenarLotesOc(urg, OC_ORDEN_INICIAL).map(l => l.lote))
      .toEqual(['26003', '26126', '26150', '26277']);
  });
});

describe('columnas de la planilla', () => {
  const lotes = [
    L('26150', { so2_libre: 30, barricas: [{ num: '1', litros_usados: 225 }] }),
    L('25009', { so2_libre: 10, barricas: [{ vasija: 'T 201', litros_usados: 900 }, { num: '2', litros_usados: 225 }] }),
    L('26003', { so2_libre: 20, barricas: [{ num: '3', litros_usados: 50 }] }),
  ];
  const ids = st => ordenarLotesOc(lotes, st).map(l => l.lote);
  it('año, cantidad, litros y diferencia', () => {
    expect(ids({ key: 'anio', dir: 1 })[0]).toBe('25009');
    expect(ids({ key: 'cant', dir: -1 })[0]).toBe('25009');
    expect(ids({ key: 'litros', dir: 1 })).toEqual(['26003', '26150', '25009']);
    expect(ids({ key: 'dif', dir: 1 })).toEqual(['26150', '26003', '25009']);
  });
  it('tipo: por la primera vasija del lote', () => {
    const t = [L('1', { barricas: [{ vasija: 'T 201' }] }), L('2', { barricas: [{ vasija: 'T 9' }, { num: '7' }] })];
    // El lote 2 tiene una barrica: su primera vasija es "Barrica", antes que "Tanque".
    expect(ordenarLotesOc(t, { key: 'tipo', dir: 1 }).map(l => l.lote)).toEqual(['2', '1']);
  });
  it('en Lote, el tercer clic vuelve a ▲', () => {
    expect(ciclarOrdenOc({ key: 'lote', dir: -1 }, 'lote')).toEqual({ key: 'lote', dir: 1 });
  });
});
