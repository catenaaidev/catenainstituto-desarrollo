/* Tests de la linea "de donde salen estas filas" de la Orden de muestras. */
import { describe, it, expect } from 'vitest';
import { resumenOrden } from '../public/lotes/js/orden-resumen.js';

const F = (lote, manual = false) => ({ lote, manual });

describe('resumenOrden', () => {
  it('cuenta los lotes y nombra la fuente', () => {
    const r = resumenOrden({ filas: [F('1'), F('2'), F('')], fuente: 'vencidos', etiquetaFuente: 'Vencidos' });
    expect(r.titulo).toBe('2 lotes en la orden');
    expect(r.detalle).toBe('salen de «Vencidos»');
  });
  it('con barriles especificos cuenta lotes distintos y barriles', () => {
    const r = resumenOrden({ filas: [{ lote: '1', barril: '7' }, { lote: '1', barril: '8' }, { lote: '2', barril: '' }],
                             fuente: 'todos', etiquetaFuente: 'Todos' });
    expect(r.titulo).toBe('2 lotes en la orden · 2 barriles');
  });
  it('singular y orden vacia', () => {
    expect(resumenOrden({ filas: [F('1')], fuente: 'todos', etiquetaFuente: 'Todos' }).titulo).toBe('1 lote en la orden');
    expect(resumenOrden({ filas: [], fuente: 'hoja_en_blanco' })).toEqual({ titulo: 'Orden vacía', detalle: 'pegá lotes, tipealos en la hoja o elegí qué lotes entran' });
  });
  it('suma los agregados a mano, los filtros y el buscador', () => {
    const r = resumenOrden({ filas: [F('1'), F('2', true)], fuente: 'vencidos', etiquetaFuente: 'Vencidos',
                             filtros: ['Variedad', 'Etapa'], busqueda: ' malbec ' });
    expect(r.detalle).toBe('salen de «Vencidos» · 1 agregado a mano · filtrado por Variedad, Etapa · buscando «malbec»');
  });
  it('en hoja en blanco distingue los cargados a mano de los elegidos con filtros', () => {
    const r = resumenOrden({ filas: [F('1', true), F('2', true), F('3')], fuente: 'hoja_en_blanco', filtros: ['Lote'] });
    expect(r.detalle).toBe('2 cargados a mano · 1 elegido con los filtros · filtrado por Lote');
  });
});
