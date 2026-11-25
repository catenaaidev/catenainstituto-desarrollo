/**
 * public/shared/estilo.css tiene que llevar los MISMOS tokens que Prensas: es la
 * copia que usan Lotes, Barriles y admin para verse como Prensas. Si alguien
 * retoca un color en uno solo de los dos lados, este test lo frena.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function tokens(css: string): Record<string, string> {
  const m = css.match(/:root\s*\{([\s\S]*?)\}/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const decl of m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const k = decl.slice(0, i).trim();
    if (k.startsWith('--')) out[k] = decl.slice(i + 1).trim().replace(/\s+/g, ' ').toLowerCase();
  }
  return out;
}

describe('estilo.css', () => {
  it('existe', () => {
    expect(env.ESTILO_CSS.length).toBeGreaterThan(0);
  });

  it('tiene todos los tokens de Prensas con el mismo valor', () => {
    const prensas = tokens(env.PRENSAS_HTML);
    const comun = tokens(env.ESTILO_CSS);
    expect(Object.keys(prensas).length).toBeGreaterThanOrEqual(19);
    for (const [k, v] of Object.entries(prensas)) {
      expect(comun[k], `token ${k}`).toBe(v);
    }
  });

  it('no estiliza etiquetas sueltas (solo :root y clases ci-*)', () => {
    const sinComentarios = env.ESTILO_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const etiqueta = /(^|[{},])\s*(html|body|table|th|td|tr|select|input|button|textarea|a|h1|h2|h3|p|label)\s*[{,:]/m;
    expect(sinComentarios).not.toMatch(etiqueta);
  });

  it('carga las letras desde /prensas/fonts', () => {
    expect(env.ESTILO_CSS).toContain("url('/prensas/fonts/cormorant-garamond-latin-500-normal.woff2')");
    expect(env.ESTILO_CSS).toContain("url('/prensas/fonts/ibm-plex-sans-latin-400-normal.woff2')");
  });
});
