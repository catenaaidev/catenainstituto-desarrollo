import { describe, it, expect } from 'vitest';
import { guiaVacia, refDe, textoDeOrden, unirGuia, vistaGuia, aplicar, podarHechas, fotoImpresa } from '../public/ordenes/js/guia.js';

const O = (x) => ({ modulo: 'lotes', id: 'ot-1', fuente: 'ordenes_trabajo', tipo: 'traslado', numero: '0957',
  fecha: '2026-11-03', estado: 'pendiente', lotes: ['26329'], lote_corte: '', emitio: 'Ana', ...x });
const T = (id, texto = id) => ({ id, tipo: 'tarea', texto });
const G = (renglones, extra) => ({ ...guiaVacia(), renglones, ...extra });
const ids = (g) => g.renglones.map((r) => r.id);

describe('refDe / textoDeOrden', () => {
  it('ref = módulo:id', () => expect(refDe(O())).toBe('lotes:ot-1'));
  it('texto con tipo, N° y lotes', () => expect(textoDeOrden(O())).toBe('Traslado · N° 0957 · 26329'));
  it('corte: el lote que se forma', () =>
    expect(textoDeOrden(O({ lote_corte: '26400', lotes: ['1', '2'] }))).toBe('Traslado · N° 0957 · 26400 (corte de 2 lotes)'));
  it('más de 6 lotes: +n', () =>
    expect(textoDeOrden(O({ lotes: ['1','2','3','4','5','6','7','8'] }))).toBe('Traslado · N° 0957 · 1, 2, 3, 4, 5, 6 +2'));
});

describe('unirGuia', () => {
  it('una orden pendiente nueva entra al final', () => {
    const g = unirGuia(G([T('a')]), [O()]);
    expect(g.renglones).toEqual([T('a'), { id: 'o_lotes:ot-1', tipo: 'orden', ref: 'lotes:ot-1' }]);
  });
  it('varias nuevas: por fecha y N°', () => {
    const g = unirGuia(G([]), [O({ id: 'b', fecha: '2026-11-04' }), O({ id: 'a', fecha: '2026-11-01' })]);
    expect(ids(g)).toEqual(['o_lotes:a', 'o_lotes:b']);
  });
  it('una orden que ya tiene lugar no se duplica ni se mueve', () => {
    const g0 = G([{ id: 'x', tipo: 'orden', ref: 'lotes:ot-1' }, T('a')]);
    expect(ids(unirGuia(g0, [O()]))).toEqual(['x', 'a']);
  });
  it('una orden que ya no está pendiente desaparece', () => {
    const g0 = G([{ id: 'x', tipo: 'orden', ref: 'lotes:ot-1' }, T('a')]);
    expect(ids(unirGuia(g0, [O({ estado: 'ejecutada' })]))).toEqual(['a']);
    expect(ids(unirGuia(g0, []))).toEqual(['a']);
  });
  it('una oculta sigue oculta (no vuelve a entrar como nueva)', () => {
    const g0 = G([{ id: 'x', tipo: 'orden', ref: 'lotes:ot-1', oculta: true }]);
    expect(unirGuia(g0, [O()]).renglones).toEqual(g0.renglones);
  });
  it('no muta la guía que recibe', () => {
    const g0 = G([T('a')]);
    unirGuia(g0, [O()]);
    expect(g0.renglones).toEqual([T('a')]);
  });

  describe('modulosVisibles: no borra órdenes de un módulo que este cliente no ve', () => {
    it('una orden de prensas sobrevive para un cliente que solo ve lotes (sin "ordenes" de prensas)', () => {
      const g0 = G([{ id: 'x', tipo: 'orden', ref: 'prensas:p-1' }, T('a')]);
      // `ordenes` no trae nada de prensas (el cliente no tiene rol ahí): sin
      // modulosVisibles se borraría como si ya no estuviera pendiente.
      expect(ids(unirGuia(g0, [], ['lotes']))).toEqual(['x', 'a']);
    });
    it('sin modulosVisibles sigue siendo compatible con el comportamiento viejo (se borra)', () => {
      const g0 = G([{ id: 'x', tipo: 'orden', ref: 'prensas:p-1' }, T('a')]);
      expect(ids(unirGuia(g0, []))).toEqual(['a']);
    });
    it('una orden del módulo visible que ya no está pendiente sigue desapareciendo', () => {
      const g0 = G([{ id: 'x', tipo: 'orden', ref: 'lotes:ot-1' }, T('a')]);
      expect(ids(unirGuia(g0, [], ['lotes']))).toEqual(['a']);
    });
  });
});

