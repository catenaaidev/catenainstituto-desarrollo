/* Tests de ot-vasijas.js: los tanques del padron y las vasijas manuales de un
 * lote de la OT, y la suma de litros previstos. */
import { describe, it, expect } from 'vitest';
import { tanqueDelLote, sumaLitros, detalleSuma, nombreTanque, origenSinMapa } from '../public/lotes/js/ot-vasijas.js';

const PADRON = [{ num: '201', activa: true }, { num: '154', activa: true }, { num: '99', activa: false }];

describe('tanqueDelLote', () => {
  it('el tanque del padron nombrado en vasija_actual, con vasija_grande', () => {
    expect(tanqueDelLote({ vasija_actual: '4 barricas + T 201', vasija_grande: 4850 }, PADRON)).toEqual({ num: '201', litros: 4850 });
  });
  it('sin litros en tanque no hay tanque', () => {
    expect(tanqueDelLote({ vasija_actual: 'T 201', vasija_grande: 0 }, PADRON)).toBeNull();
  });
  it('ignora vasijas fuera del padron o inactivas, y las barricas', () => {
    expect(tanqueDelLote({ vasija_actual: 'T 99', vasija_grande: 100 }, PADRON)).toBeNull();
    expect(tanqueDelLote({ vasija_actual: 'Nave 2', vasija_grande: 100 }, PADRON)).toBeNull();
    expect(tanqueDelLote({ vasija_actual: '201 barricas', vasija_grande: 100 }, PADRON)).toBeNull();
  });
});

describe('sumaLitros', () => {
  const l = { barriles: [{ num: 'a', cap: 225 }, { num: 'b', cap: 225 }], tildados: new Set(['a']),
              tanques: [{ num: '201', litros: 4850 }], otras: [{ nombre: 'IBC', litros: 300 }, { nombre: 'x', litros: null }] };
  it('suma tildados + tanques + otras', () => { expect(sumaLitros(l)).toBe(5375); });
  it('el detalle lista las partes', () => { expect(detalleSuma(l)).toBe('225 + 4.850 + 300'); });
  it('sin tildados cuenta todos los barriles', () => { expect(sumaLitros({ barriles: l.barriles })).toBe(450); });
  it('sin nada da 0', () => { expect(sumaLitros({})).toBe(0); });
});

it('nombreTanque', () => { expect(nombreTanque('201')).toBe('T 201'); });

/* Al emitir, un lote que en Lotes tiene barricas pero el Mapa no conoce (o el
 * Mapa no respondio) arranca en modo "Cantidad de barricas" con las barricas
 * de la ficha: asi la OT dice cuantas se vacian y al confirmar se descuentan. */
describe('origenSinMapa', () => {
  it('sin barriles en el Mapa y solo barricas de 225 en la ficha: cantidad = cap225', () => {
    expect(origenSinMapa({ cap225: 17 }, [])).toEqual({ cantidad: 17 });
  });
  it('con barriles en el Mapa no se preajusta nada', () => {
    expect(origenSinMapa({ cap225: 17 }, [{ num: '1', cap: 225 }])).toBeNull();
  });
  it('con tanque u otros envases chicos no se puede resumir en barricas', () => {
    expect(origenSinMapa({ cap225: 17, vasija_grande: 3000 }, [])).toBeNull();
    expect(origenSinMapa({ cap225: 17, cap50: 1 }, [])).toBeNull();
    expect(origenSinMapa({ cap225: 0 }, [])).toBeNull();
    expect(origenSinMapa(null, [])).toBeNull();
  });
});

describe('tanquesDelLote (origen = vasija de crianza, 2026-11-13)', () => {
  it('todos los tanques de la vasija_actual; con uno solo lleva los litros', async () => {
    const { tanquesDelLote } = await import('../public/lotes/js/ot-vasijas.js');
    const P = [{ num: '205', activa: true }, { num: '174', activa: true }];
    expect(tanquesDelLote({ vasija_grande: 6050, vasija_actual: 'T 205' }, P)).toEqual([{ num: '205', litros: 6050 }]);
    expect(tanquesDelLote({ vasija_grande: 6050, vasija_actual: 'T 205 + T 174 + 3 barricas' }, P))
      .toEqual([{ num: '205', litros: null }, { num: '174', litros: null }]);
    expect(tanquesDelLote({ vasija_grande: 0, vasija_actual: 'T 205' }, P)).toEqual([]);
  });
});
