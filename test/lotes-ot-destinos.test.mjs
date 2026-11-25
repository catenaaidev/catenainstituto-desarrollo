/* Tests de ot-destinos.js: tanques destino extra de una OT de trasiego
 * (spec 2026-11-12-ot-varios-destinos-design.md). Modulo puro. */
import { describe, it, expect } from 'vitest';
import { admiteExtras, normalizarExtras, asignarLotesExtra, validarExtras, extrasDeOT,
         movimientosDeExtras, armarHijosExtra, nombreExtra, restoDestino1,
         validarExtrasEntreLotes, esExtraMismoLote } from '../public/lotes/js/ot-destinos.js';
import { anioDeLote } from '../public/lotes/js/lote-nuevo.js';

const PADRON = [{ num: '214', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: 'tanque-75hl', activa: true },
                { num: '212', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: 'tanque-75hl', activa: true }];
const LOTES = [{ lote: 26217 }, { lote: 26329 }];

describe('admiteExtras', () => {
  it('solo las plantillas de trasiego con tanque o barricas de destino', () => {
    for (const p of ['barricas-barricas', 'tq-barricas', 'barrica-tanque', 'tq-tq', 'barricas-tanque']) expect(admiteExtras(p)).toBe(true);
    for (const p of ['corte-achique', 'traslado', 'muestras-ot', 'xx']) expect(admiteExtras(p)).toBe(false);
  });
});

describe('normalizarExtras', () => {
  it('limpia, saca la T, vacia litros a null y da mov_id sin repetir', () => {
    const r = normalizarExtras([{ num: 'T 214', litros: '3000', lote: ' 26330 ' }, { num: '212', litros: '', lote: '26331', mov_id: 'ot-1-x0-0' }], 'ot-1', 'x0');
    expect(r).toEqual([
      { tipo: 'tanque', num: '214', litros: 3000, lote: '26330', nuevo: true, mov_id: 'ot-1-x0-1' },
      { tipo: 'tanque', num: '212', litros: null, lote: '26331', nuevo: true, mov_id: 'ot-1-x0-0' },
    ]);
  });
  it('sin filas o filas sin numero: lista vacia', () => {
    expect(normalizarExtras(null, 'ot-1', 'x0')).toEqual([]);
    expect(normalizarExtras([{ num: '', lote: '' }], 'ot-1', 'x0')).toEqual([]);
  });
});

describe('asignarLotesExtra', () => {
  it('propone el siguiente libre del año sin repetir y respeta lo escrito', () => {
    const r = asignarLotesExtra([{ num: '214' }, { num: '212', lote: '26340' }, { num: '213' }], { lotes: LOTES, anio: 2026, reservados: [] });
    // Ruling 2 (controller, task-1): siguienteLote es max-del-anio + 1; con
    // 26217/26329 ya ocupados y 26340 ya escrito, el siguiente libre es 26341
    // y el de despues 26342 (no 26330: ese numero quedo atras del maximo).
    expect(r.map(d => d.lote)).toEqual(['26341', '26340', '26342']);
  });
  it('no usa un numero reservado (hijos de otro lote de la misma OT)', () => {
    const r = asignarLotesExtra([{ num: '214' }], { lotes: LOTES, anio: 2026, reservados: ['26330'] });
    expect(r[0].lote).toBe('26331');
  });
});

