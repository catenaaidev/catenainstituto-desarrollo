/**
 * Port de tests/test_motor_etapas.py de la app de Lotes.
 *
 * Verifica en qué etapa está cada lote y cuánto avanzó. Si estos pasan, la
 * bandeja de confirmación del tablero y la barra de la ficha dan lo mismo que
 * en la app local.
 */

import { describe, it, expect } from 'vitest';
import {
  ETAPAS,
  etapaSugerida,
  finFml,
  hitos,
  avance,
  evaluarEtapa,
  esLoteDeVino,
  type Hito,
} from '../src/lotes/motores/etapas';
import { criteriosEfectivos, evaluarLote, type Fila } from '../src/lotes/motores/fml';
import { lotesConPadre } from '../src/lotes/motores/linaje';

const d = (iso: string) => Date.parse(iso + 'T00:00:00Z');
const HOY = d('2026-07-27');
const HOY_ISO = '2026-07-27';

const CONFIG = { criterios_fml: { default: {}, por_variedad: { Chardonnay: { hace_fml: 'no' } } } };

/** Atajo: el resultado de evaluarLote que consume etapaSugerida. */
const ev = (lote: Fila, analisis: Fila[] = [], config = CONFIG) =>
  evaluarLote(lote, analisis, config.criterios_fml, HOY);

const eff = (variedad = 'Malbec') => criteriosEfectivos(CONFIG.criterios_fml, variedad);

const clavesAplicables = (hs: Hito[]) => new Set(hs.filter((h) => h.aplica).map((h) => h.clave));
const porClave = (hs: Hito[], clave: string) => hs.find((h) => h.clave === clave)!;

describe('etapa sugerida', () => {
  it('ingreso: sin fecha de ingreso', () => {
    const lote = { lote: '26900', variedad: 'Malbec', litros_actuales: 100 };
    expect(etapaSugerida(lote, ev(lote), [])).toBe('ingreso');
  });

  it('fa: con ingreso y sin descube', () => {
    const lote = { lote: '26901', variedad: 'Malbec', litros_actuales: 100, fecha_ingreso: '2026-02-01' };
    expect(etapaSugerida(lote, ev(lote), [])).toBe('fa');
  });

  it('fml: descubado con málico alto', () => {
    const lote = {
      lote: '26902', variedad: 'Malbec', litros_actuales: 100,
      fecha_ingreso: '2026-02-01', descube_fa: '2026-02-10',
    };
    const an = [{ lote: '26902', fecha_analisis: '2026-03-01', malico: 2.5 }];
    expect(etapaSugerida(lote, ev(lote, an), [])).toBe('fml');
  });

  it('crianza: cuando la FML terminó', () => {
    const lote = {
      lote: '26903', variedad: 'Malbec', litros_actuales: 100,
      fecha_ingreso: '2026-02-01', descube_fa: '2026-02-10',
    };
    const an = [{ lote: '26903', fecha_analisis: '2026-03-01', malico: 0.1 }];
    expect(etapaSugerida(lote, ev(lote, an), [])).toBe('crianza');
  });

  it('una blanca descubada va directo a crianza', () => {
    const lote = {
      lote: '26904', variedad: 'Chardonnay', litros_actuales: 100,
      fecha_ingreso: '2026-02-01', descube_fa: '2026-02-10',
    };
    expect(etapaSugerida(lote, ev(lote), [])).toBe('crianza');
  });

  it('una blanca sin descubar NO es crianza', () => {
    // Regresión del error de cascada: 'excluida' no alcanza, hace falta descube.
    const lote = { lote: '26905', variedad: 'Chardonnay', litros_actuales: 100, fecha_ingreso: '2026-02-01' };
    expect(etapaSugerida(lote, ev(lote), [])).toBe('fa');
  });

  it('el descube puede venir de un movimiento, sin el campo descube_fa', () => {
    const lote = { lote: '26906', variedad: 'Malbec', litros_actuales: 100, fecha_ingreso: '2026-02-01' };
    const movs = [{ id: 'mov-1', lote: '26906', tipo: 'descube', fecha: '2026-02-10', vasija_destino: 'B225-1' }];
    const an = [{ lote: '26906', fecha_analisis: '2026-03-01', malico: 2.5 }];
    expect(etapaSugerida(lote, ev(lote, an), movs)).toBe('fml');
  });

  it('cerrado: sin litros y con movimiento que lo explica', () => {
    const lote = {
      lote: '26907', variedad: 'Malbec', litros_actuales: 0,
      fecha_ingreso: '2026-02-01', descube_fa: '2026-02-10',
    };
    const movs = [{ id: 'mov-1', lote: '26907', tipo: 'traspaso', fecha: '2026-05-01', litros: 1000 }];
    expect(etapaSugerida(lote, ev(lote), movs)).toBe('cerrado');
  });

  it('litros en cero con fecha de ingreso es cerrado, aunque falte el movimiento', () => {
    // Criterio del 2026-08-06, verificado contra los 291 lotes reales.
    const lote = {
      lote: '26908', variedad: 'Malbec', litros_actuales: 0,
      fecha_ingreso: '2026-02-01', descube_fa: '2026-02-10',
    };
    const an = [{ lote: '26908', fecha_analisis: '2026-03-01', malico: 2.5 }];
    expect(etapaSugerida(lote, ev(lote, an), [])).toBe('cerrado');
  });

  it('litros en cero SIN fecha de ingreso no es cerrado', () => {
    // Un placeholder que nunca arrancó: ese 0 es el estado inicial, no un vaciado.
    const lote = { lote: '26909', variedad: 'Malbec', litros_actuales: 0 };
    expect(etapaSugerida(lote, ev(lote), [])).toBe('ingreso');
  });

  it('las etapas están declaradas en orden', () => {
    expect([...ETAPAS]).toEqual(['ingreso', 'fa', 'fml', 'crianza', 'cerrado']);
  });
});

