/**
 * Foto de los VALORES de las reglas "con significado" de Barriles (mapa,
 * escáner, cámara, modo por lote, inventario/altas/pedidos/historial,
 * rótulos/cifras/cuentas, velo/solo lectura) + el bloque :root --sem-*.
 * barriles-colores-congelados.test.ts ya vigila que ninguna de estas reglas
 * use un TOKEN de interfaz; esta foto además fija sus VALORES exactos, para
 * que un cambio futuro (p. ej. un ajuste de capas o de padding en la misma
 * regla) no le mueva un color de encima sin que un test lo note.
 *
 * La foto la escribió scripts/extraer-congelados-barriles.mjs y se verificó a
 * mano, comparando contra el commit 9b077ed (antes de la Etapa 3), que cada
 * valor de color coincide tras sustituir var(--sem-*) por su hex: sin
 * diferencias. Si un cambio la rompe, se arregla el cambio, no la foto.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { cssDe, reglasPlanas, reglasTope, norm } from '../scripts/css-reglas.mjs';
import { CON_SIGNIFICADO, sinCelular } from '../scripts/selectores-barriles.mjs';
import foto from './fixtures/barriles-congelados.json';

const html = env.INDEX_HTML_BARRILES;

function congeladas(h) {
  const out = sinCelular(
    reglasPlanas(h)
      .filter((r) => CON_SIGNIFICADO.test(r.selector))
      .map((r) => (r.media ? r.media + '>' : '') + r.selector + '{' + r.cuerpo + '}')
  );
  const root = reglasTope(cssDe(h)).find((r) => r.startsWith(':root'));
  if (root) out.push(norm(root));
  return out.sort();
}

describe('colores congelados de Barriles (foto de valores)', () => {
  it('las reglas con significado son, valor por valor, las de la foto', () => {
    expect(congeladas(html)).toEqual(foto);
  });
});
