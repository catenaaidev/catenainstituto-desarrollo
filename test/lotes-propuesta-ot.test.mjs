/* La propuesta "asi queda cada lote" al confirmar una OT:
 *   envases despues = envases antes - lo que se vacio + lo que se lleno
 * (spec 2026-10-01). Puro: no aplica nada, eso es aplicarPropuesta. */
import { describe, it, expect } from 'vitest';
import { tipoDestino, capNormal, vaciadoDeLote, llenadoDeEntrada, proponer, recalcularItem,
         compararConMapa, aplicarPropuesta, sinLoVaciado, esItemCorte, envasesDeNombre,
         escaneosPorLote, vaciadoSegunMapa, llenadoSegunMapa, filasVaciado, fijarTrasegado, quedaDe,
         vasijaSegunEnvases, realesDeExtras } from '../public/lotes/js/propuesta-ot.js';
import { movimientosDeOT } from '../public/lotes/js/ot-armado.js';

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
  it('una merma en un T50 no se cuenta como barrica', () => {
    const r = llenadoDeEntrada({ barricas_llenas: 11, mermas: [{ barril: '901', cap: 50, litros: 40 }] }, 'barricas', PADRON);
    expect(r.llenado).toMatchObject({ cap225: 11, cap50: 1 });
    expect(r.vasija_texto).toBe('11 barricas + 1 T50');
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

describe('sinLoVaciado con T50', () => {
  it('un T50 en la vasija se va cuando no quedan envases chicos', () => {
    expect(sinLoVaciado('11 barricas + 1 T50', { vasija_grande: 0, cap50: 0, cap200: 0, cap225: 0, cap500: 0 }, PADRON)).toBe('');
    expect(sinLoVaciado('2 T50', { vasija_grande: 0, cap50: 2, cap200: 0, cap225: 0, cap500: 0 }, PADRON)).toBe('2 T50');
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

  it('corte a lote existente en el MISMO tanque: lo medido es el total del tanque', () => {
    const lotes = [{ lote: 26300, vasija_grande: 1000, litros_actuales: 1000, vasija_actual: 'T 154' },
                   { lote: 25315, cap225: 4 }];
    const o = ot('barricas-tanque', [{ lote: '25315', barriles: DOCE.slice(0, 4), litros_previstos: 900 }],
      { lote_corte: { lote: '26300', id_texto: 'Corte', existente: true } });
    const p = proponer({ ot: o, lotes, mermas: [], padron: PADRON, hoy: '2026-10-26',
      entradas: { por_lote: [{}], corte: { vasija: '154', litros_manual: 1880 } } });
    const c = p.items.find(x => x.indice == null);
    expect(c.despues).toMatchObject({ vasija_grande: 1880, vasija_actual: 'T 154' });
    expect(c.litros_llegados).toBe(880);
    expect(p.items[0].merma_litros).toBe(20);
    expect(c.avisos).toContain('El tanque ya tenía vino de este lote: lo medido se tomó como contenido total.');
  });

  it('corte a lote existente en OTRO lado: lo medido se suma', () => {
    const lotes = [{ lote: 26300, cap225: 2, litros_actuales: 450, vasija_actual: '2 barricas' },
                   { lote: 25315, cap225: 4 }];
    const o = ot('barricas-tanque', [{ lote: '25315', barriles: DOCE.slice(0, 4), litros_previstos: 900 }],
      { lote_corte: { lote: '26300', id_texto: 'Corte', existente: true } });
    const p = proponer({ ot: o, lotes, mermas: [], padron: PADRON, hoy: '2026-10-26',
      entradas: { por_lote: [{}], corte: { vasija: '154', litros_manual: 880 } } });
    const c = p.items.find(x => x.indice == null);
    expect(c.despues).toMatchObject({ cap225: 2, vasija_grande: 880, vasija_actual: 'T 154 + 2 barricas' });
    expect(c.litros_despues).toBe(1330);
    expect(p.items[0].merma_litros).toBe(20);
  });

  it('corte a lote existente que TAMBIEN es origen: el corte parte de lo que le queda despues de vaciarse', () => {
    // 26300 tenia 4 barricas + 1000 L en T 201; vacia sus 4 barricas y la OT
    // las junta con 25315 en el T 154. No se cuenta dos veces su vino.
    const lotes = [{ lote: 26300, cap225: 4, vasija_grande: 1000, litros_actuales: 1900, vasija_actual: '4 barricas + T 201' },
                   { lote: 25315, cap225: 4 }];
    const o = ot('barricas-tanque', [
      { lote: '25315', barriles: DOCE.slice(0, 4), litros_previstos: 900 },
      { lote: '26300', barriles: DOCE.slice(4, 8), litros_previstos: 900 },
    ], { lote_corte: { lote: '26300', id_texto: 'Corte', existente: true } });
    const p = proponer({ ot: o, lotes, mermas: [], padron: PADRON, hoy: '2026-10-27',
      entradas: { por_lote: [{}, {}], corte: { vasija: '154', litros_manual: 1780 } } });
    const c = p.items.find(x => x.indice == null);
    expect(c.despues).toMatchObject({ cap225: 0, vasija_grande: 2780 });
    expect(c.litros_despues).toBe(2780);
    expect(c.avisos).toContain('El lote del corte también es lote de origen: se parte de lo que le queda después de vaciarse.');
    const datos = { lotes: lotes.map(l => ({ ...l })), mermas: [] };
    aplicarPropuesta(datos, o, p, new Set(['26300', '25315']), 'ana', '2026-10-27');
    expect(datos.lotes[0]).toMatchObject({ cap225: null, vasija_grande: 2780, litros_actuales: 2780 });
  });

  it('corte a lote existente que tambien es origen y estaba en el MISMO tanque: lo medido es el total', () => {
    const lotes = [{ lote: 26300, cap225: 2, vasija_grande: 1000, litros_actuales: 1450, vasija_actual: 'T 154 + 2 barricas' },
                   { lote: 25315, cap225: 4 }];
    const o = ot('barricas-tanque', [
      { lote: '25315', barriles: DOCE.slice(0, 4), litros_previstos: 900 },
      { lote: '26300', barriles: DOCE.slice(4, 6), litros_previstos: 450 },
    ], { lote_corte: { lote: '26300', id_texto: 'Corte', existente: true } });
    const p = proponer({ ot: o, lotes, mermas: [], padron: PADRON, hoy: '2026-10-27',
      entradas: { por_lote: [{}, {}], corte: { vasija: '154', litros_manual: 2330 } } });
    const c = p.items.find(x => x.indice == null);
    expect(c.despues).toMatchObject({ cap225: 0, vasija_grande: 2330, vasija_actual: 'T 154' });
    expect(c.litros_llegados).toBe(1330);
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
    // Desde 2026-11-10 el texto nombra lo que queda de cada tipo: 20 - 12 = 8 barricas.
    expect(p.items[0].despues.vasija_actual).toBe('T 154 + Nave 2 + 8 barricas');
  });

  it('M2: si el vaciado deja el tanque en 0, el texto viejo pierde el tanque (no queda "T 201")', () => {
    const lotes = [{ lote: 26217, vasija_grande: 3000, cap225: 4, litros_actuales: 3900, vasija_actual: 'T 201 + Barricas' }];
    const p = proponer({ ot: ot('tq-barricas', [{ lote: '26217', litros_previstos: 3000 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-15',
      entradas: { por_lote: [{ barricas_llenas: 13, mermas: [] }], corte: null } });
    expect(p.items[0].despues).toMatchObject({ vasija_grande: 0, cap225: 17, vasija_actual: '13 barricas + Barricas' });
  });

  it('M2: si el vaciado deja el lote sin barricas, el texto viejo pierde "Barricas"', () => {
    const lotes = [{ lote: 26217, vasija_grande: 3000, cap225: 4, litros_actuales: 3900, vasija_actual: 'T 201 + 4 barricas' }];
    const p = proponer({ ot: ot('barrica-tanque', [{ lote: '26217', barriles: DOCE.slice(0, 4), litros_previstos: 900 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-15',
      entradas: { por_lote: [{ vasija: '154', litros_manual: 880 }], corte: null } });
    expect(p.items[0].despues).toMatchObject({ cap225: 0, vasija_grande: 3880, vasija_actual: 'T 154 + T 201' });
  });

  it('M2: lo que no es una vasija del padron ni barricas se conserva aunque el tanque quede en 0', () => {
    const lotes = [{ lote: 26217, vasija_grande: 3000, cap225: 4, litros_actuales: 3900, vasija_actual: 'T 201 + Nave 2 + Barricas' }];
    const p = proponer({ ot: ot('tq-barricas', [{ lote: '26217', litros_previstos: 3000 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-15',
      entradas: { por_lote: [{ barricas_llenas: 13, mermas: [] }], corte: null } });
    expect(p.items[0].despues.vasija_actual).toBe('13 barricas + Nave 2 + Barricas');
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

describe('B: tanques del padron en la OT', () => {
  it('los tanques de la OT se descuentan de vasija_grande junto con los barriles', () => {
    const r = vaciadoDeLote({ barriles: DOCE.slice(0, 2), tanques: [{ num: '201', litros: 3000 }] },
      { cap225: 2, vasija_grande: 3000 }, 'barrica-tanque');
    expect(r.vaciado).toMatchObject({ cap225: 2, vasija_grande: 3000 });
    expect(r.revisar).toBe(false);
  });
  it('solo tanque (sin barriles) no queda revisar aunque el lote tenga barricas', () => {
    const r = vaciadoDeLote({ barriles: [], tanques: [{ num: '201', litros: 1000 }] },
      { cap225: 4, vasija_grande: 3000 }, 'barrica-tanque');
    expect(r.vaciado).toMatchObject({ cap225: 0, vasija_grande: 1000 });
    expect(r.revisar).toBe(false);
  });
  it('vaciar el tanque entero lo saca del vasija_actual', () => {
    const lotes = [{ lote: 26217, vasija_grande: 3000, litros_actuales: 3000, vasija_actual: 'T 201' }];
    const p = proponer({ ot: ot('barricas-barricas', [{ lote: '26217', tanques: [{ num: '201', litros: 3000 }], litros_previstos: 3000 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-10-26',
      entradas: { por_lote: [{ barricas_llenas: 13, mermas: [] }], corte: null } });
    expect(p.items[0].despues.vasija_grande).toBe(0);
    expect(p.items[0].despues.vasija_actual).toBe('13 barricas');
  });
  it('una vasija manual sin envase conocido (IBC) descuenta sus litros del tanque y pide revisar', () => {
    const r = vaciadoDeLote({ barriles: [], otras: [{ nombre: 'IBC', litros: 300 }] },
      { vasija_grande: 3000 }, 'barrica-tanque');
    expect(r.vaciado.vasija_grande).toBe(300);
    expect(r.revisar).toBe(true);
    expect(r.avisos[0]).toMatch(/IBC/);
  });
});

describe('Corte + achique', () => {
  const ACH = (destinos) => ({ lote_corte: { lote: '26323', id_texto: 'Corte' }, destino: 'TQ pulmón',
    achique: { destinos } });
  const lotesBase = () => [{ lote: 26323, litros_actuales: 0 }, { lote: 26324, litros_actuales: 0 },
    { lote: 25315, cap225: 5 }, { lote: 25324, cap225: 3 }];
  const origenes = [{ lote: '25315', barriles: DOCE.slice(0, 5), litros_previstos: 1125 },
                    { lote: '25324', barriles: DOCE.slice(5, 8), litros_previstos: 675 }];
  // Funcion (no array compartido): aplicarPropuesta anota `aplicado` en cada
  // destino, y reusar el mismo array entre tests arrastraria ese aplicado.
  const DOS_TQ = () => [{ tipo: 'tanque', num: '154', litros: 900, lote: '26323', nuevo: false, mov_id: null },
                         { tipo: 'tanque', num: '201', litros: 900, lote: '26324', nuevo: true, mov_id: 'ot-1-a0' }];

  it('llenadoDeEntrada cuenta T50 llenos como envases de 50', () => {
    const r = llenadoDeEntrada({ barricas_llenas: 3, t50_llenas: 2, mermas: [] }, 'barricas', PADRON);
    expect(r.llenado).toMatchObject({ cap225: 3, cap50: 2 });
    expect(r.litros).toBe(775);
    expect(r.vasija_texto).toBe('3 barricas + 2 T50');
  });

  it('cada vasija definitiva queda en su lote y la merma es una sola', () => {
    const o = ot('corte-achique', origenes, ACH(DOS_TQ()));
    const p = proponer({ ot: o, lotes: lotesBase(), mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: '154', litros_manual: 890 }, { vasija: 'T 201', litros_manual: 880 }] } });
    const corte = p.items.find(esItemCorte);
    const hijo = p.items.find(x => x.hijo === 1);
    expect(corte).toMatchObject({ lote: '26323', litros_despues: 890, despues: { vasija_grande: 890, vasija_actual: 'T 154' } });
    expect(hijo).toMatchObject({ lote: '26324', indice: null, litros_despues: 880, despues: { vasija_actual: 'T 201' } });
    // 1800 salieron - (890 + 880) = 30 de merma, repartida por litros.
    expect(p.items[0].merma_litros + p.items[1].merma_litros).toBeCloseTo(30, 5);
    expect(p.items[0].litros_despues).toBe(0);
  });

  it('chicas como unico destino: el lote del corte va a barricas + T50, con sus mermas', () => {
    const o = ot('corte-achique', origenes, ACH([{ tipo: 'chicas', barricas: 7, t50: 1, litros: 1625, lote: '26323', nuevo: false, mov_id: null }]));
    const p = proponer({ ot: o, lotes: lotesBase(), mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ barricas_llenas: 7, t50_llenas: 1, mermas: [{ barril: '99', litros: 100, cap: 225 }] }] } });
    const corte = p.items.find(esItemCorte);
    expect(corte.despues).toMatchObject({ cap225: 8, cap50: 1, vasija_actual: '8 barricas + 1 T50' });
    expect(corte.mermas_nuevas).toHaveLength(1);
    expect(corte.mermas_nuevas[0]).toMatchObject({ lote: '26323', barril: '99', litros: 100 });
  });

  it('todo o nada: un destino sin medida bloquea toda la OT', () => {
    const o = ot('corte-achique', origenes, ACH(DOS_TQ()));
    const p = proponer({ ot: o, lotes: lotesBase(), mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: '154', litros_manual: 890 }, { vasija: 'T 201', cm: '' }] } });
    expect(p.items.every(x => x.bloqueado)).toBe(true);
  });

  it('el lote hijo que no existe bloquea todo', () => {
    const o = ot('corte-achique', origenes, ACH(DOS_TQ()));
    const lotes = lotesBase().filter(l => l.lote !== 26324);
    const p = proponer({ ot: o, lotes, mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: '154', litros_manual: 890 }, { vasija: 'T 201', litros_manual: 880 }] } });
    expect(p.items.find(x => x.hijo === 1).avisos).toContain('El lote 26324 no existe en la tabla de Lotes.');
    expect(p.items.every(x => x.bloqueado)).toBe(true);
  });

  it('aplicar deja el aplicado del hijo en su destino', () => {
    const o = ot('corte-achique', origenes, ACH(DOS_TQ()));
    const datos = { lotes: lotesBase(), mermas: [] };
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: '154', litros_manual: 890 }, { vasija: 'T 201', litros_manual: 880 }] } });
    aplicarPropuesta(datos, o, p, new Set(p.items.map(x => x.lote)), 'ana', '2026-10-14');
    expect(datos.lotes.find(l => l.lote === 26324)).toMatchObject({ vasija_grande: 880, litros_actuales: 880, vasija_actual: 'T 201' });
    expect(o.achique.destinos[1].aplicado.despues.litros_actuales).toBe(880);
    expect(o.lote_corte.aplicado.despues.litros_actuales).toBe(890);
  });

  it('corte + achique a un lote existente que TAMBIEN es origen: no cuenta dos veces su vino', () => {
    // 25315 vacia sus 5 barricas y es el lote del corte (base T 154); 26324 es hijo en T 201.
    const o = ot('corte-achique', origenes, { lote_corte: { lote: '25315', id_texto: 'Corte', existente: true },
      destino: 'TQ pulmón', achique: { destinos: [
        { tipo: 'tanque', num: '154', litros: 900, lote: '25315', nuevo: false, mov_id: null },
        { tipo: 'tanque', num: '201', litros: 900, lote: '26324', nuevo: true, mov_id: 'ot-1-a0' }] } });
    const datos = { lotes: lotesBase(), mermas: [] };
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PADRON, hoy: '2026-10-27',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: '154', litros_manual: 890 }, { vasija: 'T 201', litros_manual: 880 }] } });
    const corte = p.items.find(esItemCorte);
    expect(corte).toMatchObject({ lote: '25315', litros_despues: 890, despues: { cap225: 0, vasija_grande: 890, vasija_actual: 'T 154' } });
    expect(corte.avisos).toContain('El lote del corte también es lote de origen: se parte de lo que le queda después de vaciarse.');
    expect(p.items.find(x => x.hijo === 1)).toMatchObject({ lote: '26324', litros_despues: 880 });
    // 1800 salieron - (890 + 880) = 30 de merma.
    expect(p.items[0].merma_litros + p.items[1].merma_litros).toBeCloseTo(30, 5);
    aplicarPropuesta(datos, o, p, new Set(p.items.map(x => x.lote)), 'ana', '2026-10-27');
    expect(datos.lotes.find(l => l.lote === 25315)).toMatchObject({ litros_actuales: 890, vasija_grande: 890 });
    expect(datos.lotes.find(l => l.lote === 26324)).toMatchObject({ litros_actuales: 880 });
    // Movimientos: el corte no se traspasa a si mismo; si al hijo.
    const movs = movimientosDeOT(o, 'ana', '2026-10-27');
    expect(movs.find(m => m.lote === '25315' && m.id === 'ot-1-0')).toMatchObject({ tipo: 'trasiego', lote_destino: '' });
    expect(movs.find(m => m.lote === '25324')).toMatchObject({ tipo: 'traspaso', lote_destino: '25315' });
    expect(movs.find(m => m.lote_destino === '26324')).toMatchObject({ tipo: 'traspaso', lote: '25315' });
  });

  it('todo o nada al aplicar: un hijo sin check deja sin aplicar el corte y los origenes', () => {
    const o = ot('corte-achique', origenes, ACH(DOS_TQ()));
    const datos = { lotes: lotesBase(), mermas: [] };
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: '154', litros_manual: 890 }, { vasija: 'T 201', litros_manual: 880 }] } });
    aplicarPropuesta(datos, o, p, new Set(['26323', '25315', '25324']), 'ana', '2026-10-14');
    expect(datos.lotes.find(l => l.lote === 26323).litros_actuales).toBe(0);
    expect(datos.lotes.find(l => l.lote === 25315).cap225).toBe(5);
    expect(o.lote_corte.aplicado).toBeNull();
    expect(o.lotes.every(l => l.aplicado == null)).toBe(true);
  });

  it('corte bloqueado (el lote del corte no existe) con hijos: todo queda bloqueado', () => {
    const o = ot('corte-achique', origenes, ACH(DOS_TQ()));
    const lotes = lotesBase().filter(l => l.lote !== 26323);
    const p = proponer({ ot: o, lotes, mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: '154', litros_manual: 890 }, { vasija: 'T 201', litros_manual: 880 }] } });
    expect(p.items.find(esItemCorte).avisos).toContain('El lote del corte no existe en la tabla de Lotes.');
    expect(p.items.every(x => x.bloqueado)).toBe(true);
    expect(p.items.find(x => x.hijo === 1).avisos).toContain('El lote del corte no se puede aplicar: los lotes hijos tampoco.');
  });

  it('si el corte no se aplica, los hijos tampoco', () => {
    const o = ot('corte-achique', origenes, ACH(DOS_TQ()));
    const datos = { lotes: lotesBase(), mermas: [] };
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: '154', litros_manual: 890 }, { vasija: 'T 201', litros_manual: 880 }] } });
    aplicarPropuesta(datos, o, p, new Set(['26324']), 'ana', '2026-10-14');
    expect(datos.lotes.find(l => l.lote === 26324).litros_actuales).toBe(0);
    expect(o.achique.destinos[1].aplicado).toBeNull();
  });

  // Emitida por tipo: el numero de tanque y las cantidades se completan al confirmar.
  const C42 = { tipo: 'TANQUE AC.INOX.', cap: 4200 };
  const C20 = { tipo: 'FOUDRE OVAL', cap: 2000 };
  const POR_TIPO = () => [{ tipo: 'tanque', num: '', clase: C20, litros: null, lote: '26323', nuevo: false, mov_id: null },
                          { tipo: 'tanque', num: '', clase: C42, litros: null, lote: '26324', nuevo: true, mov_id: 'ot-1-a0' }];

  it('tanques sin numero en la OT: manda la vasija cargada al confirmar', () => {
    const o = ot('corte-achique', origenes, ACH(POR_TIPO()));
    const p = proponer({ ot: o, lotes: lotesBase(), mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: 'T 154', litros_manual: 890 }, { vasija: '201', litros_manual: 880 }] } });
    expect(p.items.find(esItemCorte)).toMatchObject({ bloqueado: false, despues: { vasija_grande: 890, vasija_actual: 'T 154' } });
    expect(p.items.find(x => x.hijo === 1)).toMatchObject({ bloqueado: false, despues: { vasija_grande: 880, vasija_actual: 'T 201' } });
    expect(p.items.every(x => !x.avisos.some(a => /La OT pedía/.test(a)))).toBe(true);
  });

  it('un tanque de otro tipo que el pedido: aviso que no frena', () => {
    const o = ot('corte-achique', origenes, ACH(POR_TIPO()));
    const p = proponer({ ot: o, lotes: lotesBase(), mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: 'T 201', litros_manual: 890 }, { vasija: '154', litros_manual: 880 }] } });
    const corte = p.items.find(esItemCorte), hijo = p.items.find(x => x.hijo === 1);
    expect(corte.avisos).toContain('La OT pedía FOUDRE OVAL · 20 HL y se usó el T 201 (TANQUE AC.INOX. · 42 HL).');
    expect(hijo.avisos).toContain('La OT pedía TANQUE AC.INOX. · 42 HL y se usó el T 154 (FOUDRE OVAL · 20 HL).');
    expect(p.items.some(x => x.bloqueado)).toBe(false);
  });

  it('chicas sin barricas ni T50 llenas: bloqueado (solo en el achique)', () => {
    const o = ot('corte-achique', origenes, ACH([POR_TIPO()[0],
      { tipo: 'chicas', barricas: 0, t50: 0, litros: null, lote: '26324', nuevo: true, mov_id: 'ot-1-a0' }]));
    const p = proponer({ ot: o, lotes: lotesBase(), mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: '154', litros_manual: 890 }, { barricas_llenas: '', t50_llenas: '', mermas: [] }] } });
    const hijo = p.items.find(x => x.hijo === 1);
    expect(hijo.bloqueado).toBe(true);
    expect(hijo.avisos).toContain('Faltan cuántas barricas o T50 se llenaron.');
    expect(p.items.every(x => x.bloqueado)).toBe(true);
    // Con las llenas cargadas, pasa.
    const ok = proponer({ ot: o, lotes: lotesBase(), mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: '154', litros_manual: 890 }, { barricas_llenas: 4, t50_llenas: '', mermas: [] }] } });
    expect(ok.items.some(x => x.bloqueado)).toBe(false);
  });

  it('chicas como base sin llenas: bloquea el lote del corte', () => {
    const o = ot('corte-achique', origenes, ACH([{ tipo: 'chicas', barricas: 0, t50: 0, litros: null, lote: '26323', nuevo: false, mov_id: null }]));
    const p = proponer({ ot: o, lotes: lotesBase(), mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ barricas_llenas: 0, t50_llenas: 0, mermas: [] }] } });
    expect(p.items.find(esItemCorte).avisos).toContain('Faltan cuántas barricas o T50 se llenaron.');
    expect(p.items.every(x => x.bloqueado)).toBe(true);
  });

  it('chicas con 0 llenas pero una barrica merma valida: NO se bloquea', () => {
    const o = ot('corte-achique', origenes, ACH([POR_TIPO()[0],
      { tipo: 'chicas', barricas: 0, t50: 0, litros: null, lote: '26324', nuevo: true, mov_id: 'ot-1-a0' }]));
    const p = proponer({ ot: o, lotes: lotesBase(), mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: '154', litros_manual: 890 },
        { barricas_llenas: 0, t50_llenas: 0, mermas: [{ barril: '99', litros: 150, cap: 225 }] }] } });
    const hijo = p.items.find(x => x.hijo === 1);
    expect(hijo.avisos).not.toContain('Faltan cuántas barricas o T50 se llenaron.');
    expect(p.items.some(x => x.bloqueado)).toBe(false);
  });

  it('un tanque sin vasija al confirmar queda bloqueado en la capa pura (base o hijo)', () => {
    const o = ot('corte-achique', origenes, ACH(POR_TIPO()));
    const p = proponer({ ot: o, lotes: lotesBase(), mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ vasija: '154', litros_manual: 890 }, { vasija: '', litros_manual: 880 }] } });
    expect(p.items.find(x => x.hijo === 1).avisos).toContain('Falta el número de tanque.');
    expect(p.items.every(x => x.bloqueado)).toBe(true);
    const p2 = proponer({ ot: o, lotes: lotesBase(), mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{}, {}], destinos: [{ litros_manual: 890 }, { vasija: 'T 201', litros_manual: 880 }] } });
    expect(p2.items.find(esItemCorte).avisos).toContain('Falta el número de tanque.');
    expect(p2.items.every(x => x.bloqueado)).toBe(true);
  });

  it('fuera del achique, 0 barricas llenas no bloquea por eso', () => {
    const p = proponer({ ot: ot('tq-barricas', [{ lote: '25315', litros_previstos: 100 }]),
      lotes: [{ lote: 25315, vasija_grande: 1000 }], mermas: [], padron: PADRON, hoy: '2026-10-14',
      entradas: { por_lote: [{ barricas_llenas: 0, mermas: [] }], corte: null } });
    expect(p.items[0].avisos).not.toContain('Faltan cuántas barricas o T50 se llenaron.');
  });
});

