/* cm de merma -> litros. Manda la Cap REAL de la vasija: la tabla solo dice
 * cuanto falta para llenarla (spec 2026-10-01, decision D4). */
import { describe, it, expect } from 'vitest';
import { TABLAS_CUBICACION } from '../public/lotes/js/cubicacion-tablas.js';
import { litrosPorCm } from '../public/lotes/js/cubicacion.js';

const T40 = { cap_real: 4200, tabla: 'tanque-40hl' };

describe('TABLAS_CUBICACION', () => {
  it('tiene las 6 tablas, ordenadas y empezando en 0 cm', () => {
    expect(Object.keys(TABLAS_CUBICACION).sort()).toEqual(
      ['esfera-1500', 'huevo-24hl', 'huevo-33hl', 'pileta-30hl', 'tanque-40hl', 'tanque-75hl']);
    for (const t of Object.values(TABLAS_CUBICACION)) {
      expect(t.puntos[0][0]).toBe(0);
      for (let i = 1; i < t.puntos.length; i++) expect(t.puntos[i][0]).toBeGreaterThan(t.puntos[i - 1][0]);
    }
  });
});

describe('litrosPorCm', () => {
  it('cm exacto: la Cap REAL menos lo que falta segun la tabla', () => {
    // tabla 40 HL: 0 cm = 4299, 30 cm = 4174 -> faltan 125
    expect(litrosPorCm(T40, 30)).toEqual({ litros: 4075, faltante: 125, error: null });
  });
  it('0 cm es la Cap REAL, no el lleno de la tabla', () => {
    expect(litrosPorCm(T40, 0).litros).toBe(4200);
  });
  it('interpola entre dos centimetros', () => {
    // 30 cm = 4174, 31 cm = 4159 -> 30,5 cm = 4166,5 -> faltan 132,5
    expect(litrosPorCm(T40, 30.5)).toEqual({ litros: 4067.5, faltante: 132.5, error: null });
  });
  it('acepta el cm como texto con coma', () => {
    expect(litrosPorCm(T40, '30,5').litros).toBe(4067.5);
  });
  it('fuera de rango avisa con el maximo', () => {
    expect(litrosPorCm(T40, 191)).toMatchObject({ litros: null, error: 'fuera-de-rango', max: 190 });
  });
  it('cm vacio, negativo o basura es invalido', () => {
    for (const cm of ['', null, undefined, -1, 'abc']) expect(litrosPorCm(T40, cm).error).toBe('cm-invalido');
  });
  it('vasija sin tabla', () => {
    expect(litrosPorCm({ cap_real: 2000, tabla: null }, 10).error).toBe('sin-tabla');
    expect(litrosPorCm(null, 10).error).toBe('sin-tabla');
  });
  it('nunca da litros negativos', () => {
    // esfera: 142 cm = 0,5 L de 1500 -> faltan 1499,5; con Cap REAL 1400 daria -99,5
    expect(litrosPorCm({ cap_real: 1400, tabla: 'esfera-1500' }, 142).litros).toBe(0);
  });
});
