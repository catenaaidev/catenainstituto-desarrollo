/**
 * El arranque de la página no puede descartar trabajo sin confirmar.
 *
 * Reproduce el punto 4 del informe del 16/09: `iniciar()` cargaba la copia
 * local, preguntaba `hayPendientes()`, y si daba falso NO salía por el `return`
 * — la línea siguiente (`if (d.estado) estado = d.estado`) pisaba lo que acababa
 * de cargar. Con órdenes del escáner sin subir eso disparaba en CADA arranque.
 *
 * Se lee el index.html de verdad: si alguien afloja la regla en producción, este
 * test se entera. Va en .mjs por la misma razón que los otros.
 *
 * Nota de implementación: el runtime de Workers no tiene readFileSync. El contenido
 * del HTML llega como binding INDEX_HTML_BARRILES (leído en Node desde vitest.config.ts,
 * igual que las migraciones), y se accede via env de cloudflare:test.
 */

import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import '../public/barriles/js/pendientes.js';

const { decidirArranque } = globalThis;
const INDEX = env.INDEX_HTML_BARRILES;

describe('el arranque, sobre el archivo real', () => {
  it('iniciar() decide con decidirArranque y no a mano', () => {
    const i = INDEX.indexOf('async function iniciar()');
    expect(i, 'no encontré iniciar()').toBeGreaterThan(-1);
    const cuerpo = INDEX.slice(i, i + 2000);
    expect(cuerpo).toContain('decidirArranque');
  });

  it('el marcador pesa en localTiene: una orden sin subir cuenta como copia local', () => {
    const i = INDEX.indexOf('const localTiene');
    expect(i, 'no encontré localTiene').toBeGreaterThan(-1);
    expect(INDEX.slice(i, i + 220)).toContain('pendienteLocal');
  });
});