/* 2026-11-10: la OT 0957 (13 lotes) se emitio con "17 Barricas" como vasija
 * manual porque el Mapa no tenia los barriles, y al confirmar no se desconto
 * nada: los lotes quedaron con sus barricas aunque el vino ya estaba en el
 * tanque. Lo que la OT dice que se vacio tiene que descontarse solo. */
describe('envasesDeNombre: una vasija manual que nombra envases', () => {
  it('N barricas son barricas de 225', () => {
    expect(envasesDeNombre('17 Barricas')).toEqual({ cap50: 0, cap200: 0, cap225: 17, cap500: 0 });
    expect(envasesDeNombre('1 barrica')).toEqual({ cap50: 0, cap200: 0, cap225: 1, cap500: 0 });
    expect(envasesDeNombre('5 barricas de 228 L')).toEqual({ cap50: 0, cap200: 0, cap225: 5, cap500: 0 });
  });
  it('T50, t200 y t500 van a su envase, y se pueden combinar', () => {
    expect(envasesDeNombre('2 T50')).toEqual({ cap50: 2, cap200: 0, cap225: 0, cap500: 0 });
    expect(envasesDeNombre('1 t 200')).toEqual({ cap50: 0, cap200: 1, cap225: 0, cap500: 0 });
    expect(envasesDeNombre('3 T500')).toEqual({ cap50: 0, cap200: 0, cap225: 0, cap500: 3 });
    expect(envasesDeNombre('11 barricas + 1 T50')).toEqual({ cap50: 1, cap200: 0, cap225: 11, cap500: 0 });
  });
  it('lo que no nombra envases no se interpreta', () => {
    expect(envasesDeNombre('IBC 1')).toBeNull();
    expect(envasesDeNombre('bin 3')).toBeNull();
    expect(envasesDeNombre('Barricas')).toBeNull();      // sin cantidad no se adivina
    expect(envasesDeNombre('Barrica 2240553')).toBeNull(); // el numero es del barril, no una cantidad
    expect(envasesDeNombre('')).toBeNull();
  });
});

