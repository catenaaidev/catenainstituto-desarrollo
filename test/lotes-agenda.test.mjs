/* Motor de la Agenda: que analizar y que trasegar, y cuando. */
import { describe, it, expect } from 'vitest';
import { itemsAnalisis, GRUPOS_ANALISIS } from '../public/lotes/js/agenda.js';
import { itemsTrasiego, prioridadAuto, fechaBaseTrasiego, estaEnBarricas } from '../public/lotes/js/agenda.js';
import { armarDias, repartir, planificar } from '../public/lotes/js/agenda.js';
import { configAgenda, mapaFeriados } from '../public/lotes/js/agenda-dias.js';

const HOY = '2026-10-14';           // miercoles
const FIN = '2026-12-06';           // ultimo dia de 8 semanas desde el lunes 12/10
const cfg = configAgenda({});

describe('itemsAnalisis', () => {
  const dash = [
    { lote: '26001', variedad: 'Malbec', activo: true, alarmas: ['so2_caida_alerta', 'frecuencia_vencida'],
      ultima_fecha_control: '2026-09-01', frecuencia_max: 15 },
    { lote: '26002', variedad: 'Malbec', activo: true, alarmas: ['reanalisis_correccion'],
      ultima_fecha_control: '2026-10-10', frecuencia_max: 15 },
    { lote: '26003', variedad: 'Cabernet', activo: true, alarmas: [],
      ultima_fecha_control: '2026-10-01', frecuencia_max: 15 },
    { lote: '26004', variedad: 'Cabernet', activo: true, alarmas: ['no_lleno'],
      ultima_fecha_control: '2026-10-10', frecuencia_max: 30 },
    { lote: '26005', variedad: 'Syrah', activo: true, alarmas: [],
      ultima_fecha_control: '2026-12-01', frecuencia_max: 30 },
    { lote: '26006', variedad: 'Syrah', activo: true, alarmas: ['sin_analisis_valido'],
      ultima_fecha_control: null, frecuencia_max: 15 },
    { lote: '26007', variedad: 'Syrah', activo: false, alarmas: ['av_alerta'],
      ultima_fecha_control: '2026-09-01', frecuencia_max: 15 },
  ];
  const items = itemsAnalisis(dash, cfg, HOY, FIN);
  const de = (l) => items.find(i => i.lote === l);

  it('AV o caida de SO2 es prioridad 1, urgente, con las otras alertas como etiquetas', () => {
    expect(de('26001')).toMatchObject({ prioridad: 1, motivo: 'Caída SO₂', etiquetas: ['Vencido'],
      objetivo: HOY, urgente: true, vence: '2026-09-16', atraso: 28 });
  });
  it('re-analisis es prioridad 3', () => {
    expect(de('26002')).toMatchObject({ prioridad: 3, motivo: 'Re-análisis', urgente: true, objetivo: HOY });
  });
  it('a 5 dias o menos del vencimiento es prioridad 4 y apunta al vencimiento', () => {
    expect(de('26003')).toMatchObject({ prioridad: 4, objetivo: '2026-10-16', urgente: false, atraso: null });
  });
  it('mas lejos es un control programado (prioridad 5) si cae en el horizonte', () => {
    expect(de('26004')).toMatchObject({ prioridad: 5, objetivo: '2026-11-09' });
    expect(de('26005')).toBeUndefined();            // vence 31/12, fuera del horizonte
  });
  it('sin analisis valido es prioridad 2, sin atraso calculable', () => {
    expect(de('26006')).toMatchObject({ prioridad: 2, motivo: 'Sin análisis', vence: null, atraso: null });
  });
  it('los lotes inactivos no entran', () => {
    expect(de('26007')).toBeUndefined();
  });
  it('los nombres de los grupos', () => {
    expect(GRUPOS_ANALISIS[1]).toBe('AV / caída de SO₂');
    expect(GRUPOS_ANALISIS[4]).toBe('Próximos a vencer');
  });
  it('sin dashboard no hay items', () => {
    expect(itemsAnalisis(null, cfg, HOY, FIN)).toEqual([]);
  });
});

