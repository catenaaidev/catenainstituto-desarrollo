import { describe, it, expect } from 'vitest';
import {
  so2LibreDe, valorValido, fechaDia,
  esMedicionUtil, tieneAnalisisValido, ultimoControlProceso, estadoFrecuencia,
} from '../src/lotes/motores/fml-condiciones';
import { CRITERIOS_DEFAULT } from '../src/lotes/motores/fml';

describe('helpers de condiciones', () => {
  it('el SO2 en 0 es un placeholder, no una medicion', () => {
    expect(so2LibreDe({ so2_libre: 0 })).toBe(null);
    expect(so2LibreDe({ so2_libre: 18 })).toBe(18);
  });

  it('prefiere so2_libre_actual y sabe mirar dentro de correccion', () => {
    expect(so2LibreDe({ so2_libre_actual: 31, so2_libre: 12 })).toBe(31);
    expect(so2LibreDe({ correccion: { so2_libre: 27 } })).toBe(27);
  });

  it('el -999 no es un valor', () => {
    expect(valorValido(-999)).toBe(null);
    expect(valorValido(0.62)).toBe(0.62);
  });

  it('la fecha se lee como dia UTC', () => {
    expect(fechaDia('2026-08-24T13:45:00')).toBe(Date.parse('2026-08-24T00:00:00Z'));
    expect(fechaDia('no es fecha')).toBe(null);
  });
});

const d = (iso: string) => Date.parse(iso + 'T00:00:00Z');
const eff = () => ({ ...CRITERIOS_DEFAULT });

describe('medicion util', () => {
  it('un control suelto de SO2 ya es analisis valido', () => {
    expect(esMedicionUtil({ fecha_analisis: '2026-08-01', so2_libre: 24 })).toBe(true);
  });

  it('una fila sin ninguna medicion no cuenta', () => {
    expect(esMedicionUtil({ fecha_analisis: '2026-08-01', comentario: 'nada' })).toBe(false);
  });

  it('el -999 no alcanza para ser medicion util', () => {
    expect(esMedicionUtil({ fecha_analisis: '2026-08-01', av: -999 })).toBe(false);
  });

  it('SO2 que viene dentro de correccion es medicion util', () => {
    expect(esMedicionUtil({ fecha_analisis: '2026-08-01', correccion: { so2_libre: 20 } })).toBe(true);
  });
});

describe('tiene analisis valido', () => {
  it('arreglo con al menos una fila util devuelve true', () => {
    const analisis = [
      { fecha_analisis: '2026-08-01', comentario: 'sin datos' },
      { fecha_analisis: '2026-08-05', so2_libre: 15 },
    ];
    expect(tieneAnalisisValido(analisis)).toBe(true);
  });

  it('arreglo sin ninguna fila util devuelve false', () => {
    const analisis = [
      { fecha_analisis: '2026-08-01', comentario: 'nada' },
      { fecha_analisis: '2026-08-05', av: -999 },
    ];
    expect(tieneAnalisisValido(analisis)).toBe(false);
  });

  it('arreglo vacio devuelve false', () => {
    expect(tieneAnalisisValido([])).toBe(false);
  });
});

describe('control de proceso', () => {
  it('exige etanol, AV y malico en la MISMA fila', () => {
    const filas = [
      { fecha_analisis: '2026-08-01', etanol: 13.9, av: 0.4 },
      { fecha_analisis: '2026-08-10', malico: 0.1 },
    ];
    expect(ultimoControlProceso(filas)).toBe(null);
  });

  it('toma el mas reciente que los tenga juntos', () => {
    const filas = [
      { fecha_analisis: '2026-07-01', etanol: 13.9, av: 0.4, malico: 0.1 },
      { fecha_analisis: '2026-08-01', etanol: 14.1, av: 0.5, malico: 0.1 },
      { fecha_analisis: '2026-08-20', ph: 3.6 },
    ];
    expect(ultimoControlProceso(filas)?.fecha_analisis).toBe('2026-08-01');
  });
});

describe('frecuencia', () => {
  it('un pH suelto NO reinicia el reloj', () => {
    const filas = [
      { fecha_analisis: '2026-07-01', etanol: 14, av: 0.4, malico: 0.6 },
      { fecha_analisis: '2026-08-20', ph: 3.6 },
    ];
    const r = estadoFrecuencia(filas, eff(), 'no_finalizada', d('2026-08-24'));
    expect(r.dias_desde_control).toBe(54);
    expect(r.estado).toBe('vencido');
    expect(r.desde).toBe('2026-07-16'); // 1 de julio + 15 dias
  });

  it('con FML terminada la frecuencia es de 30 dias', () => {
    const filas = [{ fecha_analisis: '2026-08-01', etanol: 14, av: 0.4, malico: 0.1 }];
    const r = estadoFrecuencia(filas, eff(), 'finalizada', d('2026-08-24'));
    expect(r.frecuencia_max).toBe(30);
    expect(r.estado).toBe('al_dia');
  });

  it('la FML excluida tambien afloja a 30 dias', () => {
    const filas = [{ fecha_analisis: '2026-08-01', etanol: 14, av: 0.4, malico: 0.1 }];
    expect(estadoFrecuencia(filas, eff(), 'excluida', d('2026-08-24')).frecuencia_max).toBe(30);
  });

  it('sin saber el estado de la FML se exige el plazo corto', () => {
    // Lote 26280 del tablero: fml_estado sin_datos y frecuencia_maxima 15.
    const filas = [{ fecha_analisis: '2026-08-01', etanol: 14, av: 0.4, malico: 0.1 }];
    expect(estadoFrecuencia(filas, eff(), 'sin_dato', d('2026-08-24')).frecuencia_max).toBe(15);
  });

  it('sin control de proceso queda pendiente y sin datos', () => {
    const r = estadoFrecuencia([{ fecha_analisis: '2026-08-01', ph: 3.6 }], eff(), 'no_finalizada', d('2026-08-24'));
    expect(r.control_proceso_pendiente).toBe(true);
    expect(r.estado).toBe('sin_datos');
    expect(r.dias_desde_control).toBe(null);
  });
});
