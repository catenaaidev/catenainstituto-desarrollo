/* Tests de ot-achique.js: las vasijas definitivas de la OT "Corte + achique"
 * (spec 2026-10-26-ot-corte-achique-design.md). Modulo puro. */
import { describe, it, expect } from 'vitest';
import { litrosChicas, nombreDestino, cantidadDestino, indiceBase, destinoChicas, asignarLotes,
         validarDestinos, normalizarAchique, movimientosDeAchique, movIdsDeOT, textoDestinos,
         lotesCreadosPorOT, armarLotesHijos, destinoRealAchique,
         clasesDeTanque, nombreClase, claseDeNum, mismaClase, nombreDestinoLargo, claseAlEscribirNum } from '../public/lotes/js/ot-achique.js';
import { proponer } from '../public/lotes/js/propuesta-ot.js';

const T = (num, litros, extra = {}) => ({ tipo: 'tanque', num, litros, ...extra });
const CH = (barricas, t50, litros, extra = {}) => ({ tipo: 'chicas', barricas, t50, litros, ...extra });
const LOTES = [{ lote: 26322 }, { lote: '26034' }];

describe('nombres y cantidades', () => {
  it('litros de las chicas: 225 por barrica, 50 por T50', () => {
    expect(litrosChicas(20, 2)).toBe(4600);
    expect(litrosChicas('3', '')).toBe(675);
    expect(litrosChicas(null, null)).toBe(0);
  });
  it('nombre de cada destino', () => {
    expect(nombreDestino(T('206'))).toBe('T 206');
    expect(nombreDestino(CH(20, 2))).toBe('20 barricas + 2 T50');
    expect(nombreDestino(CH(1, 0))).toBe('1 barrica');
    expect(nombreDestino(CH(0, 3))).toBe('3 T50');
  });
  it('cantidad: 1 por tanque, barricas + T50 en las chicas', () => {
    expect(cantidadDestino(T('206'))).toBe('1');
    expect(cantidadDestino(CH(20, 2))).toBe('20 + 2 T50');
    expect(cantidadDestino(CH(20, 0))).toBe('20');
    expect(cantidadDestino(CH(0, 4))).toBe('4 T50');
  });
});

describe('indiceBase', () => {
  it('el primer tanque se queda con el lote del corte', () => {
    expect(indiceBase([CH(5, 0), T('206'), T('209')])).toBe(1);
  });
  it('sin tanques, las chicas', () => {
    expect(indiceBase([CH(5, 0)])).toBe(0);
  });
  it('sin destinos, -1', () => {
    expect(indiceBase([])).toBe(-1);
    expect(indiceBase(null)).toBe(-1);
  });
});

describe('asignarLotes', () => {
  it('la base lleva el corte; los demas, numeros nuevos consecutivos sin chocar', () => {
    const r = asignarLotes([T('206', 7500), T('209', 7500), CH(4, 0, 900)], { corte: '26323', lotes: LOTES, anio: 2026 });
    expect(r.map(d => [d.lote, d.nuevo])).toEqual([['26323', false], ['26324', true], ['26325', true]]);
  });
  it('respeta un numero ya escrito y no lo repite', () => {
    const r = asignarLotes([T('206'), T('209', 0, { lote: '26330' }), T('210')], { corte: '26323', lotes: LOTES, anio: 2026 });
    // siguienteLote es el mayor del año + 1: con 26330 tomado, el siguiente es 26331.
    expect(r.map(d => d.lote)).toEqual(['26323', '26330', '26331']);
  });
  it('un destino que era base y deja de serlo recibe numero nuevo', () => {
    const r = asignarLotes([CH(2, 0, 450, { lote: '26323' }), T('206')], { corte: '26323', lotes: LOTES, anio: 2026 });
    expect(r.map(d => [d.lote, d.nuevo])).toEqual([['26324', true], ['26323', false]]);
  });
  it('no muta lo que recibe', () => {
    const ds = [T('206')];
    asignarLotes(ds, { corte: '26323', lotes: LOTES, anio: 2026 });
    expect(ds[0].lote).toBeUndefined();
  });
});

