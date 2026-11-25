/* Borrar una OT ya aplicada: los lotes vuelven a la foto del "antes" que
 * guardó la OT, salvo los que alguien cambió después (esos no se tocan). Las
 * mermas que creó la OT se borran y las que cerró por vaciarlas se reabren. */
import { describe, it, expect } from 'vitest';
import { proponer, aplicarPropuesta, fotoLote } from '../public/lotes/js/propuesta-ot.js';
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
    expect(planDeshacer({ lotes: [], mermas: [] }, o)).toEqual({ aplicada: false, corteParcial: false, items: [], mermasBorrar: [], mermasReabrir: [] });
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
    expect(plan.corteParcial).toBe(false);
  });

  /* Un corte se deshace entero o nada: si el lote del corte se tocó después,
   * devolver los orígenes a su "antes" contaría el vino dos veces (en los
   * orígenes y en el corte). */
  function corteAplicado() {
    const datos = { lotes: [{ lote: 26300, litros_actuales: 0 }, { lote: 25315, cap225: 5, litros_actuales: 1125, vasija_actual: 'Nave 1' }],
      mermas: [{ id: 'mer-viejo', lote: '25315', barril: '10', cap: 225, litros: 200, desde: '2026-09-01',
        ot: 'OT-2026-001', resuelta_el: '', resuelta_por: '', resuelta_como: '' }] };
    const o = ot('barricas-tanque', [{ lote: '25315', barriles: [...DOCE.slice(0, 4), b('10')], litros_previstos: 1125 }],
      { lote_corte: { lote: '26300', id_texto: 'Corte' } });
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: datos.mermas, padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{}], corte: { vasija: 'T 189', litros_manual: 1100 } } });
    aplicarPropuesta(datos, o, p, new Set(['25315', '26300']), 'ana', '2026-10-01');
    return { datos, o };
  }

  it('en un corte con el lote del corte cambiado no vuelve ningún lote', () => {
    const { datos, o } = corteAplicado();
    const corte = datos.lotes.find(l => String(l.lote) === '26300');
    corte.litros_actuales = 900;   // alguien lo trasegó después
    const plan = planDeshacer(datos, o);
    expect(plan.corteParcial).toBe(true);
    expect(plan.items.map(i => [i.lote, i.accion])).toEqual([['25315', 'cambiado'], ['26300', 'cambiado']]);
    expect(plan.items[0].porCorte).toBe(true);
    expect(plan.items[1].porCorte).toBeUndefined();
    expect(plan.mermasBorrar).toEqual([]);
    expect(plan.mermasReabrir).toEqual([]);
    const origen = { ...datos.lotes.find(l => String(l.lote) === '25315') };
    expect(aplicarDeshacer(datos, plan)).toBe(0);
    expect(datos.lotes.find(l => String(l.lote) === '25315')).toEqual(origen);
    expect(corte.litros_actuales).toBe(900);
  });

  it('en un corte con un origen cambiado tampoco vuelve el lote del corte', () => {
    const { datos, o } = corteAplicado();
    datos.lotes.find(l => String(l.lote) === '25315').vasija_actual = 'Nave 9';
    const plan = planDeshacer(datos, o);
    expect(plan.corteParcial).toBe(true);
    expect(plan.items.every(i => i.accion === 'cambiado')).toBe(true);
    expect(aplicarDeshacer(datos, plan)).toBe(0);
  });

  it('en un corte con un lote borrado no vuelve ninguno', () => {
    const { datos, o } = corteAplicado();
    datos.lotes = datos.lotes.filter(l => String(l.lote) !== '26300');
    const plan = planDeshacer(datos, o);
    expect(plan.corteParcial).toBe(true);
    expect(plan.items.map(i => [i.lote, i.accion])).toEqual([['25315', 'cambiado'], ['26300', 'falta']]);
  });
});

