/* Las OT se ven siempre, prenda el año que prenda: un traslado de un lote 2025
 * no puede desaparecer del Historial con solo 2026 prendido. Los movimientos
 * sueltos (cargados a mano) siguen el selector de años. */
import { describe, it, expect } from 'vitest';
import { idsDeOrdenes, movimientoVisible } from '../public/lotes/js/ot-lista.js';

const ORDENES = [
  { id: 'ot-a', lotes: [{ lote: '25319', mov_id: 'ot-a-0' }, { lote: '26329', mov_id: 'ot-a-1' }] },
  { id: 'ot-b', lotes: [{ lote: '25100', mov_id: 'ot-b-0' }],
    achique: { destinos: [{ lote: '25101', mov_id: 'ot-b-a0' }] } },
];
const solo2026 = lote => String(lote).startsWith('26');

describe('idsDeOrdenes', () => {
  it('junta los movimientos de todas las OT, achique incluido', () => {
    expect([...idsDeOrdenes(ORDENES)].sort()).toEqual(['ot-a-0', 'ot-a-1', 'ot-b-0', 'ot-b-a0']);
    expect(idsDeOrdenes(undefined).size).toBe(0);
  });
});

describe('movimientoVisible', () => {
  const ids = idsDeOrdenes(ORDENES);
  it('un movimiento de una OT se ve aunque su año esté apagado', () => {
    expect(movimientoVisible({ id: 'ot-a-0', lote: '25319' }, ids, solo2026)).toBe(true);
    expect(movimientoVisible({ id: 'ot-b-a0', lote: '25101' }, ids, solo2026)).toBe(true);
  });
  it('un movimiento suelto sigue el selector de años', () => {
    expect(movimientoVisible({ id: 'mov-1', lote: '25319' }, ids, solo2026)).toBe(false);
    expect(movimientoVisible({ id: 'mov-2', lote: '26001' }, ids, solo2026)).toBe(true);
  });
  it('el texto de la columna OT no alcanza: manda que sea un movimiento de una OT', () => {
    expect(movimientoVisible({ id: 'mov-3', lote: '25319', ot: '0957' }, ids, solo2026)).toBe(false);
  });
  it('un traspaso suelto 25xxx -> 26xxx se ve por su lote destino', () => {
    expect(movimientoVisible({ id: 'mov-4', lote: '25319', lote_destino: '26400' }, ids, solo2026)).toBe(true);
  });
});
