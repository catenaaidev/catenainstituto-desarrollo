/**
 * La sincronización del Mapa de Barriles con el servidor (js/sync.js) y la
 * fusión de filas del inventario (fusionarFilaInv, js/inventario.js).
 *
 * Se importan los archivos que sirve la página, no copias. Va en .mjs por lo
 * mismo que barriles-inventario.test.mjs: son .js clásicos que se cuelgan de
 * globalThis y no tienen tipos.
 */

import { describe, it, expect, afterEach } from 'vitest';
import '../public/barriles/js/inventario.js';
import '../public/barriles/js/sync.js';

const { clasificarRespuesta, versionDe, pedirJson, fotoEscalares, fusionarEscalares,
        fusionarContenedores, esperaReintento, planRecuperarOrdenes, camposDeOrden,
        fusionar3, fotoPorClave, fusionarFilaInv } = globalThis;

const clon = x => JSON.parse(JSON.stringify(x));

describe('clasificarRespuesta', () => {
  it('distingue sesión cerrada y solo lectura de una caída', () => {
    expect(clasificarRespuesta(200)).toBe('ok');
    expect(clasificarRespuesta(409)).toBe('conflicto');
    expect(clasificarRespuesta(412)).toBe('freno');
    expect(clasificarRespuesta(401)).toBe('sesion');
    expect(clasificarRespuesta(403)).toBe('permiso');
    expect(clasificarRespuesta(500)).toBe('error');
    expect(clasificarRespuesta(302)).toBe('error');
  });
});

describe('versionDe', () => {
  it('solo acepta una versión numérica', () => {
    expect(versionDe({ version: 7 })).toBe(7);
    expect(versionDe({ version: 0 })).toBe(0);
    // el cuerpo de un 401: antes se tomaba como versión (undefined)
    expect(versionDe({ error: 'sin_sesion' })).toBe(null);
    expect(versionDe({ version: '7' })).toBe(null);
    expect(versionDe(null)).toBe(null);
    expect(versionDe(undefined)).toBe(null);
  });
});

describe('pedirJson', () => {
  const fetchOriginal = globalThis.fetch;
  afterEach(() => { globalThis.fetch = fetchOriginal; });

  it('devuelve el código y el JSON, también en un 401', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'sin_sesion' }), { status: 401 });
    const r = await pedirJson('/x');
    expect(r).toEqual({ status: 401, ok: false, datos: { error: 'sin_sesion' } });
  });

  it('un cuerpo que no es JSON (una página HTML) da datos null, no una excepción', async () => {
    globalThis.fetch = async () => new Response('<html>login</html>', { status: 200 });
    const r = await pedirJson('/x');
    expect(r.ok).toBe(true);
    expect(r.datos).toBe(null);
  });

  it('un pedido colgado se corta al vencer el plazo y aborta el fetch', async () => {
    let senal = null;
    globalThis.fetch = (url, op) => { senal = op.signal; return new Promise(() => {}); };
    await expect(pedirJson('/x', {}, 30)).rejects.toThrow(/no respondió/);
    expect(senal && senal.aborted).toBe(true);
  });

  it('un cuerpo que no termina de llegar también se corta', async () => {
    globalThis.fetch = async () => ({ status: 200, ok: true, text: () => new Promise(() => {}) });
    await expect(pedirJson('/x', {}, 30)).rejects.toThrow();
  });

  it('pasa las opciones (método, cuerpo) al fetch', async () => {
    let visto = null;
    globalThis.fetch = async (url, op) => { visto = { url, metodo: op.method, cuerpo: op.body }; return new Response('{"version":3}'); };
    const r = await pedirJson('/estado', { method: 'POST', body: '{}' });
    expect(visto).toEqual({ url: '/estado', metodo: 'POST', cuerpo: '{}' });
    expect(versionDe(r.datos)).toBe(3);
  });
});