describe('validarExtras', () => {
  const ctx = { lotes: LOTES, padron: PADRON, origenes: ['26217'], loteCorte: '', destino1: 'T 212', propios: new Set() };
  it('ok con tanque y lote libres', () => {
    expect(validarExtras([{ num: '214', lote: '26330' }], ctx)).toEqual({ ok: true });
  });
  it('lista vacia es valida (OT de un solo destino)', () => {
    expect(validarExtras([], ctx)).toEqual({ ok: true });
  });
  it('falta el tanque', () => {
    expect(validarExtras([{ num: '', lote: '26330' }], ctx).error).toBe('Falta el número de un tanque destino extra.');
  });
  it('tanque igual al destino 1', () => {
    expect(validarExtras([{ num: '212', lote: '26330' }], ctx).error).toBe('El T 212 ya es el destino de la OT.');
  });
  it('tanque repetido', () => {
    expect(validarExtras([{ num: '214', lote: '26330' }, { num: 'T 214', lote: '26331' }], ctx).error).toBe('El T 214 está dos veces.');
  });
  it('lote repetido, de origen, del corte u ocupado', () => {
    expect(validarExtras([{ num: '214', lote: '26330' }, { num: '213', lote: '26330' }], ctx).error).toBe('El lote 26330 está repetido en los destinos.');
    expect(validarExtras([{ num: '214', lote: '26217' }], ctx).error).toBe('El lote 26217 es uno de los lotes de origen.');
    expect(validarExtras([{ num: '214', lote: '26400' }], { ...ctx, loteCorte: '26400' }).error).toBe('El lote 26400 es el lote del corte.');
    expect(validarExtras([{ num: '214', lote: '26329' }], ctx).ok).toBe(false);
  });
  it('un hijo que esta misma OT ya creo no cuenta como ocupado', () => {
    expect(validarExtras([{ num: '214', lote: '26329' }], { ...ctx, propios: new Set(['26329']) })).toEqual({ ok: true });
  });
  it('mismoLote (agregado al confirmar): el lote que lo llena se acepta, aunque sea de origen o este dos veces', () => {
    const l = [{ num: '214', lote: '26217' }, { tipo: 'chicas', barricas: 1, t50: 0, lote: '26217' }];
    expect(validarExtras(l, { ...ctx, mismoLote: '26217' })).toEqual({ ok: true });
    expect(validarExtras([{ num: '212', lote: '26217' }], { ...ctx, mismoLote: '26217' }).error).toBe('El T 212 ya es el destino de la OT.');
  });
  it('litros escritos tienen que ser mas que 0', () => {
    expect(validarExtras([{ num: '214', lote: '26330', litros: '0' }], ctx).error).toBe('Los litros del T 214 tienen que ser más que 0.');
  });
});

const D = (num, lote, extra = {}) => ({ tipo: 'tanque', num, litros: null, lote, nuevo: true, mov_id: `m-${num}`, ...extra });

describe('extrasDeOT y movimientos', () => {
  const simple = { id: 'ot-1', ot: '0990', fecha: '2026-11-12', destino: 'T 212', lote_corte: null,
    lotes: [{ lote: '26217', destinos_extra: [D('214', '26330', { litros: 3000 })] }, { lote: '26105' }] };
  const corte = { id: 'ot-2', ot: '0991', fecha: '2026-11-12', destino: 'T 201', lote_corte: { lote: '26400' },
    lotes: [{ lote: '26217' }], destinos_extra: [D('214', '26401')] };

  it('trasiego simple: cada extra con su lote padre', () => {
    expect(extrasDeOT(simple).map(x => [x.i, x.k, x.padre, x.d.lote])).toEqual([[0, 0, '26217', '26330']]);
  });
  it('corte: los extra son hijos del lote del corte', () => {
    expect(extrasDeOT(corte).map(x => [x.i, x.k, x.padre, x.d.lote])).toEqual([[null, 0, '26400', '26401']]);
  });
  it('OT sin extras: lista vacia', () => {
    expect(extrasDeOT({ lotes: [{ lote: '1' }] })).toEqual([]);
  });
  it('un traspaso pendiente padre -> hijo por extra', () => {
    const [m] = movimientosDeExtras(simple, 'ana', '2026-11-12');
    // Ruling 1 (controller, task-1): PENDIENTE en ot-movimientos.js es el
    // string 'pendiente' (minuscula), no 'PENDIENTE'.
    expect(m).toMatchObject({ id: 'm-214', lote: '26217', tipo: 'traspaso', vasija_origen: 'T 212',
      vasija_destino: 'T 214', litros: 3000, lote_destino: '26330', estado: 'pendiente', ot: '0990', cargado_por: 'ana' });
  });
  it('nombreExtra', () => { expect(nombreExtra(D('214', 'x'))).toBe('T 214'); });
});

describe('armarHijosExtra', () => {
  it('copia la ficha del padre, sin litros ni vasija, y no repite existentes', () => {
    const ot = { lotes: [{ lote: '26217', destinos_extra: [D('214', '26330'), D('213', '26217')] }] };
    const ficha = { lote: 26217, variedad: 'Malbec', anio: 2026, id_texto: 'MB Alto', cap225: 12, litros_actuales: 2700, vasija_actual: 'T 212' };
    const hijos = armarHijosExtra(ot, l => (String(l) === '26217' ? ficha : null), [{ lote: 26217 }]);
    expect(hijos).toHaveLength(1);
    expect(hijos[0]).toMatchObject({ lote: 26330, variedad: 'Malbec', vasija_actual: '' });
    expect(hijos[0].cap225 ?? null).toBe(null);
  });
});

