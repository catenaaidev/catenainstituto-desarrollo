/* Lógica de las OT de trasiego. Es la parte que decide qué movimientos quedan
 * registrados en Lotes (y por lo tanto etapas y linaje), así que se prueba
 * sin pantalla. */
import { describe, it, expect } from 'vitest';
import { litrosPrevistos, resumenVasijas, armarOT, movimientosDeOT,
         confirmarOT, sinEscanear, otDeMovimiento, eliminarOT } from '../public/lotes/js/ot-armado.js';
import { proximoNumeroOT } from '../public/lotes/js/ot-movimientos.js';

const barril = (num, cap = 225, estado = 'LLENO') =>
  ({ num, estado, cap, litros: cap, anio: '2022', marca: 'TARANSAUD', origen: 'FRANCES', trat: 'M' });

const CINCO = ['1', '2', '3', '4', '5'].map((n) => barril('22217' + n));

function otDe(lotes, extra = {}) {
  return armarOT({
    id: 'ot-x', numero: 'OT-2026-014', plantilla: 'barricas-tanque', fecha: '2026-09-24',
    destino: 'T 201', emitio: 'Agustín', lotes, mapaVersion: 2304, usuario: 'ana', hoy: '2026-09-23',
    ...extra,
  });
}

describe('litrosPrevistos', () => {
  it('suma capacidades e ignora las que no son numero', () => {
    expect(litrosPrevistos([barril('a', 225), barril('b', 225), barril('c', null)])).toBe(450);
    expect(litrosPrevistos([])).toBe(0);
  });
});

describe('resumenVasijas', () => {
  it('resume una cantidad generica de barricas sin numeros individuales', () => {
    expect(resumenVasijas({ cantidad_barricas: 17, barriles: [] })).toBe('17 Barricas');
  });
  it('una barrica lleva su numero', () => {
    expect(resumenVasijas({ barriles: [barril('2221713')] })).toBe('1 barrica 2221713');
  });
  it('varias barricas se cuentan', () => {
    expect(resumenVasijas({ barriles: CINCO })).toBe('5 barricas');
  });
  it('si hay algo mas grande que una barrica dice vasijas', () => {
    expect(resumenVasijas({ barriles: [barril('a'), barril('451', 500)] })).toBe('2 vasijas');
  });
  it('los tanques de 50 L dicen T50', () => {
    expect(resumenVasijas({ barriles: [barril('901', 50), barril('902', 50)] })).toBe('2 T50');
    expect(resumenVasijas({ barriles: [barril('901', 50)] })).toBe('1 T50 901');
  });
  it('barricas y T50 juntos se cuentan por separado', () => {
    expect(resumenVasijas({ barriles: [barril('a'), barril('b'), barril('901', 50)] })).toBe('2 barricas + 1 T50');
  });
  it('sin barriles usa lo cargado a mano', () => {
    expect(resumenVasijas({ barriles: [], vasijas_manual: '1 x t500' })).toBe('1 x t500');
  });
});