describe('validarDestinos', () => {
  const ctx = { lotes: LOTES, origenes: ['26034'], corte: '26323', propios: new Set() };
  const ok = ds => validarDestinos(asignarLotes(ds, { corte: '26323', lotes: LOTES, anio: 2026 }), ctx);
  it('pide al menos una vasija', () => {
    expect(validarDestinos([], ctx)).toEqual({ ok: false, error: 'Agregá al menos una vasija definitiva.' });
  });
  it('una sola fila de chicas', () => {
    expect(ok([CH(1, 0, 225), CH(2, 0, 450)]).error).toMatch(/una sola fila/);
  });
  it('tanque sin tipo ni numero, tanque repetido', () => {
    expect(ok([T('', 100)]).error).toBe('Elegí el tipo de tanque.');
    expect(ok([T('206', 100), T('t 206', 100)]).error).toBe('El T 206 está dos veces.');
  });
  it('litros y cantidades opcionales; si hay litros, mayores que 0', () => {
    expect(ok([CH(0, 0, 100)])).toEqual({ ok: true });
    expect(ok([CH('', '', '')])).toEqual({ ok: true });
    expect(ok([T('206', '')])).toEqual({ ok: true });
    expect(ok([T('206', null)])).toEqual({ ok: true });
    expect(ok([T('206', '0')]).error).toBe('Los litros de T 206 tienen que ser más que 0.');
    expect(ok([T('206', -5)]).error).toMatch(/más que 0/);
  });
  it('el lote nuevo no puede existir, ser origen, ser el corte ni repetirse', () => {
    const base = [T('206', 100)];
    expect(validarDestinos([...asignarLotes(base, { corte: '26323', lotes: LOTES, anio: 2026 }),
      { ...T('209', 100), lote: '26322', nuevo: true }], ctx).error).toBe('El lote 26322 ya existe.');
    expect(validarDestinos([{ ...T('206', 100), lote: '26323', nuevo: false },
      { ...T('209', 100), lote: '26034', nuevo: true }], ctx).error).toMatch(/origen/);
    expect(validarDestinos([{ ...T('206', 100), lote: '26323', nuevo: false },
      { ...T('209', 100), lote: '26323', nuevo: true }], ctx).error).toBe('El lote 26323 es el lote del corte.');
    expect(validarDestinos([{ ...T('206', 100), lote: '26323', nuevo: false },
      { ...T('209', 100), lote: '26400', nuevo: true }, { ...T('210', 100), lote: '26400', nuevo: true }], ctx).error)
      .toBe('El lote 26400 está repetido en las vasijas.');
  });
  it('al editar, un hijo que ya creo esta OT no cuenta como repetido', () => {
    const ds = [{ ...T('206', 100), lote: '26323', nuevo: false }, { ...T('209', 100), lote: '26322', nuevo: true }];
    expect(validarDestinos(ds, { ...ctx, propios: new Set(['26322']) })).toEqual({ ok: true });
  });
  it('la 0943 pasa', () => {
    expect(ok([T('206', 7500), T('209', 7500)])).toEqual({ ok: true });
  });
});

/* Vasijas definitivas por TIPO: al emitir se elige la clase (tipo + capacidad
 * del padron); el numero y los litros se pueden completar despues. */
const PADRON = [
  { num: '206', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: null, activa: true },
  { num: '209', tipo: 'TANQUE AC.INOX.', cap_real: 7500, tabla: null, activa: true },
  { num: '189', tipo: 'TANQUE AC.INOX.', cap_real: 4200, tabla: null, activa: true },
  { num: '144', tipo: 'PILETA DE HORMIGON', cap_real: 3000, tabla: 'pileta-30hl', activa: true },
  { num: '145', tipo: 'PILETA DE HORMIGON', cap_real: 3000, tabla: 'pileta-30hl', activa: true },
  { num: '301', tipo: 'FOUDRE OVAL', cap_real: 2050, tabla: null, activa: true },
  { num: '999', tipo: 'TANQUE AC.INOX.', cap_real: 9900, tabla: null, activa: false },
];
const C75 = { tipo: 'TANQUE AC.INOX.', cap: 7500 };
const C42 = { tipo: 'TANQUE AC.INOX.', cap: 4200 };