describe('fin de la FML', () => {
  it('por málico bajo el umbral de finalizada', () => {
    const an = [
      { fecha_analisis: '2026-03-01', malico: 2.5 },
      { fecha_analisis: '2026-04-01', malico: 0.1 },
    ];
    expect(finFml(an, eff())).toBe('2026-04-01');
  });

  it('por dos mediciones consecutivas bajo el otro umbral', () => {
    const an = [
      { fecha_analisis: '2026-03-01', malico: 0.45 },
      { fecha_analisis: '2026-04-01', malico: 0.4 },
    ];
    expect(finFml(an, eff())).toBe('2026-04-01');
  });

  it('null si nunca terminó', () => {
    expect(finFml([{ fecha_analisis: '2026-03-01', malico: 2.5 }], eff())).toBeNull();
  });

  it('ignora el marcador -999', () => {
    const an = [
      { fecha_analisis: '2026-03-01', malico: -999 },
      { fecha_analisis: '2026-04-01', malico: 0.1 },
    ];
    expect(finFml(an, eff())).toBe('2026-04-01');
  });
});

describe('hitos y avance', () => {
  it('en ingreso solo aplica datos_ingreso', () => {
    const lote = { lote: '26910', variedad: 'Malbec', litros_actuales: 100 };
    const hs = hitos(lote, [], [], ev(lote), eff(), 'ingreso');
    expect(clavesAplicables(hs)).toEqual(new Set(['datos_ingreso']));
    expect(avance(hs).aplicables).toBe(1);
  });

  it('datos_ingreso lista los campos que faltan', () => {
    const lote = { lote: '26911', variedad: 'Malbec', fecha_ingreso: '2026-02-01' };
    const h = porClave(hitos(lote, [], [], ev(lote), eff(), 'ingreso'), 'datos_ingreso');
    expect(h.cumplido).toBe(false);
    expect(h.detalle).toContain('proyecto');
    expect(h.detalle).toContain('kilos');
    expect(h.detalle).toContain('vasija_fa');
  });

  it('datos_ingreso cumplido con todos los campos', () => {
    const lote = {
      lote: '26912', variedad: 'Malbec', proyecto: 'Icono',
      fecha_ingreso: '2026-02-01', kilos: 7580, vasija_fa: 'T120',
    };
    expect(porClave(hitos(lote, [], [], ev(lote), eff(), 'ingreso'), 'datos_ingreso').cumplido).toBe(true);
  });

  it('en fa aplican cuatro hitos', () => {
    const lote = { lote: '26913', variedad: 'Malbec', litros_actuales: 100, fecha_ingreso: '2026-02-01' };
    const hs = hitos(lote, [], [], ev(lote), eff(), 'fa');
    expect(clavesAplicables(hs)).toEqual(
      new Set(['datos_ingreso', 'fa_finalizada', 'descube_cargado', 'analisis_al_dia']),
    );
  });

  it('descube_cargado exige vasija destino', () => {
    const lote = { lote: '26914', variedad: 'Malbec', litros_actuales: 100, fecha_ingreso: '2026-02-01' };
    const sinVasija = [{ id: 'm1', lote: '26914', tipo: 'descube', fecha: '2026-02-10', vasija_destino: '' }];
    expect(porClave(hitos(lote, [], sinVasija, ev(lote), eff(), 'fa'), 'descube_cargado').cumplido).toBe(false);

    const conVasija = [{ id: 'm1', lote: '26914', tipo: 'descube', fecha: '2026-02-10', vasija_destino: 'B225-1' }];
    expect(porClave(hitos(lote, [], conVasija, ev(lote), eff(), 'fa'), 'descube_cargado').cumplido).toBe(true);
  });

  it('fml_finalizada no aplica si la variedad la tiene excluida', () => {
    const lote = {
      lote: '26915', variedad: 'Chardonnay', litros_actuales: 100,
      fecha_ingreso: '2026-02-01', descube_fa: '2026-02-10',
    };
    const hs = hitos(lote, [], [], ev(lote), eff('Chardonnay'), 'fml');
    expect(porClave(hs, 'fml_finalizada').aplica).toBe(false);
  });

  it('una blanca en crianza llega al 100 % con ocho hitos', () => {
    const lote = {
      lote: '26916', variedad: 'Chardonnay', proyecto: 'Icono',
      fecha_ingreso: '2026-02-01', kilos: 7580, vasija_fa: 'T120',
      descube_fa: '2026-02-10', litros_actuales: 1000, mermo: 'no',
    };
    // Trae la corrida completa del FOSS (etanol, AV y malico): "Analisis al dia"
    // se mide desde el control de proceso. Sin ella el lote queda 'sin_datos' y
    // ese hito no se cumple (antes salia cumplido por error).
    const an = [{
      lote: '26916', fecha_analisis: HOY_ISO, ph: 3.2, so2_libre: 35, azucar_reductor: 1.0,
      etanol: 13.0, av: 0.3, malico: 2.0,
    }];
    const movs = [
      { id: 'm1', lote: '26916', tipo: 'descube', fecha: '2026-02-10', vasija_destino: 'B225-1' },
      { id: 'm2', lote: '26916', tipo: 'trasiego', fecha: '2026-05-01', vasija_destino: 'B225-2' },
    ];
    const av = avance(hitos(lote, an, movs, ev(lote, an), eff('Chardonnay'), 'crianza'));
    expect(av.aplicables).toBe(8);
    expect(av.cumplidos).toBe(8);
    expect(av.pct).toBe(100);
  });

  it('una tinta en crianza tiene nueve hitos aplicables', () => {
    const lote = {
      lote: '26917', variedad: 'Malbec', proyecto: 'Icono',
      fecha_ingreso: '2026-02-01', kilos: 7580, vasija_fa: 'T120',
      descube_fa: '2026-02-10', litros_actuales: 1000, mermo: 'no',
    };
    const an = [{ lote: '26917', fecha_analisis: '2026-04-01', malico: 0.1 }];
    const movs = [{ id: 'm1', lote: '26917', tipo: 'descube', fecha: '2026-02-10', vasija_destino: 'B225-1' }];
    expect(avance(hitos(lote, an, movs, ev(lote, an), eff(), 'crianza')).aplicables).toBe(9);
  });

  it('el trasiego post-FML solo cuenta si es posterior al fin de la FML', () => {
    const lote = {
      lote: '26918', variedad: 'Malbec', litros_actuales: 1000,
      fecha_ingreso: '2026-02-01', descube_fa: '2026-02-10',
    };
    const an = [{ lote: '26918', fecha_analisis: '2026-04-01', malico: 0.1 }];

    const antes = [{ id: 'm1', lote: '26918', tipo: 'trasiego', fecha: '2026-03-01' }];
    const h = porClave(hitos(lote, an, antes, ev(lote, an), eff(), 'crianza'), 'trasiego_post_fml');
    expect(h.aplica).toBe(true);
    expect(h.cumplido).toBe(false);

    const despues = [{ id: 'm2', lote: '26918', tipo: 'trasiego', fecha: '2026-05-01' }];
    expect(
      porClave(hitos(lote, an, despues, ev(lote, an), eff(), 'crianza'), 'trasiego_post_fml').cumplido,
    ).toBe(true);
  });

  it('un hito que no aplica sale del divisor', () => {
    const hs = [
      { clave: 'a', aplica: true, cumplido: true },
      { clave: 'b', aplica: true, cumplido: false },
      { clave: 'c', aplica: false, cumplido: false },
    ] as Hito[];
    expect(avance(hs)).toEqual({ pct: 50, cumplidos: 1, aplicables: 2 });
  });

  it('sin hitos aplicables no divide por cero', () => {
    expect(avance([])).toEqual({ pct: 0, cumplidos: 0, aplicables: 0 });
  });
});

