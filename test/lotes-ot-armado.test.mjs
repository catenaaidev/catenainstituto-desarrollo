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
  it('una barrica lleva su numero', () => {
    expect(resumenVasijas({ barriles: [barril('2221713')] })).toBe('1 barrica 2221713');
  });
  it('varias barricas se cuentan', () => {
    expect(resumenVasijas({ barriles: CINCO })).toBe('5 barricas');
  });
  it('si hay algo mas grande que una barrica dice vasijas', () => {
    expect(resumenVasijas({ barriles: [barril('a'), barril('451', 500)] })).toBe('2 vasijas');
  });
  it('sin barriles usa lo cargado a mano', () => {
    expect(resumenVasijas({ barriles: [], vasijas_manual: '1 x t500' })).toBe('1 x t500');
  });
});

describe('armarOT', () => {
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
