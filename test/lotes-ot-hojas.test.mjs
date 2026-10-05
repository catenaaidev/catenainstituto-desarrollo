/* Las hojas son strings de HTML, así que se prueban sin DOM. orden-hoja.js
 * importa nucleo.js, que engancha un beforeunload (y, desde la Tarea 6, el
 * deshacer general) al cargar: por eso el stub de window y document ANTES del
 * import dinámico. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

let H, armarOT, P;
beforeAll(async () => {
  globalThis.window ??= { addEventListener(){} };
  globalThis.document ??= { addEventListener(){} };
  H = await import('../public/lotes/js/ot-hojas.js');
  ({ armarOT } = await import('../public/lotes/js/ot-armado.js'));
  P = await import('../public/lotes/js/ot-plantillas.js');
});
const plBloques = () => P.plantillaPorId('barricas-barricas').bloques;

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

  it('tq a tq: una fila de vaciado por lote y el total de litros', () => {
    const h = H.hojaOT(ot([{ lote: '25315', barriles: [barril('a'), barril('b')] },
                          { lote: '25324', barriles: [barril('c')] }], 'tq-tq', 'T 201'));
    expect(h).toContain('<td>25315</td><td>2 barricas');
    expect(h).toMatch(/Total[\s\S]*675/);
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

describe('hojaRotulos (modelo hoja "rotulo" de la 0700)', () => {
  const tres = () => ot([{ lote: '26217', id_texto: 'CS VSC', barriles: [barril('a'), barril('b'), barril('c')] }]);
  const barriles = n => Array.from({ length: n }, (_, i) => barril(String(i)));

  it('dos rotulos iguales por barril, numerados', () => {
    const h = H.hojaRotulos(tres());
    expect(cuenta(h, 'class="ot-rotulo"')).toBe(6);
    expect(cuenta(h, 'class="ot-rot-par"')).toBe(3);
    expect(cuenta(h, '<div class="ot-rot-n">3</div>')).toBe(2);
    expect(cuenta(h, '<div class="ot-rot-id">CS VSC</div>')).toBe(6);
  });
  it('un lote sin barriles lleva un par', () => {
    expect(cuenta(H.hojaRotulos(ot([{ lote: '1', barriles: [] }])), 'class="ot-rotulo"')).toBe(2);
  });
  it('9 pares por hoja, como el Excel', () => {
    const cuantas = n => cuenta(H.hojaRotulos(ot([{ lote: '1', barriles: barriles(n) }])), 'class="orden-hoja ot-rotulos"');
    expect(cuantas(9)).toBe(1);
    expect(cuantas(10)).toBe(2);
  });
  it('desde tanque: un par por barrica prevista', () => {
    const h = H.hojaRotulos(ot([{ lote: '26295', barricas_previstas: 4 }], 'tq-barricas'));
    expect(cuenta(h, 'class="ot-rotulo"')).toBe(8);
  });

  describe('QR con el numero de lote', () => {
    let datos;
    beforeAll(() => {
      datos = [];
      globalThis.qrcode = () => ({ addData(d){ datos.push(d); }, make(){},
        createSvgTag(){ return '<svg data-qr></svg>'; } });
    });
    afterAll(() => { delete globalThis.qrcode; });

    it('cada rotulo lleva el QR del lote, generado una vez por lote', () => {
      const h = H.hojaRotulos(tres());
      expect(cuenta(h, '<div class="ot-rot-qr"><svg data-qr></svg></div>')).toBe(6);
      expect(datos).toEqual(['26217']);
    });
  });
  it('sin la libreria de QR la hoja sale igual, con el hueco vacio', () => {
    const h = H.hojaRotulos(tres());
    expect(cuenta(h, '<div class="ot-rot-qr"></div>')).toBe(6);
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

describe('barricas a tanque, corte (modelo 0867)', () => {
  const corte = (destino = 'Tq 75 HL', lc = { lote: '26300', id_texto: 'Base HOFB' }) => armarOT({
    id: 'ot-x', numero: '867', plantilla: 'barricas-tanque', fecha: '2026-09-04', destino,
    emitio: 'Oriana', mapaVersion: 1, usuario: 'ana', hoy: '2026-09-04', lote_corte: lc,
    lotes: [
      { lote: '26004', id_texto: 'MB Adrianna', barriles: [barril('1090351'), barril('2150244')] },
      { lote: '26016', barriles: [{ ...barril('50077'), cap: 50 }] },
      { lote: '26199', barriles: [], vasijas_manual: '1 x T50', litros_previstos: 50 },
    ],
  });

  it('la banda, el ID y el rotulo son del lote del corte', () => {
    const h = H.hojaOT(corte());
    const banda = h.slice(h.indexOf('oh-banda'), h.indexOf('ot-paso'));
    expect(banda).toContain('26300');
    expect(banda).toContain('Base HOFB');
    expect(banda).not.toContain('26004');
    expect(h).toContain('ID 26300:</b> Base HOFB');
    expect(h).toContain('Rotular vasija ID. <b>26300 Base HOFB</b>');
    expect(h).not.toContain('ID 26004');
  });

  it('una fila por barril, el destino una sola vez y el total de litros', () => {
    const h = H.hojaOT(corte());
    expect(h).toContain('<td>26004</td><td>1090351</td><td>225</td>');
    expect(h).toContain('<td>26004</td><td>2150244</td><td>225</td>');
    expect(h).toContain('<td>26016</td><td>50077</td><td>50</td>');
    expect(h).toContain('<td>26199</td><td>1 x T50</td><td>50</td>');
    expect(cuenta(h, 'Tq 75 HL:')).toBe(1);
    expect(h).toContain('rowspan="4"');
    expect(h).toMatch(/Total<\/td><td><\/td><td>550</);
    expect(h).not.toContain('Litros caudalímetro');
  });

  it('agregado: TH2 y Solucion SO2 del lote del corte en el tanque destino', () => {
    const h = H.hojaOT(corte());
    expect(h).toContain('Agregado');
    expect(h).toContain('<td>26300</td><td>1</td><td>Tq 75 HL</td><td>TH2</td>');
    expect(h).toContain('<td>26300</td><td>1</td><td>Tq 75 HL</td><td>Solución SO2</td>');
    expect(cuenta(h, '>TH2<')).toBe(1);
  });

  it('el % final de O2 lleva su OK y el trasiego es con borras', () => {
    const h = H.hojaOT(corte());
    expect(h).toMatch(/% final de O2:[^<]*<span class="ot-linea"><\/span><span class="ot-ok">OK/);
    expect(h).toContain('CON BORRAS');
  });

  it('sin destino deja la linea del tanque y T_______ en el agregado', () => {
    const h = H.hojaOT(corte(''));
    expect(h).toContain('Tanque: ________');
    expect(cuenta(h, 'T_______')).toBe(2);
  });

  it('solo imprime la OT, aunque le pidan planilla y rotulos', () => {
    const h = H.hojasOT(corte(), { ot: true, planilla: true, rotulos: true });
    expect(h).toContain('Orden de Trabajo');
    expect(h).not.toContain('PLANILLA DE MOVIMIENTO');
    expect(h).not.toContain('ot-rotulo');
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

  it('un par de rotulos por barrica a llenar', () => {
    expect(cuenta(H.hojaRotulos(tq()), 'class="ot-rotulo"')).toBe(14);
  });

  it('mas de 19 barricas pasa a otra hoja de planilla', () => {
    const o = ot([{ lote: '9', barriles: [], vasijas_manual: 'E 1', barricas_previstas: 25 }], 'tq-barricas');
    expect(cuenta(H.hojasPlanilla(o), 'class="orden-hoja')).toBe(2);
  });
});

describe('hojaOT con pasos propios y editable', () => {
  const lotes = () => [{ lote: '26217', id_texto: 'CS', barriles: [barril('2221713')] }];

  it('usa los pasos propios de la OT', () => {
    const o = ot(lotes());
    o.bloques = [{ tipo: 'paso', texto: 'Paso inventado para esta OT' }];
    const h = H.hojaOT(o);
    expect(h).toContain('Paso inventado para esta OT');
    expect(h).not.toContain('Sanitizar clapets');
  });

  it('un paso vacio no se imprime', () => {
    const o = ot(lotes());
    o.bloques = [{ tipo: 'paso', texto: '   ' }, { tipo: 'paso', texto: 'Sí va' }];
    expect(cuenta(H.hojaOT(o), 'class="ot-paso')).toBe(1);
  });

  it('sin editable no hay textarea ni controles', () => {
    const h = H.hojaOT(ot(lotes()));
    expect(h).not.toContain('<textarea');
    expect(h).not.toContain('ot-ctrl');
  });

  it('editable: un textarea por paso/dato con su indice y controles', () => {
    const h = H.hojaOT(ot(lotes()), { editable: true });
    const bs = plBloques();
    const textos = bs.filter(b => b.tipo === 'paso' || b.tipo === 'dato').length;
    expect(cuenta(h, '<textarea class="ot-texto"')).toBe(textos);
    expect(h).toContain('data-bloque="1"');
    expect(cuenta(h, 'data-quitar=')).toBe(textos);
    expect(cuenta(h, 'data-insertar=')).toBe(bs.length);
    expect(h).toContain('Sanitizar clapets antes de comenzar trasiego.</textarea>');
  });

  it('editable: la tabla va envuelta y sin boton de quitar', () => {
    const h = H.hojaOT(ot(lotes()), { editable: true });
    expect(h).toMatch(/<div class="ot-fijo"><div class="ot-ids">/);
  });

  it('editable: escapa el texto dentro del textarea', () => {
    const o = ot(lotes());
    o.bloques = [{ tipo: 'paso', texto: '<b>ojo</b> & listo' }];
    expect(H.hojaOT(o, { editable: true })).toContain('&lt;b&gt;ojo&lt;/b&gt; &amp; listo</textarea>');
  });
});