describe('prioridadAuto', () => {
  it('bordes de 15 dias', () => {
    expect(prioridadAuto(16)).toBe('alta');
    expect(prioridadAuto(15)).toBe('media');
    expect(prioridadAuto(0)).toBe('media');
    expect(prioridadAuto(-15)).toBe('media');
    expect(prioridadAuto(-16)).toBe('baja');
  });
});

describe('estaEnBarricas', () => {
  it('cap225, cap500 o el texto "barric"; cap200 son tanques t200', () => {
    expect(estaEnBarricas({ cap225: 3 })).toBe(true);
    expect(estaEnBarricas({ cap500: 1 })).toBe(true);
    expect(estaEnBarricas({ vasija_actual: 'Barrica + t50' })).toBe(true);
    expect(estaEnBarricas({ cap200: 2, vasija_actual: 't200 + t50' })).toBe(false);
    expect(estaEnBarricas({ vasija_actual: 't50' })).toBe(false);
  });
});

describe('fechaBaseTrasiego', () => {
  it('movimiento real mas reciente; si no, ingreso; si no, etapa; si no, primer analisis', () => {
    const movs = [{ tipo: 'descube', fecha: '2026-03-01' }, { tipo: 'trasiego', fecha: '2026-06-01' },
                  { tipo: 'salida', fecha: '2026-09-01' }, { tipo: 'trasiego', fecha: '2026-09-15', estado: 'pendiente' }];
    expect(fechaBaseTrasiego({}, movs, [])).toEqual({ fecha: '2026-06-01', origen: 'movimiento' });
    expect(fechaBaseTrasiego({ fecha_ingreso: '2026-02-12' }, [], [])).toEqual({ fecha: '2026-02-12', origen: 'ingreso' });
    expect(fechaBaseTrasiego({ historial_etapas: [{ desde: '2026-04-01' }] }, [], []))
      .toEqual({ fecha: '2026-04-01', origen: 'etapa' });
    expect(fechaBaseTrasiego({}, [], [{ fecha_analisis: '2026-05-02' }, { fecha_analisis: '2026-04-20' }]))
      .toEqual({ fecha: '2026-04-20', origen: 'analisis' });
    expect(fechaBaseTrasiego({}, [], [])).toBeNull();
  });
});

describe('itemsTrasiego', () => {
  const lotes = [
    { lote: '26101', variedad: 'Malbec', litros_actuales: 2000, cap225: 9, vasija_actual: 'Barricas', fecha_ingreso: '2026-03-01' },
    { lote: '26102', variedad: 'Malbec', litros_actuales: 500, cap225: 2, fecha_ingreso: '2026-07-20' },
    { lote: '26103', variedad: 'Syrah', litros_actuales: 300, vasija_actual: 't50' },
    { lote: '26104', variedad: 'Syrah', litros_actuales: 0, cap225: 4 },
    { lote: '26105', variedad: 'Petit Verdot', litros_actuales: 900, cap225: 4, fecha_ingreso: '2026-02-01' },
    { lote: '26106', variedad: 'Bonarda', litros_actuales: 400, vasija_actual: 'Barrica + t50' },
  ];
  const movs = [
    { lote: '26101', tipo: 'trasiego', fecha: '2026-06-01' },
    { lote: '26099', lote_destino: '26105', tipo: 'traspaso', fecha: '2026-07-01' },
    { lote: '26105', tipo: 'trasiego', fecha: '2026-10-15', estado: 'pendiente', ot: '0712' },
  ];
  const items = itemsTrasiego(lotes, movs, [], cfg, HOY);
  const de = (l) => items.find(i => i.lote === l);

  it('vencido hace 45 dias: alta y urgente', () => {
    expect(de('26101')).toMatchObject({ base: '2026-06-01', origen: 'movimiento', vencimiento: '2026-08-30',
      d: 45, prioridad: 'alta', urgente: true, objetivo: HOY, barriles: 9, enCurso: null });
  });
  it('vence en 4 dias: media, apunta al vencimiento', () => {
    expect(de('26102')).toMatchObject({ origen: 'ingreso', vencimiento: '2026-10-18', d: -4,
      prioridad: 'media', urgente: false, objetivo: '2026-10-18' });
  });
  it('tanques y lotes vacios no entran', () => {
    expect(de('26103')).toBeUndefined();
    expect(de('26104')).toBeUndefined();
  });
  it('cuenta el traspaso donde el lote es destino y marca la OT pendiente como en curso', () => {
    expect(de('26105')).toMatchObject({ base: '2026-07-01', vencimiento: '2026-09-29', d: 15, prioridad: 'media',
      enCurso: { fecha: '2026-10-15', ot: '0712' } });
  });
  it('sin ninguna fecha: sinBase, prioridad media, sin objetivo', () => {
    expect(de('26106')).toMatchObject({ sinBase: true, prioridad: 'media', objetivo: null, vencimiento: null });
  });
});