describe('vaciado automatico: lo que la OT dice que se vacio se descuenta', () => {
  it('"17 Barricas" como vasija manual descuenta 17 barricas de 225 (caso 0957)', () => {
    const r = vaciadoDeLote({ barriles: [], otras: [{ nombre: '17 Barricas', litros: 3825 }], litros_previstos: 3825 },
      { cap225: 17, litros_actuales: 3825 }, 'barricas-tanque');
    expect(r.vaciado).toMatchObject({ cap225: 17, vasija_grande: 0 });
    expect(r.revisar).toBe(false);
    expect(r.avisos).toEqual([]);
  });
  it('vasija manual con envases + barriles del Mapa: se suman', () => {
    const r = vaciadoDeLote({ barriles: [b('50048', 50), b('50088', 50)], otras: [{ nombre: '5 Barricas', litros: 1125 }] },
      { cap50: 3, cap225: 5 }, 'barricas-tanque');
    expect(r.vaciado).toMatchObject({ cap50: 2, cap225: 5 });
    expect(r.revisar).toBe(false);
  });
  it('cantidad de barricas (modo "Cantidad" al emitir) descuenta esa cantidad', () => {
    const r = vaciadoDeLote({ barriles: [], cantidad_barricas: 12, litros_previstos: 2700 }, { cap225: 12 }, 'barricas-barricas');
    expect(r.vaciado.cap225).toBe(12);
    expect(r.revisar).toBe(false);
  });
  it('cantidad mayor que las barricas del lote: recorta y avisa, como con los barriles', () => {
    const r = vaciadoDeLote({ barriles: [], cantidad_barricas: 15 }, { cap225: 12 }, 'barricas-barricas');
    expect(r.vaciado.cap225).toBe(12);
    expect(r.avisos[0]).toMatch(/tenía 12.*vació 15/);
  });
  it('sin vasijas en la OT pero con litros previstos que cubren todo el lote: se vacia entero', () => {
    const r = vaciadoDeLote({ barriles: [], litros_previstos: 2700 }, { cap225: 12, litros_actuales: 2700 }, 'barricas-tanque');
    expect(r.vaciado).toMatchObject({ cap225: 12, vasija_grande: 0 });
    expect(r.revisar).toBe(false);
  });
  it('litros previstos que cubren barricas + tanque: se vacia todo', () => {
    const r = vaciadoDeLote({ barriles: [], litros_previstos: 3900 }, { cap225: 4, vasija_grande: 3000 }, 'barricas-tanque');
    expect(r.vaciado).toMatchObject({ cap225: 4, vasija_grande: 3000 });
    expect(r.revisar).toBe(false);
  });
  it('litros previstos parciales: primero el tanque, despues barricas enteras, y pide revisar', () => {
    const r = vaciadoDeLote({ barriles: [], litros_previstos: 3450 }, { cap225: 4, vasija_grande: 3000 }, 'barricas-tanque');
    expect(r.vaciado).toMatchObject({ cap225: 2, vasija_grande: 3000 });
    expect(r.revisar).toBe(true);
    expect(r.avisos[0]).toMatch(/revisá/);
  });
  it('vasija manual sin envase conocido que cubre todo el lote: se vacia entero sin revisar', () => {
    const r = vaciadoDeLote({ barriles: [], otras: [{ nombre: 'IBC 1', litros: 1000 }] }, { vasija_grande: 1000 }, 'barricas-tanque');
    expect(r.vaciado.vasija_grande).toBe(1000);
    expect(r.revisar).toBe(false);
  });
  it('vasija manual sin nombre de envase ni litros: mandan los litros previstos', () => {
    const r = vaciadoDeLote({ barriles: [], otras: [{ nombre: 'IBC 1', litros: null }], litros_previstos: 2700 },
      { cap225: 12 }, 'barricas-tanque');
    expect(r.vaciado.cap225).toBe(12);
    expect(r.revisar).toBe(false);
  });
  it('sin vasijas ni litros previstos sigue siendo revisar sin descontar (I1)', () => {
    const r = vaciadoDeLote({ barriles: [] }, { cap225: 12 }, 'barricas-barricas');
    expect(r.vaciado.cap225).toBe(0);
    expect(r.revisar).toBe(true);
  });
  it('proponer: el lote con "37 Barricas" manual queda en 0 barricas y el tanque con lo medido', () => {
    const lotes = [{ lote: 26235, cap225: 37, litros_actuales: 8325, vasija_actual: 'Barricas' }];
    const p = proponer({ ot: ot('barrica-tanque', [{ lote: '26235', barriles: [], otras: [{ nombre: '37 Barricas', litros: 8325 }], litros_previstos: 8325 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-11-10',
      entradas: { por_lote: [{ vasija: 'T 201', cm: 30 }], corte: null } });
    expect(p.items[0].despues).toMatchObject({ cap225: 0, vasija_grande: 4075, vasija_actual: 'T 201' });
    expect(p.items[0].litros_despues).toBe(4075);
    expect(p.items[0].revisar).toBe(false);
  });
});

/* 2026-11-10: el escaner del Mapa anota cada vaciado/llenado con la OT, el
 * lote y los barriles. Eso es lo que paso de verdad; la OT dice lo previsto.
 * En la 0957 la OT decia 17 barricas del 26236 y el Mapa vacio 6; del 26235
 * no vacio ninguna (y a mano se habia dejado tal cual: era correcto). */
const ESC_0957 = [
  { id: 'e1', fecha: '2026-10-27', tipo: 'vaciado', lote: '26236', barriles: [b('a'), b('b'), b('c'), b('d'), b('e'), b('f')].map(x => ({ num: x.num, cap: 225 })) },
  { id: 'e2', fecha: '2026-10-27', tipo: 'vaciado', lote: ' 26215 ', barriles: [{ num: 't', cap: 200 }, { num: 'u', cap: 225 }] },
  { id: 'e3', fecha: '2026-10-28', tipo: 'llenado', lote: '26305', barriles: [{ num: 'l1', cap: 225 }, { num: 'l2', cap: 225 }, { num: 'l3', cap: 50 }] },
  { id: 'e4', fecha: '2026-10-28', tipo: 'vaciado', lote: '', barriles: [{ num: 'x', cap: null }] },
];

describe('escaneosPorLote', () => {
  it('agrupa vaciados y llenados por lote normalizado', () => {
    const g = escaneosPorLote(ESC_0957);
    expect(g['26236'].vaciados).toHaveLength(6);
    expect(g['26215'].vaciados.map(x => x.cap)).toEqual([200, 225]);
    expect(g['26305'].llenados).toHaveLength(3);
    expect(g['26305'].vaciados).toEqual([]);
    expect(g['26236'].fechas).toEqual(['2026-10-27']);
    expect(Object.keys(g)).not.toContain('');
  });
  it('sin escaneos devuelve un objeto vacio', () => {
    expect(escaneosPorLote(null)).toEqual({});
    expect(escaneosPorLote([])).toEqual({});
  });
});

describe('vaciadoSegunMapa', () => {
  const g = escaneosPorLote(ESC_0957);
  it('con escaneos del lote manda el Mapa y se avisa la diferencia con la OT', () => {
    const r = vaciadoSegunMapa({ lote: '26236', barriles: [], otras: [{ nombre: '17 Barricas', litros: 3825 }] }, { cap225: 17 }, 'barricas-tanque', g);
    expect(r.fuente).toBe('mapa');
    expect(r.vaciado).toMatchObject({ cap225: 6, vasija_grande: 0 });
    expect(r.revisar).toBe(false);
    expect(r.avisos).toEqual(['La OT decía 17 de 225 L; el Mapa vació 6 de 225 L: queda lo que el Mapa no vació.']);
  });
  it('mapa y OT iguales: sin aviso', () => {
    const r = vaciadoSegunMapa({ lote: '26215', barriles: [{ num: 't', cap: 200 }, { num: 'u', cap: 225 }] }, { cap200: 1, cap225: 1 }, 'barricas-tanque', g);
    expect(r.fuente).toBe('mapa');
    expect(r.vaciado).toMatchObject({ cap200: 1, cap225: 1 });
    expect(r.avisos).toEqual([]);
    expect(r.revisar).toBe(false);
  });
  it('los tanques de la OT se descuentan igual: el escaner no mide tanques', () => {
    const r = vaciadoSegunMapa({ lote: '26236', barriles: [], tanques: [{ num: '201', litros: 3000 }] }, { cap225: 17, vasija_grande: 3000 }, 'barricas-tanque', g);
    expect(r.vaciado).toMatchObject({ cap225: 6, vasija_grande: 3000 });
    expect(r.fuente).toBe('mapa');
  });
  it('sin escaneos del lote pero con escaneos de la OT: segun la OT, marcado revisar', () => {
    const r = vaciadoSegunMapa({ lote: '26235', barriles: [], otras: [{ nombre: '37 Barricas', litros: 8325 }] }, { cap225: 37 }, 'barricas-tanque', g);
    expect(r.fuente).toBe('ot');
    expect(r.vaciado.cap225).toBe(37);
    expect(r.revisar).toBe(true);
    expect(r.avisos).toContain('El Mapa no tiene escaneos de este lote en esta OT: se propone lo que dice la OT.');
  });
  it('desde tanque: el escaner no mide tanques, asi que sin vaciados del lote no se marca revisar', () => {
    const r = vaciadoSegunMapa({ lote: '26305', barriles: [], litros_previstos: 1500 }, { vasija_grande: 1500 }, 'tq-barricas', g);
    expect(r.fuente).toBe('ot');
    expect(r.vaciado.vasija_grande).toBe(1500);
    expect(r.revisar).toBe(false);
    expect(r.avisos).toEqual([]);
  });
  it('sin ningun escaneo de la OT: segun la OT, sin marcar revisar', () => {
    const r = vaciadoSegunMapa({ lote: '26235', barriles: [], otras: [{ nombre: '37 Barricas', litros: 8325 }] }, { cap225: 37 }, 'barricas-tanque', {});
    expect(r.fuente).toBe('ot');
    expect(r.vaciado.cap225).toBe(37);
    expect(r.revisar).toBe(false);
  });
  it('el Mapa vacio mas de lo que la OT decia: avisa y marca revisar', () => {
    const r = vaciadoSegunMapa({ lote: '26236', barriles: [b('a'), b('b')] }, { cap225: 17 }, 'barricas-tanque', g);
    expect(r.vaciado.cap225).toBe(6);
    expect(r.revisar).toBe(true);
    expect(r.avisos[0]).toMatch(/La OT decía 2 de 225 L; el Mapa vació 6 de 225 L/);
  });
});

describe('llenadoSegunMapa', () => {
  it('cuenta barricas y T50 llenadas para el lote', () => {
    const g = escaneosPorLote(ESC_0957);
    expect(llenadoSegunMapa(g['26305'])).toEqual({ barricas: 2, t50: 1 });
    expect(llenadoSegunMapa(g['26236'])).toBeNull();
    expect(llenadoSegunMapa(undefined)).toBeNull();
  });
});

describe('proponer con escaneos del Mapa', () => {
  it('cada item dice su fuente y el despues sale del Mapa', () => {
    const lotes = [{ lote: 26236, cap225: 17, litros_actuales: 3825, vasija_actual: 'Barricas' },
                   { lote: 26235, cap225: 37, litros_actuales: 8325, vasija_actual: 'Barricas' }];
    const o = ot('barrica-tanque', [
      { lote: '26236', barriles: [], otras: [{ nombre: '17 Barricas', litros: 3825 }], litros_previstos: 3825 },
      { lote: '26235', barriles: [], otras: [{ nombre: '37 Barricas', litros: 8325 }], litros_previstos: 8325 }]);
    const p = proponer({ ot: o, lotes, mermas: [], padron: PADRON, hoy: '2026-11-10', escaneos: ESC_0957,
      entradas: { por_lote: [{ vasija: 'T 201', cm: 30 }, { vasija: 'T 201', litros_manual: 100 }], corte: null } });
    expect(p.items[0]).toMatchObject({ fuente: 'mapa', revisar: false });
    expect(p.items[0].despues).toMatchObject({ cap225: 11, vasija_grande: 4075 });
    expect(p.items[0].litros_despues).toBe(11 * 225 + 4075);
    expect(p.items[1]).toMatchObject({ fuente: 'ot', revisar: true });
    expect(p.items[1].despues.cap225).toBe(0);
  });
  it('sin escaneos todo sale de la OT, como antes', () => {
    const lotes = [{ lote: 26217, cap225: 12, litros_actuales: 2700 }];
    const p = proponer({ ot: ot('barrica-tanque', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }]),
      lotes, mermas: [], padron: PADRON, hoy: '2026-11-10',
      entradas: { por_lote: [{ vasija: 'T 201', cm: 30 }], corte: null } });
    expect(p.items[0].fuente).toBe('ot');
    expect(p.items[0].despues.cap225).toBe(0);
  });
});

/* 2026-11-10: el paso 2 pregunta por tipo de vasija que tenia el lote
 * cuantas se trasegaron y cuantas quedan (antes era un solo "quedaron" del
 * envase mayoritario, y no servia para un lote con barricas y un t200). */
describe('filasVaciado / fijarTrasegado: una fila por tipo de vasija', () => {
  const proponer1 = (lote, otLote, plantilla, entrada, escaneos) => proponer({
    ot: ot(plantilla, [otLote]), lotes: [lote], mermas: [], padron: PADRON, hoy: '2026-11-10', escaneos,
    entradas: { por_lote: [entrada], corte: null } }).items[0];

  it('proponer guarda lo vaciado y lo recibido por separado', () => {
    const it0 = proponer1({ lote: 26236, cap225: 17, litros_actuales: 3825, vasija_actual: 'Barricas' },
      { lote: '26236', barriles: [], otras: [{ nombre: '17 Barricas', litros: 3825 }], litros_previstos: 3825 },
      'barrica-tanque', { vasija: 'T 201', cm: 30 }, ESC_0957);
    expect(it0.vaciado).toMatchObject({ cap225: 6, vasija_grande: 0 });
    expect(it0.recibe).toMatchObject({ cap225: 0, vasija_grande: 4075 });
  });

  it('una fila por cada tipo que tenia el lote, en orden, con tenia/trasegaron/quedan', () => {
    const it0 = proponer1({ lote: 26215, cap225: 8, cap200: 1, litros_actuales: 2000, vasija_actual: 'Barricas + t200' },
      { lote: '26215', barriles: [{ num: 't', cap: 200 }, { num: 'u', cap: 225 }], litros_previstos: 425 },
      'barrica-tanque', { vasija: 'T 201', cm: 30 });
    expect(filasVaciado(it0)).toEqual([
      { clave: 'cap225', etiqueta: 'Barricas 225', tenia: 8, trasegaron: 1, quedan: 7 },
      { clave: 'cap200', etiqueta: 'T200', tenia: 1, trasegaron: 1, quedan: 0 },
    ]);
  });

  it('el tanque va en litros', () => {
    const it0 = proponer1({ lote: 26305, vasija_grande: 1500, litros_actuales: 1500, vasija_actual: 'T 154' },
      { lote: '26305', barriles: [], litros_previstos: 1500 }, 'tq-barricas', { barricas_llenas: 7, mermas: [] });
    expect(filasVaciado(it0)).toEqual([{ clave: 'vasija_grande', etiqueta: 'Tanque (L)', tenia: 1500, trasegaron: 1500, quedan: 0 }]);
  });

  it('editar "quedan" ajusta "se trasegaron", y el despues suma lo que recibe', () => {
    const it0 = proponer1({ lote: 26305, vasija_grande: 1500, litros_actuales: 1500, vasija_actual: 'T 154' },
      { lote: '26305', barriles: [], litros_previstos: 1500 }, 'tq-barricas', { barricas_llenas: 7, mermas: [] });
    fijarTrasegado(it0, 'vasija_grande', 'quedan', 100, []);
    expect(filasVaciado(it0)[0]).toMatchObject({ trasegaron: 1400, quedan: 100 });
    expect(it0.despues).toMatchObject({ vasija_grande: 100, cap225: 7 });
    expect(it0.litros_despues).toBe(100 + 7 * 225);
  });

  it('editar "se trasegaron" ajusta "quedan"; recorta entre 0 y lo que tenia; barricas enteras', () => {
    const it0 = proponer1({ lote: 26236, cap225: 17, litros_actuales: 3825, vasija_actual: 'Barricas' },
      { lote: '26236', barriles: [], otras: [{ nombre: '17 Barricas', litros: 3825 }], litros_previstos: 3825 },
      'barrica-tanque', { vasija: 'T 201', cm: 30 }, ESC_0957);
    fijarTrasegado(it0, 'cap225', 'trasegaron', 10, []);
    expect(filasVaciado(it0)[0]).toMatchObject({ trasegaron: 10, quedan: 7 });
    expect(it0.despues.cap225).toBe(7);
    expect(it0.litros_despues).toBe(7 * 225 + 4075);
    fijarTrasegado(it0, 'cap225', 'trasegaron', 30, []);
    expect(filasVaciado(it0)[0]).toMatchObject({ trasegaron: 17, quedan: 0 });
    fijarTrasegado(it0, 'cap225', 'quedan', 2.6, []);
    expect(filasVaciado(it0)[0]).toMatchObject({ trasegaron: 14, quedan: 3 });
    fijarTrasegado(it0, 'cap225', 'quedan', -4, []);
    expect(filasVaciado(it0)[0]).toMatchObject({ trasegaron: 17, quedan: 0 });
  });

  it('quedaDe: lo que queda del lote (sin contar lo que recibe)', () => {
    const it0 = proponer1({ lote: 26236, cap225: 17, litros_actuales: 3825, vasija_actual: 'Barricas' },
      { lote: '26236', barriles: [], otras: [{ nombre: '17 Barricas', litros: 3825 }], litros_previstos: 3825 },
      'barrica-tanque', { vasija: 'T 201', cm: 30 }, ESC_0957);
    expect(quedaDe(it0)).toMatchObject({ cap225: 11, vasija_grande: 0 });
  });

  it('si queda algo y la propuesta habia vaciado la vasija, vuelve la vasija de antes', () => {
    const it0 = proponer1({ lote: 26235, cap225: 37, litros_actuales: 8325, vasija_actual: 'Barricas' },
      { lote: '26235', barriles: [], otras: [{ nombre: '37 Barricas', litros: 8325 }], litros_previstos: 8325 },
      'traslado', { litros_salida: 8000 });
    expect(it0.despues.vasija_actual).toBe('');
    fijarTrasegado(it0, 'cap225', 'quedan', 37, []);
    expect(it0.despues.vasija_actual).toBe('Barricas');
    expect(it0.litros_despues).toBe(8325);
  });

  it('el lote del corte y los lotes hijos no tienen filas (solo reciben)', () => {
    const o = ot('barricas-tanque', [{ lote: '26217', barriles: DOCE, litros_previstos: 2700 }],
      { lote_corte: { lote: '26330', id_texto: 'Corte' } });
    const p = proponer({ ot: o, lotes: [{ lote: 26217, cap225: 12 }, { lote: 26330, litros_actuales: 0 }],
      mermas: [], padron: PADRON, hoy: '2026-11-10', entradas: { por_lote: [{}], corte: { vasija: '154', litros_manual: 2600 } } });
    expect(filasVaciado(p.items.find(esItemCorte))).toEqual([]);
    expect(filasVaciado(p.items[0])).toHaveLength(1);
  });
});

/* 2026-11-10: el texto de la vasija sale de lo que queda de cada tipo. En
 * un corte, al 26215 ("Barricas + t200") le quedo solo el t200 y el texto
 * seguia diciendo "Barricas + t200". */
describe('vasijaSegunEnvases: el texto de la vasija sigue a lo que queda', () => {
  it('se va el tipo que quedo en 0', () => {
    expect(vasijaSegunEnvases('Barricas + t200', { cap200: 1 }, PADRON)).toBe('t200');
    expect(vasijaSegunEnvases('Barricas + t50', { cap225: 3 }, PADRON)).toBe('Barricas');
    expect(vasijaSegunEnvases('11 barricas + 1 T50', { cap225: 11 }, PADRON)).toBe('11 barricas');
  });
  it('la cantidad escrita se actualiza a lo que queda', () => {
    expect(vasijaSegunEnvases('17 Barricas', { cap225: 11 }, PADRON)).toBe('11 Barricas');
    expect(vasijaSegunEnvases('3 T50 + 2 barricas', { cap50: 1, cap225: 2 }, PADRON)).toBe('1 T50 + 2 barricas');
  });
  it('un tipo que queda y el texto no nombra se agrega', () => {
    expect(vasijaSegunEnvases('Barricas', { cap225: 5, cap200: 1 }, PADRON)).toBe('Barricas + 1 t200');
    expect(vasijaSegunEnvases('', { cap225: 1 }, PADRON)).toBe('1 barrica');
  });
  it('el tanque se va cuando no quedan litros en tanque, y queda si los hay', () => {
    expect(vasijaSegunEnvases('T 201 + Barricas', { cap225: 2 }, PADRON)).toBe('Barricas');
    expect(vasijaSegunEnvases('T 201 + Barricas', { vasija_grande: 2600 }, PADRON)).toBe('T 201');
    expect(vasijaSegunEnvases('Tq 25000 Bodega + Barricas', { cap225: 2 }, PADRON)).toBe('Barricas');
  });
  it('lo que no es envase ni tanque se deja; un lote vacio no tiene vasija', () => {
    expect(vasijaSegunEnvases('Nave 2 + Barricas', { cap225: 4 }, PADRON)).toBe('Nave 2 + Barricas');
    expect(vasijaSegunEnvases('Barricas + t200', {}, PADRON)).toBe('');
  });
  it('proponer: un origen de corte al que le queda solo el t200 dice t200', () => {
    const o = ot('barricas-tanque', [{ lote: '26215', barriles: [], otras: [{ nombre: '8 Barricas', litros: 1800 }], litros_previstos: 1800 }],
      { lote_corte: { lote: '26329', id_texto: 'Corte' } });
    const p = proponer({ ot: o, mermas: [], padron: PADRON, hoy: '2026-11-10',
      lotes: [{ lote: 26215, cap225: 8, cap200: 1, litros_actuales: 2000, vasija_actual: 'Barricas + t200' }, { lote: 26329, litros_actuales: 0 }],
      entradas: { por_lote: [{}], corte: { vasija: '154', litros_manual: 1750 } } });
    expect(p.items[0].despues).toMatchObject({ cap225: 0, cap200: 1, vasija_actual: 't200' });
  });
  it('fijarTrasegado rearma el texto con lo que queda (y lo que recibe)', () => {
    const o = ot('barricas-tanque', [{ lote: '26215', barriles: [], otras: [{ nombre: '8 Barricas', litros: 1800 }], litros_previstos: 1800 }],
      { lote_corte: { lote: '26329', id_texto: 'Corte' } });
    const p = proponer({ ot: o, mermas: [], padron: PADRON, hoy: '2026-11-10',
      lotes: [{ lote: 26215, cap225: 8, cap200: 1, litros_actuales: 2000, vasija_actual: 'Barricas + t200' }, { lote: 26329, litros_actuales: 0 }],
      entradas: { por_lote: [{}], corte: { vasija: '154', litros_manual: 1750 } } });
    const it0 = p.items[0];
    fijarTrasegado(it0, 'cap225', 'quedan', 3, [], PADRON);
    expect(it0.despues.vasija_actual).toBe('Barricas + t200');
    fijarTrasegado(it0, 'cap200', 'quedan', 0, [], PADRON);
    expect(it0.despues.vasija_actual).toBe('Barricas');
    // Trasiego a tanque: lo recibido va adelante.
    const q = proponer({ ot: ot('barrica-tanque', [{ lote: '26236', barriles: [], otras: [{ nombre: '17 Barricas', litros: 3825 }], litros_previstos: 3825 }]),
      lotes: [{ lote: 26236, cap225: 17, litros_actuales: 3825, vasija_actual: '17 Barricas' }], mermas: [], padron: PADRON, hoy: '2026-11-10',
      entradas: { por_lote: [{ vasija: 'T 201', cm: 30 }], corte: null } }).items[0];
    expect(q.despues.vasija_actual).toBe('T 201');
    fijarTrasegado(q, 'cap225', 'quedan', 6, [], PADRON);
    expect(q.despues.vasija_actual).toBe('T 201 + 6 Barricas');
  });
});

describe('tanques destino extra (2026-11-12)', () => {
  const PAD = [{ num: '212', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: null, activa: true },
               { num: '214', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: null, activa: true },
               { num: '189', tipo: 'TANQUE AC.INOX.', cap_real: 4200, tabla: null, activa: true }];
  const lotes = () => [
    { lote: 26217, vasija_grande: 4000, vasija_actual: 'T 189', litros_actuales: 4000 },
    { lote: 26330, vasija_actual: '', litros_actuales: 0 }];
  const ot = (dx = {}) => ({ id: 'ot-9', ot: '0990', plantilla: 'tq-tq', fecha: '2026-11-12', destino: 'T 212', lote_corte: null,
    lotes: [{ lote: '26217', tanques: [{ num: '189', litros: 4000 }], barriles: [], otras: [], litros_previstos: 4000, mov_id: 'ot-9-0',
      destinos_extra: [{ tipo: 'tanque', num: '214', litros: 1600, lote: '26330', nuevo: true, mov_id: 'ot-9-x0-0', ...dx }] }] });
  const ent = (e = {}, x = {}) => ({ por_lote: [{ vasija: 'T 212', cm: '', litros_manual: 2380, merma: '', ...e,
    extras: [{ vasija: 'T 214', cm: '', litros_manual: 1580, merma: '', ...x }] }], corte: null });

  it('un item por extra: el hijo recibe lo medido en su tanque', () => {
    const p = proponer({ ot: ot(), lotes: lotes(), mermas: [], padron: PAD, entradas: ent(), hoy: '2026-11-12' });
    const h = p.items.find(x => x.extra);
    expect(h).toMatchObject({ lote: '26330', extra: { i: 0, k: 0 }, litros_llegados: 1580 });
    expect(h.despues).toMatchObject({ vasija_grande: 1580, vasija_actual: 'T 214' });
  });
  it('merma del extra = previstos - medidos; la del destino 1 cierra la cuenta', () => {
    const p = proponer({ ot: ot(), lotes: lotes(), mermas: [], padron: PAD, entradas: ent(), hoy: '2026-11-12' });
    const o = p.items.find(x => x.indice === 0), h = p.items.find(x => x.extra);
    expect(h.merma_litros).toBe(20);              // 1600 - 1580
    expect(o.merma_litros).toBe(20);              // 4000 - 2380 - (1580 + 20)
    expect(o.despues.vasija_grande).toBe(2380);   // el origen se vacio y recibio solo el destino 1
  });
  it('extra sin previstos: merma 0 salvo que se escriba', () => {
    const sin = proponer({ ot: ot({ litros: null }), lotes: lotes(), mermas: [], padron: PAD, entradas: ent(), hoy: 'x' });
    expect(sin.items.find(x => x.extra).merma_litros).toBe(0);
    const con = proponer({ ot: ot({ litros: null }), lotes: lotes(), mermas: [], padron: PAD, entradas: ent({}, { merma: '35' }), hoy: 'x' });
    expect(con.items.find(x => x.extra).merma_litros).toBe(35);
  });
  it('la merma del destino 1 escrita a mano manda', () => {
    const p = proponer({ ot: ot(), lotes: lotes(), mermas: [], padron: PAD, entradas: ent({ merma: '12' }), hoy: 'x' });
    expect(p.items.find(x => x.indice === 0).merma_litros).toBe(12);
  });
  it('si el extra esta bloqueado (sin litros) el lote de origen tampoco se aplica', () => {
    const p = proponer({ ot: ot(), lotes: lotes(), mermas: [], padron: PAD, entradas: ent({}, { litros_manual: '' }), hoy: 'x' });
    expect(p.items.find(x => x.extra).bloqueado).toBe(true);
    expect(p.items.find(x => x.indice === 0).bloqueado).toBe(true);
  });
  it('esItemCorte no confunde un extra con el lote del corte', () => {
    expect(esItemCorte({ indice: null, hijo: undefined, extra: { i: 0, k: 0 } })).toBe(false);
  });
  it('aplicarPropuesta: aplicado en el item del extra y el hijo con sus litros', () => {
    const datos = { lotes: lotes(), mermas: [] };
    const o = ot();
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PAD, entradas: ent(), hoy: 'x' });
    aplicarPropuesta(datos, o, p, new Set(['26217', '26330']), 'ana', '2026-11-12');
    expect(o.lotes[0].destinos_extra[0].aplicado).toBeTruthy();
    expect(datos.lotes[1]).toMatchObject({ vasija_grande: 1580, vasija_actual: 'T 214', litros_actuales: 1580 });
  });
  it('aplicarPropuesta: sin el check del hijo no se aplica ni el origen (todo o nada por lote)', () => {
    const datos = { lotes: lotes(), mermas: [] };
    const o = ot();
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PAD, entradas: ent(), hoy: 'x' });
    aplicarPropuesta(datos, o, p, new Set(['26217']), 'ana', 'x');
    expect(datos.lotes[0].vasija_grande).toBe(4000);
    expect(o.lotes[0].aplicado).toBe(null);
  });
  it('sin extras la propuesta es la de siempre', () => {
    const o = ot(); delete o.lotes[0].destinos_extra;
    const p = proponer({ ot: o, lotes: lotes(), mermas: [], padron: PAD, hoy: 'x',
      entradas: { por_lote: [{ vasija: 'T 212', cm: '', litros_manual: 3980 }], corte: null } });
    expect(p.items).toHaveLength(1);
    expect(p.items[0].merma_litros).toBe(20);
  });
  it('corte con extra: el hijo recibe lo suyo y la merma de los origenes es la del tanque base', () => {
    const datos = { lotes: [...lotes(), { lote: 26400, vasija_actual: '', litros_actuales: 0 }] };
    const o = { id: 'ot-c', ot: '0991', plantilla: 'barricas-tanque', fecha: 'x', destino: 'T 212', lote_corte: { lote: '26400' },
      lotes: [{ lote: '26217', tanques: [{ num: '189', litros: 4000 }], barriles: [], otras: [], litros_previstos: 4000, mov_id: 'ot-c-0' }],
      destinos_extra: [{ tipo: 'tanque', num: '214', litros: 1600, lote: '26330', nuevo: true, mov_id: 'ot-c-xc-0' }] };
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PAD, hoy: 'x',
      entradas: { por_lote: [{}], corte: { vasija: 'T 212', cm: '', litros_manual: 2380 }, extras: [{ vasija: 'T 214', cm: '', litros_manual: 1580, merma: '' }] } });
    const h = p.items.find(x => x.extra);
    expect(h).toMatchObject({ lote: '26330', extra: { i: null, k: 0 }, litros_llegados: 1580, merma_litros: 20 });
    expect(p.items.find(x => x.indice === 0).merma_litros).toBe(20);   // 4000 - 2380 - (1580 + 20)
  });

  const corteConExtra = () => {
    const datos = { lotes: [...lotes(), { lote: 26400, vasija_actual: '', litros_actuales: 0 }], mermas: [] };
    const o = { id: 'ot-c', ot: '0991', plantilla: 'barricas-tanque', fecha: 'x', destino: 'T 212', lote_corte: { lote: '26400' },
      lotes: [{ lote: '26217', tanques: [{ num: '189', litros: 4000 }], barriles: [], otras: [], litros_previstos: 4000, mov_id: 'ot-c-0' }],
      destinos_extra: [{ tipo: 'tanque', num: '214', litros: 1600, lote: '26330', nuevo: true, mov_id: 'ot-c-xc-0' }] };
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PAD, hoy: 'x',
      entradas: { por_lote: [{}], corte: { vasija: 'T 212', cm: '', litros_manual: 2380 }, extras: [{ vasija: 'T 214', cm: '', litros_manual: 1580, merma: '' }] } });
    return { datos, o, p };
  };
  it('aplicarPropuesta en un corte con extra: el aplicado va en ot.destinos_extra[k]', () => {
    const { datos, o, p } = corteConExtra();
    aplicarPropuesta(datos, o, p, new Set(['26217', '26400', '26330']), 'ana', 'x');
    expect(o.destinos_extra[0].aplicado).toBeTruthy();
    expect(o.destinos_extra[0].aplicado.despues).toMatchObject({ vasija_grande: 1580, vasija_actual: 'T 214' });
    expect(o.lote_corte.aplicado).toBeTruthy();
    expect(o.lotes[0].aplicado).toBeTruthy();
    expect(datos.lotes.find(l => l.lote === 26330)).toMatchObject({ vasija_grande: 1580, litros_actuales: 1580 });
  });
  it('aplicarPropuesta en un corte con extra: sin el check del extra no se aplica el corte ni los origenes', () => {
    const { datos, o, p } = corteConExtra();
    aplicarPropuesta(datos, o, p, new Set(['26217', '26400']), 'ana', 'x');
    expect(o.destinos_extra[0].aplicado).toBe(null);
    expect(o.lote_corte.aplicado).toBe(null);
    expect(o.lotes[0].aplicado).toBe(null);
    expect(datos.lotes.find(l => l.lote === 26217).vasija_grande).toBe(4000);
    expect(datos.lotes.find(l => l.lote === 26400).litros_actuales).toBe(0);
  });
});