describe('evaluarEtapa, la entrada del servidor', () => {
  it('devuelve las cuatro claves', () => {
    const lote = { lote: '26919', variedad: 'Malbec', litros_actuales: 1000, fecha_ingreso: '2026-02-01' };
    const r = evaluarEtapa(lote, [], [], CONFIG, HOY);
    expect(Object.keys(r).sort()).toEqual(['avance', 'etapa', 'etapa_sugerida', 'hitos']);
    expect(r.etapa_sugerida).toBe('fa');
  });

  it('respeta la etapa confirmada del lote', () => {
    const lote = {
      lote: '26920', variedad: 'Malbec', litros_actuales: 1000,
      fecha_ingreso: '2026-02-01', etapa: 'crianza',
    };
    const r = evaluarEtapa(lote, [], [], CONFIG, HOY);
    expect(r.etapa).toBe('crianza');
    // El motor diría 'fa' (sin descube), pero no se retrocede de lo confirmado.
    expect(r.etapa_sugerida).toBe('crianza');
  });

  it('usa la sugerida si el lote no tiene confirmada', () => {
    const lote = { lote: '26921', variedad: 'Malbec', litros_actuales: 1000, fecha_ingreso: '2026-02-01' };
    const r = evaluarEtapa(lote, [], [], CONFIG, HOY);
    expect(r.etapa).toBe('fa');
    expect(r.etapa).toBe(r.etapa_sugerida);
  });

  it('el proyecto del lote llega a los hitos', () => {
    const cfg = {
      criterios_fml: {
        default: { ph_max: 3.75 },
        por_variedad: { Chardonnay: { ph_max: 3.65 } },
        por_proyecto: { 'White Colluvium': { ph_max: 3.55 } },
      },
    };
    const lote = {
      lote: '26001', variedad: 'Chardonnay', proyecto: 'White Colluvium',
      litros_actuales: 100, fecha_ingreso: '2026-02-01',
    };
    const an = [{ lote: '26001', fecha_analisis: '2026-07-01', ph: 3.6 }];
    const r = evaluarEtapa(lote, an, [], cfg, d('2026-07-10'));
    expect(porClave(r.hitos, 'ph_ok').detalle).toContain('3.55');
  });
});

