/**
 * Port de tests/test_motor_fml.py de la app de Lotes.
 *
 * Son los mismos casos, con los mismos números. Si estos pasan, el motor de
 * FML en TypeScript decide igual que el de Python: qué lote está en condición,
 * cuál venció y cuánto SO2 le falta.
 */

import { describe, it, expect } from 'vitest';
import {
  CRITERIOS_DEFAULT,
  normalizarVariedad,
  criteriosEfectivos,
  normalizarConfig,
  evaluarLote,
  evaluar,
  so2Molecular,
  objetivoSo2Libre,
  calcularCorreccionSo2,
  flagsAnalisis,
  detectarInoculado,
  type Criterios,
} from '../src/lotes/motores/fml';

/** Fecha como milisegundos UTC del día, que es lo que espera el motor. */
const d = (iso: string) => Date.parse(iso + 'T00:00:00Z');

function cfg() {
  return {
    default: { ...CRITERIOS_DEFAULT },
    por_variedad: { Chardonnay: { hace_fml: 'no', ph_max: 3.65 } },
  };
}

describe('normalización de variedad', () => {
  it('saca tildes y mayúsculas', () => {
    expect(normalizarVariedad('Semillón')).toBe('semillon');
    expect(normalizarVariedad(' Ugni  Blanc ')).toBe('ugni blanc');
    expect(normalizarVariedad(null)).toBe('');
  });
});

describe('criterios efectivos', () => {
  it('sin override devuelve el default', () => {
    const eff = criteriosEfectivos({ default: { ...CRITERIOS_DEFAULT }, por_variedad: {} }, 'Malbec');
    expect(eff.ph_max).toBe(3.75);
    expect(eff.hace_fml).toBe('si');
  });

  it('aplica el override de variedad sin distinguir mayúsculas', () => {
    const eff = criteriosEfectivos(cfg(), 'chardonnay');
    expect(eff.hace_fml).toBe('no');
    expect(eff.ph_max).toBe(3.65);
    expect(eff.so2_libre_piso).toBe(20.0); // lo no sobrescrito viene del default
  });

  it('trae las claves nuevas del tablero', () => {
    expect(CRITERIOS_DEFAULT.so2_caida_max).toBe(12.0);
    expect(CRITERIOS_DEFAULT.so2_aplica).toBe('si');
    expect(CRITERIOS_DEFAULT.ph_max_inclusive).toBe('no');
  });

  it('un proyecto puede apagar el SO2', () => {
    const eff = criteriosEfectivos(
      { default: { ...CRITERIOS_DEFAULT }, por_proyecto: { 'El Amiguito': { so2_aplica: 'no' } } },
      'Malbec',
      'el amiguito',
    );
    expect(eff.so2_aplica).toBe('no');
  });
});

