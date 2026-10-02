/**
 * Port de tests/test_validacion.py de la app local.
 *
 * Cada caso es el mismo que ya pasaba en Python. Si estos tests pasan, el freno
 * anti-borrado y el rechazo de guardados corruptos se comportan igual que hoy.
 */

import { describe, it, expect } from 'vitest';
import { validarDatos, registrosHuerfanos, avanzarMesSiCorresponde, SECCIONES_LOTES, type Datos } from '../src/prensas/validacion';

const TZ = 'America/Argentina/Mendoza';

function datosDemo(): Datos {
  return {
    meta: { version: 1, mes_actual: 6, mes_actual_anio: 2026 },
    lotes: [
      { lote: 100, variedad: 'Malbec' },
      { lote: 200, variedad: 'Pinot Noir' },
    ],
    analisis: [
      { lote: 100, fecha: '2026-06-01', ph: 3.5 },
      { lote: 200, fecha: '2026-06-02', ph: 3.6 },
    ],
    degustaciones: [],
    agregados: [],
  };
}

const copia = (d: Datos): Datos => JSON.parse(JSON.stringify(d));

/** n lotes numerados, para probar los umbrales de pérdida. */
function conLotes(n: number): Datos {
  const d = datosDemo();
  d.lotes = Array.from({ length: n }, (_, i) => ({ lote: i + 1, variedad: 'X' }));
  return d;
}

describe('estructura del guardado', () => {
  it('un guardado igual al actual es válido', () => {
    const d = datosDemo();
    expect(validarDatos(copia(d), d)).toEqual([]);
  });

  it('rechaza lo que no es un objeto', () => {
    expect(validarDatos([1, 2], datosDemo()).length).toBeGreaterThan(0);
  });

  it('rechaza si falta la sección lotes', () => {
    const d = datosDemo();
    const n = copia(d);
    delete n.lotes;
    const errores = validarDatos(n, d);
    expect(errores.some((e) => e.includes('lotes'))).toBe(true);
  });

  it('rechaza filas que no son objetos', () => {
    const d = datosDemo();
    const n = copia(d);
    (n.analisis as unknown[]).push('esto no es una fila');
    const errores = validarDatos(n, d);
    expect(errores.some((e) => e.includes('analisis'))).toBe(true);
  });

  it('los errores de estructura NO se pueden forzar', () => {
    const d = datosDemo();
    const n = copia(d);
    delete n.lotes;
    expect(validarDatos(n, d, true).length).toBeGreaterThan(0);
  });

  it('acepta que degustaciones y agregados no vengan', () => {
    const d = datosDemo();
    const n = copia(d);
    delete n.degustaciones;
    delete n.agregados;
    expect(validarDatos(n, d)).toEqual([]);
  });

  it('rechaza meta que no es un objeto', () => {
    const d = datosDemo();
    const n = copia(d);
    n.meta = 'no soy un objeto' as unknown as Record<string, unknown>;
    const errores = validarDatos(n, d);
    expect(errores.some((e) => e.includes('meta'))).toBe(true);
  });
});

describe('freno anti-borrado masivo', () => {
  it('rechaza borrar muchos lotes de una', () => {
    const a = conLotes(100);
    const n = conLotes(50); // se perderían 50 de 100 = 50 %
    const errores = validarDatos(n, a);
    expect(errores.some((e) => e.includes('lotes'))).toBe(true);
  });

  it('deja pasar borrar unos pocos', () => {
    const a = conLotes(100);
    const n = conLotes(95); // 5 % y solo 5 items
    expect(validarDatos(n, a)).toEqual([]);
  });

  it('forzar permite pasar por encima del freno', () => {
    const a = conLotes(100);
    const n = conLotes(50);
    expect(validarDatos(n, a, true)).toEqual([]);
  });

  it('no frena si son menos de 10 items, aunque sea mucho porcentaje', () => {
    const a = conLotes(9);
    const n = conLotes(1); // 89 %, pero solo 8 perdidos
    expect(validarDatos(n, a)).toEqual([]);
  });

  it('rechaza vaciar los análisis', () => {
    const a = datosDemo();
    a.analisis = Array.from({ length: 40 }, (_, i) => ({ lote: 100, n: i }));
    const n = copia(a);
    n.analisis = [];
    const errores = validarDatos(n, a);
    expect(errores.some((e) => e.includes('analisis'))).toBe(true);
  });
});

