import { describe, it, expect } from 'vitest';
import { leerModoOrden, destinoPrensas, tituloModoPrensas, urlVolver } from '../public/prensas/js/modo-ordenes-prensas.js';

const datos = { ordenes_hojas: [{ id: 'oh-1', tipo: 'prensas-rellenos', ot: '0951', estado: 'pendiente' },
                                { id: 'oh-2', tipo: 'raro', ot: '', estado: 'ejecutada' }] };
describe('modo órdenes de Prensas', () => {
  it('destino', () => {
    expect(destinoPrensas(leerModoOrden('?orden=nueva:prensas-accion'), datos)).toEqual({ accion: 'hoja-nueva', tipo: 'prensas-accion' });
    expect(destinoPrensas(leerModoOrden('?orden=nueva:muestras'), datos)).toEqual({ accion: 'tipo-desconocido' });
    expect(destinoPrensas(leerModoOrden('?orden=oh-1'), datos)).toEqual({ accion: 'ver-hoja', id: 'oh-1', tipo: 'prensas-rellenos' });
    expect(destinoPrensas(leerModoOrden('?orden=nada'), datos)).toEqual({ accion: 'no-existe' });
  });
  it('título', () => {
    expect(tituloModoPrensas({ accion: 'hoja-nueva', tipo: 'prensas-muestras' }, datos)).toBe('Nueva · Orden de muestras');
    expect(tituloModoPrensas({ accion: 'ver-hoja', id: 'oh-1' }, datos)).toBe('0951 · Rellenos · pendiente');
    expect(tituloModoPrensas({ accion: 'ver-hoja', id: 'oh-2' }, datos)).toBe('— · raro · ejecutada');
    expect(tituloModoPrensas({ accion: 'ver-hoja', id: 'x' }, datos)).toBe('Orden no encontrada');
  });
  it('volver solo a /ordenes/', () => {
    expect(urlVolver('?volver=%2Fordenes%2F%3Fv%3Dpendientes')).toBe('/ordenes/?v=pendientes');
    expect(urlVolver('?volver=https%3A%2F%2Fmalo')).toBe('/ordenes/');
  });
});