describe('clases de tanque', () => {
  it('una por (tipo, capacidad) de las activas, ordenadas, con su nombre en HL', () => {
    expect(clasesDeTanque(PADRON)).toEqual([
      { tipo: 'FOUDRE OVAL', cap: 2050, nombre: 'FOUDRE OVAL · 20,5 HL' },
      { tipo: 'PILETA DE HORMIGON', cap: 3000, nombre: 'PILETA DE HORMIGON · 30 HL' },
      { tipo: 'TANQUE AC.INOX.', cap: 4200, nombre: 'TANQUE AC.INOX. · 42 HL' },
      { tipo: 'TANQUE AC.INOX.', cap: 7500, nombre: 'TANQUE AC.INOX. · 75 HL' },
    ]);
    expect(clasesDeTanque(null)).toEqual([]);
  });
  it('nombreClase, claseDeNum y mismaClase', () => {
    expect(nombreClase(C75)).toBe('TANQUE AC.INOX. · 75 HL');
    expect(nombreClase(null)).toBe('');
    expect(claseDeNum(PADRON, 'T 189')).toEqual(C42);
    expect(claseDeNum(PADRON, '777')).toBeNull();
    expect(claseDeNum(PADRON, '')).toBeNull();
    expect(mismaClase(C75, { tipo: 'TANQUE AC.INOX.', cap: '7500' })).toBe(true);
    expect(mismaClase(C75, C42)).toBe(false);
    expect(mismaClase(C75, null)).toBe(false);
  });
  it('claseAlEscribirNum: el tipo automatico sigue al numero tecla a tecla', () => {
    const P2 = [...PADRON, { num: '2', tipo: 'PILETA DE HORMIGON', cap_real: 3000, activa: true },
                { num: '20', tipo: 'FOUDRE OVAL', cap_real: 2050, activa: true }];
    let d = { tipo: 'tanque', num: '', clase: null };
    for (const n of ['2', '20', '209']) d = { ...d, num: n, ...claseAlEscribirNum({ ...d, num: n }, P2) };
    expect(d).toMatchObject({ clase: C75, claseAuto: true });
    // Un numero fuera del padron deja sin tipo automatico.
    expect(claseAlEscribirNum({ num: '777', clase: C75, claseAuto: true }, P2)).toEqual({ clase: null, claseAuto: false });
    // Elegido a mano, manda el elegido.
    expect(claseAlEscribirNum({ num: '209', clase: C42, claseAuto: false }, P2)).toEqual({ clase: C42, claseAuto: false });
    expect(claseAlEscribirNum({ num: '209', clase: C42 }, P2)).toEqual({ clase: C42, claseAuto: false });
  });
  it('normalizarAchique no guarda claseAuto', () => {
    const a = normalizarAchique({ destinos: [{ tipo: 'tanque', num: '209', clase: C75, claseAuto: true, litros: null, lote: '1' }] }, 'x');
    expect(a.destinos[0]).not.toHaveProperty('claseAuto');
    expect(a.destinos[0].clase).toEqual(C75);
  });
  it('nombreDestino sin numero: el tipo; con numero: T num', () => {
    expect(nombreDestino(T('', null, { clase: C75 }))).toBe('TANQUE AC.INOX. · 75 HL');
    expect(nombreDestino(T('209', null, { clase: C75 }))).toBe('T 209');
    expect(nombreDestinoLargo(T('209', null, { clase: C75 }))).toBe('T 209 · TANQUE AC.INOX. · 75 HL');
    expect(nombreDestinoLargo(T('209'))).toBe('T 209');
    expect(nombreDestinoLargo(T('', null, { clase: C75 }))).toBe('TANQUE AC.INOX. · 75 HL');
  });
  it('chicas sin cantidades: sin numeros en el nombre ni en la cantidad', () => {
    expect(nombreDestino(CH(0, 0))).toBe('Barricas / T50');
    expect(cantidadDestino(CH('', ''))).toBe('');
  });
});

describe('validarDestinos por tipo', () => {
  const ctx = { lotes: LOTES, origenes: ['26034'], corte: '26323', propios: new Set(), padron: PADRON };
  const ok = ds => validarDestinos(asignarLotes(ds, { corte: '26323', lotes: LOTES, anio: 2026 }), ctx);
  it('alcanza con el tipo: numero y litros opcionales', () => {
    expect(ok([T('', null, { clase: C75 }), T('', null, { clase: C75 })])).toEqual({ ok: true });
  });
  it('sin tipo ni numero, error', () => {
    expect(ok([T('', 100, { clase: null })]).error).toBe('Elegí el tipo de tanque.');
  });
  it('el numero tiene que ser del tipo elegido', () => {
    expect(ok([T('209', null, { clase: C42 })]).error).toBe('El T 209 no es TANQUE AC.INOX. · 42 HL (es TANQUE AC.INOX. · 75 HL).');
    expect(ok([T('209', null, { clase: C75 })])).toEqual({ ok: true });
    // Un numero fuera del padron no se puede comparar: pasa.
    expect(ok([T('777', null, { clase: C75 })])).toEqual({ ok: true });
  });
  it('repetidos solo entre filas con numero', () => {
    expect(ok([T('209', null, { clase: C75 }), T('', null, { clase: C75 }), T('T209', null, { clase: C75 })]).error)
      .toBe('El T 209 está dos veces.');
  });
});

