/**
 * Barriles no usa alert/confirm/prompt: frenan la pantalla (y la pistola), no
 * se pueden diseñar y en el celular se leen mal. Todo pasa por js/dialogos.js
 * (que delega en CI.* de shared/dialogo.js y solo cae a las nativas si ese
 * script no cargó).
 *
 * PENDIENTES_EN_INDEX baja tarea a tarea (Etapa 3 de la estética):
 * 69 → 64 (Task 6) → 27 (Task 7) → 0 (Task 8).
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const PENDIENTES_EN_INDEX = 0;
const PERMITIDO = 'js/dialogos.js';

const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const NATIVAS = /(?:^|[^\w$.])(?:alert|confirm|prompt)\s*\(|window\.(?:alert|confirm|prompt)\s*\(/gm;
const scripts = (html: string) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');

describe('Barriles sin ventanitas nativas', () => {
  it('en index.html quedan exactamente las pendientes', () => {
    expect((sinComentarios(scripts(env.INDEX_HTML_BARRILES)).match(NATIVAS) || []).length).toBe(PENDIENTES_EN_INDEX);
  });

  it('ningún archivo de js/ (salvo dialogos.js) llama a alert/confirm/prompt', () => {
    const con = Object.entries(env.BARRILES_JS)
      .filter(([f, src]) => f !== PERMITIDO && (sinComentarios(src).match(NATIVAS) || []).length > 0)
      .map(([f]) => f);
    expect(con).toEqual([]);
  });

  it('dialogos.js se carga antes del script principal', () => {
    const html = env.INDEX_HTML_BARRILES;
    const i = html.indexOf('<script src="js/dialogos.js"></script>');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(html.search(/<script>\r?\n'use strict';/));
  });
});