describe('restoDestino1', () => {
  it('sin extras devuelve los previstos tal cual', () => {
    expect(restoDestino1(4000, [])).toBe(4000);
    expect(restoDestino1(null, undefined)).toBe(null);
  });
  it('con todos los extras con litros: previstos menos los extras', () => {
    expect(restoDestino1(4000, [D('214', 'a', { litros: 1500 }), D('215', 'b', { litros: 500.5 })])).toBe(1999.5);
  });
  it('si algun extra no tiene litros o faltan los previstos, no se resta nada', () => {
    expect(restoDestino1(4000, [D('214', 'a', { litros: 1500 }), D('215', 'b')])).toBe(4000);
    expect(restoDestino1(null, [D('214', 'a', { litros: 1500 })])).toBe(null);
  });
});

describe('validarExtrasEntreLotes', () => {
  it('sin repetidos: ok', () => {
    expect(validarExtrasEntreLotes([[D('214', '26330')], [D('215', '26331')], []])).toEqual({ ok: true });
  });
  it('el mismo tanque en dos lotes', () => {
    expect(validarExtrasEntreLotes([[D('214', '26330')], [D('T 214', '26331')]])).toEqual({ ok: false, error: 'El T 214 está en dos lotes.' });
  });
  it('el mismo lote nuevo en dos lotes', () => {
    expect(validarExtrasEntreLotes([[D('214', '26330')], [D('215', ' 26330')]])).toEqual({ ok: false, error: 'El lote 26330 está en dos destinos extra.' });
  });
});

describe('destino extra de barricas/T50 (chicas)', () => {
  const ctx = { lotes: LOTES, padron: PADRON, origenes: ['26217'], destino1: 'T 212' };
  it('normaliza la fila sin numero de tanque, con cantidades enteras', () => {
    const r = normalizarExtras([{ tipo: 'chicas', barricas: '12', t50: '', litros: '', lote: '26350' }], 'ot-1', 'x0');
    expect(r).toEqual([{ tipo: 'chicas', barricas: 12, t50: 0, litros: null, lote: '26350', nuevo: true, mov_id: 'ot-1-x0-0' }]);
  });
  it('nombre segun las cantidades (vacias = Barricas / T50)', () => {
    expect(nombreExtra({ tipo: 'chicas', barricas: 12, t50: 0 })).toBe('12 barricas');
    expect(nombreExtra({ tipo: 'chicas', barricas: 1, t50: 2 })).toMatch(/^1 barrica \+ 2 /);
    expect(nombreExtra({ tipo: 'chicas' })).toBe('Barricas / T50');
  });
  it('valida: cantidades opcionales, una sola fila, lote libre', () => {
    expect(validarExtras([{ tipo: 'chicas', lote: '26350' }], ctx)).toEqual({ ok: true });
    expect(validarExtras([{ tipo: 'chicas', lote: '26350' }, { tipo: 'chicas', lote: '26351' }], ctx).ok).toBe(false);
    expect(validarExtras([{ tipo: 'chicas', lote: '' }], ctx).error).toBe('Falta el lote de las barricas.');
    expect(validarExtras([{ tipo: 'chicas', lote: '26217' }], ctx).ok).toBe(false);
    expect(validarExtras([{ tipo: 'chicas', lote: '26350' }, { num: '214', lote: '26351' }], ctx)).toEqual({ ok: true });
  });
  it('entre lotes: dos lotes pueden tener barricas extra, pero no el mismo lote nuevo', () => {
    expect(validarExtrasEntreLotes([[{ tipo: 'chicas', lote: '26350' }], [{ tipo: 'chicas', lote: '26351' }]])).toEqual({ ok: true });
    expect(validarExtrasEntreLotes([[{ tipo: 'chicas', lote: '26350' }], [{ tipo: 'chicas', lote: '26350' }]]).ok).toBe(false);
  });
  it('movimiento traspaso padre -> hijo con las barricas como vasija destino', () => {
    const ot = { ot: 'OT-1', fecha: '2026-11-13', destino: 'T 212',
      lotes: [{ lote: '26217', destinos_extra: [{ tipo: 'chicas', barricas: 10, t50: 0, litros: 2250, lote: '26350', mov_id: 'm1' }] }] };
    const [m] = movimientosDeExtras(ot, 'u', '2026-11-13');
    expect(m).toMatchObject({ id: 'm1', lote: '26217', tipo: 'traspaso', vasija_origen: 'T 212', vasija_destino: '10 barricas', litros: 2250, lote_destino: '26350' });
  });
});