describe('avance congelado de un lote cerrado', () => {
  it('un cerrado con avance congelado devuelve ese porcentaje', () => {
    const lote = {
      lote: '26922', variedad: 'Malbec', litros_actuales: 0,
      fecha_ingreso: '2026-02-01', etapa: 'cerrado',
      avance_congelado: { pct: 75, cumplidos: 6, aplicables: 9 },
    };
    const r = evaluarEtapa(lote, [], [], CONFIG, HOY);
    expect(r.etapa).toBe('cerrado');
    expect(r.avance).toEqual({ pct: 75, cumplidos: 6, aplicables: 9 });
    expect(r.hitos).toHaveLength(9); // se siguen calculando, la ficha los muestra
  });

  it('un cerrado sin avance congelado recalcula', () => {
    const lote = { lote: '26923', variedad: 'Malbec', litros_actuales: 0, fecha_ingreso: '2026-02-01', etapa: 'cerrado' };
    const r = evaluarEtapa(lote, [], [], CONFIG, HOY);
    expect(r.etapa).toBe('cerrado');
    expect(r.avance.pct).not.toBe(75);
  });

  it('el congelado se ignora si la etapa no es cerrado', () => {
    const lote = {
      lote: '26924', variedad: 'Malbec', litros_actuales: 1000,
      fecha_ingreso: '2026-02-01', etapa: 'crianza',
      avance_congelado: { pct: 99, cumplidos: 9, aplicables: 9 },
    };
    const r = evaluarEtapa(lote, [], [], CONFIG, HOY);
    expect(r.etapa).toBe('crianza');
    expect(r.avance.pct).not.toBe(99);
  });

  it('un congelado malformado se ignora sin explotar', () => {
    const lote = {
      lote: '26925', variedad: 'Malbec', litros_actuales: 0,
      fecha_ingreso: '2026-02-01', etapa: 'cerrado',
      avance_congelado: { pct: 'no_es_numero', cumplidos: null },
    };
    const r = evaluarEtapa(lote, [], [], CONFIG, HOY);
    expect(Number.isInteger(r.avance.pct)).toBe(true);
    expect(r.avance.aplicables).toBeDefined();
  });
});

