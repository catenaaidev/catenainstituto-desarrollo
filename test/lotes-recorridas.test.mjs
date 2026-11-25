/* Recorrida del inventario de tanques: medir por cm y corregir litros con check. */
import { describe, it, expect } from 'vitest';
import { medirFila, nuevaRecorrida, aplicarDiferencias } from '../public/lotes/js/recorridas.js';

const filaInv = (extra = {}) => ({ num: '201', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: 'tanque-75hl',
  lotes: [{ lote: '25313', litros: 7500 }], litros: 7500, ...extra });

describe('medirFila', () => {
  it('sin nada cargado da null', () => {
    expect(medirFila(filaInv(), { cm: '', velo: false, obs: '', estado_manual: '' })).toBeNull();
  });
  it('con cm calcula litros por cubicacion y guarda la foto de la web', () => {
    const f = medirFila(filaInv(), { cm: '0', velo: true, obs: ' Brett ', estado_manual: '' });
    expect(f).toEqual({ vasija: '201', lote: '25313', cm: 0, litros_medidos: 7500, litros_web: 7500,
      velo: true, obs: 'Brett', estado_manual: '', aplicado: null });
  });
  it('acepta coma decimal', () => {
    expect(medirFila(filaInv(), { cm: '2,5' }).cm).toBe(2.5);
  });
  it('vasija sin tabla: guarda cm pero sin litros', () => {
    const f = medirFila(filaInv({ tabla: null }), { cm: '3' });
    expect(f).toMatchObject({ cm: 3, litros_medidos: null });
  });
  it('vasija vacia: lote vacio', () => {
    const f = medirFila(filaInv({ lotes: [], litros: 0 }), { estado_manual: 'FUERA DE SERVICIO' });
    expect(f).toMatchObject({ lote: '', estado_manual: 'FUERA DE SERVICIO', cm: null });
  });
});

describe('nuevaRecorrida', () => {
  it('descarta las filas null', () => {
    expect(nuevaRecorrida({ id: 'rec-1', fecha: '2026-10-14', por: 'oriana', filas: [null, { vasija: '201' }] }))
      .toEqual({ id: 'rec-1', fecha: '2026-10-14', por: 'oriana', filas: [{ vasija: '201' }] });
  });
});

describe('aplicarDiferencias', () => {
  const datos = (loteExtra = {}, filaExtra = {}) => ({
    lotes: [{ lote: '25313', vasija_actual: 'T 201', vasija_grande: 7500, litros_actuales: 7500, ...loteExtra }],
    mermas: [],
    recorridas: [{ id: 'rec-1', fecha: '2026-10-14', por: 'oriana', filas: [
      { vasija: '201', lote: '25313', cm: 3, litros_medidos: 7420, litros_web: 7500, aplicado: null, ...filaExtra }] }],
  });

  it('escribe vasija_grande, recalcula litros_actuales y anota lo que habia', () => {
    const d = datos();
    const r = aplicarDiferencias(d, [{ recorrida_id: 'rec-1', vasija: '201' }], 'roy', '2026-10-14');
    expect(r).toEqual({ aplicados: ['25313'], salteados: [] });
    expect(d.lotes[0]).toMatchObject({ vasija_grande: 7420, litros_actuales: 7420 });
    expect(d.recorridas[0].filas[0].aplicado).toEqual({ el: '2026-10-14', por: 'roy',
      antes: { vasija_grande: 7500, litros_actuales: 7500 } });
  });

  it('respeta los otros envases del lote', () => {
    const d = datos({ vasija_actual: 'H 201 + Barricas', cap225: 2, litros_actuales: 7950 });
    aplicarDiferencias(d, [{ recorrida_id: 'rec-1', vasija: '201' }], 'roy', '2026-10-14');
    expect(d.lotes[0].litros_actuales).toBe(7420 + 450);
  });

  it('saltea si el lote ya no esta en esa vasija', () => {
    const d = datos({ vasija_actual: 'T 202' });
    expect(aplicarDiferencias(d, [{ recorrida_id: 'rec-1', vasija: '201' }], 'roy', '2026-10-14'))
      .toEqual({ aplicados: [], salteados: [{ vasija: '201', motivo: 'lote-movido' }] });
    expect(d.lotes[0].vasija_grande).toBe(7500);
  });

  it('saltea un lote en dos vasijas del padron', () => {
    const d = datos({ vasija_actual: 'T 201 + T 202' });
    expect(aplicarDiferencias(d, [{ recorrida_id: 'rec-1', vasija: '201' }], 'roy', '2026-10-14').salteados)
      .toEqual([{ vasija: '201', motivo: 'varias-vasijas' }]);
  });

  it('saltea sin litros medidos y ya aplicada', () => {
    expect(aplicarDiferencias(datos({}, { litros_medidos: null }), [{ recorrida_id: 'rec-1', vasija: '201' }], 'r', 'h').salteados[0].motivo)
      .toBe('sin-litros');
    expect(aplicarDiferencias(datos({}, { aplicado: { el: 'x' } }), [{ recorrida_id: 'rec-1', vasija: '201' }], 'r', 'h').salteados[0].motivo)
      .toBe('ya-aplicada');
  });
});

describe('aplicarDiferencias: la web cambio despues de medir', () => {
  it('saltea con web-cambio y no toca el lote', () => {
    const d = {
      lotes: [{ lote: '25313', vasija_actual: 'T 201', vasija_grande: 7500, litros_actuales: 7500 }], mermas: [],
      recorridas: [{ id: 'rec-1', fecha: '2026-10-14', por: 'oriana', filas: [
        { vasija: '201', lote: '25313', cm: 3, litros_medidos: 7420, litros_web: 7400, aplicado: null }] }],
    };
    expect(aplicarDiferencias(d, [{ recorrida_id: 'rec-1', vasija: '201' }], 'roy', '2026-10-14'))
      .toEqual({ aplicados: [], salteados: [{ vasija: '201', motivo: 'web-cambio' }] });
    expect(d.lotes[0]).toMatchObject({ vasija_grande: 7500, litros_actuales: 7500 });
    expect(d.recorridas[0].filas[0].aplicado).toBeNull();
  });
  it('sin vasija_grande compara contra litros_actuales', () => {
    const d = {
      lotes: [{ lote: '25313', vasija_actual: 'T 201', vasija_grande: null, litros_actuales: 7500 }], mermas: [],
      recorridas: [{ id: 'rec-1', fecha: '2026-10-14', por: 'oriana', filas: [
        { vasija: '201', lote: '25313', cm: 3, litros_medidos: 7420, litros_web: 7500, aplicado: null }] }],
    };
    expect(aplicarDiferencias(d, [{ recorrida_id: 'rec-1', vasija: '201' }], 'roy', '2026-10-14').aplicados).toEqual(['25313']);
  });
});