describe('corte a un lote existente que tambien es origen', () => {
  it('el lote aparece dos veces (origen y corte) y vuelve entero a como estaba antes de la OT', () => {
    const antes = { lote: 26300, cap225: 4, cap50: null, cap200: null, cap500: null, vasija_grande: 1000,
      litros_actuales: 1900, vasija_actual: '4 barricas + T 201' };
    const datos = { lotes: [{ ...antes }, { lote: 25315, cap225: 4, litros_actuales: 900, vasija_actual: 'Nave 3' }], mermas: [] };
    const o = ot('barricas-tanque', [
      { lote: '25315', barriles: DOCE.slice(0, 4), litros_previstos: 900 },
      { lote: '26300', barriles: DOCE.slice(4, 8), litros_previstos: 900 },
    ], { lote_corte: { lote: '26300', id_texto: 'Corte', existente: true } });
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PADRON, hoy: '2026-10-27',
      entradas: { por_lote: [{}, {}], corte: { vasija: '189', litros_manual: 1780 } } });
    aplicarPropuesta(datos, o, p, new Set(['26300', '25315']), 'ana', '2026-10-27');
    const plan = planDeshacer(datos, o);
    expect(plan.corteParcial).toBe(false);
    expect(plan.items.every(it => it.accion === 'volver')).toBe(true);
    aplicarDeshacer(datos, plan);
    expect(datos.lotes[0]).toMatchObject({ cap225: 4, vasija_grande: 1000, litros_actuales: 1900, vasija_actual: '4 barricas + T 201' });
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

describe('deshacer un Corte + achique', () => {
  const PAD = [{ num: '189', tipo: 'T', cap_real: 4200, tabla: null, activa: true },
               { num: '190', tipo: 'T', cap_real: 4200, tabla: null, activa: true }];
  function caso(){
    const datos = { lotes: [{ lote: 26323, litros_actuales: 0 }, { lote: 26324, litros_actuales: 0 },
      { lote: 25315, cap225: 4, litros_actuales: 900, vasija_actual: '4 barricas' }], mermas: [] };
    const o = ot('corte-achique', [{ lote: '25315', barriles: DOCE.slice(0, 4), litros_previstos: 900 }], {
      lote_corte: { lote: '26323', id_texto: 'C' },
      achique: { destinos: [{ tipo: 'tanque', num: '189', litros: 450, lote: '26323', nuevo: false, mov_id: null },
                            { tipo: 'tanque', num: '190', litros: 450, lote: '26324', nuevo: true, mov_id: 'ot-1-a0' }] } });
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PAD, hoy: '2026-10-14',
      entradas: { por_lote: [{}], destinos: [{ vasija: '189', litros_manual: 445 }, { vasija: '190', litros_manual: 445 }] } });
    aplicarPropuesta(datos, o, p, new Set(p.items.map(x => x.lote)), 'ana', '2026-10-14');
    return { datos, o };
  }
  it('vuelven los origenes, el corte y los hijos', () => {
    const { datos, o } = caso();
    const plan = planDeshacer(datos, o);
    expect(plan.items.map(i => [i.lote, i.accion]).sort()).toEqual([['25315', 'volver'], ['26323', 'volver'], ['26324', 'volver']]);
    aplicarDeshacer(datos, plan);
    expect(datos.lotes.find(l => l.lote === 26324).litros_actuales).toBe(0);
    expect(datos.lotes.find(l => l.lote === 25315).litros_actuales).toBe(900);
  });
  it('si el hijo se cambio despues, no vuelve ninguno', () => {
    const { datos, o } = caso();
    datos.lotes.find(l => l.lote === 26324).vasija_grande = 300;
    const plan = planDeshacer(datos, o);
    expect(plan.corteParcial).toBe(true);
    expect(plan.items.every(i => i.accion !== 'volver')).toBe(true);
  });
});

describe('OT con tanque destino extra', () => {
  it('el origen y el hijo vuelven al antes', () => {
    const PAD = [{ num: '212', tipo: 'T', cap_real: 7500, tabla: null, activa: true }, { num: '214', tipo: 'T', cap_real: 7500, tabla: null, activa: true }];
    const datos = { mermas: [], lotes: [{ lote: 26217, vasija_grande: 4000, vasija_actual: 'T 189', litros_actuales: 4000 },
                                        { lote: 26330, vasija_actual: '', litros_actuales: 0 }] };
    const o = ot('tq-tq', [{ lote: '26217', tanques: [{ num: '189', litros: 4000 }], litros_previstos: 4000,
      destinos_extra: [{ tipo: 'tanque', num: '214', litros: 1600, lote: '26330', nuevo: true, mov_id: 'x' }] }], { destino: 'T 212' });
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PAD, hoy: 'x',
      entradas: { por_lote: [{ vasija: 'T 212', cm: '', litros_manual: 2380, merma: '', extras: [{ vasija: 'T 214', cm: '', litros_manual: 1580, merma: '' }] }], corte: null } });
    aplicarPropuesta(datos, o, p, new Set(['26217', '26330']), 'ana', 'x');
    const plan = planDeshacer(datos, o);
    expect(plan.items.map(i => [i.lote, i.accion])).toEqual([['26217', 'volver'], ['26330', 'volver']]);
    aplicarDeshacer(datos, plan);
    expect(datos.lotes[0].vasija_grande).toBe(4000);
    expect(datos.lotes[1]).toMatchObject({ litros_actuales: 0, vasija_actual: '' });
  });
});