describe('normalizarAchique por tipo', () => {
  it('guarda la clase, el numero vacio y los litros en null', () => {
    const a = normalizarAchique({ destinos: [
      { tipo: 'tanque', num: '', clase: { tipo: 'TANQUE AC.INOX.', cap: '7500', nombre: 'x' }, litros: '', lote: '26323' },
      { tipo: 'chicas', barricas: '', t50: '', litros: '', lote: '26324' },
    ] }, 'ot-x');
    expect(a).toEqual({ destinos: [
      { tipo: 'tanque', num: '', clase: C75, litros: null, lote: '26323', nuevo: false, mov_id: null },
      { tipo: 'chicas', barricas: 0, t50: 0, litros: null, lote: '26324', nuevo: true, mov_id: 'ot-x-a0' },
    ] });
  });
  it('el traspaso al hijo sin numero ni litros: el tipo y litros null', () => {
    const ot = { ...OT_TIPO };
    const [m] = movimientosDeAchique(ot, 'ana', '2026-10-27');
    expect(m.vasija_destino).toBe('TANQUE AC.INOX. · 75 HL');
    expect(m.litros).toBeNull();
  });
});

const OT_TIPO = {
  id: 'ot-y', ot: '0950', fecha: '2026-10-27', destino: 'TQ pulmón',
  lote_corte: { lote: '26323', id_texto: 'Corte' },
  lotes: [{ lote: '26034', mov_id: 'ot-y-0' }],
  achique: { destinos: [
    { tipo: 'tanque', num: '', clase: C75, litros: null, lote: '26323', nuevo: false, mov_id: null },
    { tipo: 'tanque', num: '', clase: C75, litros: null, lote: '26324', nuevo: true, mov_id: 'ot-y-a0' },
  ] },
};

describe('normalizarAchique', () => {
  it('limpia, deja la base sin mov_id y numera los hijos', () => {
    const a = normalizarAchique({ destinos: [
      { tipo: 'tanque', num: 'T 206', litros: '7500', lote: '26323', nuevo: false, litrosTocado: true },
      { tipo: 'tanque', num: '209', litros: 7500, lote: '26324', nuevo: true },
      { tipo: 'chicas', barricas: '20', t50: '2', litros: '4600', lote: '26325', nuevo: true },
    ] }, 'ot-x');
    expect(a).toEqual({ destinos: [
      { tipo: 'tanque', num: '206', litros: 7500, lote: '26323', nuevo: false, mov_id: null },
      { tipo: 'tanque', num: '209', litros: 7500, lote: '26324', nuevo: true, mov_id: 'ot-x-a0' },
      { tipo: 'chicas', barricas: 20, t50: 2, litros: 4600, lote: '26325', nuevo: true, mov_id: 'ot-x-a1' },
    ] });
  });
  it('conserva el mov_id de un hijo que ya lo tenia', () => {
    const a = normalizarAchique({ destinos: [T('206', 1, { lote: '1' }), T('209', 1, { lote: '2', mov_id: 'ot-x-a0' }),
      T('210', 1, { lote: '3' })] }, 'ot-x');
    expect(a.destinos.map(d => d.mov_id)).toEqual([null, 'ot-x-a0', 'ot-x-a1']);
  });
  it('sin destinos, null', () => {
    expect(normalizarAchique(null, 'ot-x')).toBeNull();
    expect(normalizarAchique({ destinos: [] }, 'ot-x')).toBeNull();
  });
});

const OT = {
  id: 'ot-x', ot: '0944', fecha: '2026-10-14', destino: 'TQ pulmón bodega',
  lote_corte: { lote: '26323', id_texto: 'Corte Base PN DN Grand Mere' },
  lotes: [{ lote: '26034', mov_id: 'ot-x-0' }, { lote: '26038', mov_id: 'ot-x-1' }],
  achique: { destinos: [
    { tipo: 'tanque', num: '206', litros: 7500, lote: '26323', nuevo: false, mov_id: null },
    { tipo: 'tanque', num: '209', litros: 7500, lote: '26324', nuevo: true, mov_id: 'ot-x-a0' },
  ] },
};

