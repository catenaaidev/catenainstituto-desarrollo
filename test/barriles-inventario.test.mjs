/**
 * El inventario simple: una puerta de escritura, gana lo último.
 *
 * Va en .mjs por lo mismo que barriles-altas.test.mjs: importa un .js clásico
 * que se cuelga de globalThis y no tiene tipos.
 *
 * Los "caso N" son los de la conversación del 2026-09-28 con el usuario
 * (docs/superpowers/specs/2026-09-28-barriles-inventario-simple-design.md).
 */

import { describe, it, expect } from 'vitest';
import '../public/barriles/js/inventario.js';

const { camposCoherentes, escribirFila, planOrden, planDeshacer, planImportacion, fusionar3,
        fotoPorClave, cerrarCartelesDe, agregarCartel, opcionesDeLotes, planMigracion,
        migrarEstado, necesitaMigracion, normEstado } = globalThis;

const cosechaDe = l => (/^(\d{2})\d{3}$/.exec(l) ? '20' + l.slice(0, 2) : null);
const fila = (num, extra = {}) => ({ num: String(num), cap: 225, marca: 'NADALIE', estado: 'VACIO',
  lote: '', cosecha: '', litros: 0, ...extra });

describe('camposCoherentes', () => {
  it('VACIO borra lote, cosecha y litros', () => {
    const r = camposCoherentes(fila(1, { estado: 'LLENO', lote: '26134', cosecha: '2026', litros: 225 }), { estado: 'VACIO' });
    expect(r.campos).toEqual({ estado: 'VACIO', lote: '', cosecha: '', litros: 0 });
  });
  it('ponerle lote a una VACIA es llenarla, con la cosecha deducida y litros = capacidad', () => {
    const r = camposCoherentes(fila(1), { lote: '26134' }, cosechaDe);
    expect(r.campos).toEqual({ estado: 'LLENO', lote: '26134', cosecha: '2026', litros: 225 });
  });
  it('MERMO conserva los litros', () => {
    const r = camposCoherentes(fila(1, { estado: 'LLENO', lote: '26134', cosecha: '2026', litros: 225 }), { estado: 'MERMO' });
    expect(r.campos).toMatchObject({ estado: 'MERMO', lote: '26134', litros: 225 });
  });
  it('LLENO o MERMO sin lote es un error', () => {
    expect(camposCoherentes(fila(1), { estado: 'LLENO' }).error).toMatch(/necesita lote/);
    expect(camposCoherentes(fila(1, { estado: 'LLENO', lote: 'X' }), { lote: '' }).error).toMatch(/necesita lote/);
  });
  it('un estado que no es de los tres es un error', () => {
    expect(camposCoherentes(fila(1), { estado: 'ROTO' }).error).toMatch(/desconocido/);
  });
  it('normaliza VACÍO con tilde', () => {
    expect(normEstado(' vacío ')).toBe('VACIO');
  });
  it('un lote que no deja deducir la cosecha conserva la que estaba', () => {
    const r = camposCoherentes(fila(1, { estado: 'LLENO', lote: '26134', cosecha: '2026' }), { lote: 'VERMUT' }, cosechaDe);
    expect(r.campos.cosecha).toBe('2026');
  });
});

describe('escribirFila', () => {
  it('escribe y sella fecha, ts y origen', () => {
    const f = fila(1);
    const r = escribirFila(f, { lote: '26134' }, { fecha: '2026-09-20', ts: 5, por: 'escaneo' }, cosechaDe);
    expect(r.despues).toMatchObject({ estado: 'LLENO', lote: '26134', fecha: '2026-09-20', ts: 5, por: 'escaneo' });
    expect(r.antes).toMatchObject({ estado: 'VACIO', fecha: '', ts: 0 });
    expect(f.fecha).toBe('2026-09-20');
  });
  it('caso 5: un hecho de ayer no pisa lo que se hizo hoy', () => {
    const f = fila(1, { estado: 'LLENO', lote: 'B', fecha: '2026-09-28', ts: 100 });
    const r = escribirFila(f, { estado: 'VACIO' }, { fecha: '2026-09-27', ts: 200 });
    expect(r.viejo).toBe(true);
    expect(f.estado).toBe('LLENO');
  });
  it('caso 5: el mismo día gana lo último que se cargó', () => {
    const f = fila(1, { estado: 'LLENO', lote: 'B', fecha: '2026-09-28', ts: 100 });
    const r = escribirFila(f, { estado: 'VACIO' }, { fecha: '2026-09-28', ts: 200 });
    expect(r.viejo).toBeUndefined();
    expect(f.estado).toBe('VACIO');
  });
  it('un error no toca la fila', () => {
    const f = fila(1);
    expect(escribirFila(f, { estado: 'LLENO' }, { fecha: '2026-09-28' }).error).toBeTruthy();
    expect(f).toEqual(fila(1));
  });
});

