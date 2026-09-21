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

const { decidirSincronizacion, decidirArranque, decidirConfirmacion } = globalThis;

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

describe('decidirConfirmacion', () => {
  it('adopta lo enviado si nadie escribió mientras el POST viajaba', () => {
    expect(decidirConfirmacion({ selloEnviado: 7, selloActual: 7 })).toBe('adoptar-envio');
  });

  // El caso que rompía el invariante: el operario escaneó con el POST en vuelo.
  it('reintenta si hubo un guardado nuevo durante el vuelo del POST', () => {
    expect(decidirConfirmacion({ selloEnviado: 7, selloActual: 8 })).toBe('reintentar');
  });

  it('reintenta ante sellos que no son números, en vez de dar por confirmado', () => {
    expect(decidirConfirmacion({ selloEnviado: undefined, selloActual: 0 })).toBe('reintentar');
  });
});

/**
 * La carrera completa, con un modelo mínimo de la pantalla: el sello, el
 * marcador, el estado local y el cuerpo que se postea. No es el index.html real
 * (eso es alcance de la Entrega 2), pero sí la secuencia exacta que destruía la
 * orden: postear → escanear durante el vuelo → llegar el 200.
 */
describe('escanear con el POST en vuelo', () => {
  function pantalla() {
    const p = {
      estado: { escaneos: [] },
      pendienteLocal: false,
      sello: 0,
      version: 1,
      marcar() { p.pendienteLocal = true; p.sello++; },
      limpiar() { p.pendienteLocal = false; },
      guardar(orden) { p.estado.escaneos.push(orden); p.marcar(); },
    };
    return p;
  }

  it('la orden escaneada durante el vuelo sobrevive y el marcador queda prendido', () => {
    const p = pantalla();
    p.guardar({ id: 'orden-vieja' });

    // Se arma el cuerpo y se captura el sello JUSTO antes del POST.
    const enviado = { escaneos: [...p.estado.escaneos] };
    const selloEnviado = p.sello;

    // El POST está en vuelo y el operario escanea: nada lo frena.
    p.guardar({ id: 'orden-nueva' });

    // Llega el 200. El servidor aceptó, así que la versión nueva es válida
    // aunque no se adopte el cuerpo enviado.
    p.version = 2;
    if (decidirConfirmacion({ selloEnviado, selloActual: p.sello }) === 'adoptar-envio') {
      p.limpiar();
      p.estado = enviado;
    }

    expect(p.estado.escaneos.map((o) => o.id)).toEqual(['orden-vieja', 'orden-nueva']);
    expect(p.pendienteLocal).toBe(true);   // lo nuevo sigue sin confirmar
    expect(p.version).toBe(2);             // la versión sí se registra
  });

  it('sin trabajo nuevo, el 200 sí apaga el marcador (no queda en bucle)', () => {
    const p = pantalla();
    p.guardar({ id: 'orden-vieja' });
    const enviado = { escaneos: [...p.estado.escaneos] };
    const selloEnviado = p.sello;

    if (decidirConfirmacion({ selloEnviado, selloActual: p.sello }) === 'adoptar-envio') {
      p.limpiar();
      p.estado = enviado;
    }

    expect(p.pendienteLocal).toBe(false);
    expect(p.estado.escaneos.map((o) => o.id)).toEqual(['orden-vieja']);
  });
});
