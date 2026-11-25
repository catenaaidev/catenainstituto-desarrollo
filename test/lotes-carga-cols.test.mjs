/* Tests del modulo de columnas de la pestana Cargar analisis.
 *
 * El modulo es puro (no toca el DOM), asi que se puede importar dentro del
 * runtime de Workers igual que anchos-cols.js y filtro-llenado.js.
 */
import { describe, it, expect } from 'vitest';
import { ORDEN_PLANILLA, parsearFecha, planDeColumnas,
         parsearFila, faltanParaControl } from '../public/lotes/js/carga-cols.js';

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
    // La lista blanca es el corazon de esta tarea: 'año' viene en la planilla
    // para que las posiciones calcen, pero no se guarda.
    expect(planDeColumnas('lote, año, -, , fecha'))
      .toEqual(['lote', null, null, null, 'fecha_analisis']);
  });

  it('reconoce vasija como campo opcional', () => {
    expect(planDeColumnas('lote, vasija, año')).toEqual(['lote', 'vasija', null]);
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
    expect(campos).not.toHaveProperty('año');
    expect(campos).not.toHaveProperty('-');
  });

  it('sin vasija en la celda no guarda la clave (Analisis usa la del lote)', () => {
    const { campos } = parsearFila(FILA, plan);
    expect(campos).not.toHaveProperty('vasija');
  });

  it('con vasija en la celda la guarda como texto', () => {
    const conVasija = FILA.replace('26194		', '26194	123	');
    const { campos, errores } = parsearFila(conVasija, plan);
    expect(errores).toEqual([]);
    expect(campos.vasija).toBe('123');
    expect(campos.fecha_analisis).toBe('2026-09-10');
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

describe('faltanParaControl', () => {
  const plan = planDeColumnas(ORDEN_PLANILLA);

  it('la fila del 04/11 con el numero en Lactico y el Malico vacio avisa que falta malico', () => {
    // 26005 tal como quedo cargado: etanol, pH, AV y gluc+fruc bien, el
    // numero en la columna de lactico y malico y acidez total vacios.
    const { campos } = parsearFila(
      '26005		2026	04/11/2026	13,56	3,15	0	2,5		3,05				63', plan);
    expect(faltanParaControl(campos)).toEqual(['malico']);
  });

  it('una corrida completa del FOSS no avisa', () => {
    // 26076 del mismo dia, la que si quedo bien.
    const { campos } = parsearFila(
      '26076	t50	2026	04/11/2026	13,61	3,26	0	2,9	2,91		6,93			47', plan);
    expect(faltanParaControl(campos)).toEqual([]);
  });

  it('una carga de solo SO2 no avisa: no es una corrida del FOSS', () => {
    const { campos } = parsearFila('26194		2026	09/10/2026										35', plan);
    expect(faltanParaControl(campos)).toEqual([]);
  });

  it('una carga de solo pH tampoco avisa', () => {
    const { campos } = parsearFila('26001,10/09/2026,3.22', planDeColumnas('lote, fecha, ph'));
    expect(faltanParaControl(campos)).toEqual([]);
  });

  it('nombra todas las que faltan, en el orden etanol, AV, malico', () => {
    expect(faltanParaControl({ av: 0.4 })).toEqual(['etanol', 'malico']);
    expect(faltanParaControl({ malico: 0.1 })).toEqual(['etanol', 'av']);
  });

  it('el 0 y el -999 cuentan como informados, igual que en el motor', () => {
    // El motor reinicia la frecuencia con un -999 (el FOSS corrio y salio
    // fuera de rango): avisar ahi seria contradecirlo.
    expect(faltanParaControl({ etanol: 13.5, av: 0, malico: -999 })).toEqual([]);
  });

  it('si el orden de columnas no trae Malico, avisa en la fila', () => {
    const p = planDeColumnas('lote, fecha, etanol, av');
    const { campos } = parsearFila('26001,10/09/2026,13.5,0.4', p);
    expect(faltanParaControl(campos)).toEqual(['malico']);
  });
});
