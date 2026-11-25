/* El filtro Todos | Llenos | Vacíos compartido recibe la definición de
 * "vacío" de cada módulo: Lotes mira litros_actuales, Prensas mira litros. */
import { describe, it, expect } from 'vitest';
import { pasaLlenado, MODOS_LLENADO, crearFiltroLlenado } from '../public/shared/filtro-llenado.js';

const vacioPorLitros = l => !!l && l.litros === 0;

describe('pasaLlenado compartido', () => {
  it('usa el predicado que se le pasa', () => {
    expect(pasaLlenado({ litros: 0 }, 'vacios', vacioPorLitros)).toBe(true);
    expect(pasaLlenado({ litros: 225 }, 'vacios', vacioPorLitros)).toBe(false);
    expect(pasaLlenado({ litros: 225 }, 'llenos', vacioPorLitros)).toBe(true);
    expect(pasaLlenado({ litros: 0 }, 'llenos', vacioPorLitros)).toBe(false);
  });
  it('todos y modos desconocidos muestran todo', () => {
    expect(pasaLlenado({ litros: 0 }, 'todos', vacioPorLitros)).toBe(true);
    expect(pasaLlenado({ litros: 0 }, 'cualquiera', vacioPorLitros)).toBe(true);
  });
  it('los modos son los tres de siempre', () => {
    expect(MODOS_LLENADO).toEqual(['todos', 'llenos', 'vacios']);
  });
});

/* crearFiltroLlenado SI toca el DOM (ver el comentario de lotes-vacios.test.mjs),
 * asi que este test nunca llega a correr en el navegador de verdad: lo que
 * prueba es que lee la clave guardada, no el control visual. Por eso arma el
 * `document` minimo que el modulo necesita en vez de uno real. */
describe('crearFiltroLlenado con clave (sobrevive al F5)', () => {
  const nodoFalso = () => ({
    dataset: {}, className: '', textContent: '', title: '',
    appendChild(){}, setAttribute(){}, addEventListener(){},
  });

  it('con CIWFiltros y la clave guardada en "llenos", arranca ahi', () => {
    globalThis.document = { createElement: () => nodoFalso() };
    globalThis.window = { CIWFiltros: { leer: () => 'llenos', guardar(){} } };
    try {
      const f = crearFiltroLlenado(() => {}, vacioPorLitros, 'ciw_filtros:lotes:lotes:llenado');
      expect(f.modo).toBe('llenos');
    } finally {
      delete globalThis.document;
      delete globalThis.window;
    }
  });

  it('sin clave arranca en "todos" aunque haya CIWFiltros', () => {
    globalThis.document = { createElement: () => nodoFalso() };
    globalThis.window = { CIWFiltros: { leer: () => 'llenos', guardar(){} } };
    try {
      const f = crearFiltroLlenado(() => {}, vacioPorLitros);
      expect(f.modo).toBe('todos');
    } finally {
      delete globalThis.document;
      delete globalThis.window;
    }
  });
});
