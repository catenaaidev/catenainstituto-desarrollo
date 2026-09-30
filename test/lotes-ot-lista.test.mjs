/* La lista de la sub-pestaña Órdenes de trabajo: filtro, orden y renglón de
 * lotes. Módulo puro, sin DOM. */
import { describe, it, expect } from 'vitest';
import { filtrarOrdenes, resumenLotes } from '../public/lotes/js/ot-lista.js';

const o = (ot, fecha, estado, lotes, extra) => ({ id: 'id-' + ot, ot, fecha, estado,
  lotes: lotes.map(lote => ({ lote })), ...(extra || {}) });
const LISTA = [
  o('OT-2026-001', '2026-09-01', 'ejecutado', ['26100']),
  o('OT-2026-003', '2026-09-20', 'pendiente', ['26217', '26218']),
  o('OT-2026-002', '2026-09-20', 'pendiente', ['26300']),
];

describe('filtrarOrdenes', () => {
  it('por defecto solo pendientes, mas nueva primero', () => {
    expect(filtrarOrdenes(LISTA).map(x => x.ot)).toEqual(['OT-2026-003', 'OT-2026-002']);
  });
  it('todas', () => {
    expect(filtrarOrdenes(LISTA, { soloPendientes: false }).map(x => x.ot))
      .toEqual(['OT-2026-003', 'OT-2026-002', 'OT-2026-001']);
  });
  it('busca por numero o por lote', () => {
    expect(filtrarOrdenes(LISTA, { soloPendientes: false, busca: '001' }).map(x => x.ot)).toEqual(['OT-2026-001']);
    expect(filtrarOrdenes(LISTA, { busca: '26218' }).map(x => x.ot)).toEqual(['OT-2026-003']);
  });
  it('busca por el lote del corte', () => {
    const c = o('OT-2026-009', '2026-09-25', 'pendiente', ['1'], { lote_corte: { lote: '26999' } });
    expect(filtrarOrdenes([c], { busca: '26999' })).toHaveLength(1);
  });
  it('con movimientos, oculta las OT a las que no les queda ninguno', () => {
    const conMov = { ...o('OT-2026-020', '2026-09-29', 'pendiente', ['1']), lotes: [{ lote: '1', mov_id: 'a-0' }] };
    const huerfana = { ...o('OT-2026-021', '2026-09-29', 'pendiente', ['2']), lotes: [{ lote: '2', mov_id: 'b-0' }] };
    expect(filtrarOrdenes([conMov, huerfana], { movimientos: [{ id: 'a-0' }] }).map(x => x.ot)).toEqual(['OT-2026-020']);
    // sin pasar movimientos no se filtra por esto
    expect(filtrarOrdenes([conMov, huerfana])).toHaveLength(2);
  });
  it('no muta la lista', () => {
    const copia = LISTA.map(x => x.ot);
    filtrarOrdenes(LISTA, { soloPendientes: false });
    expect(LISTA.map(x => x.ot)).toEqual(copia);
  });
});

describe('resumenLotes', () => {
  it('lista los lotes', () => {
    expect(resumenLotes(o('x', '', '', ['1', '2']))).toBe('1 · 2');
  });
  it('corta a cuatro', () => {
    expect(resumenLotes(o('x', '', '', ['1', '2', '3', '4', '5', '6']))).toBe('1 · 2 · 3 · 4 +2');
  });
  it('un corte se nombra por el lote que forma', () => {
    const c = o('x', '', '', ['1', '2', '3'], { lote_corte: { lote: '26999' } });
    expect(resumenLotes(c)).toBe('26999 (corte de 3 lotes)');
  });
});
