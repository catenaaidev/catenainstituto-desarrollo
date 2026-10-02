import { describe, it, expect } from 'vitest';
import { PADRON_INICIAL, buscarVasija, normalizarNumVasija } from '../public/lotes/js/vasijas-padron.js';
import { TABLAS_CUBICACION } from '../public/lotes/js/cubicacion-tablas.js';

describe('PADRON_INICIAL', () => {
  it('son las 78 vasijas del Excel, sin numeros repetidos', () => {
    expect(PADRON_INICIAL).toHaveLength(78);
    expect(new Set(PADRON_INICIAL.map(v => v.num)).size).toBe(78);
  });
  it('55 tienen tabla y toda tabla referida existe', () => {
    const con = PADRON_INICIAL.filter(v => v.tabla);
    expect(con).toHaveLength(55);
    for (const v of con) expect(TABLAS_CUBICACION[v.tabla]).toBeTruthy();
  });
  it('usa la Cap REAL', () => {
    expect(PADRON_INICIAL.find(v => v.num === '124').cap_real).toBe(46500);
  });
});

describe('buscarVasija', () => {
  const P = [{ num: '201', activa: true }, { num: '202', activa: false }];
  it('encuentra por el numero aunque venga con prefijo', () => {
    expect(normalizarNumVasija('T 201')).toBe('201');
    expect(buscarVasija(P, 'T 201')).toBe(P[0]);
    expect(buscarVasija(P, 201)).toBe(P[0]);
  });
  it('ignora las dadas de baja y lo que no existe', () => {
    expect(buscarVasija(P, '202')).toBeNull();
    expect(buscarVasija(P, '999')).toBeNull();
    expect(buscarVasija(P, '')).toBeNull();
  });
});
