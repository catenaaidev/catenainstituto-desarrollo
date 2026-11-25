import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('órdenes de papel reusables fuera de Lotes', () => {
  it('guardar-ot y vista-orden-guardada no importan nucleo.js', () => {
    for (const f of ['js/guardar-ot.js', 'js/vista-orden-guardada.js'])
      expect(env.LOTES_JS[f]).not.toMatch(/from '\.\/nucleo\.js'/);
  });
  it('nucleo.js fija el entorno de Lotes', () => {
    const n = env.LOTES_JS['js/nucleo.js'];
    expect(n).toContain('fijarEntornoOT(');
    expect(n).toContain("eventoModo: 'lotes:modo-orden-cambio'");
  });
  it('hoja-pdf carga las librerías con ruta absoluta (sirve desde /prensas/)', () => {
    expect(env.LOTES_JS['js/hoja-pdf.js']).toContain("'/lotes/js/vendor/html2canvas.min.js'");
    expect(env.LOTES_JS['js/hoja-pdf.js']).toContain("'/lotes/js/vendor/jspdf.umd.min.js'");
  });
});
