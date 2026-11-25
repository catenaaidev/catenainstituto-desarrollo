/* Tests del papel de la Orden de correccion de SO2 (formato B219). */
import { describe, it, expect } from 'vitest';
import { anioDeLote, filaPapel, theadPapel, INSTRUCCIONES_SOLUCION,
         gruposPorLote, textoVasijas, filaPapelLote, theadPapelLote, COLUMNAS_PAPEL_LOTE, COLGROUP_PAPEL_LOTE, filasPapelPorModo }
  from '../public/lotes/js/orden-correccion-papel.js';

const sol = { col: 'mL sol.', prod: 'Sol1030', dec: 1, suf: 'mL', de: d => d.ml_solucion, total: f => f.ml_total };

describe('anioDeLote', () => {
  it('saca el año de los dos primeros digitos', () => {
    expect(anioDeLote('25009')).toBe('2025');
    expect(anioDeLote(26014)).toBe('2026');
  });
  it('sin numero no inventa un año', () => {
    expect(anioDeLote('')).toBe('');
    expect(anioDeLote(null)).toBe('');
    expect(anioDeLote('TQ-1')).toBe('');
  });
});

describe('filaPapel', () => {
  const lote = { lote: '25306', variedad: 'Malbec', ph: 3.7, so2_libre: 20, molecular_actual: 0.4 };

  it('el renglon del lote lleva lote y año, sin total ni nada tecnico', () => {
    const html = filaPapel({ numero: 0, fila: { tipo: 'lote', lote, ml_total: 1636.36 } }, sol);
    expect(html).toContain('<b>25306</b> · 2025</td>');
    expect(html).not.toMatch(/total|1636|Malbec|pH|SO₂|molecular/);
    expect(html).toContain('colspan="4"');
  });

  it('el renglon del barril lleva numero de barril, producto y dosis', () => {
    const html = filaPapel({ numero: 4, fila: { tipo: 'barrica', lote,
      barrica: { num: '206', cap: 225, estado: 'lleno', litros_usados: 225 },
      dosis: { ml_solucion: 196.36, mbk_g: 21.6 } } }, sol);
    expect(html).toBe('<tr><td class="c oh-num">4</td><td class="c">206</td>' +
      '<td class="c">Sol1030</td><td class="c"><b>196.4</b></td><td class="oh-check"></td></tr>');
  });

  it('un barril sin numero sale con raya', () => {
    const html = filaPapel({ numero: 1, fila: { tipo: 'barrica', lote,
      barrica: { num: '' }, dosis: { ml_solucion: 10 } } }, sol);
    expect(html).toContain('<td class="c">—</td>');
  });
});

describe('producto segun la unidad', () => {
  it('con MBK el barril dice MBK', () => {
    const mbk = { col: 'MBK (g)', prod: 'MBK', dec: 2, de: d => d.mbk_g };
    const html = filaPapel({ numero: 1, fila: { tipo: 'barrica', lote: { lote: '26002' },
      barrica: { num: '50099' }, dosis: { mbk_g: 6.1, ml_solucion: 55.6 } } }, mbk);
    expect(html).toContain('<td class="c">MBK</td><td class="c"><b>6.10</b></td>');
  });
});

describe('encabezado e instrucciones', () => {
  it('cinco columnas: #, barril, producto, dosis, check', () => {
    expect((theadPapel(sol).match(/<th/g) || []).length).toBe(5);
    expect(theadPapel(sol)).toContain('PRODUCTO');
    expect(theadPapel(sol)).toContain('mL sol.');
  });
  it('las instrucciones de la B219 estan todas', () => {
    for (const t of ['DMA', '1,028', '1,032', 'Homogeneizar', 'Densidad'])
      expect(INSTRUCCIONES_SOLUCION).toContain(t);
  });
});

