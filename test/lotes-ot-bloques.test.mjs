/* Los pasos propios de una OT: copia perezosa de la plantilla, edicion de los
 * bloques de texto y vuelta a la plantilla. Modulos puros, sin DOM. */
import { describe, it, expect } from 'vitest';
import { bloquesDeOT, tieneTextosPropios, esEditable, editarTexto, insertarPaso,
         quitarBloque, volverAPlantilla, editarCelda, editarBanda,
         textoBanda } from '../public/lotes/js/ot-bloques.js';
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

describe('editarCelda (casilleros de tablas, ID y rotular: solo papel)', () => {
  it('la primera edicion copia la plantilla y anota la celda en su bloque', () => {
    const o = ot();
    expect(editarCelda(o, iTabla(), 3, 'Huevo Inox')).toBe(true);
    expect(tieneTextosPropios(o)).toBe(true);
    expect(o.bloques[iTabla()].celdas).toEqual({ 3: 'Huevo Inox' });
    expect(PL()[iTabla()].celdas).toBeUndefined();
  });
  it('el mismo texto no cambia nada', () => {
    const o = ot();
    editarCelda(o, iTabla(), 3, 'x');
    expect(editarCelda(o, iTabla(), 3, 'x')).toBe(false);
  });
  it('vaciar una celda queda anotado (sale en blanco en el papel)', () => {
    const o = ot();
    expect(editarCelda(o, iTabla(), 0, '')).toBe(true);
    expect(o.bloques[iTabla()].celdas[0]).toBe('');
  });
  it('no anota celdas en un paso de texto', () => {
    const o = ot();
    expect(editarCelda(o, 1, 0, 'x')).toBe(false);
    expect(tieneTextosPropios(o)).toBe(false);
  });
  it('la celda viaja con su bloque al insertar un paso arriba', () => {
    const o = ot();
    const i = iTabla();
    editarCelda(o, i, 2, '2500');
    insertarPaso(o, 0);
    expect(o.bloques[i + 1].celdas).toEqual({ 2: '2500' });
  });
  it('no toca los datos de la OT', () => {
    const o = ot({ lotes: [{ lote: '26273', litros_previstos: 2487 }] });
    editarCelda(o, iTabla(), 2, '9999');
    expect(o.lotes).toEqual([{ lote: '26273', litros_previstos: 2487 }]);
  });
});

describe('editarBanda (titulo de la hoja)', () => {
  it('anota solo la parte cambiada', () => {
    const o = ot();
    expect(editarBanda(o, 1, 'FIN FML 2')).toBe(true);
    expect(o.banda).toEqual({ 1: 'FIN FML 2' });
    expect(tieneTextosPropios(o)).toBe(true);
    expect(o.bloques).toBeUndefined();
  });
  it('textoBanda aplica lo escrito sobre lo calculado', () => {
    const o = ot({ banda: { 2: '26273 y 26274' } });
    expect(textoBanda(o, ['TRASIEGO', 'FIN FML', '26273'])).toEqual(['TRASIEGO', 'FIN FML', '26273 y 26274']);
    expect(textoBanda(ot(), ['A', 'B', 'C'])).toEqual(['A', 'B', 'C']);
  });
  it('parte fuera de rango no se anota', () => {
    expect(editarBanda(ot(), 3, 'x')).toBe(false);
  });
  it('volverAPlantilla borra tambien la banda y las celdas', () => {
    const o = ot();
    editarBanda(o, 0, 'X');
    editarCelda(o, iTabla(), 0, 'Y');
    expect(volverAPlantilla(o)).toBe(true);
    expect(o.banda).toBeUndefined();
    expect(o.bloques).toBeUndefined();
    expect(tieneTextosPropios(o)).toBe(false);
  });
});
