/* Hoja de recorrida: el formulario de la hoja "Inventario" del Excel, con el lote precargado. */
import { describe, it, expect } from 'vitest';
import { hojaRecorridaHTML } from '../public/lotes/js/hoja-recorrida.js';

const F = (num, lote) => ({ num: String(num), lotes: lote ? [{ lote }] : [] });

describe('hojaRecorridaHTML', () => {
  it('trae encabezados del Excel, fecha y lote precargado', () => {
    const h = hojaRecorridaHTML([F(201, '25313'), F(202)], '2026-10-14');
    expect(h).toContain('N° de vasija');
    expect(h).toContain('cm Merma / Lleno');
    expect(h).not.toContain('Velo');
    expect(h).toContain('14/10/2026');
    expect(h).toMatch(/201<\/td><td[^>]*>25313/);
  });
  it('dos lotes en una vasija salen juntos', () => {
    expect(hojaRecorridaHTML([{ num: '201', lotes: [{ lote: '25313' }, { lote: '25314' }] }], '2026-10-14'))
      .toContain('25313 + 25314');
  });
  it('40 vasijas por hoja', () => {
    const filas = Array.from({ length: 78 }, (_, i) => F(100 + i, ''));
    expect(hojaRecorridaHTML(filas, '2026-10-14').match(/class="orden-hoja inv-hoja"/g)).toHaveLength(2);
  });
  it('escapa el texto', () => {
    expect(hojaRecorridaHTML([F('<b>', '<x>')], '2026-10-14')).not.toContain('<b>');
  });
});
