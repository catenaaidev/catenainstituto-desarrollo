/**
 * Port de tests/test_historial.py de la app local.
 *
 * Verifica que el resumen de cambios que ve el botón "🕘 Historial" diga
 * exactamente lo mismo que decía antes.
 */

import { describe, it, expect } from 'vitest';
import { resumenCambios, diffLotes, diffItems } from '../src/prensas/cambios';
import type { Datos } from '../src/prensas/validacion';

function base(): Datos {
  return {
    meta: { version: 1 },
    lotes: [
      { lote: 100, variedad: 'Malbec' },
      { lote: 200, variedad: 'Pinot Noir' },
    ],
    analisis: [{ lote: 100, ph: 3.5 }],
    degustaciones: [],
    agregados: [],
  };
}

const copia = (d: Datos): Datos => JSON.parse(JSON.stringify(d));

describe('resumen de cambios', () => {
  it('sin cambios lo dice explícitamente', () => {
    const a = base();
    const { texto } = resumenCambios(a, copia(a));
    expect(texto).toBe('sin cambios en los datos');
  });

  it('detecta lote agregado, borrado y editado a la vez', () => {
    const a = base();
    const n = copia(a);
    (n.lotes as Record<string, unknown>[])[0].variedad = 'Malbec Reserva'; // edita 100
    n.lotes = (n.lotes as Record<string, unknown>[]).filter((l) => l.lote !== 200); // borra 200
    (n.lotes as Record<string, unknown>[]).push({ lote: 400, variedad: 'Syrah' }); // agrega 400

    const { texto, detalle } = resumenCambios(a, n);
    const lotes = detalle.lotes as { agregados: unknown[]; eliminados: unknown[]; editados: unknown[] };

    expect(lotes.agregados).toEqual([400]);
    expect(lotes.eliminados).toEqual([200]);
    expect(lotes.editados).toEqual([100]);

    expect(texto).toContain('+1 lote(s): 400');
    expect(texto).toContain('−1 lote(s): 200');
    expect(texto).toContain('editado');
  });

  it('una edición de análisis cuenta como 1 alta + 1 baja', () => {
    const a = base();
    a.analisis = [
      { lote: 100, ph: 3.5 },
      { lote: 200, ph: 3.6 },
    ];
    const n = copia(a);
    (n.analisis as Record<string, unknown>[])[0].ph = 3.7; // 1 edición = +1 / −1
    (n.analisis as Record<string, unknown>[]).push({ lote: 300, ph: 3.8 }); // 1 alta

    const { detalle } = resumenCambios(a, n);
    const ana = detalle.analisis as { altas: number; bajas: number };

    expect(ana.altas).toBe(2);
    expect(ana.bajas).toBe(1);
  });

  it('los números de lote conservan su tipo original', () => {
    const { agregados } = diffLotes([], [{ lote: 26701 }]);
    expect(agregados).toEqual([26701]);
    expect(typeof agregados[0]).toBe('number');
  });

  it('el orden de las claves de un objeto no cuenta como cambio', () => {
    const altas = diffItems([{ a: 1, b: 2 }], [{ b: 2, a: 1 }]);
    expect(altas).toEqual({ altas: 0, bajas: 0 });
  });

  it('cuenta bien los duplicados', () => {
    const r = diffItems([{ x: 1 }, { x: 1 }], [{ x: 1 }]);
    expect(r).toEqual({ altas: 0, bajas: 1 });
  });
});
