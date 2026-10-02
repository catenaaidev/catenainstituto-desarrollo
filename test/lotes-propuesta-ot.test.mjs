/* La propuesta "asi queda cada lote" al confirmar una OT:
 *   envases despues = envases antes - lo que se vacio + lo que se lleno
 * (spec 2026-10-01). Puro: no aplica nada, eso es aplicarPropuesta. */
import { describe, it, expect } from 'vitest';
import { tipoDestino, capNormal, vaciadoDeLote, llenadoDeEntrada, proponer, recalcularItem,
         compararConMapa, aplicarPropuesta } from '../public/lotes/js/propuesta-ot.js';

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
  it('I1: sin foto de barriles y el lote tiene barricas (no es el caso de tanque a mano), no vacia nada y marca revisar', () => {
    const r = vaciadoDeLote({ barriles: [] }, { cap225: 12 }, 'barricas-barricas');
    expect(r.vaciado).toMatchObject({ cap50: 0, cap200: 0, cap225: 0, cap500: 0, vasija_grande: 0 });
    expect(r.revisar).toBe(true);
    expect(r.avisos).toEqual(['La OT no tiene la lista de barriles del lote: revisá el después a mano.']);
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
  it('M4: una merma de un barril de 228 valida contra su capacidad real, no la normalizada', () => {
    const r = llenadoDeEntrada({ barricas_llenas: 1, mermas: [{ barril: '9', cap: 228, litros: 226 }] }, 'barricas', PADRON);
    expect(r.bloqueado).toBe(false);
    expect(r.mermas[0]).toMatchObject({ barril: '9', cap: 228, litros: 226 });
    expect(r.llenado.cap225).toBe(2);
  });
  it('M4: en el limite (litros igual a la capacidad real) sigue bloqueando', () => {
    const r = llenadoDeEntrada({ barricas_llenas: 0, mermas: [{ barril: '9', cap: 228, litros: 228 }] }, 'barricas', PADRON);
    expect(r.bloqueado).toBe(true);
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
    // 1800 previstos - 1750 medidos = 50 de merma, repartida por litros.
    // M3: el ultimo origen se lleva el resto (50 - 31.3 = 18.7), no su propia
    // cuota redondeada (18.8), para que la suma de las partes de exactamente 50.
    expect(p.items[0].merma_litros).toBe(31.3);
    expect(p.items[1].merma_litros).toBe(18.7);
    expect(p.items[2]).toMatchObject({ indice: null, despues: { vasija_grande: 1750, vasija_actual: 'T 154' } });
  });

  it('I4: si un origen no tiene litros previstos no se reparte la merma del corte', () => {
    const lotes = [{ lote: 26300, litros_actuales: 0 }, { lote: 25315, cap225: 5 }, { lote: 25324, cap225: 3 }];
    const o = ot('barricas-tanque', [
      { lote: '25315', barriles: DOCE.slice(0, 5) },   // sin litros_previstos (null por defecto)
      { lote: '25324', barriles: DOCE.slice(5, 8), litros_previstos: 675 },
    ], { lote_corte: { lote: '26300', id_texto: 'Corte' } });
    const p = proponer({ ot: o, lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{}, {}], corte: { vasija: '154', litros_manual: 1750 } } });
    expect(p.items[0].merma_litros).toBeNull();
    expect(p.items[1].merma_litros).toBeNull();
    expect(p.items[2].avisos).toContain('Hay lotes de origen sin litros previstos: la merma del corte no se reparte.');
  });

  it('I2(a): si el lote del corte no existe, los origenes quedan bloqueados en cascada', () => {
    const lotes = [{ lote: 25315, cap225: 5 }];
    const o = ot('barricas-tanque', [{ lote: '25315', barriles: DOCE.slice(0, 5), litros_previstos: 1125 }],
      { lote_corte: { lote: '26300', id_texto: 'Corte' } });   // 26300 no esta en lotes
    const p = proponer({ ot: o, lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{}], corte: { vasija: '154', litros_manual: 1100 } } });
    expect(p.items[1].bloqueado).toBe(true);
    expect(p.items[0].bloqueado).toBe(true);
    expect(p.items[0].avisos).toContain('El lote del corte no se puede aplicar: los lotes de origen tampoco.');
  });

  it('I1: un lote sin foto de barriles no bloquea ni dobla el conteo: queda marcado revisar', () => {
    const lotes = [{ lote: 26217, cap225: 12 }];
    const p = proponer({ ot: ot('barricas-barricas', [{ lote: '26217', barriles: [] }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ barricas_llenas: 11, mermas: [] }], corte: null } });
    expect(p.items[0].revisar).toBe(true);
    expect(p.items[0].bloqueado).toBe(false);
  });

  it('I3: el tanque destino ya tiene vino del mismo lote: lo medido se toma como total, no se suma', () => {
    const lotes = [{ lote: 26217, cap225: 4, vasija_grande: 3000, litros_actuales: 3900, vasija_actual: 'T 201 + 4 barricas' }];
    const p = proponer({ ot: ot('barrica-tanque', [{ lote: '26217', barriles: DOCE.slice(0, 4), litros_previstos: 900 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ vasija: 'T 201', cm: 30 }], corte: null } });
    const it0 = p.items[0];
    expect(it0.despues).toMatchObject({ cap225: 0, vasija_grande: 4075 });
    expect(it0.litros_llegados).toBe(1075);
    expect(it0.merma_litros).toBe(900 - 1075);
    expect(it0.avisos).toContain('El tanque ya tenía vino de este lote: lo medido se tomó como contenido total.');
  });

  it('M2: si quedan barricas o tanque del lote, el vasija_actual combina lo nuevo y lo anterior', () => {
    const lotes = [{ lote: 26217, cap225: 20, vasija_actual: 'Nave 2' }];
    const p = proponer({ ot: ot('barrica-tanque', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ vasija: '154', litros_manual: 2650 }], corte: null } });
    expect(p.items[0].despues.vasija_actual).toBe('T 154 + Nave 2');
  });

  it('M5: tq-tq vacia los tanques chicos (cap500) de la foto y llena el tanque destino', () => {
    const lotes = [{ lote: 26400, cap500: 2, litros_actuales: 1000 }];
    const p = proponer({ ot: ot('tq-tq', [{ lote: '26400', barriles: [b('m1', 500), b('m2', 500)], litros_previstos: 1000 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ vasija: '154', litros_manual: 950 }], corte: null } });
    expect(p.items[0].despues).toMatchObject({ cap500: 0, vasija_grande: 950 });
  });

  it('M5: tq-barricas vacia el tanque por litros previstos y llena barricas', () => {
    const lotes = [{ lote: 26401, vasija_grande: 4075, litros_actuales: 4075 }];
    const p = proponer({ ot: ot('tq-barricas', [{ lote: '26401', barriles: [], litros_previstos: 2250 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ barricas_llenas: 10, mermas: [] }], corte: null } });
    expect(p.items[0].despues).toMatchObject({ vasija_grande: 4075 - 2250, cap225: 10 });
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
  it('M1: un barril LLENO con el lote pero re-llenado DESPUES de la OT no es sin-escanear', () => {
    const mapa = [{ num: '1', cap: 225, estado: 'LLENO', fecha: '2026-10-05' }];
    const r = compararConMapa(item, { barriles: [b('1')] }, mapa, '2026-10-01');
    expect(r.estado).not.toBe('sin-escanear');
  });
  it('M1: un barril LLENO con fecha anterior a la OT (o sin fecha) sigue sin-escanear', () => {
    const mapaAnterior = [{ num: '1', cap: 225, estado: 'LLENO', fecha: '2026-09-20' }];
    expect(compararConMapa(item, { barriles: [b('1')] }, mapaAnterior, '2026-10-01').estado).toBe('sin-escanear');
    const mapaSinFecha = [{ num: '1', cap: 225, estado: 'LLENO' }];
    expect(compararConMapa(item, { barriles: [b('1')] }, mapaSinFecha, '2026-10-01').estado).toBe('sin-escanear');
  });
});

