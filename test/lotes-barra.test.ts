/**
 * La barra de Lotes tiene que ser como la de Prensas: tres pantallas a la
 * vista, el resto en Más, sin emojis, y pegada debajo de la barra de la
 * plataforma (--ciw-h) al hacer scroll.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { cssDe, norm } from '../scripts/css-reglas.mjs';

const html = env.LOTES_HTML;
const nav = (html.match(/<nav class="tabs" id="tabs"[\s\S]*?<\/nav>/) || [''])[0];
const principales = [...nav.replace(/<div class="mas"[\s\S]*$/, '').matchAll(/<button[^>]*data-v="([^"]+)"[^>]*>([^<]*)<\/button>/g)]
  .map((m) => [m[1], m[2].trim()]);
const menu = (nav.match(/<div class="mas-menu" id="masMenu">[\s\S]*$/) || [''])[0]
  .replace(/<div class="mas-angosto">[\s\S]*?<\/div>/, '');
const enMas = [...menu.matchAll(/data-v="([^"]+)"/g)].map((m) => m[1]);
const EMOJI = /\p{Extended_Pictographic}/u;

describe('barra de Lotes', () => {
  it('tres pantallas a la vista, en este orden', () => {
    expect(principales).toEqual([
      ['lotes', 'Lotes'], ['analisis', 'Análisis'],
      ['agenda', 'Agenda'],
    ]);
  });

  it('el resto en Más', () => {
    expect(enMas.sort()).toEqual(['config', 'cruce', 'tablero']);
    expect(menu).toContain('data-v="tablero">Tablero</button>');
    expect(html).toContain('data-analisis-v="cargar"');
    expect(menu).toContain('id="btnHistorial"');
    expect(menu).toContain('id="btnCuadricula"');
    expect(menu).toContain('id="btnExportarCompleto"');
    expect(menu).toContain('Exportar Excel completo');
  });

  it('sin emojis en pestañas ni sub-pestañas', () => {
    expect(nav).not.toMatch(EMOJI);
    const corr = (html.match(/<div class="corr-sub"[\s\S]*?<\/div>/) || [''])[0];
    expect(corr).not.toMatch(EMOJI);
    const mov = env.LOTES_JS['js/vista-movimientos.js'];
    for (const m of mov.matchAll(/\bb\('\w+', '([^']*)'\)/g)) expect(m[1]).not.toMatch(EMOJI);
    const orden = env.LOTES_JS['js/vista-orden.js'];
    for (const m of orden.matchAll(/tipoBtn\('\w+', '([^']*)'\)/g)) expect(m[1]).not.toMatch(EMOJI);
  });

  it('pegada debajo de la barra de la plataforma', () => {
    expect(norm(cssDe(html))).toContain(norm('.app-barra{position:sticky;top:var(--ciw-h,0px)'));
  });

  it('no usa la clase .barra (es la barra de avance de la Ficha)', () => {
    // Ojo: \bbarra\b solo no alcanza, porque el guion de "app-barra" tambien
    // cuenta como limite de palabra y el regex del brief daria falso
    // positivo contra la clase mandada. Se verifica el token de clase entero.
    expect(html).not.toMatch(/<header[^>]*class="(?:[^"]*\s)?barra(?:\s[^"]*)?"/);
  });
});
