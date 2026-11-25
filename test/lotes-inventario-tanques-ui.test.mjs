/* Inventario de tanques: etiquetas de avisos y borrador de la recorrida. */
import { describe, it, expect } from 'vitest';
import { avisosHTML, leyendaAvisosHTML, contarCargadas, serializarBorrador, leerBorrador }
  from '../public/lotes/js/inventario-tanques-ui.js';

describe('avisosHTML', () => {
  it('muestra texto corto y deja el largo en title', () => {
    const h = avisosHTML(['excede', 'dos-lotes']);
    expect(h).toContain('>excede cap<');
    expect(h).toContain('>2 lotes<');
    expect(h).toContain('title="Más litros que la Cap REAL"');
  });
  it('saca los que ya se ven en otra columna y los desconocidos', () => {
    expect(avisosHTML(['diferencia', 'raro'], ['diferencia'])).toBe('');
  });
});

describe('leyendaAvisosHTML', () => {
  it('lista solo los avisos presentes, sin repetir', () => {
    const h = leyendaAvisosHTML([{ avisos: ['excede'] }, { avisos: ['excede', 'diferencia'] }, { avisos: [] }], ['diferencia']);
    expect(h.match(/<li>/g)).toHaveLength(1);
    expect(h).toContain('Más litros que la Cap REAL');
  });
  it('vacía si no hay avisos', () => {
    expect(leyendaAvisosHTML([{ avisos: [] }])).toBe('');
  });
});

describe('borrador de recorrida', () => {
  const ent = new Map([['201', { cm: '12' }], ['202', { cm: '' }], ['203', { velo: true }], ['204', { estado_manual: '' }]]);

  it('cuenta las vasijas con algo cargado', () => {
    expect(contarCargadas(ent)).toBe(3);
    expect(contarCargadas(new Map([['1', { cm: '  ' }]]))).toBe(0);
  });
  it('ida y vuelta', () => {
    const b = leerBorrador(serializarBorrador('2026-10-15', ent));
    expect(b.fecha).toBe('2026-10-15');
    expect(b.entradas.get('201')).toEqual({ cm: '12' });
    expect(b.entradas.get('203')).toEqual({ velo: true });
    expect(b.entradas.get('204')).toEqual({ estado_manual: '' });
  });
  it('nada cargado: no hay borrador', () => {
    expect(serializarBorrador('2026-10-15', new Map([['1', { cm: '' }]]))).toBeNull();
    expect(serializarBorrador('2026-10-15', new Map())).toBeNull();
  });
  it('texto roto o con forma rara: null', () => {
    expect(leerBorrador('')).toBeNull();
    expect(leerBorrador('{no es json')).toBeNull();
    expect(leerBorrador('{"fecha":"ayer","entradas":[]}')).toBeNull();
    expect(leerBorrador('{"fecha":"2026-10-15","entradas":[["201",null],["202",{"cm":""}]]}')).toBeNull();
  });
});