describe('etapa forzada', () => {
  it('cambia el divisor', () => {
    const lote = { lote: '26930', variedad: 'Malbec', litros_actuales: 100, fecha_ingreso: '2026-02-01', etapa: 'fa' };
    const rFa = evaluarEtapa(lote, [], [], CONFIG, HOY);
    expect(rFa.avance.aplicables).toBe(4);

    const rCerrado = evaluarEtapa(lote, [], [], CONFIG, HOY, 'cerrado');
    expect(rCerrado.avance.aplicables).toBeGreaterThan(rFa.avance.aplicables);
    expect(rCerrado.etapa).toBe('fa'); // la confirmada no cambia
  });

  it('con etapa forzada se ignora el avance congelado', () => {
    const lote = {
      lote: '26931', variedad: 'Malbec', litros_actuales: 0,
      fecha_ingreso: '2026-02-01', etapa: 'cerrado',
      avance_congelado: { pct: 75, cumplidos: 6, aplicables: 9 },
    };
    expect(evaluarEtapa(lote, [], [], CONFIG, HOY).avance.pct).toBe(75);

    const rForzado = evaluarEtapa(lote, [], [], CONFIG, HOY, 'cerrado');
    expect(rForzado.avance.pct).not.toBe(75);
    expect(rForzado.etapa).toBe('cerrado');
  });

  it('un valor inválido se ignora en silencio', () => {
    const lote = { lote: '26932', variedad: 'Malbec', litros_actuales: 100, fecha_ingreso: '2026-02-01', etapa: 'fa' };
    const base = evaluarEtapa(lote, [], [], CONFIG, HOY);
    const malo = evaluarEtapa(lote, [], [], CONFIG, HOY, 'inventada');
    expect(malo.avance).toEqual(base.avance);
    expect(malo.etapa).toBe(base.etapa);
  });

  it('pasar null es idéntico a no pasarlo', () => {
    const lote = { lote: '26933', variedad: 'Malbec', litros_actuales: 100, fecha_ingreso: '2026-02-01', etapa: 'fa' };
    expect(evaluarEtapa(lote, [], [], CONFIG, HOY)).toEqual(evaluarEtapa(lote, [], [], CONFIG, HOY, null));
  });
});

