/* La propuesta "asi queda cada lote" al confirmar una OT:
 *   envases despues = envases antes - lo que se vacio + lo que se lleno
 * (spec 2026-10-01). Puro: no aplica nada, eso es aplicarPropuesta. */
import { describe, it, expect } from 'vitest';
import { tipoDestino, capNormal, vaciadoDeLote, llenadoDeEntrada, proponer, recalcularItem,
         compararConMapa } from '../public/lotes/js/propuesta-ot.js';

const PADRON = [
  { num: '201', tipo: 'TANQUE AC.INOX.', cap_real: 4200, tabla: 'tanque-40hl', activa: true },
  { num: '154', tipo: 'FOUDRE OVAL', cap_real: 2000, tabla: null, activa: true },
];
const b = (num, cap = 225) => ({ num, cap, estado: 'LLENO' });
const DOCE = Array.from({ length: 12 }, (_, i) => b('1' + i));

function ot(plantilla, lotes, extra = {}) {
  return { id: 'ot-1', ot: 'OT-2026-014', plantilla, destino: 'T 201', lote_corte: null,
    lotes: lotes.map((l, i) => ({ barriles: [], litros_previstos: null, barricas_previstas: null,
      mov_id: 'ot-1-' + i, ...l })), ...extra };
}

describe('tipoDestino y capNormal', () => {
  it('cada plantilla sabe si llena barricas o un tanque', () => {
    expect(tipoDestino('barricas-barricas')).toBe('barricas');
    expect(tipoDestino('tq-barricas')).toBe('barricas');
    expect(tipoDestino('barrica-tanque')).toBe('tanque');
    expect(tipoDestino('tq-tq')).toBe('tanque');
    expect(tipoDestino('barricas-tanque')).toBe('tanque');
  });
  it('228 y 300 son barricas de 225; lo raro es null', () => {
    expect([capNormal(228), capNormal(300), capNormal('500'), capNormal(1000), capNormal(null)])
      .toEqual([225, 225, 500, null, null]);
  });
});

describe('vaciadoDeLote', () => {
  it('cuenta los barriles de la foto por capacidad', () => {
    const r = vaciadoDeLote({ barriles: [b('1'), b('2', 228), b('3', 500)] }, { cap225: 5, cap500: 1 }, 'barricas-barricas');
    expect(r.vaciado).toMatchObject({ cap225: 2, cap500: 1, vasija_grande: 0 });
    expect(r.avisos).toEqual([]);
  });
  it('si la OT vacia mas de lo que el lote tiene, recorta y avisa', () => {
    const r = vaciadoDeLote({ barriles: DOCE }, { cap225: 10 }, 'barricas-barricas');
    expect(r.vaciado.cap225).toBe(10);
    expect(r.avisos[0]).toMatch(/tenía 10.*vació 12/);
  });
  it('origen tanque descuenta los litros previstos del tanque', () => {
    const r = vaciadoDeLote({ barriles: [], litros_previstos: 3000 }, { vasija_grande: 4075 }, 'tq-barricas');
    expect(r.vaciado.vasija_grande).toBe(3000);
  });
  it('sin barriles ni litros previstos se vacia el tanque entero', () => {
    const r = vaciadoDeLote({ barriles: [] }, { vasija_grande: 4075 }, 'tq-tq');
    expect(r.vaciado.vasija_grande).toBe(4075);
  });
});

describe('llenadoDeEntrada', () => {
  it('tanque con tabla: cm a litros', () => {
    const r = llenadoDeEntrada({ vasija: 'T 201', cm: 30 }, 'tanque', PADRON);
    expect(r).toMatchObject({ litros: 4075, bloqueado: false, vasija_texto: 'T 201' });
    expect(r.llenado.vasija_grande).toBe(4075);
  });
  it('tanque con cm fuera de rango queda bloqueado', () => {
    const r = llenadoDeEntrada({ vasija: '201', cm: 250 }, 'tanque', PADRON);
    expect(r.bloqueado).toBe(true);
    expect(r.avisos[0]).toMatch(/190/);
  });
  it('tanque sin tabla usa los litros a mano', () => {
    expect(llenadoDeEntrada({ vasija: '154', litros_manual: 1900 }, 'tanque', PADRON).litros).toBe(1900);
    expect(llenadoDeEntrada({ vasija: '154' }, 'tanque', PADRON).bloqueado).toBe(true);
  });
  it('barricas: llenas + mermas', () => {
    const r = llenadoDeEntrada({ barricas_llenas: 11, mermas: [{ barril: '777', cap: 225, litros: 180 }] }, 'barricas', PADRON);
    expect(r.llenado.cap225).toBe(12);
    expect(r.litros).toBe(11 * 225 + 180);
    expect(r.vasija_texto).toBe('12 barricas');
    expect(r.mermas).toHaveLength(1);
  });
  it('una merma con litros imposibles bloquea', () => {
    expect(llenadoDeEntrada({ barricas_llenas: 1, mermas: [{ barril: '7', cap: 225, litros: 300 }] }, 'barricas', PADRON).bloqueado).toBe(true);
  });
});

