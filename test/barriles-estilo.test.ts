/**
 * Barriles con el estilo de Prensas: carga shared/estilo.css, su :root deja
 * solo los colores con significado (--sem-*), y la interfaz no tiene colores
 * escritos a mano: todo sale de los tokens de Prensas. Así, el día que Prensas
 * retoque un color, Barriles lo sigue. Lo congelado y el papel no entran.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { cssDe, norm, reglasPlanas } from '../scripts/css-reglas.mjs';
import { CON_SIGNIFICADO, PAPEL_BARRILES } from '../scripts/selectores-barriles.mjs';

const html = env.INDEX_HTML_BARRILES;
const PERMITIDOS = new Set(['#fff', '#f3eee6']);   // letra sobre vino; el fondo del QR

function definidos(css: string): string[] {
  const m = css.match(/:root\s*\{([\s\S]*?)\}/);
  return (m ? m[1] : '').split(';').map((d) => d.slice(0, d.indexOf(':')).trim()).filter((k) => k.startsWith('--'));
}

describe('estilo de Barriles', () => {
  it('su :root solo tiene los colores con significado', () => {
    expect(definidos(cssDe(html)).sort()).toEqual(
      ['--sem-crema', '--sem-error', '--sem-gris', '--sem-ok', '--sem-vino', '--sem-vino-osc', '--sem-warn']);
  });

  it('nadie usa los tokens viejos de Barriles', () => {
    expect(html.match(/var\(--(vino|vino-osc|gris|crema|error)\)/g) || []).toEqual([]);
  });

  it('la interfaz no tiene colores escritos a mano', () => {
    // :root es donde se DEFINEN los --sem-*: ya lo vigila el test de arriba y
    // barriles-colores-congelados.test.ts; acá se audita el uso en reglas de interfaz.
    const malas = reglasPlanas(html)
      .filter((r) => r.selector !== ':root')
      .filter((r) => !CON_SIGNIFICADO.test(r.selector) && !PAPEL_BARRILES.test(r.selector))
      .flatMap((r) => (r.cuerpo.match(/#[0-9a-fA-F]{3,8}\b/g) || [])
        .filter((c) => !PERMITIDOS.has(c.toLowerCase()))
        .map((c) => r.selector + ' → ' + c));
    expect(malas).toEqual([]);
  });

  it('Plex en el cuerpo y Cormorant en los títulos', () => {
    const css = norm(cssDe(html));
    expect(css).toContain(norm('body { font-family: var(--sans); background: var(--bg); color: var(--txt);'));
    expect(css).toContain(norm('h2 { font-family: var(--serif);'));
  });

  it('el papel sigue fijado con la letra de antes', () => {
    expect(cssDe(html).replace(/\s+/g, ' ')).toContain("body { font-family: 'Segoe UI', Arial, sans-serif; background: var(--sem-crema);");
  });
});
