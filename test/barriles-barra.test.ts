/**
 * La barra de Barriles tiene que ser como la de Prensas: marca en Cormorant,
 * pestañas sin emojis, Administrar dentro de Más, y pegada debajo de la barra
 * de la plataforma (--ciw-h). Las sub-pestañas y la ayuda del operario van
 * DENTRO del <header>: el @media print lo oculta, así no salen en la hoja.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { cssDe, norm, reglasPlanas } from '../scripts/css-reglas.mjs';

const html = env.INDEX_HTML_BARRILES;
const header = (html.match(/<header class="app-barra" id="barraBarriles">[\s\S]*?<\/header>/) || [''])[0];
const nav = (header.match(/<nav class="tabs" id="navProgramador"[\s\S]*?<\/nav>/) || [''])[0];
const arriba = [...nav.replace(/<div class="mas"[\s\S]*$/, '').matchAll(/<button[^>]*data-grupo="([^"]+)"[^>]*>([^<]*)/g)]
  .map((m) => [m[1], m[2].trim()]);
const menu = (nav.match(/<div class="mas-menu" id="masMenu">[\s\S]*$/) || [''])[0]
  .replace(/<div class="mas-angosto">[\s\S]*?<\/div>/, '');
const enMas = [...menu.matchAll(/data-sub="([^"]+)"/g)].map((m) => m[1]);
const EMOJI = /\p{Extended_Pictographic}/u;
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');

describe('barra de Barriles', () => {
  it('carga estilo.css y la barra antes de su propio <style>', () => {
    const i = html.indexOf('<link rel="stylesheet" href="/shared/estilo.css">');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(html.indexOf('<style>'));
    expect(html).toContain('<script src="js/barra-barriles.js"></script>');
  });

  it('cuatro grupos a la vista y controles antiguos de Administrar ocultos', () => {
    expect(arriba).toEqual([['inicio', 'Inicio'], ['barriles', 'Barriles'], ['mapa', 'Mapa'], ['imprimir', 'Imprimir']]);
    expect(enMas).toEqual(['datos', 'boxes', 'respaldos', 'celular']);
    for (const sub of enMas) expect(menu).toContain(`data-sub="${sub}" hidden style="display:none!important"`);
  });

  it('sub-pestañas, ayuda del operario y operario dentro del header', () => {
    for (const id of ['navSubProg', 'navOperario', 'opAyuda', 'opTitulo', 'opInicio', 'insigniaSync', 'estadoDatos', 'chipModoLote']) {
      expect(header, id).toContain(`id="${id}"`);
    }
  });

  it('sin emojis en barra, sub-pestañas, títulos ni insignia', () => {
    expect(header.replace(/<span class="prog-cuenta"[^>]*><\/span>/g, '')).not.toMatch(EMOJI);
    for (const id of ['opVistaSel', 'mapaTipoSel']) {
      const bloque = (html.match(new RegExp(`<div id="${id}">[\\s\\S]*?</div>`)) || [''])[0];
      expect(bloque, id).not.toMatch(EMOJI);
    }
    const grupos = (js.match(/const PROG_GRUPOS = \{[\s\S]*?\n\};/) || [''])[0];
    expect(grupos).not.toBe('');
    expect(grupos).not.toMatch(EMOJI);
    const titulos = (js.match(/const OP_TITULOS = \{[\s\S]*?\n\};/) || [''])[0];
    for (const m of titulos.matchAll(/:\s*\['([^']*)'/g)) expect(m[1]).not.toMatch(EMOJI);
    const insignias = (js.match(/const INSIGNIAS = \{[\s\S]*?\n\};/) || [''])[0];
    for (const m of insignias.matchAll(/:\s*\['([^']*)'/g)) expect(m[1]).not.toMatch(EMOJI);
  });

  it('pegada debajo de la barra de la plataforma', () => {
    // norm() no saca el espacio después de ":": se compara con la misma escritura del CSS de Barriles.
    expect(norm(cssDe(html))).toContain(norm('.app-barra { position: sticky; top: var(--ciw-h,0px);'));
    expect(html).toContain('top:calc(var(--ciw-h,0px) + var(--barriles-h,0px) + 6px)');
  });

  it('sin reglas sobre header ni nav sueltos (pisaban la barra de la plataforma)', () => {
    const sueltas = reglasPlanas(html).filter((r) => /^(header|nav)( |$)/.test(r.selector) || /(^|,)(header|nav)(,|$)/.test(r.selector));
    expect(sueltas.map((r) => r.selector)).toEqual([]);
  });
});
