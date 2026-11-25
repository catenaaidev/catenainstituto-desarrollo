/* Tests de escalaA4 (hoja-pdf.js): cada hoja de la OT entra en UNA A4. */
import { describe, it, expect } from 'vitest';
import { escalaA4 } from '../public/lotes/js/hoja-pdf.js';

describe('escalaA4', () => {
  // 182 mm de ancho util = 688 px a 96 dpi; 269 mm de alto = 1016,6 px.
  const ancho = 688;
  it('si entra, no se toca', () => {
    expect(escalaA4(900, ancho)).toBe(1);
    expect(escalaA4(1016, ancho)).toBe(1);
  });
  it('si no entra, se achica lo justo con un 2% de aire', () => {
    const s = escalaA4(1500, ancho);
    expect(s).toBeLessThan(1);
    expect(1500 * s).toBeLessThanOrEqual(ancho * 269 / 182);
    expect(1500 * s).toBeGreaterThan(ancho * 269 / 182 * 0.95);
  });
  it('nunca menos de la mitad: mas largo que eso sale en dos paginas', () => {
    expect(escalaA4(5000, ancho)).toBe(0.5);
  });
  it('medidas raras no rompen', () => {
    expect(escalaA4(0, ancho)).toBe(1);
    expect(escalaA4(1500, 0)).toBe(1);
    expect(escalaA4(NaN, ancho)).toBe(1);
  });
});
