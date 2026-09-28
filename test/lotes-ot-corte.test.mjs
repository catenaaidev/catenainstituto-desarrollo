/* Tests de ot-corte.js: el lote nuevo que crea la OT de Corte.
 * Modulo puro (sin DOM), igual que lote-nuevo.js. */
import { describe, it, expect } from 'vitest';
import { PASOS_LOTE_CORTE, validarLoteDelCorte, valoresIniciales, armarLoteDelCorte }
  from '../public/lotes/js/ot-corte.js';
import { armarHijo } from '../public/lotes/js/lote-nuevo.js';

const LOTES = [{ lote: 26217 }, { lote: '26218' }];

describe('PASOS_LOTE_CORTE', () => {
  it('pregunta la descripcion y los datos del asistente, sin el numero de lote', () => {
    expect(PASOS_LOTE_CORTE.map(p => p.k)).toEqual(
      ['id_texto', 'variedad', 'distrito', 'proyecto', 'organico_convencional', 'origen']);
  });
});

describe('validarLoteDelCorte', () => {
  it('pide un numero nuevo', () => {
    expect(validarLoteDelCorte('', LOTES, []).ok).toBe(false);
    expect(validarLoteDelCorte('26217', LOTES, []).ok).toBe(false);
    expect(validarLoteDelCorte('26300', LOTES, [])).toEqual({ ok: true, valor: 26300 });
  });
  it('no puede ser uno de los lotes de origen', () => {
    const v = validarLoteDelCorte('26300', LOTES, ['26300']);
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/origen/);
  });
});

describe('valoresIniciales', () => {
  it('en blanco el origen es Vino: un corte sale de vino ya hecho', () => {
    const v = valoresIniciales({ variedad: '', id_texto: '' });
    expect(v.origen).toBe('Vino');
    expect(v.variedad).toBe('');
  });
  it('como hijo trae los datos del padre', () => {
    const v = valoresIniciales(armarHijo({ lote: 26217, variedad: 'Malbec', id_texto: 'MB GUA 26',
                                            proyecto: 'ADRIANNA', litros_actuales: 900 }));
    expect(v).toMatchObject({ variedad: 'Malbec', id_texto: 'MB GUA 26', proyecto: 'ADRIANNA', origen: 'Vino' });
  });
});

describe('armarLoteDelCorte', () => {
  it('vuelca los valores sobre la base con el numero validado', () => {
    const base = armarHijo({ lote: 26217, variedad: 'Malbec', kilos: 3200, litros_actuales: 900, cap225: 4 });
    const l = armarLoteDelCorte(base, { id_texto: 'Base HOFB', variedad: 'Blend', origen: 'Vino' }, 26300);
    expect(l).toMatchObject({ lote: 26300, id_texto: 'Base HOFB', variedad: 'Blend', kilos: 3200,
                              litros_actuales: 0, cap225: null, origen: 'Vino' });
  });
  it('no toca la base que recibe', () => {
    const base = { lote: '', variedad: 'Malbec' };
    armarLoteDelCorte(base, { variedad: 'Blend' }, 1);
    expect(base.variedad).toBe('Malbec');
  });
});
