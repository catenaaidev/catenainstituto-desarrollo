/**
 * La portada del operario: seis botones grandes que se usan de pie, a un metro
 * de la pantalla. La estética les cambia el recuadro (piedra con filete de
 * tinta, esquina de 2 px), NO el tamaño: ni el alto, ni la letra, ni las tres
 * columnas.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { reglasPlanas } from '../scripts/css-reglas.mjs';

const html = env.INDEX_HTML_BARRILES;
const reglas = reglasPlanas(html);
// Sin espacios: el CSS de Barriles escribe "prop: valor" y norm() deja ese espacio.
const plano = (s: string) => s.replace(/\s+/g, '');
const regla = (sel: string, media = '') =>
  plano((reglas.find((r) => r.selector === sel && plano(r.media) === plano(media)) || { cuerpo: '' }).cuerpo);
const tiene = (sel: string, decl: string, media = '') => expect(regla(sel, media), sel + ' ' + decl).toContain(plano(decl));

describe('portada del operario', () => {
  it('seis botones grandes', () => {
    const portada = (html.match(/<div class="ini-grandes">[\s\S]*?<\/div>\s*<div class="ini-chicos">/) || [''])[0];
    expect((portada.match(/class="ini-boton/g) || []).length).toBe(6);
  });

  it('las medidas de siempre', () => {
    tiene('.ini-boton', 'min-height: 150px');
    tiene('.ini-boton', 'padding: 26px 22px');
    tiene('.ini-boton b', 'font-size: 1.35rem');
    tiene('.ini-boton .ini-ico', 'font-size: 2.6rem');
    tiene('.ini-grandes', 'grid-template-columns: repeat(3, minmax(0, 1fr))');
    tiene('.ini-grandes', 'grid-template-columns: repeat(2, minmax(0, 1fr))', '@media (max-width: 700px)');
  });

  it('recuadro piedra con filete de tinta y esquina de 2 px', () => {
    tiene('.ini-boton', 'background: var(--panel)');
    tiene('.ini-boton', 'border-top: 2px solid var(--rule)');
    tiene('.ini-boton', 'border-radius: 2px');
    tiene('.ini-boton b', 'color: var(--txt)');
  });

  it('las cifras del Inicio del programador en Cormorant', () => {
    tiene('.tab-cifra .tab-valor', 'font-family: var(--serif)');
  });
});