describe('carteles', () => {
  it('opciones: LLENO y MERMO por cada lote, más VACIO, sin repetir', () => {
    expect(opcionesDeLotes(['26134', '26134', '25104', ''])).toEqual([
      { estado: 'LLENO', lote: '26134' }, { estado: 'MERMO', lote: '26134' },
      { estado: 'LLENO', lote: '25104' }, { estado: 'MERMO', lote: '25104' },
      { estado: 'VACIO', lote: '' }]);
  });
  it('un hecho nuevo cierra los carteles del barril abiertos antes o el mismo día', () => {
    const cs = [{ num: '1', fecha: '2026-09-20' }, { num: '1', fecha: '2026-09-29' }, { num: '2', fecha: '2026-09-01' }];
    expect(cerrarCartelesDe(cs, '1', '2026-09-28')).toEqual([{ num: '1', fecha: '2026-09-29' }, { num: '2', fecha: '2026-09-01' }]);
  });
  it('el mismo barril por la misma orden reemplaza, no duplica', () => {
    const cs = [{ id: 'a', num: '1', origen: 'orden', ordenId: 'e1' }];
    agregarCartel(cs, { id: 'b', num: '1', origen: 'orden', ordenId: 'e1' });
    agregarCartel(cs, { id: 'c', num: '1', origen: 'orden', ordenId: 'e2' });
    expect(cs.map(c => c.id)).toEqual(['b', 'c']);
  });
});

describe('planOrden', () => {
  const inv = () => [
    fila('10', { estado: 'LLENO', lote: 'A', fecha: '2026-07-16' }),     // escaneada el 16/7
    fila('11', { estado: 'VACIO' }),
    fila('12', { estado: 'MERMO', lote: 'A', litros: 200 }),
    fila('13', { estado: 'LLENO', lote: 'B' }),
    fila('14', { estado: 'LLENO', lote: 'A', fecha: '2026-09-28' }),     // tocada hoy
  ];
  const orden = (tipo, codigos, extra = {}) => ({ id: 'e1', tipo, ot: '1234', lote: 'A', fecha: '2026-08-20', codigos, ...extra });

  it('caso 1: un vaciado entra aunque la vasija se haya escaneado antes', () => {
    const p = planOrden(orden('vaciado', ['10']), inv(), '2026-09-28');
    expect(p.cambios).toEqual([{ num: '10', cambio: { estado: 'VACIO' } }]);
    expect(p.carteles).toEqual([]);
  });
  it('caso 3: vaciar una VACIA no hace nada y no deja cartel', () => {
    const p = planOrden(orden('vaciado', ['11']), inv(), '2026-09-28');
    expect(p.sinCambio.map(x => x.num)).toEqual(['11']);
    expect(p.carteles).toEqual([]);
  });
  it('caso 4: llenar una MERMO con su mismo lote la deja LLENO', () => {
    const p = planOrden(orden('llenado', ['12']), inv(), '2026-09-28');
    expect(p.cambios).toEqual([{ num: '12', cambio: { estado: 'LLENO', lote: 'A' } }]);
  });
  it('caso 5: una orden más vieja que la fila no se aplica', () => {
    const p = planOrden(orden('vaciado', ['14']), inv(), '2026-09-28');
    expect(p.noAplicados[0]).toMatchObject({ num: '14' });
    expect(p.noAplicados[0].motivo).toMatch(/más nuevo, del 28\/9/);
  });
  it('caso 6: llenar una LLENO con otro lote abre un cartel con las opciones completas', () => {
    const p = planOrden(orden('llenado', ['13']), inv(), '2026-09-28');
    expect(p.cambios).toEqual([]);
    expect(p.carteles[0].num).toBe('13');
    expect(p.carteles[0].opciones).toEqual(opcionesDeLotes(['A', 'B']));
  });
  it('llenar una VACIA la llena; una no inventariada no se aplica', () => {
    const p = planOrden(orden('llenado', ['11', '99']), inv(), '2026-09-28');
    expect(p.cambios).toEqual([{ num: '11', cambio: { estado: 'LLENO', lote: 'A' } }]);
    expect(p.noAplicados).toEqual([{ num: '99', motivo: 'no figura en el inventario' }]);
  });
  it('una orden con fecha futura no es aplicable', () => {
    expect(planOrden(orden('vaciado', ['10'], { fecha: '2026-10-03' }), inv(), '2026-09-28').esFutura).toBe(true);
  });
  it('un tipo que no es llenado ni vaciado no es aplicable', () => {
    expect(planOrden(orden('muestra', ['10']), inv(), '2026-09-28').aplicable).toBe(false);
  });
});

