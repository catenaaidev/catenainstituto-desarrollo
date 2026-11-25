/* Tests de ot-corte.js: el lote nuevo que crea la OT de Corte.
 * Modulo puro (sin DOM), igual que lote-nuevo.js. */
import { describe, it, expect } from 'vitest';
import { PASOS_LOTE_CORTE, validarLoteDelCorte, validarLoteExistente, valoresIniciales, armarLoteDelCorte,
         loteCorteDeEdicion }
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
  it('el lote nuevo no hereda la vasija del padre: todavia no tiene vino', () => {
    const base = armarHijo({ lote: 26217, variedad: 'Malbec', vasija_actual: '3 barricas', cap225: 3 });
    expect(armarLoteDelCorte(base, { id_texto: 'X' }, 26300).vasija_actual).toBe('');
  });
  it('no toca la base que recibe', () => {
    const base = { lote: '', variedad: 'Malbec' };
    armarLoteDelCorte(base, { variedad: 'Blend' }, 1);
    expect(base.variedad).toBe('Malbec');
  });
});

describe('validarLoteExistente', () => {
  const LOTES = [{ lote: 26217, id_texto: 'Malbec A' }, { lote: '26218' }];
  it('tiene que existir', () => {
    expect(validarLoteExistente('', LOTES, []).ok).toBe(false);
    expect(validarLoteExistente('99999', LOTES, []).error).toMatch(/no existe/);
  });
  it('devuelve el numero como texto y la ficha', () => {
    const v = validarLoteExistente(' 26217 ', LOTES, []);
    expect(v).toMatchObject({ ok: true, valor: '26217' });
    expect(v.ficha.id_texto).toBe('Malbec A');
  });
  it('puede ser uno de los lotes de origen: pasa con una advertencia', () => {
    const v = validarLoteExistente('26218', LOTES, ['26218']);
    expect(v).toMatchObject({ ok: true, valor: '26218' });
    expect(v.aviso).toMatch(/origen/);
    expect(validarLoteExistente('26217', LOTES, ['26218']).aviso).toBeUndefined();
  });
});

describe('loteCorteDeEdicion', () => {
  const v = { valor: '26323', ficha: { lote: 26323, id_texto: 'PN corte' } };
  it('el lote que creo la OT sigue siendo creado por ella al editar (no pasa a existente)', () => {
    const previo = { lote: '26323', id_texto: 'PN corte' };
    expect(loteCorteDeEdicion(true, v, previo, '')).toEqual({ lote: '26323', id_texto: 'PN corte' });
  });
  it('un lote existente de verdad queda existente', () => {
    expect(loteCorteDeEdicion(true, v, { lote: '26323', existente: true }, '')).toEqual({ lote: '26323', id_texto: 'PN corte', existente: true });
    expect(loteCorteDeEdicion(true, v, { lote: '26100' }, '')).toEqual({ lote: '26323', id_texto: 'PN corte', existente: true });
    expect(loteCorteDeEdicion(true, v, null, '')).toEqual({ lote: '26323', id_texto: 'PN corte', existente: true });
  });
  it('modo lote nuevo: el lote con la descripcion escrita', () => {
    expect(loteCorteDeEdicion(false, { valor: 26330 }, null, 'Blend')).toEqual({ lote: '26330', id_texto: 'Blend' });
  });
});