describe('aplicarPropuesta', () => {
  function caso() {
    const datos = { lotes: [{ lote: 26217, cap225: 12, litros_actuales: 2700, vasija_actual: 'Nave 2' }],
      mermas: [{ id: 'mer-viejo', lote: '26217', barril: '10', cap: 225, litros: 200, resuelta_el: '' }] };
    const o = ot('barricas-barricas', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }]);
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: datos.mermas, padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ barricas_llenas: 11, mermas: [{ barril: '777', cap: 225, litros: 180 }] }], corte: null } });
    return { datos, o, p };
  }

  it('con check escribe envases, litros, vasija, mermas y el antes/despues', () => {
    const { datos, o, p } = caso();
    aplicarPropuesta(datos, o, p, new Set(['26217']), 'ana', '2026-10-01');
    expect(datos.lotes[0]).toMatchObject({ cap225: 12, cap500: null, vasija_grande: null,
      litros_actuales: 2655, vasija_actual: '12 barricas' });
    expect(datos.mermas.find(m => m.id === 'mer-viejo')).toMatchObject({ resuelta_como: 'vaciada', resuelta_el: '2026-10-01' });
    expect(datos.mermas.find(m => m.barril === '777')).toMatchObject({ id: 'mer-ot-1-26217-0', litros: 180, resuelta_el: '' });
    expect(o.lotes[0].aplicado).toMatchObject({ por: 'ana', el: '2026-10-01',
      antes: { cap225: 12, litros_actuales: 2700, vasija_actual: 'Nave 2' },
      despues: { cap225: 12, litros_actuales: 2655, vasija_actual: '12 barricas' } });
  });

  it('sin check no toca el lote ni las mermas', () => {
    const { datos, o, p } = caso();
    aplicarPropuesta(datos, o, p, new Set(), 'ana', '2026-10-01');
    expect(datos.lotes[0]).toMatchObject({ cap225: 12, litros_actuales: 2700, vasija_actual: 'Nave 2' });
    expect(datos.mermas).toHaveLength(1);
    expect(o.lotes[0].aplicado).toBeNull();
  });

  it('un item bloqueado no se aplica aunque tenga check', () => {
    const { datos, o, p } = caso();
    p.items[0].bloqueado = true;
    aplicarPropuesta(datos, o, p, new Set(['26217']), 'ana', '2026-10-01');
    expect(datos.lotes[0].litros_actuales).toBe(2700);
  });

  it('en el corte el antes/despues del lote nuevo queda en ot.lote_corte', () => {
    const datos = { lotes: [{ lote: 26300, litros_actuales: 0 }, { lote: 25315, cap225: 5, litros_actuales: 1125 }], mermas: [] };
    const o = ot('barricas-tanque', [{ lote: '25315', barriles: DOCE.slice(0, 5), litros_previstos: 1125 }],
      { lote_corte: { lote: '26300', id_texto: 'Corte' } });
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{}], corte: { vasija: '154', litros_manual: 1100 } } });
    aplicarPropuesta(datos, o, p, new Set(['25315', '26300']), 'ana', '2026-10-01');
    expect(datos.lotes[1]).toMatchObject({ cap225: null, litros_actuales: 0, vasija_actual: '' });
    expect(datos.lotes[0]).toMatchObject({ vasija_grande: 1100, litros_actuales: 1100, vasija_actual: 'T 154' });
    expect(o.lote_corte.aplicado.despues.litros_actuales).toBe(1100);
  });

  it('I2(b): si no se tilda el corte, tampoco se aplican los origenes aunque esten tildados', () => {
    const datos = { lotes: [{ lote: 26300, litros_actuales: 0 }, { lote: 25315, cap225: 5, litros_actuales: 1125 }], mermas: [] };
    const o = ot('barricas-tanque', [{ lote: '25315', barriles: DOCE.slice(0, 5), litros_previstos: 1125 }],
      { lote_corte: { lote: '26300', id_texto: 'Corte' } });
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{}], corte: { vasija: '154', litros_manual: 1100 } } });
    expect(p.items[1].bloqueado).toBe(false);   // el corte en si no esta bloqueado
    aplicarPropuesta(datos, o, p, new Set(['25315']), 'ana', '2026-10-01');   // solo se tilda el origen
    expect(datos.lotes[1]).toMatchObject({ cap225: 5, litros_actuales: 1125 });   // intacto
    expect(o.lotes[0].aplicado).toBeNull();
  });

  it('idempotencia: una OT ya aplicada no se vuelve a aplicar', () => {
    const { datos, o, p } = caso();
    aplicarPropuesta(datos, o, p, new Set(['26217']), 'ana', '2026-10-01');
    const lotesAntes = JSON.parse(JSON.stringify(datos.lotes));
    const mermasAntes = JSON.parse(JSON.stringify(datos.mermas));
    const aplicadoAntes = JSON.parse(JSON.stringify(o.lotes[0].aplicado));
    aplicarPropuesta(datos, o, p, new Set(['26217']), 'otro', '2026-10-02');
    expect(datos.lotes).toEqual(lotesAntes);
    expect(datos.mermas).toEqual(mermasAntes);
    expect(o.lotes[0].aplicado).toEqual(aplicadoAntes);
  });
});

