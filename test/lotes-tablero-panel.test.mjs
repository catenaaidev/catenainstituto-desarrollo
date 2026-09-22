/* Importa de tablero-datos.js, NO de tablero-panel.js: ese importa nucleo.js,
 * que toca window al cargarse y no existe en el runtime de Workers. */
import { describe, it, expect } from 'vitest';
import { tarjetasDe, tonoMosaico } from '../public/lotes/js/tablero-datos.js';

const KPIS = {
  total_activos: 249, fml_terminada: 60, frecuencia_al_dia: 200,
  so2_conforme: 210, ph_ok: 244, lleno: 210, requieren_accion: 90,
};

describe('tarjetasDe', () => {
  it('los seis ejes del panel, en el orden del tablero', () => {
    expect(tarjetasDe(KPIS).map(t => t.label)).toEqual([
      'FML terminada', 'Frecuencia al día', 'SO₂ conforme', 'pH OK', 'Lleno', 'Requieren acción',
    ]);
  });

  it('el porcentaje se calcula sobre los activos y se redondea', () => {
    const t = tarjetasDe(KPIS).find(x => x.clave === 'so2_conforme');
    expect(t.cantidad).toBe(210);
    expect(t.total).toBe(249);
    expect(t.pct).toBe(84);
  });

  it('sin lotes activos no divide por cero', () => {
    expect(tarjetasDe({ total_activos: 0, fml_terminada: 0 })[0].pct).toBe(0);
  });

  it('solo "Requieren accion" se resalta cuando sube; los otros cuando bajan', () => {
    const t = tarjetasDe(KPIS);
    expect(t.find(x => x.clave === 'requieren_accion').hi).toBe(true);
    expect(t.find(x => x.clave === 'ph_ok').hi).toBe(false);
  });
});

describe('tonoMosaico', () => {
  it('verde sin condiciones, gris con una, rojo con dos o mas', () => {
    expect(tonoMosaico({ condiciones: [] })).toBe('ok');
    expect(tonoMosaico({ condiciones: [{ clave: 'ph_no_ok' }] })).toBe('neutro');
    expect(tonoMosaico({ condiciones: [{ clave: 'ph_no_ok' }, { clave: 'no_lleno' }] })).toBe('mal');
  });

  it('una fila sin el campo condiciones cuenta como sana, no rompe', () => {
    expect(tonoMosaico({})).toBe('ok');
  });
});
