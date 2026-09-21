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

describe('la salida temprana de sincronizar()', () => {
  // sincronizar() tiene la fusión correcta de TODAS las colecciones (escaneos por
  // id, tanques por num, pedidos, revisiones, ediciones). Pero salía por un return
  // antes de llegar, si el mapa y los palets estaban intactos.
  it('no sale temprano cuando el marcador dice que hay trabajo', () => {
    const i = INDEX.indexOf('async function sincronizar(');
    expect(i, 'no encontré sincronizar()').toBeGreaterThan(-1);
    const hastaLaFusion = INDEX.slice(i, INDEX.indexOf('unir órdenes de escáner por id', i));
    const corte = hastaLaFusion.indexOf('!diffPaletsLocal().length');
    expect(corte, 'no encontré la condición de salida temprana').toBeGreaterThan(-1);
    expect(hastaLaFusion.slice(corte, corte + 120)).toContain('pendienteLocal');
  });

  it('el marcador se apaga cuando sincronizar() sube con éxito', () => {
    const i = INDEX.indexOf('async function sincronizar(');
    const fin = INDEX.indexOf('function adoptar(', i);
    const cuerpo = INDEX.slice(i, fin);

    // El brief exige que limpiarPendiente() quede DENTRO de la rama if (r.ok),
    // no en el catch ni en el break del 500. Un test que solo busca en todo el
    // cuerpo pasaría aunque alguien lo mueva al catch — que es exactamente la
    // regresión que rompería el marcador.
    const inicioOk = cuerpo.indexOf('if (r.ok)');
    expect(inicioOk, 'no encontré if (r.ok) en sincronizar()').toBeGreaterThan(-1);
    // El bloque ok termina justo antes de 'break;' del 500
    const finOk = cuerpo.indexOf('break;', inicioOk);
    expect(finOk, 'no encontré el break del 500 después de if (r.ok)').toBeGreaterThan(-1);
    const bloqueOk = cuerpo.slice(inicioOk, finOk);
    expect(bloqueOk, 'limpiarPendiente() tiene que estar dentro de if (r.ok)').toContain('limpiarPendiente()');

    // El catch de sincronizar() no debe apagar el marcador: si el servidor
    // nunca confirmó, el marcador tiene que seguir prendido.
    const inicioCatch = cuerpo.indexOf('} catch (e)');
    expect(inicioCatch, 'no encontré el catch en sincronizar()').toBeGreaterThan(-1);
    const bloqueCatch = cuerpo.slice(inicioCatch);
    expect(bloqueCatch, 'limpiarPendiente() NO debe estar en el catch de sincronizar()').not.toContain('limpiarPendiente()');
  });
});

describe('adoptar() y el marcador', () => {
  // Rechazar un borrado masivo (412) descarta lo local a proposito. Si el
  // marcador quedara prendido, hayPendientes() daria verdadero para siempre y
  // el operario se comeria un cartel de confirmacion cada tres segundos.
  it('apaga el marcador, para no dejar un bucle de carteles', () => {
    const i = INDEX.indexOf('function adoptar(');
    expect(i, 'no encontré adoptar()').toBeGreaterThan(-1);
    const cuerpo = INDEX.slice(i, INDEX.indexOf('\n}', i));
    expect(cuerpo).toContain('limpiarPendiente()');
  });
});

