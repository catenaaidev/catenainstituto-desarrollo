/* Tests del modo "Actualizar análisis ya cargados" de Cargar análisis
 * (carga-actualizar.js).
 *
 * El pedido: poder corregir un solo casillero (el SO2 que el laboratorio mandó
 * después, un pH mal tipeado) sin cargar la fila entera de nuevo.
 */
import { describe, it, expect } from 'vitest';
import { planActualizacion, aplicarActualizacion, candidatosDe } from '../public/lotes/js/carga-actualizar.js';
import { planDeColumnas, parsearFila } from '../public/lotes/js/carga-cols.js';

const guardado = () => ([
  { lote: '26316', fecha_analisis: '2026-10-07', etanol: 13.83, ph: 3.71, av: 0.98, malico: 0.29, so2_libre: null,
    correccion: { so2_libre_actual: 31, ot_n: '26004' } },
  { lote: '26317', fecha_analisis: '2026-10-07', etanol: 13.1, ph: 3.6, av: 0.5, malico: 1.2, so2_libre: 22 },
]);

/* Como lo hace la pantalla: el orden de columnas y la línea pegada. */
function pegar(orden, ...lineas){
  const plan = planDeColumnas(orden);
  const claves = [...new Set(plan.filter(Boolean))];
  const filas = lineas.map(l => { const { campos, errores } = parsearFila(l, plan); return { _errores: errores, ...campos }; });
  return { filas, claves };
}

describe('actualizar un solo casillero', () => {
  it('pegar lote, fecha y un valor cambia solo ese valor', () => {
    const datos = guardado();
    const { filas, claves } = pegar('lote, fecha, so2_libre', '26316\t07/10/2026\t28');
    planActualizacion(filas, datos, claves);
    expect(filas[0]._errores).toEqual([]);
    expect(filas[0]._cambios).toEqual([{ campo: 'so2_libre', antes: null, despues: 28 }]);

    expect(aplicarActualizacion(filas, datos)).toBe(1);
    expect(datos[0]).toMatchObject({ so2_libre: 28, etanol: 13.83, ph: 3.71, av: 0.98, malico: 0.29 });
    // Lo que la planilla no trae (la corrección de SO2) queda como estaba.
    expect(datos[0].correccion).toEqual({ so2_libre_actual: 31, ot_n: '26004' });
    expect(datos[1]).toEqual(guardado()[1]);
  });

  it('con la planilla completa, los casilleros vacíos no borran lo cargado', () => {
    const datos = guardado();
    const orden = 'lote, vasija, año, fecha, etanol, ph, av, gluc_fruc, malico, lactico, acidez_total, -, -, so2_libre';
    // Solo viene el pH corregido; el resto de la fila, vacía.
    const { filas, claves } = pegar(orden, '26316\t\t2026\t07/10/2026\t\t3,74\t\t\t\t\t\t\t\t');
    planActualizacion(filas, datos, claves);
    expect(filas[0]._cambios).toEqual([{ campo: 'ph', antes: 3.71, despues: 3.74 }]);
    aplicarActualizacion(filas, datos);
    expect(datos[0]).toMatchObject({ ph: 3.74, etanol: 13.83, av: 0.98, malico: 0.29 });
  });

  it('el mismo valor escrito distinto (3,71 / 3.710) no es un cambio', () => {
    const datos = guardado();
    const { filas, claves } = pegar('lote, fecha, ph', '26316,2026-10-07,3.710');
    planActualizacion(filas, datos, claves);
    expect(filas[0]._errores).toEqual([]);
    expect(filas[0]._cambios).toEqual([]);
    expect(aplicarActualizacion(filas, datos)).toBe(0);
  });

  it('la fecha guardada se compara en cualquier formato', () => {
    const datos = [{ lote: '26316', fecha_analisis: '07/10/2026', ph: 3.7 }];
    const { filas, claves } = pegar('lote, fecha, ph', '26316\t2026-10-07\t3.8');
    planActualizacion(filas, datos, claves);
    expect(filas[0]._destino).toBe(0);
  });
});

describe('cuándo NO se aplica', () => {
  it('si no hay un análisis de ese lote y fecha, no se crea uno', () => {
    const datos = guardado();
    const { filas, claves } = pegar('lote, fecha, ph', '26316\t08/10/2026\t3.5');
    planActualizacion(filas, datos, claves);
    expect(filas[0]._errores[0]).toMatch(/no hay un análisis/);
    expect(aplicarActualizacion(filas, datos)).toBe(0);
    expect(datos).toHaveLength(2);
  });

  it('dos muestras del mismo lote y día: no se elige una al azar', () => {
    const datos = [...guardado(), { lote: '26316', fecha_analisis: '2026-10-07', ph: 3.9, vasija: 'T12' }];
    const { filas, claves } = pegar('lote, fecha, ph', '26316\t07/10/2026\t3.5');
    planActualizacion(filas, datos, claves);
    expect(filas[0]._errores[0]).toMatch(/hay 2 análisis/);
    expect(aplicarActualizacion(filas, datos)).toBe(0);
  });

  it('...pero con la vasija se sabe cuál es', () => {
    const datos = [...guardado(), { lote: '26316', fecha_analisis: '2026-10-07', ph: 3.9, vasija: 'T12' }];
    const { filas, claves } = pegar('lote, vasija, fecha, ph', '26316\tT12\t07/10/2026\t3.5');
    planActualizacion(filas, datos, claves);
    expect(filas[0]._destino).toBe(2);
    aplicarActualizacion(filas, datos);
    expect(datos[2].ph).toBe(3.5);
    expect(datos[0].ph).toBe(3.71);
  });

  it('una fila con errores de lectura (fecha mala) no se mira', () => {
    const datos = guardado();
    const { filas, claves } = pegar('lote, fecha, ph', '26316\t31/02/2026\t3.5');
    planActualizacion(filas, datos, claves);
    expect(filas[0]._errores).toEqual(['fecha inválida']);
    expect(filas[0]._destino).toBeUndefined();
  });
});

describe('varias filas', () => {
  it('dos filas al mismo análisis: la segunda ve la primera y gana', () => {
    const datos = guardado();
    const { filas, claves } = pegar('lote, fecha, ph, so2_libre', '26316\t07/10/2026\t3.8\t', '26316\t07/10/2026\t3.9\t30');
    planActualizacion(filas, datos, claves);
    expect(filas[0]._cambios).toEqual([{ campo: 'ph', antes: 3.71, despues: 3.8 }]);
    expect(filas[1]._cambios).toEqual([
      { campo: 'ph', antes: 3.8, despues: 3.9 },
      { campo: 'so2_libre', antes: null, despues: 30 },
    ]);
    expect(aplicarActualizacion(filas, datos)).toBe(1);
    expect(datos[0]).toMatchObject({ ph: 3.9, so2_libre: 30 });
  });

  it('planificar no modifica los datos', () => {
    const datos = guardado();
    const { filas, claves } = pegar('lote, fecha, ph', '26316\t07/10/2026\t3.8');
    planActualizacion(filas, datos, claves);
    expect(datos).toEqual(guardado());
  });

  it('candidatosDe ignora filas que no son objetos', () => {
    expect(candidatosDe({ lote: '1', fecha_analisis: '2026-01-01' }, [null, 5, { lote: '1', fecha_analisis: '2026-01-01' }])).toEqual([2]);
  });
});
