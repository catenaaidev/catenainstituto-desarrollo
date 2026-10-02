/* Borrar una OT ya aplicada: los lotes vuelven a la foto del "antes" que
 * guardó la OT, salvo los que alguien cambió después (esos no se tocan). Las
 * mermas que creó la OT se borran y las que cerró por vaciarlas se reabren. */
import { describe, it, expect } from 'vitest';
import { proponer, aplicarPropuesta } from '../public/lotes/js/propuesta-ot.js';
import { planDeshacer, aplicarDeshacer } from '../public/lotes/js/ot-deshacer.js';

const PADRON = [{ num: '189', tipo: 'TANQUE AC.INOX.', cap_real: 4200, tabla: 'tanque-40hl', activa: true }];
const b = (num, cap = 225) => ({ num, cap, estado: 'LLENO' });
const DOCE = Array.from({ length: 12 }, (_, i) => b('1' + i));

function ot(plantilla, lotes, extra = {}) {
  return { id: 'ot-1', ot: 'OT-2026-014', plantilla, fecha: '2026-10-01', destino: 'T 189', lote_corte: null,
    lotes: lotes.map((l, i) => ({ barriles: [], litros_previstos: null, barricas_previstas: null,
      mov_id: 'ot-1-' + i, aplicado: null, ...l })), ...extra };
}

/* Una OT de barricas a barricas con una merma nueva y una merma vieja que se vacía. */
function casoAplicado() {
  const datos = {
    lotes: [{ lote: 26218, cap225: 12, cap50: null, cap200: null, cap500: null, vasija_grande: null,
      litros_actuales: 2675, vasija_actual: 'Nave 3' }],
    mermas: [{ id: 'mer-viejo', lote: '26218', barril: '10', cap: 225, litros: 200, desde: '2026-09-01',
      ot: 'OT-2026-001', resuelta_el: '', resuelta_por: '', resuelta_como: '' }],
  };
  const o = ot('barricas-barricas', [{ lote: '26218', barriles: DOCE, litros_previstos: 2700 }]);
  const p = proponer({ ot: o, lotes: datos.lotes, mermas: datos.mermas, padron: PADRON, hoy: '2026-10-01',
    entradas: { por_lote: [{ barricas_llenas: 11, mermas: [{ barril: '777', cap: 225, litros: 180 }] }], corte: null } });
  aplicarPropuesta(datos, o, p, new Set(['26218']), 'ana', '2026-10-01');
  return { datos, o };
}

describe('aplicarPropuesta registra qué mermas tocó', () => {
  it('guarda en aplicado las mermas creadas y las cerradas', () => {
    const { o } = casoAplicado();
    expect(o.lotes[0].aplicado.mermas_creadas).toEqual(['mer-ot-1-26218-0']);
    expect(o.lotes[0].aplicado.mermas_cerradas).toEqual(['mer-viejo']);
  });
});

describe('planDeshacer', () => {
  it('una OT pendiente no tiene nada que deshacer', () => {
    const o = ot('barricas-barricas', [{ lote: '26218' }]);
    expect(planDeshacer({ lotes: [], mermas: [] }, o)).toEqual({ aplicada: false, items: [], mermasBorrar: [], mermasReabrir: [] });
  });

  it('un lote sin cambios posteriores vuelve al antes', () => {
    const { datos, o } = casoAplicado();
    const plan = planDeshacer(datos, o);
    expect(plan.aplicada).toBe(true);
    expect(plan.items).toEqual([expect.objectContaining({ lote: '26218', accion: 'volver',
      ahora: expect.objectContaining({ litros_actuales: 2655 }),
      antes: expect.objectContaining({ litros_actuales: 2675, vasija_actual: 'Nave 3' }) })]);
    expect(plan.mermasBorrar).toEqual(['mer-ot-1-26218-0']);
    expect(plan.mermasReabrir).toEqual(['mer-viejo']);
  });

  it('un lote que alguien cambió después no se toca, ni sus mermas', () => {
    const { datos, o } = casoAplicado();
    datos.lotes[0].vasija_actual = 'Nave 5';
    const plan = planDeshacer(datos, o);
    expect(plan.items[0].accion).toBe('cambiado');
    expect(plan.mermasBorrar).toEqual([]);
    expect(plan.mermasReabrir).toEqual([]);
  });

  it('un lote que ya no existe queda como faltante', () => {
    const { datos, o } = casoAplicado();
    datos.lotes = [];
    expect(planDeshacer(datos, o).items[0].accion).toBe('falta');
  });

  it('en un corte incluye el lote del corte', () => {
    const datos = { lotes: [{ lote: 26300, litros_actuales: 0 }, { lote: 25315, cap225: 5, litros_actuales: 1125, vasija_actual: 'Nave 1' }], mermas: [] };
    const o = ot('barricas-tanque', [{ lote: '25315', barriles: DOCE.slice(0, 5), litros_previstos: 1125 }],
      { lote_corte: { lote: '26300', id_texto: 'Corte' } });
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{}], corte: { vasija: 'T 189', litros_manual: 1100 } } });
    aplicarPropuesta(datos, o, p, new Set(['25315', '26300']), 'ana', '2026-10-01');
    const plan = planDeshacer(datos, o);
    expect(plan.items.map(i => [i.lote, i.accion])).toEqual([['25315', 'volver'], ['26300', 'volver']]);
  });
});

describe('aplicarDeshacer', () => {
  it('devuelve el lote, borra la merma creada y reabre la vaciada', () => {
    const { datos, o } = casoAplicado();
    const n = aplicarDeshacer(datos, planDeshacer(datos, o));
    expect(n).toBe(1);
    expect(datos.lotes[0]).toMatchObject({ cap225: 12, litros_actuales: 2675, vasija_actual: 'Nave 3' });
    expect(datos.mermas.map(m => m.id)).toEqual(['mer-viejo']);
    expect(datos.mermas[0]).toMatchObject({ resuelta_el: '', resuelta_por: '', resuelta_como: '' });
  });

  it('no toca un lote cambiado', () => {
    const { datos, o } = casoAplicado();
    datos.lotes[0].vasija_actual = 'Nave 5';
    expect(aplicarDeshacer(datos, planDeshacer(datos, o))).toBe(0);
    expect(datos.lotes[0]).toMatchObject({ litros_actuales: 2655, vasija_actual: 'Nave 5' });
    expect(datos.mermas).toHaveLength(2);
  });

  it('una merma vieja que después se resolvió a mano no se reabre', () => {
    const { datos, o } = casoAplicado();
    const plan = planDeshacer(datos, o);
    const viejo = datos.mermas.find(m => m.id === 'mer-viejo');
    viejo.resuelta_como = 'manual';
    aplicarDeshacer(datos, plan);
    expect(viejo.resuelta_como).toBe('manual');
  });
});
