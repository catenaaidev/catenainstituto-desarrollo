import { describe, it, expect } from 'vitest';
import { anioDeLote, leerAnios, enAnios, recortarPorAnios } from '../src/lotes/motores/anios';

describe('anioDeLote', () => {
  it('saca el año de los dos primeros dígitos de un lote de 5', () => {
    expect(anioDeLote(25137)).toBe(2025);
    expect(anioDeLote('26001')).toBe(2026);
    expect(anioDeLote(' 26217 ')).toBe(2026);
  });
  it('cualquier otro formato no tiene año', () => {
    for (const v of ['', null, undefined, '2621', '262170', '26217A', 'T50', 26.5]) {
      expect(anioDeLote(v)).toBeNull();
    }
  });
});

describe('leerAnios', () => {
  it('lee una lista separada por comas', () => {
    expect([...leerAnios('2025,2026')!].sort()).toEqual([2025, 2026]);
  });
  it('sin parámetro o sin años válidos no filtra', () => {
    expect(leerAnios(null)).toBeNull();
    expect(leerAnios('')).toBeNull();
    expect(leerAnios('abc,1999')).toBeNull();
  });
});

describe('enAnios', () => {
  const s = new Set([2026]);
  it('deja pasar los del año y los sin año', () => {
    expect(enAnios('26001', s)).toBe(true);
    expect(enAnios('T50', s)).toBe(true);
    expect(enAnios('25001', s)).toBe(false);
  });
  it('sin filtro pasa todo', () => expect(enAnios('25001', null)).toBe(true));
});

describe('recortarPorAnios', () => {
  const datos = {
    meta: { version: 3 },
    lotes: [{ lote: 25001 }, { lote: 26001 }],
    analisis: [{ lote: '25001' }, { lote: '26001' }, { lote: '26001' }],
    movimientos: [{ lote: '25001', tipo: 'traspaso', lote_destino: '26001' }],
  };
  it('recorta lotes y analisis pero no movimientos', () => {
    const r = recortarPorAnios(datos, new Set([2026]));
    expect(r.lotes).toEqual([{ lote: 26001 }]);
    expect(r.analisis).toHaveLength(2);
    expect(r.movimientos).toBe(datos.movimientos);
    expect(r.meta).toBe(datos.meta);
  });
  it('no muta el original', () => {
    recortarPorAnios(datos, new Set([2026]));
    expect(datos.lotes).toHaveLength(2);
  });
  it('sin filtro devuelve el mismo objeto', () => {
    expect(recortarPorAnios(datos, null)).toBe(datos);
  });
});