describe('estado del lote', () => {
  it('es activo si tiene litros', () => {
    const r = evaluarLote(
      { lote: '1', variedad: 'Malbec', litros_actuales: 1000 },
      [],
      cfg(),
      d('2026-03-01'),
    );
    expect(r.activo).toBe(true);
  });

  it('FML finalizada por último málico bajo', () => {
    const an = [{ lote: '1', fecha_analisis: '2026-02-01', malico: 0.15 }];
    const r = evaluarLote({ lote: '1', variedad: 'Malbec', litros_actuales: 100 }, an, cfg(), d('2026-02-02'));
    expect(r.fml_estado).toBe('finalizada');
  });

  it('FML finalizada por las dos últimas bajo 0,5', () => {
    const an = [
      { lote: '1', fecha_analisis: '2026-01-01', malico: 0.45 },
      { lote: '1', fecha_analisis: '2026-02-01', malico: 0.4 },
    ];
    const r = evaluarLote({ lote: '1', variedad: 'Malbec', litros_actuales: 100 }, an, cfg(), d('2026-02-02'));
    expect(r.fml_estado).toBe('finalizada');
  });

  it('Chardonnay no hace FML: queda excluida', () => {
    const an = [{ lote: '1', fecha_analisis: '2026-02-01', malico: 2.0 }];
    const r = evaluarLote({ lote: '1', variedad: 'Chardonnay', litros_actuales: 100 }, an, cfg(), d('2026-02-02'));
    expect(r.fml_estado).toBe('excluida');
  });

  it('el pH usa el umbral de la variedad', () => {
    const r = evaluarLote(
      { lote: '1', variedad: 'Chardonnay', litros_actuales: 100 },
      [{ lote: '1', fecha_analisis: '2026-02-01', ph: 3.7 }],
      cfg(),
      d('2026-02-02'),
    );
    expect(r.ph_ok).toBe(false); // Chardonnay: 3.65

    const r2 = evaluarLote(
      { lote: '2', variedad: 'Malbec', litros_actuales: 100 },
      [{ lote: '2', fecha_analisis: '2026-02-01', ph: 3.7 }],
      cfg(),
      d('2026-02-02'),
    );
    expect(r2.ph_ok).toBe(true); // Malbec: 3.75
  });

  it('SO2 en criterio', () => {
    // pH 3.5: 32 > piso 20 y el molecular da 0,626 >= 0,38, así que está bien.
    const an = [{ lote: '1', fecha_analisis: '2026-02-01', so2_libre: 32, ph: 3.5 }];
    const r = evaluarLote({ lote: '1', variedad: 'Malbec', litros_actuales: 100 }, an, cfg(), d('2026-02-02'));
    expect(r.so2_ok).toBe(true);
  });

  it('alerta de AV por valor alto', () => {
    const an = [{ lote: '1', fecha_analisis: '2026-02-01', av: 0.9 }];
    const r = evaluarLote({ lote: '1', variedad: 'Malbec', litros_actuales: 100 }, an, cfg(), d('2026-02-02'));
    expect(r.av_alerta).toBe(true);
  });

  it('vencido por frecuencia de FML no terminada', () => {
    // La frecuencia se cuenta desde el último CONTROL DE PROCESO (etanol + AV +
    // málico en la misma fila), así que la corrida tiene que estar completa.
    const an = [{ lote: '1', fecha_analisis: '2026-01-01', etanol: 13.5, av: 0.4, malico: 2.0 }];
    const r = evaluarLote({ lote: '1', variedad: 'Malbec', litros_actuales: 100 }, an, cfg(), d('2026-02-01'));
    expect(r.vencido).toBe(true);
    expect(r.estado_frecuencia).toBe('vencido');
    expect(r.frecuencia_max).toBe(15);
  });

  it('una corrida incompleta no reinicia la frecuencia', () => {
    // Sólo málico: no es control de proceso, así que queda pendiente.
    const an = [{ lote: '1', fecha_analisis: '2026-01-01', malico: 2.0 }];
    const r = evaluarLote({ lote: '1', variedad: 'Malbec', litros_actuales: 100 }, an, cfg(), d('2026-02-01'));
    expect(r.estado_frecuencia).toBe('sin_datos');
    expect(r.control_proceso_pendiente).toBe(true);
    expect(r.alarmas).toContain('control_proceso_pendiente');
  });

  it('-999 es un valor inválido, no un dato', () => {
    const an = [{ lote: '1', fecha_analisis: '2026-02-01', av: -999, malico: -999 }];
    const r = evaluarLote({ lote: '1', variedad: 'Malbec', litros_actuales: 100 }, an, cfg(), d('2026-02-02'));
    expect(r.av_alerta).toBe(true); // AV inválida => alerta
    expect(r.fml_estado).toBe('sin_dato'); // málico inválido => sin dato útil
  });

  it('incluye la última fecha y si fue inoculado', () => {
    const an = [
      { lote: '1', fecha_analisis: '2026-02-01', ph: 3.5 },
      { lote: '1', fecha_analisis: '2026-03-01', ph: 3.6, comentario: 'VP41' },
    ];
    const r = evaluarLote({ lote: '1', variedad: 'Malbec', litros_actuales: 100 }, an, cfg(), d('2026-03-10'));
    expect(r.ultima_fecha).toBe('2026-03-01');
    expect(r.inoculado).toBe('si');
  });
});

describe('evaluar el conjunto', () => {
  it('agrupa alarmas y arma los KPIs', () => {
    const datos = {
      config: cfg(),
      lotes: [
        { lote: '1', variedad: 'Malbec', litros_actuales: 100, mermo: 'no' },
        { lote: '2', variedad: 'Malbec', litros_actuales: 0 }, // inactivo
      ],
      analisis: [{ lote: '1', fecha_analisis: '2026-01-01', malico: 2.0, ph: 3.9, so2_libre: 10 }],
      excepciones_analisis: [],
    };
    const r = evaluar(datos, d('2026-03-01'));
    expect(r.kpis.total_activos).toBe(1); // el lote 2 no cuenta
    expect(r.alarmas.fml_no_finalizada).toBeDefined();
    expect(r.alarmas.fml_no_finalizada.cantidad).toBe(1);
    expect(r.alarmas.fml_no_finalizada.lotes).toEqual(['1']);
    expect(r.alarmas.ph_no_ok.accion).toBe('revisar ajuste SO2/pH');
  });

  it('respeta las excepciones de análisis', () => {
    const datos = {
      config: cfg(),
      lotes: [{ lote: '1', variedad: 'Malbec', litros_actuales: 100, mermo: 'no' }],
      analisis: [{ lote: '1', fecha_analisis: '2026-02-01', ph: 3.9 }],
      excepciones_analisis: [{ lote: '1', fecha_analisis: '2026-02-01', usar_registro: 'no' }],
    };
    const r = evaluar(datos, d('2026-03-01'));
    expect(r.alarmas.sin_analisis_valido).toBeDefined();
    expect(r.alarmas.ph_no_ok).toBeUndefined();
  });
});

