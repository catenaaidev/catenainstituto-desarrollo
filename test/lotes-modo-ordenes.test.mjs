// test/lotes-modo-ordenes.test.mjs
import { describe, it, expect } from 'vitest';
import { leerModoOrden, destinoDeModo, urlVolver, tituloModo } from '../public/lotes/js/modo-ordenes.js';

const D = {
  ordenes_trabajo: [{ id: 'ot-1', ot: '0945', plantilla: 'traslado', estado: 'pendiente' }],
  ordenes_correccion: [{ id: 'oc-1', numero: 'B240', estado: 'ejecutada' }],
  ordenes_hojas: [{ id: 'oh-1', tipo: 'agregados', ot: 'B250', estado: 'pendiente' }],
};

describe('leerModoOrden', () => {
  it('sin ?orden no hay modo', () => expect(leerModoOrden('')).toBeNull());
  it('nueva:<tipo>', () => expect(leerModoOrden('?orden=nueva%3Atraslado')).toEqual({ nueva: 'traslado' }));
  it('un id', () => expect(leerModoOrden('?orden=ot-1&volver=%2Fordenes%2F')).toEqual({ id: 'ot-1' }));
});

describe('destinoDeModo', () => {
  it('nueva plantilla → emitir', () => expect(destinoDeModo({ nueva: 'traslado' }, D)).toEqual({ accion: 'emitir', plantilla: 'traslado' }));
  it('nueva corrección', () => expect(destinoDeModo({ nueva: 'correccion' }, D)).toEqual({ accion: 'correccion' }));
  it('tipo que no existe', () => expect(destinoDeModo({ nueva: 'raro' }, D)).toEqual({ accion: 'tipo-desconocido' }));
  it('id de OT', () => expect(destinoDeModo({ id: 'ot-1' }, D)).toEqual({ accion: 'ver-ot', id: 'ot-1' }));
  it('id de corrección', () => expect(destinoDeModo({ id: 'oc-1' }, D)).toEqual({ accion: 'ver-oc', id: 'oc-1' }));
  it('id inexistente', () => expect(destinoDeModo({ id: 'nada' }, D)).toEqual({ accion: 'no-existe' }));
});

describe('urlVolver', () => {
  it('respeta una vuelta a /ordenes/', () => expect(urlVolver('?volver=%2Fordenes%2F%3Fv%3Dpendientes')).toBe('/ordenes/?v=pendientes'));
  it('no sigue una vuelta a otro lado', () => {
    expect(urlVolver('?volver=https%3A%2F%2Fmalo.com')).toBe('/ordenes/');
    expect(urlVolver('?volver=%2F%2Fmalo.com')).toBe('/ordenes/');
    expect(urlVolver('')).toBe('/ordenes/');
  });
});

describe('tituloModo', () => {
  it('arma el título de la banda', () => {
    expect(tituloModo({ accion: 'emitir', plantilla: 'traslado' }, D)).toBe('Nueva · Traslado');
    expect(tituloModo({ accion: 'correccion' }, D)).toBe('Nueva · Corrección SO₂');
    expect(tituloModo({ accion: 'ver-ot', id: 'ot-1' }, D)).toBe('OT 0945 · Traslado · pendiente');
    expect(tituloModo({ accion: 'ver-oc', id: 'oc-1' }, D)).toBe('B240 · Corrección SO₂ · ejecutada');
  });
  it('sin número, sin estado o sin la orden: guiones, nunca «undefined»', () => {
    const S = {
      ordenes_trabajo: [{ id: 'ot-2', plantilla: 'traslado', estado: 'pendiente' }],
      ordenes_correccion: [{ id: 'oc-2' }],
    };
    expect(tituloModo({ accion: 'ver-ot', id: 'ot-2' }, S)).toBe('OT — · Traslado · pendiente');
    expect(tituloModo({ accion: 'ver-oc', id: 'oc-2' }, S)).toBe('— · Corrección SO₂ · —');
    expect(tituloModo({ accion: 'ver-ot', id: 'nada' }, S)).toBe('Orden no encontrada');
    expect(tituloModo({ accion: 'ver-oc', id: 'nada' }, {})).toBe('Orden no encontrada');
  });
  it('nueva orden de papel', () => {
    expect(destinoDeModo({ nueva: 'muestras' }, D)).toEqual({ accion: 'hoja-nueva', tipo: 'muestras' });
    expect(tituloModo({ accion: 'hoja-nueva', tipo: 'micro' }, D)).toBe('Nueva · Orden de microbiología');
  });
  it('una orden de papel guardada', () => {
    expect(destinoDeModo({ id: 'oh-1' }, D)).toEqual({ accion: 'ver-hoja', id: 'oh-1', tipo: 'agregados' });
    expect(tituloModo({ accion: 'ver-hoja', id: 'oh-1' }, D)).toBe('B250 · Otros agregados · pendiente');
    expect(tituloModo({ accion: 'ver-hoja', id: 'nada' }, D)).toBe('Orden no encontrada');
  });
  it('una orden de papel con un tipo desconocido no revienta', () => {
    const X = { ordenes_hojas: [{ id: 'oh-x', tipo: 'rotulos', ot: '0960', estado: 'pendiente' },
                                { id: 'oh-y', ot: '0961', estado: 'pendiente' }] };
    expect(tituloModo({ accion: 'ver-hoja', id: 'oh-x' }, X)).toBe('0960 · rotulos · pendiente');
    expect(tituloModo({ accion: 'ver-hoja', id: 'oh-y' }, X)).toBe('0961 · — · pendiente');
  });
});
