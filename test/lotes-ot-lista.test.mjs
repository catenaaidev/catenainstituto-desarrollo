/* La lista de la sub-pestaña Órdenes de trabajo: filtro, orden y renglón de
 * lotes. Módulo puro, sin DOM. */
import { describe, it, expect } from 'vitest';
import { filtrarOrdenes, resumenLotes } from '../public/lotes/js/ot-lista.js';
import { resumenLotes as resumenA, filtrarOrdenes as filtrarA } from '../public/lotes/js/ot-lista.js';

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

describe('lista: Corte + achique', () => {
  const ot = { ot: '0944', fecha: '2026-10-14', lotes: [{ lote: '26034', mov_id: 'a' }, { lote: '26038', mov_id: 'b' }],
    lote_corte: { lote: '26323' }, achique: { destinos: [{ tipo: 'tanque', num: '206', lote: '26323' },
                                                         { tipo: 'tanque', num: '209', lote: '26324' }] } };
  it('el renglon dice adonde termina el vino', () => {
    expect(resumenA(ot)).toBe('26323 (corte de 2 lotes) → T 206 + T 209');
  });
  it('se encuentra buscando un lote hijo', () => {
    expect(filtrarA([ot], { soloPendientes: false, busca: '26324' })).toEqual([ot]);
  });
});

import { esProgramada, fechaOHoy } from '../public/lotes/js/ot-lista.js';

describe('fecha programada', () => {
  it('una OT pendiente con fecha posterior a hoy esta programada', () => {
    expect(esProgramada(o('A', '2026-11-02', 'pendiente', ['1']), '2026-10-27')).toBe(true);
  });
  it('hoy, una fecha pasada o una OT ejecutada no', () => {
    expect(esProgramada(o('A', '2026-10-27', 'pendiente', ['1']), '2026-10-27')).toBe(false);
    expect(esProgramada(o('A', '2026-10-20', 'pendiente', ['1']), '2026-10-27')).toBe(false);
    expect(esProgramada(o('A', '2026-11-02', 'ejecutado', ['1']), '2026-10-27')).toBe(false);
    expect(esProgramada(o('A', '', 'pendiente', ['1']), '2026-10-27')).toBe(false);
  });
  it('sin fecha programada queda la de hoy', () => {
    expect(fechaOHoy('', '2026-10-27')).toBe('2026-10-27');
    expect(fechaOHoy('  ', '2026-10-27')).toBe('2026-10-27');
    expect(fechaOHoy(undefined, '2026-10-27')).toBe('2026-10-27');
    expect(fechaOHoy('2026-11-02', '2026-10-27')).toBe('2026-11-02');
  });
});

describe('OT de Muestras (sin movimientos)', () => {
  const mu = { id: 'mu', ot: '0993', plantilla: 'muestras-ot', fecha: '2026-11-10', estado: 'pendiente',
    sin_movimientos: true, lotes: [], muestras: [{ lote: '26142', vasija: 'T50', muestra: '750 ml' },
                                                  { lote: '26143', vasija: 'T50', muestra: '750 ml' }] };
  it('no es huérfana aunque no tenga movimientos', () => {
    expect(filtrarOrdenes([mu], { movimientos: [] })).toEqual([mu]);
  });
  it('se busca y se resume por los lotes de su tabla', () => {
    expect(filtrarOrdenes([mu], { busca: '26143' })).toEqual([mu]);
    expect(resumenLotes(mu)).toBe('26142 · 26143');
  });
});

describe('destinos extra (2026-11-12)', () => {
  it('busca tambien por el lote de un tanque extra', () => {
    const ot = { id: 'a', ot: '0990', fecha: '2026-11-12', estado: 'pendiente', lotes: [{ lote: '26217', mov_id: 'm', destinos_extra: [{ num: '214', lote: '26330', mov_id: 'x' }] }] };
    expect(filtrarOrdenes([ot], { busca: '26330' })).toHaveLength(1);
  });
});

describe('agregados al confirmar en el resumen', () => {
  it('se marcan', () => {
    const ot = { ot: '0967', destino: 'T 48', lote_corte: { lote: '25315' }, lotes: [{ lote: '25312' }],
      destinos_extra: [{ tipo: 'chicas', barricas: 1, t50: 1, lote: '25315', al_confirmar: true, mov_id: 'a' }] };
    expect(resumenLotes(ot)).toBe('25315 (corte de 1 lotes) → T 48 + 1 barrica + 1 T50 (agregado al confirmar)');
  });
});
