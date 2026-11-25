/* Sobrante al confirmar (spec 2026-11-16-ot-sobrante-al-confirmar-design.md). Puro. */
import { describe, it, expect } from 'vitest';
import { sobranteSegunMapa, otConAgregados, incorporarAgregados, lugaresAplicados, agregadosAplicables, validarAgregados } from '../public/lotes/js/ot-sobrante.js';
import { escaneosPorLote } from '../public/lotes/js/propuesta-ot.js';

const LL = (lote, barriles) => ({ ot: '0967', lote, tipo: 'llenado', fecha: '2026-11-16', barriles });
const OT0967 = (dx = {}) => ({ id: 'ot-c', ot: '0967', plantilla: 'barricas-tanque', destino: 'T 48',
  lote_corte: { lote: '25315', existente: true }, lotes: [{ lote: '25312' }], ...dx });

describe('sobranteSegunMapa', () => {
  it('0967: la barrica y el T50 llenados en el Mapa son sobrante del lote del corte', () => {
    const p = escaneosPorLote([LL('25315', [{ num: '1250070', cap: 225 }, { num: '50138', cap: 50 }])]);
    expect(sobranteSegunMapa(OT0967(), p, 'tanque')).toEqual([
      { i: null, lote: '25315', barricas: 1, t50: 1, codigos: ['1250070', '50138'], sinCap: [] }]);
  });
  it('si la OT ya tiene barricas/T50 extra para ese lote, no hay sobrante', () => {
    const p = escaneosPorLote([LL('25315', [{ num: '1250070', cap: 225 }])]);
    const o = OT0967({ destinos_extra: [{ tipo: 'chicas', barricas: 1, t50: 0, lote: '25315', mov_id: 'z' }] });
    expect(sobranteSegunMapa(o, p, 'tanque')).toEqual([]);
  });
  it('trasiego a tanque: por lote de origen', () => {
    const o = { id: 'ot-9', ot: '0990', plantilla: 'tq-tq', destino: 'T 212', lote_corte: null, lotes: [{ lote: '26217' }, { lote: '26105' }] };
    const p = escaneosPorLote([LL('26105', [{ num: '3100', cap: 228 }])]);
    expect(sobranteSegunMapa(o, p, 'tanque')).toEqual([{ i: 1, lote: '26105', barricas: 1, t50: 0, codigos: ['3100'], sinCap: [] }]);
  });
  it('trasiego a barricas: los llenados son el destino normal', () => {
    const o = { id: 'ot-9', ot: '0990', plantilla: 'tq-barricas', destino: '', lote_corte: null, lotes: [{ lote: '26217' }] };
    expect(sobranteSegunMapa(o, escaneosPorLote([LL('26217', [{ num: '1', cap: 225 }])]), 'barricas')).toEqual([]);
  });
  it('barril de capacidad rara: va aparte y no se cuenta', () => {
    const p = escaneosPorLote([LL('25315', [{ num: '9', cap: 1000 }, { num: '1250070', cap: 225 }])]);
    expect(sobranteSegunMapa(OT0967(), p, 'tanque')[0]).toMatchObject({ barricas: 1, t50: 0, codigos: ['1250070'], sinCap: ['9'] });
  });
  it('sin escaneos: nada', () => {
    expect(sobranteSegunMapa(OT0967(), {}, 'tanque')).toEqual([]);
  });
});

describe('otConAgregados', () => {
  const ot = () => ({ id: 'ot-c', ot: '0967', destino: 'T 48', fecha: '2026-11-12', lote_corte: { lote: '25315' },
    lotes: [{ lote: '25312', mov_id: 'ot-c-0' }], destinos_extra: [{ tipo: 'tanque', num: '214', litros: null, lote: '25330', nuevo: true, mov_id: 'ot-c-xc-0' }] });
  it('suma al final, con al_confirmar y mov_id propio, sin tocar la OT original', () => {
    const o = ot();
    const c = otConAgregados(o, [{ i: null, tipo: 'chicas', barricas: 1, t50: 1, lote: '25315', codigos: ['1250070', '50138'] }]);
    expect(o.destinos_extra).toHaveLength(1);
    expect(c.destinos_extra[1]).toMatchObject({ tipo: 'chicas', barricas: 1, t50: 1, lote: '25315', al_confirmar: true,
      codigos_mapa: ['1250070', '50138'], mov_id: 'ot-c-s-0' });
  });
  it('en un trasiego simple, al lote i', () => {
    const o = { id: 'ot-9', ot: '0990', destino: 'T 212', lote_corte: null, lotes: [{ lote: '26217', mov_id: 'ot-9-0' }] };
    const c = otConAgregados(o, [{ i: 0, tipo: 'tanque', num: 'T 214', lote: '26217' }]);
    expect(c.lotes[0].destinos_extra[0]).toMatchObject({ tipo: 'tanque', num: '214', lote: '26217', al_confirmar: true });
    expect(o.lotes[0].destinos_extra).toBeUndefined();
  });
});

