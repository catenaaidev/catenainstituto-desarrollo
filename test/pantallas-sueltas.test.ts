/**
 * admin.html y cambiar-clave.html: las reglas de la estética unificada que
 * tienen que seguir cumplidas en los archivos reales.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('admin.html', () => {
  const h = env.ADMIN_HTML;
  it('usa el estilo común', () => {
    expect(h).toContain('<link rel="stylesheet" href="/shared/estilo.css">');
  });
  it('carga el diálogo propio y no usa confirm/alert/prompt', () => {
    expect(h).toContain('<script src="/shared/dialogo-modelo.js"></script>');
    expect(h).toContain('<script src="/shared/dialogo.js"></script>');
    expect(h).not.toMatch(/\b(confirm|alert|prompt)\(/);
  });
  it('ya no usa las letras viejas', () => {
    expect(h).not.toMatch(/Fraunces|Hanken/);
  });
  it('agrupa el acceso por módulo en un fieldset', () => {
    expect(h).toMatch(/<fieldset class="ci-campo">\s*<legend>Acceso a cada módulo<\/legend>/);
  });
});

describe('cambiar-clave.html', () => {
  const h = env.CAMBIAR_CLAVE_HTML;
  it('usa las letras del login', () => {
    expect(h).toContain("font-family:'Instrument Serif'");
    expect(h).toContain("font-family:'IBM Plex Sans'");
    expect(h).not.toMatch(/Fraunces|Hanken/);
  });
  it('anuncia el error al lector de pantalla', () => {
    expect(h).toMatch(/id="error"[^>]*role="alert"|role="alert"[^>]*id="error"/);
  });
  it('mantiene los autocompletar de contraseña', () => {
    expect(h).toContain('autocomplete="current-password"');
    expect((h.match(/autocomplete="new-password"/g) || []).length).toBe(2);
  });
});
