/**
 * Port de tests/test_borrado_masivo.py del Mapa de Barriles.
 *
 * Estos frenos protegen ante un celular con datos viejos en memoria que empuje
 * borrados sin querer. Mismos umbrales que la app local.
 */

import { describe, it, expect } from 'vitest';
import {
  contarPerdidas,
  superanUmbral,
  idsPerdidos,
  UMBRAL_BORRADO,
  UMBRAL_INVENTARIO,
  UMBRAL_ESCANEOS,
  UMBRAL_TANQUES,
  UMBRAL_PALETS,
  type Estado,
  type Contenedor,
} from '../src/barriles/guardas';

/** Un box con `n` celdas llenas. */
function box(id: string, n: number): Contenedor {
  const celdas: Record<string, string> = {};
  for (let i = 0; i < n; i++) celdas['c' + i] = 'barril' + i;
  return { id, celdas };
}

function estado(parcial: Partial<Estado> = {}): Estado {
  return { boxes: [], palets: [], inventario: [], escaneos: [], tanques: [], revisiones: [], ediciones: [], pedidos: [], ...parcial };
}

// Los items llevan tanto `id` como `num` para que CLAVE_DE los identifique
// correctamente en todas las colecciones (inventario/tanques usan `num`,
// escaneos usa `id`).
const lista = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, num: i }));

describe('conteo de celdas vaciadas', () => {
  it('no cuenta nada si no cambió nada', () => {
    const e = estado({ boxes: [box('1', 20)] });
    expect(contarPerdidas(e, e).celdas).toBe(0);
  });

  it('cuenta las celdas que quedaron vacías', () => {
    const antes = estado({ boxes: [box('1', 20)] });
    const despues = estado({ boxes: [box('1', 15)] });
    expect(contarPerdidas(antes, despues).celdas).toBe(5);
  });

  it('si desaparece un box entero, sus celdas llenas cuentan como borradas', () => {
    const antes = estado({ boxes: [box('1', 20), box('2', 8)] });
    const despues = estado({ boxes: [box('1', 20)] });
    expect(contarPerdidas(antes, despues).celdas).toBe(8);
  });

  it('agregar celdas no es pérdida', () => {
    const antes = estado({ boxes: [box('1', 10)] });
    const despues = estado({ boxes: [box('1', 30)] });
    expect(contarPerdidas(antes, despues).celdas).toBe(0);
  });

  it('una celda vaciada a texto vacío cuenta como borrada', () => {
    const antes = estado({ boxes: [{ id: '1', celdas: { a: 'x', b: 'y' } }] });
    const despues = estado({ boxes: [{ id: '1', celdas: { a: '', b: 'y' } }] });
    expect(contarPerdidas(antes, despues).celdas).toBe(1);
  });

  it('los palets se cuentan aparte de los boxes', () => {
    const antes = estado({ palets: [box('p1', 12)] });
    const despues = estado({ palets: [box('p1', 2)] });
    const p = contarPerdidas(antes, despues);
    expect(p.palets).toBe(10);
    expect(p.celdas).toBe(0);
  });
});

describe('caídas en las colecciones', () => {
  it('cuenta cuántos registros desaparecieron', () => {
    const antes = estado({ inventario: lista(100), escaneos: lista(10), tanques: lista(20) });
    const despues = estado({ inventario: lista(80), escaneos: lista(9), tanques: lista(20) });
    const p = contarPerdidas(antes, despues);
    expect(p.inventario).toBe(20);
    expect(p.escaneos).toBe(1);
    expect(p.tanques).toBe(0);
  });

  it('crecer nunca es pérdida', () => {
    const antes = estado({ inventario: lista(10) });
    const despues = estado({ inventario: lista(500) });
    expect(contarPerdidas(antes, despues).inventario).toBe(0);
  });
});

