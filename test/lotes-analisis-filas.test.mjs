/* Tests de analisis-filas.js: las funciones puras detras de la pestana
 * Analisis. El modulo no toca el DOM, asi que se importa tal cual dentro del
 * runtime de Workers, igual que lotes-anchos.test.mjs y lotes-vacios.test.mjs.
 *
 * indicesPorObjeto nacio de un arreglo de rendimiento: el pintado hacia un
 * DATOS().analisis.indexOf(registro) POR FILA, o sea O(N^2) por repintado. Con
 * los 5 analisis de la D1 local no se notaba; con los miles de produccion, si.
 * Lo que se testea aca es que el mapa diga exactamente lo mismo que decia el
 * indexOf que reemplaza, porque de ese numero cuelga que los colores de "fuera
 * de criterio" caigan en la fila correcta: la API los devuelve indexados por
 * posicion en el array.
 */
import { describe, it, expect } from 'vitest';
import { indicesPorObjeto, armarFilas,
         esQuimicaReal, esCorreccionReal, estadoCartelLote, firmaVeredicto } from '../public/lotes/js/analisis-filas.js';

describe('indicesPorObjeto', () => {
  it('da para cada objeto la misma posicion que indexOf', () => {
    const arr = [{ lote: 1 }, { lote: 2 }, { lote: 3 }];
    const m = indicesPorObjeto(arr);
    for (const o of arr) expect(m.get(o)).toBe(arr.indexOf(o));
  });

  it('identifica por referencia, no por contenido', () => {
    // Dos registros con los mismos valores son filas distintas de la tabla y
    // tienen que quedar en posiciones distintas.
    const a = { lote: 7, ph: 3.5 }, b = { lote: 7, ph: 3.5 };
    const m = indicesPorObjeto([a, b]);
    expect(m.get(a)).toBe(0);
    expect(m.get(b)).toBe(1);
  });

  it('se queda con la PRIMERA posicion si el objeto esta repetido', () => {
    // Mismo criterio que indexOf. No deberia pasar, pero si pasara, las dos
    // formas de buscar tienen que coincidir: si difirieran, los colores se
    // correrian de fila en silencio en vez de fallar de forma visible.
    const o = { lote: 4 };
    const arr = [{ lote: 1 }, o, { lote: 3 }, o];
    expect(indicesPorObjeto(arr).get(o)).toBe(arr.indexOf(o));
    expect(indicesPorObjeto(arr).get(o)).toBe(1);
  });

  it('devuelve undefined para un objeto que no esta', () => {
    // indexOf devolvia -1; get devuelve undefined. Los dos son falsy y los dos
    // hacen que _analisisFlags.get(...) no encuentre nada, que es lo que el
    // llamador necesita.
    const m = indicesPorObjeto([{ lote: 1 }]);
    expect(m.get({ lote: 1 })).toBeUndefined();
  });

  it('tolera un array vacio, null o undefined', () => {
    for (const basura of [[], null, undefined])
      expect(indicesPorObjeto(basura).size).toBe(0);
  });

  it('indexa TODO el array, no solo lo que se ve', () => {
    // El mapa se arma sobre DATOS().analisis entero, mientras que las filas
    // pintadas salen del array ya filtrado: la posicion tiene que ser la del
    // array completo o los flags se leen de otra fila.
    const arr = Array.from({ length: 500 }, (_, i) => ({ lote: i }));
    const m = indicesPorObjeto(arr);
    expect(m.size).toBe(500);
    expect(m.get(arr[499])).toBe(499);
  });
});

