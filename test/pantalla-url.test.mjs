/** La pantalla en la URL (#analisis, #registro…): sobrevive al F5 y el botón
 *  Atrás vuelve a la anterior. Va en .mjs: importa un .js clásico sin tipos. */
import { describe, it, expect } from 'vitest';
import '../public/shared/pantalla-url.js';

const { pantallaDeHash, hashDePantalla } = globalThis.CIWPantalla;
const VALIDAS = ['dashboard', 'analisis', 'ordencorr'];

describe('pantalla en la URL', () => {
  it('ida y vuelta', () => {
    expect(hashDePantalla('analisis')).toBe('#analisis');
    expect(pantallaDeHash('#analisis', VALIDAS)).toBe('analisis');
    expect(pantallaDeHash(hashDePantalla('ordencorr'), new Set(VALIDAS))).toBe('ordencorr');
  });
  it('lo que no es una pantalla conocida da null', () => {
    expect(pantallaDeHash('', VALIDAS)).toBe(null);
    expect(pantallaDeHash('#', VALIDAS)).toBe(null);
    expect(pantallaDeHash('#inexistente', VALIDAS)).toBe(null);
    expect(pantallaDeHash('#ficha/26217', VALIDAS)).toBe(null);
    expect(pantallaDeHash('#%E0%A4%A', VALIDAS)).toBe(null);   // mal codificado
    expect(pantallaDeHash(undefined, VALIDAS)).toBe(null);
  });
  it('no confunde propiedades heredadas con pantallas', () => {
    expect(pantallaDeHash('#constructor', VALIDAS)).toBe(null);
    expect(pantallaDeHash('#toString', new Set(VALIDAS))).toBe(null);
  });
  it('oculta lo activo al arrancar solo si la URL trae una pantalla', () => {
    const { ocultaAlArrancar } = globalThis.CIWPantalla;
    expect(ocultaAlArrancar('')).toBe(false);
    expect(ocultaAlArrancar('#')).toBe(false);
    expect(ocultaAlArrancar('#analisis')).toBe(true);
    expect(ocultaAlArrancar('#ficha/26217')).toBe(true);
  });
});
