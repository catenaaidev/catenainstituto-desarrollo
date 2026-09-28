/* Tests de lote-nuevo.js: el asistente de "Nuevo lote", el lote hijo y los
 * lotes fijados arriba de la pestana Lotes.
 *
 * lote-nuevo.js es un modulo puro (sin DOM ni storage), asi que se importa tal
 * cual dentro del runtime de Workers, igual que envases.js en
 * lotes-vacios.test.mjs.
 */
import { describe, it, expect } from 'vitest';
import { armarHijo, validarNumeroLote, ordenarConFijos, movimientoHijo, CAMPOS_ENVASE, PASOS }
  from '../public/lotes/js/lote-nuevo.js';

describe('armarHijo', () => {
  const padre = {
    lote: 26217, variedad: 'Malbec', distrito: 'Gualtallary', proyecto: 'ADRIANNA',
    organico_convencional: 'Orgánico', id_texto: 'MB GUA 26', kilos: 3200,
    vasija_actual: 'B12', categoria: 'A', etapa: 'crianza',
    litros_actuales: 2250, cap50: null, cap200: 2, cap225: 8, cap500: 1, vasija_grande: 300,
  };

  it('copia todos los datos del padre', () => {
    const h = armarHijo(padre);
    for (const k of ['variedad','distrito','proyecto','organico_convencional',
                     'id_texto','kilos','vasija_actual','categoria','etapa'])
      expect(h[k]).toBe(padre[k]);
  });

  it('arranca sin numero de lote, en 0 litros y sin envases', () => {
    const h = armarHijo(padre);
    expect(h.lote).toBe('');
    expect(h.litros_actuales).toBe(0);
    for (const k of CAMPOS_ENVASE) expect(h[k]).toBeNull();
  });

  it('es un objeto nuevo: tocar el hijo no toca al padre', () => {
    const h = armarHijo(padre);
    h.variedad = 'Cabernet';
    expect(padre.variedad).toBe('Malbec');
    expect(padre.litros_actuales).toBe(2250);
  });

  it('queda marcado como lote de vino: no le faltan datos de uva', () => {
    expect(armarHijo({ ...padre, origen: 'Uva' }).origen).toBe('Vino');
  });

  it('no arrastra los campos internos de la vista (los que empiezan con _)', () => {
    const h = armarHijo({ ...padre, _etapa: 'crianza', _origIdx: 4 });
    expect('_etapa' in h).toBe(false);
    expect('_origIdx' in h).toBe(false);
  });
});

describe('validarNumeroLote', () => {
  const lotes = [{ lote: 26217 }, { lote: '26300' }, { lote: '' }];

  it('acepta un numero nuevo y lo devuelve como numero', () => {
    expect(validarNumeroLote('26400', lotes)).toEqual({ ok: true, valor: 26400 });
  });

  it('pide el numero si esta vacio', () => {
    expect(validarNumeroLote('  ', lotes).ok).toBe(false);
  });

  it('rechaza lo que no es un numero (la columna Lote es numerica)', () => {
    expect(validarNumeroLote('abc', lotes).ok).toBe(false);
  });

  it('rechaza un lote que ya existe, guardado como numero o como texto', () => {
    expect(validarNumeroLote('26217', lotes).ok).toBe(false);
    expect(validarNumeroLote('26300', lotes).ok).toBe(false);
    expect(validarNumeroLote('26217', lotes).error).toMatch(/ya existe/);
  });
});

describe('ordenarConFijos', () => {
  const a = { lote: 1 }, b = { lote: 2 }, c = { lote: 3 }, d = { lote: 4 };

  it('pone los fijos arriba, del mas nuevo al mas viejo, y el resto en su orden', () => {
    // fijos en orden de creacion: primero c, despues a
    expect(ordenarConFijos([a, b, c, d], [c, a])).toEqual([a, c, b, d]);
  });

  it('sin fijos deja el orden como esta', () => {
    expect(ordenarConFijos([d, c, b, a], [])).toEqual([d, c, b, a]);
  });

  it('muestra un fijo aunque el filtro lo haya dejado afuera', () => {
    // visibles = [b, d]; c es fijo pero no pasa el filtro
    expect(ordenarConFijos([b, d], [c])).toEqual([c, b, d]);
  });
});

describe('movimientoHijo', () => {
  const m = movimientoHijo({ lote: 26217 }, { lote: 26400 }, 'Marcelo', '2026-09-28');

  it('es un traspaso EJECUTADO del padre al hijo: es lo que arma la arista del linaje', () => {
    // linaje.ts solo arma padre→hijo con traspaso/renombre, y los pendientes no cuentan.
    expect(m.tipo).toBe('traspaso');
    expect(m.estado).toBe('ejecutado');
    expect(m.lote).toBe('26217');
    expect(m.lote_destino).toBe('26400');
  });

  it('lleva la fecha y quien lo cargo, y los litros vacios para completar en Movimientos', () => {
    expect(m.fecha).toBe('2026-09-28');
    expect(m.cargado_el).toBe('2026-09-28');
    expect(m.cargado_por).toBe('Marcelo');
    expect(m.litros).toBeNull();
    expect(m.id).toMatch(/^mov-/);
  });
});

describe('PASOS del asistente', () => {
  it('pregunta el origen: uva o vino ya hecho', () => {
    const p = PASOS.find(x => x.k === 'origen');
    expect(p.opciones).toEqual(['', 'Uva', 'Vino']);
  });
});