const it_ = (lote, extra) => ({ lote, orden: 1, ordenFecha: '2026-09-01', ...extra });

describe('repartir', () => {
  const dias = armarDias('2026-10-12', 14, mapaFeriados([{ fecha: '2026-10-12', nombre: 'Feriado' }]));
  const cupo2 = () => 2;

  it('armarDias marca feriados y fines de semana', () => {
    expect(dias[0]).toEqual({ fecha: '2026-10-12', habil: false, feriado: 'Feriado' });
    expect(dias[5]).toMatchObject({ fecha: '2026-10-17', habil: false, feriado: null });
    expect(dias).toHaveLength(14);
  });

  it('urgentes desde hoy con cupo; lo demas en su fecha, primero hacia atras y despues hacia adelante', () => {
    const items = [
      it_('1', { urgente: true, objetivo: HOY, ordenFecha: '2026-09-01' }),
      it_('2', { urgente: true, objetivo: HOY, ordenFecha: '2026-09-02' }),
      it_('3', { urgente: true, objetivo: HOY, ordenFecha: '2026-09-03' }),
      it_('5', { urgente: false, objetivo: '2026-10-15', orden: 4, ordenFecha: '2026-10-15' }),
      it_('9', { urgente: false, objetivo: '2026-10-15', orden: 4, ordenFecha: '2026-10-15' }),
      it_('7', { urgente: false, objetivo: '2026-10-18', orden: 4, ordenFecha: '2026-10-18' }), // domingo
    ];
    const r = repartir(items, dias, cupo2, HOY);
    const lotes = (f) => r.get(f).map(i => i.lote);
    expect(lotes('2026-10-14')).toEqual(['1', '2']);
    expect(lotes('2026-10-15')).toEqual(['3', '5']);
    expect(lotes('2026-10-16')).toEqual(['9', '7']);   // 9: 15 y 14 llenos -> adelante; 7: domingo -> viernes
    expect(lotes('2026-10-13')).toEqual([]);            // los dias pasados no reciben nada
    expect(items.find(i => i.lote === '7').programado).toBe('2026-10-16');
  });

  it('sin lugar en todo el horizonte queda marcado; fuera del horizonte no se ubica', () => {
    const muchos = Array.from({ length: 25 }, (_, k) => it_(String(100 + k), { urgente: true, objetivo: HOY }));
    const lejos = it_('900', { urgente: false, objetivo: '2027-01-10', orden: 5, ordenFecha: '2027-01-10' });
    repartir([...muchos, lejos], dias, cupo2, HOY);
    expect(muchos.filter(i => i.sinLugar)).toHaveLength(25 - 2 * 8); // 8 dias habiles desde hoy (14 al 23/10, sin 17-18)
    expect(lejos.programado).toBeNull();
    expect(lejos.sinLugar).toBe(false);
  });

  it('un trasiego en curso va al dia de su OT; si ya paso, a hoy y atrasado', () => {
    const a = it_('A', { urgente: true, objetivo: HOY, enCurso: { fecha: '2026-10-16', ot: '1' } });
    const b = it_('B', { urgente: true, objetivo: HOY, enCurso: { fecha: '2026-10-13', ot: '2' } });
    const r = repartir([a, b], dias, cupo2, HOY);
    expect(r.get('2026-10-16').map(i => i.lote)).toEqual(['A']);
    expect(r.get(HOY).map(i => i.lote)).toEqual(['B']);
    expect(b.atrasado).toBe(true);
  });
});

