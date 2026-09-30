/* Tests del papel de la Orden de correccion de SO2 (formato B219). */
import { describe, it, expect } from 'vitest';
import { anioDeLote, filaPapel, theadPapel, INSTRUCCIONES_SOLUCION }
  from '../public/lotes/js/orden-correccion-papel.js';

const sol = { col: 'mL sol.', dec: 1, suf: 'mL', de: d => d.ml_solucion, total: f => f.ml_total };

describe('anioDeLote', () => {
  it('saca el año de los dos primeros digitos', () => {
    expect(anioDeLote('25009')).toBe('2025');
    expect(anioDeLote(26014)).toBe('2026');
  });
  it('sin numero no inventa un año', () => {
    expect(anioDeLote('')).toBe('');
    expect(anioDeLote(null)).toBe('');
    expect(anioDeLote('TQ-1')).toBe('');
  });
});

describe('filaPapel', () => {
  const lote = { lote: '25306', variedad: 'Malbec', ph: 3.7, so2_libre: 20, molecular_actual: 0.4 };

  it('el renglon del lote lleva lote, año y total, y nada tecnico', () => {
    const html = filaPapel({ numero: 0, fila: { tipo: 'lote', lote, ml_total: 1636.36 } }, sol);
    expect(html).toContain('<b>25306</b> · 2025 · total <b>1636.4</b> mL');
    expect(html).not.toMatch(/Malbec|pH|SO₂|molecular/);
    expect(html).toContain('colspan="3"');
  });

  it('el renglon del barril lleva numero de barril y dosis', () => {
    const html = filaPapel({ numero: 4, fila: { tipo: 'barrica', lote,
      barrica: { num: '206', cap: 225, estado: 'lleno', litros_usados: 225 },
      dosis: { ml_solucion: 196.36, mbk_g: 21.6 } } }, sol);
    expect(html).toBe('<tr><td class="c oh-num">4</td><td class="c">206</td>' +
      '<td class="c"><b>196.4</b></td><td class="oh-check"></td></tr>');
  });

  it('un barril sin numero sale con raya', () => {
    const html = filaPapel({ numero: 1, fila: { tipo: 'barrica', lote,
      barrica: { num: '' }, dosis: { ml_solucion: 10 } } }, sol);
    expect(html).toContain('<td class="c">—</td>');
  });
});

describe('encabezado e instrucciones', () => {
  it('cuatro columnas: #, barril, dosis, check', () => {
    expect((theadPapel(sol).match(/<th/g) || []).length).toBe(4);
    expect(theadPapel(sol)).toContain('mL sol.');
  });
  it('las instrucciones de la B219 estan todas', () => {
    for (const t of ['DMA', '1,028', '1,032', 'Homogeneizar', 'Densidad'])
      expect(INSTRUCCIONES_SOLUCION).toContain(t);
  });
});