describe('C1: la merma nace con el ts del Mapa y desde la fecha de la OT', () => {
  const entrada = { barricas_llenas: 11, mermas: [{ barril: '777', cap: 225, litros: 180, mapa_ts: 1788912988373 }] };
  it('llenadoDeEntrada conserva mapa_ts (null si no vino)', () => {
    expect(llenadoDeEntrada(entrada, 'barricas', PADRON).mermas[0].mapa_ts).toBe(1788912988373);
    expect(llenadoDeEntrada({ barricas_llenas: 0, mermas: [{ barril: '7', cap: 225, litros: 100 }] }, 'barricas', PADRON)
      .mermas[0].mapa_ts).toBeNull();
  });
  it('proponer usa ot.fecha como desde y pasa mapa_ts; aplicarPropuesta lo guarda', () => {
    const datos = { lotes: [{ lote: 26217, cap225: 12, litros_actuales: 2700 }], mermas: [] };
    const o = ot('barricas-barricas', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }], { fecha: '2026-09-29' });
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [entrada], corte: null } });
    expect(p.items[0].mermas_nuevas[0]).toMatchObject({ desde: '2026-09-29', mapa_ts: 1788912988373 });
    aplicarPropuesta(datos, o, p, new Set(['26217']), 'ana', '2026-10-01');
    expect(datos.mermas[0]).toMatchObject({ barril: '777', desde: '2026-09-29', mapa_ts: 1788912988373 });
  });
});

