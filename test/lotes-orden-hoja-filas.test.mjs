/* Tests de las filas de la Orden de muestras editadas sobre la hoja (sin
 * grilla): celdas, papel de analisis, pegar una columna y cantidades. */
import { describe, it, expect } from 'vitest';
import { FILAS_POR_HOJA_ORDEN, celdaHoja, celdaNumero, celdaLote, cfgHojasAnalisis,
         pegarLotesDesde, cantidadValida } from '../public/lotes/js/orden-hoja-filas.js';
import { cfgHojasMicro } from '../public/lotes/js/orden-micro.js';

const fila = (o = {}) => ({ lote: '26141', variedad: 'Malbec', vasija: 'Barricas', barril: '',
                            cantidad: 1, recipiente: 'Tubo falcon', ...o });

describe('celdas', () => {
  it('celdaHoja lleva fila, columna y valor escapado', () => {
    expect(celdaHoja(3, 'vasija', 'B "1" <x>', { lista: 'recs' }))
      .toBe('<input class="oh-celda" data-fila="3" data-col="vasija" list="recs" value="B &quot;1&quot; &lt;x>">');
  });
  it('el numero trae el ✕ de quitar esa fila', () => {
    expect(celdaNumero(0, 1)).toMatch(/^<td class="c oh-num">1<button[^>]*data-quitar="0"/);
  });
  it('un lote inexistente se marca', () => {
    expect(celdaLote(0, { lote: '99999', noEncontrado: true })).toContain('oh-noexiste');
    expect(celdaLote(0, { lote: '26141' })).not.toContain('oh-noexiste');
  });
});

describe('papel de analisis', () => {
  it('50 filas por hoja, compacto, con agregar fila en la ultima', () => {
    const c = cfgHojasAnalisis({ filas: [fila()] });
    expect(c.porPagina).toBe(FILAS_POR_HOJA_ORDEN);
    expect(FILAS_POR_HOJA_ORDEN).toBe(50);
    expect(c.claseHoja).toBe('oh-compacta');
    expect(c.despuesTablaUltima).toContain('oh-agregar');
  });
  it('fila editable: lote, vasija, cantidad y recipiente; variedad como texto', () => {
    const c = cfgHojasAnalisis({ filas: [fila()], listaRecipientes: 'otRecLista' });
    const tr = c.renderFila({ numero: 1, fila: fila() });
    for (const col of ['lote', 'vasija', 'cantidad', 'recipiente'])
      expect(tr).toContain(`data-fila="0" data-col="${col}"`);
    expect(tr).toContain('list="otRecLista"');
    expect(tr).toContain('<td>Malbec</td>');
    expect(tr).not.toContain('data-col="barril"');
  });
  it('la columna Barril aparece solo si alguna fila tiene barril', () => {
    const sin = cfgHojasAnalisis({ filas: [fila()] });
    const con = cfgHojasAnalisis({ filas: [fila(), fila({ barril: '1234' })] });
    expect(sin.columnas).toBe(7);
    expect(con.columnas).toBe(8);
    expect(con.thead).toContain('BARRIL');
    expect(con.renderFila({ numero: 2, fila: fila({ barril: '1234' }) })).toContain('data-col="barril"');
  });
});

describe('papel de microbiologia', () => {
  it('tambien 50 por hoja, con lote y vasija editables', () => {
    const c = cfgHojasMicro({ filas: [fila()], textos: null });
    expect(c.porPagina).toBe(50);
    expect(c.claseHoja).toBe('oh-compacta oh-micro');
    const tr = c.renderFila({ numero: 1, fila: fila() });
    expect(tr).toMatch(/data-col="lote"[^>]*value="26141"/);
    expect(tr).toContain('data-col="vasija" value="Barricas"');
    expect(tr).not.toContain('Malbec');
  });
});

describe('pegarLotesDesde', () => {
  const nueva = () => ({ lote: '', cantidad: 1 });
  it('llena hacia abajo desde la fila elegida y crea las que faltan', () => {
    const filas = [{ lote: 'a' }, { lote: 'b' }];
    const r = pegarLotesDesde(filas, 1, ['1', '2', '3'], nueva);
    expect(r.filas.map(f => f.lote)).toEqual(['a', '1', '2', '3']);
    expect(r.tocadas).toEqual([1, 2, 3]);
    expect(r.filas[3].cantidad).toBe(1);
    expect(r.filas[1].manual).toBe(true);
    expect(filas[1].lote).toBe('b');   // no muta
  });
});

describe('cantidadValida', () => {
  it('enteros >= 1, redondeados; el resto null', () => {
    expect(cantidadValida('2')).toBe(2);
    expect(cantidadValida('2,6')).toBe(3);
    expect(cantidadValida('0')).toBeNull();
    expect(cantidadValida('')).toBeNull();
    expect(cantidadValida('abc')).toBeNull();
  });
});