describe('planDeshacer (caso 8)', () => {
  it('solo revierte los barriles donde la orden sigue siendo lo último', () => {
    const inv = [fila('1', { estado: 'VACIO', por: 'orden:e1', ts: 50 }),
                 fila('2', { estado: 'LLENO', lote: 'Z', por: 'escaneo', ts: 90, fecha: '2026-09-25' })];
    const orden = { id: 'e1', aplicado: { cambios: [
      { num: '1', antes: {}, despues: { estado: 'VACIO', ts: 50 } },
      { num: '2', antes: {}, despues: { estado: 'VACIO', ts: 50 } }] } };
    const p = planDeshacer(orden, inv);
    expect(p.revertir.map(c => c.num)).toEqual(['1']);
    expect(p.quedan[0]).toMatchObject({ num: '2' });
    expect(p.quedan[0].motivo).toMatch(/25\/9/);
  });
  it('las órdenes aplicadas con el motor viejo se comparan por lo que dejaron escrito', () => {
    const inv = [fila('1', { estado: 'VACIO' }), fila('2', { estado: 'LLENO', lote: 'Z' })];
    const orden = { id: 'e1', aplicado: { cambios: [
      { num: '1', despues: { estado: 'VACIO', lote: '', cosecha: '' } },
      { num: '2', despues: { estado: 'VACIO', lote: '', cosecha: '' } }] } };
    expect(planDeshacer(orden, inv).revertir.map(c => c.num)).toEqual(['1']);
  });
});

describe('planImportacion (caso 9)', () => {
  const inv = [fila('1', { estado: 'LLENO', lote: 'A', cosecha: '2026' }), fila('2'), fila('3', { alta: true })];
  it('agrega las nuevas, actualiza la ficha y abre cartel si cambia el estado', () => {
    const p = planImportacion([
      { num: '1', estado: 'VACIO', lote: '', cap: 225, marca: 'NADALIE' },     // la app dice LLENO A
      { num: '2', estado: 'VACÍO', lote: '', cap: 300, marca: 'NADALIE' },     // cambia la capacidad
      { num: '4', estado: 'LLENO', lote: 'C', cap: 225 },                     // nueva
    ], inv);
    expect(p.nuevas.map(n => n.num)).toEqual(['4']);
    expect(p.ficha).toEqual([{ num: '2', campos: { cap: 300 } }]);
    expect(p.carteles.map(c => c.num)).toEqual(['1']);
    expect(p.carteles[0].opciones).toEqual(opcionesDeLotes(['', 'A']));
    expect(p.faltan).toEqual(['3']);
  });
  it('una vasija dada de alta que la planilla trae pasa a ser de la planilla', () => {
    const p = planImportacion([{ num: '3', estado: 'VACIO', cap: 225, marca: 'NADALIE' }], inv);
    expect(p.ficha).toEqual([{ num: '3', campos: {} }]);
  });
});

