/**
 * Barriles en el celular: la página no se pasa del ancho, todo lo táctil mide
 * 44 px, los campos van a 16 px (sin zoom de iOS), el teclado según el dato, y
 * los pies de la cámara respetan la barra de gestos (safe-area).
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { cssDe, reglasPlanas } from '../scripts/css-reglas.mjs';

const html = env.INDEX_HTML_BARRILES;
// Todo el CSS sin espacios: así no importa cómo esté sangrado ni si hay espacio después de ":".
const plano = (s: string) => s.replace(/\s+/g, '');
const css = plano(cssDe(html));
const input = (id: string) => (html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)) || [''])[0];

describe('Barriles en el celular', () => {
  it('viewport con viewport-fit=cover (si no, env(safe-area-*) vale 0)', () => {
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">');
  });

  it('pies y cabeceras de cámara con safe-area', () => {
    expect(css).toContain(plano('#escPieCam, #barPieCam, #paletPieCam, #pieCamara { padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));'));
    expect(css).toContain(plano('#escCabeceraCam, #barCabeceraCam, #paletCabeceraCam, #cabeceraCamara { padding-top: calc(12px + env(safe-area-inset-top, 0px));'));
  });

  it('teclado numérico donde el dato es número; OT y lote con letras', () => {
    expect(input('rotCantidad')).toContain('inputmode="numeric"');
    for (const id of ['posTipearInput', 'escTipearInput', 'barTipearInput']) expect(input(id), id).toContain('inputmode="numeric"');
    for (const id of ['escOT', 'escLote', 'barInputLote']) expect(input(id), id).not.toContain('inputmode="numeric"');
  });

  it('44 px en pantallas táctiles y 16 px en los campos del celular', () => {
    expect(css).toMatch(/@media\(pointer:coarse\)\{[^@]*\.esc-quitar\{min-width:var\(--ci-tap\);min-height:var\(--ci-tap\)/);
    expect(css).toMatch(/@media\(max-width:760px\)\{[^@]*input:not\(\[type=checkbox\]\):not\(\[type=radio\]\),select,textarea\{font-size:16px/);
  });

  it('cámara, pedidos, modal y cartel de lado arriba de la barra de la plataforma (1050)', () => {
    expect(css).toContain(plano('#overlayCamara, #overlayCamaraEsc, #overlayCamaraBar, #overlayCamaraPalet, #overlayPedido, #modal, #cartelLado { z-index: 1060; }'));
  });

  it('ninguna regla POSTERIOR les pisa ese 1060 (p. ej. #overlayPedido tenía su propio 200 más abajo)', () => {
    const ids = ['overlayCamara', 'overlayCamaraEsc', 'overlayCamaraBar', 'overlayCamaraPalet', 'overlayPedido', 'modal', 'cartelLado'];
    const tocaAlguno = (sel: string) => ids.some((id) => new RegExp(`(^|[\\s,])#${id}([\\s,.:{]|$)`).test(sel));
    const reglas = reglasPlanas(html);
    const i1060 = reglas.findIndex((r) => tocaAlguno(r.selector) && /z-index:\s*1060/.test(r.cuerpo));
    expect(i1060, 'no está la regla del z-index 1060').toBeGreaterThanOrEqual(0);
    // Solo importa lo que viene DESPUÉS: una regla con otro z-index declarada
    // ANTES ya queda tapada por el 1060 (así funciona el CSS en cascada).
    const malas = reglas
      .slice(i1060 + 1)
      .filter((r) => tocaAlguno(r.selector))
      .filter((r) => {
        const m = r.cuerpo.match(/z-index:\s*(\d+)/);
        return m && m[1] !== '1060';
      })
      .map((r) => r.selector + '{' + r.cuerpo + '}');
    expect(malas).toEqual([]);
  });

  it('los campos grandes a propósito siguen grandes en celular (16px es un mínimo, no un techo)', () => {
    expect(css).toMatch(/@media\(max-width:760px\)\{[^@]*\.cam-tipear\.cam-tipearinput\{font-size:1\.3rem/);
    expect(css).toMatch(/@media\(max-width:760px\)\{[^@]*\.reg-buscador\.reg-buscadorinput\{font-size:1\.35rem/);
    expect(css).toMatch(/@media\(max-width:760px\)\{[^@]*\.rot-form\.rot-forminput\{font-size:1\.25rem/);
  });

  it('las tablas anchas tienen su recuadro con scroll', () => {
    for (const id of ['tablaBoxes', 'tablaPalets', 'pedidosPendientes', 'pedidosHechos']) {
      expect(html, id).toMatch(new RegExp(`<div class="scroll-x"><table class="datos" id="${id}"`));
    }
  });
});