describe('agregado al confirmar como lote nuevo con barricas del Mapa', () => {
  it('avisa que hay que re-rotular en el Mapa', () => {
    const lotes = [{ lote: 26217, vasija_grande: 4000, vasija_actual: 'T 189', litros_actuales: 4000 }, { lote: 26330, litros_actuales: 0 }];
    const PAD = [{ num: '212', tipo: 'T', cap_real: 7500, tabla: null, activa: true }, { num: '189', tipo: 'T', cap_real: 4200, tabla: null, activa: true }];
    const o = { id: 'ot-9', ot: '0990', plantilla: 'tq-tq', fecha: 'x', destino: 'T 212', lote_corte: null,
      lotes: [{ lote: '26217', tanques: [{ num: '189', litros: 4000 }], barriles: [], otras: [], litros_previstos: 4000, mov_id: 'ot-9-0',
        destinos_extra: [{ tipo: 'chicas', barricas: 1, t50: 0, litros: null, lote: '26330', nuevo: true, mov_id: 'ot-9-s-0', al_confirmar: true, codigos_mapa: ['3100'] }] }] };
    const p = proponer({ ot: o, lotes, mermas: [], padron: PAD, hoy: 'x',
      entradas: { por_lote: [{ vasija: 'T 212', cm: '', litros_manual: 3700, merma: '', extras: [{ barricas_llenas: 1, t50_llenas: 0, mermas: [], merma: '' }] }], corte: null } });
    expect(p.items.find(x => x.extra).avisos).toContain('Re-rotulá en el Mapa 3100 al lote 26330.');
  });
});

