/**
 * Lotes no usa alert/confirm/prompt: frenan la pantalla, no se pueden diseñar
 * y en el celular se leen mal. Todo pasa por js/dialogos.js (que delega en
 * CI.* de shared/dialogo.js y solo cae a las nativas si ese script no cargó).
 *
 * PENDIENTES se vacía tarea a tarea (Etapa 2 de la estética).
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const PENDIENTES = new Set<string>([]);
const PERMITIDO = 'js/dialogos.js';

const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const NATIVA = /(?:^|[^\w$.])(?:alert|confirm|prompt)\s*\(|window\.(?:alert|confirm|prompt)\s*\(/m;

describe('Lotes sin ventanitas nativas', () => {
  it('ningún archivo (salvo los pendientes) llama a alert/confirm/prompt', () => {
    const conNativas = Object.entries(env.LOTES_JS)
      .filter(([f, src]) => f !== PERMITIDO && !PENDIENTES.has(f) && NATIVA.test(sinComentarios(src)))
      .map(([f]) => f);
    expect(conNativas).toEqual([]);
  });

  it('el overlay es un <dialog>', () => {
    expect(env.LOTES_HTML).toMatch(/<dialog id="overlay"[^>]*><div class="box" id="overlayBox"><\/div><\/dialog>/);
  });
});
