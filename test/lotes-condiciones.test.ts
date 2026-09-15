import { describe, it, expect } from 'vitest';
import {
  so2LibreDe, valorValido, fechaDia,
  esMedicionUtil, tieneAnalisisValido, ultimoControlProceso, estadoFrecuencia,
  desdeCuando, phFueraDeCriterio, estadoPh, estadoSo2,
  caidaSo2, alertaAv, estadoFml, estadoFa, decisionFmlPresente,
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

describe('desde cuando', () => {
  const filas = [
    { fecha_analisis: '2026-06-01', ph: 3.5 },
    { fecha_analisis: '2026-07-01', ph: 3.9 },
    { fecha_analisis: '2026-08-01', ph: 3.9 },
  ];

  it('devuelve el mas viejo de la corrida que sigue cumpliendo', () => {
    expect(desdeCuando(filas, (a) => (a.ph == null ? null : Number(a.ph) > 3.75))).toBe('2026-07-01');
  });

  it('las filas sin el dato no cortan la corrida', () => {
    const conHueco = [
      { fecha_analisis: '2026-07-01', ph: 3.9 },
      { fecha_analisis: '2026-07-15', av: 0.4 },
      { fecha_analisis: '2026-08-01', ph: 3.9 },
    ];
    expect(desdeCuando(conHueco, (a) => (a.ph == null ? null : Number(a.ph) > 3.75))).toBe('2026-07-01');
  });

  it('si la ultima no cumple, no hay desde', () => {
    expect(desdeCuando(filas, (a) => (a.ph == null ? null : Number(a.ph) > 4.5))).toBe(null);
  });
});

describe('pH', () => {
  it('por defecto el limite es exclusivo', () => {
    expect(phFueraDeCriterio(3.75, { ...CRITERIOS_DEFAULT })).toBe(false);
    expect(phFueraDeCriterio(3.76, { ...CRITERIOS_DEFAULT })).toBe(true);
  });

  it('el Cabernet lo tiene inclusivo', () => {
    const cab = { ...CRITERIOS_DEFAULT, ph_max: 3.79, ph_max_inclusive: 'si' };
    expect(phFueraDeCriterio(3.79, cab)).toBe(true);
    expect(phFueraDeCriterio(3.78, cab)).toBe(false);
  });

  it('manda el ultimo pH, no el mejor', () => {
    const r = estadoPh(
      [
        { fecha_analisis: '2026-06-01', ph: 3.5 },
        { fecha_analisis: '2026-08-01', ph: 3.9 },
      ],
      { ...CRITERIOS_DEFAULT },
    );
    expect(r.estado).toBe('no_ok');
    expect(r.valor).toBe(3.9);
    expect(r.desde).toBe('2026-08-01');
  });

  it('sin ningun pH queda sin datos', () => {
    expect(estadoPh([{ fecha_analisis: '2026-08-01', av: 0.4 }], { ...CRITERIOS_DEFAULT }).estado).toBe('sin_datos');
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

describe('SO2', () => {
  const base = { ...CRITERIOS_DEFAULT, so2_libre_piso: 20 };

  it('en el piso exacto es no OK', () => {
    const r = estadoSo2([{ fecha_analisis: '2026-08-01', so2_libre: 20, ph: 3.4 }], base);
    expect(r.estado).toBe('no_ok');
  });

  it('arriba del piso pero con molecular bajo tambien es no OK', () => {
    // pH 3.8: molecular = 28 / (1 + 10^2) = 0.277 < 0.38
    const r = estadoSo2([{ fecha_analisis: '2026-08-01', so2_libre: 28, ph: 3.8 }], base);
    expect(r.estado).toBe('no_ok');
    expect(r.molecular).toBeCloseTo(0.277, 3);
  });

  it('arriba del piso y con molecular suficiente es OK', () => {
    // pH 3.2: molecular = 24 / (1 + 10^1.4) = 0.925 >= 0.38
    const r = estadoSo2([{ fecha_analisis: '2026-08-01', so2_libre: 24, ph: 3.2 }], base);
    expect(r.estado).toBe('ok');
  });

  it('sin pH en la muestra cae al ultimo pH del lote, como el tablero', () => {
    // El lote 26031 del tablero aprobado tiene el SO2 del 19/08 y el pH del
    // 11/09, y queda "ok": el pH de referencia puede venir de otra muestra.
    const r = estadoSo2(
      [
        { fecha_analisis: '2026-08-01', so2_libre: 26 },
        { fecha_analisis: '2026-09-11', ph: 3.2 },
      ],
      base,
    );
    expect(r.estado).toBe('ok');
    expect(r.ph_referencia).toBe(3.2);
    expect(r.ph_referencia_fecha).toBe('2026-09-11');
    expect(r.libre_fecha).toBe('2026-08-01');
  });

  it('sin ningun pH en todo el lote si queda sin datos', () => {
    const r = estadoSo2([{ fecha_analisis: '2026-08-01', so2_libre: 26 }], base);
    expect(r.estado).toBe('sin_datos');
  });

  it('el proyecto sin adicion de SO2 no aplica', () => {
    const r = estadoSo2([{ fecha_analisis: '2026-08-01', so2_libre: 8, ph: 3.4 }], { ...base, so2_aplica: 'no' });
    expect(r.estado).toBe('no_aplica');
  });

  it('el 0 no es una medicion', () => {
    expect(estadoSo2([{ fecha_analisis: '2026-08-01', so2_libre: 0, ph: 3.4 }], base).estado).toBe('sin_datos');
  });
});

describe('caida de SO2', () => {
  const base = { ...CRITERIOS_DEFAULT };

  it('una caida de mas de 12 ppm alarma', () => {
    const r = caidaSo2([
      { fecha_analisis: '2026-07-01', so2_libre: 35 },
      { fecha_analisis: '2026-08-01', so2_libre: 22 },
    ], base);
    expect(r.alerta).toBe(true);
    expect(r.caida).toBe(13);
  });

  it('12 clavado NO alarma: el umbral es estricto', () => {
    const r = caidaSo2([
      { fecha_analisis: '2026-07-01', so2_libre: 34 },
      { fecha_analisis: '2026-08-01', so2_libre: 22 },
    ], base);
    expect(r.alerta).toBe(false);
  });

  it('no se evalua en proyectos sin SO2', () => {
    const r = caidaSo2([
      { fecha_analisis: '2026-07-01', so2_libre: 35 },
      { fecha_analisis: '2026-08-01', so2_libre: 10 },
    ], { ...base, so2_aplica: 'no' });
    expect(r.alerta).toBe(false);
  });

  it('dos mediciones del mismo dia no son dos fechas distintas', () => {
    const r = caidaSo2([
      { fecha_analisis: '2026-08-01', so2_libre: 35 },
      { fecha_analisis: '2026-08-01', so2_libre: 18 },
    ], base);
    expect(r.alerta).toBe(false);
  });
});

describe('AV', () => {
  const base = { ...CRITERIOS_DEFAULT };

  it('por encima del umbral', () => {
    const r = alertaAv([{ fecha_analisis: '2026-08-01', av: 0.95 }], base);
    expect(r.alerta).toBe(true);
    expect(r.motivo).toBe('umbral');
  });

  it('por salto en la ventana de 15 dias', () => {
    const r = alertaAv([
      { fecha_analisis: '2026-08-01', av: 0.3 },
      { fecha_analisis: '2026-08-10', av: 0.7 },
    ], base);
    expect(r.alerta).toBe(true);
    expect(r.motivo).toBe('aumento');
    expect(r.delta).toBeCloseTo(0.4, 5);
  });

  it('el mismo salto fuera de la ventana no alarma', () => {
    const r = alertaAv([
      { fecha_analisis: '2026-06-01', av: 0.3 },
      { fecha_analisis: '2026-08-10', av: 0.7 },
    ], base);
    expect(r.alerta).toBe(false);
  });

  it('el -999 del FOSS alarma con su propio motivo', () => {
    const r = alertaAv([{ fecha_analisis: '2026-08-01', av: -999 }], base);
    expect(r.alerta).toBe(true);
    expect(r.motivo).toBe('fuera_rango_foss');
  });
});

describe('FML', () => {
  const blanca = { ...CRITERIOS_DEFAULT, hace_fml: 'no' };
  const tinta = { ...CRITERIOS_DEFAULT };

  it('la variedad blanca excluye, y el origen lo dice', () => {
    const r = estadoFml([{ fecha_analisis: '2026-08-01', malico: 2.0 }], blanca, { lote: '1' });
    expect(r.estado).toBe('excluida');
    expect(r.origen).toBe('variedad_blanca');
  });

  it('el lote le gana a la variedad', () => {
    const r = estadoFml([{ fecha_analisis: '2026-08-01', malico: 2.0 }], blanca, { lote: '1', hace_fml: 'si' });
    expect(r.estado).toBe('no_finalizada');
    expect(r.origen).toBe('lote');
  });

  it('sin decision en ningun lado el origen queda sin dato', () => {
    const r = estadoFml([{ fecha_analisis: '2026-08-01', malico: 2.0 }], tinta, { lote: '1' });
    expect(r.origen).toBe('sin_dato');
  });

  it('cierra por malico bajo', () => {
    expect(estadoFml([{ fecha_analisis: '2026-08-01', malico: 0.1 }], tinta, { lote: '1' }).estado).toBe('finalizada');
  });

  it('cierra por dos ultimas por debajo de 0.5', () => {
    const r = estadoFml([
      { fecha_analisis: '2026-07-01', malico: 0.4 },
      { fecha_analisis: '2026-08-01', malico: 0.3 },
    ], tinta, { lote: '1' });
    expect(r.estado).toBe('finalizada');
  });

  it('la decision esta presente si la pone la variedad', () => {
    expect(decisionFmlPresente({ lote: '1' }, blanca)).toBe(true);
    expect(decisionFmlPresente({ lote: '1' }, tinta)).toBe(false);
    expect(decisionFmlPresente({ lote: '1', hace_fml: 'si' }, tinta)).toBe(true);
  });

  it('finalizada informa el origen, no null', () => {
    // lote con hace_fml:'si' y malico bajo: cierra por finalizada y el origen es 'lote'
    const r = estadoFml(
      [{ fecha_analisis: '2026-08-01', malico: 0.05 }],
      tinta,
      { lote: '26008', hace_fml: 'si' },
    );
    expect(r.estado).toBe('finalizada');
    expect(r.origen).toBe('lote');
  });
});

describe('FA', () => {
  const base = { ...CRITERIOS_DEFAULT }; // fa_azucar_reductor_max = 5.0

  it('sin ningun azucar reductor valido devuelve sin_dato', () => {
    const r = estadoFa([{ fecha_analisis: '2026-08-01', ph: 3.5 }], base);
    expect(r.estado).toBe('sin_dato');
    expect(r.desde).toBe(null);
  });

  it('ultimo azucar reductor por encima del max es no_finalizada', () => {
    // 7.2 > 5.0 => abierta
    const r = estadoFa(
      [
        { fecha_analisis: '2026-07-01', azucar_reductor: 12.0 },
        { fecha_analisis: '2026-08-01', azucar_reductor: 7.2 },
      ],
      base,
    );
    expect(r.estado).toBe('no_finalizada');
    // desde apunta a la mas vieja de la corrida por encima del umbral
    expect(r.desde).toBe('2026-07-01');
  });

  it('ultimo azucar reductor por debajo o igual al max es finalizada', () => {
    // 3.8 <= 5.0 => cerrada
    const r = estadoFa(
      [
        { fecha_analisis: '2026-07-01', azucar_reductor: 9.0 },
        { fecha_analisis: '2026-08-01', azucar_reductor: 3.8 },
      ],
      base,
    );
    expect(r.estado).toBe('finalizada');
    expect(r.desde).toBe(null);
  });
});
