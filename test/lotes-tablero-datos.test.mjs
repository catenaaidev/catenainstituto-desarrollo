/* tablero-datos.js es puro (sin DOM ni fetch), asi que se importa tal cual
 * dentro del runtime de Workers, igual que hace lotes-orden-fuente.test.mjs. */
import { describe, it, expect } from 'vitest';
import { chipsDe, antiguedadTexto, ordenarPorAntiguedad, pasaPregunta, PREGUNTAS } from '../public/lotes/js/tablero-datos.js';

const HOY = '2026-09-16';

/* Fila del dashboard sin una sola condicion activa. */
const SANO = {
  lote: '26001', variedad: 'Malbec',
  estado_frecuencia: 'al_dia', fml_estado: 'finalizada',
  so2_estado: 'ok', ph_estado: 'ok', estado_llenado: 'lleno',
  condiciones: [], alarmas: [],
};

const claves = (fila) => chipsDe(fila, HOY).map(c => c.clave);
const texto = (fila, clave) => chipsDe(fila, HOY).find(c => c.clave === clave).texto;

describe('chipsDe', () => {
  it('el lote sano lleva los cinco chips en verde', () => {
    const chips = chipsDe(SANO, HOY);
    expect(chips.map(c => c.texto)).toEqual(['Frec', 'FML', 'SO₂', 'pH', 'Lleno']);
    expect(chips.every(c => c.tono === 'ok')).toBe(true);
  });

  it('da vuelta el chip y le pone la antiguedad cuando la condicion esta activa', () => {
    const fila = {
      ...SANO, estado_frecuencia: 'vencido',
      condiciones: [{ clave: 'frecuencia_vencida', etiqueta: 'Frecuencia vencida', accion: 'hacer OT y analizar', desde: '2026-09-06' }],
      alarmas: ['frecuencia_vencida'],
    };
    expect(texto(fila, 'frecuencia')).toBe('Frec vencida · 10 d');
    expect(chipsDe(fila, HOY).find(c => c.clave === 'frecuencia').tono).toBe('mal');
  });

  it('sin fecha desde, el chip no inventa antiguedad', () => {
    const fila = {
      ...SANO, estado_llenado: 'no_lleno',
      condiciones: [{ clave: 'no_lleno', etiqueta: 'No lleno', accion: 'dar lleno o achicar', desde: null }],
      alarmas: ['no_lleno'],
    };
    expect(texto(fila, 'llenado')).toBe('No lleno');
  });

  it('SO2 no aplica se pinta neutro, no verde ni rojo', () => {
    expect(chipsDe({ ...SANO, so2_estado: 'no_aplica' }, HOY).find(c => c.clave === 'so2').tono).toBe('neutro');
  });

  it('sin datos tambien es neutro', () => {
    expect(chipsDe({ ...SANO, ph_estado: 'sin_datos' }, HOY).find(c => c.clave === 'ph').tono).toBe('neutro');
  });

  it('AV alerta y caida de SO2 solo aparecen cuando corresponden', () => {
    expect(claves(SANO)).not.toContain('av_alerta');
    const fila = {
      ...SANO,
      condiciones: [
        { clave: 'av_alerta', etiqueta: 'AV alerta', accion: 'revisar urgente', desde: '2026-09-14' },
        { clave: 'so2_caida_alerta', etiqueta: 'Caída de SO₂ libre', accion: 'confirmar SO2', desde: '2026-09-15' },
      ],
      alarmas: ['av_alerta', 'so2_caida_alerta'],
    };
    expect(claves(fila)).toContain('av_alerta');
    expect(texto(fila, 'av_alerta')).toBe('AV alerta · 2 d');
    expect(texto(fila, 'so2_caida_alerta')).toBe('Caída SO₂ · 1 d');
  });

  it('el titulo del chip trae la etiqueta y la accion que mando el motor', () => {
    const fila = {
      ...SANO, ph_estado: 'no_ok',
      condiciones: [{ clave: 'ph_no_ok', etiqueta: 'pH no OK', accion: 'revisar ajuste SO2/pH', desde: '2026-09-15' }],
      alarmas: ['ph_no_ok'],
    };
    expect(chipsDe(fila, HOY).find(c => c.clave === 'ph').titulo).toBe('pH no OK — revisar ajuste SO2/pH');
  });
});

describe('antiguedadTexto', () => {
  it('cuenta los dias en UTC', () => {
    expect(antiguedadTexto('2026-09-06', HOY)).toBe('10 d');
    expect(antiguedadTexto('2026-09-16', HOY)).toBe('hoy');
  });

  it('sin fecha devuelve vacio', () => {
    expect(antiguedadTexto(null, HOY)).toBe('');
  });

  it('una fecha futura no se disfraza de hoy: un desde adelantado es un error de carga', () => {
    expect(antiguedadTexto('2026-09-18', HOY)).toBe('-2 d');
  });
});