describe('I3: llegaron mas litros de los que salieron', () => {
  it('barricas: avisa si se conto la merma dentro de las llenas', () => {
    const lotes = [{ lote: 26217, cap225: 12, litros_actuales: 2700 }];
    const p = proponer({ ot: ot('barricas-barricas', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ barricas_llenas: 12, mermas: [{ barril: '777', cap: 225, litros: 180 }] }], corte: null } });
    expect(p.items[0].merma_litros).toBe(-180);
    expect(p.items[0].avisos).toContain('Llegaron más litros de los que salieron: ¿contaste la barrica merma dentro de las llenas?');
  });
  it('con merma positiva no avisa', () => {
    const lotes = [{ lote: 26217, cap225: 12, litros_actuales: 2700 }];
    const p = proponer({ ot: ot('barricas-barricas', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ barricas_llenas: 11, mermas: [{ barril: '777', cap: 225, litros: 180 }] }], corte: null } });
    expect(p.items[0].avisos.some(a => a.startsWith('Llegaron más litros'))).toBe(false);
  });
  it('tanque: avisa sin la pregunta de las barricas', () => {
    const lotes = [{ lote: 26217, cap225: 19, litros_actuales: 4275 }];
    const p = proponer({ ot: ot('barrica-tanque', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-01',
      entradas: { por_lote: [{ vasija: 'T 201', cm: 30 }], corte: null } });
    expect(p.items[0].merma_litros).toBe(2700 - 4075);
    expect(p.items[0].avisos).toContain('Llegaron más litros de los que salieron.');
  });
});
