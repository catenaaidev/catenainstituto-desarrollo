import { describe, it, expect } from 'vitest';
import { fusionarAnio } from '../scripts/fusionar-anio-nucleo.mjs';

const doc = () => ({
  meta: { version: 70, autor: 'Oriana' },
  config: { x: 1 },
  lotes: [{ lote: 26001, variedad: 'Malbec' }],
  analisis: [{ lote: '26001', fecha_analisis: '2026-01-02', ph: 3.5 }],
  movimientos: [{ id: 'm1' }],
});
const conv = () => ({
  lotes: [{ lote: '25001', variedad: 'Chardonnay', trasiegos: [null], ultimo_relleno: null }],
  analisis: [
    { lote: '25001', fecha_analisis: '2025-01-01', ph: null, so2_libre: null, comentario: '',
      correccion: { so2_deseado: null, ot_n: '' } },
    { lote: '25001', fecha_analisis: '2025-01-28', ph: 3.05, comentario: '', correccion: {} },
    { lote: '25999', fecha_analisis: '2025-02-01', ph: 3.2, comentario: '', correccion: {} },
  ],
});

describe('fusionarAnio', () => {
  it('suma los lotes y análisis del año sin tocar 2026', () => {
    const d = doc();
    const { doc: r, reporte } = fusionarAnio(d, conv(), 2025);
    expect(r.lotes.map(l => l.lote)).toEqual([26001, 25001]);
    expect(r.lotes[0]).toEqual(d.lotes[0]);
    expect(r.analisis).toHaveLength(3);          // 1 de 2026 + 2 con valores
    expect(reporte).toMatchObject({ lotes: 1, analisis: 2, analisis_vacios: 1, huerfanos: ['25999'] });
    expect(r.movimientos).toEqual(d.movimientos);
    expect(r.config).toEqual(d.config);
    // Sube la version: una pantalla abierta en v70 que guarde despues de la
    // importacion recibe 409 en vez de pisar los lotes 2025 con su copia vieja.
    expect(r.meta.version).toBe(71);
    expect(d.meta.version).toBe(70);
  });
  it('el lote queda numérico, como los de 2026, y sin los campos que la web no usa', () => {
    const { doc: r } = fusionarAnio(doc(), conv(), 2025);
    const l = r.lotes.find(x => x.lote === 25001);
    expect(l).toBeTruthy();
    expect('trasiegos' in l).toBe(false);
    expect('ultimo_relleno' in l).toBe(false);
  });
  it('no importa dos veces el mismo año', () => {
    const una = fusionarAnio(doc(), conv(), 2025).doc;
    expect(() => fusionarAnio(una, conv(), 2025)).toThrow(/ya tiene/);
  });
  it('rechaza un convertido con lotes de otro año', () => {
    const c = conv(); c.lotes.push({ lote: '26002' });
    expect(() => fusionarAnio(doc(), c, 2025)).toThrow(/26002/);
  });
  it('no muta el documento de entrada', () => {
    const d = doc();
    fusionarAnio(d, conv(), 2025);
    expect(d.lotes).toHaveLength(1);
  });
  it('un renglón con solo vasija_analizada no es vacío', () => {
    const c = conv();
    c.analisis.push({ lote: '25001', fecha_analisis: '2025-01-15', vasija_analizada: 't50',
      ph: null, comentario: '', correccion: {} });
    const { doc: r, reporte } = fusionarAnio(doc(), c, 2025);
    expect(reporte.analisis).toBe(3);
    expect(reporte.analisis_vacios).toBe(1);
    expect(r.analisis.some(a => a.fecha_analisis === '2025-01-15' && a.vasija_analizada === 't50')).toBe(true);
  });
});
