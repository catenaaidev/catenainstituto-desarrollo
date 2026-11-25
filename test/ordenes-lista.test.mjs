import { describe, it, expect } from 'vitest';
import { filtrar, conEtiquetaModulo, contarPendientes, estadoDeURL, urlDeEstado, urlAbrir, urlNueva,
         ordenar, opcionesDe, lista, unirLista, hayFiltros, ESTADO_LIMPIO } from '../public/ordenes/js/lista.js';

const O = (x) => ({ modulo: 'lotes', id: 'x', fuente: 'ordenes_trabajo', tipo: 'traslado', numero: '0945',
  fecha: '2026-11-03', estado: 'pendiente', lotes: ['26217'], lote_corte: '', emitio: 'Ana', ...x });
const LISTA = [
  O({ id: 'a' }),
  O({ id: 'b', estado: 'ejecutada', numero: '0900', fecha: '2026-10-01' }),
  O({ id: 'c', tipo: 'correccion', fuente: 'ordenes_correccion', numero: 'B240', lotes: ['26100'] }),
  O({ id: 'd', estado: 'anulada', tipo: 'correccion', numero: 'B200' }),
  O({ id: 'e', tipo: 'barricas-tanque', lote_corte: '26900', lotes: ['1', '2'] }),
];
const ids = (r) => r.map((o) => o.id);

describe('filtrar', () => {
  it('pendientes = solo estado pendiente; historial = ejecutadas y anuladas', () => {
    expect(ids(filtrar(LISTA, { vista: 'pendientes' }))).toEqual(['a', 'c', 'e']);
    expect(ids(filtrar(LISTA, { vista: 'historial' }))).toEqual(['b', 'd']);
  });
  it('por tipo y por módulo', () => {
    expect(ids(filtrar(LISTA, { vista: 'pendientes', tipo: 'correccion' }))).toEqual(['c']);
    expect(ids(filtrar(LISTA, { vista: 'pendientes', modulo: 'prensas' }))).toEqual([]);
  });
  it('por rango de fecha (inclusive)', () => {
    expect(ids(filtrar(LISTA, { vista: 'historial', desde: '2026-10-02' }))).toEqual(['d']);
    expect(ids(filtrar(LISTA, { vista: 'historial', hasta: '2026-10-01' }))).toEqual(['b']);
  });
  it('el texto busca en N°, lotes y lote del corte', () => {
    expect(ids(filtrar(LISTA, { vista: 'pendientes', q: 'b24' }))).toEqual(['c']);
    expect(ids(filtrar(LISTA, { vista: 'pendientes', q: '26100' }))).toEqual(['c']);
    expect(ids(filtrar(LISTA, { vista: 'pendientes', q: '26900' }))).toEqual(['e']);
  });
});

describe('contarPendientes', () => {
  it('cuenta solo las pendientes', () => expect(contarPendientes(LISTA)).toBe(3));
});

describe('estado ⇄ URL', () => {
  it('ida y vuelta, sin claves vacías', () => {
    const e = { ...ESTADO_LIMPIO, v: 'pendientes', modulo: 'lotes', q: '0945' };
    expect(urlDeEstado(e)).toBe('?v=pendientes&modulo=lotes&q=0945');
    expect(estadoDeURL('?v=pendientes&modulo=lotes&q=0945')).toEqual(e);
  });
  it('una vista desconocida es la portada', () => {
    expect(estadoDeURL('?v=raro').v).toBe('');
    expect(estadoDeURL('').v).toBe('');
  });
});

describe('enlaces', () => {
  it('abrir una orden de Lotes en modo órdenes, con la vuelta', () => {
    expect(urlAbrir(O({ id: 'ot-1' }), '/ordenes/?v=pendientes'))
      .toBe('/lotes/?orden=ot-1&volver=%2Fordenes%2F%3Fv%3Dpendientes');
  });
  it('nueva orden', () => {
    expect(urlNueva({ id: 'traslado', modulo: 'lotes' }, '/ordenes/?v=nueva'))
      .toBe('/lotes/?orden=nueva%3Atraslado&volver=%2Fordenes%2F%3Fv%3Dnueva');
  });
  it('una impresa de la guía abre la guía en solo lectura', () => {
    expect(urlAbrir({ modulo: 'guia', id: '7' }, '/ordenes/?v=historial')).toBe('/ordenes/?v=guia&impresa=7');
  });
});

describe('la URL conserva impresa', () => {
  it('la URL conserva impresa', () => {
    const e = estadoDeURL('?v=guia&impresa=7');
    expect(e.impresa).toBe('7');
    expect(urlDeEstado(e)).toBe('?v=guia&impresa=7');
  });
});

describe('vista guia', () => {
  it('?v=guia es una vista válida y vuelve a la URL', () => {
    expect(estadoDeURL('?v=guia').v).toBe('guia');
    expect(urlDeEstado({ v: 'guia' })).toBe('?v=guia');
  });
});

