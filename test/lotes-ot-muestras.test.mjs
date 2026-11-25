/* La OT de Muestras (0993) no mueve vino: su tabla es ot.muestras y se edita
 * sobre la hoja. Estas funciones no mutan lo que reciben: la vista asigna el
 * resultado a ot.muestras (asi Ctrl+Z y el autoguardado ven un cambio). */
import { describe, it, expect } from 'vitest';
import { MUESTRA_POR_DEFECTO, esSinMovimientos, filasDeOT, vasijaDeLote, filasIniciales, agregarFila,
  quitarFila, editarCeldaMuestra, lotesDeMuestras, armarOTMuestras } from '../public/lotes/js/ot-muestras.js';
import { movimientosDeOT, confirmarOT } from '../public/lotes/js/ot-armado.js';

const b = (num, cap, estado = 'LLENO') => ({ num, cap, estado });

describe('vasijaDeLote', () => {
  it('un T50 lleno del Mapa', () => {
    expect(vasijaDeLote({ barriles: [b('7053', 50)] })).toBe('1 T50 7053');
  });
  it('barricas + T50, sin contar las vacias', () => {
    expect(vasijaDeLote({ barriles: [b('1', 225), b('2', 225), b('3', 50), b('4', 225, 'VACIO')] }))
      .toBe('2 barricas + 1 T50');
  });
  it('tanque del padron y cantidad de barricas', () => {
    expect(vasijaDeLote({ tanques: [{ num: '12' }] })).toMatch(/12/);
    expect(vasijaDeLote({ cantidad_barricas: 4 })).toBe('4 Barricas');
  });
  it('sin nada, vacio', () => {
    expect(vasijaDeLote({})).toBe('');
    expect(vasijaDeLote()).toBe('');
  });
});

describe('filas', () => {
  const f0 = filasIniciales([{ lote: 26142, vasija: 'T50' }, { lote: '26143', vasija: '' }], ' 750 ml ');
  it('una fila por lote, con la muestra para todas', () => {
    expect(f0).toEqual([{ lote: '26142', vasija: 'T50', muestra: '750 ml' },
                        { lote: '26143', vasija: '', muestra: '750 ml' }]);
  });
  it('agregar copia la muestra de la ultima fila; sin filas, la muestra por defecto', () => {
    expect(agregarFila(f0).at(-1)).toEqual({ lote: '', vasija: '', muestra: '750 ml' });
    expect(agregarFila([])).toEqual([{ lote: '', vasija: '', muestra: MUESTRA_POR_DEFECTO }]);
    expect(f0).toHaveLength(2);   // no muta
  });
  it('quitar', () => {
    expect(quitarFila(f0, 0)).toEqual([f0[1]]);
    expect(quitarFila(f0, 9)).toEqual(f0);
    expect(f0).toHaveLength(2);
  });
  it('editar una celda devuelve filas nuevas; sin cambio o invalido, null', () => {
    const r = editarCeldaMuestra(f0, 1, 'vasija', '3 barricas');
    expect(r[1].vasija).toBe('3 barricas');
    expect(f0[1].vasija).toBe('');
    expect(editarCeldaMuestra(f0, 0, 'vasija', 'T50')).toBeNull();
    expect(editarCeldaMuestra(f0, 0, 'check', 'x')).toBeNull();
    expect(editarCeldaMuestra(f0, 7, 'lote', '1')).toBeNull();
  });
});

describe('la OT', () => {
  const ot = armarOTMuestras({ id: 'ot-x', numero: '0993', fecha: '2026-11-10', emitio: 'Oriana',
    filas: [{ lote: '26142', vasija: 'T50', muestra: '750 ml' }, { lote: '', vasija: '', muestra: '' },
            { lote: '26142', vasija: 'barrica', muestra: '750 ml' }], usuario: 'oriana', hoy: '2026-11-10' });
  it('se arma pendiente, sin lotes ni movimientos, con la tabla sin filas vacias', () => {
    expect(ot).toMatchObject({ id: 'ot-x', ot: '0993', plantilla: 'muestras-ot', fecha: '2026-11-10',
      estado: 'pendiente', emitio: 'Oriana', lotes: [], sin_movimientos: true });
    expect(ot.muestras).toHaveLength(2);
    expect(esSinMovimientos(ot)).toBe(true);
    expect(esSinMovimientos({ lotes: [] })).toBe(false);
    expect(movimientosDeOT(ot, 'oriana', '2026-11-10')).toEqual([]);
  });
  it('lotes de la tabla sin repetir; filasDeOT tolera OT viejas', () => {
    expect(lotesDeMuestras(ot)).toEqual(['26142']);
    expect(filasDeOT({})).toEqual([]);
    expect(lotesDeMuestras({})).toEqual([]);
  });
  it('confirmarOT sin lotes: marca ejecutada y no faltan vasijas', () => {
    const r = confirmarOT(ot, [], { operario: 'x', pasos_cumplidos: true, comentario: '' }, 'x', '2026-11-11');
    expect(r).toEqual([]);
    expect(ot.estado).toBe('ejecutado');
    expect(ot.confirmada_por).toBe('x');
  });
});