describe('config anidada (la forma real de datos.json)', () => {
  const cfgAnidada = () => ({
    criterios_fml: {
      default: { ...CRITERIOS_DEFAULT },
      por_variedad: { Chardonnay: { hace_fml: 'no', ph_max: 3.65 } },
    },
  });

  it('el override llega: Chardonnay queda excluida', () => {
    const datos = {
      config: cfgAnidada(),
      lotes: [{ lote: '1', variedad: 'Chardonnay', litros_actuales: 1000 }],
      analisis: [{ lote: '1', fecha_analisis: '2026-02-01', malico: 2.0, ph: 3.5 }],
      excepciones_analisis: [],
    };
    const res = evaluar(normalizarConfig(datos), d('2026-03-01'));
    expect(res.lotes[0].fml_estado).toBe('excluida');
    expect(res.lotes[0].alarmas).not.toContain('fml_no_finalizada');
  });

  it('un override numérico también llega', () => {
    const datos = {
      config: cfgAnidada(),
      lotes: [{ lote: '1', variedad: 'Chardonnay', litros_actuales: 1000 }],
      analisis: [{ lote: '1', fecha_analisis: '2026-02-01', ph: 3.7 }],
      excepciones_analisis: [],
    };
    const res = evaluar(normalizarConfig(datos), d('2026-03-01'));
    expect(res.lotes[0].ph_ok).toBe(false); // 3.70 > 3.65
  });

  it('la forma plana sigue funcionando', () => {
    const datos = {
      config: cfg(),
      lotes: [{ lote: '1', variedad: 'Chardonnay', litros_actuales: 1000 }],
      analisis: [{ lote: '1', fecha_analisis: '2026-02-01', malico: 2.0 }],
      excepciones_analisis: [],
    };
    const res = evaluar(normalizarConfig(datos), d('2026-03-01'));
    expect(res.lotes[0].fml_estado).toBe('excluida');
  });

  it('no muta el objeto de entrada', () => {
    const datos: Record<string, unknown> = {
      config: cfgAnidada(),
      lotes: [],
      analisis: [],
      excepciones_analisis: [],
    };
    const configOriginal = datos.config;
    normalizarConfig(datos);
    expect(datos.config).toBe(configOriginal);
    expect(datos.config).toHaveProperty('criterios_fml');
  });
});

describe('criterios por proyecto', () => {
  const cfgProy = () => ({
    default: { ph_max: 3.75, av_max: 0.8 },
    por_variedad: { Chardonnay: { hace_fml: 'no', ph_max: 3.65 } },
    por_proyecto: { 'White Colluvium': { ph_max: 3.55 } },
  });

  it('un proyecto sin override no cambia nada', () => {
    const c = cfgProy();
    expect(criteriosEfectivos(c, 'Chardonnay')).toEqual(
      criteriosEfectivos(c, 'Chardonnay', 'Proyecto Inexistente'),
    );
  });

  it('el proyecto pisa la variedad clave por clave', () => {
    const eff = criteriosEfectivos(cfgProy(), 'Chardonnay', 'White Colluvium');
    expect(eff.ph_max).toBe(3.55); // del proyecto
    expect(eff.hace_fml).toBe('no'); // heredado de la variedad
    expect(eff.av_max).toBe(0.8); // heredado del default
  });

  it('el proyecto aplica aunque la variedad no tenga override', () => {
    const eff = criteriosEfectivos(cfgProy(), 'Malbec', 'White Colluvium');
    expect(eff.ph_max).toBe(3.55);
    expect(eff.hace_fml).toBe(CRITERIOS_DEFAULT.hace_fml);
  });

  it('el proyecto matchea sin distinguir tildes ni mayúsculas', () => {
    const c = { default: {}, por_variedad: {}, por_proyecto: { 'Parcelas Adrianna': { ph_max: 3.5 } } };
    expect(criteriosEfectivos(c, 'Malbec', 'parcelas  ADRIANNA').ph_max).toBe(3.5);
  });

  it('si falta por_proyecto no explota', () => {
    const eff = criteriosEfectivos({ default: { ph_max: 3.7 }, por_variedad: {} }, 'Malbec', 'Domaine Nico');
    expect(eff.ph_max).toBe(3.7);
  });

  it('pasar null es igual a no pasarlo', () => {
    const c = cfgProy();
    expect(criteriosEfectivos(c, 'Chardonnay')).toEqual(criteriosEfectivos(c, 'Chardonnay', null));
  });

  it('evaluarLote saca el proyecto del propio lote', () => {
    const c = {
      default: { ph_max: 3.75 },
      por_variedad: { Chardonnay: { ph_max: 3.65 } },
      por_proyecto: { 'White Colluvium': { ph_max: 3.55 } },
    };
    const ev = evaluarLote(
      { lote: '26001', variedad: 'Chardonnay', proyecto: 'White Colluvium', litros_actuales: 1000 },
      [{ lote: '26001', fecha_analisis: '2026-07-01', ph: 3.6 }],
      c,
      d('2026-07-10'),
    );
    expect(ev.alarmas).toContain('ph_no_ok');
  });

  it('un lote sin proyecto sigue usando la variedad', () => {
    const c = {
      default: { ph_max: 3.75 },
      por_variedad: { Chardonnay: { ph_max: 3.65 } },
      por_proyecto: { 'White Colluvium': { ph_max: 3.55 } },
    };
    const ev = evaluarLote(
      { lote: '26002', variedad: 'Chardonnay', proyecto: '', litros_actuales: 1000 },
      [{ lote: '26002', fecha_analisis: '2026-07-01', ph: 3.6 }],
      c,
      d('2026-07-10'),
    );
    expect(ev.alarmas).not.toContain('ph_no_ok');
  });
});