describe('barricas/T50 como destino extra (2026-11-13)', () => {
  const PAD = [{ num: '212', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: null, activa: true },
               { num: '189', tipo: 'TANQUE AC.INOX.', cap_real: 4200, tabla: null, activa: true }];
  const lotes = () => [
    { lote: 26217, vasija_grande: 4000, vasija_actual: 'T 189', litros_actuales: 4000 },
    { lote: 26330, vasija_actual: '', litros_actuales: 0 }];
  const ot = () => ({ id: 'ot-9', ot: '0990', plantilla: 'tq-tq', fecha: '2026-11-13', destino: 'T 212', lote_corte: null,
    lotes: [{ lote: '26217', tanques: [{ num: '189', litros: 4000 }], barriles: [], otras: [], litros_previstos: 4000, mov_id: 'ot-9-0',
      destinos_extra: [{ tipo: 'chicas', barricas: 0, t50: 0, litros: 1600, lote: '26330', nuevo: true, mov_id: 'ot-9-x0-0' }] }] });
  const ent = x => ({ por_lote: [{ vasija: 'T 212', cm: '', litros_manual: 2380, merma: '',
    extras: [{ barricas_llenas: '', t50_llenas: '', mermas: [], merma: '', ...x }] }], corte: null });

  it('el hijo recibe las llenas, la barrica merma y la merma se calcula', () => {
    const p = proponer({ ot: ot(), lotes: lotes(), mermas: [], padron: PAD, hoy: 'x',
      entradas: ent({ barricas_llenas: 6, t50_llenas: 1, mermas: [{ barril: '1234', litros: 150, cap: 225 }] }) });
    const h = p.items.find(x => x.extra);
    expect(h.bloqueado).toBe(false);
    expect(h.litros_llegados).toBe(6 * 225 + 50 + 150);
    expect(h.despues).toMatchObject({ cap225: 7, cap50: 1 });
    expect(h.despues.vasija_actual).toMatch(/^7 barricas \+ 1 /);
    expect(h.mermas_nuevas).toEqual([expect.objectContaining({ lote: '26330', barril: '1234', litros: 150, ot: '0990' })]);
    expect(h.merma_litros).toBe(1600 - 1550);
  });
  it('sin llenas ni mermas bloquea (y con el, el lote de origen)', () => {
    const p = proponer({ ot: ot(), lotes: lotes(), mermas: [], padron: PAD, hoy: 'x', entradas: ent({}) });
    expect(p.items.find(x => x.extra).bloqueado).toBe(true);
    expect(p.items.find(x => x.indice === 0).bloqueado).toBe(true);
  });
  it('aplicar: el hijo queda en barricas y la merma de barrica se crea', () => {
    const datos = { lotes: lotes(), mermas: [] };
    const o = ot();
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PAD, hoy: 'x',
      entradas: ent({ barricas_llenas: 7, mermas: [{ barril: '1234', litros: 100, cap: 225 }] }) });
    aplicarPropuesta(datos, o, p, new Set(['26217', '26330']), 'ana', '2026-11-13');
    expect(datos.lotes[1]).toMatchObject({ cap225: 8, vasija_actual: '8 barricas' });
    expect(datos.mermas).toHaveLength(1);
    expect(o.lotes[0].destinos_extra[0].aplicado.mermas_creadas).toHaveLength(1);
  });
});