describe('planificar', () => {
  const datos = {
    lotes: [{ lote: '26101', variedad: 'Malbec', litros_actuales: 2000, cap225: 9, fecha_ingreso: '2026-03-01' }],
    analisis: [], movimientos: [{ lote: '26101', tipo: 'trasiego', fecha: '2026-06-01' }],
    config: {}, hoy: HOY,
  };

  it('arma 8 semanas desde el lunes, con el feriado del 12/10', () => {
    const p = planificar({ ...datos, dashLotes: [] });
    expect(p.dias).toHaveLength(56);
    expect(p.dias[0]).toMatchObject({ fecha: '2026-10-12', habil: false, feriado: 'Día del Respeto a la Diversidad Cultural' });
    expect(p.dias.find(d => d.fecha === HOY).trasiegos.map(t => t.lote)).toEqual(['26101']);
    expect(p.dias[2]).toMatchObject({ cupoA: 55, cupoT: 4, excedidoA: false, excedidoT: false });
  });

  it('sin dashboard: solo trasiegos y el aviso', () => {
    const p = planificar({ ...datos, dashLotes: null });
    expect(p.sinAlertas).toBe(true);
    expect(p.bandeja.analisis).toEqual([]);
    expect(p.bandeja.trasiegos.map(t => t.lote)).toEqual(['26101']);
  });

  it('la bandeja de analisis va por prioridad y deja afuera los programados', () => {
    const dash = [
      { lote: '2', activo: true, alarmas: ['frecuencia_vencida'], ultima_fecha_control: '2026-09-01', frecuencia_max: 15 },
      { lote: '1', activo: true, alarmas: ['av_alerta'], ultima_fecha_control: '2026-10-10', frecuencia_max: 15 },
      { lote: '3', activo: true, alarmas: [], ultima_fecha_control: '2026-10-10', frecuencia_max: 30 },
    ];
    const p = planificar({ ...datos, dashLotes: dash });
    expect(p.bandeja.analisis.map(i => i.lote)).toEqual(['1', '2']);
    expect(p.bandeja.analisis[0].programado).toBe(HOY);
  });

  it('respeta los cupos de config.agenda', () => {
    const p = planificar({ ...datos, config: { agenda: { cupo_trasiegos: 0 } }, dashLotes: [] });
    expect(p.dias.every(d => d.trasiegos.length === 0)).toBe(true);
    expect(p.bandeja.trasiegos[0].sinLugar).toBe(true);
  });
});

/* Frecuencia de trasiego por criterios (tabla de Configuracion): proyecto pisa a
 * variedad y variedad al general, igual que el resto de los criterios FML. */
import { diasTrasiegoDe } from '../public/lotes/js/agenda.js';

describe('frecuencia de trasiego por criterios', () => {
  const config = { criterios_fml: {
    default: { frecuencia_trasiego: 90 },
    por_variedad: { 'Pinot Noir': { frecuencia_trasiego: 120 }, Malbec: { frecuencia_trasiego: 0 } },
    por_proyecto: { Icono: { frecuencia_trasiego: 60 } },
  } };

  it('sin config rige 90', () => {
    expect(diasTrasiegoDe({ variedad: 'Malbec' }, {})).toBe(90);
  });
  it('la variedad pisa al general (sin distinguir mayusculas)', () => {
    expect(diasTrasiegoDe({ variedad: 'pinot noir' }, config)).toBe(120);
  });
  it('el proyecto pisa a la variedad', () => {
    expect(diasTrasiegoDe({ variedad: 'Pinot Noir', proyecto: 'Icono' }, config)).toBe(60);
  });
  it('un valor invalido (0) cae al general', () => {
    expect(diasTrasiegoDe({ variedad: 'Malbec' }, config)).toBe(90);
  });
  it('un general invalido cae a 90', () => {
    expect(diasTrasiegoDe({}, { criterios_fml: { default: { frecuencia_trasiego: 'x' } } })).toBe(90);
  });

  it('itemsTrasiego usa la frecuencia del lote y la informa', () => {
    const lotes = [
      { lote: '26201', variedad: 'Pinot Noir', litros_actuales: 900, cap225: 4, fecha_ingreso: '2026-07-20' },
      { lote: '26202', variedad: 'Syrah', litros_actuales: 900, cap225: 4, fecha_ingreso: '2026-07-20' },
    ];
    const items = itemsTrasiego(lotes, [], [], cfg, HOY, config);
    const de = (l) => items.find(i => i.lote === l);
    expect(de('26201')).toMatchObject({ dias_trasiego: 120, vencimiento: '2026-11-17', d: -34, prioridad: 'baja' });
    expect(de('26202')).toMatchObject({ dias_trasiego: 90, vencimiento: '2026-10-18', d: -4, prioridad: 'media' });
  });

  it('planificar pasa la config a los trasiegos', () => {
    const p = planificar({ lotes: [{ lote: '26201', variedad: 'Pinot Noir', litros_actuales: 900, cap225: 4,
      fecha_ingreso: '2026-07-20' }], analisis: [], movimientos: [], dashLotes: [], config, hoy: HOY });
    const dia = p.dias.find(d => d.trasiegos.some(t => t.lote === '26201'));
    expect(dia.fecha).toBe('2026-11-17');
  });
});

