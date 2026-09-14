import { describe, it, expect } from 'vitest';
import { so2LibreDe, valorValido, fechaDia } from '../src/lotes/motores/fml-condiciones';

describe('helpers de condiciones', () => {
  it('el SO2 en 0 es un placeholder, no una medicion', () => {
    expect(so2LibreDe({ so2_libre: 0 })).toBe(null);
    expect(so2LibreDe({ so2_libre: 18 })).toBe(18);
  });

  it('prefiere so2_libre_actual y sabe mirar dentro de correccion', () => {
    expect(so2LibreDe({ so2_libre_actual: 31, so2_libre: 12 })).toBe(31);
    expect(so2LibreDe({ correccion: { so2_libre: 27 } })).toBe(27);
  });

  it('el -999 no es un valor', () => {
    expect(valorValido(-999)).toBe(null);
    expect(valorValido(0.62)).toBe(0.62);
  });

  it('la fecha se lee como dia UTC', () => {
    expect(fechaDia('2026-08-24T13:45:00')).toBe(Date.parse('2026-08-24T00:00:00Z'));
    expect(fechaDia('no es fecha')).toBe(null);
  });
});
