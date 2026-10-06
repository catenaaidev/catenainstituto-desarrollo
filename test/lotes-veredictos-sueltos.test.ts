/* veredictosSueltos: juzga filas de analisis que todavia NO estan guardadas,
 * para que la pestaña Analisis pinte el criterio apenas se tipea un valor.
 * Tiene que decir exactamente lo mismo que analisisConFlags sobre el documento
 * guardado: mismas reglas, solo que el lote y los criterios los manda la
 * pantalla en vez de leerlos de la base. */
import { describe, it, expect } from 'vitest';
import { analisisConFlags, veredictosSueltos } from '../src/lotes/vistas';

const criterios = { por_variedad: { Malbec: { ph_max: 3.4 } } };
const lote = { lote: '26217', variedad: 'Malbec', proyecto: 'X' };

describe('veredictosSueltos', () => {
  it('da lo mismo que analisisConFlags para la misma fila', () => {
    const a = { lote: '26217', fecha_analisis: '2026-09-28', ph: 3.5, av: 0.3, so2_libre: 30, gluc_fruc: 1 };
    const guardado = analisisConFlags({ lotes: [lote], analisis: [a], config: { criterios_fml: criterios } })[0];
    const [suelto] = veredictosSueltos({ criterios, filas: [{ analisis: a, lote }] });
    expect(suelto.fuera).toEqual(guardado.fuera);
    expect(suelto.dentro).toEqual(guardado.dentro);
    expect(suelto.so2_molec_calc).toEqual(guardado.so2_molec_calc);
    expect(suelto.fuera).toContain('ph');   // 3,5 > ph_max 3,4 de Malbec
  });

  it('sin lote juzga con los criterios de fabrica', () => {
    const [v] = veredictosSueltos({ criterios, filas: [{ analisis: { ph: 3.5 } }] });
    expect(v.dentro).toContain('ph');
  });

  it('un cuerpo raro no tira el Worker', () => {
    expect(veredictosSueltos(null)).toEqual([]);
    expect(veredictosSueltos({ filas: 'x' })).toEqual([]);
    expect(veredictosSueltos({ filas: [null, 3] })).toHaveLength(2);
  });

  it('corta en 1000 filas', () => {
    const filas = Array.from({ length: 1500 }, () => ({ analisis: { ph: 3.2 } }));
    expect(veredictosSueltos({ filas })).toHaveLength(1000);
  });
});
