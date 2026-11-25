/* Tests de ot-renumerar.js: cambiar el N° de una OT ya emitida arrastra sus
 * movimientos, mermas y las correcciones registradas desde la OT. */
import { describe, it, expect } from 'vitest';
import { renumerarOT } from '../public/lotes/js/ot-renumerar.js';

function datos(){
  const ot = { id: 'ot-1', ot: '0947', lotes: [{ lote: '26210', mov_id: 'ot-1-0' }], lote_corte: { lote: '26300' } };
  return {
    ordenes_trabajo: [ot, { id: 'ot-2', ot: '0948', lotes: [{ lote: '26210', mov_id: 'ot-2-0' }] }],
    movimientos: [{ id: 'ot-1-0', lote: '26210', ot: '0947' }, { id: 'ot-2-0', lote: '26210', ot: '0948' },
                  { id: 'suelto', lote: '26211', ot: '0947' }],
    mermas: [{ lote: '26210', ot: '0947' }, { lote: '26211', ot: '0947' }, { lote: '26210', ot: '0948' }],
    analisis: [
      { lote: 26300, correccion: { ot_n: '0947' }, agregados: [{ producto: 'TH2', ot_n: '0947' }, { producto: 'X', ot_n: 'B211' }] },
      { lote: '26211', correccion: { ot_n: '0947' } },
      { lote: '26210', agregados: null },
    ],
  };
}

describe('renumerarOT', () => {
  it('cambia la OT, sus movimientos, mermas y correcciones de sus lotes', () => {
    const d = datos();
    const r = renumerarOT(d, d.ordenes_trabajo[0], '0953');
    expect(d.ordenes_trabajo[0].ot).toBe('0953');
    expect(d.movimientos.map(m => m.ot)).toEqual(['0953', '0948', '0947']);
    expect(d.mermas.map(m => m.ot)).toEqual(['0953', '0947', '0948']);
    expect(d.analisis[0].correccion.ot_n).toBe('0953');
    expect(d.analisis[0].agregados.map(a => a.ot_n)).toEqual(['0953', 'B211']);
    expect(d.analisis[1].correccion.ot_n).toBe('0947');
    expect(r).toEqual({ movimientos: 1, mermas: 1, correcciones: 1, agregados: 1 });
  });
  it('mismo numero no cambia nada', () => {
    const d = datos();
    expect(renumerarOT(d, d.ordenes_trabajo[0], '0947')).toEqual({ movimientos: 0, mermas: 0, correcciones: 0, agregados: 0 });
  });
});

describe('renumerarOT con Corte + achique', () => {
  it('arrastra el traspaso del corte a cada hijo y las mermas/correcciones de los hijos', () => {
    const ot = { id: 'ot-9', ot: '0960', lotes: [{ lote: '26034', mov_id: 'ot-9-0' }], lote_corte: { lote: '26323' },
      achique: { destinos: [{ tipo: 'tanque', num: '206', lote: '26323', mov_id: null },
                            { tipo: 'chicas', barricas: 4, lote: '26324', nuevo: true, mov_id: 'ot-9-a0' }] } };
    const d = { ordenes_trabajo: [ot],
      movimientos: [{ id: 'ot-9-0', lote: '26034', ot: '0960' }, { id: 'ot-9-a0', lote: '26323', lote_destino: '26324', ot: '0960' }],
      mermas: [{ lote: '26324', ot: '0960' }],
      analisis: [{ lote: '26324', correccion: { ot_n: '0960' } }] };
    const r = renumerarOT(d, ot, '0961');
    expect(d.movimientos.map(m => m.ot)).toEqual(['0961', '0961']);
    expect(d.mermas[0].ot).toBe('0961');
    expect(d.analisis[0].correccion.ot_n).toBe('0961');
    expect(r).toMatchObject({ movimientos: 2, mermas: 1, correcciones: 1 });
  });
});
