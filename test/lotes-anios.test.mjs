/* Tests de anios.js: la regla del año del selector de años. Modulo puro, se
 * importa tal cual en el runtime de Workers como lote-nuevo.js. */
import { describe, it, expect } from 'vitest';
import { anioDeLote, aniosDisponibles, seleccionInicial, alternarAnio,
         loteVisible, otVisible, claveAnios } from '../public/lotes/js/anios.js';
import { anioDeLote as anioServidor } from '../src/lotes/motores/anios';

describe('anioDeLote', () => {
  const casos = [25137, '26001', ' 26217 ', '', null, undefined, '2621', '262170', '26217A', 'T50', 26.5];
  it('da lo mismo que el motor del servidor', () => {
    for (const c of casos) expect(anioDeLote(c)).toBe(anioServidor(c));
  });
  it('25137 es 2025', () => expect(anioDeLote(25137)).toBe(2025));
});

describe('aniosDisponibles', () => {
  it('los años presentes, sin repetir y ordenados', () => {
    expect(aniosDisponibles([{ lote: 26001 }, { lote: '25004' }, { lote: 26002 }, { lote: 'X' }]))
      .toEqual([2025, 2026]);
  });
});

describe('seleccionInicial', () => {
  it('sin nada guardado arranca con el año más nuevo', () => {
    expect(seleccionInicial(null, [2025, 2026])).toEqual([2026]);
    expect(seleccionInicial('basura', [2025, 2026])).toEqual([2026]);
  });
  it('respeta lo guardado que sigue existiendo', () => {
    expect(seleccionInicial([2025, 2026], [2025, 2026])).toEqual([2025, 2026]);
    expect(seleccionInicial([2024, 2025], [2025, 2026])).toEqual([2025]);
  });
  it('si lo guardado ya no existe, vuelve al defecto', () => {
    expect(seleccionInicial([2023], [2025, 2026])).toEqual([2026]);
  });
  it('sin años disponibles, vacío', () => expect(seleccionInicial(null, [])).toEqual([]));
});

describe('alternarAnio', () => {
  it('prende y apaga', () => {
    expect(alternarAnio([2026], 2025)).toEqual([2025, 2026]);
    expect(alternarAnio([2025, 2026], 2025)).toEqual([2026]);
  });
  it('no deja apagar el último', () => expect(alternarAnio([2026], 2026)).toEqual([2026]));
});

describe('loteVisible / otVisible', () => {
  it('filtra por año y deja pasar los sin año', () => {
    expect(loteVisible('25001', [2026])).toBe(false);
    expect(loteVisible(26001, [2026])).toBe(true);
    expect(loteVisible('T50', [2026])).toBe(true);
    expect(loteVisible('25001', null)).toBe(true);
    expect(loteVisible('25001', [])).toBe(true);
  });
  it('una OT mixta se ve si alguno de sus lotes se ve', () => {
    const ot = { lotes: [{ lote: '25001' }, { lote: '26001' }] };
    expect(otVisible(ot, [2025])).toBe(true);
    expect(otVisible(ot, [2026])).toBe(true);
    expect(otVisible({ lotes: [{ lote: '25001' }] }, [2026])).toBe(false);
    expect(otVisible({ lotes: [{ lote: '25001' }], lote_corte: { lote: '26315' } }, [2026])).toBe(true);
    expect(otVisible({ lotes: [] }, [2026])).toBe(true);
  });
});

describe('claveAnios', () => {
  it('ordenada y separada por comas', () => {
    expect(claveAnios([2026, 2025])).toBe('2025,2026');
    expect(claveAnios(null)).toBe('');
  });
});
