/* Importa de tablero-datos.js, NO de tablero-ficha.js (ver Tarea 4). */
import { describe, it, expect } from 'vitest';
import { ultimasMediciones } from '../public/lotes/js/tablero-datos.js';

const A = (lote, fecha, extra) => ({ lote, fecha_analisis: fecha, ...extra });

describe('ultimasMediciones', () => {
  it('trae las ultimas n del lote, de la mas nueva a la mas vieja', () => {
    const analisis = [
      A('26001', '2026-08-01', { ph: 3.5 }), A('26001', '2026-09-01', { ph: 3.6 }),
      A('26001', '2026-09-10', { ph: 3.7 }), A('26002', '2026-09-11', { ph: 3.9 }),
    ];
    const r = ultimasMediciones(analisis, '26001', 2);
    expect(r.map(f => f.fecha_analisis)).toEqual(['2026-09-10', '2026-09-01']);
  });

  it('descarta las filas sin fecha y las de otro lote', () => {
    const analisis = [A('26001', null, { ph: 3.5 }), A('26002', '2026-09-01', { ph: 3.6 })];
    expect(ultimasMediciones(analisis, '26001', 6)).toEqual([]);
  });

  it('descarta las filas sin ninguna medicion util', () => {
    const analisis = [A('26001', '2026-09-01', {}), A('26001', '2026-09-02', { so2_libre: 22 })];
    expect(ultimasMediciones(analisis, '26001', 6).map(f => f.fecha_analisis)).toEqual(['2026-09-02']);
  });

  it('el -999 del FOSS SI cuenta: es una corrida que existio, fuera de rango', () => {
    const analisis = [A('26001', '2026-09-01', { av: -999 })];
    expect(ultimasMediciones(analisis, '26001', 6)).toHaveLength(1);
  });

  it('empareja el lote aunque venga como numero', () => {
    expect(ultimasMediciones([A(26001, '2026-09-01', { ph: 3.5 })], '26001', 6)).toHaveLength(1);
  });
});