describe('fusionar3', () => {
  const k = x => x.id;
  const base = fotoPorClave([{ id: 1, v: 'a' }, { id: 2, v: 'a' }, { id: 3, v: 'a' }], k);
  it('gana lo que cambié yo; lo que no toqué viene del servidor', () => {
    const local = [{ id: 1, v: 'yo' }, { id: 2, v: 'a' }, { id: 3, v: 'a' }];
    const serv = [{ id: 1, v: 'a' }, { id: 2, v: 'otro' }, { id: 3, v: 'a' }];
    expect(fusionar3(base, local, serv, k)).toEqual([{ id: 1, v: 'yo' }, { id: 2, v: 'otro' }, { id: 3, v: 'a' }]);
  });
  it('lo que borré se va, lo que agregué entra, lo que agregó otro se queda', () => {
    const local = [{ id: 1, v: 'a' }, { id: 2, v: 'a' }, { id: 9, v: 'nuevo' }];
    const serv = [{ id: 1, v: 'a' }, { id: 2, v: 'a' }, { id: 3, v: 'a' }, { id: 8, v: 'ajeno' }];
    expect(fusionar3(base, local, serv, k).map(x => x.id)).toEqual([1, 2, 8, 9]);
  });
  it('si los dos cambiaron lo mismo, gana el ts más nuevo', () => {
    const local = [{ id: 1, v: 'yo', ts: 5 }];
    const serv = [{ id: 1, v: 'otro', ts: 9 }];
    expect(fusionar3(base, local, serv, k)).toEqual([{ id: 1, v: 'otro', ts: 9 }]);
  });
});

describe('migración', () => {
  const viejo = () => ({
    inventario: [fila('1', { estado: 'LLENO', lote: 'A' }), fila('2', { estado: 'LLENO', lote: 'B' }), fila('3')],
    ediciones: [{ num: '1', campo: 'lote', valor: 'A2', fecha: '2026-09-10', ts: 10 }],
    tanques: [{ num: '1', lote: 'A2', fecha: '2026-07-16', ts: 1 },
              { num: '2', lote: 'Z', fecha: '2026-07-16', ts: 2 },
              { num: '777', lote: 'Q', fecha: '2026-07-01', ts: 3 }],
    revisiones: [{ num: '2', revisado: false }, { num: '1', revisado: true }],
    escaneos: [{ id: 'e1', fecha: '2026-09-15', aplicado: { cambios: [{ num: '3' }] } }],
  });
  it('detecta las secciones viejas', () => {
    expect(necesitaMigracion(viejo())).toBe(true);
    expect(necesitaMigracion({ inventario: [] })).toBe(false);
  });
  it('el plan lista dónde el escaneo contradice a la fila', () => {
    const p = planMigracion(viejo());
    expect(p.discrepancias).toEqual([{ num: '2', estadoFila: 'LLENO', loteFila: 'B', fechaFila: '',
      escaneo: 'Z', fechaEscaneo: '2026-07-16', recomendado: 'fila' }]);
    expect(p).toMatchObject({ ediciones: 1, cartelesViejos: 1, escaneos: 3, noFiguran: 1 });
  });
  it('un escaneo posterior al corte y a todo lo demás se recomienda', () => {
    const e = viejo();
    e.tanques[1].fecha = '2026-09-20';
    expect(planMigracion(e).discrepancias[0]).toMatchObject({ num: '2', recomendado: 'escaneo' });
  });
  it('un escaneo más viejo que una corrección no se recomienda', () => {
    const e = viejo();
    e.tanques[1].fecha = '2026-09-20';
    e.ediciones.push({ num: '2', campo: 'lote', valor: 'B', fecha: '2026-09-25', ts: 5 });
    expect(planMigracion(e).discrepancias[0]).toMatchObject({ num: '2', fechaFila: '2026-09-25', recomendado: 'fila' });
  });
  it('en las vasijas elegidas escribe lo que dijo el escaneo', () => {
    const e = viejo();
    migrarEstado(e, { usarEscaneo: ['2'], cosechaDe });
    expect(e.inventario[1]).toMatchObject({ estado: 'LLENO', lote: 'Z', fecha: '2026-07-16', por: 'escaneo' });
  });
  it('fija las correcciones, fecha las filas y borra las capas viejas', () => {
    const e = viejo();
    expect(migrarEstado(e)).toBe(3);
    expect(e.inventario[0]).toMatchObject({ lote: 'A2', fecha: '2026-09-10', por: 'migracion' });
    expect(e.inventario[1]).toMatchObject({ lote: 'B', fecha: '2026-07-16' });
    expect(e.inventario[2]).toMatchObject({ fecha: '2026-09-15' });
    expect(e.tanques).toBeUndefined();
    expect(e.ediciones).toBeUndefined();
    expect(e.revisiones).toBeUndefined();
    expect(e.carteles).toEqual([]);
  });
});
