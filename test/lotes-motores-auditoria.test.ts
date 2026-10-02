/**
 * Regresiones de la auditoria de los motores de Lotes (2026-10).
 *
 * Cada bloque fija un bug confirmado: si alguno vuelve, el test dice cual y por
 * que importa en la bodega, no solo que un numero cambio.
 */
import { describe, it, expect } from 'vitest';
import {
  num,
  filasDe,
  estadoFml,
  estadoPh,
  esMedicionUtil,
  ultimoControlProceso,
} from '../src/lotes/motores/fml-condiciones';
import {
  CRITERIOS_DEFAULT,
  criteriosEfectivos,
  evaluar,
  evaluarLote,
  analisisPorLote,
} from '../src/lotes/motores/fml';
import { evaluarEtapa, etapasSugeridas } from '../src/lotes/motores/etapas';
import { litrosDeEnvases } from '../src/lotes/motores/envases';
import { normalizarMapa } from '../src/lotes/motores/mapa';
import { cruzar, veredictoDeLote } from '../src/lotes/motores/cruce';
import { armarOrden } from '../src/lotes/motores/correccion';
import { barrilesDeLotes, barrilesPorNum } from '../src/lotes/motores/barriles-lote';
import { datosDashboard, datosFicha, analisisConFlags } from '../src/lotes/vistas';
import { construirReporte } from '../src/lotes/reporte';

const d = (iso: string) => Date.parse(iso + 'T00:00:00Z');
const HOY = d('2026-10-02');
const eff = () => ({ ...CRITERIOS_DEFAULT });

/** Mapa de Barriles minimo: una barrica por lote pedido. */
const mapaCon = (inventario: unknown) => normalizarMapa({ version: 1, estado: { inventario } });

// ------------------------------------------------------------- 1. num()

describe('num: la celda vacia es sin dato, no 0', () => {
  it('vacio y espacios dan null', () => {
    expect(num('')).toBe(null);
    expect(num('   ')).toBe(null);
    expect(num(null)).toBe(null);
    expect(num(undefined)).toBe(null);
  });

  it('acepta la coma decimal', () => {
    expect(num('3,5')).toBe(3.5);
    expect(num(' 0,62 ')).toBe(0.62);
    expect(num('3.5')).toBe(3.5);
  });

  it('el 0 de verdad sigue siendo 0, y lo que no es numero es null', () => {
    expect(num(0)).toBe(0);
    expect(num('0')).toBe(0);
    expect(num('-999')).toBe(-999);
    expect(num('abc')).toBe(null);
    expect(num(NaN)).toBe(null);
    expect(num(Infinity)).toBe(null);
    expect(num(true)).toBe(null);
  });

  it('un malico en blanco no da la FML por finalizada', () => {
    const analisis = [
      { fecha_analisis: '2026-08-01', malico: 1.2 },
      { fecha_analisis: '2026-09-01', malico: '' },
    ];
    expect(estadoFml(analisis, eff(), {}).estado).toBe('no_finalizada');
  });

  it('un pH en blanco no es pH 0: manda el ultimo medido', () => {
    const r = estadoPh(
      [
        { fecha_analisis: '2026-08-01', ph: 3.9 },
        { fecha_analisis: '2026-09-01', ph: '  ' },
      ],
      eff(),
    );
    expect(r.valor).toBe(3.9);
    expect(r.estado).toBe('no_ok');
  });

  it('un pH con coma se lee', () => {
    expect(estadoPh([{ fecha_analisis: '2026-09-01', ph: '3,9' }], eff()).valor).toBe(3.9);
  });

  it('una fila con las celdas en blanco no es analisis ni control de proceso', () => {
    const fila = { fecha_analisis: '2026-09-01', etanol: '', av: '', malico: '', ph: '' };
    expect(esMedicionUtil(fila)).toBe(false);
    expect(ultimoControlProceso([fila])).toBe(null);
  });

  it('litros_actuales en blanco cae al desglose de envases, no a 0 L', () => {
    const r = evaluarLote({ lote: '26001', litros_actuales: '', cap225: 2 }, [], {}, HOY);
    expect(r.litros).toBe(450);
    expect(r.activo).toBe(true);
  });

  it('litros_actuales en blanco no cierra el lote', () => {
    const lote = {
      lote: '26001', variedad: 'Malbec', fecha_ingreso: '2026-03-01', descube_fa: '2026-03-20',
      litros_actuales: '', cap225: 2,
    };
    expect(evaluarEtapa(lote, [], [], {}, HOY).etapa_sugerida).not.toBe('cerrado');
  });

  it('envases acepta la coma en vasija_grande', () => {
    expect(litrosDeEnvases({ vasija_grande: '1500,5' })).toBe(1500.5);
  });

  it('barriles-lote: espacios no son 0 litros y la coma se lee', () => {
    const r = barrilesDeLotes(
      { inventario: [{ num: 'B1', lote: '26001', cap: '225,5', litros: '  ' }] },
      ['26001'],
    );
    expect(r['26001'][0].cap).toBe(225.5);
    expect(r['26001'][0].litros).toBe(null);
  });

  it('orden de correccion: SO2 libre en blanco no pide la dosis completa', () => {
    const datos = {
      lotes: [{ lote: '26001', variedad: 'Malbec', litros_actuales: 225, cap225: 1, etapa: 'crianza' }],
      analisis: [
        { lote: '26001', fecha_analisis: '2026-09-01', ph: 3.5, so2_libre_actual: '', so2_libre: 10 },
      ],
    };
    const mapa = mapaCon([{ num: 'B1', lote: '26001', cap: 225, litros: 225, estado: 'LLENO' }]);
    const orden = armarOrden(datos, mapa, HOY);
    expect(orden.lotes).toHaveLength(1);
    // Con el '' leido como 0 la diferencia era 20 (el objetivo entero).
    expect(orden.lotes[0].so2_libre).toBe(10);
    expect(orden.lotes[0].diferencia).toBe(10);
  });

  it('orden de correccion: litros "112,5" del Mapa no se dosifican por capacidad', () => {
    const datos = {
      lotes: [{ lote: '26001', variedad: 'Malbec', litros_actuales: 112.5, cap225: 1, etapa: 'crianza' }],
      analisis: [{ lote: '26001', fecha_analisis: '2026-09-01', ph: 3.5, so2_libre: 10 }],
    };
    const mapa = mapaCon([{ num: 'B1', lote: '26001', cap: 225, litros: '112,5', estado: 'MERMO' }]);
    const b = armarOrden(datos, mapa, HOY).lotes[0].barricas[0];
    expect(b.litros_usados).toBe(112.5);
    expect(b.litros_de_capacidad).toBe(false);
  });
});

