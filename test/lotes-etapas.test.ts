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
  type Hito,
} from '../src/lotes/motores/etapas';
import { criteriosEfectivos, evaluarLote, type Fila } from '../src/lotes/motores/fml';

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
    const an = [{ lote: '26916', fecha_analisis: HOY_ISO, ph: 3.2, so2_libre: 35, azucar_reductor: 1.0 }];
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
    expect(r.etapa_sugerida).toBe('fa');
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