describe('química del SO2', () => {
  it('la fórmula del molecular', () => {
    const v = so2Molecular(30, 3.2);
    expect(v).not.toBeNull();
    expect(v!).toBeCloseTo(30 / (1 + Math.pow(10, 3.2 - 1.8)), 9);
  });

  it('sin datos o con datos inválidos devuelve null', () => {
    expect(so2Molecular(null, 3.2)).toBeNull();
    expect(so2Molecular(30, null)).toBeNull();
    expect(so2Molecular(-999, 3.2)).toBeNull();
  });

  it('el objetivo invierte exactamente el molecular', () => {
    // Es la propiedad que define la función: si la inversión se rompe, todas
    // las dosis de la orden de corrección quedan mal.
    const eff = { ...CRITERIOS_DEFAULT, so2_libre_piso: 0.0 } as Criterios;
    for (const ph of [3.0, 3.2, 3.4, 3.6, 3.75, 3.9, 4.0]) {
      const objetivo = objetivoSo2Libre(ph, eff);
      expect(so2Molecular(objetivo, ph)!).toBeCloseTo(0.38, 9);
    }
  });

  it('respeta el piso a pH bajo', () => {
    const eff = { ...CRITERIOS_DEFAULT } as Criterios; // piso 20
    expect(objetivoSo2Libre(2.93, eff)!).toBeCloseTo(20.0, 6);
    expect(objetivoSo2Libre(3.93, eff)!).toBeCloseTo(51.6, 1);
  });

  it('el cruce entre el piso y el molecular está en pH 3,51', () => {
    // Con el piso en 20 el cruce baja de 3,61 a 3,51: 0,38·(1+10^(pH−1,8))=20.
    const eff = { ...CRITERIOS_DEFAULT } as Criterios;
    expect(objetivoSo2Libre(3.45, eff)!).toBeCloseTo(20.0, 6);
    expect(objetivoSo2Libre(3.6, eff)!).toBeGreaterThan(20.0);
  });

  it('sin pH no hay objetivo', () => {
    const eff = { ...CRITERIOS_DEFAULT } as Criterios;
    expect(objetivoSo2Libre(null, eff)).toBeNull();
    expect(objetivoSo2Libre(-999, eff)).toBeNull();
  });

  it('usa los overrides de proyecto', () => {
    const c = {
      default: { ...CRITERIOS_DEFAULT },
      por_variedad: { Malbec: { so2_libre_piso: 30.0 } },
      por_proyecto: { Angelica: { so2_libre_piso: 18.0 } },
    };
    expect(objetivoSo2Libre(3.0, criteriosEfectivos(c, 'Malbec', null))!).toBeCloseTo(30.0, 6);
    expect(objetivoSo2Libre(3.0, criteriosEfectivos(c, 'Malbec', 'Angelica'))!).toBeCloseTo(18.0, 6);
  });

  it('la corrección de SO2 usa las fórmulas del Excel', () => {
    const r = calcularCorreccionSo2(20, 35, 1000);
    expect(r.diferencia).toBe(15);
    expect(r.mbk_a_agregar!).toBeCloseTo(45.0, 9);
    expect(r.ml_exactos!).toBeCloseTo((15 * 1000 * 1.5) / 55, 9);
  });

  it('sin datos, la corrección no inventa números', () => {
    expect(calcularCorreccionSo2(null, 35, 1000)).toEqual({
      diferencia: null,
      mbk_a_agregar: null,
      ml_exactos: null,
    });
  });
});

