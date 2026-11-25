/**
 * Las hojas de papel de Lotes (OT, órdenes, rótulos, hoja de recorrida) y
 * todo su @media print tienen que quedar EXACTAMENTE como en main antes de la
 * Etapa 2 de la estética: salen impresas para calidad y bodega. La foto la
 * escribió scripts/extraer-papel-lotes.mjs; si un cambio la rompe, se arregla
 * el cambio, no la foto.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { reglasDePapel } from '../scripts/css-reglas.mjs';
import foto from './fixtures/lotes-papel.json';

describe('papel de Lotes', () => {
  it('las reglas de papel e impresión son las de la foto', () => {
    expect(reglasDePapel(env.LOTES_HTML)).toEqual(foto);
  });
});