// ------------------------------------- 2. los "no usar" fuera de etapa y hitos

describe('excepciones "no usar" en dashboard y ficha', () => {
  const datos = {
    lotes: [{
      lote: '26050', variedad: 'Malbec', proyecto: 'X', fecha_ingreso: '2026-03-01',
      descube_fa: '2026-03-20', litros_actuales: 1000, mermo: 'no', hace_fml: 'si',
    }],
    analisis: [
      { lote: '26050', fecha_analisis: '2026-08-01', malico: 1.0 },
      // Este malico cerraria la FML, pero el laboratorio lo marco "no usar".
      { lote: '26050', fecha_analisis: '2026-09-01', malico: 0.1 },
    ],
    excepciones_analisis: [{ lote: '26050', fecha_analisis: '2026-09-01', usar_registro: 'no' }],
    movimientos: [],
  };

  it('el dashboard no sugiere crianza por un analisis descartado', () => {
    const r = datosDashboard(datos, HOY) as Record<string, any>;
    expect(r.lotes[0].fml_estado).toBe('no_finalizada');
    expect(r.lotes[0].etapa_sugerida).toBe('fml');
    expect(r.etapas['26050'].etapa_sugerida).toBe('fml');
    const hito = r.lotes[0].hitos.find((h: any) => h.clave === 'fml_finalizada');
    expect(hito.cumplido).toBe(false);
  });

  it('la ficha tampoco', () => {
    const f = datosFicha(datos, '26050', HOY)!;
    expect(f.etapa_sugerida).toBe('fml');
    expect(f.hitos.find((h) => h.clave === 'fml_finalizada')!.cumplido).toBe(false);
  });
});

// --------------------------------------------- 3. hito "Analisis al dia"