describe('papel por lote', () => {
  const u = { col: 'mL sol.', prod: 'Sol1030', dec: 1, suf: 'mL', de: d => d.ml_solucion };
  const lote = (n) => ({ tipo: 'lote', lote: { lote: n } });
  const barr = (n, num, cap, litros, ml) => ({ tipo: 'barrica', lote: { lote: n },
    barrica: { num, cap, litros_usados: litros, vasija: '' }, dosis: { ml_solucion: ml, mbk_g: ml / 9 } });

  it('junta las barricas iguales del lote en un renglon', () => {
    const g = gruposPorLote([lote('26001'), barr('26001', '1', 225, 225, 50), barr('26001', '2', 225, 225, 50),
                             barr('26001', '3', 225, 225, 50)], u);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ cantidad: 3, dosis: 50 });
    expect(textoVasijas(g[0])).toBe('3 barricas de 225 L');
  });

  it('capacidades o dosis distintas van en renglones aparte', () => {
    const g = gruposPorLote([lote('26172'), barr('26172', '1', 225, 225, 172.5), barr('26172', '2', 50, 50, 38.3),
                             barr('26172', '3', 225, 180, 138.0), barr('26172', '4', 225, 225, 172.5)], u);
    expect(g.map(x => [textoVasijas(x), x.cantidad])).toEqual([
      ['2 barricas de 225 L', 2], ['1 T50', 1], ['1 barrica de 225 L (con 180 L)', 1]]);
  });

  it('los tanques de 50 L dicen T50, no barricas', () => {
    const g = gruposPorLote([lote('26017'), barr('26017', '1', 50, 45, 19.6), barr('26017', '2', '50', 45, 19.6)], u);
    expect(g).toHaveLength(1);
    expect(textoVasijas(g[0])).toBe('2 T50 (con 45 L)');
    expect(textoVasijas({ ...g[0], cantidad: 3, litros: 50 })).toBe('3 T50');
  });

  it('no mezcla lotes aunque lleven la misma dosis', () => {
    const g = gruposPorLote([lote('1'), barr('1', 'a', 225, 225, 50), lote('2'), barr('2', 'b', 225, 225, 50)], u);
    expect(g.map(x => x.lote.lote)).toEqual(['1', '2']);
  });

  it('una vasija sin barril va sola, con su nombre y litros', () => {
    const tq = { tipo: 'barrica', lote: { lote: '26005' }, barrica: { num: '', cap: null, vasija: 'T 201', litros_usados: 3000 },
                 dosis: { ml_solucion: 900 } };
    const g = gruposPorLote([lote('26005'), tq, { ...tq }], u);
    expect(g).toHaveLength(2);
    expect(textoVasijas(g[0])).toBe('T 201 · 3000 L');
    expect(textoVasijas({ ...g[0], vasija: '' })).toBe('Sin ubicar · 3000 L');
  });

  it('el renglon lleva lote · año, vasijas, producto y dosis por vasija', () => {
    const [g] = gruposPorLote([lote('26001'), barr('26001', '1', 225, 225, 50), barr('26001', '2', 225, 225, 50)], u);
    const html = filaPapelLote({ numero: 1, fila: g }, u);
    expect(html).toBe('<tr><td class="c oh-num">1</td><td class="c"><b>26001</b> · 2026</td>' +
      '<td>2 barricas de 225 L</td><td class="c">Sol1030</td><td class="c"><b>50.0</b> mL</td>' +
      '<td class="oh-check"></td></tr>');
    expect((theadPapelLote(u).match(/<th/g) || []).length).toBe(COLUMNAS_PAPEL_LOTE);
  });

  it('editable: la dosis es un campo con el indice del renglon; a mano lleva marca y ↺', () => {
    const [g] = gruposPorLote([lote('26001'), barr('26001', '1', 225, 225, 50)], u);
    const html = filaPapelLote({ numero: 3, fila: { ...g, idx: 2 } }, u, { editable: true });
    expect(html).toContain('<input class="oh-campo oh-campo-dosis" data-oc-dosis="2" type="text" inputmode="decimal" value="50.0"');
    expect(html).not.toContain('oh-manual');
    expect(html).not.toContain('data-oc-dosis-reset');
    const man = filaPapelLote({ numero: 3, fila: { ...g, idx: 2, manual: true } }, u, { editable: true });
    expect(man).toContain('<td class="c oh-manual">');
    expect(man).toContain('data-oc-dosis-reset="2"');
  });
});

describe('filasPapelPorModo', () => {
  const lote = { lote: '26014' }, otro = { lote: '26001' };
  const b = (num, litros = 225) => ({ num, vasija: '', cap: 225, litros_usados: litros });
  const filas = [
    { tipo: 'lote', lote: otro },
    { tipo: 'barrica', lote: otro, barrica: b('11'), dosis: { ml_solucion: 104.3 } },
    { tipo: 'barrica', lote: otro, barrica: b('12'), dosis: { ml_solucion: 104.3 } },
    { tipo: 'lote', lote },
    { tipo: 'barrica', lote, barrica: b('21'), dosis: { ml_solucion: 85.9 } },
    { tipo: 'barrica', lote, barrica: b('22', 180), dosis: { ml_solucion: 68.7 } },
  ];
  const modoDe = l => (l.lote === '26014' ? 'barril' : 'generica');

  it('generica junta como el papel por lote; por barril, un renglon por barril', () => {
    const g = filasPapelPorModo(filas, modoDe, sol);
    expect(g.map(x => [x.lote.lote, x.cantidad, x.num || ''])).toEqual([
      ['26001', 2, ''], ['26014', 1, '21'], ['26014', 1, '22']]);
    expect(g[2].dosis).toBe(68.7);
  });

  it('el renglon por barril dice el numero del barril', () => {
    const g = filasPapelPorModo(filas, modoDe, sol);
    expect(textoVasijas(g[1])).toBe('Barril 21 · 225 L');
    expect(textoVasijas(g[2])).toBe('Barril 22 · 225 L (con 180 L)');
  });
});

describe('ancho del papel por lote', () => {
  const anchos = [...COLGROUP_PAPEL_LOTE.matchAll(/width:(\d+)px/g)].map(m => +m[1]);
  it('las columnas entran en los 182 mm (688 px) de la A4', () => {
    expect(anchos).toHaveLength(COLUMNAS_PAPEL_LOTE);
    expect(anchos.reduce((s, x) => s + x, 0)).toBeLessThanOrEqual(688);
  });
  it('VASIJAS tiene lugar para "Barril 1250010 · 225 L (con 187.5 L)" en una linea', () => {
    expect(anchos[2]).toBeGreaterThanOrEqual(270);
  });
});