/* Reprogramar un trasiego a mano (datos.agenda, clase 'fijado'): vale hasta que
 * el lote se trasiega de verdad. */
import { fijadosTrasiego } from '../public/lotes/js/agenda.js';

describe('trasiegos reprogramados a mano', () => {
  const lote = (n) => ({ lote: n, variedad: 'Malbec', litros_actuales: 2000, cap225: 9, fecha_ingreso: '2026-03-01' });
  const fij = (l, fecha, el = '2026-10-14T10:00:00') => ({ id: 'f' + l + fecha, clase: 'fijado', tipo: 'trasiego', lote: l, fecha, por: 'x', el });
  const base = { lotes: [lote('26101'), lote('26102')], analisis: [], movimientos: [], config: {}, hoy: HOY, dashLotes: [] };
  const dia = (p, f) => p.dias.find(d => d.fecha === f).trasiegos.map(t => t.lote);

  it('fijadosTrasiego: gana el ultimo por lote e ignora otras clases y tipos', () => {
    const m = fijadosTrasiego([
      fij('26101', '2026-10-20', '2026-10-13T08:00:00'), fij('26101', '2026-10-22', '2026-10-14T08:00:00'),
      { id: 'p', clase: 'prioridad', lote: '26102', prioridad: 'alta' },
      { id: 'a', clase: 'fijado', tipo: 'analisis', lote: '26102', fecha: '2026-10-20' },
    ], []);
    expect([...m]).toEqual([['26101', '2026-10-22']]);
  });

  it('el reprogramado va a su dia aunque exceda el cupo, y no ocupa lugar en otro', () => {
    const p = planificar({ ...base, agenda: [fij('26101', '2026-10-21')], config: { agenda: { cupo_trasiegos: 1 } } });
    expect(dia(p, HOY)).toEqual(['26102']);
    expect(dia(p, '2026-10-21')).toEqual(['26101']);
    const t = p.dias.find(d => d.fecha === '2026-10-21').trasiegos[0];
    expect(t.fijado).toBe('2026-10-21');
  });

  it('caduca cuando el lote se trasiega despues de reprogramarlo', () => {
    const movimientos = [{ lote: '26101', tipo: 'trasiego', fecha: '2026-10-15' }];
    expect(fijadosTrasiego([fij('26101', '2026-10-21')], movimientos).size).toBe(0);
    // un movimiento anterior a la decision no la cumple
    expect(fijadosTrasiego([fij('26101', '2026-10-21')], [{ lote: '26101', tipo: 'trasiego', fecha: '2026-10-01' }]).size).toBe(1);
    // uno pendiente (OT sin confirmar) tampoco
    expect(fijadosTrasiego([fij('26101', '2026-10-21')], [{ lote: '26101', tipo: 'trasiego', fecha: '2026-10-20', estado: 'pendiente' }]).size).toBe(1);
  });

  it('reprogramado a un dia que ya paso: vuelve al reparto automatico y queda atrasado', () => {
    const p = planificar({ ...base, agenda: [fij('26101', '2026-10-13', '2026-10-10T08:00:00')] });
    const t = p.dias.find(d => d.fecha === HOY).trasiegos.find(x => x.lote === '26101');
    expect(t.atrasado).toBe(true);
    expect(t.fijado).toBe(null);
  });

  it('una OT emitida manda sobre el reprogramado', () => {
    const movimientos = [{ lote: '26101', tipo: 'trasiego', fecha: '2026-10-16', estado: 'pendiente', ot: '7' }];
    const p = planificar({ ...base, movimientos, agenda: [fij('26101', '2026-10-21')] });
    expect(dia(p, '2026-10-16')).toEqual(['26101']);
    expect(dia(p, '2026-10-21')).toEqual([]);
  });
});