describe('cuándo se pide confirmación', () => {
  // Incluye las colecciones nuevas para que el tipo `Perdidas` cierre sin error TS.
  const cero = { celdas: 0, inventario: 0, escaneos: 0, tanques: 0, palets: 0, revisiones: 0, ediciones: 0, pedidos: 0 };

  it('no molesta cuando no se pierde nada', () => {
    expect(superanUmbral(cero)).toBe(false);
  });

  it('deja pasar borrados chicos, justo por debajo del umbral', () => {
    expect(superanUmbral({ ...cero, celdas: UMBRAL_BORRADO - 1 })).toBe(false);
    expect(superanUmbral({ ...cero, inventario: UMBRAL_INVENTARIO - 1 })).toBe(false);
    expect(superanUmbral({ ...cero, escaneos: UMBRAL_ESCANEOS - 1 })).toBe(false);
    expect(superanUmbral({ ...cero, tanques: UMBRAL_TANQUES - 1 })).toBe(false);
    expect(superanUmbral({ ...cero, palets: UMBRAL_PALETS - 1 })).toBe(false);
  });

  it('pide confirmación al llegar al umbral, en cualquiera de las colecciones', () => {
    expect(superanUmbral({ ...cero, celdas: UMBRAL_BORRADO })).toBe(true);
    expect(superanUmbral({ ...cero, inventario: UMBRAL_INVENTARIO })).toBe(true);
    expect(superanUmbral({ ...cero, escaneos: UMBRAL_ESCANEOS })).toBe(true);
    expect(superanUmbral({ ...cero, tanques: UMBRAL_TANQUES })).toBe(true);
    expect(superanUmbral({ ...cero, palets: UMBRAL_PALETS })).toBe(true);
  });

  it('vaciar el inventario entero siempre pide confirmación', () => {
    const antes = estado({ inventario: lista(2354) });
    const despues = estado({ inventario: [] });
    const p = contarPerdidas(antes, despues);
    expect(p.inventario).toBe(2354);
    expect(superanUmbral(p)).toBe(true);
  });
});

describe('el freno ve los intercambios, no solo las bajas netas', () => {
  // Contar longitudes es ciego a esto: se borran 3 ordenes y se agregan 3, el
  // delta da 0 y el freno no salta. Es la forma exacta que tiene esta falla.
  it('frena cuando se borran 3 ordenes y se agregan otras 3', () => {
    const antes = estado({ escaneos: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
    const despues = estado({ escaneos: [{ id: 'x' }, { id: 'y' }, { id: 'z' }] });
    const p = contarPerdidas(antes, despues);
    expect(p.escaneos).toBe(3);
    expect(superanUmbral(p)).toBe(true);
  });

  it('no frena si las mismas ordenes siguen estando, en otro orden', () => {
    const antes = estado({ escaneos: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
    const despues = estado({ escaneos: [{ id: 'c' }, { id: 'a' }, { id: 'b' }] });
    expect(contarPerdidas(antes, despues).escaneos).toBe(0);
  });

  it('agregar sin borrar nunca es perdida', () => {
    const antes = estado({ escaneos: [{ id: 'a' }] });
    const despues = estado({ escaneos: [{ id: 'a' }, { id: 'b' }] });
    expect(contarPerdidas(antes, despues).escaneos).toBe(0);
  });
});

describe('las colecciones que no tenian ningun freno', () => {
  it('cuenta las revisiones que desaparecen', () => {
    const antes = estado({ revisiones: [
      { num: '1', campo: 'lote' }, { num: '2', campo: 'lote' }, { num: '3', campo: 'lote' }] });
    const p = contarPerdidas(antes, estado({ revisiones: [] }));
    expect(p.revisiones).toBe(3);
    expect(superanUmbral(p)).toBe(true);
  });

  it('cuenta las ediciones a mano que desaparecen', () => {
    const antes = estado({ ediciones: [
      { num: '1', campo: 'litros' }, { num: '2', campo: 'litros' }, { num: '3', campo: 'litros' }] });
    expect(superanUmbral(contarPerdidas(antes, estado({ ediciones: [] })))).toBe(true);
  });

  it('cuenta los pedidos de rotulos que desaparecen', () => {
    const antes = estado({ pedidos: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] });
    expect(superanUmbral(contarPerdidas(antes, estado({ pedidos: [] })))).toBe(true);
  });
});

describe('idsPerdidos', () => {
  it('devuelve los ids concretos, para que el historial pueda nombrarlos', () => {
    const antes = estado({ escaneos: [{ id: 'a' }, { id: 'b' }] });
    const despues = estado({ escaneos: [{ id: 'b' }] });
    expect(idsPerdidos(antes, despues, 'escaneos')).toEqual(['a']);
  });
});
