/* Tests del modulo de columnas de la pestana Cargar analisis.
 *
 * El modulo es puro (no toca el DOM), asi que se puede importar dentro del
 * runtime de Workers igual que anchos-cols.js y filtro-llenado.js.
 */
import { describe, it, expect } from 'vitest';
import { ORDEN_PLANILLA, parsearFecha, planDeColumnas,
         parsearFila } from '../public/lotes/js/carga-cols.js';

describe('parsearFecha', () => {
  it('acepta dd/mm/yyyy y lo pasa a ISO', () => {
    expect(parsearFecha('10/09/2026')).toBe('2026-09-10');
    expect(parsearFecha('1/9/2026')).toBe('2026-09-01');
  });

  it('acepta dd-mm-yyyy y yyyy-mm-dd', () => {
    expect(parsearFecha('10-09-2026')).toBe('2026-09-10');
    expect(parsearFecha('2026-09-10')).toBe('2026-09-10');
  });

  it('devuelve null para lo que no es una fecha', () => {
    for (const basura of ['', '   ', 'ayer', '32/01/2026', '10/09/26', null, undefined])
      expect(parsearFecha(basura)).toBe(null);
  });
});

describe('planDeColumnas', () => {
  it('resuelve los nombres conocidos a su clave canonica', () => {
    expect(planDeColumnas('lote, fecha, ph')).toEqual(['lote', 'fecha_analisis', 'ph']);
  });

  it('descarta los nombres que no son campos del analisis', () => {
    // La lista blanca es el corazon de esta tarea: 'vasija' y 'año' vienen en
    // la planilla para que las posiciones calcen, pero no se guardan.
    expect(planDeColumnas('lote, vasija, año, -, , fecha'))
      .toEqual(['lote', null, null, null, null, 'fecha_analisis']);
  });

  it('acepta alcohol como alias de etanol', () => {
    // Asi se llama la columna en la planilla del laboratorio.
    expect(planDeColumnas('alcohol')).toEqual(['etanol']);
    expect(planDeColumnas('etanol')).toEqual(['etanol']);
  });

  it('no distingue mayusculas ni espacios de sobra', () => {
    expect(planDeColumnas('  LOTE ,  Gluc_Fruc ')).toEqual(['lote', 'gluc_fruc']);
  });

  it('devuelve un plan vacio para un texto vacio', () => {
    expect(planDeColumnas('')).toEqual([]);
    expect(planDeColumnas(null)).toEqual([]);
  });
});

describe('parsearFila', () => {
  const plan = planDeColumnas(ORDEN_PLANILLA);

  /* La fila real que trajo el usuario, con sus 14 columnas separadas por tab y
   * sus tres huecos. Es el caso que justifica toda la tarea. */
  const FILA = '26194\t\t2026\t10/09/2026\t14,2\t3,6\t0,54\t3,6\t0,16\t\t4,44\t\t\t28';

  it('lee la fila de la planilla con el orden por defecto', () => {
    const { campos, errores } = parsearFila(FILA, plan);
    expect(errores).toEqual([]);
    expect(campos.lote).toBe('26194');
    expect(campos.fecha_analisis).toBe('2026-09-10');
    expect(campos.etanol).toBe(14.2);
    expect(campos.ph).toBe(3.6);
    expect(campos.av).toBe(0.54);
    expect(campos.gluc_fruc).toBe(3.6);
    expect(campos.malico).toBe(0.16);
    expect(campos.acidez_total).toBe(4.44);
    expect(campos.so2_libre).toBe(28);
  });

  it('no guarda las columnas descartadas', () => {
    const { campos } = parsearFila(FILA, plan);
    expect(campos).not.toHaveProperty('vasija');
    expect(campos).not.toHaveProperty('año');
    expect(campos).not.toHaveProperty('-');
  });

  it('deja en null la celda vacia, no en 0 ni en cadena vacia', () => {
    // Un 0 seria un dato MEDIDO: el laboratorio no midio lactico en esta fila.
    const { campos } = parsearFila(FILA, plan);
    expect(campos.lactico).toBe(null);
  });

  it('marca la fecha invalida como error', () => {
    const rota = FILA.replace('10/09/2026', 'ayer');
    expect(parsearFila(rota, plan).errores).toContain('fecha inválida');
  });

  it('marca el lote vacio como error', () => {
    const sinLote = FILA.replace('26194', '');
    expect(parsearFila(sinLote, plan).errores).toContain('lote vacío');
  });

  it('sigue leyendo el orden viejo, que alguien puede tener tipeado', () => {
    const viejo = planDeColumnas('lote, fecha, ph, av, gluc_fruc, malico, lactico, acidez_total, etanol, so2_libre');
    const { campos, errores } = parsearFila('26001\t10/09/2026\t3,22\t0,4\t1,1\t0,05\t0,9\t5,1\t13,8\t25', viejo);
    expect(errores).toEqual([]);
    expect(campos.ph).toBe(3.22);
    expect(campos.etanol).toBe(13.8);
  });

  it('usa la coma como separador cuando no hay ningun tab', () => {
    const p = planDeColumnas('lote, fecha, ph');
    expect(parsearFila('26001,10/09/2026,3.22', p).campos.ph).toBe(3.22);
  });

  it('deja en null un numero que no se puede leer, sin romper', () => {
    const p = planDeColumnas('lote, fecha, ph');
    expect(parsearFila('26001\t10/09/2026\tn/d', p).campos.ph).toBe(null);
  });

  it('sobrevive a una fila con menos celdas que el plan', () => {
    const { campos } = parsearFila('26194\t\t2026\t10/09/2026', plan);
    expect(campos.lote).toBe('26194');
    expect(campos.so2_libre).toBe(null);
  });
});
