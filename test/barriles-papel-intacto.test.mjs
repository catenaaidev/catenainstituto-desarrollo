/**
 * Las hojas de papel de Barriles (rótulos A4, hoja del mapa, Registro impreso)
 * y todo su @media print tienen que quedar EXACTAMENTE como al cerrar la Task 2
 * de la Etapa 3 (que salía idéntico a main, comparado con PDFs). La foto la
 * escribió scripts/extraer-papel-barriles.mjs; si un cambio la rompe, se
 * arregla el cambio, no la foto.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { reglasDePapel } from '../scripts/css-reglas.mjs';
import { PAPEL_BARRILES, sinCelular } from '../scripts/selectores-barriles.mjs';
import foto from './fixtures/barriles-papel.json';

describe('papel de Barriles', () => {
  it('las reglas de papel e impresión son las de la foto', () => {
    expect(sinCelular(reglasDePapel(env.INDEX_HTML_BARRILES, PAPEL_BARRILES))).toEqual(foto);
  });

  it('los rótulos siguen en A4 vertical con 14 mm', () => {
    expect(foto).toContain('@page rotulos{size: A4 portrait;margin: 14mm;}');
  });
});
