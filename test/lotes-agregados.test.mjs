/* Tests de los otros agregados (TH2, quitosano...): dato, bitacora y papel. */
import { describe, it, expect } from 'vitest';
import { registrarAgregados, revertirAgregados, anularAgregado, agregadosVigentes,
         esSoloAgregados, textoAgregados, otsDeAgregados, normalizarItem, filasBitacora,
         sugerirOT, cantidadTexto, filasPapelAgregados, filaPapelAgregado }
  from '../public/lotes/js/agregados.js';

const TH2 = { producto: 'TH2', cantidad: 380, unidad: 'g' };
const QUI = { producto: 'Quitosano', cantidad: 50, unidad: 'g' };

describe('registrarAgregados', () => {
  it('sin analisis ese dia crea un registro solo de agregados', () => {
    const an = [];
    const s = registrarAgregados(an, { lote: 26150, fecha: '2026-10-05', items: [TH2], ot: 'B231', quien: 'Ori', cuando: 'x' });
    expect(s.creado).toBe(true);
    expect(an).toEqual([{ lote: '26150', fecha_analisis: '2026-10-05', agregados: [
      { producto: 'TH2', cantidad: 380, unidad: 'g', ot_n: 'B231', registrado_por: 'Ori', registrado_en: 'x' }] }]);
    expect(esSoloAgregados(an[0])).toBe(true);
  });

  it('con un analisis ese dia se cuelga de el y no lo vuelve solo-agregados', () => {
    const an = [{ lote: '26150', fecha_analisis: '2026-10-05', ph: 3.6 }];
    registrarAgregados(an, { lote: '26150', fecha: '2026-10-05', items: [TH2], ot: 'B231' });
    expect(an).toHaveLength(1);
    expect(an[0].agregados).toHaveLength(1);
    expect(esSoloAgregados(an[0])).toBe(false);
  });

  it('la misma OT reemplaza; otra OT se suma; la anulada queda', () => {
    const an = [];
    registrarAgregados(an, { lote: '1', fecha: 'f', items: [TH2, QUI], ot: 'B1' });
    anularAgregado(an[0].agregados[1], 'Ori', 'hoy');
    registrarAgregados(an, { lote: '1', fecha: 'f', items: [{ ...TH2, cantidad: 400 }], ot: 'B1' });
    registrarAgregados(an, { lote: '1', fecha: 'f', items: [QUI], ot: 'B2' });
    const ag = an[0].agregados;
    expect(ag.map(x => [x.producto, x.cantidad, x.ot_n, !!x.anulada])).toEqual([
      ['Quitosano', 50, 'B1', true], ['TH2', 400, 'B1', false], ['Quitosano', 50, 'B2', false]]);
  });

  it('revertir deja todo como estaba, incluido el registro creado', () => {
    const an = [{ lote: '1', fecha_analisis: 'f', ph: 3 }];
    const snaps = [
      registrarAgregados(an, { lote: '1', fecha: 'f', items: [TH2], ot: 'B1' }),
      registrarAgregados(an, { lote: '2', fecha: 'f', items: [QUI], ot: 'B1' }),
    ];
    expect(revertirAgregados(an, snaps)).toBe(2);
    expect(an).toEqual([{ lote: '1', fecha_analisis: 'f', ph: 3 }]);
  });

  it('revertir encuentra el registro aunque el ref haya quedado huerfano', () => {
    const an = [];
    const s = registrarAgregados(an, { lote: '1', fecha: 'f', items: [TH2], ot: 'B1' });
    const copia = JSON.parse(JSON.stringify(an));
    revertirAgregados(copia, [s]);
    expect(copia).toEqual([]);
  });
});

describe('lectura', () => {
  const a = { lote: '1', fecha_analisis: 'f', agregados: [
    { producto: 'TH2', cantidad: 380, unidad: 'g', ot_n: 'B1' },
    { producto: 'Quitosano', cantidad: 1.5, unidad: 'kg', ot_n: 'B2' },
    { producto: 'DAP', cantidad: 10, unidad: 'g', ot_n: 'B1', anulada: { por: 'x' } },
  ] };

  it('texto y OT ignoran las anuladas', () => {
    expect(textoAgregados(a)).toBe('TH2 380 g · Quitosano 1,5 kg');
    expect(otsDeAgregados(a)).toEqual(['B1', 'B2']);
    expect(agregadosVigentes(a)).toHaveLength(2);
  });

  it('anulada: {} no cuenta como anulada', () => {
    expect(agregadosVigentes({ agregados: [{ producto: 'T1', anulada: {} }] })).toHaveLength(1);
  });

  it('cantidad sin numero sale vacia', () => {
    expect(cantidadTexto({ cantidad: null, unidad: 'g' })).toBe('');
  });

  it('esSoloAgregados: con correccion o quimica no lo es', () => {
    expect(esSoloAgregados({ lote: 1, fecha_analisis: 'f', agregados: [], ph: null })).toBe(true);
    expect(esSoloAgregados({ lote: 1, fecha_analisis: 'f', agregados: [], correccion: { ot_n: 'B1' } })).toBe(false);
    expect(esSoloAgregados({ lote: 1, fecha_analisis: 'f' })).toBe(false);
  });

  it('bitacora: mas nuevo primero, con las anuladas', () => {
    const f = filasBitacora([a, { lote: '2', fecha_analisis: 'g', agregados: [{ producto: 'T1' }] }]);
    expect(f.map(x => [x.lote, x.agregado.producto])).toEqual([
      ['2', 'T1'], ['1', 'TH2'], ['1', 'Quitosano'], ['1', 'DAP']]);
  });
});

describe('normalizarItem', () => {
  it('coma decimal, unidad desconocida a g, sin producto null', () => {
    expect(normalizarItem({ producto: ' TH2 ', cantidad: '1,5', unidad: 'kg' })).toEqual({ producto: 'TH2', cantidad: 1.5, unidad: 'kg' });
    expect(normalizarItem({ producto: 'T1', cantidad: '', unidad: 'xx' })).toEqual({ producto: 'T1', cantidad: null, unidad: 'g' });
    expect(normalizarItem({ producto: '', cantidad: 3 })).toBe(null);
  });
});

describe('sugerirOT', () => {
  it('sigue la serie B de correcciones y agregados', () => {
    expect(sugerirOT([
      { correccion: { ot_n: 'B219' } },
      { agregados: [{ ot_n: 'B231' }, { ot_n: 'OC-2026-1' }] },
    ])).toBe('B232');
    expect(sugerirOT([{ correccion: { ot_n: 'OT-1' } }])).toBe('');
  });
});

describe('papel', () => {
  it('un renglon por producto, separador entre lotes, sin lotes vacios', () => {
    const f = filasPapelAgregados([
      { lote: '26150', vasija: 'T12', items: [{ producto: 'TH2', cantidad: '380', unidad: 'g' }, { producto: '' }] },
      { lote: '', items: [{ producto: 'T1' }] },
      { lote: '26151', vasija: 'B3', items: [{ producto: 'Quitosano', cantidad: '50', unidad: 'g' }] },
    ]);
    expect(f.map(x => x.tipo)).toEqual(['item', 'sep', 'item']);
    expect(filaPapelAgregado({ fila: f[0] })).toBe('<tr><td class="oh-check"></td><td class="c"><b>26150</b></td>' +
      '<td class="c">T12</td><td>TH2</td><td class="c">380 g</td></tr>');
  });
});