const conCondicion = (lote, desde) => ({
  lote, condiciones: desde === null ? [] : [{ clave: 'ph_no_ok', etiqueta: 'pH no OK', accion: 'x', desde }],
});

describe('ordenarPorAntiguedad', () => {
  it('primero la condicion mas vieja', () => {
    const filas = [conCondicion('B', '2026-09-10'), conCondicion('A', '2026-08-01'), conCondicion('C', '2026-09-15')];
    expect(ordenarPorAntiguedad(filas).map(f => f.lote)).toEqual(['A', 'B', 'C']);
  });

  it('los lotes sin condiciones van al final, no al principio', () => {
    const filas = [conCondicion('SANO', null), conCondicion('VIEJO', '2026-08-01')];
    expect(ordenarPorAntiguedad(filas).map(f => f.lote)).toEqual(['VIEJO', 'SANO']);
  });

  it('una condicion sin fecha ordena despues de las fechadas pero antes de las sanas', () => {
    const sinFecha = { lote: 'SIN_FECHA', condiciones: [{ clave: 'no_lleno', etiqueta: 'No lleno', accion: 'x', desde: null }] };
    const filas = [conCondicion('SANO', null), sinFecha, conCondicion('VIEJO', '2026-08-01')];
    expect(ordenarPorAntiguedad(filas).map(f => f.lote)).toEqual(['VIEJO', 'SIN_FECHA', 'SANO']);
  });

  it('no muta el array que recibe', () => {
    const filas = [conCondicion('B', '2026-09-10'), conCondicion('A', '2026-08-01')];
    ordenarPorAntiguedad(filas);
    expect(filas.map(f => f.lote)).toEqual(['B', 'A']);
  });
});

describe('pasaPregunta', () => {
  const fila = (extra) => ({ fml_estado: 'no_finalizada', fa_estado: 'finalizada', estado_llenado: 'lleno', alarmas: [], ...extra });

  it('las cinco preguntas del tablero, en orden', () => {
    expect(PREGUNTAS.map(p => p.val)).toEqual(['fml_no_terminada', 'fml_terminada', 'mermos', 'faltan_analizar', 'fa_en_proceso']);
  });

  it('sin pregunta elegida pasan todas las filas', () => {
    expect(pasaPregunta(fila(), '')).toBe(true);
  });

  it('FML no terminada y FML terminada son complementarias', () => {
    expect(pasaPregunta(fila({ fml_estado: 'no_finalizada' }), 'fml_no_terminada')).toBe(true);
    expect(pasaPregunta(fila({ fml_estado: 'finalizada' }), 'fml_no_terminada')).toBe(false);
    expect(pasaPregunta(fila({ fml_estado: 'finalizada' }), 'fml_terminada')).toBe(true);
    expect(pasaPregunta(fila({ fml_estado: 'excluida' }), 'fml_terminada')).toBe(true);
  });

  it('mermos mira el estado de llenado', () => {
    expect(pasaPregunta(fila({ estado_llenado: 'no_lleno' }), 'mermos')).toBe(true);
    expect(pasaPregunta(fila({ estado_llenado: 'lleno' }), 'mermos')).toBe(false);
  });

  it('faltan analizar junta las tres condiciones que piden OT (via accion del motor)', () => {
    const cond = (clave) => [{ clave, etiqueta: clave, accion: 'hacer OT y analizar', desde: null }];
    expect(pasaPregunta(fila({ alarmas: ['sin_analisis_valido'],       condiciones: cond('sin_analisis_valido')       }), 'faltan_analizar')).toBe(true);
    expect(pasaPregunta(fila({ alarmas: ['control_proceso_pendiente'], condiciones: cond('control_proceso_pendiente') }), 'faltan_analizar')).toBe(true);
    expect(pasaPregunta(fila({ alarmas: ['frecuencia_vencida'],        condiciones: cond('frecuencia_vencida')        }), 'faltan_analizar')).toBe(true);
    // ph_no_ok tiene otra accion: no entra en "faltan analizar"
    expect(pasaPregunta(fila({ alarmas: ['ph_no_ok'], condiciones: [{ clave: 'ph_no_ok', etiqueta: 'pH no OK', accion: 'revisar ajuste SO2/pH', desde: null }] }), 'faltan_analizar')).toBe(false);
  });

  it('FA en proceso es la FA sin terminar', () => {
    expect(pasaPregunta(fila({ fa_estado: 'no_finalizada' }), 'fa_en_proceso')).toBe(true);
    expect(pasaPregunta(fila({ fa_estado: 'finalizada' }), 'fa_en_proceso')).toBe(false);
  });
});