describe('so2_ok mira la última medición, no la mejor', () => {
  const lote225 = (n: string) => ({ lote: n, variedad: 'Malbec', cap225: 1 });

  it('bien en enero y mal en julio: NO está bien', () => {
    const ev = evaluarLote(
      lote225('26001'),
      [
        { lote: '26001', fecha_analisis: '2026-01-15', so2_libre: 35.0, ph: 3.5 },
        { lote: '26001', fecha_analisis: '2026-07-15', so2_libre: 18.0, ph: 3.5 },
      ],
      cfg(),
      d('2026-08-24'),
    );
    expect(ev.so2_ok).toBe(false);
    expect(ev.alarmas).toContain('so2_no_ok');
  });

  it('mal en enero y corregido en julio: está bien', () => {
    const ev = evaluarLote(
      lote225('26002'),
      [
        { lote: '26002', fecha_analisis: '2026-01-15', so2_libre: 18.0, ph: 3.5 },
        { lote: '26002', fecha_analisis: '2026-07-15', so2_libre: 35.0, ph: 3.5 },
      ],
      cfg(),
      d('2026-08-24'),
    );
    expect(ev.so2_ok).toBe(true);
    expect(ev.alarmas).not.toContain('so2_no_ok');
  });

  it('ignora las mediciones inválidas al buscar la última', () => {
    const ev = evaluarLote(
      lote225('26003'),
      [
        { lote: '26003', fecha_analisis: '2026-06-15', so2_libre: 35.0, ph: 3.5 },
        { lote: '26003', fecha_analisis: '2026-07-15', so2_libre: -999, ph: 3.5 },
      ],
      cfg(),
      d('2026-08-24'),
    );
    expect(ev.so2_ok).toBe(true);
  });

  it('usa el objetivo molecular, no un libre fijo', () => {
    // El lote 26272 real: pasaba con 30,0 mg/L exactos y estaba a 0,221 de molecular.
    const alto = evaluarLote(
      lote225('26272'),
      [{ lote: '26272', fecha_analisis: '2026-07-15', so2_libre: 30.0, ph: 3.93 }],
      cfg(),
      d('2026-08-24'),
    );
    expect(alto.so2_ok).toBe(false); // a pH 3,93 el objetivo es 51,6

    const bajo = evaluarLote(
      lote225('26119'),
      [{ lote: '26119', fecha_analisis: '2026-07-15', so2_libre: 28.0, ph: 2.93 }],
      cfg(),
      d('2026-08-24'),
    );
    expect(bajo.so2_ok).toBe(true); // a pH 2,93 el molecular sobra y 28 supera el piso de 20
  });

  it('sin pH no se pronuncia por encima del piso', () => {
    // Arriba del piso el veredicto lo da el molecular, y sin pH no hay molecular.
    const ev = evaluarLote(
      lote225('26004'),
      [{ lote: '26004', fecha_analisis: '2026-07-15', so2_libre: 30.0 }],
      cfg(),
      d('2026-08-24'),
    );
    expect(ev.so2_ok).toBeNull();
    expect(ev.so2_estado).toBe('sin_datos');
    expect(ev.alarmas).not.toContain('so2_no_ok');
  });

  it('en el piso o por debajo se pronuncia aunque no haya pH', () => {
    // Primer tramo del tablero: 10 ppm es no OK sin mirar nada más.
    const ev = evaluarLote(
      lote225('26005'),
      [{ lote: '26005', fecha_analisis: '2026-07-15', so2_libre: 10.0 }],
      cfg(),
      d('2026-08-24'),
    );
    expect(ev.so2_estado).toBe('no_ok');
    expect(ev.so2_ok).toBe(false);
    expect(ev.alarmas).toContain('so2_no_ok');
  });

  it('el SO2 justo en el piso es no OK', () => {
    // Verificado contra el tablero: sus lotes 26008 y 26011, con 20,0 clavado,
    // son no_ok. Antes 20,0 >= objetivo daba OK.
    const ev = evaluarLote(
      lote225('26008'),
      [{ lote: '26008', fecha_analisis: '2026-07-15', so2_libre: 20.0, ph: 3.5 }],
      cfg(),
      d('2026-08-24'),
    );
    expect(ev.so2_estado).toBe('no_ok');
    expect(ev.so2_ok).toBe(false);
  });
});