describe('OT con tanque destino extra: el lote va entero o nada con sus extra', () => {
  /* Foto armada a mano: 26217 (con extra 26330) y 26218 (sin extra), los tres aplicados. */
  function caso(){
    const datos = { mermas: [], lotes: [
      { lote: 26217, vasija_grande: 2380, vasija_actual: 'T 212', litros_actuales: 2380 },
      { lote: 26330, vasija_grande: 1580, vasija_actual: 'T 214', litros_actuales: 1580 },
      { lote: 26218, cap225: 11, vasija_actual: '11 barricas', litros_actuales: 2475 }] };
    const ap = (i, antes, mermas) => ({ antes, despues: fotoLote(datos.lotes[i]), por: 'ana', el: 'x',
      mermas_creadas: mermas.creadas || [], mermas_cerradas: mermas.cerradas || [] });
    const o = ot('tq-tq', [
      { lote: '26217', litros_previstos: 4000,
        aplicado: ap(0, { vasija_grande: 4000, vasija_actual: 'T 189', litros_actuales: 4000 }, { creadas: ['m-a'], cerradas: ['m-b'] }),
        destinos_extra: [{ tipo: 'tanque', num: '214', litros: 1600, lote: '26330', nuevo: true, mov_id: 'x',
          aplicado: ap(1, { litros_actuales: 0, vasija_actual: '' }, { creadas: ['m-c'] }) }] },
      { lote: '26218', litros_previstos: 2700,
        aplicado: ap(2, { cap225: 12, vasija_actual: 'Nave 3', litros_actuales: 2700 }, { creadas: ['m-d'], cerradas: ['m-e'] }) }],
      { destino: 'T 212' });
    return { datos, o };
  }
  it('si el hijo se cambió después, el origen no vuelve (ni sus mermas se borran)', () => {
    const { datos, o } = caso();
    datos.lotes[1].vasija_grande = 1500;
    const plan = planDeshacer(datos, o);
    const por = Object.fromEntries(plan.items.map(i => [i.lote, i]));
    expect(por['26217']).toMatchObject({ accion: 'cambiado', porGrupo: true });
    expect(por['26330'].accion).toBe('cambiado');
    expect(por['26330'].porGrupo).toBeUndefined();
    expect(por['26218'].accion).toBe('volver');
    expect(plan.corteParcial).toBe(false);
    expect(plan.mermasBorrar).toEqual(['m-d']);
    expect(plan.mermasReabrir).toEqual(['m-e']);
    expect(aplicarDeshacer(datos, plan)).toBe(1);
    expect(datos.lotes[0].litros_actuales).toBe(2380);
  });
  it('si el origen se cambió después, el hijo tampoco vuelve', () => {
    const { datos, o } = caso();
    datos.lotes[0].vasija_grande = 2000;
    const plan = planDeshacer(datos, o);
    const por = Object.fromEntries(plan.items.map(i => [i.lote, i]));
    expect(por['26330']).toMatchObject({ accion: 'cambiado', porGrupo: true });
    expect(plan.mermasBorrar).toEqual(['m-d']);
  });
  it('sin cambios vuelven los tres con todas sus mermas', () => {
    const { datos, o } = caso();
    const plan = planDeshacer(datos, o);
    expect(plan.items.every(i => i.accion === 'volver' && !i.porGrupo)).toBe(true);
    expect(plan.mermasBorrar.sort()).toEqual(['m-a', 'm-c', 'm-d']);
    expect(plan.mermasReabrir.sort()).toEqual(['m-b', 'm-e']);
  });
});

describe('Corte con tanque destino extra', () => {
  it('si el hijo del corte se cambió después, no vuelve ninguno (corteParcial)', () => {
    const datos = { mermas: [], lotes: [
      { lote: 25315, cap225: null, vasija_actual: '', litros_actuales: 0 },
      { lote: 26323, vasija_grande: 2380, vasija_actual: 'T 212', litros_actuales: 2380 },
      { lote: 26324, vasija_grande: 1580, vasija_actual: 'T 214', litros_actuales: 1580 }] };
    const ap = (i, antes) => ({ antes, despues: fotoLote(datos.lotes[i]), por: 'ana', el: 'x', mermas_creadas: ['m' + i], mermas_cerradas: [] });
    const o = ot('corte', [{ lote: '25315', litros_previstos: 4000,
      aplicado: ap(0, { cap225: 18, vasija_actual: '18 barricas', litros_actuales: 4000 }) }], {
      destino: 'T 212',
      lote_corte: { lote: '26323', id_texto: 'C', aplicado: ap(1, { litros_actuales: 0, vasija_actual: '' }) },
      destinos_extra: [{ tipo: 'tanque', num: '214', litros: 1600, lote: '26324', nuevo: true, mov_id: 'x',
        aplicado: ap(2, { litros_actuales: 0, vasija_actual: '' }) }] });
    datos.lotes[2].vasija_grande = 1500;
    const plan = planDeshacer(datos, o);
    expect(plan.corteParcial).toBe(true);
    expect(plan.items.map(i => i.lote).sort()).toEqual(['25315', '26323', '26324']);
    expect(plan.items.every(i => i.accion !== 'volver')).toBe(true);
    expect(plan.mermasBorrar).toEqual([]);
  });
});
