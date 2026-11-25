/**
 * Lotes que la orden deja afuera pero el usuario puede sumar a mano (pedido
 * 2026-11-02): los que ya están en objetivo y los corregidos hace poco. Viajan
 * en `activables` con todo lo que necesita la hoja (barricas, litros), y no
 * cuentan en `lotes` ni en el resumen.
 */
import { describe, it, expect } from 'vitest';
import { normalizarMapa } from '../src/lotes/motores/mapa';
import { armarOrden } from '../src/lotes/motores/correccion';

const d = (iso: string) => Date.parse(iso + 'T00:00:00Z');
const HOY = d('2026-10-02');
const mapaCon = (inventario: unknown) => normalizarMapa({ version: 1, estado: { inventario } });

const lote = (n: string) => ({ lote: n, variedad: 'Malbec', litros_actuales: 225, cap225: 1, etapa: 'crianza' });
const barril = (num: string, n: string) => ({ num, lote: n, cap: 225, litros: 225, estado: 'LLENO' });

describe('orden de corrección: activables', () => {
  it('un lote en objetivo va a activables con sus barricas y dosis 0', () => {
    const datos = {
      lotes: [lote('26001')],
      analisis: [{ lote: '26001', fecha_analisis: '2026-09-01', ph: 3.5, so2_libre: 60 }],
    };
    const orden = armarOrden(datos, mapaCon([barril('B1', '26001')]), HOY);
    expect(orden.lotes).toHaveLength(0);
    expect(orden.activables).toHaveLength(1);
    const a = orden.activables[0];
    expect(a.lote).toBe('26001');
    expect(a.fuera).toBe('en_objetivo');
    expect(a.so2_libre).toBe(60);
    expect(a.barricas).toHaveLength(1);
    expect(a.barricas[0].num).toBe('B1');
    // Nunca dosis negativa: la diferencia para dosificar se corta en 0.
    expect(a.barricas[0].mbk_g).toBe(0);
    expect(a.mbk_total_g).toBe(0);
    expect(orden.resumen.lotes).toBe(0);
  });

  it('un lote corregido hace poco sigue en suprimidos y además va a activables', () => {
    const datos = {
      lotes: [lote('26002')],
      analisis: [{
        lote: '26002', fecha_analisis: '2026-09-27', ph: 3.5, so2_libre: 10,
        correccion: { ot_n: 'OT-1', fecha: '2026-09-27' },
      }],
    };
    const orden = armarOrden(datos, mapaCon([barril('B2', '26002')]), HOY);
    expect(orden.lotes).toHaveLength(0);
    expect(orden.suprimidos).toHaveLength(1);
    expect(orden.activables).toHaveLength(1);
    const a = orden.activables[0];
    expect(a.fuera).toBe('corregido');
    expect(a.diferencia).toBeGreaterThan(0);
    expect(a.barricas[0].mbk_g).toBeGreaterThan(0);
    expect(a.corregido_en).toMatchObject({ ot: 'OT-1' });
  });

  it('sin volumen o sin SO2 válido no se vuelven activables', () => {
    const datos = {
      lotes: [lote('26003'), { lote: '26004', variedad: 'Malbec', etapa: 'crianza' }],
      analisis: [
        { lote: '26003', fecha_analisis: '2026-09-01', ph: 3.5 },
        { lote: '26004', fecha_analisis: '2026-09-01', ph: 3.5, so2_libre: 60 },
      ],
    };
    const orden = armarOrden(datos, mapaCon([barril('B3', '26003')]), HOY);
    expect(orden.activables).toHaveLength(0);
  });

  it('un lote que necesita SO2 no aparece en activables', () => {
    const datos = {
      lotes: [lote('26005')],
      analisis: [{ lote: '26005', fecha_analisis: '2026-09-01', ph: 3.5, so2_libre: 10 }],
    };
    const orden = armarOrden(datos, mapaCon([barril('B5', '26005')]), HOY);
    expect(orden.lotes).toHaveLength(1);
    expect(orden.lotes[0].fuera).toBeUndefined();
    expect(orden.activables).toHaveLength(0);
  });
});
