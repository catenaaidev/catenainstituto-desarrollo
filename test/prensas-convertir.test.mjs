import { describe, it, expect } from 'vitest';
import { convertirPrensas } from '../scripts/convertir-prensas-nucleo.mjs';

const filaLote = (o = {}) => {
  const r = Array(17).fill(null);
  Object.assign(r, { 0: 25700, 1: 'Pinot Noir', 2: '25005, 25006', 3: 'El Cepillo', 4: 'PN El Cepillo',
    5: null, 6: 0, 7: '2025-02-24', 8: 386, 9: 'W', 10: 'NO', 11: 'NO', 12: 'NO' }, o);
  return r;
};
const filaAna = (o = {}) => {
  const r = Array(25).fill(null);
  Object.assign(r, { 0: 25700, 1: 3, 2: '2025-03-06' }, o);
  return r;
};

describe('convertirPrensas — lotes', () => {
  it('mapea las columnas a las claves de la web', () => {
    const { lotes } = convertirPrensas({ lotes: [filaLote()], analisis: [] });
    expect(lotes[0]).toEqual({ lote: 25700, variedad: 'Pinot Noir', origen: '25005, 25006', ig: 'El Cepillo',
      id_origen: 'PN El Cepillo', ot_prensado: null, litros: 0, dia_prensado: '2025-02-24', prensa: 'W',
      so2_agregado: 'NO', comentario: null, accion: null, comentario2: null, accion2: null });
  });
  it('origen numérico queda número, como en 2026', () => {
    const { lotes } = convertirPrensas({ lotes: [filaLote({ 2: 25162 })], analisis: [] });
    expect(lotes[0].origen).toBe(25162);
  });
  it('las columnas que la web no tiene van a comentario2 solo si dicen algo', () => {
    const { lotes } = convertirPrensas({ lotes: [filaLote({ 11: 'SI', 13: 'mucha', 15: 'alto', 16: 0.9 })], analisis: [] });
    expect(lotes[0].comentario2).toBe('Refermentación: SI · Actividad: mucha · Degustación Brett: alto · Degustación AV: 0.9');
  });
  it('NO en refermentación y bacteria no se anota', () => {
    const { lotes } = convertirPrensas({ lotes: [filaLote({ 11: 'no', 12: 'NO' })], analisis: [] });
    expect(lotes[0].comentario2).toBe(null);
  });
  it('lote repetido frena', () => {
    expect(() => convertirPrensas({ lotes: [filaLote(), filaLote()], analisis: [] })).toThrow(/repetido/);
  });
});

describe('convertirPrensas — análisis', () => {
  it('pasa números con coma y espacios', () => {
    const { analisis } = convertirPrensas({ lotes: [filaLote()],
      analisis: [filaAna({ 3: '13,0', 4: 3.85, 5: '0,58', 6: ' 1,7', 7: -999 })] });
    expect(analisis[0]).toMatchObject({ lote: 25700, mes: 3, fecha: '2025-03-06', etanol: 13, ph: 3.85, av: 0.58, gluc: 1.7, malico: -999 });
    expect(Object.keys(analisis[0])).toHaveLength(25);
  });
  it('mes inválido se toma de la fecha', () => {
    const { analisis } = convertirPrensas({ lotes: [filaLote()], analisis: [filaAna({ 1: 55, 2: '2025-05-20', 4: 3.5 })] });
    expect(analisis[0].mes).toBe(5);
  });
  it('mes vacío se toma de la fecha', () => {
    const { analisis } = convertirPrensas({ lotes: [filaLote()], analisis: [filaAna({ 1: null, 2: '2026-01-16', 4: 3.5 })] });
    expect(analisis[0].mes).toBe(1);
  });
  it('renglón sin ninguna medida ni dato se saltea y se cuenta', () => {
    const r = convertirPrensas({ lotes: [filaLote()], analisis: [filaAna(), filaAna({ 4: 3.5 })] });
    expect(r.analisis).toHaveLength(1);
    expect(r.reporte.vacios_salteados).toBe(1);
  });
  it('renglón sin medida pero con OT u otro dato se conserva', () => {
    const r = convertirPrensas({ lotes: [filaLote()], analisis: [filaAna({ 24: 'B182' })] });
    expect(r.analisis).toHaveLength(1);
    expect(r.analisis[0].ot).toBe('B182');
  });
  it('reporta huérfanos', () => {
    const r = convertirPrensas({ lotes: [filaLote()], analisis: [filaAna({ 0: 25999, 4: 3.5 })] });
    expect(r.reporte.huerfanos).toEqual([25999]);
  });
});