describe('hito Analisis al dia', () => {
  const lote = {
    lote: '26060', variedad: 'Malbec', fecha_ingreso: '2026-03-01', descube_fa: '2026-03-20',
    litros_actuales: 1000, etapa: 'fml',
  };
  const hito = (analisis: Record<string, unknown>[]) =>
    evaluarEtapa(lote, analisis, [], {}, HOY).hitos.find((h) => h.clave === 'analisis_al_dia')!;

  it('sin ningun control de proceso NO esta al dia', () => {
    const h = hito([]);
    expect(h.aplica).toBe(true);
    expect(h.cumplido).toBe(false);
    expect(h.detalle).toMatch(/sin control de proceso/);
  });

  it('con un control reciente si', () => {
    const h = hito([{ lote: '26060', fecha_analisis: '2026-09-28', etanol: 13.5, av: 0.4, malico: 1.1 }]);
    expect(h.cumplido).toBe(true);
  });
});

// ------------------------------------------ 4. overrides null/'' no pisan

describe('criteriosEfectivos con celdas en blanco', () => {
  it('null y vacio heredan; los numeros en texto se convierten', () => {
    const cfg = {
      default: { ph_max: null, av_max: '', frecuencia_no_terminada: '20' },
      por_variedad: { Malbec: { ph_max: '3,8', so2_libre_piso: null, av_delta_max: 'abc' } },
    };
    const e = criteriosEfectivos(cfg, 'Malbec');
    expect(e.ph_max).toBe(3.8);
    expect(e.av_max).toBe(0.8);
    expect(e.frecuencia_no_terminada).toBe(20);
    expect(e.so2_libre_piso).toBe(20);
    expect(e.av_delta_max).toBe(0.3); // texto que no es numero: no inventa umbral
  });

  it('un ph_max en blanco no pone a todos en ph_no_ok', () => {
    const r = evaluarLote(
      { lote: '26070', variedad: 'Malbec', litros_actuales: 100 },
      [{ fecha_analisis: '2026-09-28', ph: 3.5 }],
      { default: { ph_max: null } },
      HOY,
    );
    expect(r.ph_estado).toBe('ok');
  });

  it('los textos (so2_aplica, hace_fml) en blanco tampoco pisan', () => {
    const e = criteriosEfectivos({ por_proyecto: { P: { so2_aplica: '', hace_fml: '  ' } } }, 'x', 'P');
    expect(e.so2_aplica).toBe('si');
    expect(e.hace_fml).toBe('si');
  });

  it('un override que no es objeto se ignora', () => {
    const e = criteriosEfectivos({ por_variedad: { Malbec: 'roto' } }, 'Malbec');
    expect(e).toEqual(CRITERIOS_DEFAULT);
  });
});

// -------------------------------------- 5. clave de lote con espacios

describe('numero de lote con espacios (normalizarLote)', () => {
  const datos = {
    lotes: [{ lote: '26217 ', variedad: 'Malbec', litros_actuales: 500 }],
    analisis: [{ lote: '26217', fecha_analisis: '2026-09-28', ph: 3.5, malico: 1.0 }],
    config: { criterios_fml: { por_variedad: { Malbec: { ph_max: 3.4 } } } },
  };

  it('evaluar encuentra los analisis del lote', () => {
    const r = evaluar({ ...datos, config: datos.config.criterios_fml }, HOY);
    expect(r.lotes[0].alarmas).not.toContain('sin_analisis_valido');
    expect(r.lotes[0].fml_estado).toBe('no_finalizada');
  });

  it('la excepcion "no usar" de un lote con espacios se aplica', () => {
    const m = analisisPorLote({
      analisis: [{ lote: '26217', fecha_analisis: '2026-09-28', ph: 3.5 }],
      excepciones_analisis: [{ lote: ' 26217 ', fecha_analisis: '2026-09-28', usar_registro: 'no' }],
    });
    expect(m.get('26217')).toBeUndefined();
  });

  it('analisisConFlags juzga con los criterios de la variedad del lote', () => {
    // ph_max 3,4 de Malbec: 3,5 esta fuera. Con los de fabrica (3,75) saldria dentro.
    expect(analisisConFlags(datos)[0].fuera).toContain('ph');
  });

  it('el reporte muestra el estado de FML que sale de sus analisis', () => {
    const html = construirReporte(datos, 1, 'hoy', HOY);
    expect(html).toMatch(/<td>26217 <\/td>.*<td>no_finalizada<\/td>/);
  });
});

// ----------------------------- 6. datos raros de Barriles y excepciones

