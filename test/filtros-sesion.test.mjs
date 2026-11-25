/** Filtros en la sesión de la pestaña (shared/filtros-sesion.js). Va en .mjs:
 *  importa un .js clásico sin tipos. */
import { describe, it, expect, beforeEach } from 'vitest';
import '../public/shared/filtros-sesion.js';
const F = globalThis.CIWFiltros;

function storageDeMentira(){
  const m = new Map();
  return { getItem:k => m.has(k) ? m.get(k) : null, setItem:(k,v) => m.set(k, String(v)),
    removeItem:k => m.delete(k), key:i => [...m.keys()][i] ?? null, get length(){ return m.size; }, m };
}
const tick = () => new Promise(r => queueMicrotask(r));
let st;
beforeEach(() => { st = storageDeMentira(); F._usarStorage(st); });

describe('CIWFiltros', () => {
  it('leer/guardar ida y vuelta, con prefijo propio', () => {
    expect(F.leer('lotes:analisis:mes', '')).toBe('');
    F.guardar('lotes:analisis:mes', '2026-10');
    expect(F.leer('lotes:analisis:mes', '')).toBe('2026-10');
    expect(st.m.has('ciw_filtros:lotes:analisis:mes')).toBe(true);
  });
  it('borrar por prefijo no toca otras pantallas', () => {
    F.guardar('lotes:analisis:mes', 'x'); F.guardar('lotes:analisis:busca', 'y'); F.guardar('lotes:lotes:busca', 'z');
    F.borrar('lotes:analisis:');
    expect(F.leer('lotes:analisis:mes', null)).toBe(null);
    expect(F.leer('lotes:lotes:busca', null)).toBe('z');
  });
  it('el Set se guarda solo y se restaura', async () => {
    const s = F.set('lotes:lotes:f:variedad');
    s.add('Malbec'); s.add('Pinot Noir'); s.delete('Pinot Noir');
    await tick();
    const otro = F.set('lotes:lotes:f:variedad');
    expect([...otro]).toEqual(['Malbec']);
    otro.clear(); await tick();
    expect([...F.set('lotes:lotes:f:variedad')]).toEqual([]);
  });
  it('podar descarta valores fantasma solo la primera vez', async () => {
    F.guardar('k', ['a', 'b']);
    const s = F.set('k');
    s.podar(new Set(['a']));
    expect([...s]).toEqual(['a']);
    s.add('zz'); s.podar(new Set(['a']));   // ya no poda: lo eligió el usuario ahora
    expect([...s]).toEqual(['a', 'zz']);
    await tick();
    expect(F.leer('k')).toEqual(['a', 'zz']);
  });
  it('sin storage (o roto) no se rompe nada', () => {
    F._usarStorage({ getItem(){ throw new Error('x'); }, setItem(){ throw new Error('x'); }, removeItem(){}, key(){ return null; }, length:0 });
    expect(F.leer('a', 7)).toBe(7);
    expect(() => F.guardar('a', 1)).not.toThrow();
    const s = F.set('a'); s.add(1); expect(s.has(1)).toBe(true);
    F._usarStorage(null);
    expect(F.leer('a', 'd')).toBe('d');
  });
  it('JSON corrupto cuenta como no guardado', () => {
    st.setItem('ciw_filtros:a', '{no es json');
    expect(F.leer('a', 'def')).toBe('def');
  });
});
