import { describe, it, expect } from 'vitest';
import { resumenOrdenes, numerosDeDocumento, SERIE_PRENSAS } from '../src/ordenes/resumen';
// @ts-ignore - módulo puro de Prensas (Task 4), sin declaración de tipos
import { TIPOS_HOJA_PRENSAS, numerosWebPrensas } from '../public/prensas/js/hojas-prensas.js';

const OT = (x: Record<string, unknown>) => ({
  id: 'ot-1', ot: '0945', plantilla: 'barricas-barricas', fecha: '2026-11-03',
  estado: 'pendiente', emitio: 'Ana', lotes: [{ lote: '26217', mov_id: 'm1' }], ...x,
});

describe('resumenOrdenes — Lotes', () => {
  it('resume una OT de movimientos', () => {
    const r = resumenOrdenes('lotes', { ordenes_trabajo: [OT({})], movimientos: [{ id: 'm1' }] });
    expect(r).toEqual([{
      modulo: 'lotes', id: 'ot-1', fuente: 'ordenes_trabajo', tipo: 'barricas-barricas',
      numero: '0945', fecha: '2026-11-03', estado: 'pendiente', lotes: ['26217'],
      lote_corte: '', emitio: 'Ana',
    }]);
  });

  it('una OT con estado ejecutado (o sin estado) sale como ejecutada', () => {
    const d = { ordenes_trabajo: [OT({ estado: 'ejecutado' }), OT({ id: 'ot-2', estado: undefined, lotes: [{ lote: '1', mov_id: 'm1' }] })],
                movimientos: [{ id: 'm1' }] };
    expect(resumenOrdenes('lotes', d).map((o) => o.estado)).toEqual(['ejecutada', 'ejecutada']);
  });

  it('oculta las OT huérfanas (ningún movimiento vivo), igual que filtrarOrdenes', () => {
    const r = resumenOrdenes('lotes', { ordenes_trabajo: [OT({})], movimientos: [{ id: 'otro' }] });
    expect(r).toEqual([]);
  });

  it('el lote del corte va en lote_corte', () => {
    const r = resumenOrdenes('lotes', {
      ordenes_trabajo: [OT({ plantilla: 'barricas-tanque', lote_corte: { lote: '26900' } })],
      movimientos: [{ id: 'm1' }],
    });
    expect(r[0].lote_corte).toBe('26900');
  });

  it('resume una orden de corrección SO₂ con sus tres estados', () => {
    const oc = (id: string, estado: string) => ({ id, numero: 'B240', fecha: '2026-11-02', emitio: 'Luis',
      estado, lotes: [{ lote: '26100' }, { lote: '26101' }] });
    const r = resumenOrdenes('lotes', { ordenes_correccion: [oc('oc-a', 'pendiente'), oc('oc-b', 'ejecutada'), oc('oc-c', 'anulada')] });
    expect(r.map((o) => [o.id, o.fuente, o.tipo, o.estado])).toEqual([
      ['oc-a', 'ordenes_correccion', 'correccion', 'pendiente'],
      ['oc-b', 'ordenes_correccion', 'correccion', 'ejecutada'],
      ['oc-c', 'ordenes_correccion', 'correccion', 'anulada'],
    ]);
    expect(r[0].lotes).toEqual(['26100', '26101']);
    expect(r[0].numero).toBe('B240');
  });

  it('ordena por fecha y número, lo más nuevo primero', () => {
    const r = resumenOrdenes('lotes', {
      ordenes_trabajo: [OT({ id: 'a', ot: '0900', fecha: '2026-10-01' }), OT({ id: 'b', ot: '0950', fecha: '2026-11-01' })],
      ordenes_correccion: [{ id: 'c', numero: 'B1', fecha: '2026-10-15', estado: 'pendiente', lotes: [] }],
      movimientos: [{ id: 'm1' }],
    });
    expect(r.map((o) => o.id)).toEqual(['b', 'c', 'a']);
  });

  it('tolera secciones ausentes o filas basura', () => {
    expect(resumenOrdenes('lotes', {})).toEqual([]);
    expect(resumenOrdenes('lotes', { ordenes_trabajo: [null, 3], ordenes_correccion: [null] })).toEqual([]);
  });

  it('una OT sin movimientos (Muestras) se ve, con los lotes de su tabla', () => {
    const r = resumenOrdenes('lotes', { movimientos: [], ordenes_trabajo: [OT({
      plantilla: 'muestras-ot', sin_movimientos: true, lotes: [],
      muestras: [{ lote: '26142' }, { lote: '26142' }, { lote: '' }, { lote: '26143' }] })] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: 'muestras-ot', estado: 'pendiente', lotes: ['26142', '26143'] });
  });

  it('resume las órdenes de papel guardadas', () => {
    const r = resumenOrdenes('lotes', { ordenes_hojas: [
      { id: 'oh-1', tipo: 'muestras', ot: '0950', fecha: '2026-11-04', estado: 'pendiente', emitida_por: 'Ana', lotes: [{ lote: '26034' }] },
      { id: 'oh-2', tipo: 'agregados', ot: 'B250', fecha: '2026-11-03', estado: 'anulada', emitida_por: 'Luis', lotes: [] },
      { id: 'oh-3', tipo: 'micro', ot: '0951', fecha: '2026-11-02', estado: 'raro', lotes: [] },
    ] });
    expect(r.map((o) => [o.id, o.fuente, o.tipo, o.numero, o.estado, o.emitio])).toEqual([
      ['oh-1', 'ordenes_hojas', 'muestras', '0950', 'pendiente', 'Ana'],
      ['oh-2', 'ordenes_hojas', 'agregados', 'B250', 'anulada', 'Luis'],
      ['oh-3', 'ordenes_hojas', 'micro', '0951', 'ejecutada', ''],
    ]);
    expect(r[0].lotes).toEqual(['26034']);
  });
});

