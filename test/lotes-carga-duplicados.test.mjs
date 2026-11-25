/* Tests de los análisis repetidos en Cargar análisis (carga-duplicados.js).
 *
 * El caso real que lo motivó: la planilla del 07/10/2026 se pegó dos veces,
 * con días de diferencia, y los 13 análisis quedaron duplicados.
 */
import { describe, it, expect } from 'vitest';
import { huellaAnalisis, marcarRepetidos } from '../public/lotes/js/carga-duplicados.js';
import { planDeColumnas, parsearFila, ORDEN_PLANILLA } from '../public/lotes/js/carga-cols.js';

const COLS = ['lote', 'vasija', 'fecha_analisis', 'etanol', 'ph', 'av', 'gluc_fruc',
              'malico', 'lactico', 'acidez_total', 'so2_libre'];

/* Lo que quedó guardado de la primera carga del 07/10 (con la corrección de
 * SO2 que se le hizo después, que la planilla no trae). */
const GUARDADO = {
  lote: '26316', fecha_analisis: '2026-10-07', etanol: 13.83, ph: 3.71, av: 0.98,
  gluc_fruc: 2.9, malico: 0.29, lactico: null, acidez_total: 4.8, so2_libre: 31,
  correccion: { so2_libre_actual: 31, so2_deseado: 40, ot_n: '26004' },
};

function fila(campos){ return { _errores: [], ...campos }; }

describe('marcarRepetidos', () => {
  it('marca la fila que ya está cargada igualita, aunque lo guardado tenga más campos', () => {
    const f = fila({ lote: '26316', fecha_analisis: '2026-10-07', etanol: 13.83, ph: 3.71,
      av: 0.98, gluc_fruc: 2.9, malico: 0.29, lactico: null, acidez_total: 4.8, so2_libre: 31 });
    marcarRepetidos([f], [GUARDADO], COLS);
    expect(f._repetido).toBe('ya cargado');
  });

  it('un solo valor distinto alcanza para que entre', () => {
    const f = fila({ ...GUARDADO, correccion: undefined, ph: 3.72 });
    marcarRepetidos([f], [GUARDADO], COLS);
    expect(f._repetido).toBeUndefined();
  });

  it('otra fecha u otra vasija es otro análisis', () => {
    const otraFecha = fila({ ...GUARDADO, fecha_analisis: '2026-10-08' });
    const otraVasija = fila({ ...GUARDADO, vasija: '407' });
    marcarRepetidos([otraFecha, otraVasija], [GUARDADO], COLS);
    expect(otraFecha._repetido).toBeUndefined();
    expect(otraVasija._repetido).toBeUndefined();
  });

  it('vacío, null y ausente son lo mismo; el número guardado como texto también', () => {
    const viejo = { lote: ' 26316 ', fecha_analisis: '2026-10-07', etanol: '13,83', ph: 3.71,
      av: 0.98, gluc_fruc: 2.9, malico: 0.29, acidez_total: 4.8, so2_libre: '31', vasija: '' };
    const f = fila({ ...GUARDADO, correccion: undefined });
    marcarRepetidos([f], [viejo], COLS);
    expect(f._repetido).toBe('ya cargado');
  });

  it('dentro del mismo pegado, la segunda copia se marca y la primera entra', () => {
    const a = fila({ ...GUARDADO, lote: '26320' });
    const b = fila({ ...GUARDADO, lote: '26320' });
    marcarRepetidos([a, b], [GUARDADO], COLS);
    expect(a._repetido).toBeUndefined();
    expect(b._repetido).toBe('repetido en el pegado');
  });

  it('las filas con error no se marcan ni tapan a las que vienen después', () => {
    const mala = { ...fila({ ...GUARDADO, lote: '26320' }), _errores: ['lote no existe'] };
    const buena = fila({ ...GUARDADO, lote: '26320' });
    marcarRepetidos([mala, buena], [], COLS);
    expect(mala._repetido).toBeUndefined();
    expect(buena._repetido).toBeUndefined();
  });

  it('volver a marcar limpia la marca vieja', () => {
    const f = fila({ ...GUARDADO });
    marcarRepetidos([f], [GUARDADO], COLS);
    expect(f._repetido).toBe('ya cargado');
    marcarRepetidos([f], [], COLS);
    expect(f._repetido).toBeUndefined();
  });

  it('pegar dos veces la misma planilla: la segunda no carga nada', () => {
    const plan = planDeColumnas(ORDEN_PLANILLA);
    const cols = [...new Set(plan.filter(Boolean))];
    const linea = '26316\t\t2026\t07/10/2026\t13,83\t3,71\t0,98\t2,9\t0,29\t\t4,8\t\t\t31';
    const primera = [parsearFila(linea, plan)].map(r => fila(r.campos));
    marcarRepetidos(primera, [], cols);
    expect(primera[0]._repetido).toBeUndefined();

    const segunda = [parsearFila(linea, plan)].map(r => fila(r.campos));
    marcarRepetidos(segunda, primera, cols);
    expect(segunda[0]._repetido).toBe('ya cargado');
  });
});

describe('huellaAnalisis', () => {
  it('solo mira las columnas pedidas', () => {
    expect(huellaAnalisis({ lote: '1', ph: 3.5, brett: 'x' }, ['lote', 'ph']))
      .toBe(huellaAnalisis({ lote: '1', ph: 3.5 }, ['lote', 'ph']));
  });
});
