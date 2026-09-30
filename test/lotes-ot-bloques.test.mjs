/* Los pasos propios de una OT: copia perezosa de la plantilla, edicion de los
 * bloques de texto y vuelta a la plantilla. Modulos puros, sin DOM. */
import { describe, it, expect } from 'vitest';
import { bloquesDeOT, tieneTextosPropios, esEditable, editarTexto, insertarPaso,
         quitarBloque, volverAPlantilla } from '../public/lotes/js/ot-bloques.js';
import { plantillaPorId } from '../public/lotes/js/ot-plantillas.js';

const ot = (extra) => ({ id: 'ot-x', ot: 'OT-2026-001', plantilla: 'barricas-barricas',
  estado: 'pendiente', lotes: [], ...(extra || {}) });
const PL = () => plantillaPorId('barricas-barricas').bloques;
const iTabla = () => PL().findIndex(b => b.tipo === 'tabla-vaciado');

describe('bloquesDeOT', () => {
  it('sin textos propios devuelve los de la plantilla', () => {
    expect(bloquesDeOT(ot())).toBe(PL());
    expect(tieneTextosPropios(ot())).toBe(false);
  });
  it('plantilla desconocida da lista vacia', () => {
    expect(bloquesDeOT(ot({ plantilla: 'no-existe' }))).toEqual([]);
  });
  it('con textos propios devuelve los de la OT', () => {
    const o = ot({ bloques: [{ tipo: 'paso', texto: 'solo esto' }] });
    expect(bloquesDeOT(o)).toEqual([{ tipo: 'paso', texto: 'solo esto' }]);
  });
});

describe('editarTexto', () => {
  it('la primera edicion copia la plantilla y no la toca', () => {
    const original = PL()[1].texto;
    const o = ot();
    expect(editarTexto(o, 1, 'Sanitizar todo')).toBe(true);
    expect(tieneTextosPropios(o)).toBe(true);
    expect(o.bloques[1].texto).toBe('Sanitizar todo');
    expect(o.bloques.length).toBe(PL().length);
    expect(PL()[1].texto).toBe(original);
  });
  it('conserva las marcas del bloque (ok, destaca)', () => {
    const o = ot();
    editarTexto(o, 0, 'Buscar barriles');
    expect(o.bloques[0].ok).toBe(true);
  });
  it('el mismo texto no cambia nada ni crea la copia', () => {
    const o = ot();
    expect(editarTexto(o, 1, PL()[1].texto)).toBe(false);
    expect(tieneTextosPropios(o)).toBe(false);
  });
  it('no edita una tabla', () => {
    const o = ot();
    expect(editarTexto(o, iTabla(), 'x')).toBe(false);
    expect(tieneTextosPropios(o)).toBe(false);
  });
});

describe('insertarPaso y quitarBloque', () => {
  it('inserta un paso vacio debajo y devuelve su indice', () => {
    const o = ot();
    expect(insertarPaso(o, 2)).toBe(3);
    expect(o.bloques[3]).toEqual({ tipo: 'paso', texto: '' });
    expect(o.bloques.length).toBe(PL().length + 1);
  });
  it('inserta debajo de una tabla', () => {
    const o = ot();
    const j = insertarPaso(o, iTabla());
    expect(o.bloques[j - 1].tipo).toBe('tabla-vaciado');
  });
  it('quita un paso', () => {
    const o = ot();
    const segundo = PL()[2].texto;
    expect(quitarBloque(o, 1)).toBe(true);
    expect(o.bloques[1].texto).toBe(segundo);
    expect(PL().length).toBe(o.bloques.length + 1);
  });
  it('no quita una tabla', () => {
    const o = ot();
    expect(quitarBloque(o, iTabla())).toBe(false);
    expect(tieneTextosPropios(o)).toBe(false);
  });
});

describe('volverAPlantilla y esEditable', () => {
  it('borra la copia', () => {
    const o = ot();
    editarTexto(o, 1, 'x');
    expect(volverAPlantilla(o)).toBe(true);
    expect(tieneTextosPropios(o)).toBe(false);
    expect(volverAPlantilla(o)).toBe(false);
  });
  it('pendiente se edita, ejecutada no', () => {
    expect(esEditable(ot())).toBe(true);
    expect(esEditable(ot({ estado: 'ejecutado' }))).toBe(false);
    expect(esEditable(ot({ plantilla: 'no-existe' }))).toBe(false);
  });
});
