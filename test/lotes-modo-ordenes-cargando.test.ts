/**
 * Modo órdenes (/lotes/?orden=…): hasta que app.js abre la orden, las
 * pestañas y las vistas no se ven (si no, el Panel aparece ~2 s antes). La
 * clase la pone un script del <head> (tiene que correr antes del primer
 * pintado) y la regla que esconde es de pantalla, no de impresión.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { cssDe } from '../scripts/css-reglas.mjs';

const html = env.LOTES_HTML;

describe('Lotes: modo órdenes mientras carga', () => {
  it('un script del <head> pone la clase solo si la URL trae ?orden=', () => {
    const head = html.slice(0, html.indexOf('</head>'));
    const m = head.match(/<script>([\s\S]*?)<\/script>/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("get('orden')");
    expect(m![1]).toContain("classList.add('modo-ordenes-cargando')");
  });
  it('la clase esconde pestañas y vistas, fuera de cualquier @media print', () => {
    const css = cssDe(html);
    expect(css).toContain('html.modo-ordenes-cargando #tabs,html.modo-ordenes-cargando .view{visibility:hidden}');
    const i = css.indexOf('html.modo-ordenes-cargando');
    const antes = css.slice(0, i);
    // La última @media abierta antes de la regla no es de impresión (o ya se cerró).
    const ultimaPrint = antes.lastIndexOf('@media print');
    if (ultimaPrint >= 0) {
      const tramo = antes.slice(ultimaPrint);
      expect((tramo.match(/\{/g) || []).length).toBe((tramo.match(/\}/g) || []).length);
    }
  });
});
