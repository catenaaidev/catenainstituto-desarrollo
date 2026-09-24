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

  it('la columna Vasija lista los numeros de barril, no solo la cantidad', () => {
    // El operario busca las barricas por numero: con solo "3 barricas" tenia
    // que ir a la planilla de la hoja 2 para saber cuales eran.
    const h = H.hojaOT(ot([{ lote: '26126', barriles: [barril('1250083'), barril('1250085'), barril('1250356')] }]));
    const tabla = h.slice(h.indexOf('<table class="ot-tabla">'), h.indexOf('</table>'));
    expect(tabla).toContain('3 barricas');
    for (const n of ['1250083', '1250085', '1250356']) expect(tabla).toContain(n);
  });

  it('un corte: una fila de vaciado por lote y el total de litros', () => {
    const h = H.hojaOT(ot([{ lote: '25315', barriles: [barril('a'), barril('b')] },
                          { lote: '25324', barriles: [barril('c')] }], 'barricas-tanque', 'T 201'));
    expect(h).toContain('25315');
    expect(h).toContain('25324');
    expect(h).toMatch(/Total[\s\S]*675/);
    expect(h).toContain('Litros caudalímetro');
  });

  it('un lote manual sin litros deja la celda de litros en blanco, no en 0', () => {
    const h = H.hojaOT(ot([{ lote: '25312', barriles: [], vasijas_manual: '1 x T50' }], 'barricas-tanque', 'T 201'));
    expect(h).not.toMatch(/<td>0<\/td>/);
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

describe('TQ a barricas (modelo 0912)', () => {
  const tq = () => ot([{ lote: '26295', id_texto: 'PN VSC Gualtallary', barriles: [],
    vasijas_manual: 'E 175', litros_previstos: 1500, barricas_previstas: 7 }],
    'tq-barricas', 'Barricas Pinot (no 2026-2025)');

  it('sin tabla de vaciado: el ID va solo y no hay rotulo de vasija', () => {
    const h = H.hojaOT(tq());
    expect(h).toContain('ID 26295:');
    expect(h).not.toContain('Rotular vasija ID');
    expect(h).not.toContain('Tanque pulmón');
  });

  it('la correccion y el llenado llevan el tanque de origen', () => {
    const h = H.hojaOT(tq());
    expect(cuenta(h, '<td>E 175</td>')).toBe(3); // TH2, SO2 y llenado
    expect(h).not.toContain('T_______');
    expect(h).toContain('Cantidad de barriles llenos');
    expect(h).toContain('Barricas Pinot (no 2026-2025)');
    expect(h).toMatch(/<td>E 175<\/td><td>1500<\/td>/);
    expect(h).not.toContain('Dar lleno con');
  });

  it('barricas a barricas no cambio: sigue con Dar lleno con y T_______', () => {
    const h = H.hojaOT(ot([{ lote: '1', barriles: [barril('a')] }]));
    expect(h).toContain('Dar lleno con');
    expect(h).toContain('T_______');
    expect(h).toContain('Rotular vasija ID');
  });

  it('planilla: vaciado en blanco y el lote precargado en una fila de llenado por barrica', () => {
    const h = H.hojasPlanilla(tq());
    const [vac, lle] = h.split('Condición: Llenado');
    expect(vac).not.toContain('<td>26295</td>');
    expect(cuenta(lle, '<td>26295</td>')).toBe(7);
  });

  it('un rotulo por barrica a llenar', () => {
    expect(cuenta(H.hojaRotulos(tq()), 'class="ot-rotulo"')).toBe(7);
  });

  it('mas de 19 barricas pasa a otra hoja de planilla', () => {
    const o = ot([{ lote: '9', barriles: [], vasijas_manual: 'E 1', barricas_previstas: 25 }], 'tq-barricas');
    expect(cuenta(H.hojasPlanilla(o), 'class="orden-hoja')).toBe(2);
  });
});
