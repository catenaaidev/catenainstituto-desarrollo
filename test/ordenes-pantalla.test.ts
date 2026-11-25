// test/ordenes-pantalla.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('public/ordenes/index.html', () => {
  const h = env.ORDENES_HTML;
  it('usa el estilo común y su app como módulo', () => {
    expect(h).toContain('<link rel="stylesheet" href="/shared/estilo.css">');
    expect(h).toContain('<script type="module" src="/ordenes/js/app.js"></script>');
  });
  it('tiene título y lang', () => {
    expect(h).toContain('<html lang="es">');
    expect(h).toContain('<title>Órdenes de trabajo</title>');
  });
  it('no usa alert/confirm/prompt', () => {
    expect(h).not.toMatch(/\b(confirm|alert|prompt)\(/);
  });
});

describe('public/ordenes/js/app.js', () => {
  it('la etiqueta de módulo no queda solo en Pendientes', () => {
    const a = env.ORDENES_JS['js/app.js'];
    expect(a).toContain('conEtiquetaModulo(filas, modulosConRol())');
    expect(a).not.toMatch(/conMod = v === 'pendientes'/);
  });
});

describe('Guía de trabajos en la página', () => {
  const a = () => env.ORDENES_JS['js/app.js'];
  it('app.js monta la guía y la ofrece en la portada y en la sub-nav', () => {
    expect(a()).toContain("import { montarGuia } from './guia-vista.js'");
    expect(a()).toContain("['guia', 'Guía de trabajos']");
    expect(a()).toMatch(/_estado\.v === 'guia'\) return montarGuia\(/);
  });
  it('guia-vista no usa alert/confirm/prompt y guarda al salir del texto', () => {
    const g = env.ORDENES_JS['js/guia-vista.js'];
    expect(g).toBeTruthy();
    expect(g).not.toMatch(/\b(confirm|alert|prompt)\(/);
    expect(g).toContain('focusout');
  });
  it('index.html: estilos de la guía, controles fuera del papel y precarga', () => {
    const h = env.ORDENES_HTML;
    expect(h).toContain('.gt-hoja');
    expect(h).toMatch(/@media print\{[^}]*\.gt-ctl/);
    expect(h).toContain('<link rel="modulepreload" href="/ordenes/js/guia-vista.js">');
  });
  it('guia-vista.js usa un wrapper propio (gt-vista) y no cuelga listeners en #ordCuerpo directo', () => {
    const g = env.ORDENES_JS['js/guia-vista.js'];
    expect(g).toContain('gt-vista');
    expect(g).not.toMatch(/cuerpo\.addEventListener/);
  });
  it('.gt-orden solo apunta al enlace, no a la fila gt-r.gt-orden (si no, aparece una columna fantasma)', () => {
    const h = env.ORDENES_HTML;
    expect(h).not.toMatch(/[^a]\.gt-orden::before/);
    expect(h).toContain('a.gt-orden::before');
  });
  it('"/" o Ctrl+K dentro de la guía (contenteditable) no saltan a Nueva orden', () => {
    const a = env.ORDENES_JS['js/app.js'];
    expect(a).toContain('document.activeElement?.isContentEditable');
  });
  it('la grilla móvil de la guía (.gt-r) vive bajo @media screen, no se cuela al imprimir', () => {
    const h = env.ORDENES_HTML;
    expect(h).toMatch(/@media screen and \(max-width:760px\)\{[^]*?\.gt-r\{display:grid/);
    // No debe quedar un @media (max-width:760px) viejo, sin "screen", con estas reglas.
    expect(h).not.toMatch(/@media \(max-width:760px\)\{/);
  });
  it('guia-vista.js no roba el foco del texto al hacer click en un botón de control, y repinta via el click', () => {
    const g = env.ORDENES_JS['js/guia-vista.js'];
    expect(g).toContain('relatedTarget');
  });
  it('el click en un botón de control saca el foco del texto ANTES de aplicar el op (si no, la hoja no se repinta)', () => {
    const g = env.ORDENES_JS['js/guia-vista.js'];
    expect(g).toMatch(/activo\?\.isContentEditable[\s\S]*?activo\.blur\(\)/);
  });
});
