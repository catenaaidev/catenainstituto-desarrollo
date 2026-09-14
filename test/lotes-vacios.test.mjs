/* Tests de estaVacio(): el criterio de "lote sin litros" de la pestana Lotes.
 *
 * envases.js es un modulo puro (sin DOM ni fetch), asi que se importa tal cual
 * dentro del runtime de Workers, igual que hacen lotes-anchos.test.mjs y
 * lotes-orden-fuente.test.mjs.
 *
 * Por que hay un test para una comparacion de una linea: estaVacio es la UNICA
 * definicion de "vacio" de la pestana. La usan las dos cosas que se agregaron
 * juntas -- el atenuado de la fila y el filtro Todos/Llenos/Vacios -- y tiene
 * que seguir coincidiendo con las otras dos definiciones del mismo hecho que ya
 * viven en el codigo: `litros_actuales <= 0` de motor_etapas (lo que vuelve
 * inactivo a un lote) y el `litrosDeEnvases(vals)` que el overlay de Envases
 * escribe en litros_actuales. Si las tres se separan, la fila se pinta tenue
 * pero el lote cuenta como activo, o al reves.
 *
 * Los datos NO se importan de datos-origen/lotes-datos.json: pesa 2,1 MB y en
 * el runtime de Workers viajaria entero dentro del bundle. Se usan formas
 * copiadas de ahi. Medido sobre esos datos el 2026-09-10: de 304 lotes,
 * 249 tienen litros y 55 estan en cero (32 cerrados y 23 todavia en
 * ingreso/FA/FML/crianza, que es lo que hace util al filtro: "vacio" NO es
 * sinonimo de "cerrado"). Ninguno de los 304 tiene litros_actuales distinto de
 * la suma de su desglose de envases.
 */
import { describe, it, expect } from 'vitest';
import { estaVacio, litrosDeEnvases } from '../public/lotes/js/envases.js';
import { pasaLlenado, MODOS_LLENADO } from '../public/lotes/js/filtro-llenado.js';

describe('estaVacio', () => {
  it('dice que no esta vacio el lote con litros', () => {
    expect(estaVacio({ litros_actuales: 900 })).toBe(false);
    expect(estaVacio({ litros_actuales: 0.5 })).toBe(false);
  });

  it('dice que esta vacio el lote en cero', () => {
    // Asi quedan guardados los lotes vaciados: el overlay de Envases escribe 0
    // y NUNCA null, porque motor_etapas compara litros_actuales <= 0.
    expect(estaVacio({ litros_actuales: 0 })).toBe(true);
  });

  it('trata como vacio todo lo que no sea un numero positivo', () => {
    // litros_actuales viene de una migracion de Excel: null, '' y basura
    // conviven en los datos reales y ninguno significa "tiene litros".
    for (const v of [null, undefined, '', '   ', -100, NaN, Infinity, 'sin dato'])
      expect(estaVacio({ litros_actuales: v })).toBe(true);
  });

  it('lee los numeros que vienen como texto', () => {
    // El pegado desde Excel puede dejar el valor como string.
    expect(estaVacio({ litros_actuales: '0' })).toBe(true);
    expect(estaVacio({ litros_actuales: '225' })).toBe(false);
  });

  it('no explota sin lote', () => {
    // Mismo criterio indulgente que el resto del modulo: durante el render de
    // la tabla una fila a medias no tiene que tirar abajo la pestana.
    expect(estaVacio(null)).toBe(true);
    expect(estaVacio(undefined)).toBe(true);
    expect(estaVacio({})).toBe(true);
  });

  it('coincide con el desglose de envases', () => {
    // La invariante del subsistema H: litros_actuales es la suma del desglose.
    // Si un lote tiene barricas o tanque, no puede estar vacio; si no tiene
    // ninguno, no puede tener litros. Formas reales de datos-origen.
    const conBarricas = { cap225: 4, litros_actuales: 900 };
    const conTanque   = { vasija_grande: 3500, litros_actuales: 3500 };
    const mixto       = { cap225: 2, vasija_grande: 1500, litros_actuales: 1950 };
    const vaciado     = { cap225: null, vasija_grande: null, litros_actuales: 0 };

    for (const l of [conBarricas, conTanque, mixto, vaciado])
      expect(estaVacio(l)).toBe(litrosDeEnvases(l) === 0);
  });
});

/* pasaLlenado es el predicado del segmentado Todos | Llenos | Vacios, que
 * comparten la pestana Lotes (una fila = un lote) y la pestana Analisis (una
 * fila = un analisis, y el lote se busca por numero). Es la parte del modulo
 * que no toca el DOM; crearFiltroLlenado si lo toca y por eso no se prueba
 * aca, igual que activarAnchos en lotes-anchos.test.mjs. */
describe('pasaLlenado', () => {
  const LLENO = { litros_actuales: 900 };
  const VACIO = { litros_actuales: 0 };

  it('con "todos" no esconde nada', () => {
    expect(pasaLlenado(LLENO, 'todos')).toBe(true);
    expect(pasaLlenado(VACIO, 'todos')).toBe(true);
  });

  it('con "llenos" deja solo los que tienen litros', () => {
    expect(pasaLlenado(LLENO, 'llenos')).toBe(true);
    expect(pasaLlenado(VACIO, 'llenos')).toBe(false);
  });

  it('con "vacios" deja solo los que estan en cero', () => {
    expect(pasaLlenado(LLENO, 'vacios')).toBe(false);
    expect(pasaLlenado(VACIO, 'vacios')).toBe(true);
  });

  it('trata al lote que no existe como vacio', () => {
    // En Analisis el lote se busca por numero en DATOS().lotes y puede no
    // estar: los lotes se borran desde la propia aplicacion y el analisis
    // sobrevive. Hoy son 0 casos en los datos reales. Cae en Vacios porque
    // estaVacio(undefined) ya es true, sin una rama especial que mantener.
    expect(pasaLlenado(undefined, 'vacios')).toBe(true);
    expect(pasaLlenado(undefined, 'llenos')).toBe(false);
    expect(pasaLlenado(null, 'todos')).toBe(true);
  });

  it('ante un modo desconocido muestra todo en vez de esconder todo', () => {
    // El modo sale de un data-llenado del DOM. Si algun dia no matchea, la
    // tabla tiene que quedar de mas, nunca vacia y sin forma de recuperarla.
    for (const modo of ['', 'raro', undefined, null]){
      expect(pasaLlenado(LLENO, modo)).toBe(true);
      expect(pasaLlenado(VACIO, modo)).toBe(true);
    }
  });

  it('expone los tres modos', () => {
    expect(MODOS_LLENADO).toEqual(['todos', 'llenos', 'vacios']);
  });
});