describe('movimientos e ids', () => {
  it('un traspaso pendiente del corte a cada hijo', () => {
    expect(movimientosDeAchique(OT, 'ana', '2026-10-13')).toEqual([{
      id: 'ot-x-a0', lote: '26323', tipo: 'traspaso', fecha: '2026-10-14',
      vasija_origen: 'TQ pulmón bodega', vasija_destino: 'T 209', litros: 7500,
      lote_destino: '26324', destino_externo: '', estado: 'pendiente', ot: '0944',
      operario: '', comentario: '', cargado_por: 'ana', cargado_el: '2026-10-13',
    }]);
  });
  it('sin achique o sin corte, nada', () => {
    expect(movimientosDeAchique({ ...OT, achique: null }, 'ana', 'h')).toEqual([]);
    expect(movimientosDeAchique({ ...OT, lote_corte: null }, 'ana', 'h')).toEqual([]);
  });
  it('ids de la OT: lotes de origen y traspasos a hijos', () => {
    expect(movIdsDeOT(OT)).toEqual(['ot-x-0', 'ot-x-1', 'ot-x-a0']);
    expect(movIdsDeOT({ lotes: [{ mov_id: 'a' }] })).toEqual(['a']);
  });
  it('textoDestinos y lotesCreadosPorOT', () => {
    expect(textoDestinos(OT)).toBe('T 206 + T 209');
    expect(textoDestinos({})).toBe('');
    expect(lotesCreadosPorOT(OT)).toEqual(['26323', '26324']);
    expect(lotesCreadosPorOT({ ...OT, lote_corte: { lote: '26323', existente: true } })).toEqual(['26324']);
  });
  it('destinoChicas', () => {
    expect(destinoChicas(OT)).toBeNull();
    const ch = { tipo: 'chicas', barricas: 2, t50: 0, lote: '26325' };
    expect(destinoChicas({ achique: { destinos: [ch] } })).toBe(ch);
  });
});

describe('armarLotesHijos', () => {
  it('una copia del lote del corte por cada hijo que todavia no existe', () => {
    const ficha = { lote: 26323, id_texto: 'Corte PN', variedad: 'Pinot Noir', litros_actuales: 0, vasija_grande: 10, vasija_actual: '3 barricas' };
    const hijos = armarLotesHijos(OT.achique.destinos, ficha, [{ lote: 26323 }]);
    expect(hijos).toHaveLength(1);
    expect(hijos[0]).toMatchObject({ lote: 26324, id_texto: 'Corte PN', variedad: 'Pinot Noir', origen: 'Vino',
      litros_actuales: 0, vasija_grande: null, vasija_actual: '' });
    expect(armarLotesHijos(OT.achique.destinos, ficha, [{ lote: '26324' }])).toEqual([]);
  });
});

describe('destinoRealAchique', () => {
  it('tanque: la vasija medida, o el nombre del destino', () => {
    expect(destinoRealAchique({ tipo: 'tanque', num: '206' }, { vasija: 'T 207' }, null)).toBe('T 207');
    expect(destinoRealAchique({ tipo: 'tanque', num: '206' }, { vasija: '' }, null)).toBe('T 206');
  });
  it('chicas: cuenta tambien las barricas merma (lo que queda en la ficha)', () => {
    const d = { tipo: 'chicas', barricas: 20, t50: 0, litros: 4500, lote: '26323', nuevo: false, mov_id: null };
    const ot = { id: 'ot-1', ot: '0950', plantilla: 'corte-achique', destino: 'TQ pulmón', fecha: '2026-10-14',
      lote_corte: { lote: '26323', id_texto: 'X' }, achique: { destinos: [d] },
      lotes: [{ lote: '25315', barriles: [], litros_previstos: 4500, mov_id: 'ot-1-0' }] };
    const e = { barricas_llenas: 19, t50_llenas: 0, mermas: [{ barril: '99', cap: 225, litros: 150 }] };
    const p = proponer({ ot, lotes: [{ lote: 26323, litros_actuales: 0 }, { lote: 25315, vasija_grande: 4500 }],
      mermas: [], padron: [], hoy: '2026-10-14', entradas: { por_lote: [{}], destinos: [e] } });
    const it = p.items.find(x => x.indice == null);
    expect(destinoRealAchique(d, e, it)).toBe('20 barricas');
    // Sin propuesta: lo que se lleno.
    expect(destinoRealAchique(d, e, null)).toBe('19 barricas');
  });
});
