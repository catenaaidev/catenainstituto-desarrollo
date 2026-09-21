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

  // Había DOS implementaciones de "adoptar el servidor": adoptar() y el
  // procedimiento a mano de iniciar(), que se olvidaba de limpiarPendiente().
  it('iniciar() adopta llamando a adoptar(), no a mano', () => {
    const i = INDEX.indexOf('async function iniciar()');
    const cuerpo = INDEX.slice(i, i + 3000);
    const rama = cuerpo.indexOf("quePasa === 'adoptar-servidor'");
    expect(rama, 'no encontré la rama adoptar-servidor').toBeGreaterThan(-1);
    expect(cuerpo.slice(rama, rama + 900)).toContain('adoptar(d)');
  });

  it('«Descartar copia local» también borra el marcador', () => {
    const i = INDEX.indexOf("getElementById('btnDescartarLocal')");
    expect(i, 'no encontré el botón de descartar').toBeGreaterThan(-1);
    expect(INDEX.slice(i, i + 900)).toContain('removeItem(CLAVE_PENDIENTE)');
  });
});

describe('el sello: escanear con el POST en vuelo', () => {
  // La lógica pura está en decidirConfirmacion() y se testea en
  // barriles-pendientes.test.mjs. Acá solo se ancla que el archivo real la use
  // en los DOS lugares que postean, y que el marcador no se apague afuera de la
  // decisión: si alguien deja un limpiarPendiente() suelto en la rama del 200, el
  // sello no sirve de nada.
  it('marcarPendiente() incrementa el sello', () => {
    const i = INDEX.indexOf('function marcarPendiente()');
    expect(i, 'no encontré marcarPendiente()').toBeGreaterThan(-1);
    expect(INDEX.slice(i, INDEX.indexOf('\n}', i))).toContain('selloGuardado++');
  });

  it('push() captura el sello antes del POST y decide con él', () => {
    const i = INDEX.indexOf('async function push(');
    const cuerpo = INDEX.slice(i, INDEX.indexOf('async function sondear(', i));
    const captura = cuerpo.indexOf('const sello = selloGuardado');
    expect(captura, 'no encontré la captura del sello').toBeGreaterThan(-1);
    const post = cuerpo.indexOf("fetch(API+'/estado', { method: 'POST'");
    expect(captura, 'el sello se captura DESPUÉS del POST').toBeLessThan(post);

    const exito = cuerpo.indexOf('} else if (r.ok) {');
    const bloqueOk = cuerpo.slice(exito, cuerpo.indexOf('\n    } else {', exito));
    expect(bloqueOk).toContain('decidirConfirmacion(');
    // El apagado tiene que colgar de la decisión, no estar suelto en la rama del 200.
    const decision = bloqueOk.indexOf('decidirConfirmacion(');
    expect(bloqueOk.indexOf('limpiarPendiente()'), 'limpiarPendiente() fuera de la decisión')
      .toBeGreaterThan(decision);
  });

  it('sincronizar() captura el sello antes del POST y decide antes de pisar estado', () => {
    const i = INDEX.indexOf('async function sincronizar(');
    const cuerpo = INDEX.slice(i, INDEX.indexOf('function adoptar(', i));
    const captura = cuerpo.indexOf('const sello = selloGuardado');
    expect(captura, 'no encontré la captura del sello').toBeGreaterThan(-1);
    const post = cuerpo.indexOf("fetch(API+'/estado', { method: 'POST'");
    expect(captura, 'el sello se captura DESPUÉS del POST').toBeLessThan(post);

    const ok = cuerpo.indexOf('if (r.ok)');
    const bloqueOk = cuerpo.slice(ok, cuerpo.indexOf('break;', ok));
    const decision = bloqueOk.indexOf('decidirConfirmacion(');
    expect(decision, 'no se decide con el sello en la rama del 200').toBeGreaterThan(-1);
    // Tanto apagar el marcador como pisar `estado` van DESPUÉS de la decisión.
    expect(bloqueOk.indexOf('limpiarPendiente()')).toBeGreaterThan(decision);
    expect(bloqueOk.indexOf('estado = serv')).toBeGreaterThan(decision);
  });
});

describe('push() ante un error del servidor', () => {
  // fetch NO rechaza ante un 500. Sin una rama else, la respuesta no matcheaba
  // 409, ni 412, ni r.ok: la funcion terminaba en silencio y el marcador
  // quedaba prendido pero la insignia podia seguir diciendo "sincronizado".
  //
  // OJO con como se busca: push() YA tiene un `} else {` (el del 412 rechazado,
  // :1088). Buscarlo suelto daba un test que pasaba sin el arreglo. Hay que
  // anclar la busqueda DESPUES de la rama del exito.
  it('tiene una rama para las respuestas que no son 409, 412 ni ok', () => {
    const i = INDEX.indexOf('async function push(');
    expect(i, 'no encontré push()').toBeGreaterThan(-1);
    const cuerpo = INDEX.slice(i, INDEX.indexOf('async function sondear(', i));
    const exito = cuerpo.indexOf('} else if (r.ok) {');
    expect(exito, 'no encontré la rama del éxito').toBeGreaterThan(-1);
    expect(cuerpo.slice(exito)).toMatch(/\}\s*else\s*\{[\s\S]{0,300}ponerInsignia\('offline'\)/);
  });
});

