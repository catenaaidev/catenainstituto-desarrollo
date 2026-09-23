/* Las hojas son strings de HTML, así que se prueban sin DOM. orden-hoja.js
 * importa nucleo.js, que engancha un beforeunload al cargar: por eso el stub de
 * window ANTES del import dinámico. */
import { describe, it, expect, beforeAll } from 'vitest';

let H, armarOT;
beforeAll(async () => {
  globalThis.window ??= { addEventListener(){} };
  H = await import('../public/lotes/js/ot-hojas.js');
  ({ armarOT } = await import('../public/lotes/js/ot-armado.js'));
});

const barril = (num) => ({ num, estado: 'LLENO', cap: 225, litros: 225, anio: '2022',
  marca: 'TARANSAUD', origen: 'FRANCES', trat: 'REF.101 M' });

function ot(lotes, plantilla = 'barricas-barricas', destino = '') {
  return armarOT({ id: 'ot-x', numero: 'OT-2026-014', plantilla, fecha: '2026-09-24', destino,
    emitio: 'Agustín', lotes, mapaVersion: 1, usuario: 'ana', hoy: '2026-09-23' });
}

const cuenta = (html, s) => html.split(s).length - 1;

describe('hojaOT', () => {
  it('lleva numero, fecha, lote con descripcion y los pasos de la plantilla', () => {
    const h = H.hojaOT(ot([{ lote: '26217', id_texto: 'CS VSC Ct.3 Clon 169', barriles: [barril('2221713')] }]));
    expect(h).toContain('OT-2026-014');
    expect(h).toContain('24/09/2026');
    expect(h).toContain('CS VSC Ct.3 Clon 169');
    expect(h).toContain('Sanitizar clapets antes de comenzar trasiego.');
    expect(h).toContain('1 barrica 2221713');
    expect(h).toContain('Agustín');
  });

  it('sin destino deja la linea para completar a mano', () => {
    expect(H.hojaOT(ot([{ lote: '1', barriles: [barril('a')] }]))).toContain('Tanque pulmón: ________');
  });

  it('con destino lo imprime', () => {
    expect(H.hojaOT(ot([{ lote: '1', barriles: [barril('a')] }], 'barricas-tanque', 'T 201'))).toContain('T 201');
  });

  it('un corte: una fila de vaciado por lote y el total de litros', () => {
    const h = H.hojaOT(ot([{ lote: '25315', barriles: [barril('a'), barril('b')] },
                          { lote: '25324', barriles: [barril('c')] }], 'barricas-tanque', 'T 201'));
    expect(h).toContain('25315');
    expect(h).toContain('25324');
    expect(h).toMatch(/Total[\s\S]*675/);
    expect(h).toContain('Litros caudalímetro');
  });

  it('correcciones: TH2 y SO2 por lote', () => {
    const h = H.hojaOT(ot([{ lote: '1', barriles: [barril('a')] }, { lote: '2', barriles: [barril('b')] }]));
    expect(cuenta(h, '>TH2<')).toBe(2);
    expect(cuenta(h, '>SO2<')).toBe(2);
  });

  it('resalta la cinta solo si hay un lote organico', () => {
    const conv = H.hojaOT(ot([{ lote: '1', organico: false, barriles: [barril('a')] }]));
    const org = H.hojaOT(ot([{ lote: '1', organico: true, barriles: [barril('a')] }]));
    expect(conv).not.toContain('ot-destaca');
    expect(org).toContain('ot-destaca');
  });

  it('escapa el texto que viene de los datos', () => {
    expect(H.hojaOT(ot([{ lote: '1', id_texto: '<b>x</b>', barriles: [] }]))).toContain('&lt;b&gt;x');
  });
});

describe('hojasPlanilla', () => {
  it('vaciado con los datos de cada barril y llenado en blanco', () => {
    const h = H.hojasPlanilla(ot([{ lote: '26217', barriles: [barril('2221713')] }]));
    expect(h).toContain('PLANILLA DE MOVIMIENTO DE BARRILES');
    for (const t of ['2221713', 'TARANSAUD', 'FRANCES', 'REF.101 M', '2022']) expect(h).toContain(t);
    expect(h).toContain('Vaciado');
    expect(h).toContain('Llenado');
  });

  it('pasa a otra hoja despues de 19 barriles', () => {
    const muchos = Array.from({ length: 25 }, (_, i) => barril(String(1000 + i)));
    const h = H.hojasPlanilla(ot([{ lote: '1', barriles: muchos }]));
    expect(cuenta(h, 'class="orden-hoja')).toBe(2);
    expect(h).toContain('1024');
  });

  it('sin barriles igual sale una hoja con filas en blanco', () => {
    expect(cuenta(H.hojasPlanilla(ot([{ lote: '1', barriles: [], vasijas_manual: 'T 113' }])), 'class="orden-hoja')).toBe(1);
  });
});

describe('hojaRotulos', () => {
  it('un rotulo por barril, numerado', () => {
    const h = H.hojaRotulos(ot([{ lote: '26217', id_texto: 'CS VSC', barriles: [barril('a'), barril('b'), barril('c')] }]));
    expect(cuenta(h, 'class="ot-rotulo"')).toBe(3);
    expect(h).toContain('>3<');
  });
  it('un lote sin barriles lleva un rotulo', () => {
    expect(cuenta(H.hojaRotulos(ot([{ lote: '1', barriles: [] }])), 'class="ot-rotulo"')).toBe(1);
  });
});

describe('hojasOT', () => {
  it('respeta las hojas elegidas', () => {
    const o = ot([{ lote: '1', barriles: [barril('a')] }]);
    const solo = H.hojasOT(o, { ot: true, planilla: false, rotulos: false });
    expect(solo).not.toContain('PLANILLA DE MOVIMIENTO');
    expect(solo).not.toContain('ot-rotulo');
    const todas = H.hojasOT(o);
    expect(todas).toContain('PLANILLA DE MOVIMIENTO');
    expect(todas).toContain('ot-rotulo');
  });
});
