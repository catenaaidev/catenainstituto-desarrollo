/* Lotes en objetivo / corregidos hace poco que se suman a mano a la Orden de
 * correccion (orden-correccion-activables.js) y su paso por la orden guardada. */
import { describe, it, expect } from 'vitest';
import { ordenConActivables, activablesDe, diferenciaDosificable, ETIQUETA_FUERA }
  from '../public/lotes/js/orden-correccion-activables.js';
import { armarOrdenGuardada } from '../public/lotes/js/orden-correccion-guardada.js';

const orden = {
  lotes: [{ lote: '26001' }],
  activables: [{ lote: '26002', fuera: 'en_objetivo' }, { lote: '26003', fuera: 'corregido' }],
  suprimidos: [{ lote: '26003' }],
};

describe('ordenConActivables', () => {
  it('apagado devuelve la orden tal cual', () => {
    expect(ordenConActivables(orden, false)).toBe(orden);
  });
  it('prendido suma los activables al final, sin tocar la original', () => {
    const o = ordenConActivables(orden, true);
    expect(o.lotes.map(l => l.lote)).toEqual(['26001', '26002', '26003']);
    expect(o.suprimidos).toBe(orden.suprimidos);
    expect(orden.lotes).toHaveLength(1);
  });
  it('una respuesta vieja sin activables no rompe', () => {
    const vieja = { lotes: [{ lote: '1' }] };
    expect(ordenConActivables(vieja, true)).toBe(vieja);
    expect(activablesDe(null)).toEqual([]);
    expect(ordenConActivables(null, true)).toBe(null);
  });
});

describe('diferenciaDosificable', () => {
  it('nunca negativa', () => {
    expect(diferenciaDosificable(30, 40)).toBe(0);
    expect(diferenciaDosificable(30, 30)).toBe(0);
    expect(diferenciaDosificable(35, 30)).toBe(5);
    expect(diferenciaDosificable(NaN, 30)).toBe(0);
  });
});

describe('orden guardada', () => {
  it('marca el lote sumado a mano con el motivo', () => {
    const b = { num: '1', vasija: '', cap: 225, estado: 'LLENO', litros_usados: 225 };
    const filas = [
      { tipo: 'lote', lote: { lote: '26002', variedad: 'Malbec', so2_libre: 40, fuera: 'en_objetivo' },
        objetivo: 45, diferencia: 5, mbk_total_g: 3, ml_total: 30 },
      { tipo: 'barrica', lote: { lote: '26002' }, barrica: b, dosis: { mbk_g: 3, ml_solucion: 30 } },
      { tipo: 'lote', lote: { lote: '26001', variedad: 'Malbec', so2_libre: 10 },
        objetivo: 30, diferencia: 20, mbk_total_g: 13, ml_total: 120 },
      { tipo: 'barrica', lote: { lote: '26001' }, barrica: b, dosis: { mbk_g: 13, ml_solucion: 120 } },
    ];
    const o = armarOrdenGuardada({ id: 'x', numero: 'B1', fecha: '2026-11-02', unidad: 'sol', filas, modos: new Map() });
    expect(o.lotes[0].fuera).toBe('en_objetivo');
    expect(ETIQUETA_FUERA[o.lotes[0].fuera]).toBe('en objetivo');
    expect(o.lotes[1].fuera).toBeUndefined();
  });
});