describe('movimientos pendientes', () => {
  const cfg = { criterios_fml: { default: {}, por_variedad: {} } };
  const lote = { lote: '26001', variedad: 'Malbec', litros_actuales: 1000, fecha_ingreso: '2026-02-01' };
  const analisis = [{ lote: '26001', fecha_analisis: '2026-03-01', ph: 3.5 }];

  it('un descube pendiente NO avanza la etapa', () => {
    // Si esto falla, un lote cambia de etapa antes de que el trabajo se haga.
    const pendiente = [{ lote: '26001', tipo: 'descube', fecha: '2026-03-05', estado: 'pendiente' }];
    const rCon = evaluarEtapa(lote, analisis, pendiente, cfg, d('2026-03-10'));
    const rSin = evaluarEtapa(lote, analisis, [], cfg, d('2026-03-10'));
    expect(rCon.etapa_sugerida).toBe(rSin.etapa_sugerida);
  });

  it('el mismo descube, ejecutado, sí la avanza', () => {
    const ejecutado = [{ lote: '26001', tipo: 'descube', fecha: '2026-03-05', estado: 'ejecutado' }];
    const rEj = evaluarEtapa(lote, analisis, ejecutado, cfg, d('2026-03-10'));
    const rSin = evaluarEtapa(lote, analisis, [], cfg, d('2026-03-10'));
    expect(rEj.etapa_sugerida).not.toBe(rSin.etapa_sugerida);
  });
});

