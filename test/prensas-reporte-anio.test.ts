/**
 * El reporte de gerencia de Prensas muestra solo la vendimia más nueva
 * (igual que el Panel por defecto). Los lotes sin año (no son 5 dígitos)
 * quedan siempre: esconderlos sería perderlos de vista sin que nadie lo note.
 */
import { describe, it, expect } from 'vitest';
import { recortarAlUltimoAnio } from '../src/prensas/anio-reporte';

describe('recortarAlUltimoAnio', () => {
  it('con 2025 y 2026 deja solo 26xxx y los sin año', () => {
    const doc = {
      meta: { version: 3 },
      lotes: [{ lote: 25137 }, { lote: 26001 }, { lote: 'X-1' }],
      analisis: [{ lote: 25137, mes: 3 }, { lote: '26001', mes: 4 }, { lote: 'X-1', mes: 4 }],
      degustaciones: [{ lote: 25137, mes: 2 }, { lote: 26001, mes: 4 }],
      agregados: [{ lote: 25137 }, { lote: 26001 }, { lote: null }],
      config: { alertas: {} },
    };
    const r = recortarAlUltimoAnio(doc);
    expect(r.lotes.map((l) => l.lote)).toEqual([26001, 'X-1']);
    expect(r.analisis.map((a) => a.lote)).toEqual(['26001', 'X-1']);
    expect(r.degustaciones.map((d) => d.lote)).toEqual([26001]);
    expect(r.agregados.map((a) => a.lote)).toEqual([26001, null]);
    expect(r.meta).toEqual({ version: 3 });
    expect(r.config).toEqual({ alertas: {} });
  });

  it('un documento de un solo año queda igual', () => {
    const doc = {
      lotes: [{ lote: 26001 }, { lote: 26002 }],
      analisis: [{ lote: 26001 }],
      degustaciones: [{ lote: 26002 }],
      agregados: [],
    };
    expect(recortarAlUltimoAnio(doc)).toEqual(doc);
  });

  it('un documento vacío no rompe', () => {
    expect(recortarAlUltimoAnio({})).toEqual({});
    expect(recortarAlUltimoAnio({ lotes: [], analisis: [] })).toEqual({ lotes: [], analisis: [] });
  });

  it('sin ningún lote con año no filtra nada', () => {
    const doc = { lotes: [{ lote: 'A' }], analisis: [{ lote: 25001 }] };
    expect(recortarAlUltimoAnio(doc)).toEqual(doc);
  });
});

describe('plantilla del reporte: último análisis', () => {
  it('elige por fecha (o año del lote + mes), no por mes solo', async () => {
    const { PLANTILLA } = await import('../src/prensas/reporte-plantilla');
    expect(PLANTILLA).not.toContain('mesDe(b)>=mesDe(a)');
    expect(PLANTILLA).toContain('claveTiempo(b)>=claveTiempo(a)');
  });
});
