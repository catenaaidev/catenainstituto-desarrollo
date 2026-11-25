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
import { clasificarLote, pasaFuente, motivoDeFila,
         tanqueDeVasija, vasijaDeFila, litrosDeFila } from '../public/lotes/js/orden-filas.js';

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

describe('tanqueDeVasija', () => {
  it('deja pasar el codigo de tanque que ya viene solo', () => {
    // Las 18 formas que aparecen asi en la bodega: con y sin espacio, cinco letras.
    for (const t of ['T 140', 'P145', 'H 172', 'E167', 'E 169', 'T203', 'H175', 'F163'])
      expect(tanqueDeVasija(t)).toBe(t);
  });

  it('descarta los envases chicos y deja el tanque', () => {
    // Los cinco mixtos reales de datos-origen.
    expect(tanqueDeVasija('H 170 + Barricas')).toBe('H 170');
    expect(tanqueDeVasija('F163 + Barricas')).toBe('F163');
    expect(tanqueDeVasija('T 177 + t200')).toBe('T 177');
    expect(tanqueDeVasija('H 183 + t200')).toBe('H 183');
    // Asi lo escribe la OT al confirmar: con la cantidad adelante (26260, 2026-11-18).
    expect(tanqueDeVasija('H 183 + 1 t200')).toBe('H 183');
    expect(tanqueDeVasija('T 201 + 11 barricas + 2 T50')).toBe('T 201');
    expect(tanqueDeVasija('H184 + t50')).toBe('H184');
  });

  it('no se deja enganar por las mayusculas ni por el singular', () => {
    // 'Barrica', 'Barricas', 'barricas' y 'T50' conviven en los datos.
    expect(tanqueDeVasija('H174 + Barrica')).toBe('H174');
    expect(tanqueDeVasija('H174 + barricas')).toBe('H174');
    expect(tanqueDeVasija('H174 + T50')).toBe('H174');
    expect(tanqueDeVasija('H174 + T 200')).toBe('H174');
  });

  it('devuelve el texto entero si al descartar no queda nada', () => {
    // Preferimos mostrar de mas antes que dejar la celda vacia: si el texto
    // dice puras barricas, el numero de tanque no esta escrito en ningun lado.
    expect(tanqueDeVasija('Barricas + t50')).toBe('Barricas + t50');
    expect(tanqueDeVasija('Barricas')).toBe('Barricas');
    expect(tanqueDeVasija('t200 + t50')).toBe('t200 + t50');
  });

  it('devuelve cadena vacia para un texto vacio', () => {
    for (const v of ['', '   ', null, undefined]) expect(tanqueDeVasija(v)).toBe('');
  });

  it('conserva los dos codigos si el lote nombra mas de un tanque', () => {
    expect(tanqueDeVasija('H 170 + P145 + Barricas')).toBe('H 170 + P145');
  });
});

describe('vasijaDeFila', () => {
  it('recorta al tanque solo cuando el lote tiene litros de tanque', () => {
    expect(vasijaDeFila({ vasija_actual: 'H 170 + Barricas', vasija_grande: 2600 })).toBe('H 170');
  });

  it('deja el texto completo en el lote sin tanque', () => {
    // 'P 147' y 'P 149' son lotes cuyo texto quedo desactualizado: parecen
    // tanque pero no tienen litros ahi. No se tocan.
    expect(vasijaDeFila({ vasija_actual: 'Barricas + t50', vasija_grande: 0 })).toBe('Barricas + t50');
    expect(vasijaDeFila({ vasija_actual: 'P 147' })).toBe('P 147');
  });

  it('no explota sin lote ni sin texto', () => {
    expect(vasijaDeFila(null)).toBe('');
    expect(vasijaDeFila({ vasija_grande: 2600 })).toBe('');
  });
});

describe('litrosDeFila', () => {
  it('muestra tanque y total cuando el lote tambien tiene barricas', () => {
    // Lote 26140: H 170 con 2600 L mas dos barricas de 225.
    expect(litrosDeFila({ vasija_grande: 2600, litros_actuales: 3050 })).toBe('2600 de 3050');
  });

  it('muestra un solo numero cuando el tanque es todo el lote', () => {
    // '7500 de 7500' seria ruido en una columna angosta.
    expect(litrosDeFila({ vasija_grande: 7500, litros_actuales: 7500 })).toBe('7500');
  });

  it('deja el total tal cual en el lote sin tanque', () => {
    expect(litrosDeFila({ cap225: 4, litros_actuales: 900 })).toBe('900');
  });

  it('no inventa un total que no esta cargado', () => {
    expect(litrosDeFila({ vasija_grande: 1500 })).toBe('1500');
    expect(litrosDeFila({})).toBe('');
    expect(litrosDeFila(null)).toBe('');
  });
});

