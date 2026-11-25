/**
 * Los colores escritos en el JS de Barriles tienen significado: la escena 3D
 * (fondo, vidrio de los barriles, aro amarillo del destino), colorLote (cada
 * lote su color en el mapa) y los textos del pie de la cámara (verde = leído,
 * naranja = ojo, rojo = no figura). La Etapa 3 de la estética no los toca. La
 * foto la escribió scripts/extraer-colores-barriles.mjs sobre main; si un
 * cambio la rompe, se arregla el cambio, no la foto.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { coloresDelJs } from '../scripts/colores-literales.mjs';
import foto from './fixtures/barriles-colores-js.json';

describe('colores del JS de Barriles', () => {
  it('son los de la foto, en el mismo orden', () => {
    expect(coloresDelJs(env.INDEX_HTML_BARRILES)).toEqual(foto);
  });

  it('colorLote sigue siendo la misma función', () => {
    expect(env.INDEX_HTML_BARRILES.replace(/\r\n/g, '\n')).toContain(
      "const hue = h % 360, sat = 55 + (h >> 8) % 25, lig = 72 + (h >> 16) % 12;\n  return `hsl(${hue},${sat}%,${lig}%)`;");
  });
});
