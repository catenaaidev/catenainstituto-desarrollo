/**
 * Lógica pura del aviso y el diálogo propios (public/shared/dialogo-modelo.js).
 * Va en .mjs porque importa un .js clásico que se cuelga de globalThis.
 */
import { describe, it, expect } from 'vitest';
import '../public/shared/dialogo-modelo.js';

const M = globalThis.CIDialogoModelo;

describe('normalizarConfirmar', () => {
  it('acepta solo un texto', () => {
    expect(M.normalizarConfirmar('¿Borrar la OT 0712?')).toEqual({
      titulo: 'Confirmar', texto: '¿Borrar la OT 0712?', si: 'Seguir', no: 'Cancelar', peligro: false });
  });
  it('respeta los textos de los botones', () => {
    const c = M.normalizarConfirmar({ titulo: 'Borrar OT', texto: 'x', si: 'Borrar OT', no: 'Volver', peligro: true });
    expect(c).toEqual({ titulo: 'Borrar OT', texto: 'x', si: 'Borrar OT', no: 'Volver', peligro: true });
  });
  it('nunca deja "Aceptar" ni "OK" en el botón', () => {
    expect(M.normalizarConfirmar({ texto: 'x', si: 'Aceptar' }).si).toBe('Seguir');
    expect(M.normalizarConfirmar({ texto: 'x', si: 'ok' }).si).toBe('Seguir');
  });
});

describe('normalizarPedir', () => {
  it('con opciones arma un select', () => {
    const p = M.normalizarPedir({ titulo: 'Variedad', campo: { opciones: ['Malbec', { valor: 'CF', texto: 'Cabernet Franc' }] } });
    expect(p.campo.tipo).toBe('select');
    expect(p.campo.opciones).toEqual([{ valor: 'Malbec', texto: 'Malbec' }, { valor: 'CF', texto: 'Cabernet Franc' }]);
    expect(p.si).toBe('Guardar');
  });
  it('un número pide teclado decimal', () => {
    const p = M.normalizarPedir({ campo: { tipo: 'number', valor: 12 } });
    expect(p.campo).toMatchObject({ tipo: 'number', valor: '12', inputmode: 'decimal', requerido: true });
  });
  it('defaults de texto', () => {
    const p = M.normalizarPedir({});
    expect(p.campo).toEqual({ tipo: 'text', valor: '', opciones: [], inputmode: '', requerido: true, placeholder: '' });
    expect(p.titulo).toBe('Completar');
  });
});

describe('validarPedido', () => {
  const texto = M.normalizarPedir({}).campo;
  const num = M.normalizarPedir({ campo: { tipo: 'number' } }).campo;
  const sel = M.normalizarPedir({ campo: { opciones: ['Malbec'] } }).campo;
  it('vacío y requerido', () => {
    expect(M.validarPedido(texto, '   ')).toEqual({ ok: false, valor: '', error: 'Completá este dato.' });
  });
  it('vacío pero opcional', () => {
    expect(M.validarPedido({ ...texto, requerido: false }, '')).toEqual({ ok: true, valor: '', error: '' });
  });
  it('número con coma', () => {
    expect(M.validarPedido(num, ' 12,5 ')).toEqual({ ok: true, valor: '12.5', error: '' });
    expect(M.validarPedido(num, 'doce').error).toBe('Tiene que ser un número.');
  });
  it('select fuera de la lista', () => {
    expect(M.validarPedido(sel, 'Syrah').error).toBe('Elegí una de la lista.');
    expect(M.validarPedido(sel, 'Malbec').ok).toBe(true);
  });
});

describe('normalizarInformar', () => {
  it('acepta solo un texto', () => {
    expect(M.normalizarInformar('La OT no se guardó.')).toEqual({ titulo: 'Aviso', texto: 'La OT no se guardó.', si: 'Entendido' });
  });
  it('respeta el título y el botón, menos Aceptar/OK', () => {
    expect(M.normalizarInformar({ titulo: 'No se guardó', texto: 'x', si: 'Volver' })).toEqual({ titulo: 'No se guardó', texto: 'x', si: 'Volver' });
    expect(M.normalizarInformar({ texto: 'x', si: 'OK' }).si).toBe('Entendido');
  });
});

describe('duracionAviso', () => {
  it('según el tipo y si tiene deshacer', () => {
    expect(M.duracionAviso({})).toBe(4000);
    expect(M.duracionAviso({ tipo: 'mal' })).toBe(5000);
    expect(M.duracionAviso({ deshacer() {} })).toBe(8000);
    expect(M.duracionAviso({ ms: 1500 })).toBe(1500);
  });
});