describe('armarOT', () => {
  it('guarda un origen por cantidad sin barriles identificados', () => {
    const ot = otDe([{ lote: '26192', cantidad_barricas: 17, barriles: [], litros_previstos: 3825 }]);
    expect(ot.lotes[0]).toMatchObject({ cantidad_barricas: 17, barriles: [], litros_previstos: 3825 });
  });
  it('rechaza una cantidad de barricas que no sea un entero positivo', () => {
    const ot = otDe([{ lote: '26192', cantidad_barricas: 17.8, barriles: CINCO }]);
    expect(ot.lotes[0]).toMatchObject({ cantidad_barricas: null });
    expect(ot.lotes[0].barriles).toHaveLength(5);
  });
  it('un lote con cinco barricas', () => {
    const ot = otDe([{ lote: '26217', id_texto: 'CS VSC Ct.3 Clon 169', organico: false, barriles: CINCO }]);
    expect(ot).toMatchObject({
      id: 'ot-x', ot: 'OT-2026-014', plantilla: 'barricas-tanque', estado: 'pendiente',
      destino: 'T 201', emitio: 'Agustín', mapa_version: 2304, emitida_por: 'ana', emitida_el: '2026-09-23',
    });
    expect(ot.lotes[0]).toMatchObject({ lote: '26217', litros_previstos: 1125, mov_id: 'ot-x-0',
      destino_real: '', litros_reales: null, merma: null });
    expect(ot.lotes[0].barriles).toHaveLength(5);
  });

  it('un corte con tres lotes al mismo tanque', () => {
    const ot = otDe([
      { lote: '25315', barriles: CINCO },
      { lote: '25324', barriles: [barril('9')] },
      { lote: '25312', barriles: [], vasijas_manual: '1 x T50', litros_previstos: 50 },
    ]);
    expect(ot.lotes.map((l) => l.mov_id)).toEqual(['ot-x-0', 'ot-x-1', 'ot-x-2']);
    expect(ot.lotes.map((l) => l.litros_previstos)).toEqual([1125, 225, 50]);
  });

  it('la foto de barriles es una copia: cambiar el origen no cambia la OT', () => {
    const b = [barril('1')];
    const ot = otDe([{ lote: '1', barriles: b }]);
    b[0].estado = 'VACIO';
    expect(ot.lotes[0].barriles[0].estado).toBe('LLENO');
  });

  it('un lote manual sin barriles ni litros da litros_previstos null, no 0', () => {
    const ot = otDe([{ lote: '25312', barriles: [], vasijas_manual: '1 x T50' }]);
    expect(ot.lotes[0].litros_previstos).toBeNull();
    const movs = movimientosDeOT(ot, 'ana', '2026-09-23');
    expect(movs[0].litros).toBeNull();
  });
});

describe('movimientosDeOT', () => {
  it('corte a un lote existente que tambien es origen: ese lote no se traspasa a si mismo', () => {
    const ot = otDe([{ lote: '26217', barriles: CINCO }, { lote: '26218', barriles: [barril('7')] }],
      { lote_corte: { lote: '26218', id_texto: 'Corte', existente: true } });
    const movs = movimientosDeOT(ot, 'ana', '2026-09-23');
    expect(movs.map(m => [m.lote, m.tipo, m.lote_destino])).toEqual(
      [['26217', 'traspaso', '26218'], ['26218', 'trasiego', '']]);
  });
  it('un movimiento pendiente por lote, colgado de la OT', () => {
    const ot = otDe([{ lote: '26217', barriles: CINCO }, { lote: '26218', barriles: [barril('7')] }]);
    const movs = movimientosDeOT(ot, 'ana', '2026-09-23');
    expect(movs).toHaveLength(2);
    expect(movs[0]).toMatchObject({
      id: 'ot-x-0', lote: '26217', tipo: 'trasiego', fecha: '2026-09-24', estado: 'pendiente',
      vasija_origen: '5 barricas', vasija_destino: 'T 201', litros: 1125, ot: 'OT-2026-014',
      lote_destino: '', destino_externo: '', operario: '', cargado_por: 'ana', cargado_el: '2026-09-23',
    });
    expect(movs[1].vasija_origen).toBe('1 barrica 7');
  });
});

describe('corte a un lote nuevo (0867)', () => {
  it('guarda el lote del corte y cada lote de origen se traspasa a el', () => {
    const ot = otDe([{ lote: '26004', barriles: CINCO }, { lote: '26016', barriles: [barril('9', 50)] }],
      { lote_corte: { lote: ' 26300 ', id_texto: 'Base HOFB' } });
    expect(ot.lote_corte).toEqual({ lote: '26300', id_texto: 'Base HOFB' });
    const movs = movimientosDeOT(ot, 'ana', '2026-09-23');
    for (const m of movs) expect(m).toMatchObject({ tipo: 'traspaso', lote_destino: '26300', vasija_destino: 'T 201' });
    expect(movs.map((m) => m.litros)).toEqual([1125, 50]);
  });

  it('sin lote del corte queda null y los movimientos siguen siendo trasiegos', () => {
    const ot = otDe([{ lote: '1', barriles: CINCO }], { lote_corte: { lote: '  ' } });
    expect(ot.lote_corte).toBeNull();
    expect(movimientosDeOT(ot, 'ana', 'x')[0]).toMatchObject({ tipo: 'trasiego', lote_destino: '' });
  });
});