describe('incorporarAgregados', () => {
  it('mismo lote: extra + movimiento trasiego, sin hijo', () => {
    const datos = { lotes: [{ lote: 25315 }], movimientos: [] };
    const o = { id: 'ot-c', ot: '0967', destino: 'T 48', fecha: '2026-11-12', lote_corte: { lote: '25315' }, lotes: [{ lote: '25312', mov_id: 'ot-c-0' }] };
    const r = incorporarAgregados(datos, o, [{ i: null, tipo: 'chicas', barricas: 1, t50: 1, lote: '25315' }], 'ana', 'x', () => ({ lote: 25315 }));
    expect(o.destinos_extra[0]).toMatchObject({ lote: '25315', al_confirmar: true, mov_id: 'ot-c-s-0' });
    expect(datos.movimientos).toEqual([expect.objectContaining({ id: 'ot-c-s-0', lote: '25315', tipo: 'trasiego', lote_destino: '' })]);
    expect(r.hijos).toEqual([]);
  });
  it('lote nuevo: traspaso padre -> hijo y el hijo creado', () => {
    const datos = { lotes: [{ lote: 25315, id_texto: 'Componente NCZ 2025' }], movimientos: [] };
    const o = { id: 'ot-c', ot: '0967', destino: 'T 48', fecha: '2026-11-12', lote_corte: { lote: '25315' }, lotes: [{ lote: '25312', mov_id: 'ot-c-0' }] };
    const r = incorporarAgregados(datos, o, [{ i: null, tipo: 'chicas', barricas: 1, t50: 0, lote: '25316' }], 'ana', 'x',
      l => datos.lotes.find(x => String(x.lote) === String(l)));
    expect(datos.movimientos[0]).toMatchObject({ tipo: 'traspaso', lote: '25315', lote_destino: '25316' });
    expect(r.hijos.map(h => h.lote)).toEqual([25316]);
    expect(datos.lotes.some(l => l.lote === 25316)).toBe(true);
  });
  it('sin datos.lotes: lo crea para el hijo', () => {
    const datos = { movimientos: [] };
    const o = { id: 'ot-c', ot: '0967', destino: 'T 48', fecha: '2026-11-12', lote_corte: { lote: '25315' }, lotes: [{ lote: '25312', mov_id: 'ot-c-0' }] };
    const r = incorporarAgregados(datos, o, [{ i: null, tipo: 'chicas', barricas: 1, t50: 0, lote: '25316' }], 'ana', 'x',
      () => ({ lote: 25315, id_texto: 'Componente NCZ 2025' }));
    expect(r.hijos.map(h => h.lote)).toEqual([25316]);
    expect(datos.lotes.map(l => l.lote)).toEqual([25316]);
  });
});

describe('solo se guardan los agregados de los lugares que se aplican', () => {
  const corte = { lote: '25315', indice: null };
  it('lugaresAplicados: el corte si su item entra; cada lote por su indice', () => {
    const items = [{ lote: '25312', indice: 0 }, corte, { lote: '25330', indice: null, extra: { i: null, k: 0 } }];
    expect([...lugaresAplicados(items, [0, 1, 2])].sort()).toEqual(['0', 'c']);
    expect([...lugaresAplicados(items, [])]).toEqual([]);
    const simple = [{ lote: '1', indice: 0 }, { lote: '2', indice: 1 }, { lote: '9', indice: null, extra: { i: 1, k: 0 } }];
    expect([...lugaresAplicados(simple, [0])]).toEqual(['0']);
  });
  it('agregadosAplicables: deja afuera los de un lugar sin aplicar (No tocar, bloqueado)', () => {
    const ag = [{ i: 0, lote: '1' }, { i: 1, lote: '2' }, { i: null, lote: '25315' }];
    expect(agregadosAplicables(ag, new Set(['0']))).toEqual([{ i: 0, lote: '1' }]);
    expect(agregadosAplicables(ag, new Set(['c', '1']))).toEqual([{ i: 1, lote: '2' }, { i: null, lote: '25315' }]);
    expect(agregadosAplicables(ag, new Set())).toEqual([]);
  });
});