describe('lote que arranca de vino ya hecho (corte o traspaso)', () => {
  // El 26310 real: creado con Nuevo lote, sin datos de uva, con litros.
  const vino = { lote: '26310', variedad: 'Malbec', proyecto: 'El Amiguito', litros_actuales: 2000, origen: 'Vino' };

  it('esLoteDeVino: marcado a mano, deducido del linaje, o uva', () => {
    expect(esLoteDeVino(vino, false)).toBe(true);
    expect(esLoteDeVino({ ...vino, origen: 'vino ' }, false)).toBe(true);
    const sinMarca = { ...vino, origen: '' };
    expect(esLoteDeVino(sinMarca, false)).toBe(false);
    expect(esLoteDeVino(sinMarca, true)).toBe(true);
    // Con fecha de ingreso tiene datos de uva: el padre no alcanza para deducirlo.
    expect(esLoteDeVino({ ...sinMarca, fecha_ingreso: '2026-02-01' }, true)).toBe(false);
    // 'Uva' puesto a mano le gana a la deducción.
    expect(esLoteDeVino({ ...vino, origen: 'Uva' }, true)).toBe(false);
  });

  it('no pide fecha de ingreso, kilos ni vasija de FA', () => {
    const r = evaluarEtapa(vino, [], [], CONFIG, HOY);
    const h = porClave(r.hitos, 'datos_ingreso');
    expect(h.aplica).toBe(true);
    expect(h.cumplido).toBe(true);
  });

  it('sí pide variedad y proyecto', () => {
    const r = evaluarEtapa({ ...vino, proyecto: '' }, [], [], CONFIG, HOY);
    const h = porClave(r.hitos, 'datos_ingreso');
    expect(h.cumplido).toBe(false);
    expect(h.detalle).toBe('faltan: proyecto');
  });

  it('no se queda en ingreso: sin análisis de málico va a crianza', () => {
    expect(evaluarEtapa(vino, [], [], CONFIG, HOY).etapa_sugerida).toBe('crianza');
  });

  it('con la FML abierta según el análisis va a fml', () => {
    const an = [{ lote: '26310', fecha_analisis: '2026-07-20', malico: 2.5 }];
    expect(evaluarEtapa(vino, an, [], CONFIG, HOY).etapa_sugerida).toBe('fml');
  });

  it('FA finalizada y Descube no aplican; análisis, pH, SO2 y llenado sí', () => {
    const r = evaluarEtapa(vino, [], [], CONFIG, HOY);
    const ap = clavesAplicables(r.hitos);
    expect(ap.has('fa_finalizada')).toBe(false);
    expect(ap.has('descube_cargado')).toBe(false);
    for (const k of ['datos_ingreso', 'analisis_al_dia', 'ph_ok', 'so2_ok', 'lleno']) expect(ap.has(k)).toBe(true);
  });

  it('FML finalizada solo aplica si hay málico: sin dato, la FML pasó en el origen', () => {
    const sinDato = evaluarEtapa(vino, [], [], CONFIG, HOY);
    expect(clavesAplicables(sinDato.hitos).has('fml_finalizada')).toBe(false);
    const an = [{ lote: '26310', fecha_analisis: '2026-07-20', malico: 2.5 }];
    expect(clavesAplicables(evaluarEtapa(vino, an, [], CONFIG, HOY).hitos).has('fml_finalizada')).toBe(true);
  });

  it('recién creado, en 0 litros y sin salidas, NO se da por cerrado', () => {
    // El ⎘ Hijo copia la fecha de ingreso del padre y arranca en 0 litros.
    const hijo = { ...vino, litros_actuales: 0, fecha_ingreso: '2026-02-01' };
    expect(evaluarEtapa(hijo, [], [], CONFIG, HOY).etapa_sugerida).toBe('crianza');
  });

  it('en 0 litros y con una salida ejecutada, sí se cierra', () => {
    const vacio = { ...vino, litros_actuales: 0 };
    const salida = [{ lote: '26310', tipo: 'traspaso', fecha: '2026-07-01', lote_destino: '26400' }];
    expect(evaluarEtapa(vacio, [], salida, CONFIG, HOY).etapa_sugerida).toBe('cerrado');
    const pendiente = [{ ...salida[0], estado: 'pendiente' }];
    expect(evaluarEtapa(vacio, [], pendiente, CONFIG, HOY).etapa_sugerida).toBe('crianza');
  });

  it('deducido del linaje: sin marca pero con padre se trata como vino', () => {
    const sinMarca = { ...vino, origen: '' };
    expect(evaluarEtapa(sinMarca, [], [], CONFIG, HOY).etapa_sugerida).toBe('ingreso');
    expect(evaluarEtapa(sinMarca, [], [], CONFIG, HOY, null, { tienePadre: true }).etapa_sugerida).toBe('crianza');
  });

  it('un lote de uva sigue igual que siempre', () => {
    const uva = { lote: '26900', variedad: 'Malbec', litros_actuales: 100 };
    const r = evaluarEtapa(uva, [], [], CONFIG, HOY);
    expect(r.etapa_sugerida).toBe('ingreso');
    expect(porClave(r.hitos, 'datos_ingreso').detalle).toBe('faltan: proyecto, fecha_ingreso, kilos, vasija_fa');
  });
});

describe('lotesConPadre', () => {
  it('junta los destinos de traspasos y renombres ejecutados', () => {
    const movs = [
      { lote: '100', tipo: 'traspaso', lote_destino: ' 200 ' },
      { lote: '101', tipo: 'renombre', lote_destino: '201' },
      { lote: '102', tipo: 'traspaso', lote_destino: '202', estado: 'pendiente' },
      { lote: '103', tipo: 'trasiego', lote_destino: '203' },
      { lote: '104', tipo: 'salida', destino_externo: 'X' },
    ];
    expect([...lotesConPadre(movs)].sort()).toEqual(['200', '201']);
  });
});