describe('fusionarEscalares', () => {
  const base = fotoEscalares({ fechaInventario: 'ayer', inventarioCorte: '2026-08-18', modoLote: false, boxes: [] });

  it('lo que cambié acá gana; lo que cambió el servidor y yo no, se queda', () => {
    const local = { fechaInventario: 'hoy', inventarioCorte: '2026-10-02', modoLote: false, boxes: [] };
    const serv = { fechaInventario: 'ayer', inventarioCorte: '2026-08-18', modoLote: true, boxes: [{ id: 'x' }] };
    fusionarEscalares(base, local, serv);
    expect(serv.fechaInventario).toBe('hoy');
    expect(serv.inventarioCorte).toBe('2026-10-02');
    expect(serv.modoLote).toBe(true);            // lo prendió otro, yo no lo toqué
    expect(serv.boxes).toEqual([{ id: 'x' }]);   // las listas no son de acá
  });

  it('si no toqué nada, queda todo como en el servidor', () => {
    const local = { fechaInventario: 'ayer', inventarioCorte: '2026-08-18', modoLote: false };
    const serv = { fechaInventario: 'otro', inventarioCorte: '2026-09-01', modoLote: true };
    fusionarEscalares(base, local, serv);
    expect(serv).toEqual({ fechaInventario: 'otro', inventarioCorte: '2026-09-01', modoLote: true });
  });

  it('un valor nuevo de acá entra y uno que saqué se saca', () => {
    const local = { fechaInventario: 'ayer', modoLote: false, nuevo: 5 };
    const serv = { fechaInventario: 'ayer', inventarioCorte: '2026-08-18', modoLote: false };
    fusionarEscalares(base, local, serv);
    expect(serv.nuevo).toBe(5);
    expect('inventarioCorte' in serv).toBe(false);
  });
});

