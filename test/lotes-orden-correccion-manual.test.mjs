/* Tests de las dosis a mano de la Orden de correccion de SO2 (la dosis que se
 * escribe sobre la hoja y se guarda). */
import { describe, it, expect } from 'vitest';
import { claveVasija, dosisDesdeUnidad, aplicarManuales } from '../public/lotes/js/orden-correccion-manual.js';
import { gruposPorLote, filasPapelPorModo } from '../public/lotes/js/orden-correccion-papel.js';
import { armarOrdenGuardada } from '../public/lotes/js/orden-correccion-guardada.js';

const sol = { prod: 'Sol1030', dec: 1, suf: 'mL', de: d => d.ml_solucion };
const mbk = { prod: 'MBK', dec: 2, suf: 'g', de: d => d.mbk_g };

/* Misma formula que _dosis de vista-orden-correccion.js. */
const dosis = (dif, L) => ({ mbk_g: ((dif * L * 1.5) / 1000) * 2, ml_solucion: (dif * L * 1.5) / 55 });

/* Filas como las arma _ocBuildRows. */
function filasDe(lote, so2, objetivo, barricas){
  const l = { lote, variedad: 'Malbec', so2_libre: so2, barricas };
  const dif = objetivo - so2;
  const bs = barricas.map(b => ({ tipo: 'barrica', lote: l, barrica: b, dosis: dosis(dif, b.litros_usados) }));
  return [{ tipo: 'lote', lote: l, objetivo, diferencia: dif,
            mbk_total_g: bs.reduce((s, f) => s + f.dosis.mbk_g, 0),
            ml_total: bs.reduce((s, f) => s + f.dosis.ml_solucion, 0) }, ...bs];
}
const barr = (num, litros = 225) => ({ num, vasija: '', cap: 225, litros_usados: litros, estado: 'LLENO' });

describe('claveVasija', () => {
  it('con numero de barril usa el numero', () => {
    expect(claveVasija({ num: '1203' }, 4)).toBe('n:1203');
  });
  it('sin numero usa la posicion en el lote', () => {
    expect(claveVasija({ num: '', vasija: 'T 201' }, 2)).toBe('i:2');
    expect(claveVasija({}, 0)).toBe('i:0');
  });
});

describe('dosisDesdeUnidad', () => {
  it('mL de solucion -> las dos formas, con la equivalencia de la formula', () => {
    const d = dosisDesdeUnidad(50, 'sol');
    expect(d.ml_solucion).toBe(50);
    // la misma correccion dicha en gramos: la proporcion de _dosis
    const ref = dosis(10, 225);
    expect(d.mbk_g).toBeCloseTo(50 * ref.mbk_g / ref.ml_solucion, 9);
    expect(d.mbk_g).toBeCloseTo(5.5, 9);
  });
  it('gramos de MBK -> las dos formas', () => {
    const d = dosisDesdeUnidad(11, 'mbk');
    expect(d.mbk_g).toBe(11);
    expect(d.ml_solucion).toBeCloseTo(100, 9);
  });
});

