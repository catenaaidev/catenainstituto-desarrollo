/**
 * Rótulos de lote desde Barriles: la misma hoja "rotulo" de la 0700 que imprime
 * Lotes (dos rótulos iguales por barril, 9 pares por A4, QR con el lote).
 *
 * Va en .mjs por lo mismo que barriles-inventario.test.mjs: importa un script
 * clásico que se cuelga de globalThis.
 */

import { describe, it, expect } from 'vitest';
import '../public/barriles/js/rotulos.js';

const { hojasRotulos, cantidadSugerida, PARES_POR_HOJA_ROT } = globalThis;

const cuenta = (html, clase) => (html.match(new RegExp(`class="${clase}"`, 'g')) || []).length;

describe('hojasRotulos', () => {
  const qr = lote => `<svg data-lote="${lote}"></svg>`;

  it('un par de rótulos iguales por barril, 9 pares por hoja', () => {
    expect(PARES_POR_HOJA_ROT).toBe(9);
    const html = hojasRotulos({ lote: '26124', titulo: 'MB Adrianna Ct. 6 River RS3', cantidad: 9 }, qr);
    expect(cuenta(html, 'rot-hoja')).toBe(1);
    expect(cuenta(html, 'ot-rot-par')).toBe(9);
    expect(cuenta(html, 'ot-rotulo')).toBe(18);
  });

  it('10 barriles son dos hojas (9 + 1)', () => {
    const html = hojasRotulos({ lote: '26124', titulo: 'X', cantidad: 10 }, qr);
    expect(cuenta(html, 'rot-hoja')).toBe(2);
    expect(cuenta(html, 'ot-rot-par')).toBe(10);
  });

  it('numera los barriles 1, 2, 3… y repite el número en los dos rótulos del par', () => {
    const html = hojasRotulos({ lote: '26124', titulo: 'X', cantidad: 3 }, qr);
    const nums = [...html.matchAll(/<div class="ot-rot-n">(\d+)<\/div>/g)].map(m => m[1]);
    expect(nums).toEqual(['1', '1', '2', '2', '3', '3']);
  });

  it('lleva el lote, el título y el QR del lote', () => {
    const html = hojasRotulos({ lote: '26124', titulo: 'MB Adrianna Ct. 6 River RS3', cantidad: 1 }, qr);
    expect(html).toContain('<div class="ot-rot-lote">26124</div>');
    expect(html).toContain('<div class="ot-rot-id">MB Adrianna Ct. 6 River RS3</div>');
    expect(html).toContain('<svg data-lote="26124"></svg>');
  });

  it('escapa el texto', () => {
    const html = hojasRotulos({ lote: '<b>', titulo: 'a & "b"', cantidad: 1 }, () => '');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('a &amp; &quot;b&quot;');
    expect(html).not.toContain('<b>');
  });

  it('sin lote o con cantidad inválida no arma nada', () => {
    expect(hojasRotulos({ lote: '', titulo: 'X', cantidad: 5 }, qr)).toBe('');
    expect(hojasRotulos({ lote: '26124', titulo: 'X', cantidad: 0 }, qr)).toBe('');
    expect(hojasRotulos({ lote: '26124', titulo: 'X', cantidad: 'abc' }, qr)).toBe('');
  });

  it('no pasa de 500 barriles (una cifra mal tipeada no cuelga la página)', () => {
    const html = hojasRotulos({ lote: '1', titulo: 'X', cantidad: 100000 }, () => '');
    expect(cuenta(html, 'ot-rot-par')).toBe(500);
  });

  it('sin función de QR, el hueco queda vacío', () => {
    const html = hojasRotulos({ lote: '26124', titulo: 'X', cantidad: 1 });
    expect(html).toContain('<div class="ot-rot-qr"></div>');
  });
});

describe('cantidadSugerida', () => {
  const inv = [
    { num: '1', estado: 'LLENO', lote: '26124' },
    { num: '2', estado: 'MERMO', lote: '26124' },
    { num: '3', estado: 'VACIO', lote: '' },
    { num: '4', estado: 'LLENO', lote: '261240' },
    { num: '5', estado: 'LLENO', lote: ' 26124 ' },
  ];
  it('cuenta los barriles llenos o mermados con ese lote exacto', () => {
    expect(cantidadSugerida(inv, '26124')).toBe(3);
  });
  it('lote que no está: 0', () => {
    expect(cantidadSugerida(inv, '99999')).toBe(0);
    expect(cantidadSugerida(inv, '')).toBe(0);
  });
});