describe('proponer', () => {
  it('barricas a barricas: 12 vacias, 11 llenas + 1 merma', () => {
    const lotes = [{ lote: 26217, cap225: 12, litros_actuales: 2700, vasija_actual: 'Nave 2' }];
    const p = proponer({ ot: ot('barricas-barricas', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ barricas_llenas: 11, mermas: [{ barril: '777', cap: 225, litros: 180 }] }], corte: null } });
    const it0 = p.items[0];
    expect(it0.despues).toMatchObject({ cap225: 12, vasija_actual: '12 barricas' });
    expect(it0.litros_despues).toBe(2655);
    expect(it0.merma_litros).toBe(45);
    expect(it0.mermas_nuevas[0]).toMatchObject({ lote: '26217', barril: '777', litros: 180, desde: '2026-10-01', ot: 'OT-2026-014' });
  });

  it('barrica a tanque: el lote queda en el tanque con lo medido', () => {
    const lotes = [{ lote: 26217, cap225: 19, litros_actuales: 4275 }];
    const p = proponer({ ot: ot('barrica-tanque', [{ lote: '26217', barriles: DOCE.concat(DOCE.slice(0, 7)), litros_previstos: 4275 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ vasija: 'T 201', cm: 30 }], corte: null } });
    expect(p.items[0].despues).toMatchObject({ cap225: 0, vasija_grande: 4075, vasija_actual: 'T 201' });
    expect(p.items[0].litros_despues).toBe(4075);
    expect(p.items[0].merma_litros).toBe(200);
  });

  it('OT parcial: las barricas que no fueron quedan', () => {
    const lotes = [{ lote: 26217, cap225: 20 }];
    const p = proponer({ ot: ot('barrica-tanque', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ vasija: '154', litros_manual: 2650 }], corte: null } });
    expect(p.items[0].despues).toMatchObject({ cap225: 8, vasija_grande: 2650 });
    expect(p.items[0].litros_despues).toBe(8 * 225 + 2650);
  });

  it('una merma pendiente en un barril que se vacia se cierra', () => {
    const lotes = [{ lote: 26217, cap225: 12 }];
    const mermas = [{ id: 'mer-viejo', lote: '26217', barril: '10', cap: 225, litros: 200, resuelta_el: '' }];
    const p = proponer({ ot: ot('barrica-tanque', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }]),
      lotes, mermas, padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ vasija: 'T 201', cm: 30 }], corte: null } });
    expect(p.items[0].mermas_cerradas).toEqual(['mer-viejo']);
    expect(p.items[0].litros_despues).toBe(4075);
  });

  it('corte: los origenes se vacian y el lote nuevo recibe el tanque', () => {
    const lotes = [{ lote: 26300, litros_actuales: 0 }, { lote: 25315, cap225: 5 }, { lote: 25324, cap225: 3 }];
    const o = ot('barricas-tanque', [
      { lote: '25315', barriles: DOCE.slice(0, 5), litros_previstos: 1125 },
      { lote: '25324', barriles: DOCE.slice(5, 8), litros_previstos: 675 },
    ], { lote_corte: { lote: '26300', id_texto: 'Corte' } });
    const p = proponer({ ot: o, lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{}, {}], corte: { vasija: '154', litros_manual: 1750 } } });
    expect(p.corte).toBe('26300');
    expect(p.items.map(i => [i.lote, i.litros_despues])).toEqual([['25315', 0], ['25324', 0], ['26300', 1750]]);
    // 1800 previstos - 1750 medidos = 50 de merma, repartida por litros
    expect(p.items[0].merma_litros).toBe(31.3);
    expect(p.items[1].merma_litros).toBe(18.8);
    expect(p.items[2]).toMatchObject({ indice: null, despues: { vasija_grande: 1750, vasija_actual: 'T 154' } });
  });

  it('avisa si el lote que recibe queda en 0 L', () => {
    const p = proponer({ ot: ot('barricas-barricas', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }]),
      lotes: [{ lote: 26217, cap225: 12 }], mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ barricas_llenas: 0, mermas: [] }], corte: null } });
    expect(p.items[0].avisos).toContain('El lote queda en 0 L y pasa a inactivo.');
  });

  it('un lote que no existe queda bloqueado', () => {
    const p = proponer({ ot: ot('barricas-barricas', [{ lote: '99999' }]), lotes: [], mermas: [], padron: PADRON,
      hoy: '2026-10-01', entradas: { por_lote: [{ barricas_llenas: 1 }], corte: null } });
    expect(p.items[0].bloqueado).toBe(true);
  });

  it('recalcularItem toma las correcciones del despues', () => {
    const lotes = [{ lote: 26217, cap225: 12 }];
    const p = proponer({ ot: ot('barricas-barricas', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ barricas_llenas: 12, mermas: [] }], corte: null } });
    p.items[0].despues.cap225 = 11;
    recalcularItem(p.items[0], []);
    expect(p.items[0].litros_despues).toBe(2475);
  });
});

describe('compararConMapa', () => {
  const item = { despues: { cap50: 0, cap200: 0, cap225: 12, cap500: 0, vasija_grande: 0 } };
  it('sin datos del Mapa', () => {
    expect(compararConMapa(item, null, null).estado).toBe('sin-datos');
  });
  it('si un barril vaciado sigue LLENO con el lote, falta escanear', () => {
    expect(compararConMapa(item, { barriles: [b('1')] }, [b('1')]).estado).toBe('sin-escanear');
  });
  it('coincide contando LLENO y MERMO por capacidad', () => {
    const mapa = [...Array.from({ length: 11 }, (_, i) => b('n' + i)), { num: 'm', cap: 225, estado: 'MERMO' }];
    expect(compararConMapa(item, { barriles: [b('viejo')] }, mapa).estado).toBe('coincide');
  });
  it('difiere y dice cuanto ve el Mapa', () => {
    const r = compararConMapa(item, { barriles: [] }, Array.from({ length: 10 }, (_, i) => b('n' + i)));
    expect(r).toEqual({ estado: 'difiere', texto: '⚠ el Mapa dice 10×225' });
  });
});
