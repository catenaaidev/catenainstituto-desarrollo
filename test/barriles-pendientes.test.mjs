/**
 * Las dos decisiones que deciden si el trabajo de un operario sobrevive.
 *
 * Va en .mjs y no en .ts a propósito, igual que `barriles-orden-editable.test.mjs`:
 * `tsconfig.json` solo incluye `test/**\/*.ts`, y este archivo importa un .js sin
 * declaraciones de tipos. No lo pases a .ts.
 *
 * El import es por efecto: `pendientes.js` se carga como <script> clásico en la
 * página, así que no exporta nada — se cuelga del objeto global.
 */

import { describe, it, expect } from 'vitest';
import '../public/barriles/js/pendientes.js';

const { decidirSincronizacion, decidirArranque } = globalThis;

describe('decidirSincronizacion', () => {
  it('piso lo local solo si no hay absolutamente nada sin confirmar', () => {
    expect(decidirSincronizacion({ pendienteLocal: false, cambiosBoxes: 0, cambiosPalets: 0 }))
      .toBe('adoptar');
  });

  it('fusiona si hay celdas del mapa sin subir', () => {
    expect(decidirSincronizacion({ pendienteLocal: false, cambiosBoxes: 1, cambiosPalets: 0 }))
      .toBe('fusionar');
  });

  it('fusiona si hay casilleros de palets sin subir', () => {
    expect(decidirSincronizacion({ pendienteLocal: false, cambiosBoxes: 0, cambiosPalets: 1 }))
      .toBe('fusionar');
  });

  // Este es el caso que costó dos órdenes de vaciado el 16/09: el operario cargó
  // con el escáner y no tocó ninguna celda del mapa, así que los dos contadores
  // dan cero. Antes eso se leía como "no hay nada local" y se pisaba.
  it('fusiona si el marcador dice que hay trabajo, aunque el mapa esté intacto', () => {
    expect(decidirSincronizacion({ pendienteLocal: true, cambiosBoxes: 0, cambiosPalets: 0 }))
      .toBe('fusionar');
  });
});

describe('decidirArranque', () => {
  it('sube lo local si quedó trabajo sin confirmar, aunque el servidor traiga estado', () => {
    expect(decidirArranque({ hayLocal: true, pendienteLocal: true, hayFotoBase: false, hayEstadoServidor: true }))
      .toBe('subir-local');
  });

  it('fusiona cuando hay copia local y foto de la última sincronización', () => {
    expect(decidirArranque({ hayLocal: true, pendienteLocal: false, hayFotoBase: true, hayEstadoServidor: true }))
      .toBe('fusionar');
  });

  it('adopta lo del servidor cuando no hay nada local que proteger', () => {
    expect(decidirArranque({ hayLocal: false, pendienteLocal: false, hayFotoBase: false, hayEstadoServidor: true }))
      .toBe('adoptar-servidor');
  });

  it('sube lo local si el servidor está vacío', () => {
    expect(decidirArranque({ hayLocal: true, pendienteLocal: false, hayFotoBase: false, hayEstadoServidor: false }))
      .toBe('subir-local');
  });

  it('arranca vacío si no hay nada en ningún lado', () => {
    expect(decidirArranque({ hayLocal: false, pendienteLocal: false, hayFotoBase: false, hayEstadoServidor: false }))
      .toBe('vacio');
  });

  // El marcador pesa más que la foto base: si no hay foto no se puede diferenciar,
  // pero eso nunca puede terminar en pisar trabajo sin confirmar.
  it('el marcador gana aunque falte la foto base', () => {
    expect(decidirArranque({ hayLocal: true, pendienteLocal: true, hayFotoBase: true, hayEstadoServidor: true }))
      .toBe('subir-local');
  });
});