describe('validarAgregados', () => {
  const LOTES = [{ lote: 25312 }, { lote: 25315 }, { lote: 25330 }, { lote: 26217 }, { lote: 26105 }];
  const corte = (ag, dx = {}) => otConAgregados({ id: 'ot-c', ot: '0967', destino: 'T 48', lote_corte: { lote: '25315' },
    lotes: [{ lote: '25312', mov_id: 'ot-c-0' }], ...dx }, ag);
  const ctxC = { lotes: LOTES, destinos: { c: 'T 48' }, tanquesOT: ['T 48'] };
  it('0967: barricas/T50 del mismo lote del corte, ok', () => {
    expect(validarAgregados(corte([{ i: null, tipo: 'chicas', barricas: 1, t50: 1, lote: '25315' }]), ctxC)).toEqual({ ok: true });
  });
  it('otro tanque igual al destino del corte: el mismo error que validarExtras', () => {
    expect(validarAgregados(corte([{ i: null, tipo: 'tanque', num: '48', lote: '25315' }]), ctxC).error).toBe('El T 48 ya es el destino de la OT.');
  });
  it('otro tanque que ya es un extra de la OT: repetido', () => {
    const r = validarAgregados(corte([{ i: null, tipo: 'tanque', num: '214', lote: '25315' }],
      { destinos_extra: [{ tipo: 'tanque', num: '214', litros: null, lote: '25330', nuevo: true, mov_id: 'ot-c-xc-0' }] }), ctxC);
    expect(r.error).toBe('El T 214 está dos veces.');
  });
  it('los extras que ya tenia la OT (con su hijo ya creado) no empiezan a fallar', () => {
    const o = corte([{ i: null, tipo: 'tanque', num: '215', lote: '25315' }],
      { destinos_extra: [{ tipo: 'tanque', num: '214', litros: null, lote: '25330', nuevo: true, mov_id: 'ot-c-xc-0' }] });
    expect(validarAgregados(o, ctxC)).toEqual({ ok: true });
  });
  it('lote nuevo con numero ocupado: validarNumeroLote', () => {
    expect(validarAgregados(corte([{ i: null, tipo: 'tanque', num: '215', lote: '25330' }]), ctxC).error).toBe('El lote 25330 ya existe.');
  });
  it('una sola fila de barricas/T50 por lugar', () => {
    const o = corte([{ i: null, tipo: 'chicas', barricas: 1, t50: 0, lote: '25315' }, { i: null, tipo: 'chicas', barricas: 0, t50: 1, lote: '25315' }]);
    expect(validarAgregados(o, ctxC).error).toBe('Las barricas y T50 extra van todas en una sola fila.');
  });
  const simple = ag => otConAgregados({ id: 'ot-9', ot: '0990', destino: 'T 212', lote_corte: null,
    lotes: [{ lote: '26217', mov_id: 'ot-9-0' }, { lote: '26105', mov_id: 'ot-9-1' }] }, ag);
  const ctxS = { lotes: LOTES, destinos: { 0: 'T 212', 1: 'T 213' }, tanquesOT: ['T 212', 'T 213'] };
  it('trasiego simple: el mismo lote de origen se acepta', () => {
    expect(validarAgregados(simple([{ i: 0, tipo: 'chicas', barricas: 2, t50: 0, lote: '26217' }]), ctxS)).toEqual({ ok: true });
  });
  it('trasiego simple: un tanque que es el destino de OTRO lote tampoco', () => {
    expect(validarAgregados(simple([{ i: 0, tipo: 'tanque', num: '213', lote: '26217' }]), ctxS).error).toBe('El T 213 ya es el destino de la OT.');
  });
  it('trasiego simple: el mismo tanque agregado en dos lotes', () => {
    const o = simple([{ i: 0, tipo: 'tanque', num: '214', lote: '26217' }, { i: 1, tipo: 'tanque', num: '214', lote: '26105' }]);
    expect(validarAgregados(o, ctxS).error).toBe('El T 214 está en dos lotes.');
  });
});