describe('vistaGuia', () => {
  it('visibles en orden con su orden; ocultas aparte', () => {
    const g = G([T('a'), { id: 'x', tipo: 'orden', ref: 'lotes:ot-1' }, { id: 'y', tipo: 'orden', ref: 'lotes:ot-2', oculta: true }]);
    const v = vistaGuia(g, [O(), O({ id: 'ot-2' })]);
    expect(v.visibles.map((r) => r.id)).toEqual(['a', 'x']);
    expect(v.visibles[1].orden.id).toBe('ot-1');
    expect(v.ocultas.map((r) => r.id)).toEqual(['y']);
  });
});

describe('aplicar', () => {
  it('agregar: al final, tarea por defecto', () => {
    expect(aplicar(G([T('a')]), { op: 'agregar', id: 'b' }).renglones).toEqual([T('a'), { id: 'b', tipo: 'tarea', texto: '' }]);
  });
  it('agregar con un id que ya existe: no hace nada (re-aplicar tras 409)', () => {
    const g = G([T('a')]);
    expect(aplicar(g, { op: 'agregar', id: 'a' })).toEqual(g);
  });
  it('texto y tipo', () => {
    let g = aplicar(G([T('a')]), { op: 'texto', id: 'a', texto: 'Lavar' });
    expect(g.renglones[0].texto).toBe('Lavar');
    g = aplicar(g, { op: 'tipo', id: 'a' });
    expect(g.renglones[0].tipo).toBe('nota');
    expect(aplicar(g, { op: 'tipo', id: 'a' }).renglones[0].tipo).toBe('tarea');
  });
  it('tipo no cambia una orden', () => {
    const g = G([{ id: 'x', tipo: 'orden', ref: 'r' }]);
    expect(aplicar(g, { op: 'tipo', id: 'x' })).toEqual(g);
  });
  it('mover salta las ocultas', () => {
    const g = G([T('a'), { id: 'h', tipo: 'orden', ref: 'r', oculta: true }, T('b')]);
    expect(ids(aplicar(g, { op: 'mover', id: 'b', delta: -1 }))).toEqual(['b', 'a', 'h']);
    expect(ids(aplicar(g, { op: 'mover', id: 'a', delta: 1 }))).toEqual(['h', 'b', 'a']);
    expect(aplicar(g, { op: 'mover', id: 'a', delta: -1 })).toEqual(g);
  });
  it('mover salta una orden de un módulo que este cliente no ve (como si estuviera oculta)', () => {
    const g = G([T('a'), { id: 'p', tipo: 'orden', ref: 'prensas:p-1' }, T('b')]);
    expect(ids(aplicar(g, { op: 'mover', id: 'b', delta: -1 }, ['lotes']))).toEqual(['b', 'a', 'p']);
    expect(ids(aplicar(g, { op: 'mover', id: 'a', delta: 1 }, ['lotes']))).toEqual(['p', 'b', 'a']);
  });
  it('texto y firma se recortan a un máximo (el op se re-aplica igual sin crecer sin límite)', () => {
    const g = aplicar(G([T('a')]), { op: 'texto', id: 'a', texto: 'x'.repeat(600) });
    expect(g.renglones[0].texto.length).toBe(500);
    const f = aplicar(G([]), { op: 'firma', campo: 'emitio', valor: 'y'.repeat(200) });
    expect(f.emitio.length).toBe(120);
  });
  it('quitar: borra una tarea, oculta una orden', () => {
    const g = G([T('a'), { id: 'x', tipo: 'orden', ref: 'r' }]);
    expect(ids(aplicar(g, { op: 'quitar', id: 'a' }))).toEqual(['x']);
    expect(aplicar(g, { op: 'quitar', id: 'x' }).renglones[1]).toEqual({ id: 'x', tipo: 'orden', ref: 'r', oculta: true });
    expect(aplicar(aplicar(g, { op: 'quitar', id: 'x' }), { op: 'mostrar', id: 'x' }).renglones[1].oculta).toBe(false);
  });
  it('hecha → deshacer vuelve al mismo lugar', () => {
    const g = G([T('a'), T('b'), T('c')]);
    const h = aplicar(g, { op: 'hecha', id: 'b', ahora: '2026-11-04T10:00:00Z', por: 'ana@x' });
    expect(ids(h)).toEqual(['a', 'c']);
    expect(h.hechas).toEqual([{ id: 'b', tipo: 'tarea', texto: 'b', hecha: '2026-11-04T10:00:00Z', por: 'ana@x', lugar: 1 }]);
    const d = aplicar(h, { op: 'deshacer', id: 'b' });
    expect(ids(d)).toEqual(['a', 'b', 'c']);
    expect(d.hechas).toEqual([]);
  });
  it('hecha solo para tareas', () => {
    const g = G([{ id: 'n', tipo: 'nota', texto: 'x' }]);
    expect(aplicar(g, { op: 'hecha', id: 'n', ahora: 'z', por: 'p' })).toEqual(g);
  });
  it('firma', () => {
    expect(aplicar(G([]), { op: 'firma', campo: 'emitio', valor: 'Oriana' }).emitio).toBe('Oriana');
    expect(aplicar(G([]), { op: 'firma', campo: 'otro', valor: 'x' })).toEqual(G([]));
  });
  it('id inexistente u op desconocida: igual', () => {
    const g = G([T('a')]);
    expect(aplicar(g, { op: 'texto', id: 'zz', texto: 'x' })).toEqual(g);
    expect(aplicar(g, { op: 'raro' })).toEqual(g);
  });
});

