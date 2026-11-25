/* La condicion de re-analisis: una correccion real de SO2 pide volver a medir a
 * los 3 dias (las "72 h" del pedido; la correccion guarda solo el dia). */
import { describe, it, expect } from 'vitest';
import { reanalisisPendiente, REANALISIS_DIAS } from '../src/lotes/motores/correcciones-base';
import { evaluarLote, CRITERIOS_DEFAULT, CONDICIONES } from '../src/lotes/motores/fml';

const d = (iso: string) => Date.parse(iso + 'T00:00:00Z');
const corregido = (extra: Record<string, unknown> = {}) => ({
  lote: '26001', fecha_analisis: '2026-10-01', so2_libre: 18,
  correccion: { ot_n: 'B230', fecha: '2026-10-02', so2_libre_actual: 18, ...extra },
});

describe('reanalisisPendiente', () => {
  it('son 3 dias', () => { expect(REANALISIS_DIAS).toBe(3); });

  it('se activa justo al tercer dia de la correccion', () => {
    expect(reanalisisPendiente([corregido()], d('2026-10-05'))).toEqual({ activa: true, desde: '2026-10-05' });
  });

  it('antes del tercer dia no', () => {
    expect(reanalisisPendiente([corregido()], d('2026-10-04')).activa).toBe(false);
  });

  it('una correccion anulada no cuenta', () => {
    const an = [corregido({ anulada: { fecha: '2026-10-03', por: 'Ori' } })];
    expect(reanalisisPendiente(an, d('2026-10-09')).activa).toBe(false);
  });

  it('una correccion sin numero de OT es una cascara de la migracion: no cuenta', () => {
    expect(reanalisisPendiente([corregido({ ot_n: '' })], d('2026-10-09')).activa).toBe(false);
  });

  it('un SO2 medido despues de la correccion la apaga', () => {
    const an = [corregido(), { lote: '26001', fecha_analisis: '2026-10-04', so2_libre: 31 }];
    expect(reanalisisPendiente(an, d('2026-10-09')).activa).toBe(false);
  });

  it('un analisis posterior SIN SO2 no la apaga', () => {
    const an = [corregido(), { lote: '26001', fecha_analisis: '2026-10-04', ph: 3.6 }];
    expect(reanalisisPendiente(an, d('2026-10-09')).activa).toBe(true);
  });

  it('sin correcciones no hay nada que re-analizar', () => {
    expect(reanalisisPendiente([{ lote: '26001', fecha_analisis: '2026-10-01', so2_libre: 25 }], d('2026-10-09')))
      .toEqual({ activa: false, desde: null });
  });
});

describe('condicion reanalisis_correccion en evaluarLote', () => {
  const cfg = { default: { ...CRITERIOS_DEFAULT }, por_variedad: {} };
  const lote = { lote: '26001', variedad: 'Malbec', litros_actuales: 1000 };

  it('esta en CONDICIONES con etiqueta y accion', () => {
    expect(CONDICIONES.reanalisis_correccion.etiqueta).toBe('Re-análisis post-corrección');
  });

  it('aparece en alarmas y condiciones con su "desde"', () => {
    const r = evaluarLote(lote, [corregido()], cfg, d('2026-10-06'));
    expect(r.alarmas).toContain('reanalisis_correccion');
    expect(r.condiciones.find((c) => c.clave === 'reanalisis_correccion')?.desde).toBe('2026-10-05');
  });

  it('no aparece antes de tiempo', () => {
    const r = evaluarLote(lote, [corregido()], cfg, d('2026-10-03'));
    expect(r.alarmas).not.toContain('reanalisis_correccion');
  });
});
