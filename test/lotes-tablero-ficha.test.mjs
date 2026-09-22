/* Importa de tablero-datos.js, NO de tablero-ficha.js (ver Tarea 4). */
import { describe, it, expect } from 'vitest';
import { ultimasMediciones, aplicarEdicion } from '../public/lotes/js/tablero-datos.js';

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

  it('un analisis excluido no aparece en el resultado', () => {
    const analisis = [
      A('26001', '2026-09-10', { malico: 0.1 }),
      A('26001', '2026-09-05', { malico: 2.1 }),
    ];
    // La segunda fila esta excluida por el motor (usar_registro='no').
    const excluidas = new Set(['26001|2026-09-05']);
    const r = ultimasMediciones(analisis, '26001', 6, excluidas);
    expect(r).toHaveLength(1);
    expect(r[0].fecha_analisis).toBe('2026-09-10');
  });

  it('la exclusion es por lote+fecha: otro lote con la misma fecha no se descarta', () => {
    const analisis = [
      A('26001', '2026-09-05', { malico: 2.1 }),
      A('26002', '2026-09-05', { malico: 1.8 }),
    ];
    // Solo se excluye 26001 en esa fecha; 26002 sigue disponible.
    const excluidas = new Set(['26001|2026-09-05']);
    expect(ultimasMediciones(analisis, '26001', 6, excluidas)).toHaveLength(0);
    expect(ultimasMediciones(analisis, '26002', 6, excluidas)).toHaveLength(1);
  });
});

const datos = () => ({ lotes: [{ lote: '26001', variedad: 'Malbec' }], estado_lote: {}, analisis: [] });

describe('aplicarEdicion', () => {
  it('mermo y hace_fml van a la fila del lote', () => {
    const d = datos();
    expect(aplicarEdicion(d, '26001', 'mermo', 'no', 'Roy').seccion).toBe('lote');
    expect(d.lotes[0].mermo).toBe('no');
    aplicarEdicion(d, '26001', 'hace_fml', 'si', 'Roy');
    expect(d.lotes[0].hace_fml).toBe('si');
    expect(d.estado_lote['26001']?.mermo).toBeUndefined();   // no duplica el dato en estado_lote
  });

  it('comentario e inoculado van a estado_lote, que no tiene columna propia', () => {
    const d = datos();
    expect(aplicarEdicion(d, '26001', 'comentario', 'ojo con este', 'Roy').seccion).toBe('estado_lote');
    expect(d.estado_lote['26001'].comentario).toBe('ojo con este');
    expect(d.estado_lote['26001'].actualizado_por).toBe('Roy');
    expect(d.lotes[0].comentario).toBeUndefined();
  });

  it('firma quien y cuando en los dos destinos', () => {
    const d = datos();
    aplicarEdicion(d, '26001', 'mermo', 'si', 'Roy');
    expect(d.estado_lote['26001'].actualizado_por).toBe('Roy');
    expect(d.estado_lote['26001'].actualizado_el).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('el vacio se guarda como null, no como cadena vacia', () => {
    const d = datos();
    aplicarEdicion(d, '26001', 'comentario', '  ', 'Roy');
    expect(d.estado_lote['26001'].comentario).toBeNull();
  });

  it('un campo que no es de la ficha no escribe nada', () => {
    const d = datos();
    expect(aplicarEdicion(d, '26001', 'litros_actuales', '999', 'Roy').seccion).toBeNull();
    expect(d.lotes[0].litros_actuales).toBeUndefined();
  });

  it('un lote que no existe no crea una fila fantasma', () => {
    const d = datos();
    expect(aplicarEdicion(d, '99999', 'mermo', 'no', 'Roy').seccion).toBeNull();
    expect(d.lotes).toHaveLength(1);
  });
});
