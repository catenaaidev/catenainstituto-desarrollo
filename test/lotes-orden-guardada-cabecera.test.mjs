import { describe, it, expect } from 'vitest';
import { htmlCabeceraOrden } from '../public/lotes/js/orden-guardada-cabecera.js';

const base = (x = {}) => ({
  id: 'oh-1', tipo: 'muestras', ot: '0950', fecha: '2026-11-04', estado: 'pendiente',
  emitida_por: 'Ana', emitida_el: '2026-11-04T10:00:00Z', ejecutada_por: '', ejecutada_el: '',
  anulada: null, lotes: [{ lote: '26034' }], hoja: {}, registro: null, pdf: null, ...x,
});

describe('htmlCabeceraOrden', () => {
  it('pendiente + puedeEditar: ejecutar, anular y reimprimir', () => {
    const html = htmlCabeceraOrden(base(), { puedeEditar: true });
    expect(html).toContain('data-orden="oh-1"');
    expect(html).toContain('class="oh-guardada"');
    expect(html).toContain('data-oha="ejecutar"');
    expect(html).toContain('data-oha="anular"');
    expect(html).toContain('data-oha="reimprimir"');
    expect(html).toContain('⏳ Pendiente');
  });

  it('pendiente sin puedeEditar: solo reimprimir', () => {
    const html = htmlCabeceraOrden(base(), { puedeEditar: false });
    expect(html).not.toContain('data-oha="ejecutar"');
    expect(html).not.toContain('data-oha="anular"');
    expect(html).toContain('data-oha="reimprimir"');
  });

  it('ejecutada: muestra quién y cuándo, sin botón de ejecutar', () => {
    const html = htmlCabeceraOrden(base({
      estado: 'ejecutada', ejecutada_por: 'Luis', ejecutada_el: '2026-11-04T12:00:00Z',
    }), { puedeEditar: true });
    expect(html).toContain('Ejecutada por Luis');
    expect(html).toContain('04/11/2026');
    expect(html).not.toContain('data-oha="ejecutar"');
    expect(html).not.toContain('data-oha="anular"');
    expect(html).toContain('data-oha="reimprimir"');
  });

  it('anulada: muestra quién y cuándo', () => {
    const html = htmlCabeceraOrden(base({
      estado: 'anulada', anulada: { por: 'Oriana', en: '2026-11-04T12:00:00Z' },
    }), { puedeEditar: true });
    expect(html).toContain('Anulada por Oriana');
    expect(html).not.toContain('data-oha="ejecutar"');
    expect(html).not.toContain('data-oha="anular"');
  });

  it('el ot y los nombres pasan por esc', () => {
    const html = htmlCabeceraOrden(base({
      ot: '<b>0950</b>', estado: 'ejecutada', ejecutada_por: '<i>Luis</i>', ejecutada_el: '2026-11-04T12:00:00Z',
    }), { puedeEditar: true });
    expect(html).not.toContain('<b>0950</b>');
    expect(html).not.toContain('<i>Luis</i>');
    expect(html).toContain('&lt;b&gt;0950&lt;/b&gt;');
  });

  it('agregados pendiente: aviso de que se anotan en Análisis', () => {
    const html = htmlCabeceraOrden(base({ tipo: 'agregados' }), { puedeEditar: true });
    expect(html).toContain('se anotan en Análisis');
  });

  it('agregados ejecutada: sin el aviso', () => {
    const html = htmlCabeceraOrden(base({
      tipo: 'agregados', estado: 'ejecutada', ejecutada_por: 'Luis', ejecutada_el: '2026-11-04T12:00:00Z',
    }), { puedeEditar: true });
    expect(html).not.toContain('se anotan en Análisis');
  });

  it('muestras pendiente: sin el aviso de agregados', () => {
    const html = htmlCabeceraOrden(base(), { puedeEditar: true });
    expect(html).not.toContain('se anotan en Análisis');
  });
});