/* OT 0967 (2026-11-16): Corte a un lote existente cuyas barricas/T50 extra
 * siguen siendo el mismo lote del corte. No hay item aparte: el lote del corte
 * recibe el tanque Y las barricas, y el corte se aplica una sola vez. */
describe('corte con barricas extra del mismo lote', () => {
  const PAD = [{ num: '48', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: null, activa: true },
               { num: '199', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: null, activa: true }];
  const armar = () => {
    const datos = { lotes: [{ lote: 25312, vasija_grande: 4000, vasija_actual: 'T 199', litros_actuales: 4000 },
                            { lote: 25315, cap225: 2, vasija_actual: '2 barricas', litros_actuales: 450 }], mermas: [] };
    const o = { id: 'ot-c', ot: '0967', plantilla: 'barricas-tanque', fecha: '2026-11-12', destino: 'T 48',
      lote_corte: { lote: '25315', existente: true },
      lotes: [{ lote: '25312', tanques: [{ num: '199', litros: 4000 }], barriles: [], otras: [], litros_previstos: 4000, mov_id: 'ot-c-0' }],
      destinos_extra: [{ tipo: 'chicas', barricas: 4, t50: 1, litros: 950, lote: '25315', nuevo: true, mov_id: 'ot-c-xc-0' }] };
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PAD, hoy: 'x',
      entradas: { por_lote: [{}], corte: { vasija: 'T 48', cm: '', litros_manual: 3000 },
                  extras: [{ barricas_llenas: 4, t50_llenas: 1, mermas: [], merma: '' }] } });
    return { datos, o, p };
  };
  it('un solo item del lote del corte con el tanque + las barricas nuevas + las que ya tenia', () => {
    const { p } = armar();
    expect(p.items.filter(x => x.lote === '25315')).toHaveLength(1);
    expect(p.items.some(x => x.extra)).toBe(false);
    const c = p.items.find(x => x.lote === '25315');
    expect(c.despues).toMatchObject({ vasija_grande: 3000, cap225: 6, cap50: 1 });
    expect(c.despues.vasija_actual).toBe('T 48 + 4 barricas + 1 T50 + 2 barricas');
    expect(c.litros_llegados).toBe(3000 + 4 * 225 + 50);
    // 4000 que salieron - 3950 que llegaron (tanque + barricas)
    expect(p.items.find(x => x.indice === 0).merma_litros).toBe(50);
  });
  it('sin barricas ni T50 llenas: bloquea el corte', () => {
    const { o, datos } = armar();
    const p = proponer({ ot: o, lotes: datos.lotes, mermas: [], padron: PAD, hoy: 'x',
      entradas: { por_lote: [{}], corte: { vasija: 'T 48', cm: '', litros_manual: 3000 },
                  extras: [{ barricas_llenas: '', t50_llenas: '', mermas: [], merma: '' }] } });
    expect(p.items.find(x => x.lote === '25315').bloqueado).toBe(true);
  });
  it('aplicar: el lote del corte queda con todo y el extra no se aplica aparte', () => {
    const { datos, o, p } = armar();
    aplicarPropuesta(datos, o, p, new Set(['25312', '25315']), 'ana', 'x');
    expect(datos.lotes.find(l => l.lote === 25315)).toMatchObject({ vasija_grande: 3000, cap225: 6, cap50: 1 });
    expect(o.lote_corte.aplicado).toBeTruthy();
    expect(o.destinos_extra[0].aplicado).toBeUndefined();
  });
});