describe('clasificarLote — la frecuencia se cuenta desde el control de proceso', () => {
  it('un analisis suelto ya no reinicia el reloj', () => {
    // Analisis reciente (28 dias), pero el ultimo control de proceso fue hace 40 dias.
    // Con el codigo viejo (dias_desde_analisis) daria proximo:true; el nuevo da false.
    const fila = { lote: '26003', vencido: false, dias_desde_analisis: 28,
                   dias_desde_control: 40, frecuencia_max: 30, alarmas: [] };
    expect(clasificarLote(fila).proximo).toBe(false);
  });

  it('proximo mira los dias que faltan segun el control', () => {
    const fila = { lote: '26004', vencido: false, dias_desde_analisis: 0,
                   dias_desde_control: 27, frecuencia_max: 30, alarmas: [] };
    expect(clasificarLote(fila).proximo).toBe(true);
  });

  it('sin control de proceso no inventa que falta poco', () => {
    // Con el codigo viejo (dias_desde_analisis: 28) daria diasRestantes=2 → proximo:true; el nuevo da false.
    const fila = { lote: '26005', vencido: false, dias_desde_analisis: 28,
                   dias_desde_control: null, frecuencia_max: 30, alarmas: [] };
    expect(clasificarLote(fila).proximo).toBe(false);
  });

  it('las dos condiciones nuevas cuentan como atencion', () => {
    expect(clasificarLote({ alarmas: ['so2_caida_alerta'], frecuencia_max: 30, dias_desde_control: 1 }).atencion).toBe(true);
    expect(clasificarLote({ alarmas: ['control_proceso_pendiente'], frecuencia_max: 30, dias_desde_control: 1 }).atencion).toBe(true);
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
    // dias_desde_control es el dato que manda ahora para "proximo"
    const proximo = { ...AL_DIA, dias_desde_analisis: 27, dias_desde_control: 27, frecuencia_max: 30 };
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

/* 2026-11-18: la ronda del dia no trajo los lotes 2025. Dos causas: la ronda
 * salia del tablero (que respeta el selector de años) y exigia vasija_grande,
 * mientras el Inventario de tanques ubica en el tanque a un lote sin
 * vasija_grande si no tiene envases chicos. Ahora las dos usan litrosEnTanque. */
import { lotesDeRonda } from '../public/lotes/js/orden-filas.js';
import { litrosEnTanque } from '../public/lotes/js/envases.js';

describe('litrosEnTanque — misma regla que el Inventario de tanques', () => {
  it('manda vasija_grande', () => {
    expect(litrosEnTanque({ vasija_grande: 3300, cap200: 1, litros_actuales: 3500, vasija_actual: 'H 183 + 1 t200' })).toBe(3300);
  });
  it('sin vasija_grande ni envases chicos, con un tanque escrito: todos los litros estan en el tanque', () => {
    expect(litrosEnTanque({ litros_actuales: 4100, vasija_actual: 'T 201' })).toBe(4100);
    expect(litrosEnTanque({ litros_actuales: 4100, vasija_grande: '', vasija_actual: 'T60' })).toBe(4100);
  });
  it('sin vasija_grande y con envases chicos: nada en tanque (el texto quedo viejo)', () => {
    expect(litrosEnTanque({ litros_actuales: 2250, cap225: 10, vasija_actual: '10 barricas + H 170' })).toBe(0);
  });
  it('solo barricas o T50 escritos, o sin litros: nada en tanque', () => {
    expect(litrosEnTanque({ litros_actuales: 450, vasija_actual: 'Barricas' })).toBe(0);
    expect(litrosEnTanque({ litros_actuales: 100, vasija_actual: '2 T50' })).toBe(0);
    expect(litrosEnTanque({ litros_actuales: 0, vasija_actual: 'T 201' })).toBe(0);
    expect(litrosEnTanque(null)).toBe(0);
  });
});

describe('ronda de tanques: lote 2025 sin vasija_grande', () => {
  it('entra si su vino esta en un tanque', () => {
    expect(clasificarLote(AL_DIA, { litros_actuales: 5000, vasija_actual: 'T 205' }).rondaTanques).toBe(true);
  });
});

describe('lotesDeRonda — todos los años, aunque el tablero traiga uno solo', () => {
  const datos = [
    { lote: '25100', variedad: 'Malbec', etapa: 'crianza', litros_actuales: 5000, vasija_actual: 'T 205' },
    { lote: '26260', variedad: 'PV', litros_actuales: 3500, vasija_grande: 3300, cap200: 1, vasija_actual: 'H 183 + 1 t200' },
    { lote: '26300', litros_actuales: 2250, cap225: 10, vasija_actual: 'Barricas' },
    { lote: '25101', litros_actuales: 0, vasija_actual: 'T 201' },
  ];
  const dash = [{ lote: '26260', variedad: 'PV', vencido: true, alarmas: ['so2_no_ok'] }];

  it('trae los lotes con vino en tanque, uses o no el selector de años', () => {
    expect(lotesDeRonda(datos, dash).map(l => l.lote)).toEqual(['25100', '26260']);
  });
  it('usa la fila del tablero si existe (motivo real) y una fila minima si no', () => {
    const r = lotesDeRonda(datos, dash);
    expect(r[1]).toBe(dash[0]);
    expect(r[0]).toEqual({ lote: '25100', variedad: 'Malbec', etapa: 'crianza', vencido: false, alarmas: [] });
    expect(motivoDeFila(clasificarLote(r[0], datos[0]), 'ronda_tanques')).toBe('Ronda de tanques');
  });
});