describe('conEtiquetaModulo (etiqueta Prensas/Lotes por fila, Pendientes e Historial)', () => {
  const P = O({ id: 'p', modulo: 'prensas', tipo: 'prensas-muestras' });
  it('con rol en los dos módulos: siempre, aunque las filas sean de uno solo', () => {
    expect(conEtiquetaModulo([O({})], ['prensas', 'lotes'])).toBe(true);
    expect(conEtiquetaModulo(filtrar(LISTA, { vista: 'historial' }), ['prensas', 'lotes'])).toBe(true);
  });
  it('con rol en un solo módulo y filas de ese módulo: no', () => {
    expect(conEtiquetaModulo([O({})], ['lotes'])).toBe(false);
  });
  it('si las filas mezclan módulos: sí', () => {
    expect(conEtiquetaModulo([O({}), P], ['lotes'])).toBe(true);
  });
  it('una fila de la guía no cuenta como módulo (el Tipo ya dice "Guía de trabajos")', () => {
    expect(conEtiquetaModulo([O({ modulo: 'lotes' }), O({ modulo: 'guia' })], ['lotes'])).toBe(false);
  });
});

/* Embudos en los títulos de Pendientes / Historial. */
describe('embudos', () => {
  const H = [
    O({ id: 'h1', estado: 'ejecutada', numero: '0901', fecha: '2026-10-20', emitio: 'Ana', lotes: ['26038'] }),
    O({ id: 'h2', estado: 'anulada', numero: 'B241', tipo: 'correccion', fecha: '2026-11-05', emitio: 'Oriana', lotes: ['26034', '26038'] }),
    O({ id: 'h3', estado: 'ejecutada', numero: '0950', modulo: 'prensas', tipo: 'muestras', fecha: '2026-11-01', emitio: 'Ana', lotes: ['25012'] }),
    O({ id: 'h4', estado: 'ejecutada', numero: '0956', tipo: 'muestras', fecha: '2026-10-27', emitio: 'Luis', lotes: ['1', '2'], lote_corte: '26328' }),
  ];
  const f = (e) => ids(filtrar(H, { vista: 'historial', ...e }));

  it('lista / unirLista: valores separados por |, sin vacíos', () => {
    expect(lista('a|b||c')).toEqual(['a', 'b', 'c']);
    expect(lista('')).toEqual([]);
    expect(unirLista(['x', 'y'])).toBe('x|y');
  });
  it('N°: texto contenido, sin importar mayúsculas', () => {
    expect(f({ n: '09' })).toEqual(['h1', 'h3', 'h4']);
    expect(f({ n: 'b2' })).toEqual(['h2']);
  });
  it('tipo: varios, por módulo:tipo (y el valor viejo sin módulo sigue andando)', () => {
    expect(f({ tipo: 'lotes:muestras|lotes:correccion' })).toEqual(['h2', 'h4']);
    expect(f({ tipo: 'prensas:muestras' })).toEqual(['h3']);
    expect(f({ tipo: 'muestras' })).toEqual(['h3', 'h4']);
  });
  it('lote: alguno de los elegidos; el lote del corte cuenta', () => {
    expect(f({ lote: '26038' })).toEqual(['h1', 'h2']);
    expect(f({ lote: '26328|25012' })).toEqual(['h3', 'h4']);
  });
  it('estado y emitió: varios', () => {
    expect(f({ est: 'anulada' })).toEqual(['h2']);
    expect(f({ emitio: 'Ana|Luis' })).toEqual(['h1', 'h3', 'h4']);
  });
  it('los filtros se combinan', () => {
    expect(f({ emitio: 'Ana', lote: '26038' })).toEqual(['h1']);
  });
  it('opcionesDe: los valores que aparecen, sin repetir, ordenados', () => {
    expect(opcionesDe(H, 'lote')).toEqual(['1', '2', '25012', '26034', '26038', '26328']);
    expect(opcionesDe(H, 'emitio')).toEqual(['Ana', 'Luis', 'Oriana']);
    expect(opcionesDe(H, 'est')).toEqual(['anulada', 'ejecutada']);
    expect(opcionesDe(H, 'tipo')).toEqual(['lotes:correccion', 'lotes:muestras', 'lotes:traslado', 'prensas:muestras']);
  });
  it('ordenar: por columna asc/desc; sin orden queda como vino', () => {
    expect(ids(ordenar(H, ''))).toEqual(['h1', 'h2', 'h3', 'h4']);
    expect(ids(ordenar(H, 'fecha-asc'))).toEqual(['h1', 'h4', 'h3', 'h2']);
    expect(ids(ordenar(H, 'fecha-desc'))).toEqual(['h2', 'h3', 'h4', 'h1']);
    expect(ids(ordenar(H, 'numero-asc'))).toEqual(['h1', 'h3', 'h4', 'h2']);
    expect(ids(ordenar(H, 'emitio-asc'))).toEqual(['h1', 'h3', 'h4', 'h2']);
    // Lotes: el del corte, si no el primero; comparados como números.
    expect(ids(ordenar(H, 'lotes-asc'))).toEqual(['h3', 'h2', 'h1', 'h4']);
  });
  it('hayFiltros: cualquier filtro puesto, no la vista ni el orden', () => {
    expect(hayFiltros({ ...ESTADO_LIMPIO, v: 'historial', orden: 'fecha-asc' })).toBe(false);
    expect(hayFiltros({ ...ESTADO_LIMPIO, v: 'historial', emitio: 'Ana' })).toBe(true);
  });
  it('los filtros nuevos van y vuelven por la URL', () => {
    const e = { ...ESTADO_LIMPIO, v: 'historial', tipo: 'lotes:muestras|prensas:muestras', lote: '26038', orden: 'fecha-asc' };
    expect(estadoDeURL(urlDeEstado(e))).toEqual(e);
  });
});