describe('trasiego simple con barricas extra del mismo lote', () => {
  const PAD = [{ num: '212', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: null, activa: true },
               { num: '189', tipo: 'TANQUE AC.INOX.', cap_real: 4200, tabla: null, activa: true }];
  const armar = (llenas = 2, merma = '') => {
    const lotes = [{ lote: 26217, vasija_grande: 4000, vasija_actual: 'T 189', litros_actuales: 4000 }];
    const o = { id: 'ot-9', ot: '0990', plantilla: 'tq-tq', fecha: '2026-11-12', destino: 'T 212', lote_corte: null,
      lotes: [{ lote: '26217', tanques: [{ num: '189', litros: 4000 }], barriles: [], otras: [], litros_previstos: 4000, mov_id: 'ot-9-0',
        destinos_extra: [{ tipo: 'chicas', barricas: 2, t50: 0, litros: null, lote: '26217', nuevo: false, mov_id: 'ot-9-s-0', al_confirmar: true }] }] };
    const p = proponer({ ot: o, lotes, mermas: [], padron: PAD, hoy: 'x',
      entradas: { por_lote: [{ vasija: 'T 212', cm: '', litros_manual: 3500, merma,
        extras: [{ barricas_llenas: llenas, t50_llenas: 0, mermas: [], merma: '' }] }], corte: null } });
    return { o, p, lotes };
  };
  it('no hay fila aparte: el lote recibe el tanque y las barricas', () => {
    const { p } = armar();
    expect(p.items).toHaveLength(1);
    const it0 = p.items[0];
    expect(it0.despues).toMatchObject({ vasija_grande: 3500, cap225: 2 });
    expect(it0.despues.vasija_actual).toBe('T 212 + 2 barricas');
    expect(it0.litros_llegados).toBe(3950);
    expect(it0.merma_litros).toBe(50);
    expect(it0.extras_mismo).toEqual([{ i: 0, k: 0, litros: 450, vasija: '2 barricas' }]);
  });
  it('sin llenas: bloquea el lote', () => {
    expect(armar(0).p.items[0].bloqueado).toBe(true);
  });
  it('la merma escrita a mano del lote manda (no se recalcula)', () => {
    expect(armar(2, '100').p.items[0].merma_litros).toBe(100);
  });
  it('realesDeExtras: el extra del mismo lote tambien tiene sus reales', () => {
    const { p } = armar();
    expect(realesDeExtras(p, () => ({}))).toEqual([{ i: 0, k: 0, destino_real: '2 barricas', litros_reales: 450, merma_litros: null }]);
  });
});

