import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('guía: imprimir con número', () => {
  const js = (env as any).ORDENES_GUIA_VISTA_JS as string;
  it('reusa guardar-ot de Lotes con la serie principal', () => {
    expect(js).toContain("from '../../lotes/js/guardar-ot.js'");
    expect(js).toMatch(/imprimirYGuardar\(\{[^}]*serie: 'principal'/);
    expect(js).toContain("'Guía de trabajos'");
  });
  it('fija el entorno de órdenes antes de usarlo', () => {
    expect(js).toContain('fijarEntornoOT(');
  });
  it('guarda la impresa en el servidor', () => {
    expect(js).toContain('/ordenes/api/guia/impresas');
  });
});
