/* Tests de ot-pdf.js: la etiqueta de "¿se guardó en la carpeta?" de cada OT y
 * el aviso de que la carpeta va atrasada respecto de la web. */
import { describe, it, expect } from 'vitest';
import { etiquetaPdf, desfaseCarpeta } from '../public/lotes/js/ot-pdf.js';

describe('etiquetaPdf', () => {
  it('sin imprimir no hay etiqueta', () => { expect(etiquetaPdf({ ot: '0950' })).toBeNull(); });
  it('en la carpeta: ✓ con el nombre', () => {
    const e = etiquetaPdf({ pdf: { estado: 'carpeta', nombre: '0950 Corte.pdf', el: '2026-10-26 10:00' } });
    expect(e).toMatchObject({ txt: '📁 ✓', clase: 'ok' });
    expect(e.title).toContain('0950 Corte.pdf');
  });
  it('descargado, solo papel y sin verificar avisan', () => {
    expect(etiquetaPdf({ pdf: { estado: 'descargado' } })).toMatchObject({ txt: '⚠ PDF descargado', clase: 'warn' });
    expect(etiquetaPdf({ pdf: { estado: 'papel' } })).toMatchObject({ txt: '⚠ solo papel', clase: 'warn' });
    expect(etiquetaPdf({ pdf: { estado: 'sin-verificar' } })).toMatchObject({ txt: '⚠ sin verificar', clase: 'warn' });
  });
});

describe('desfaseCarpeta', () => {
  const nombres = ['0949 Trasiego.pdf', '0950 Corte.pdf', 'B Ordenes de agregados'];
  it('la web ya uso un numero mayor que el ultimo de la carpeta', () => {
    expect(desfaseCarpeta({ nombres, web: [947, 953] }, 'principal')).toEqual({ web: '0953', carpeta: '0950' });
  });
  it('al dia: null', () => {
    expect(desfaseCarpeta({ nombres, web: [950] }, 'principal')).toBeNull();
    expect(desfaseCarpeta({ nombres: null, web: [999] }, 'principal')).toBeNull();
  });
});
