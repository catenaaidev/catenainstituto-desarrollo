/**
 * Los colores con significado de Barriles son los que el equipo lee de memoria
 * en la nave: el amarillo del destino y del modo por lote, el verde/rojo del
 * escáner, los marcos de la cámara, las píldoras LLENO/MERMO, las tarjetas del
 * Registro (que además salen impresas). La Etapa 3 de la estética cambia los
 * tokens de interfaz por los de Prensas: estos quedan con el valor de antes.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { reglasPlanas, cssDe } from '../scripts/css-reglas.mjs';
import { CON_SIGNIFICADO, PAPEL_BARRILES } from '../scripts/selectores-barriles.mjs';

const html = env.INDEX_HTML_BARRILES;

function raiz(h: string): Record<string, string> {
  const m = cssDe(h).match(/:root\s*\{([\s\S]*?)\}/);
  const out: Record<string, string> = {};
  for (const decl of (m ? m[1] : '').split(';')) {
    const i = decl.indexOf(':');
    if (i > 0 && decl.slice(0, i).trim().startsWith('--')) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim().toLowerCase();
  }
  return out;
}

const CONGELADOS: Record<string, string> = {
  '--sem-ok': '#2e7d32', '--sem-error': '#c62828', '--sem-warn': '#e65100',
  '--sem-vino': '#6b1f3a', '--sem-vino-osc': '#4a1428', '--sem-gris': '#e8e2da', '--sem-crema': '#faf6f0',
};

const TOKEN_DE_INTERFAZ = /var\(--(vino|vino-osc|gris|crema|ok|error|warn|bg|panel|panel2|line|rule|txt|muted|accent|accent2|nook|info)\)/;

describe('colores con significado de Barriles', () => {
  it('los tokens congelados tienen su valor de siempre', () => {
    const r = raiz(html);
    for (const [k, v] of Object.entries(CONGELADOS)) expect(r[k], k).toBe(v);
  });

  it('ninguna regla con significado ni de papel usa un token de interfaz', () => {
    const malas = reglasPlanas(html)
      .filter((r) => (CON_SIGNIFICADO.test(r.selector) || PAPEL_BARRILES.test(r.selector)) && TOKEN_DE_INTERFAZ.test(r.cuerpo))
      .map((r) => r.selector + '{' + r.cuerpo + '}');
    expect(malas).toEqual([]);
  });

  it('fuera de <style> (HTML y JS) los verdes, rojos y naranjas salen de --sem-*', () => {
    const sinEstilo = html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
    expect(sinEstilo.match(/var\(--(ok|error|warn)\)/g) || []).toEqual([]);
  });

  it('el papel fija la letra y el fondo de antes', () => {
    expect(cssDe(html).replace(/\s+/g, ' ')).toContain(
      "@media print { body { font-family: 'Segoe UI', Arial, sans-serif; background: var(--sem-crema); color: #2b2b2b; }");
  });
});
