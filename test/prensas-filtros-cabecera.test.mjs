/**
 * Lógica pura de los filtros en la cabecera de Prensas
 * (public/prensas/filtros-cabecera.js, script clásico colgado de globalThis).
 */
import { describe, it, expect } from 'vitest';
import '../public/prensas/filtros-cabecera.js';

const F = globalThis.PrensasFiltros;

describe('posicionDePanel', () => {
  const v = { ancho: 1000, alto: 800 };
  it('abre abajo del ancla si entra', () => {
    expect(F.posicionDePanel({ left: 100, top: 50, bottom: 70 }, { ancho: 200, alto: 300 }, v))
      .toEqual({ izq: 100, top: 74 });
  });
  it('se vuelca arriba si abajo no entra', () => {
    expect(F.posicionDePanel({ left: 100, top: 700, bottom: 720 }, { ancho: 200, alto: 300 }, v))
      .toEqual({ izq: 100, top: 396 });
  });
  it('no se sale por la derecha', () => {
    expect(F.posicionDePanel({ left: 950, top: 50, bottom: 70 }, { ancho: 200, alto: 100 }, v).izq).toBe(794);
  });
});

describe('pasaRango', () => {
  it('sin rango pasa todo, incluso vacío', () => {
    expect(F.pasaRango('', {}, 'num')).toBe(true);
    expect(F.pasaRango(null, undefined, 'date')).toBe(true);
    expect(F.rangoActivo({ min: '', max: '' })).toBe(false);
    expect(F.rangoActivo({ min: '3' })).toBe(true);
  });
  it('números con coma decimal', () => {
    expect(F.pasaRango('3,9', { min: '3,5', max: '4' }, 'num')).toBe(true);
    expect(F.pasaRango(3.9, { min: '3.5', max: '4' }, 'num')).toBe(true);
    expect(F.pasaRango('4,1', { max: '4' }, 'num')).toBe(false);
    expect(F.pasaRango(null, { min: '1' }, 'num')).toBe(false);
  });
  it('un límite que no es número no filtra', () => {
    expect(F.pasaRango('7', { min: 'abc' }, 'num')).toBe(true);
  });
  it('fechas ISO', () => {
    expect(F.pasaRango('2026-09-15', { min: '2026-09-01', max: '2026-09-30' }, 'date')).toBe(true);
    expect(F.pasaRango('2026-10-01', { max: '2026-09-30' }, 'date')).toBe(false);
    expect(F.pasaRango('', { min: '2026-09-01' }, 'date')).toBe(false);
  });
});
