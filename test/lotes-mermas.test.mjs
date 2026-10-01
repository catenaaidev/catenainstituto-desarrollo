/* Barricas mermas: lo que les falta se descuenta de los litros del lote
 * hasta que se completan (spec 2026-10-01, D5 y D7). */
import { describe, it, expect } from 'vitest';
import { codigoLote, faltanteDe, estaPendiente, faltanteDeLote, litrosDelLote, nuevaMerma,
         llenaSegunMapa, resolver, cerrarLlenasSegunMapa, recalcularLitros } from '../public/lotes/js/mermas.js';
import { litrosDeEnvases } from '../public/lotes/js/envases.js';

const M = (extra = {}) => nuevaMerma({ lote: '26217', barril: '2221713', cap: 225, litros: 180,
  desde: '2026-10-01', ot: 'OT-2026-014', ...extra }, 'mer-1');

describe('codigoLote', () => {
  it('se queda con los 5 digitos del lote', () => {
    expect(codigoLote('26730 ROJO')).toBe('26730');
    expect(codigoLote(26217)).toBe('26217');
    expect(codigoLote(' VERMUT ')).toBe('VERMUT');
  });
});

describe('faltante', () => {
  it('es cap - litros, nunca negativo', () => {
    expect(faltanteDe(M())).toBe(45);
    expect(faltanteDe(M({ litros: 230 }))).toBe(0);
  });
  it('solo cuentan las pendientes del lote', () => {
    const resuelta = M({ barril: '9' }); resuelta.resuelta_el = '2026-10-02';
    const otro = M({ lote: '26300' });
    expect(faltanteDeLote([M(), resuelta, otro], 26217)).toBe(45);
  });
});

describe('litrosDelLote', () => {
  it('12 x 225 con una barrica de 180 da 2655', () => {
    expect(litrosDelLote({ lote: 26217, cap225: 12 }, [M()])).toBe(2655);
  });
  it('sin mermas es la invariante de siempre', () => {
    for (const l of [{ cap225: 4 }, { vasija_grande: 3500 }, { cap225: 2, vasija_grande: 1500.5 }, {}])
      expect(litrosDelLote({ lote: 1, ...l }, [])).toBe(litrosDeEnvases(l));
  });
  it('nunca baja de 0', () => {
    expect(litrosDelLote({ lote: 26217 }, [M()])).toBe(0);
  });
});

describe('llenaSegunMapa', () => {
  it('LLENO con el mismo lote y fecha posterior', () => {
    expect(llenaSegunMapa(M(), { estado: 'LLENO', lote: '26217 CHECK', fecha: '2026-10-03' })).toBe(true);
  });
  it('no si sigue MERMO, cambio de lote, la fecha es anterior o no hay barril', () => {
    expect(llenaSegunMapa(M(), { estado: 'MERMO', lote: '26217', fecha: '2026-10-03' })).toBe(false);
    expect(llenaSegunMapa(M(), { estado: 'LLENO', lote: '26300', fecha: '2026-10-03' })).toBe(false);
    expect(llenaSegunMapa(M(), { estado: 'LLENO', lote: '26217', fecha: '2026-09-30' })).toBe(false);
    expect(llenaSegunMapa(M(), { estado: 'LLENO', lote: '26217', fecha: '' })).toBe(false);
    expect(llenaSegunMapa(M(), null)).toBe(false);
  });
});

describe('cerrar', () => {
  it('cerrarLlenasSegunMapa marca como mapa y devuelve los lotes', () => {
    const ms = [M(), M({ barril: '5' })];
    const lotes = cerrarLlenasSegunMapa(ms, { '2221713': { estado: 'LLENO', lote: '26217', fecha: '2026-10-05' } },
      'ana', '2026-10-06');
    expect([...lotes]).toEqual(['26217']);
    expect(ms[0]).toMatchObject({ resuelta_el: '2026-10-06', resuelta_por: 'ana', resuelta_como: 'mapa' });
    expect(estaPendiente(ms[1])).toBe(true);
  });
  it('resolver a mano', () => {
    const m = M(); resolver(m, 'manual', 'roy', '2026-10-07');
    expect(m).toMatchObject({ resuelta_como: 'manual', resuelta_por: 'roy' });
    expect(estaPendiente(m)).toBe(false);
  });
  it('recalcularLitros vuelve el lote a sus envases al cerrar la merma', () => {
    const lote = { lote: 26217, cap225: 12, litros_actuales: 2655 };
    const ms = [M()]; resolver(ms[0], 'mapa', 'x', '2026-10-06');
    recalcularLitros([lote], ms, new Set(['26217']));
    expect(lote.litros_actuales).toBe(2700);
  });
});
