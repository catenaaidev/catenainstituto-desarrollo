/* tablero-datos.js es puro (sin DOM ni fetch), asi que se importa tal cual
 * dentro del runtime de Workers, igual que hace lotes-orden-fuente.test.mjs. */
import { describe, it, expect } from 'vitest';
import { chipsDe, antiguedadTexto } from '../public/lotes/js/tablero-datos.js';

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
        { clave: 'so2_caida_alerta', etiqueta: 'Caída de SO₂ libre >12 ppm', accion: 'confirmar SO2', desde: '2026-09-15' },
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
});
