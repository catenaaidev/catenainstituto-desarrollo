/* Tests del modulo de anchos de columna de la pestana Lotes.
 *
 * Solo se importan las funciones PURAS de anchos-cols.js: normalizar el mapa
 * que viene del localStorage, generar el CSS y calcular el autoajuste. La parte
 * que toca el DOM (activarAnchos) no se importa aca porque el runtime de
 * Workers no tiene document; la garantia de que el modulo se puede importar sin
 * DOM la da justamente este archivo.
 */
import { describe, it, expect } from 'vitest';
import { MIN_ANCHO, MAX_ANCHO, normalizarAnchos, cssDeAnchos,
         anchoAutoajustado } from '../public/lotes/js/anchos-cols.js';

describe('normalizarAnchos', () => {
  it('devuelve un mapa vacio para todo lo que no sea un objeto', () => {
    for (const basura of [null, undefined, 42, 'ancho', [180], true])
      expect(normalizarAnchos(basura)).toEqual({});
  });

  it('conserva los anchos validos redondeados a entero', () => {
    expect(normalizarAnchos({ vinedo: 210, id_texto: 180.6 }))
      .toEqual({ vinedo: 210, id_texto: 181 });
  });

  it('acota los anchos fuera de rango en lugar de descartarlos', () => {
    // Un ancho guardado de 5px dejaria la columna ilegible y sin agarre para
    // volver a agrandarla: se sube al minimo, no se tira.
    expect(normalizarAnchos({ lote: 5, ct: 9000 }))
      .toEqual({ lote: MIN_ANCHO, ct: MAX_ANCHO });
  });

  it('descarta los valores que no son numeros usables', () => {
    expect(normalizarAnchos({ a: NaN, b: Infinity, c: '210', d: null, e: 0, f: -30 }))
      .toEqual({});
  });

  it('descarta las claves que no son nombres de columna', () => {
    // El mapa sale del localStorage, que cualquiera puede editar a mano. Una
    // clave con comillas o llaves se colaria al CSS generado.
    expect(normalizarAnchos({ 'x"]{color:red}': 200, '': 200, 'con espacio': 200 }))
      .toEqual({});
    expect(normalizarAnchos({ litros_actuales: 120 })).toEqual({ litros_actuales: 120 });
  });
});

describe('cssDeAnchos', () => {
  it('no genera nada si no hay ningun ancho guardado', () => {
    expect(cssDeAnchos({})).toBe('');
    expect(cssDeAnchos(null)).toBe('');
  });

  it('fija el ancho de la columna por las tres propiedades', () => {
    // width sola no alcanza en una tabla de layout automatico: el navegador la
    // trata como sugerencia y la estira si el contenido no entra.
    const css = cssDeAnchos({ vinedo: 210 });
    expect(css).toContain('#tLotes th[data-k="vinedo"]');
    expect(css).toContain('#tLotes td[data-k="vinedo"]');
    expect(css).toContain('width:210px');
    expect(css).toContain('min-width:210px');
    expect(css).toContain('max-width:210px');
  });

  it('libera el piso de 60px del input para que la columna pueda angostarse', () => {
    // td input.cell tiene min-width:60px en index.html; sin pisarlo una columna
    // no baja de ahi por mas que se arrastre el agarre.
    const css = cssDeAnchos({ ct: 50 });
    expect(css).toMatch(/#tLotes td\[data-k="ct"\][^{]*input\.cell/);
    expect(css).toContain('min-width:0');
  });

  it('genera una regla por columna', () => {
    const css = cssDeAnchos({ vinedo: 210, clon: 90 });
    expect(css).toContain('data-k="vinedo"');
    expect(css).toContain('data-k="clon"');
  });

  it('normaliza lo que recibe antes de escribir el CSS', () => {
    const css = cssDeAnchos({ vinedo: 9000, 'x"]{color:red}': 200 });
    expect(css).toContain(`width:${MAX_ANCHO}px`);
    expect(css).not.toContain('color:red');
  });
});

describe('anchoAutoajustado', () => {
  // Medidor de mentira: 10px por caracter, asi el ancho esperado se lee solo.
  const medir = t => t.length * 10;

  it('toma el texto mas largo de la columna y le suma el padding', () => {
    expect(anchoAutoajustado(['ab', 'abcd', 'a'], medir, 20)).toBe(60);
  });

  it('incluye el label del encabezado, no solo las celdas', () => {
    // El label suele ser el texto mas largo ('Orgánico / Convencional').
    expect(anchoAutoajustado(['Viñedo largisimo', 'x'], medir, 0)).toBe(160);
  });

  it('nunca devuelve menos que el minimo ni mas que el maximo', () => {
    expect(anchoAutoajustado([''], medir, 0)).toBe(MIN_ANCHO);
    expect(anchoAutoajustado(['x'.repeat(500)], medir, 0)).toBe(MAX_ANCHO);
  });

  it('sobrevive a una columna sin ningun texto', () => {
    expect(anchoAutoajustado([], medir, 20)).toBe(MIN_ANCHO);
    expect(anchoAutoajustado(null, medir, 20)).toBe(MIN_ANCHO);
  });

  it('ignora los textos nulos en lugar de romper', () => {
    expect(anchoAutoajustado(['abcdefgh', null, undefined], medir, 0)).toBe(80);
  });
});