/* Ronda semanal de tanques: todos los lotes activos fuera de barricas, el dia
 * de config.agenda.ronda_tanques_dia (jueves por defecto), cupo aparte. */
import { rondaTanques } from '../public/lotes/js/agenda.js';

describe('ronda de tanques', () => {
  const tq = (n, extra = {}) => ({ lote: n, variedad: 'Malbec', litros_actuales: 5000, vasija_actual: 't' + n.slice(-2), ...extra });
  const barr = { lote: '26900', variedad: 'Malbec', litros_actuales: 2000, cap225: 9, fecha_ingreso: '2026-03-01' };
  const base = { lotes: [tq('26010'), tq('26011'), tq('26012', { litros_actuales: 0 }), barr], analisis: [], movimientos: [], config: {}, hoy: HOY, dashLotes: [] };
  const ronda = (p, f) => p.dias.find(d => d.fecha === f).ronda.map(i => i.lote);

  it('los jueves, con todos los lotes activos que no estan en barricas', () => {
    const p = planificar(base);
    expect(ronda(p, '2026-10-15')).toEqual(['26010', '26011']);
    expect(ronda(p, '2026-10-22')).toEqual(['26010', '26011']);
    expect(ronda(p, '2026-10-16')).toEqual([]);
    expect(p.dias.find(d => d.fecha === '2026-10-15').ronda[0]).toMatchObject({ ronda: true, prioridad: 6, motivo: 'Ronda de tanques' });
  });

  it('el dia se cambia en config.agenda; 0 la apaga', () => {
    expect(ronda(planificar({ ...base, config: { agenda: { ronda_tanques_dia: 5 } } }), '2026-10-16')).toEqual(['26010', '26011']);
    expect(planificar({ ...base, config: { agenda: { ronda_tanques_dia: 0 } } }).dias.every(d => d.ronda.length === 0)).toBe(true);
  });

  it('feriado: pasa al siguiente dia habil de la semana; la semana ya pasada no lleva ronda', () => {
    const p = planificar({ ...base, config: { agenda: { ronda_tanques_dia: 1, feriados: [{ fecha: '2026-10-19', nombre: 'X' }] } } });
    expect(ronda(p, '2026-10-12')).toEqual([]);   // lunes de esta semana: ya paso
    expect(ronda(p, '2026-10-19')).toEqual([]);
    expect(ronda(p, '2026-10-20')).toEqual(['26010', '26011']);
  });

  it('no repite un lote que esa semana ya tiene analisis cargado o programado por alerta', () => {
    const analisis = [{ lote: '26010', fecha_analisis: '2026-10-13' }];
    const dash = [{ lote: '26011', activo: true, alarmas: ['av_alerta'], ultima_fecha_control: '2026-10-01', frecuencia_max: 15 }];
    const p = planificar({ ...base, analisis, dashLotes: dash });
    expect(ronda(p, '2026-10-15')).toEqual([]);
    expect(ronda(p, '2026-10-22')).toEqual(['26010', '26011']);
  });

  it('no consume el cupo de analisis', () => {
    const p = planificar({ ...base, config: { agenda: { cupo_analisis: 0 } } });
    expect(ronda(p, '2026-10-15')).toHaveLength(2);
    expect(p.dias.find(d => d.fecha === '2026-10-15').excedidoA).toBe(false);
  });
});
