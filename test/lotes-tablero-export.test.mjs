import { describe, it, expect } from 'vitest';
import { filasExport } from '../public/lotes/js/tablero-export.js';

const HOY = '2026-09-16';
const fila = (lote, condiciones) => ({
  lote, litros: 1000, _info: { vasija_actual: 'B-12' }, condiciones,
});

describe('filasExport', () => {
  it('una fila por condicion activa, no una por lote', () => {
    const filas = [fila('26001', [
      { clave: 'ph_no_ok', etiqueta: 'pH no OK', accion: 'x', desde: '2026-09-14' },
      { clave: 'no_lleno', etiqueta: 'No lleno', accion: 'y', desde: null },
    ])];
    const r = filasExport(filas, HOY);
    expect(r).toHaveLength(2);
    expect(r.map(f => f.condicion)).toEqual(['pH no OK', 'No lleno']);
  });

  it('trae vasija, litros, desde y antiguedad', () => {
    const r = filasExport([fila('26001', [{ clave: 'ph_no_ok', etiqueta: 'pH no OK', accion: 'x', desde: '2026-09-14' }])], HOY);
    expect(r[0]).toEqual({ lote: '26001', vasija: 'B-12', litros: 1000, condicion: 'pH no OK', desde: '2026-09-14', antiguedad: '2 d' });
  });

  it('la condicion sin fecha deja desde y antiguedad vacios', () => {
    const r = filasExport([fila('26001', [{ clave: 'no_lleno', etiqueta: 'No lleno', accion: 'y', desde: null }])], HOY);
    expect(r[0].desde).toBe('');
    expect(r[0].antiguedad).toBe('');
  });

  it('los lotes sin condiciones no entran', () => {
    expect(filasExport([fila('26001', [])], HOY)).toEqual([]);
  });
});