describe('armarFilas', () => {
  const quimica = (lote, fecha) => ({ lote, fecha_analisis: fecha, ph: 3.6 });
  const soloCorreccion = (lote) => ({ lote, correccion: { ot_n: 'OT-1' } });

  it('agrupa por lote y antepone un separador a cada grupo', () => {
    const filas = armarFilas([quimica(2, '2026-01-01'), quimica(1, '2026-01-01')], null, null);
    expect(filas.map(f => f.tipo)).toEqual(['separador', 'quimica', 'separador', 'quimica']);
    // los grupos salen por numero de lote, no por orden de aparicion
    expect(filas[0].lote).toBe('1');
    expect(filas[2].lote).toBe('2');
  });

  it('un registro con quimica y correccion da DOS filas sobre el mismo objeto', () => {
    const o = { lote: 5, ph: 3.4, correccion: { ot_n: 'OT-9' } };
    const filas = armarFilas([o], null, null).filter(f => f.tipo !== 'separador');
    expect(filas.map(f => f.tipo)).toEqual(['quimica', 'correccion']);
    // la misma referencia en las dos: escribir en una es escribir en el dato
    expect(filas[0].analisis).toBe(o);
    expect(filas[1].analisis).toBe(o);
  });

  it('ordena dentro del grupo segun sortState', () => {
    const viejo = quimica(1, '2026-01-01'), nuevo = quimica(1, '2026-06-01');
    const asc = armarFilas([nuevo, viejo], { key: 'fecha_analisis', dir: 1 }, null);
    expect(asc.slice(1).map(f => f.analisis)).toEqual([viejo, nuevo]);
    const desc = armarFilas([nuevo, viejo], { key: 'fecha_analisis', dir: -1 }, null);
    expect(desc.slice(1).map(f => f.analisis)).toEqual([nuevo, viejo]);
  });

  it('no deja un separador sin filas debajo cuando el filtro vacia el grupo', () => {
    // El filtro se aplica ANTES de agrupar justamente para esto.
    const filas = armarFilas([quimica(1, '2026-01-01')], null, () => false);
    expect(filas).toEqual([]);
  });

  it('un registro sin quimica real no genera fila de quimica', () => {
    const filas = armarFilas([soloCorreccion(3)], null, null).filter(f => f.tipo !== 'separador');
    expect(filas.map(f => f.tipo)).toEqual(['correccion']);
  });
});

describe('esQuimicaReal / esCorreccionReal', () => {
  it('cuenta el 0 como medicion real', () => {
    // Un SO2 libre en 0 es un valor medido, no la ausencia de medicion.
    expect(esQuimicaReal({ so2_libre: 0 })).toBe(true);
  });

  it('no cuenta null ni cadena vacia', () => {
    expect(esQuimicaReal({ ph: null, av: '' })).toBe(false);
    expect(esQuimicaReal({})).toBe(false);
    expect(esQuimicaReal(null)).toBe(false);
  });

  it('la correccion es real solo con ot_n o so2_deseado', () => {
    expect(esCorreccionReal({ ot_n: 'OT-3' })).toBe(true);
    expect(esCorreccionReal({ so2_deseado: 30 })).toBe(true);
    // mbk_a_agregar en 0 es el relleno que dejo la migracion del Excel
    expect(esCorreccionReal({ mbk_a_agregar: 0 })).toBe(false);
    expect(esCorreccionReal(null)).toBe(false);
  });
});

/* El cartel del lote (la franja con el numero) dice como esta el lote segun su
 * ULTIMO analisis. Antes tomaba la ultima medicion de cada metrica por
 * separado, asi que un valor viejo que nadie volvio a medir dejaba el cartel
 * naranja aunque el analisis de hoy estuviera todo bien. */