describe('flags de una fila de análisis', () => {
  const eff = () => criteriosEfectivos(cfg(), 'Malbec');

  it('marca pH y AV altos', () => {
    // pH 3.9 => objetivo ~48,2, así que 50 está en criterio.
    const fl = flagsAnalisis(
      { ph: 3.9, av: 0.9, malico: 0.1, gluc_fruc: 1.0, azucar_reductor: 1.0, so2_libre: 50 },
      eff(),
    );
    expect(fl).toContain('ph');
    expect(fl).toContain('av');
    expect(fl).not.toContain('malico');
    expect(fl).not.toContain('so2_libre');
  });

  it('marca la AV inválida', () => {
    expect(flagsAnalisis({ av: -999 }, eff())).toContain('av');
  });

  it('marca SO2 bajo y azúcar alto', () => {
    const fl = flagsAnalisis({ so2_libre: 10, azucar_reductor: 8, ph: 3.5 }, eff());
    expect(fl).toContain('so2_libre');
    expect(fl).toContain('azucar_reductor');
  });

  it('sin datos no marca nada', () => {
    expect(flagsAnalisis({}, eff())).toEqual([]);
    expect(flagsAnalisis({ ph: null, av: null }, eff())).toEqual([]);
  });

  it('juzga el SO2 con el objetivo del pH de esa misma fila', () => {
    expect(flagsAnalisis({ so2_libre: 30.0, ph: 3.93 }, eff())).toContain('so2_libre');
    expect(flagsAnalisis({ so2_libre: 28.0, ph: 2.93 }, eff())).not.toContain('so2_libre');
  });

  it('sin pH no marca el SO2 por encima del piso', () => {
    // 30 > piso 20 y no hay pH: no se puede calcular el molecular, no hay
    // veredicto. El lote tambien queda 'sin_datos' (ver estadoSo2).
    expect(flagsAnalisis({ so2_libre: 30.0 }, eff())).not.toContain('so2_libre');
  });
});

// Los cinco bordes donde flagsAnalisis y estadoSo2 divergian: la celda de la
// tabla de Analisis decia una cosa y el veredicto del lote otra. Hoy los dos
// salen de veredictoSo2, asi que no pueden contradecirse.
describe('flagsAnalisis y estadoSo2 juzgan el SO2 con el mismo criterio', () => {
  const eff = () => criteriosEfectivos(cfg(), 'Malbec');
  const marca = (fila: Record<string, unknown>, e = eff()) =>
    flagsAnalisis(fila, e).includes('so2_libre');
  const delLote = (fila: Record<string, unknown>, conf = cfg()) =>
    evaluarLote(
      { lote: '26001', variedad: 'Malbec', litros_actuales: 225, mermo: 'no', hace_fml: 'si' },
      [{ fecha_analisis: '2026-08-20', ...fila }],
      conf,
      d('2026-08-24'),
    );

  it('el SO2 clavado en el piso se marca, igual que el lote es no_ok', () => {
    expect(marca({ so2_libre: 20.0, ph: 3.5 })).toBe(true);
    expect(delLote({ so2_libre: 20.0, ph: 3.5 }).so2_estado).toBe('no_ok');
  });

  it('bajo el piso y sin pH se marca igual: el piso no necesita pH', () => {
    expect(marca({ so2_libre: 5.0 })).toBe(true);
    expect(delLote({ so2_libre: 5.0 }).so2_estado).toBe('no_ok');
  });

  it('el placeholder 0 no es una medicion: ni se marca ni alarma', () => {
    expect(marca({ so2_libre: 0, ph: 3.5 })).toBe(false);
    expect(delLote({ so2_libre: 0, ph: 3.5 }).so2_estado).toBe('sin_datos');
  });

  it('encuentra el SO2 en so2_libre_actual y dentro de correccion', () => {
    expect(marca({ so2_libre_actual: 8.0, ph: 3.5 })).toBe(true);
    expect(delLote({ so2_libre_actual: 8.0, ph: 3.5 }).so2_estado).toBe('no_ok');

    expect(marca({ correccion: { so2_libre: 8.0 }, ph: 3.5 })).toBe(true);
    expect(delLote({ correccion: { so2_libre: 8.0 }, ph: 3.5 }).so2_estado).toBe('no_ok');
  });

  it('con so2_aplica en no, no se marca nada', () => {
    const conf = {
      default: { ...CRITERIOS_DEFAULT },
      por_proyecto: { 'El Amiguito': { so2_aplica: 'no' } },
    };
    const e = criteriosEfectivos(conf, 'Malbec', 'El Amiguito');
    expect(marca({ so2_libre: 5.0, ph: 3.5 }, e)).toBe(false);

    const r = evaluarLote(
      { lote: '26001', variedad: 'Malbec', proyecto: 'El Amiguito', litros_actuales: 225, mermo: 'no', hace_fml: 'si' },
      [{ fecha_analisis: '2026-08-20', so2_libre: 5.0, ph: 3.5 }],
      conf,
      d('2026-08-24'),
    );
    expect(r.so2_estado).toBe('no_aplica');
  });
});