describe('resumenOrdenes — Prensas', () => {
  it('sin ordenes_hojas no hay órdenes guardadas', () => {
    expect(resumenOrdenes('prensas', { lotes: [{ lote: '1' }] })).toEqual([]);
  });

  it('Prensas: las órdenes de papel guardadas', () => {
    const datos = { ordenes_hojas: [
      { id: 'oh-1', tipo: 'prensas-rellenos', ot: '0951', fecha: '2026-11-04', estado: 'pendiente', emitida_por: 'Ana', lotes: [{ lote: '25012' }] },
      { id: 'oh-2', tipo: 'prensas-accion', ot: 'B243', fecha: '2026-11-03', estado: 'ejecutada', emitida_por: 'Luis', lotes: [] },
    ] };
    expect(resumenOrdenes('prensas', datos)).toEqual([
      { modulo: 'prensas', id: 'oh-1', fuente: 'ordenes_hojas', tipo: 'prensas-rellenos', numero: '0951', fecha: '2026-11-04',
        estado: 'pendiente', lotes: ['25012'], lote_corte: '', emitio: 'Ana' },
      { modulo: 'prensas', id: 'oh-2', fuente: 'ordenes_hojas', tipo: 'prensas-accion', numero: 'B243', fecha: '2026-11-03',
        estado: 'ejecutada', lotes: [], lote_corte: '', emitio: 'Luis' },
    ]);
  });
});

describe('numerosDeDocumento', () => {
  it('cada serie, de los dos módulos', () => {
    const prensas = { ordenes_hojas: [
      { id: 'a', tipo: 'prensas-muestras', ot: '0951' }, { id: 'b', tipo: 'prensas-agregados', ot: 'B244' },
      { id: 'c', tipo: 'prensas-accion', ot: 'b245' }, { id: 'd', tipo: 'prensas-rellenos', ot: '' } ] };
    expect(numerosDeDocumento('prensas', prensas, 'principal')).toEqual([951]);
    expect(numerosDeDocumento('prensas', prensas, 'B')).toEqual([244, 245]);
    const lotes = {
      movimientos: [{ id: 'm', ot: '0940' }], ordenes_trabajo: [{ id: 't', ot: '0941' }],
      analisis: [{ correccion: { ot_n: 'B230' }, agregados: [{ ot_n: 'B231' }] }],
      ordenes_correccion: [{ id: 'oc', numero: 'B232' }],
      ordenes_hojas: [{ id: 'h1', tipo: 'muestras', ot: '0942' }, { id: 'h2', tipo: 'agregados', ot: 'B233' }],
    };
    expect(numerosDeDocumento('lotes', lotes, 'principal')).toEqual([940, 941, 942]);
    expect(numerosDeDocumento('lotes', lotes, 'B')).toEqual([230, 231, 232, 233]);
  });

  it('espejo con TIPOS_HOJA_PRENSAS / numerosWebPrensas de hojas-prensas.js (Task 4)', () => {
    for (const [id, t] of Object.entries(TIPOS_HOJA_PRENSAS) as [string, { serie: string }][]) expect(SERIE_PRENSAS[id]).toBe(t.serie);
    const prensas = { ordenes_hojas: [
      { id: 'a', tipo: 'prensas-muestras', ot: '0951' }, { id: 'b', tipo: 'prensas-agregados', ot: 'B244' },
      { id: 'c', tipo: 'prensas-accion', ot: 'b245' }, { id: 'd', tipo: 'prensas-rellenos', ot: '' } ] };
    expect(numerosWebPrensas(prensas, 'principal')).toEqual(numerosDeDocumento('prensas', prensas, 'principal'));
    expect(numerosWebPrensas(prensas, 'B')).toEqual(numerosDeDocumento('prensas', prensas, 'B'));
  });
});
