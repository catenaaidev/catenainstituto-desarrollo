/* Tests de las FUENTES del select "Incluir" de la Orden de muestras.
 *
 * orden-filas.js es un modulo puro (sin DOM ni fetch), asi que se importa tal
 * cual dentro del runtime de Workers, igual que hace lotes-anchos.test.mjs.
 *
 * El foco esta en 'ronda_tanques', la unica fuente que NO se puede decidir con
 * la fila del dashboard: vasija_grande vive en DATOS().lotes, no ahi. Por eso
 * clasificarLote acepta un segundo argumento opcional con el lote completo, y
 * estos tests fijan que sin ese argumento nada de lo viejo cambie.
 */
import { describe, it, expect } from 'vitest';
import { clasificarLote, pasaFuente, motivoDeFila } from '../public/lotes/js/orden-filas.js';

/* Fila del dashboard al dia: ni vencida, ni proxima, ni con alarmas. Sirve para
 * probar que la ronda de tanques la trae igual. */
const AL_DIA = { lote: '26001', vencido: false, dias_desde_analisis: 1,
                 frecuencia_max: 30, alarmas: [] };

const VENCIDO = { lote: '26002', vencido: true, dias_desde_analisis: 40,
                  frecuencia_max: 30, alarmas: [] };

/* Atajo: clasifica y pregunta por una fuente en un solo paso. */
const trae = (fila, info, fuente, criterio) =>
  pasaFuente(clasificarLote(fila, info), fuente, criterio);

describe('clasificarLote — rondaTanques', () => {
  it('marca el lote que tiene litros en vasija grande', () => {
    expect(clasificarLote(AL_DIA, { vasija_grande: 3500 }).rondaTanques).toBe(true);
  });

  it('no marca al lote sin litros de tanque', () => {
    // Un lote con barricas y cero tanque NO es de la ronda: los cuatro capNNN
    // son cantidades de envases, no litros, y no entran en este criterio.
    expect(clasificarLote(AL_DIA, { cap225: 4, vasija_grande: 0 }).rondaTanques).toBe(false);
  });

  it('trata como cero los valores que no son un numero positivo', () => {
    // vasija_grande viene de una migracion de Excel: null, '' y basura conviven
    // en los datos reales y ninguno significa "tiene tanque".
    for (const v of [null, undefined, '', 'grande', NaN, -100, 0])
      expect(clasificarLote(AL_DIA, { vasija_grande: v }).rondaTanques).toBe(false);
  });

  it('acepta los litros escritos como texto', () => {
    // El JSON del documento guarda numeros, pero un valor tipeado en el overlay
    // puede llegar como cadena antes de normalizarse.
    expect(clasificarLote(AL_DIA, { vasija_grande: '1500' }).rondaTanques).toBe(true);
  });

  it('vale false cuando no se pasa el lote completo', () => {
    // Las llamadas viejas de un solo argumento no tienen que romperse.
    expect(clasificarLote(AL_DIA).rondaTanques).toBe(false);
    expect(clasificarLote(AL_DIA, null).rondaTanques).toBe(false);
  });
});

describe('pasaFuente — ronda_tanques', () => {
  it('trae el lote con tanque aunque este al dia', () => {
    // Es una ronda de recorrido fisico: se pasa por todos los tanques, no solo
    // por los que deben analisis.
    expect(trae(AL_DIA, { vasija_grande: 3500 }, 'ronda_tanques')).toBe(true);
  });

  it('trae tambien el lote con tanque que esta vencido', () => {
    expect(trae(VENCIDO, { vasija_grande: 2000 }, 'ronda_tanques')).toBe(true);
  });

  it('deja afuera al lote sin tanque, este vencido o no', () => {
    expect(trae(AL_DIA,  { cap225: 2 }, 'ronda_tanques')).toBe(false);
    expect(trae(VENCIDO, { cap225: 2 }, 'ronda_tanques')).toBe(false);
  });
});

describe('motivoDeFila', () => {
  it('dice "Ronda de tanques" cuando el lote no tiene ningun otro motivo', () => {
    const cls = clasificarLote(AL_DIA, { vasija_grande: 3500 });
    expect(motivoDeFila(cls, 'ronda_tanques')).toBe('Ronda de tanques');
  });

  it('prefiere el motivo real por encima de la ronda', () => {
    // Si el tanque ademas esta vencido, lo que importa en la hoja es que vencio.
    const cls = clasificarLote(VENCIDO, { vasija_grande: 3500 });
    expect(motivoDeFila(cls, 'ronda_tanques')).toBe('Vencido');
  });

  it('encadena los motivos que se acumulan', () => {
    const cls = clasificarLote({ ...VENCIDO, alarmas: ['sin_analisis_valido', 'ph_no_ok'] }, null);
    expect(motivoDeFila(cls, 'todos')).toBe('Vencido / Sin análisis / NO OK');
  });

  it('sigue devolviendo el guion en las demas fuentes sin motivo', () => {
    expect(motivoDeFila(clasificarLote(AL_DIA, null), 'todos')).toBe('—');
    // Un lote con tanque visto desde otra fuente tampoco dice "Ronda de tanques".
    expect(motivoDeFila(clasificarLote(AL_DIA, { vasija_grande: 3500 }), 'todos')).toBe('—');
  });
});

describe('pasaFuente — las fuentes que ya existian', () => {
  /* El segundo argumento de clasificarLote es opcional; estos casos lo omiten
   * a proposito para fijar que la conducta vieja quedo intacta. */
  it('sigue distinguiendo vencidos de lotes al dia', () => {
    expect(trae(VENCIDO, null, 'vencidos')).toBe(true);
    expect(trae(AL_DIA,  null, 'vencidos')).toBe(false);
  });

  it('sigue trayendo los proximos a vencer dentro de los 5 dias', () => {
    const proximo = { ...AL_DIA, dias_desde_analisis: 27, frecuencia_max: 30 };
    expect(trae(proximo, null, 'proximos')).toBe(true);
    expect(trae(AL_DIA,  null, 'proximos')).toBe(false);
    expect(trae(proximo, null, 'vencidos_proximos')).toBe(true);
    expect(trae(VENCIDO, null, 'vencidos_proximos')).toBe(true);
  });

  it('sigue trayendo los que no tienen analisis valido', () => {
    const sinAnalisis = { ...AL_DIA, alarmas: ['sin_analisis_valido'] };
    expect(trae(sinAnalisis, null, 'sin_analisis')).toBe(true);
    expect(trae(AL_DIA,      null, 'sin_analisis')).toBe(false);
  });

  it('sigue respetando el criterio granular de atencion', () => {
    const so2 = { ...AL_DIA, alarmas: ['so2_no_ok'] };
    expect(trae(so2, null, 'atencion', 'todos')).toBe(true);
    expect(trae(so2, null, 'atencion', 'so2')).toBe(true);
    expect(trae(so2, null, 'atencion', 'ph')).toBe(false);
  });

  it('sigue trayendo todo con "todos" y nada con una fuente desconocida', () => {
    expect(trae(AL_DIA, null, 'todos')).toBe(true);
    expect(trae(AL_DIA, null, 'hoja_en_blanco')).toBe(false);
  });

  it('el tanque no altera ninguna de las fuentes viejas', () => {
    // Pasar el lote completo no tiene que colar un lote al dia en 'vencidos'.
    expect(trae(AL_DIA, { vasija_grande: 3500 }, 'vencidos')).toBe(false);
    expect(trae(AL_DIA, { vasija_grande: 3500 }, 'todos')).toBe(true);
  });
});