describe('confirmarOT', () => {
  it('pisa previstos con reales y pasa todo a ejecutado', () => {
    const ot = otDe([{ lote: '26217', barriles: CINCO }, { lote: '26218', barriles: [barril('7')] }]);
    const movs = movimientosDeOT(ot, 'ana', '2026-09-23');
    const faltan = confirmarOT(ot, movs, {
      operario: 'Enzo', pasos_cumplidos: true, comentario: 'ok',
      por_lote: [{ destino_real: 'T 199', litros_reales: 1100, merma: 25 },
                 { destino_real: '', litros_reales: 220, merma: null }],
    }, 'ana', '2026-09-25');
    expect(faltan).toEqual([]);
    expect(ot).toMatchObject({ estado: 'ejecutado', operario: 'Enzo', pasos_cumplidos: true,
      confirmada_por: 'ana', confirmada_el: '2026-09-25' });
    expect(ot.lotes[0]).toMatchObject({ destino_real: 'T 199', litros_reales: 1100, merma: 25 });
    expect(movs[0]).toMatchObject({ estado: 'ejecutado', litros: 1100, vasija_destino: 'T 199', operario: 'Enzo' });
    // destino real vacío = se usó el previsto
    expect(movs[1].vasija_destino).toBe('T 201');
    expect(movs[1].litros).toBe(220);
  });

  it('avisa los movimientos que ya no estan (alguien los borro de la grilla)', () => {
    const ot = otDe([{ lote: '26217', barriles: CINCO }]);
    const faltan = confirmarOT(ot, [], { operario: 'Enzo', pasos_cumplidos: false, comentario: '',
      por_lote: [{ destino_real: '', litros_reales: 1000, merma: 0 }] }, 'ana', '2026-09-25');
    expect(faltan).toEqual(['ot-x-0']);
    expect(ot.estado).toBe('ejecutado');
  });

  it('guarda la merma en litros en la OT y en el movimiento', () => {
    const ot = otDe([{ lote: '26217', barriles: CINCO }]);
    const movs = movimientosDeOT(ot, 'ana', '2026-09-23');
    confirmarOT(ot, movs, { operario: 'Juan', por_lote: [{ destino_real: 'T 201', litros_reales: 1100, merma_litros: 25 }] },
      'ana', '2026-09-24');
    expect(ot.lotes[0]).toMatchObject({ merma_litros: 25, merma: 25 });
    expect(movs[0].merma_litros).toBe(25);
  });
});

describe('sinEscanear', () => {
  const ot = otDe([{ lote: '26217', barriles: [barril('1'), barril('2'), barril('3')] }]);
  it('marca los que siguen LLENOS con el mismo lote', () => {
    const ahora = { '26217': [barril('1', 225, 'VACIO'), barril('2', 225, 'LLENO')] };
    // el 3 ya no figura con este lote: se escaneó y se reasignó, no es aviso
    expect(sinEscanear(ot, ahora)).toEqual([{ lote: '26217', num: '2' }]);
  });
  it('sin datos del mapa no avisa nada', () => {
    expect(sinEscanear(ot, {})).toEqual([]);
  });
});

describe('otDeMovimiento', () => {
  it('encuentra la OT por mov_id y null para un movimiento suelto', () => {
    const ot = otDe([{ lote: '26217', barriles: CINCO }]);
    expect(otDeMovimiento([ot], { id: 'ot-x-0' })).toBe(ot);
    expect(otDeMovimiento([ot], { id: 'mov-viejo' })).toBeNull();
    expect(otDeMovimiento(undefined, { id: 'ot-x-0' })).toBeNull();
  });
});