describe('fusionarContenedores', () => {
  const box = (id, celdas, extra) => ({ id, nombre: 'Box ' + id, cols: 10, filas: 5, celdas: celdas || {}, ...extra });

  it('casilleros: lo de acá gana, lo de otro se queda', () => {
    const base = [box('b1', { '1-1-1': '100' })];
    const local = [box('b1', { '1-1-1': '100', '2-1-1': '200' })];
    const serv = [box('b1', { '1-1-1': '100', '3-1-1': '300' })];
    expect(fusionarContenedores(base, local, serv)[0].celdas)
      .toEqual({ '1-1-1': '100', '2-1-1': '200', '3-1-1': '300' });
  });

  it('un casillero que vacié acá se vacía allá si nadie lo tocó', () => {
    const base = [box('b1', { '1-1-1': '100' })];
    const local = [box('b1', {})];
    const serv = [box('b1', { '1-1-1': '100' })];
    expect(fusionarContenedores(base, local, serv)[0].celdas).toEqual({});
  });

  it('pero si otro puso otro barril ahí, el barril se queda', () => {
    const base = [box('b1', { '1-1-1': '100' })];
    const local = [box('b1', {})];
    const serv = [box('b1', { '1-1-1': '999' })];
    expect(fusionarContenedores(base, local, serv)[0].celdas).toEqual({ '1-1-1': '999' });
  });

  it('un box borrado acá se va si el servidor no lo tocó', () => {
    const base = [box('b1'), box('b2', { '1-1-1': '5' })];
    const local = [box('b1')];
    const serv = clon(base);
    expect(fusionarContenedores(base, local, serv).map(b => b.id)).toEqual(['b1']);
  });

  it('un box borrado acá se queda si otro le cargó algo (gana el cambio)', () => {
    const base = [box('b1'), box('b2')];
    const local = [box('b1')];
    const serv = [box('b1'), box('b2', { '1-1-1': '77' })];
    const out = fusionarContenedores(base, local, serv);
    expect(out.map(b => b.id)).toEqual(['b1', 'b2']);
    expect(out[1].celdas).toEqual({ '1-1-1': '77' });
  });

  it('renombrar o achicar acá no se pierde si otro cargó en el medio', () => {
    const base = [box('b1', { '1-1-1': '1' })];
    const local = [box('b1', { '1-1-1': '1' }, { nombre: 'Nave A', cols: 8 })];
    const serv = [box('b1', { '1-1-1': '1', '2-2-1': '2' })];
    const [b] = fusionarContenedores(base, local, serv);
    expect(b.nombre).toBe('Nave A');
    expect(b.cols).toBe(8);
    expect(b.filas).toBe(5);
    expect(b.celdas).toEqual({ '1-1-1': '1', '2-2-1': '2' });
  });

  it('el nombre que cambió otro se queda si yo no lo toqué', () => {
    const base = [box('b1')];
    const local = [box('b1', { '1-1-1': '1' })];
    const serv = [box('b1', {}, { nombre: 'Renombrado por otro' })];
    expect(fusionarContenedores(base, local, serv)[0].nombre).toBe('Renombrado por otro');
  });

  it('un box nuevo de acá va al final; uno nuevo de otro se queda', () => {
    const base = [box('b1')];
    const local = [box('b1'), box('mio')];
    const serv = [box('b1'), box('ajeno')];
    expect(fusionarContenedores(base, local, serv).map(b => b.id)).toEqual(['b1', 'ajeno', 'mio']);
  });

  it('borrado por otro: queda borrado si acá no lo toqué, vuelve si acá lo cambié', () => {
    const base = [box('b1'), box('b2')];
    expect(fusionarContenedores(base, clon(base), [box('b1')]).map(b => b.id)).toEqual(['b1']);
    const local = [box('b1'), box('b2', { '1-1-1': '8' })];
    const out = fusionarContenedores(base, local, [box('b1')]);
    expect(out.map(b => b.id)).toEqual(['b1', 'b2']);
    expect(out[1].celdas).toEqual({ '1-1-1': '8' });
  });

  it('palets: un casillero puesto por otro no se pisa con un borrado de acá', () => {
    const pal = (celdas, cols) => ({ id: 'p1', nombre: 'Palet 1', cols: cols || 9, celdas });
    const base = [pal({ 1: 'T1', 2: 'T2' })];
    const local = [pal({ 1: 'T1' }, 6)];
    const serv = [pal({ 1: 'T1', 2: 'T9', 3: 'T3' })];
    const [p] = fusionarContenedores(base, local, serv);
    expect(p.celdas).toEqual({ 1: 'T1', 2: 'T9', 3: 'T3' });
    expect(p.cols).toBe(6);
  });

  it('no muta los argumentos', () => {
    const base = [box('b1', { a: 1 })];
    const local = [box('b1', { b: 2 })];
    const serv = [box('b1', { a: 1, c: 3 })];
    const copias = clon([base, local, serv]);
    fusionarContenedores(base, local, serv);
    expect([base, local, serv]).toEqual(copias);
  });

  it('tolera listas ausentes o rotas', () => {
    expect(fusionarContenedores(undefined, [box('b1')], undefined).map(b => b.id)).toEqual(['b1']);
    expect(fusionarContenedores('x', 'y', 'z')).toEqual([]);
  });
});

describe('esperaReintento', () => {
  it('crece y tiene tope', () => {
    expect(esperaReintento(1)).toBeGreaterThan(0);
    expect(esperaReintento(5)).toBeGreaterThan(esperaReintento(1));
    expect(esperaReintento(1000)).toBeLessThanOrEqual(2000);
  });
});

