import { describe, it, expect } from 'vitest';
import { fijarEntornoOT, entornoOT } from '../public/lotes/js/entorno-ot.js';

describe('entorno de órdenes', () => {
  it('sin fijar avisa con un error claro; fijado lo devuelve', () => {
    fijarEntornoOT(null);
    expect(() => entornoOT()).toThrow('Entorno de órdenes sin fijar');
    const e = { api: '/x/api' };
    fijarEntornoOT(e);
    expect(entornoOT()).toBe(e);
  });
});
