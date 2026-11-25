/** La ficha del celular muestra el último análisis con los colores de Análisis. */
import { describe, it, expect } from 'vitest';
import { datosFicha } from '../src/lotes/vistas';

const HOY = Date.parse('2026-10-16T00:00:00Z');
const base = {
  lotes: [{ lote: '26217', variedad: 'Malbec', fecha_ingreso: '2026-03-01', litros_actuales: 1000 }],
  movimientos: [],
};

describe('datosFicha: último análisis', () => {
  it('el más nuevo con medición química, con su veredicto', () => {
    const f = datosFicha({ ...base, analisis: [
      { lote: '26217', fecha_analisis: '2026-08-01', ph: 3.6, av: 0.4 },
      { lote: '26217', fecha_analisis: '2026-09-20', ph: 3.7, av: 2.5 },
      // Solo corrección, sin medición: no cuenta como "último análisis".
      { lote: '26217', fecha_analisis: '2026-10-01', correccion: { ot_n: '0712' } },
    ] }, '26217', HOY)!;
    expect(f.ultimo_analisis!.analisis.fecha_analisis).toBe('2026-09-20');
    expect(f.ultimo_analisis!.fuera).toContain('av');
  });

  it('respeta los "no usar"', () => {
    const f = datosFicha({ ...base,
      analisis: [
        { lote: '26217', fecha_analisis: '2026-08-01', av: 0.4 },
        { lote: '26217', fecha_analisis: '2026-09-20', av: 2.5 },
      ],
      excepciones_analisis: [{ lote: '26217', fecha_analisis: '2026-09-20', usar_registro: 'no' }],
    }, '26217', HOY)!;
    expect(f.ultimo_analisis!.analisis.fecha_analisis).toBe('2026-08-01');
  });

  it('sin análisis da null', () => {
    expect(datosFicha({ ...base, analisis: [] }, '26217', HOY)!.ultimo_analisis).toBe(null);
  });
});
