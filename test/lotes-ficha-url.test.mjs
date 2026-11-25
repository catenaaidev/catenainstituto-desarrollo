/** #ficha/<lote>: la ficha queda en la URL, se comparte y sobrevive al F5. */
import { describe, it, expect } from 'vitest';
import { loteDeHash, hashDeLote } from '../public/lotes/js/ficha-url.js';

describe('ficha en la URL', () => {
  it('ida y vuelta', () => {
    expect(hashDeLote('26217')).toBe('#ficha/26217');
    expect(loteDeHash('#ficha/26217')).toBe('26217');
    expect(loteDeHash(hashDeLote(' 26 217 '))).toBe('26 217');
  });
  it('lo que no es una ficha da null', () => {
    expect(loteDeHash('')).toBe(null);
    expect(loteDeHash('#lotes')).toBe(null);
    expect(loteDeHash('#ficha/')).toBe(null);
    expect(loteDeHash('#ficha/%E0%A4%A')).toBe(null);   // mal codificado
  });
});