describe('detección de inoculado', () => {
  it('lo detecta por el texto', () => {
    expect(detectarInoculado([{ comentario: 'se agregó VP41 hoy' }])).toBe('si');
    expect(detectarInoculado([{ correccion: { otro: 'inoculado con bacterias' } }])).toBe('si');
  });

  it('sin evidencia queda desconocido', () => {
    expect(detectarInoculado([{ comentario: 'nada' }])).toBe('desconocido');
    expect(detectarInoculado([])).toBe('desconocido');
  });
});

describe('tablero: resultado del lote', () => {
  const lote = { lote: '26001', variedad: 'Malbec', litros_actuales: 225, mermo: 'no', hace_fml: 'si' };

  it('publica los estados nuevos y los viejos a la vez', () => {
    const r = evaluarLote(
      lote,
      [{ fecha_analisis: '2026-08-20', etanol: 14, av: 0.4, malico: 0.1, ph: 3.5, so2_libre: 30 }],
      cfg(),
      d('2026-08-24'),
    );
    expect(r.so2_estado).toBe('ok');
    expect(r.ph_estado).toBe('ok');
    expect(r.estado_frecuencia).toBe('al_dia');
    // compatibilidad
    expect(r.so2_ok).toBe(true);
    expect(r.ph_ok).toBe(true);
    expect(r.vencido).toBe(false);
  });

  it('no_aplica cuenta como conforme para la compatibilidad', () => {
    const r = evaluarLote(
      { ...lote, proyecto: 'El Amiguito' },
      [{ fecha_analisis: '2026-08-20', etanol: 14, av: 0.4, malico: 0.1, ph: 3.5, so2_libre: 5 }],
      { default: { ...CRITERIOS_DEFAULT }, por_proyecto: { 'El Amiguito': { so2_aplica: 'no' } } },
      d('2026-08-24'),
    );
    expect(r.so2_estado).toBe('no_aplica');
    expect(r.so2_ok).toBe(true);
    expect(r.alarmas).not.toContain('so2_no_ok');
  });

  it('cada condicion viene con etiqueta, accion y desde', () => {
    const r = evaluarLote(
      lote,
      [{ fecha_analisis: '2026-06-01', etanol: 14, av: 0.4, malico: 0.1, ph: 3.5, so2_libre: 30 }],
      cfg(),
      d('2026-08-24'),
    );
    const frec = r.condiciones.find((c) => c.clave === 'frecuencia_vencida');
    expect(frec?.etiqueta).toBe('Frecuencia vencida');
    expect(frec?.accion).toBe('hacer OT y analizar');
    expect(frec?.desde).toBe('2026-07-01');
  });

  it('la accion sugerida une las de todas las condiciones activas', () => {
    const r = evaluarLote(
      lote,
      [{ fecha_analisis: '2026-06-01', etanol: 14, av: 1.2, malico: 0.1, ph: 3.5, so2_libre: 30 }],
      cfg(),
      d('2026-08-24'),
    );
    expect(r.alarmas).toContain('av_alerta');
    expect(r.alarmas).toContain('frecuencia_vencida');
    // en el orden de CONDICIONES: frecuencia primero, AV despues
    expect(r.accion_sugerida).toBe('hacer OT y analizar | revisar urgente y confirmar analisis');
  });

  it('un Chardonnay sin hace_fml no esta incompleto', () => {
    const r = evaluarLote(
      { lote: '26002', variedad: 'Chardonnay', litros_actuales: 225, mermo: 'no' },
      [{ fecha_analisis: '2026-08-20', etanol: 14, av: 0.4, malico: 2.0, ph: 3.5, so2_libre: 30 }],
      cfg(),
      d('2026-08-24'),
    );
    expect(r.fml_estado).toBe('excluida');
    expect(r.alarmas).not.toContain('datos_operativos_incompletos');
  });
});

