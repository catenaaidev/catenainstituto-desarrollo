import { describe, it, expect } from 'vitest';
import { fusionarAnioPrensas } from '../scripts/fusionar-anio-prensas-nucleo.mjs';

const doc = () => ({ meta: { version: 89 }, lotes: [{ lote: 26701 }], analisis: [{ lote: 26701, ph: 3.9 }],
  degustaciones: [{ lote: 26701, mes: 6 }], agregados: [{ id: 1, lote: 26701 }] });
const conv = () => ({ lotes: [{ lote: 25700 }, { lote: 25701 }], analisis: [{ lote: 25700, ph: 3.5 }] });

describe('fusionarAnioPrensas', () => {
  it('agrega lotes y análisis al final sin tocar lo demás', () => {
    const { doc: d, reporte } = fusionarAnioPrensas(doc(), conv(), 2025);
    expect(d.lotes.map(l => l.lote)).toEqual([26701, 25700, 25701]);
    expect(d.analisis).toHaveLength(2);
    expect(d.degustaciones).toEqual(doc().degustaciones);
    expect(d.agregados).toEqual(doc().agregados);
    expect(d.meta.version).toBe(90);
    expect(reporte).toEqual({ lotes: 2, analisis: 1, huerfanos: [] });
  });
  it('no importa dos veces el mismo año', () => {
    const d = doc(); d.lotes.push({ lote: 25700 });
    expect(() => fusionarAnioPrensas(d, conv(), 2025)).toThrow(/ya tiene/);
  });
  it('no importa si el documento ya tiene análisis de ese año (aunque no tenga sus lotes)', () => {
    const d = doc(); d.analisis.push({ lote: 25999, ph: 3.4 });
    expect(() => fusionarAnioPrensas(d, conv(), 2025)).toThrow(/ya tiene/);
  });
  it('frena si el Excel trae lotes de otro año', () => {
    const c = conv(); c.lotes.push({ lote: 26999 });
    expect(() => fusionarAnioPrensas(doc(), c, 2025)).toThrow(/no son de 2025/);
  });
  it('frena si trae análisis de otro año', () => {
    const c = conv(); c.analisis.push({ lote: 26701, ph: 3 });
    expect(() => fusionarAnioPrensas(doc(), c, 2025)).toThrow(/análisis que no son de 2025/);
  });
  it('no modifica el documento de entrada', () => {
    const d = doc();
    fusionarAnioPrensas(d, conv(), 2025);
    expect(d.lotes).toHaveLength(1);
    expect(d.meta.version).toBe(89);
  });
});
