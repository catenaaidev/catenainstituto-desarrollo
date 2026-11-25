/* Tests de ot-borrador.js: la OT a medio armar que sobrevive a una recarga. */
import { describe, it, expect } from 'vitest';
import { fotoLotes, lotesDeFoto, leerBorrador, resumenBorrador, CLAVE_BORRADOR } from '../public/lotes/js/ot-borrador.js';

const lote = { lote: '26210', barriles: [{ num: 'a' }, { num: 'b' }], tildados: new Set(['a']), tanques: [], otras: [] };

describe('fotoLotes / lotesDeFoto', () => {
  it('los Set de barriles tildados van y vuelven', () => {
    const foto = JSON.parse(JSON.stringify(fotoLotes([lote])));
    expect(foto[0].tildados).toEqual(['a']);
    const vuelta = lotesDeFoto(foto);
    expect(vuelta[0].tildados).toBeInstanceOf(Set);
    expect([...vuelta[0].tildados]).toEqual(['a']);
    expect(vuelta[0].tanques).toEqual([]);
  });
  it('una foto rota no rompe', () => { expect(lotesDeFoto(null)).toEqual([]); });
});

describe('leerBorrador', () => {
  const mem = v => ({ getItem: k => (k === CLAVE_BORRADOR ? v : null) });
  const ahora = Date.parse('2026-10-26T12:00:00');
  it('devuelve el borrador reciente', () => {
    const b = { tipo: 'emitir', ts: ahora - 3600e3, cab: { numero: '0951' }, lotes: [] };
    expect(leerBorrador(mem(JSON.stringify(b)), ahora)).toMatchObject({ tipo: 'emitir' });
  });
  it('mas de 7 dias, roto o sin storage: null', () => {
    expect(leerBorrador(mem(JSON.stringify({ tipo: 'emitir', ts: ahora - 8 * 864e5 })), ahora)).toBeNull();
    expect(leerBorrador(mem('{roto'), ahora)).toBeNull();
    expect(leerBorrador({ getItem(){ throw new Error('x'); } }, ahora)).toBeNull();
    expect(leerBorrador(null, ahora)).toBeNull();
  });
});

it('resumenBorrador dice numero y lotes', () => {
  expect(resumenBorrador({ tipo: 'corte', cab: { numero: '0951' }, lotes: [{ lote: '26210' }, { lote: '26211' }] }))
    .toBe('Corte · N° 0951 · lotes 26210, 26211');
  expect(resumenBorrador({ tipo: 'emitir', cab: {}, lotes: [] })).toBe('OT sin número · sin lotes');
});