describe('tablero: pH, frecuencia y origen de la exclusion', () => {
  const lote = { lote: '26001', variedad: 'Malbec', litros_actuales: 225, mermo: 'no', hace_fml: 'si' };
  const an = (ph: number) => [
    { fecha_analisis: '2026-08-20', etanol: 14, av: 0.4, malico: 0.1, ph, so2_libre: 30 },
  ];

  it('el pH clavado en el maximo ya no alarma', () => {
    const r = evaluarLote(lote, an(3.75), cfg(), d('2026-08-24'));
    expect(r.ph_estado).toBe('ok');
    expect(r.ph_ok).toBe(true);
    expect(r.alarmas).not.toContain('ph_no_ok');
  });

  it('salvo que la variedad lo pida inclusivo, como el Cabernet', () => {
    const c = {
      default: { ...CRITERIOS_DEFAULT },
      por_variedad: { 'Cabernet Sauvignon': { ph_max: 3.75, ph_max_inclusive: 'si' } },
    };
    const r = evaluarLote(
      { ...lote, variedad: 'Cabernet Sauvignon' },
      an(3.75),
      c,
      d('2026-08-24'),
    );
    expect(r.ph_estado).toBe('no_ok');
    expect(r.alarmas).toContain('ph_no_ok');
  });

  it('evaluarLote y flagsAnalisis juzgan el pH con el mismo criterio', () => {
    // Las dos decisiones tienen que salir de phFueraDeCriterio: si divergen, la
    // ficha pinta en rojo un valor que el lote da por bueno.
    const eff = criteriosEfectivos(cfg(), 'Malbec');
    for (const ph of [3.6, 3.74, 3.75, 3.76, 3.9]) {
      const r = evaluarLote(lote, an(ph), cfg(), d('2026-08-24'));
      expect([ph, r.ph_estado === 'no_ok']).toEqual([ph, flagsAnalisis({ ph }, eff).includes('ph')]);
    }
  });

  it('la FML sin dato usa 15 dias, no 30', () => {
    // No saber no es razon para espaciar: solo aflojan finalizada y excluida.
    const sinMalico = [{ fecha_analisis: '2026-08-01', etanol: 14, av: 0.4, malico: -999, ph: 3.5 }];
    const r = evaluarLote(lote, sinMalico, cfg(), d('2026-08-24'));
    expect(r.fml_estado).toBe('sin_dato');
    expect(r.frecuencia_max).toBe(15);

    const finalizada = evaluarLote(lote, an(3.5), cfg(), d('2026-08-24'));
    expect(finalizada.fml_estado).toBe('finalizada');
    expect(finalizada.frecuencia_max).toBe(30);
  });

  it('el origen de la decision de FML viaja en los cuatro estados', () => {
    // No solo cuando esta excluida: la ficha muestra quien mando siempre.
    expect(evaluarLote(lote, an(3.5), cfg(), d('2026-08-24')).fml_excluida_origen).toBe('lote');

    const blanca = evaluarLote(
      { lote: '26002', variedad: 'Chardonnay', litros_actuales: 225, mermo: 'no' },
      an(3.5),
      cfg(),
      d('2026-08-24'),
    );
    expect(blanca.fml_estado).toBe('excluida');
    expect(blanca.fml_excluida_origen).toBe('variedad_blanca');

    const sinDecision = evaluarLote(
      { lote: '26003', variedad: 'Malbec', litros_actuales: 225, mermo: 'no' },
      an(3.5),
      cfg(),
      d('2026-08-24'),
    );
    expect(sinDecision.fml_excluida_origen).toBe('sin_dato');
    expect(sinDecision.alarmas).toContain('datos_operativos_incompletos');
  });
});

describe('tablero: KPIs', () => {
  it('trae los seis ejes del panel', () => {
    const datos = {
      config: { criterios_fml: { default: { ...CRITERIOS_DEFAULT } } },
      lotes: [{ lote: '1', variedad: 'Malbec', litros_actuales: 225, mermo: 'no', hace_fml: 'si' }],
      analisis: [{ lote: '1', fecha_analisis: '2026-08-20', etanol: 14, av: 0.4, malico: 0.1, ph: 3.5, so2_libre: 30 }],
    };
    const ev = evaluar(normalizarConfig(datos), d('2026-08-24'));
    expect(ev.kpis.fml_terminada).toBe(1);
    expect(ev.kpis.frecuencia_al_dia).toBe(1);
    expect(ev.kpis.so2_conforme).toBe(1);
    expect(ev.kpis.ph_ok).toBe(1);
    expect(ev.kpis.lleno).toBe(1);
    expect(ev.kpis.requieren_accion).toBe(0);
    expect(ev.kpis.condicion_ideal).toBe(1);
  });
});

describe('la clave so2_libre_min ya no existe', () => {
  it('no está ni en el default ni en los efectivos', () => {
    expect(CRITERIOS_DEFAULT).not.toHaveProperty('so2_libre_min');
    expect(criteriosEfectivos(cfg(), 'Malbec', null)).not.toHaveProperty('so2_libre_min');
  });
});