describe('eliminarOT', () => {
  it('saca la OT y todos sus movimientos, y deja los demas', () => {
    const ot = otDe([{ lote: '26217', barriles: CINCO }, { lote: '26218', barriles: [barril('9')] }]);
    const otra = otDe([{ lote: '26300', barriles: [barril('8')] }], { id: 'ot-y' });
    const suelto = { id: 'mov-suelto', lote: '1' };
    const datos = {
      ordenes_trabajo: [ot, otra],
      movimientos: [...movimientosDeOT(ot, 'ana', '2026-09-23'), suelto, ...movimientosDeOT(otra, 'ana', '2026-09-23')],
    };
    const movs = datos.movimientos;
    expect(eliminarOT(datos, ot)).toBe(2);
    expect(datos.ordenes_trabajo).toEqual([otra]);
    expect(datos.movimientos.map(m => m.id)).toEqual(['mov-suelto', 'ot-y-0']);
    // en el lugar: las vistas tienen referencias a estos arrays
    expect(datos.movimientos).toBe(movs);
  });
  it('una OT que ya no esta no rompe', () => {
    const ot = otDe([{ lote: '1', barriles: [barril('1')] }]);
    const datos = { ordenes_trabajo: [], movimientos: [] };
    expect(eliminarOT(datos, ot)).toBe(0);
  });
});

describe('proximoNumeroOT con ordenes', () => {
  it('mira tambien los numeros de las OT', () => {
    expect(proximoNumeroOT([{ ot: 'OT-2026-003' }], 2026, [{ ot: 'OT-2026-010' }])).toBe('OT-2026-011');
    expect(proximoNumeroOT([{ ot: 'OT-2026-003' }], 2026)).toBe('OT-2026-004');
  });
});

describe('proximoNumeroOT con el formato de la carpeta', () => {
  it('si ya hay OT 0939 sigue esa serie', () => {
    expect(proximoNumeroOT([{ ot: 'OT-2026-014' }, { ot: '0941' }], 2026, [{ ot: '0939' }])).toBe('0942');
  });
  it('sin formato nuevo, el de siempre', () => {
    expect(proximoNumeroOT([{ ot: 'OT-2026-014' }], 2026, [])).toBe('OT-2026-015');
  });
});

describe('lote_corte existente', () => {
  it('el lote del corte existente conserva la marca', () => {
    const o = armarOT({ id: 'x', numero: '0950', plantilla: 'barricas-tanque', fecha: '2026-10-26',
      lotes: [], lote_corte: { lote: '26300', id_texto: 'C', existente: true } });
    expect(o.lote_corte).toEqual({ lote: '26300', id_texto: 'C', existente: true });
  });
});

describe('tanques y vasijas manuales', () => {
  it('resumenVasijas junta barricas, tanques y vasijas manuales', () => {
    expect(resumenVasijas({ barriles: CINCO, tanques: [{ num: '201', litros: 1 }], otras: [{ nombre: 'IBC 1', litros: 1 }] }))
      .toBe('5 barricas + T 201 + IBC 1');
    expect(resumenVasijas({ barriles: [], tanques: [{ num: '201', litros: 1 }] })).toBe('T 201');
  });
  it('armarOT guarda tanques y otras y suma los litros', () => {
    const o = armarOT({ id: 'x', numero: '0950', plantilla: 'barrica-tanque', fecha: '2026-10-26',
      lotes: [{ lote: '1', barriles: [], tanques: [{ num: 201, litros: 4850 }, { num: '', litros: 5 }],
                otras: [{ nombre: ' IBC ', litros: 300 }, { nombre: '', litros: 9 }] }] });
    expect(o.lotes[0].tanques).toEqual([{ num: '201', litros: 4850 }]);
    expect(o.lotes[0].otras).toEqual([{ nombre: 'IBC', litros: 300 }]);
    expect(o.lotes[0].litros_previstos).toBe(5150);
  });
  it('una OT sin tanques ni otras los deja vacios', () => {
    const o = armarOT({ id: 'x', numero: '0950', plantilla: 'barrica-tanque', fecha: '2026-10-26',
      lotes: [{ lote: '1', barriles: [], vasijas_manual: '1 x t500' }] });
    expect(o.lotes[0]).toMatchObject({ tanques: [], otras: [], litros_previstos: null });
  });
});

