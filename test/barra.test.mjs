/**
 * La barra común (public/shared/barra.js). Se testea el HTML que arma; el
 * montaje en la página necesita DOM y se verifica en el navegador.
 */
import { describe, it, expect } from 'vitest';
import '../public/shared/barra.js';

const html = (ctx) => globalThis.CIBarra.html(ctx);

describe('barra común', () => {
  const ctx = { modulo: 'lotes', modulos: { lotes: 'editor', prensas: 'lector' }, nombre: 'Ana <x>', rol: 'editor' };

  it('marca el módulo actual con aria-current y no lo enlaza', () => {
    const h = html(ctx);
    expect(h).toContain('<span class="aqui" aria-current="page">Lotes</span>');
    expect(h).not.toContain('href="/lotes/"');
  });
  it('solo ofrece los módulos con rol', () => {
    const h = html(ctx);
    expect(h).toContain('href="/prensas/"');
    expect(h).not.toContain('href="/barriles/"');
  });
  it('escapa el nombre', () => {
    expect(html(ctx)).toContain('Ana &lt;x&gt;');
  });
  it('Reporte solo en prensas y lotes', () => {
    expect(html(ctx)).toContain('/lotes/reporte');
    expect(html({ ...ctx, modulo: 'barriles' })).not.toContain('reporte');
  });
  it('trae el menú de cuenta para el celular, con Contraseña y Salir', () => {
    const h = html(ctx);
    expect(h).toContain('class="cuenta-btn"');
    expect(h).toContain('aria-expanded="false"');
    expect((h.match(/href="\/api\/auth\/logout"/g) || []).length).toBe(2);   // ancho y celular
  });
  it('Reporte en la barra y en el menú móvil para lotes', () => {
    const h = html(ctx);
    const matches = (h.match(/href="\/lotes\/reporte"/g) || []);
    expect(matches.length).toBe(2);  // una en la barra, otra en el menú
  });
  it('Reporte no aparece en barriles ni en la barra ni en el menú', () => {
    const h = html({ ...ctx, modulo: 'barriles' });
    expect((h.match(/href=".*reporte"/g) || []).length).toBe(0);
  });
  it('ofrece Órdenes si hay rol en prensas o lotes', () => {
    expect(html(ctx)).toContain('href="/ordenes/"');
    expect(html({ ...ctx, modulos: { barriles: 'editor' } })).not.toContain('href="/ordenes/"');
  });
  it('en /ordenes/ marca Órdenes como actual y no muestra Reporte', () => {
    const h = html({ ...ctx, modulo: 'ordenes' });
    expect(h).toContain('<span class="aqui" aria-current="page">Órdenes de trabajo</span>');
    expect(h).not.toContain('/reporte');
  });
  /* /lotes/?orden=… o /prensas/?orden=…: se está trabajando en una orden, la
   * barra marca Órdenes (no el módulo que la dibuja). */
  it('en una orden marca Órdenes y deja el módulo como enlace', () => {
    const h = html({ ...ctx, enOrden: true });
    expect(h).toContain('<span class="aqui" aria-current="page">Órdenes de trabajo</span>');
    expect(h).toContain('href="/lotes/"');
    expect(h).not.toContain('<span class="aqui" aria-current="page">Lotes</span>');
    expect(h).not.toContain('href="/ordenes/"');
  });
});
