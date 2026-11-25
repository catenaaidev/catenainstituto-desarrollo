// ordenValido: el orden guardado en CIWFiltros solo se usa si tiene la forma { key, dir: 1|-1 }.
import { describe, it, expect } from 'vitest';
import { ordenValido } from '../public/lotes/js/orden-valido.js';

const D = { key: 'lote', dir: 1 };

describe('ordenValido', () => {
  it('un orden bien formado vuelve tal cual (copia, solo key y dir)', () => {
    expect(ordenValido({ key: 'fecha', dir: -1 }, D)).toEqual({ key: 'fecha', dir: -1 });
    expect(ordenValido({ key: 'fecha', dir: 1, otro: 'x' }, D)).toEqual({ key: 'fecha', dir: 1 });
    const o = { key: 'fecha', dir: 1 };
    expect(ordenValido(o, D)).not.toBe(o);
  });
  it('null / undefined -> el default', () => {
    expect(ordenValido(null, D)).toBe(D);
    expect(ordenValido(undefined, D)).toBe(D);
  });
  it('lo que no es objeto -> el default', () => {
    expect(ordenValido('lote', D)).toBe(D);
    expect(ordenValido(1, D)).toBe(D);
    expect(ordenValido(true, D)).toBe(D);
    expect(ordenValido([], D)).toBe(D);
  });
  it('sin key, o key que no es string -> el default', () => {
    expect(ordenValido({ dir: 1 }, D)).toBe(D);
    expect(ordenValido({ key: 3, dir: 1 }, D)).toBe(D);
    expect(ordenValido({ key: null, dir: -1 }, D)).toBe(D);
  });
  it('dir que no es 1 ni -1 -> el default', () => {
    expect(ordenValido({ key: 'fecha' }, D)).toBe(D);
    expect(ordenValido({ key: 'fecha', dir: 0 }, D)).toBe(D);
    expect(ordenValido({ key: 'fecha', dir: 2 }, D)).toBe(D);
    expect(ordenValido({ key: 'fecha', dir: '1' }, D)).toBe(D);
  });
});