/*
 * Las etapas no retroceden (pedido del 2026-10-14). Antes, un análisis con
 * málico alto DESPUÉS de cerrar la FML la volvía a "no finalizada", la bandeja
 * proponía pasar el lote de crianza a fml y alguien lo confirmaba (26137,
 * 26141, 26147, 26217). Manda lo confirmado por una persona, no el último
 * número: un 0 mal cargado tampoco cierra nada solo.
 */
describe('las etapas no retroceden', () => {
  const descubado = {
    variedad: 'Malbec', litros_actuales: 1000,
    fecha_ingreso: '2026-02-01', descube_fa: '2026-02-10',
  };
  const malicoQueVuelveASubir = (lote: string) => [
    { lote, fecha_analisis: '2026-04-01', malico: 0.1 },
    { lote, fecha_analisis: '2026-06-01', malico: 0.6 },
  ];

  it('un lote confirmado en crianza no vuelve a fml aunque el málico suba', () => {
    const lote = { lote: '26950', ...descubado, etapa: 'crianza' };
    const r = evaluarEtapa(lote, malicoQueVuelveASubir('26950'), [], CONFIG, HOY);
    expect(r.etapa).toBe('crianza');
    expect(r.etapa_sugerida).toBe('crianza');
  });

  it('con crianza confirmada la FML cuenta como finalizada (sin alarma)', () => {
    const lote = { lote: '26951', ...descubado, etapa: 'crianza' };
    const e = ev(lote, malicoQueVuelveASubir('26951'));
    expect(e.fml_estado).toBe('finalizada');
    expect(e.alarmas).not.toContain('fml_no_finalizada');
  });

  it('con crianza confirmada y sin málico cargado, la FML también cuenta como finalizada', () => {
    const lote = { lote: '26952', ...descubado, etapa: 'crianza' };
    expect(ev(lote).fml_estado).toBe('finalizada');
  });

  it('una blanca en crianza sigue excluida, no finalizada', () => {
    const lote = { lote: '26953', ...descubado, variedad: 'Chardonnay', etapa: 'crianza' };
    expect(ev(lote).fml_estado).toBe('excluida');
  });

  it('sin etapa confirmada, el málico que sube sigue reabriendo la FML', () => {
    const lote = { lote: '26954', ...descubado };
    const r = evaluarEtapa(lote, malicoQueVuelveASubir('26954'), [], CONFIG, HOY);
    expect(r.etapa_sugerida).toBe('fml');
  });

  it('un lote confirmado en fml no vuelve a fa', () => {
    const lote = { lote: '26955', variedad: 'Malbec', litros_actuales: 1000, fecha_ingreso: '2026-02-01', etapa: 'fml' };
    expect(evaluarEtapa(lote, [], [], CONFIG, HOY).etapa_sugerida).toBe('fml');
  });

  it('la sugerida puede avanzar más allá de la confirmada', () => {
    const lote = { lote: '26956', ...descubado, etapa: 'fml' };
    const an = [{ lote: '26956', fecha_analisis: '2026-04-01', malico: 0.1 }];
    expect(evaluarEtapa(lote, an, [], CONFIG, HOY).etapa_sugerida).toBe('crianza');
  });

  it('un cerrado que vuelve a tener vino sí puede salir de cerrado', () => {
    const lote = { lote: '26957', ...descubado, etapa: 'cerrado' };
    const an = [{ lote: '26957', fecha_analisis: '2026-04-01', malico: 0.1 }];
    expect(evaluarEtapa(lote, an, [], CONFIG, HOY).etapa_sugerida).toBe('crianza');
  });
});

describe('un cerrado sin litros no retrocede', () => {
  it('confirmado cerrado, sin litros ni fecha de ingreso, sigue sugiriendo cerrado (no ingreso)', () => {
    const lote = { lote: '25958', variedad: 'Malbec', litros_actuales: 0, etapa: 'cerrado' };
    expect(evaluarEtapa(lote, [], [], CONFIG, HOY).etapa_sugerida).toBe('cerrado');
  });
});