describe('el freno de lotes mira identidades, no longitudes', () => {
  /** n lotes numerados a partir de `desde`, para armar intercambios. */
  function lotesDesde(desde: number, n: number): Datos {
    const d = datosDemo();
    d.lotes = Array.from({ length: n }, (_, i) => ({ lote: desde + i, variedad: 'X' }));
    return d;
  }

  // Contar longitudes (`va - vn`) es ciego al intercambio: un guardado que borra
  // 20 lotes y agrega otros 20 daba cero y pasaba sin frenar. Que es exactamente
  // la forma que tiene la falla que este freno tiene que atajar — un cliente con
  // datos viejos que empuja su propio maestro encima del de la bodega.
  it('frena reemplazar el maestro entero aunque la cantidad no cambie', () => {
    const a = lotesDesde(1, 20);
    const n = lotesDesde(1000, 20); // 20 bajas y 20 altas: el delta de longitudes es 0
    const errores = validarDatos(n, a);
    expect(errores.some((e) => e.includes('lotes'))).toBe(true);
  });

  it('frena un intercambio parcial: se van 15 de 40 y entran 15 nuevos', () => {
    const a = lotesDesde(1, 40);
    const n = datosDemo();
    n.lotes = [
      ...Array.from({ length: 25 }, (_, i) => ({ lote: i + 1, variedad: 'X' })),
      ...Array.from({ length: 15 }, (_, i) => ({ lote: 5000 + i, variedad: 'X' })),
    ];
    const errores = validarDatos(n, a);
    expect(errores.some((e) => e.includes('lotes'))).toBe(true);
  });

  // La contracara: editar no es borrar. El número de lote es la identidad, así
  // que cambiarle la variedad a todos no puede disparar el freno.
  it('editar todos los lotes sin borrar ninguno no dispara el freno', () => {
    const a = lotesDesde(1, 40);
    const n = copia(a);
    n.lotes = (n.lotes as Record<string, unknown>[]).map((l) => ({ ...l, variedad: 'Cabernet' }));
    expect(validarDatos(n, a)).toEqual([]);
  });

  it('agregar lotes nunca es pérdida', () => {
    const a = lotesDesde(1, 20);
    const n = lotesDesde(1, 60);
    expect(validarDatos(n, a)).toEqual([]);
  });

  it('el intercambio también se puede forzar, como cualquier pérdida', () => {
    const a = lotesDesde(1, 20);
    const n = lotesDesde(1000, 20);
    expect(validarDatos(n, a, true)).toEqual([]);
  });
});

describe('registros huérfanos', () => {
  it('detecta un análisis cuyo lote no existe', () => {
    const d = datosDemo();
    (d.analisis as Record<string, unknown>[]).push({ lote: 999, fecha: '2026-06-03' });
    const avisos = registrosHuerfanos(d);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('999');
  });

  it('no avisa nada cuando todo está en orden', () => {
    expect(registrosHuerfanos(datosDemo())).toEqual([]);
  });
});

describe('cambio automático de mes', () => {
  it('la primera vez solo registra el año, sin pisar el mes cargado a mano', () => {
    const d: Datos = { meta: { mes_actual: 6 } };
    const cambio = avanzarMesSiCorresponde(d, TZ, new Date('2026-08-15T12:00:00Z'));
    expect(cambio).toBeNull();
    expect((d.meta as Record<string, unknown>).mes_actual).toBe(6);
    expect((d.meta as Record<string, unknown>).mes_actual_anio).toBe(2026);
  });

  it('dentro del mismo mes no cambia nada', () => {
    const d: Datos = { meta: { mes_actual: 8, mes_actual_anio: 2026 } };
    const cambio = avanzarMesSiCorresponde(d, TZ, new Date('2026-08-15T12:00:00Z'));
    expect(cambio).toBeNull();
  });

  it('adelanta cuando cambió el mes', () => {
    const d: Datos = { meta: { mes_actual: 7, mes_actual_anio: 2026 } };
    const cambio = avanzarMesSiCorresponde(d, TZ, new Date('2026-08-15T12:00:00Z'));
    expect(cambio).toEqual([7, 8]);
    expect((d.meta as Record<string, unknown>).mes_actual).toBe(8);
  });

  it('maneja bien el paso de diciembre a enero, donde el mes BAJA', () => {
    const d: Datos = { meta: { mes_actual: 12, mes_actual_anio: 2026 } };
    const cambio = avanzarMesSiCorresponde(d, TZ, new Date('2027-01-10T12:00:00Z'));
    expect(cambio).toEqual([12, 1]);
    expect((d.meta as Record<string, unknown>).mes_actual_anio).toBe(2027);
  });

  it('nunca retrocede el mes', () => {
    const d: Datos = { meta: { mes_actual: 8, mes_actual_anio: 2026 } };
    const cambio = avanzarMesSiCorresponde(d, TZ, new Date('2026-03-10T12:00:00Z'));
    expect(cambio).toBeNull();
    expect((d.meta as Record<string, unknown>).mes_actual).toBe(8);
  });
});

describe('ordenes_trabajo en Lotes', () => {
  const base = (ots: unknown) => ({
    meta: { version: 1 },
    lotes: [{ lote: '26217' }],
    analisis: [],
    movimientos: [],
    ordenes_trabajo: ots,
  });
  const ot = (i: number) => ({ id: 'ot-' + i, ot: 'OT-2026-' + String(i).padStart(3, '0'), lotes: [] });

  it('rechaza ordenes_trabajo que no es una lista', () => {
    const e = validarDatos(base({ no: 'lista' }), base([]), false, SECCIONES_LOTES);
    expect(e.join(' ')).toMatch(/ordenes_trabajo/);
  });

  it('acepta que ordenes_trabajo no venga (documentos viejos)', () => {
    const { ordenes_trabajo: _, ...sin } = base([]);
    expect(validarDatos(sin, sin, false, SECCIONES_LOTES)).toEqual([]);
  });

  it('frena perder la mayoria de las OT en un solo guardado', () => {
    const muchas = Array.from({ length: 30 }, (_, i) => ot(i + 1));
    const e = validarDatos(base(muchas.slice(0, 5)), base(muchas), false, SECCIONES_LOTES);
    expect(e.join(' ')).toMatch(/se perderían 25 de 30 ordenes_trabajo/);
  });
});

describe('vasijas y mermas en Lotes', () => {
  it('estan declaradas pero no son requeridas', () => {
    expect(SECCIONES_LOTES.secciones).toEqual(expect.arrayContaining(['vasijas', 'mermas']));
    expect(SECCIONES_LOTES.requeridas).not.toContain('vasijas');
    expect(SECCIONES_LOTES.requeridas).not.toContain('mermas');
  });
});