describe('Corte + achique', () => {
  const ACH = { destinos: [
    { tipo: 'tanque', num: '206', litros: 7500, lote: '26323', nuevo: false },
    { tipo: 'tanque', num: '209', litros: 7500, lote: '26324', nuevo: true },
  ] };
  const otA = () => otDe([{ lote: '26034', barriles: CINCO }], {
    plantilla: 'corte-achique', destino: 'TQ pulmón bodega',
    lote_corte: { lote: '26323', id_texto: 'Corte PN' }, achique: ACH });

  it('armarOT guarda el achique normalizado; sin achique queda null', () => {
    expect(otA().achique.destinos.map(d => [d.lote, d.mov_id])).toEqual([['26323', null], ['26324', 'ot-x-a0']]);
    expect(otDe([{ lote: '26034', barriles: CINCO }]).achique).toBeNull();
  });
  it('movimientos: traspasos origen -> corte y corte -> hijo', () => {
    const ms = movimientosDeOT(otA(), 'ana', '2026-10-13');
    expect(ms.map(m => [m.id, m.lote, m.lote_destino, m.vasija_destino])).toEqual([
      ['ot-x-0', '26034', '26323', 'TQ pulmón bodega'], ['ot-x-a0', '26323', '26324', 'T 209']]);
  });
  it('confirmar pisa los reales del traspaso al hijo', () => {
    const ot = otA();
    const movs = movimientosDeOT(ot, 'ana', 'h');
    const faltan = confirmarOT(ot, movs, { operario: 'Ignacio', pasos_cumplidos: true, comentario: '',
      por_lote: [{ destino_real: 'TQ pulmón bodega', litros_reales: 1100 }],
      achique: [{ destino_real: 'T 206', litros_reales: 7480 }, { destino_real: 'T 209', litros_reales: 7490 }] }, 'ana', 'h');
    expect(faltan).toEqual([]);
    const m = movs.find(x => x.id === 'ot-x-a0');
    expect(m).toMatchObject({ estado: 'ejecutado', litros: 7490, vasija_destino: 'T 209', operario: 'Ignacio' });
    expect(ot.achique.destinos[1]).toMatchObject({ destino_real: 'T 209', litros_reales: 7490 });
  });
  it('otDeMovimiento y eliminarOT ven los traspasos a hijos', () => {
    const ot = otA();
    const datos = { ordenes_trabajo: [ot], movimientos: movimientosDeOT(ot, 'ana', 'h') };
    expect(otDeMovimiento(datos.ordenes_trabajo, { id: 'ot-x-a0' })).toBe(ot);
    expect(eliminarOT(datos, ot)).toBe(2);
    expect(datos.movimientos).toEqual([]);
  });
});

import { movIdsDeOT, lotesCreadosPorOT, textoDestinos } from '../public/lotes/js/ot-achique.js';