describe('podarHechas', () => {
  it('saca las de más de 7 días', () => {
    const g = G([], { hechas: [
      { id: 'v', tipo: 'tarea', texto: '', hecha: '2026-10-27T09:00:00.000Z', por: '', lugar: 0 },
      { id: 'n', tipo: 'tarea', texto: '', hecha: '2026-10-29T09:00:00.000Z', por: '', lugar: 0 },
    ] });
    expect(podarHechas(g, '2026-11-04T10:00:00.000Z').hechas.map((h) => h.id)).toEqual(['n']);
  });
});

describe('fotoImpresa', () => {
  it('numera tareas y órdenes visibles, la nota va con 0, las órdenes como texto', () => {
    const g = G([T('a', 'Lavar'), { id: 'n', tipo: 'nota', texto: 'ojo' }, { id: 'o', tipo: 'orden', ref: 'lotes:ot-1' },
      { id: 'h', tipo: 'orden', ref: 'lotes:ot-2', oculta: true }], { emitio: 'Ori', recibio: 'Enzo' });
    const f = fotoImpresa(g, [O(), O({ id: 'ot-2', numero: '0960' })]);
    expect(f).toEqual({ emitio: 'Ori', recibio: 'Enzo', renglones: [
      { n: 1, tipo: 'tarea', texto: 'Lavar' },
      { n: 0, tipo: 'nota', texto: 'ojo' },
      { n: 2, tipo: 'orden', texto: 'Traslado · N° 0957 · 26329' },
    ] });
  });
  it('corta textos largos a 500', () => {
    expect(fotoImpresa(G([T('a', 'x'.repeat(900))]), []).renglones[0].texto).toHaveLength(500);
  });
});
