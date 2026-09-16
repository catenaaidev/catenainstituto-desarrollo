import { describe, it, expect } from 'vitest';
import { migrarDecisionesFml } from '../scripts/migrar-decisiones-fml.mjs';

/** Un lote activo con lo minimo que mira la migracion. */
const lote = (extra) => ({ lote: '26007', variedad: 'Pinot Noir', litros_actuales: 1000, ...extra });

describe('migracion de las decisiones de FML', () => {
  it('traduce la columna fml_excluida de ESTADO_LOTE a hace_fml', () => {
    const lotes = [lote({ lote: '26007' }), lote({ lote: '26008' })];
    const { cambios } = migrarDecisionesFml(lotes, { 26007: 'no', 26008: 'si' });

    expect(cambios).toEqual([
      { indice: 0, lote: '26007', variedad: 'Pinot Noir', valor: 'si' },
      { indice: 1, lote: '26008', variedad: 'Pinot Noir', valor: 'no' },
    ]);
  });

  it('el indice es el de la fila en el documento, no el del cambio', () => {
    // El indice va derecho al json_set('$.lotes[N].hace_fml'), asi que tiene
    // que sobrevivir a los lotes que la migracion saltea.
    const lotes = [lote({ lote: '26001', hace_fml: 'si' }), lote({ lote: '26007' })];
    const { cambios } = migrarDecisionesFml(lotes, { 26001: 'no', 26007: 'no' });

    expect(cambios).toEqual([{ indice: 1, lote: '26007', variedad: 'Pinot Noir', valor: 'si' }]);
  });

  it('no pisa una decision ya cargada en el lote, ni por hace_fml ni por fml_excluida', () => {
    const lotes = [
      lote({ lote: '26007', hace_fml: 'no' }),
      lote({ lote: '26008', fml_excluida: 'si' }),
    ];
    const { cambios } = migrarDecisionesFml(lotes, { 26007: 'no', 26008: 'no' });

    expect(cambios).toEqual([]);
  });

  it('no toca las variedades blancas: la variedad ya las decide por config', () => {
    // Y si le hiciera caso a la hoja se romperia: el tablero le da precedencia a
    // la variedad blanca por sobre ESTADO_LOTE, asi que un Chardonnay con
    // fml_excluida='no' sigue sin hacer FML. Escribir hace_fml='si' lo flipearia.
    const lotes = [lote({ lote: '26100', variedad: 'Chardonnay' })];
    const { cambios, salteados } = migrarDecisionesFml(lotes, { 26100: 'no' });

    expect(cambios).toEqual([]);
    expect(salteados.blancas).toBe(1);
  });

  it('deja sin decision a los lotes en desconocido o sin fila en la hoja', () => {
    const lotes = [lote({ lote: '26007' }), lote({ lote: '26008' })];
    const { cambios, sinDecision } = migrarDecisionesFml(lotes, { 26007: 'desconocido' });

    expect(cambios).toEqual([]);
    expect(sinDecision).toEqual([
      { lote: '26007', variedad: 'Pinot Noir', motivo: 'desconocido' },
      { lote: '26008', variedad: 'Pinot Noir', motivo: 'sin_fila' },
    ]);
  });

  it('ignora los lotes vaciados: la decision solo importa en los activos', () => {
    const lotes = [lote({ lote: '26007', litros_actuales: 0 })];
    const { cambios, salteados } = migrarDecisionesFml(lotes, { 26007: 'no' });

    expect(cambios).toEqual([]);
    expect(salteados.inactivos).toBe(1);
  });

  it('correrla dos veces no propone nada la segunda', () => {
    const lotes = [lote({ lote: '26007' })];
    const uno = migrarDecisionesFml(lotes, { 26007: 'no' });

    for (const c of uno.cambios) lotes[c.indice].hace_fml = c.valor;
    const dos = migrarDecisionesFml(lotes, { 26007: 'no' });

    expect(uno.cambios).toHaveLength(1);
    expect(dos.cambios).toEqual([]);
  });

  it('empareja el numero de lote aunque la hoja lo traiga con espacios o como numero', () => {
    const lotes = [lote({ lote: ' 26007 ' }), lote({ lote: 26008 })];
    const { cambios } = migrarDecisionesFml(lotes, { ' 26007': 'no', 26008: 'no' });

    expect(cambios.map((c) => c.lote)).toEqual(['26007', '26008']);
  });
});
