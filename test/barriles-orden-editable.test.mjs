/**
 * La ventana de 15 minutos para editar una orden ya guardada (pestaña Escáner).
 *
 * El operario corrige lo que acaba de cargar; pasada la ventana, la orden queda
 * sólo para el programador. Se importa el archivo que sirve la página, no una
 * copia: si alguien afloja la regla en producción, este test se entera.
 *
 * Va en .mjs y no en .ts a propósito, igual que `freno.test.mjs`: `tsconfig.json`
 * sólo incluye `test/**\/*.ts`, y ese archivo no tiene declaraciones de tipos.
 *
 * El import es por efecto: `orden-editable.js` se carga como <script> clásico en
 * la página, así que no exporta nada — se cuelga del objeto global.
 */

import { describe, it, expect } from 'vitest';
import '../public/barriles/js/orden-editable.js';

const { escPuedeEditar, ESC_MINUTOS_EDICION } = globalThis;

const MINUTO = 60000;
const AHORA = 1757000000000;

/** Una orden guardada por la app hace `minutos` minutos. */
const orden = (minutos, extra) => ({
  id: 'e' + (AHORA - minutos * MINUTO),
  fecha: '2026-09-16', ot: 'OT-617', lote: '1A', tipo: 'llenado', codigos: ['1', '2'],
  ...extra,
});

describe('la ventana de edición', () => {
  it('son 15 minutos', () => {
    expect(ESC_MINUTOS_EDICION).toBe(15);
  });

  it('deja al operario editar la orden que acaba de guardar', () => {
    expect(escPuedeEditar(orden(0), 'operario', AHORA).puede).toBe(true);
    expect(escPuedeEditar(orden(14), 'operario', AHORA).puede).toBe(true);
  });

  it('le corta el paso al operario pasados los 15 minutos', () => {
    const v = escPuedeEditar(orden(16), 'operario', AHORA);
    expect(v.puede).toBe(false);
    expect(v.motivo).toBe('vencida');
  });

  it('no le pone ninguna ventana al programador', () => {
    expect(escPuedeEditar(orden(60 * 24 * 90), 'programador', AHORA).puede).toBe(true);
  });
});

describe('órdenes sin hora de creación', () => {
  it('trata como vieja la orden importada del Excel', () => {
    // El import no genera el id 'e<milisegundos>', así que no hay forma de saber
    // cuándo se cargó. Se elige el lado seguro: el operario no la toca.
    for (const id of ['imp-2026-03-1', 'e', '', undefined]) {
      const v = escPuedeEditar({ ...orden(0), id }, 'operario', AHORA);
      expect(v.puede, `id ${JSON.stringify(id)}`).toBe(false);
      expect(v.motivo).toBe('vencida');
    }
  });

  it('pero el programador sí la puede editar', () => {
    expect(escPuedeEditar({ ...orden(0), id: 'imp-2026-03-1' }, 'programador', AHORA).puede).toBe(true);
  });
});

describe('lo que ya frenaba antes sigue frenando', () => {
  it('una orden que no existe', () => {
    expect(escPuedeEditar(null, 'programador', AHORA))
      .toEqual({ puede: false, motivo: 'no-existe' });
  });

  it('una orden ya aplicada al inventario, para los dos roles', () => {
    const o = orden(1, { aplicado: { el: '2026-09-16', campos: [], cambios: [] } });
    expect(escPuedeEditar(o, 'programador', AHORA).motivo).toBe('aplicada');
    expect(escPuedeEditar(o, 'operario', AHORA).motivo).toBe('aplicada');
  });

  it('una orden marcada a mano se edita, pero avisando', () => {
    const o = orden(1, { marcas: { inventario: true } });
    expect(escPuedeEditar(o, 'operario', AHORA)).toEqual({ puede: true, aviso: 'marcada' });
  });

  it('la ventana vencida pesa más que el aviso de la marca', () => {
    const o = orden(30, { marcas: { inventario: true } });
    expect(escPuedeEditar(o, 'operario', AHORA).puede).toBe(false);
  });
});