describe('planRecuperarOrdenes', () => {
  const orden = (id, extra) => ({ id, fecha: '2026-10-02', ot: 'OT-1', lote: '26050', tipo: 'llenado', codigos: ['1', '2'], ...extra });

  it('una orden nueva que no llegó se agrega; una que llegó, no', () => {
    const p = planRecuperarOrdenes(
      [{ orden: orden('e1'), antes: null }, { orden: orden('e2'), antes: null }],
      [orden('e2')]);
    expect(p.agregar.map(o => o.id)).toEqual(['e1']);
    expect(p.editar).toEqual([]);
  });

  it('una edición se vuelve a aplicar si la orden sigue como estaba', () => {
    const antes = camposDeOrden(orden('e1'));
    const editada = orden('e1', { ot: 'OT-2', codigos: ['1', '2', '3'] });
    const p = planRecuperarOrdenes([{ orden: editada, antes }], [orden('e1')]);
    expect(p.editar).toEqual([{ id: 'e1', campos: camposDeOrden(editada) }]);
  });

  it('una edición que ya llegó no se repite', () => {
    const editada = orden('e1', { ot: 'OT-2' });
    const p = planRecuperarOrdenes([{ orden: editada, antes: camposDeOrden(orden('e1')) }], [clon(editada)]);
    expect(p.editar).toEqual([]);
  });

  it('no pisa una orden que otro cambió, borró o aplicó después', () => {
    const editada = orden('e1', { ot: 'OT-2' });
    const antes = camposDeOrden(orden('e1'));
    expect(planRecuperarOrdenes([{ orden: editada, antes }], [orden('e1', { lote: 'otro' })]).editar).toEqual([]);
    expect(planRecuperarOrdenes([{ orden: editada, antes }], []).editar).toEqual([]);
    expect(planRecuperarOrdenes([{ orden: editada, antes }], [orden('e1', { aplicado: { ts: 1 } })]).editar).toEqual([]);
  });

  it('ignora entradas rotas', () => {
    const p = planRecuperarOrdenes([null, {}, { orden: { id: 'x' } }, { orden: orden('ok') }], 'no-lista');
    expect(p.agregar.map(o => o.id)).toEqual(['ok']);
  });
});

describe('fusionarFilaInv (dos lados tocaron la misma fila)', () => {
  const clave = r => String(r.num);
  const fila = extra => ({ num: '100', estado: 'LLENO', lote: '26050', cosecha: '2026', litros: 225,
    fecha: '2026-10-01', ts: 1000, por: 'inventario', marca: 'Seguin', cap: 225, ...extra });

  it('la marca corregida acá sobrevive a un escaneo en otro celular (con ts más nuevo)', () => {
    const base = fotoPorClave([fila()], clave);
    const local = [fila({ marca: 'Taransaud' })];
    const serv = [fila({ estado: 'VACIO', lote: '', cosecha: '', litros: 0, fecha: '2026-10-02', ts: 2000, por: 'orden:e1' })];
    const [r] = fusionar3(base, local, serv, clave, fusionarFilaInv);
    expect(r.marca).toBe('Taransaud');
    expect(r).toMatchObject({ estado: 'VACIO', lote: '', litros: 0, ts: 2000, por: 'orden:e1' });
  });

  it('sin la fusión por campo (como antes), la marca se perdía', () => {
    const base = fotoPorClave([fila()], clave);
    const local = [fila({ marca: 'Taransaud' })];
    const serv = [fila({ estado: 'VACIO', lote: '', ts: 2000 })];
    expect(fusionar3(base, local, serv, clave)[0].marca).toBe('Seguin');
  });

  it('si los dos cambiaron el hecho, gana el ts más nuevo y en bloque', () => {
    const b = fila();
    const l = fila({ estado: 'VACIO', lote: '', cosecha: '', litros: 0, ts: 3000 });
    const s = fila({ lote: '26999', cosecha: '2026', ts: 2000 });
    expect(fusionarFilaInv(clon(b), l, s)).toMatchObject({ estado: 'VACIO', lote: '', ts: 3000 });
    const s2 = fila({ lote: '26999', ts: 4000 });
    expect(fusionarFilaInv(clon(b), l, s2)).toMatchObject({ estado: 'LLENO', lote: '26999', ts: 4000 });
  });

  it('la ficha del Excel (y sacarle el alta) entra aunque otro haya escaneado', () => {
    const b = fila({ alta: true });
    const l = fila({ cap: 300, marca: 'Nadalié' });   // Object.assign de la ficha + delete r.alta
    const s = fila({ alta: true, estado: 'MERMO', ts: 5000 });
    const r = fusionarFilaInv(b, l, s);
    expect(r).toMatchObject({ cap: 300, marca: 'Nadalié', estado: 'MERMO', ts: 5000 });
    expect('alta' in r).toBe(false);
  });
});