describe('estadoCartelLote', () => {
  const v = (fecha, fuera = [], dentro = []) => ({ fecha, fuera: new Set(fuera), dentro: new Set(dentro) });

  it('manda el ultimo analisis aunque uno viejo tenga algo fuera', () => {
    expect(estadoCartelLote([
      v('2026-08-01', ['malico'], ['so2_libre']),
      v('2026-09-14', [], ['so2_libre', 'so2_molecular', 'ph']),
    ])).toBe('ok');
  });

  it('naranja si el ultimo analisis tiene algo fuera', () => {
    expect(estadoCartelLote([
      v('2026-08-01', [], ['ph']),
      v('2026-09-14', ['av'], ['ph']),
    ])).toBe('mal');
  });

  it('no depende del orden en que llegan las filas', () => {
    expect(estadoCartelLote([
      v('2026-09-14', [], ['ph']),
      v('2026-08-01', ['av'], []),
    ])).toBe('ok');
  });

  /* Caso real 26333 del 13/11: analisis con SO2 bajo, correccion, y otro
   * analisis despues de corregir, todo el mismo dia. Manda el cargado ultimo. */
  const vo = (fecha, orden, fuera = [], dentro = []) => ({ ...v(fecha, fuera, dentro), orden });

  it('el mismo ultimo dia manda el analisis cargado ultimo', () => {
    expect(estadoCartelLote([
      vo('2026-11-13', 0, ['so2_libre', 'so2_molecular'], ['ph']),
      vo('2026-11-13', 1, [], ['so2_libre', 'so2_molecular', 'ph']),
    ])).toBe('ok');
    expect(estadoCartelLote([
      vo('2026-11-13', 0, [], ['ph']),
      vo('2026-11-13', 1, ['av'], []),
    ])).toBe('mal');
  });

  it('el cargado ultimo se elige por orden de carga, no por posicion en la lista', () => {
    expect(estadoCartelLote([
      vo('2026-11-13', 5, [], ['ph']),
      vo('2026-11-13', 2, ['so2_libre'], []),
    ])).toBe('ok');
  });

  it('saltea los analisis sin ningun veredicto (sin medicion juzgable)', () => {
    expect(estadoCartelLote([
      v('2026-08-01', [], ['ph']),
      v('2026-09-30'),
    ])).toBe('ok');
  });

  it('sin ningun veredicto no hay color', () => {
    expect(estadoCartelLote([v('2026-09-30'), v('')])).toBe(null);
    expect(estadoCartelLote([])).toBe(null);
  });

  it('una fila sin fecha no le gana a una con fecha', () => {
    expect(estadoCartelLote([
      v('', ['av'], []),
      v('2026-09-14', [], ['ph']),
    ])).toBe('ok');
  });

  it('si solo hay filas sin fecha, se juzga con ellas', () => {
    expect(estadoCartelLote([v('', ['av'], [])])).toBe('mal');
  });
});

describe('fila de otros agregados', () => {
  it('un registro con agregados vigentes da una fila de tipo agregado; anulados no', () => {
    const quim = { lote: '1', fecha_analisis: '2026-10-01', ph: 3.5,
      agregados: [{ producto: 'TH2', cantidad: 380, unidad: 'g', ot_n: 'B1' }] };
    const solo = { lote: '1', fecha_analisis: '2026-10-02',
      agregados: [{ producto: 'T1', ot_n: 'B2', anulada: { por: 'x' } }] };
    const filas = armarFilas([quim, solo]);
    expect(filas.map(f => f.tipo)).toEqual(['separador', 'quimica', 'agregado']);
    expect(filas[2].analisis).toBe(quim);
  });
});

describe('firmaVeredicto', () => {
  const base = () => ({ lote: '26005', fecha_analisis: '2026-08-10', ph: 3.2, av: 0, so2_libre: 7,
                        gluc_fruc: 2.7, malico: 2.82, comentario: 'x', ot: 'B 209' });

  it('cambia si cambia una medicion que juzga el servidor', () => {
    const a = base(), f = firmaVeredicto(a);
    a.ph = 3.9;
    expect(firmaVeredicto(a)).not.toBe(f);
  });

  it('vuelve a ser la misma si el valor vuelve (Ctrl+Z)', () => {
    const a = base(), f = firmaVeredicto(a);
    a.so2_libre = 30;
    a.so2_libre = 7;
    expect(firmaVeredicto(a)).toBe(f);
  });

  it('cuenta la correccion y el so2_libre_actual (los mira so2LibreDe)', () => {
    const a = base(), f = firmaVeredicto(a);
    a.correccion = { so2_libre_actual: 20 };
    expect(firmaVeredicto(a)).not.toBe(f);
  });

  it('no cambia por el comentario ni la OT: no tienen criterio', () => {
    const a = base(), f = firmaVeredicto(a);
    a.comentario = 'otro'; a.ot = '999';
    expect(firmaVeredicto(a)).toBe(f);
  });

  it('un numero y su texto equivalente no se confunden con otro valor', () => {
    const a = base(); const b = { ...base(), ph: '3.2' };
    expect(firmaVeredicto(a)).not.toBe(firmaVeredicto({ ...base(), ph: 3.3 }));
    expect(typeof firmaVeredicto(b)).toBe('string');
  });
});
