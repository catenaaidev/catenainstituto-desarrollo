import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

/**
 * /ordenes/ se sirve con `servirOrdenes` (chequea sesión/rol e inyecta
 * window.CIW + scripts compartidos), igual que /prensas, /barriles y /lotes.
 * Pero run_worker_first es la lista que decide si una ruta pasa por el Worker
 * ANTES de llegar al CDN de assets: si /ordenes no está ahí, en producción el
 * CDN serviría public/ordenes/index.html directo, sin login y sin window.CIW.
 * Este test vigila que las dos copias (wrangler.jsonc y wrangler.dev.jsonc,
 * que deben estar siempre replicadas) tengan las cuatro entradas de /ordenes
 * DENTRO de assets.run_worker_first (no en un comentario ni en otra lista).
 */

/** JSONC → JSON: saca comentarios de línea y de bloque (respetando los
 * strings, que traen cosas como "/api/*") y las comas finales antes de } o ]. */
function jsoncAJson(txt: string): string {
  let out = '';
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (c === '"') {
      // Un string entero, con sus escapes, tal cual.
      let j = i + 1;
      while (j < txt.length && txt[j] !== '"') j += txt[j] === '\\' ? 2 : 1;
      out += txt.slice(i, j + 1);
      i = j;
    } else if (c === '/' && txt[i + 1] === '/') {
      while (i < txt.length && txt[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && txt[i + 1] === '*') {
      const fin = txt.indexOf('*/', i + 2);
      i = fin < 0 ? txt.length : fin + 1;
    } else {
      out += c;
    }
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

const RUTAS = ['/ordenes/api/*', '/ordenes', '/ordenes/', '/ordenes/index.html'];

describe('jsoncAJson', () => {
  it('saca comentarios sin tocar los strings con /* o //, y las comas finales', () => {
    const j = JSON.parse(jsoncAJson('{\n // hola\n "a": ["/api/*", "http://x"], /* chau */\n "b": 1,\n}'));
    expect(j).toEqual({ a: ['/api/*', 'http://x'], b: 1 });
  });
});

describe('run_worker_first incluye /ordenes', () => {
  it.each([
    ['wrangler.jsonc', () => env.WRANGLER_JSONC],
    ['wrangler.dev.jsonc', () => env.WRANGLER_DEV_JSONC],
  ])('%s', (_nombre, leer) => {
    const cfg = JSON.parse(jsoncAJson(leer())) as { assets?: { run_worker_first?: string[] } };
    const lista = cfg.assets?.run_worker_first;
    expect(Array.isArray(lista)).toBe(true);
    for (const r of RUTAS) expect(lista).toContain(r);
  });
});
