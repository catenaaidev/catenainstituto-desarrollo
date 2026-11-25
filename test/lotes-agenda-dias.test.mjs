/* Agenda: fechas en UTC, dias habiles, feriados y parametros de config.agenda. */
import { describe, it, expect } from 'vitest';
import { AGENDA_DEFAULT, FERIADOS_AR, esIso, sumarDias, difDias, diaSemana, lunesDe,
         configAgenda, mapaFeriados, esHabil, asegurarConfigAgenda, fijarParametro,
         agregarFeriado, quitarFeriado, restaurarFeriados, MINIMOS, MAXIMOS } from '../public/lotes/js/agenda-dias.js';

describe('fechas', () => {
  it('suma y resta dias sin que el huso corra la fecha', () => {
    expect(sumarDias('2026-10-14', 3)).toBe('2026-10-17');
    expect(sumarDias('2026-07-20', 90)).toBe('2026-10-18');
    expect(difDias('2026-10-14', '2026-10-17')).toBe(3);
    expect(difDias('2026-08-30', '2026-10-14')).toBe(45);
  });
  it('dia de la semana y lunes de la semana', () => {
    expect(diaSemana('2026-10-14')).toBe(3);      // miercoles
    expect(lunesDe('2026-10-14')).toBe('2026-10-12');
    expect(lunesDe('2026-10-18')).toBe('2026-10-12'); // domingo -> lunes anterior
    expect(lunesDe('2026-10-12')).toBe('2026-10-12');
  });
  it('esIso rechaza basura y fechas que no existen', () => {
    expect(esIso('2026-10-14')).toBe(true);
    expect(esIso('2026-02-30')).toBe(false);
    expect(esIso('14/10/2026')).toBe(false);
    expect(esIso(null)).toBe(false);
  });
});

describe('dias habiles', () => {
  const fer = mapaFeriados(FERIADOS_AR);
  it('feriado, sabado y domingo no son habiles', () => {
    expect(esHabil('2026-10-12', fer)).toBe(false); // Diversidad Cultural
    expect(esHabil('2026-10-13', fer)).toBe(true);
    expect(esHabil('2026-10-17', fer)).toBe(false);
    expect(esHabil('2026-10-18', fer)).toBe(false);
  });
  it('los feriados precargados son fechas validas, ordenadas y sin repetir', () => {
    const fechas = FERIADOS_AR.map(f => f.fecha);
    expect(fechas.every(esIso)).toBe(true);
    expect([...fechas].sort()).toEqual(fechas);
    expect(new Set(fechas).size).toBe(fechas.length);
    expect(fer.get('2026-10-12')).toBe('Día del Respeto a la Diversidad Cultural');
  });
});

describe('configAgenda', () => {
  it('sin config.agenda rigen los defaults y los feriados precargados', () => {
    const c = configAgenda({});
    expect(c.cupo_analisis).toBe(55);
    expect(c.cupo_trasiegos).toBe(4);
    expect(c.feriados).toEqual(FERIADOS_AR);
    expect(c.feriados).not.toBe(FERIADOS_AR); // copia: editarla no toca la constante
  });
  it('toma lo valido y descarta lo invalido', () => {
    const c = configAgenda({ agenda: { cupo_analisis: 60, cupo_trasiegos: 'x', horizonte_semanas: 0,
      feriados: [{ fecha: '2026-10-20', nombre: 'X' }, { fecha: 'mal' }] } });
    expect(c.cupo_analisis).toBe(60);
    expect(c.cupo_trasiegos).toBe(4);
    expect(c.horizonte_semanas).toBe(8);
    expect(c.feriados).toEqual([{ fecha: '2026-10-20', nombre: 'X' }]);
  });
  it('no se cae con config rara', () => {
    expect(configAgenda(null).cupo_analisis).toBe(AGENDA_DEFAULT.cupo_analisis);
    expect(configAgenda({ agenda: [] }).cupo_analisis).toBe(55);
  });
});

describe('edicion de config.agenda', () => {
  it('asegurarConfigAgenda materializa defaults + feriados una sola vez', () => {
    const datos = {};
    const a = asegurarConfigAgenda(datos);
    expect(datos.config.agenda).toBe(a);
    expect(a.cupo_analisis).toBe(55);
    expect(a.feriados.length).toBe(FERIADOS_AR.length);
    expect(asegurarConfigAgenda(datos)).toBe(a);
  });
  it('fijarParametro valida enteros y minimos', () => {
    const datos = {};
    expect(fijarParametro(datos, 'cupo_analisis', '58')).toBe(true);
    expect(datos.config.agenda.cupo_analisis).toBe(58);
    expect(fijarParametro(datos, 'cupo_trasiegos', '0')).toBe(true);
    // La frecuencia de trasiego vive en la tabla de criterios, no en config.agenda.
    expect(fijarParametro(datos, 'dias_trasiego', '120')).toBe(false);
    expect('dias_trasiego' in datos.config.agenda).toBe(false);
    expect(fijarParametro(datos, 'cupo_analisis', '3,5')).toBe(false);
    expect(fijarParametro(datos, 'inventado', '3')).toBe(false);
  });
  it('horizonte_semanas tiene tope de 52', () => {
    const datos = {};
    expect(fijarParametro(datos, 'horizonte_semanas', '52')).toBe(true);
    expect(fijarParametro(datos, 'horizonte_semanas', '53')).toBe(false);
    expect(datos.config.agenda.horizonte_semanas).toBe(52);
    expect(configAgenda({ agenda: { horizonte_semanas: 53 } }).horizonte_semanas).toBe(8);
    expect(configAgenda({ agenda: { horizonte_semanas: 52 } }).horizonte_semanas).toBe(52);
  });
  it('exporta minimos y maximos para la pantalla', () => {
    expect(MINIMOS.dias_trasiego).toBeUndefined();
    expect(MINIMOS.horizonte_semanas).toBe(1);
    expect(MINIMOS.cupo_analisis).toBe(0);
    expect(MAXIMOS.horizonte_semanas).toBe(52);
  });
  it('agregar, quitar y restaurar feriados', () => {
    const datos = {};
    expect(agregarFeriado(datos, '2026-10-21', 'Vendimia chica')).toBe(true);
    expect(agregarFeriado(datos, '2026-10-21', 'otra vez')).toBe(false);
    expect(agregarFeriado(datos, '2026-02-30', 'no existe')).toBe(false);
    const fechas = datos.config.agenda.feriados.map(f => f.fecha);
    expect([...fechas].sort()).toEqual(fechas);
    expect(quitarFeriado(datos, '2026-10-21')).toBe(true);
    expect(quitarFeriado(datos, '2026-10-21')).toBe(false);
    datos.config.agenda.feriados = [];
    restaurarFeriados(datos);
    expect(datos.config.agenda.feriados).toEqual(FERIADOS_AR);
  });
});
