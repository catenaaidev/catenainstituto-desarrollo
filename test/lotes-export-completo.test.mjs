import { describe, expect, it } from 'vitest';
import { hojasDocumentoCompleto } from '../public/lotes/js/exportar-completo.js';

describe('hojasDocumentoCompleto', () => {
  it('incluye todas las secciones del documento sin perder campos anidados', () => {
    const hojas = hojasDocumentoCompleto({
      meta: { version: 42, actualizado: '2026-10-21T10:00:00' },
      config: { criterios_fml: { default: { so2_min: 20 } } },
      lotes: [{ lote: '26001', variedad: 'Chardonnay', historial_etapas: [{ etapa: 'crianza' }] }],
      analisis: [{ lote: '26001', fecha_analisis: '2026-10-20', correccion: { ot_n: 'OT-1' } }],
      movimientos: [{ id: 'mov-1', lote: '26001', fecha: '2026-10-20' }],
      estado_lote: { 26001: { inoculado: 'si', comentario: 'listo' } },
      excepciones_analisis: [{ lote: '26001', motivo: 'muestra descartada' }],
      vasijas: [{ num: 'T120', litros: 4300 }],
      mermas: [{ id: 'mer-1', lote: '26001', litros: 15 }],
      recorridas: [{ id: 'rec-1', fecha: '2026-10-20' }],
    });

    expect(hojas.map((h) => h.nombre)).toEqual([
      'Metadatos', 'Configuración', 'Lotes', 'Análisis', 'Movimientos',
      'Estados de lote', 'Excepciones de análisis', 'Vasijas', 'Mermas', 'Recorridas',
    ]);
    expect(hojas.find((h) => h.nombre === 'Lotes').filas).toEqual([{
      lote: '26001', variedad: 'Chardonnay', historial_etapas: '[{"etapa":"crianza"}]',
    }]);
    expect(hojas.find((h) => h.nombre === 'Análisis').filas[0].correccion).toBe('{"ot_n":"OT-1"}');
    expect(hojas.find((h) => h.nombre === 'Estados de lote').filas).toEqual([{
      lote: '26001', inoculado: 'si', comentario: 'listo',
    }]);
    expect(hojas.find((h) => h.nombre === 'Configuración').filas).toEqual([{
      clave: 'criterios_fml', valor: '{"default":{"so2_min":20}}',
    }]);
  });

  it('parte los textos de más de 32767 caracteres en columnas de continuación (límite de Excel por celda)', () => {
    const largo = 'x'.repeat(32767 * 2 + 10);
    const hojas = hojasDocumentoCompleto({ ordenes_correccion: [{ id: 'oc-1', lotes: largo }] });
    const hoja = hojas.find((h) => h.nombre === 'Ordenes Correccion');
    const fila = hoja.filas[0];
    expect(Object.values(fila).every((v) => String(v).length <= 32767)).toBe(true);
    expect(fila.lotes + fila.lotes_2 + fila.lotes_3).toBe(largo);
    expect(hoja.columnas.map((c) => c[0])).toEqual(['id', 'lotes', 'lotes_2', 'lotes_3']);
  });

  it('acorta a 31 caracteres los nombres de hoja y no los repite (límite de Excel)', () => {
    const hojas = hojasDocumentoCompleto({
      seccion_con_un_nombre_larguisimo_uno: [{ a: 1 }],
      seccion_con_un_nombre_larguisimo_dos: [{ a: 2 }],
    });
    const nombres = hojas.map((h) => h.nombre);
    expect(nombres.every((n) => n.length <= 31)).toBe(true);
    expect(new Set(nombres).size).toBe(nombres.length);
  });
});
