/**
 * El portal (public/index.html): tarjeta de Órdenes de trabajo, su figura de
 * puntos y el rol que le corresponde según prensas/lotes.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('portal: tarjeta Órdenes de trabajo', () => {
  const h = env.PORTAL_HTML;
  it('está en MODULOS con su forma de puntos', () => {
    expect(h).toMatch(/id: 'ordenes',\s*nombre: 'Órdenes de trabajo'/);
    expect(h).toContain("forma: 'orden'");
    expect(h).toMatch(/\n\s*orden\(\) \{/);
  });
  it('el rol de la tarjeta sale de prensas o lotes', () => {
    expect(h).toContain('function rolDe(m, modulos)');
  });
  it('la grilla tiene cuatro columnas', () => {
    expect(h).toContain('grid-template-columns:repeat(4,1fr)');
  });
});
