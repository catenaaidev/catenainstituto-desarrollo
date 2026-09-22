/* Tests de esOrganico(): el criterio que pinta la fila verde en la pestana Lotes.
 *
 * envases.js es un modulo puro (sin DOM ni fetch), asi que se importa tal cual
 * dentro del runtime de Workers, igual que hacen lotes-vacios.test.mjs y
 * lotes-anchos.test.mjs.
 *
 * Por que hay un test para una comparacion de string: es la UNICA definicion de
 * "lote organico" de la pestana, y de ella depende un color que la gente usa
 * para leer la tabla de un vistazo. Si deja de matchear, la fila no se pinta y
 * NO hay ningun error: el lote simplemente se ve convencional. Un fallo mudo de
 * ese tipo es exactamente lo que un test barato tiene que cazar.
 *
 * Medido sobre el respaldo de produccion respaldo-nube-lotes-2026-09-22-pre-fml
 * el 2026-09-22: de 304 lotes, 92 son 'Organico' (con tilde), 211
 * 'Convencional' y 1 tiene el campo en ''. No hay ninguna otra variante, asi
 * que la comparacion exacta alcanzaria; la tolerancia que se testea abajo es
 * para que un dato que entre torcido por el Excel no apague el color en
 * silencio.
 */
import { describe, it, expect } from 'vitest';
import { esOrganico } from '../public/lotes/js/envases.js';

describe('esOrganico', () => {
  it('reconoce el valor tal como esta guardado en produccion', () => {
    // Los 92 lotes organicos reales tienen exactamente este string.
    expect(esOrganico({ organico_convencional: 'Orgánico' })).toBe(true);
  });

  it('dice que no es organico el convencional', () => {
    expect(esOrganico({ organico_convencional: 'Convencional' })).toBe(false);
  });

  it('dice que no es organico el lote con el campo sin cargar', () => {
    // El lote 1 de produccion tiene '' en este campo; null y undefined salen de
    // agregarLote(), que arranca las columnas de texto en ''.
    expect(esOrganico({ organico_convencional: '' })).toBe(false);
    expect(esOrganico({ organico_convencional: null })).toBe(false);
    expect(esOrganico({})).toBe(false);
    expect(esOrganico(null)).toBe(false);
    expect(esOrganico(undefined)).toBe(false);
  });

  it('tolera mayusculas, espacios y la falta de tilde', () => {
    // El <select> de la columna solo ofrece 'Organico' con tilde y escribirCelda
    // canonicaliza lo que se pega, asi que estas formas no deberian existir. Se
    // aceptan igual porque el campo tambien lo escribio una migracion de Excel:
    // ahi no hubo ningun <select> que lo forzara.
    expect(esOrganico({ organico_convencional: 'orgánico' })).toBe(true);
    expect(esOrganico({ organico_convencional: 'ORGÁNICO' })).toBe(true);
    expect(esOrganico({ organico_convencional: '  Orgánico  ' })).toBe(true);
    expect(esOrganico({ organico_convencional: 'Organico' })).toBe(true);
    expect(esOrganico({ organico_convencional: 'organico' })).toBe(true);
  });

  it('no se contagia de un valor que apenas se parece', () => {
    // 'Organico' tiene que ser el valor entero, no una subcadena: si alguien
    // carga una nota en la columna no se convierte en organico por nombrarlo.
    expect(esOrganico({ organico_convencional: 'No organico' })).toBe(false);
    expect(esOrganico({ organico_convencional: 'Organico?' })).toBe(false);
    expect(esOrganico({ organico_convencional: 'en transicion a organico' })).toBe(false);
  });

  it('no explota con un valor que no es texto', () => {
    // Mismo criterio indulgente que numPositivo: un dato raro venido del Excel
    // no tiene que romper el render de la tabla entera.
    expect(esOrganico({ organico_convencional: 42 })).toBe(false);
    expect(esOrganico({ organico_convencional: {} })).toBe(false);
    expect(esOrganico({ organico_convencional: [] })).toBe(false);
  });
});
