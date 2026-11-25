/**
 * Lotes con el estilo de Prensas: carga shared/estilo.css (tokens y letras) y
 * NO redefine ninguno de esos tokens en su :root, así el día que Prensas
 * retoque un color, Lotes lo sigue. El bloque de "renovación visual" (sombras,
 * radios de 7 a 16 px, píldoras redondas) desaparece.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { cssDe } from '../scripts/css-reglas.mjs';

const html = env.LOTES_HTML;
const PRENSAS = ['--bg', '--panel', '--panel2', '--line', '--rule', '--txt', '--muted', '--accent', '--accent2',
  '--ok', '--nook', '--warn', '--info', '--ok-tinte', '--nook-tinte', '--warn-tinte', '--accent-tinte', '--serif', '--sans'];

function definidos(css: string): string[] {
  const m = css.match(/:root\s*\{([\s\S]*?)\}/);
  return (m ? m[1] : '').split(';').map((d) => d.slice(0, d.indexOf(':')).trim()).filter((k) => k.startsWith('--'));
}

describe('estilo de Lotes', () => {
  it('carga estilo.css antes de su propio <style>', () => {
    const i = html.indexOf('<link rel="stylesheet" href="/shared/estilo.css">');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(html.indexOf('<style>'));
  });

  it('no redefine los tokens de Prensas', () => {
    const propios = definidos(cssDe(html));
    for (const k of PRENSAS) expect(propios, k).not.toContain(k);
  });

  it('sin el bloque de renovación ni radios redondos', () => {
    expect(html).not.toContain('RENOVACION VISUAL');
    const css = cssDe(html);
    expect(css).toMatch(/--r-sm:2px;\s*--r-md:2px;\s*--r-lg:2px;\s*--r-pill:2px/);
    expect(css).toMatch(/--sh-xs:none;\s*--sh-sm:none;\s*--sh-md:none;\s*--sh-lg:none/);
    // El vino viejo (138,51,64) solo queda en el token congelado.
    expect((css.match(/138,51,64/g) || []).length).toBe(1);
  });

  it('en modo órdenes (.otl.unica) la hoja de la OT ocupa todo el ancho', () => {
    const css = cssDe(html);
    expect(css).toMatch(/\.otl\.unica\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*\}/);
  });
});
