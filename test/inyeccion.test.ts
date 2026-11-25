/**
 * Lo que el Worker mete en el <head> de cada pantalla de módulo. El orden
 * importa: fusion.js usa CI.confirmar, así que dialogo.js tiene que estar antes.
 */
import { describe, it, expect } from 'vitest';
import { armarInyeccion } from '../src/index';

const ctx = { email: 'ana@catenawines.com', nombre: 'Ana', rol: 'editor', modulo: 'lotes', modulos: { lotes: 'editor' } };

describe('armarInyeccion', () => {
  for (const modulo of ['prensas', 'lotes', 'barriles']) {
    it(`en ${modulo}: modelo → dialogo → fusion, y la barra al final`, () => {
      const h = armarInyeccion({ ...ctx, modulo }, 'Ana', modulo);
      const iModelo = h.indexOf('<script src="/shared/dialogo-modelo.js"></script>');
      const iDialogo = h.indexOf('<script src="/shared/dialogo.js"></script>');
      const iFusion = h.indexOf('<script src="/shared/fusion.js"></script>');
      const iBarra = h.indexOf('<script defer src="/shared/barra.js"></script>');
      expect(iModelo).toBeGreaterThan(-1);
      expect(iDialogo).toBeGreaterThan(iModelo);
      expect(iFusion).toBeGreaterThan(iDialogo);
      expect(iBarra).toBeGreaterThan(iFusion);
      expect(h.endsWith('</head>')).toBe(true);
    });
  }
  for (const modulo of ['prensas', 'lotes', 'barriles']) {
    it(`en ${modulo}: la pantalla en la URL, sin defer (la app la lee al arrancar)`, () => {
      expect(armarInyeccion({ ...ctx, modulo }, 'Ana', modulo)).toContain('<script src="/shared/pantalla-url.js"></script>');
    });
  }
  for (const modulo of ['prensas', 'lotes', 'barriles']) {
    it(`en ${modulo}: filtros de la sesión, sin defer y antes de la app`, () => {
      expect(armarInyeccion({ ...ctx, modulo }, 'Ana', modulo)).toContain('<script src="/shared/filtros-sesion.js"></script>');
    });
  }
  it('el Excel solo en prensas y lotes', () => {
    expect(armarInyeccion(ctx, 'Ana', 'lotes')).toContain('/shared/exportar.js');
    expect(armarInyeccion({ ...ctx, modulo: 'barriles' }, 'Ana', 'barriles')).not.toContain('/shared/exportar.js');
  });
  it('no inyecta estilo.css todavía (Lotes y Barriles tienen su :root propio)', () => {
    expect(armarInyeccion(ctx, 'Ana', 'lotes')).not.toContain('estilo.css');
  });
  it('en ordenes: diálogo y barra, sin el Excel', () => {
    const h = armarInyeccion({ ...ctx, modulo: 'ordenes' }, 'Ana', 'ordenes');
    expect(h).toContain('<script src="/shared/dialogo.js"></script>');
    expect(h).toContain('<script defer src="/shared/barra.js"></script>');
    expect(h).not.toContain('/shared/exportar.js');
  });
});