describe('aplicarManuales', () => {
  it('sin dosis a mano deja las mismas dosis y marca clave y manual=false', () => {
    const filas = filasDe('26001', 18, 35, [barr('11'), barr('12')]);
    const out = aplicarManuales(filas, new Map());
    expect(out.map(f => f.dosis)).toEqual(filas.map(f => f.dosis));
    expect(out[1].clave).toBe('n:11');
    expect(out[2].clave).toBe('n:12');
    expect(out[1].manual).toBe(false);
    expect(out[0].ml_total).toBeCloseTo(filas[0].ml_total, 9);
  });

  it('no toca las filas de entrada', () => {
    const filas = filasDe('26001', 18, 35, [barr('11')]);
    const antes = JSON.stringify(filas);
    aplicarManuales(filas, new Map([['26001', new Map([['n:11', dosisDesdeUnidad(1, 'sol')]])]]));
    expect(JSON.stringify(filas)).toBe(antes);
  });

  it('la dosis a mano reemplaza la de esa vasija y los totales del lote salen de las dosis', () => {
    const filas = filasDe('26001', 18, 35, [barr('11'), barr('12')]);
    const man = new Map([['26001', new Map([['n:12', dosisDesdeUnidad(40, 'sol')]])]]);
    const out = aplicarManuales(filas, man);
    expect(out[2].dosis.ml_solucion).toBe(40);
    expect(out[2].manual).toBe(true);
    expect(out[1].manual).toBe(false);
    expect(out[0].ml_total).toBeCloseTo(filas[1].dosis.ml_solucion + 40, 9);
    expect(out[0].mbk_total_g).toBeCloseTo(filas[1].dosis.mbk_g + 4.4, 9);
  });

  it('las vasijas sin numero se identifican por su posicion', () => {
    const tq = { num: '', vasija: 'T 201', cap: null, litros_usados: 3000 };
    const filas = filasDe('26005', 18, 30, [tq, { ...tq, vasija: 'T 202' }]);
    const out = aplicarManuales(filas, new Map([['26005', new Map([['i:1', dosisDesdeUnidad(500, 'sol')]])]]));
    expect(out[1].manual).toBe(false);
    expect(out[2].dosis.ml_solucion).toBe(500);
  });

  it('una dosis a mano de otro lote no se aplica', () => {
    const filas = filasDe('26001', 18, 35, [barr('11')]);
    const out = aplicarManuales(filas, new Map([['26999', new Map([['n:11', dosisDesdeUnidad(1, 'sol')]])]]));
    expect(out[1].manual).toBe(false);
  });
});

describe('renglones del papel con dosis a mano', () => {
  it('cada renglon Generica lleva las claves de las vasijas que junta', () => {
    const filas = aplicarManuales(filasDe('26001', 18, 35, [barr('11'), barr('12'), barr('13', 180)]), new Map());
    const g = gruposPorLote(filas, sol);
    expect(g.map(x => x.claves)).toEqual([['n:11', 'n:12'], ['n:13']]);
    expect(g.every(x => x.manual === false)).toBe(true);
  });

  it('un barril con dosis a mano distinta se separa de su grupo y va marcado', () => {
    const man = new Map([['26001', new Map([['n:12', dosisDesdeUnidad(99, 'sol')]])]]);
    const filas = aplicarManuales(filasDe('26001', 18, 35, [barr('11'), barr('12'), barr('13')]), man);
    const g = gruposPorLote(filas, sol);
    expect(g.map(x => x.claves)).toEqual([['n:11', 'n:13'], ['n:12']]);
    expect(g[1].manual).toBe(true);
    expect(g[1].dosis).toBe(99);
  });

  it('Por barril: un renglon por vasija, con su clave', () => {
    const filas = aplicarManuales(filasDe('26014', 21, 40, [barr('21'), barr('22')]), new Map());
    const g = filasPapelPorModo(filas, () => 'barril', mbk);
    expect(g.map(x => x.claves)).toEqual([['n:21'], ['n:22']]);
  });
});

/* La garantia del subsistema, ahora con dosis a mano: lo que dice el papel es
 * lo que se guarda. */
describe('papel == guardado con dosis a mano', () => {
  for (const [unidad, u, de] of [['sol', sol, v => v.ml], ['mbk', mbk, v => v.mbk_g]]){
    it('unidad ' + unidad, () => {
      const man = new Map([['26001', new Map([['n:11', dosisDesdeUnidad(30, 'sol')],
                                               ['n:12', dosisDesdeUnidad(30, 'sol')]])]]);
      const filas = aplicarManuales([...filasDe('26001', 18, 35, [barr('11'), barr('12')]),
                                     ...filasDe('26014', 21, 40, [barr('21'), barr('22', 180)])], man);
      const modos = new Map([['26001', 'generica'], ['26014', 'barril']]);
      const papel = new Map();
      for (const g of filasPapelPorModo(filas, l => modos.get(l.lote), u))
        papel.set(g.lote.lote, (papel.get(g.lote.lote) || 0) + g.dosis * g.cantidad);
      const orden = armarOrdenGuardada({ id: 'x', numero: 'B1', fecha: '2026-11-02', unidad, filas, modos });
      for (const l of orden.lotes){
        expect(l.vasijas.reduce((s, v) => s + de(v), 0)).toBeCloseTo(papel.get(l.lote), 6);
      }
      expect(orden.lotes[0].vasijas.map(v => v.ml)).toEqual([30, 30]);
      expect(orden.lotes[0].ml_total).toBeCloseTo(60, 9);
    });
  }
});
