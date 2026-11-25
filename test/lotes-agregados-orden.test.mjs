/* registroDeTarjetas: lo que se anota en Análisis al marcar ejecutada una
 * orden de otros agregados. Se arma AL IMPRIMIR con las vasijas congeladas de
 * cada tarjeta; las cuentas son las de totalLote/litrosReferencia (no se
 * duplica la fórmula acá). */
import { describe, it, expect } from 'vitest';
import { registroDeTarjetas, totalLote, litrosReferencia } from '../public/lotes/js/agregados.js';

const barriles = (n, litros) => Array.from({ length: n }, (_, i) => ({ tipo: 'barril', num: String(100 + i), litros }));

describe('registroDeTarjetas', () => {
  it('dos tarjetas del mismo lote quedan en una sola entrada con los ítems de las dos', () => {
    const vas = { 1: barriles(2, 225), 2: barriles(1, 225) };
    const tarjetas = [
      { id: 1, lote: '26150', vasija: '', items: [{ producto: 'TH2', cantidad: '10', unidad: 'g' }] },
      { id: 2, lote: '26150', vasija: '', items: [{ producto: 'Quitosano', cantidad: '5', unidad: 'g' }] },
    ];
    const r = registroDeTarjetas(tarjetas, t => vas[t.id], '2026-11-04');
    expect(r).toHaveLength(1);
    expect(r[0].lote).toBe('26150');
    expect(r[0].items.map(i => i.producto)).toEqual(['TH2', 'Quitosano']);
    // cada tarjeta usa SUS vasijas
    expect(r[0].items[0].vasijas).toBe(2);
    expect(r[0].items[1].vasijas).toBe(1);
  });

  it('3 vasijas de 225 y dosis 10 g: total 30, dosis por vasija 10, ref 225', () => {
    const vas = barriles(3, 225);
    const r = registroDeTarjetas([{ id: 7, lote: '26001', items: [{ producto: 'TH2', cantidad: '10', unidad: 'g' }] }],
      () => vas, '2026-11-04');
    const ref = litrosReferencia(vas);
    expect(r[0].items[0]).toEqual({ producto: 'TH2', unidad: 'g',
      cantidad: totalLote(10, vas, ref), dosis_vasija: 10, litros_ref: ref, vasijas: 3 });
    expect(r[0].items[0]).toMatchObject({ cantidad: 30, dosis_vasija: 10, litros_ref: 225, vasijas: 3 });
  });

  it('vasijas de otros litros: el total es el de totalLote', () => {
    const vas = [...barriles(2, 225), { tipo: 'barril', num: '9', litros: 300 }];
    const r = registroDeTarjetas([{ id: 1, lote: '1', items: [{ producto: 'X', cantidad: 9, unidad: 'g' }] }], () => vas, 'f');
    expect(r[0].items[0].cantidad).toBe(totalLote(9, vas, litrosReferencia(vas)));
  });

  it('el lote con espacios queda recortado (y junta con el mismo sin espacios)', () => {
    const r = registroDeTarjetas([
      { id: 1, lote: '  26150 ', items: [{ producto: 'TH2', cantidad: 1, unidad: 'g' }] },
      { id: 2, lote: '26150', items: [{ producto: 'Q', cantidad: 1, unidad: 'g' }] },
    ], () => barriles(1, 225), 'f');
    expect(r).toHaveLength(1);
    expect(r[0].lote).toBe('26150');
  });

  it('la fecha llega a cada entrada', () => {
    const r = registroDeTarjetas([
      { id: 1, lote: 'A', items: [{ producto: 'TH2', cantidad: 1, unidad: 'g' }] },
      { id: 2, lote: 'B', items: [{ producto: 'TH2', cantidad: 1, unidad: 'g' }] },
    ], () => barriles(1, 225), '2026-11-04');
    expect(r.map(e => [e.lote, e.fecha])).toEqual([['A', '2026-11-04'], ['B', '2026-11-04']]);
  });

  it('se saltean las tarjetas sin lote o sin productos, y los renglones vacíos', () => {
    const r = registroDeTarjetas([
      { id: 1, lote: '', items: [{ producto: 'TH2', cantidad: 1, unidad: 'g' }] },
      { id: 2, lote: 'B', items: [{ producto: '', cantidad: '', unidad: 'g' }] },
      { id: 3, lote: 'C', items: [{ producto: '', cantidad: '', unidad: 'g' }, { producto: 'TH2', cantidad: '2,5', unidad: 'g' }] },
    ], () => barriles(2, 225), 'f');
    expect(r).toHaveLength(1);
    expect(r[0].lote).toBe('C');
    expect(r[0].items).toHaveLength(1);
    expect(r[0].items[0]).toMatchObject({ cantidad: 5, dosis_vasija: 2.5 });
  });
});