describe('formas que el guardado acepta no tiran el Worker', () => {
  it('filasDe: lo que no es lista vale [] y saltea lo que no es objeto', () => {
    expect(filasDe({})).toEqual([]);
    expect(filasDe(null)).toEqual([]);
    expect(filasDe([null, 3, 'x', [], { a: 1 }])).toEqual([{ a: 1 }]);
  });

  it('normalizarMapa con inventario {} y entradas null', () => {
    expect(() => mapaCon({})).not.toThrow();
    const m = normalizarMapa({
      version: 1,
      estado: {
        inventario: [null, { num: '1', lote: '26001', cap: 225 }],
        tanques: [null, { num: '1', lote: '26002' }],
        boxes: [null, { nombre: 'A', celdas: 'xx' }, { nombre: 'B', celdas: { '1-1': '26001' } }],
        revisiones: [null],
      },
    });
    expect(m.unidades_por_lote.get('26001')).toHaveLength(1);
    expect(m.posiciones.get('26001')).toEqual(['B/1-1']);
    expect(m.conflictos).toHaveLength(1);
  });

  it('barriles-lote con entradas null', () => {
    const estado = { inventario: [null, { num: 'B1', lote: '26001', cap: 225 }] };
    expect(barrilesDeLotes(estado, ['26001'])['26001']).toHaveLength(1);
    expect(barrilesPorNum(estado, ['B1']).B1?.lote).toBe('26001');
    expect(barrilesDeLotes({ inventario: {} }, ['26001'])['26001']).toEqual([]);
  });

  it('excepciones_analisis que no es lista no rompe evaluar, dashboard ni la orden', () => {
    const datos = {
      lotes: [{ lote: '26001', variedad: 'Malbec', litros_actuales: 225, cap225: 1 }],
      analisis: [{ lote: '26001', fecha_analisis: '2026-09-01', ph: 3.5, so2_libre: 10 }],
      excepciones_analisis: {},
    };
    expect(() => evaluar(datos, HOY)).not.toThrow();
    expect(() => datosDashboard(datos, HOY)).not.toThrow();
    expect(() => armarOrden(datos, mapaCon([]), HOY)).not.toThrow();
  });
});

// --------------------------------- 7. fecha '' de la correccion

describe('supresion: correccion con fecha vacia', () => {
  it('cae a la fecha del analisis y suprime el lote recien corregido', () => {
    const datos = {
      lotes: [{ lote: '26001', variedad: 'Malbec', litros_actuales: 225, cap225: 1, etapa: 'crianza' }],
      analisis: [{
        lote: '26001', fecha_analisis: '2026-09-27', ph: 3.5, so2_libre: 10,
        correccion: { ot_n: 'OT-1', fecha: '' },
      }],
    };
    const mapa = mapaCon([{ num: 'B1', lote: '26001', cap: 225, litros: 225, estado: 'LLENO' }]);
    const orden = armarOrden(datos, mapa, HOY);
    expect(orden.lotes).toHaveLength(0);
    expect(orden.suprimidos).toHaveLength(1);
    expect(orden.suprimidos[0].fecha).toBe('2026-09-27');
  });
});

// ------------------------------ 8. cruce con la etapa sugerida

describe('cruce: lote sin etapa confirmada', () => {
  const lote = { lote: '26080', variedad: 'Malbec', etapa: '' };

  it('sin la sugerida sale sin_envase (comportamiento previo)', () => {
    expect(veredictoDeLote(lote, []).veredicto).toBe('sin_envase');
  });

  it('con la sugerida en fermentacion queda ausente_ok', () => {
    const v = veredictoDeLote(lote, [], false, 'ingreso');
    expect(v.veredicto).toBe('ausente_ok');
    expect(v.etapa).toBe(''); // la respuesta sigue mostrando la confirmada
  });

  it('la etapa confirmada le gana a la sugerida', () => {
    expect(veredictoDeLote({ ...lote, etapa: 'crianza' }, [], false, 'ingreso').veredicto).toBe('sin_envase');
  });

  it('etapasSugeridas arma el mapa y cruzar lo usa', () => {
    const datos = {
      lotes: [
        lote,
        { lote: '26081', variedad: 'Malbec', fecha_ingreso: '2026-09-20', litros_actuales: 3000 },
      ],
      analisis: [],
      movimientos: [],
    };
    const sug = etapasSugeridas(datos, HOY);
    expect(sug.get('26080')).toBe('ingreso');
    expect(sug.get('26081')).toBe('fa');
    const inf = cruzar(datos.lotes, mapaCon([]), sug);
    expect(inf.lotes.every((v) => v.veredicto === 'ausente_ok')).toBe(true);
  });
});