describe('corte: el extra del mismo lote anota extras_mismo', () => {
  it('con la 0967', () => {
    const PAD = [{ num: '48', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: null, activa: true }];
    const lotes = [{ lote: 25312, vasija_grande: 4000, vasija_actual: 'T 199', litros_actuales: 4000 },
                   { lote: 25315, cap225: 2, vasija_actual: '2 barricas', litros_actuales: 450 }];
    const o = { id: 'ot-c', ot: '0967', plantilla: 'barricas-tanque', fecha: '2026-11-12', destino: 'T 48',
      lote_corte: { lote: '25315', existente: true },
      lotes: [{ lote: '25312', tanques: [{ num: '199', litros: 4000 }], barriles: [], otras: [], litros_previstos: 4000, mov_id: 'ot-c-0' }],
      destinos_extra: [{ tipo: 'chicas', barricas: 1, t50: 1, litros: null, lote: '25315', mov_id: 'ot-c-xc-0' }] };
    const p = proponer({ ot: o, lotes, mermas: [], padron: PAD, hoy: 'x',
      entradas: { por_lote: [{}], corte: { vasija: 'T 48', cm: '', litros_manual: 3700 },
                  extras: [{ barricas_llenas: 1, t50_llenas: 1, mermas: [], merma: '' }] } });
    const c = p.items.find(x => x.lote === '25315');
    expect(c.extras_mismo).toEqual([{ i: null, k: 0, litros: 275, vasija: '1 barrica + 1 T50' }]);
    expect(realesDeExtras(p, () => ({}))).toEqual([{ i: null, k: 0, destino_real: '1 barrica + 1 T50', litros_reales: 275, merma_litros: null }]);
  });
});