describe('destinos extra (2026-11-12)', () => {
  const base = { id: 'ot-9', numero: '0990', plantilla: 'tq-tq', fecha: '2026-11-12', destino: 'T 212', emitio: 'Roy',
    usuario: 'ana', hoy: '2026-11-12' };
  const lote = (extra = {}) => ({ lote: '26217', id_texto: 'MB', barriles: [], tanques: [{ num: '189', litros: 4000 }], otras: [], litros_previstos: 4000, ...extra });

  it('sin extras la OT y sus movimientos quedan como antes (sin campo destinos_extra)', () => {
    const ot = armarOT({ ...base, lotes: [lote()] });
    expect('destinos_extra' in ot.lotes[0]).toBe(false);
    expect('destinos_extra' in ot).toBe(false);
    expect(movimientosDeOT(ot, 'ana', '2026-11-12')).toHaveLength(1);
  });
  it('guarda los extra del lote y suma un traspaso padre -> hijo', () => {
    const ot = armarOT({ ...base, lotes: [lote({ destinos_extra: [{ num: 'T 214', litros: '1500', lote: '26330' }] })] });
    expect(ot.lotes[0].destinos_extra).toEqual([{ tipo: 'tanque', num: '214', litros: 1500, lote: '26330', nuevo: true, mov_id: 'ot-9-x0-0' }]);
    const movs = movimientosDeOT(ot, 'ana', '2026-11-12');
    expect(movs.map(m => [m.tipo, m.lote, m.lote_destino, m.vasija_destino])).toEqual([
      ['trasiego', '26217', '', 'T 212'], ['traspaso', '26217', '26330', 'T 214']]);
    expect(movIdsDeOT(ot)).toEqual(['ot-9-0', 'ot-9-x0-0']);
    expect(lotesCreadosPorOT(ot)).toEqual(['26330']);
    expect(textoDestinos(ot)).toBe('T 212 + T 214');
  });
  it('corte: los extra van en la OT y son hijos del lote del corte', () => {
    const ot = armarOT({ ...base, plantilla: 'barricas-tanque', destino: 'T 201', lote_corte: { lote: '26400', id_texto: 'Corte' },
      lotes: [lote()], destinos_extra: [{ num: '214', lote: '26401' }] });
    const movs = movimientosDeOT(ot, 'ana', '2026-11-12');
    expect(movs.at(-1)).toMatchObject({ tipo: 'traspaso', lote: '26400', lote_destino: '26401', vasija_destino: 'T 214' });
    expect(lotesCreadosPorOT(ot)).toEqual(['26400', '26401']);
  });
  it('con todos los extras con litros, el movimiento al destino 1 lleva el resto', () => {
    const ot = armarOT({ ...base, lotes: [lote({ destinos_extra: [{ num: '214', litros: 1500, lote: '26330' }, { num: '215', litros: 500, lote: '26331' }] })] });
    expect(movimientosDeOT(ot, 'ana', '2026-11-12').map(m => m.litros)).toEqual([2000, 1500, 500]);
  });
  it('si algun extra no tiene litros, el movimiento al destino 1 lleva los previstos enteros', () => {
    const ot = armarOT({ ...base, lotes: [lote({ destinos_extra: [{ num: '214', litros: 1500, lote: '26330' }, { num: '215', lote: '26331' }] })] });
    expect(movimientosDeOT(ot, 'ana', '2026-11-12').map(m => m.litros)).toEqual([4000, 1500, null]);
  });
  it('confirmarOT pasa a EJECUTADO el traspaso del extra con sus litros y su merma', () => {
    const ot = armarOT({ ...base, lotes: [lote({ destinos_extra: [{ num: '214', lote: '26330' }] })] });
    const movs = movimientosDeOT(ot, 'ana', '2026-11-12');
    confirmarOT(ot, movs, { operario: 'Juan', por_lote: [{ destino_real: 'T 212', litros_reales: 2400, merma_litros: 20 }],
      extras: [{ i: 0, k: 0, destino_real: 'T 214', litros_reales: 1550, merma_litros: 30 }] }, 'ana', '2026-11-13');
    const d = ot.lotes[0].destinos_extra[0];
    expect([d.destino_real, d.litros_reales, d.merma_litros]).toEqual(['T 214', 1550, 30]);
    expect(movs[1]).toMatchObject({ estado: 'ejecutado', litros: 1550, merma_litros: 30, vasija_destino: 'T 214', operario: 'Juan' });
  });
});

describe('destino por lote (2026-11-13)', () => {
  it('cada lote guarda su destino, la OT la lista y el movimiento va al del lote', async () => {
    const { armarOT, movimientosDeOT } = await import('../public/lotes/js/ot-armado.js');
    const ot = armarOT({ id: 'ot-1', numero: '0999', plantilla: 'tq-tq', fecha: '2026-11-13', destino: '', emitio: 'x',
      lotes: [{ lote: '1', destino: 'T 212', litros_previstos: 100 }, { lote: '2', destino: 'P147', litros_previstos: 50 }], usuario: 'u', hoy: 'x' });
    expect(ot.lotes.map(l => l.destino)).toEqual(['T 212', 'P147']);
    expect(ot.destino).toBe('T 212 + P147');
    expect(movimientosDeOT(ot, 'u', 'x').map(m => m.vasija_destino)).toEqual(['T 212', 'P147']);
  });
  it('sin destino por lote: como antes', async () => {
    const { armarOT } = await import('../public/lotes/js/ot-armado.js');
    const ot = armarOT({ id: 'ot-1', numero: '1', plantilla: 'tq-tq', fecha: 'x', destino: 'T 9', emitio: '', lotes: [{ lote: '1' }], hoy: 'x' });
    expect(ot.destino).toBe('T 9');
    expect(ot.lotes[0].destino).toBeUndefined();
  });
});