describe('destino por lote (2026-11-13)', () => {
  it('destinoDeLote: el del lote, o el de la OT (OT viejas)', async () => {
    const { destinoDeLote, unirDestinos } = await import('../public/lotes/js/ot-destinos.js');
    expect(destinoDeLote({ destino: 'T 212' }, { destino: 'P147' })).toBe('P147');
    expect(destinoDeLote({ destino: 'T 212' }, {})).toBe('T 212');
    expect(unirDestinos([{ destino: 'T 212' }, { destino: ' T 212' }, { destino: 'P147' }, {}])).toBe('T 212 + P147');
  });
  it('el traspaso a un extra sale del destino de SU lote', () => {
    const ot = { ot: 'OT-1', fecha: 'x', destino: 'T 212 + P147',
      lotes: [{ lote: '1', destino: 'T 212' }, { lote: '2', destino: 'P147', destinos_extra: [{ tipo: 'tanque', num: '214', lote: '3', mov_id: 'm' }] }] };
    expect(movimientosDeExtras(ot, 'u', 'x')[0].vasija_origen).toBe('P147');
  });
});

/* Pedido 2026-11-16 (OT 0967): en un Corte a un lote EXISTENTE, las
 * barricas/T50 extra pueden seguir siendo el mismo lote del corte (no se crea
 * hijo). */
describe('extra con el mismo lote del corte', () => {
  const CH = (lote, x = {}) => ({ tipo: 'chicas', barricas: 3, t50: 1, litros: 700, lote, nuevo: true, mov_id: 'ot-c-xc-0', ...x });
  it('validarExtras lo acepta solo con mismoLoteCorte', () => {
    const ctx = { lotes: [{ lote: 25315 }], loteCorte: '25315', origenes: ['25312'], destino1: 'T 48' };
    expect(validarExtras([CH('25315')], ctx).ok).toBe(false);
    expect(validarExtras([CH('25315')], { ...ctx, mismoLoteCorte: true })).toEqual({ ok: true });
    // Un lote existente que NO es el del corte sigue sin poder usarse.
    expect(validarExtras([CH('25316')], { ...ctx, lotes: [{ lote: 25315 }, { lote: 25316 }], mismoLoteCorte: true }).ok).toBe(false);
  });
  it('esExtraMismoLote: solo en el Corte y con el numero del corte', () => {
    const o = { ot: '0967', destino: 'T 48', lote_corte: { lote: '25315' }, lotes: [], destinos_extra: [CH('25315'), CH('25330')] };
    expect(extrasDeOT(o).map(esExtraMismoLote)).toEqual([true, false]);
  });
  it('el movimiento es un trasiego del mismo lote (sin traspaso, sin linaje)', () => {
    const o = { ot: '0967', fecha: '2026-11-12', destino: 'T 48', lote_corte: { lote: '25315' }, lotes: [], destinos_extra: [CH('25315')] };
    expect(movimientosDeExtras(o, 'ana', 'x')[0]).toMatchObject({ id: 'ot-c-xc-0', lote: '25315', tipo: 'trasiego',
      vasija_origen: 'T 48', lote_destino: '' });
  });
  it('armarHijosExtra no crea ningun hijo', () => {
    const o = { lote_corte: { lote: '25315' }, lotes: [], destinos_extra: [CH('25315')] };
    expect(armarHijosExtra(o, () => ({ lote: 25315 }), [])).toEqual([]);
  });
});

describe('anioDeLote', () => {
  it('el año sale de los dos primeros digitos de un lote de 5; si no, el de respaldo', () => {
    expect(anioDeLote('25315', 2026)).toBe(2025);
    expect(anioDeLote(26217, 2025)).toBe(2026);
    expect(anioDeLote('', 2026)).toBe(2026);
    expect(anioDeLote('A12', 2026)).toBe(2026);
  });
});

describe('mismo lote en el trasiego simple', () => {
  it('esExtraMismoLote: el extra con el lote de su origen', () => {
    const o = { ot: '0990', destino: 'T 212', lote_corte: null,
      lotes: [{ lote: '26217', destinos_extra: [{ tipo: 'chicas', barricas: 1, t50: 0, lote: '26217', mov_id: 'a' },
                                               { tipo: 'chicas', barricas: 1, t50: 0, lote: '26330', mov_id: 'b' }] }] };
    expect(extrasDeOT(o).map(esExtraMismoLote)).toEqual([true, false]);
  });
  it('normalizarExtras conserva al_confirmar y codigos_mapa', () => {
    const r = normalizarExtras([{ tipo: 'chicas', barricas: 1, t50: 1, lote: '25315', al_confirmar: true, codigos_mapa: ['1250070', '50138'] }], 'ot-1', 's');
    expect(r[0]).toMatchObject({ al_confirmar: true, codigos_mapa: ['1250070', '50138'] });
    expect(normalizarExtras([{ num: '214', lote: '26330' }], 'ot-1', 'x0')[0]).not.toHaveProperty('al_confirmar');
  });
});
