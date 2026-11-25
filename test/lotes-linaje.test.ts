/**
 * Port de tests/test_motor_linaje.py de la app de Lotes.
 *
 * El linaje dice qué lote viene de cuál y por qué vasijas pasó el vino. Varios
 * casos son datos reales de la bodega (la fusión de cuatro padres en el 26045,
 * el split del 26043).
 */

import { describe, it, expect } from 'vitest';
import {
  grafo,
  cadenaIdentidad,
  ciclos,
  recorridoVasijas,
  lineaTiempo,
  normalizarLote,
  type Grafo,
  type Nodo,
} from '../src/lotes/motores/linaje';
import type { Fila } from '../src/lotes/motores/fml';
// Modulo del navegador (JS sin tipos): el traspaso padre -> hijo de un tanque extra.
// @ts-ignore
import { movimientosDeExtras } from '../public/lotes/js/ot-destinos.js';

const datos = (lotes: string[], movimientos: Fila[]) => ({
  lotes: lotes.map((l) => ({ lote: l })),
  movimientos,
});

const mov = (i: number, lote: string, tipo: string, kw: Fila = {}): Fila => ({
  id: `mov-${i}`,
  lote,
  tipo,
  fecha: '2026-05-01',
  ...kw,
});

const n = (g: Grafo, lote: string): Nodo => g.get(lote)!;

describe('grafo de linaje', () => {
  it('fusión de cuatro padres (caso real del 26045)', () => {
    const origenes = ['26039', '26040', '26041', '26046'];
    const g = grafo(
      datos(
        [...origenes, '26045'],
        origenes.map((o, i) => mov(i, o, 'traspaso', { lote_destino: '26045', litros: 300 })),
      ),
    );
    expect(n(g, '26045').padres.map((p) => p.lote).sort()).toEqual(origenes);
    expect(n(g, '26045').padres).toHaveLength(4);
    for (const o of origenes) expect(n(g, o).hijos.map((h) => h.lote)).toEqual(['26045']);
  });

  it('split parcial (caso real del 26043): un hijo, ningún padre', () => {
    const g = grafo(
      datos(['26043', '26282'], [mov(1, '26043', 'traspaso', { lote_destino: '26282', litros: 675 })]),
    );
    expect(n(g, '26043').hijos.map((h) => h.lote)).toEqual(['26282']);
    expect(n(g, '26043').padres).toEqual([]);
    expect(n(g, '26282').padres.map((p) => p.lote)).toEqual(['26043']);
  });

  it('split con dos hijos', () => {
    const g = grafo(
      datos(
        ['26100', '26101', '26102'],
        [
          mov(1, '26100', 'traspaso', { lote_destino: '26101', litros: 100 }),
          mov(2, '26100', 'traspaso', { lote_destino: '26102', litros: 200 }),
        ],
      ),
    );
    expect(n(g, '26100').hijos.map((h) => h.lote).sort()).toEqual(['26101', '26102']);
  });

  it('una salida externa no es arista entre lotes', () => {
    const g = grafo(
      datos(['26200'], [mov(1, '26200', 'salida', { destino_externo: 'Destilería', litros: 500 })]),
    );
    expect(n(g, '26200').hijos).toEqual([]);
    expect(n(g, '26200').salidas.map((s) => s.destino)).toEqual(['Destilería']);
  });

  it('trasiego y relleno no generan aristas', () => {
    const g = grafo(
      datos(['26300'], [
        mov(1, '26300', 'trasiego', { vasija_origen: 'A', vasija_destino: 'B' }),
        mov(2, '26300', 'relleno', { vasija_destino: 'B', litros: 20 }),
      ]),
    );
    expect(n(g, '26300')).toEqual({ padres: [], hijos: [], salidas: [] });
  });

  it('un lote destino inexistente igual queda en el grafo', () => {
    // No se descarta el dato: el aviso lo da el servidor, pero la arista existe.
    const g = grafo(datos(['26400'], [mov(1, '26400', 'traspaso', { lote_destino: '99999', litros: 10 })]));
    expect(n(g, '26400').hijos.map((h) => h.lote)).toEqual(['99999']);
    expect(g.has('99999')).toBe(true);
    expect(n(g, '99999').padres.map((p) => p.lote)).toEqual(['26400']);
  });

  it('el traspaso de un tanque destino extra de una OT (padre -> hijo) arma la arista', () => {
    const ot = { ot: '0990', fecha: '2026-11-12', destino: 'T 212', lote_corte: null,
      lotes: [{ lote: '26217', destinos_extra: [{ tipo: 'tanque', num: '214', litros: 1580, lote: '26330', nuevo: true, mov_id: 'ot-1-x0-0' }] }] };
    const movs: Fila[] = movimientosDeExtras(ot, 'ana', '2026-11-12');
    // Pendiente todavia no movio vino: sin arista.
    expect(n(grafo(datos(['26217', '26330'], movs)), '26330').padres).toEqual([]);
    const g = grafo(datos(['26217', '26330'], movs.map((m) => ({ ...m, estado: 'ejecutado' }))));
    expect(n(g, '26217').hijos.map((h) => h.lote)).toEqual(['26330']);
    expect(n(g, '26330').padres.map((p) => [p.lote, p.tipo, p.litros])).toEqual([['26217', 'traspaso', 1580]]);
  });

  it('todos los lotes aparecen aunque no tengan movimientos', () => {
    const g = grafo(datos(['26500', '26501'], []));
    expect([...g.keys()].sort()).toEqual(['26500', '26501']);
    expect(n(g, '26500')).toEqual({ padres: [], hijos: [], salidas: [] });
  });
});

describe('cadena de identidad', () => {
  it('sigue los renombres hacia atrás y hacia adelante', () => {
    const g = grafo(
      datos(
        ['26600', '26601', '26602'],
        [
          mov(1, '26600', 'renombre', { lote_destino: '26601', litros: 1000 }),
          mov(2, '26601', 'renombre', { lote_destino: '26602', litros: 1000 }),
        ],
      ),
    );
    const esperado = ['26600', '26601', '26602'];
    expect(cadenaIdentidad('26601', g)).toEqual(esperado);
    expect(cadenaIdentidad('26600', g)).toEqual(esperado);
    expect(cadenaIdentidad('26602', g)).toEqual(esperado);
  });

  it('un traspaso NO entra: es mezcla, no continuidad del mismo vino', () => {
    const g = grafo(datos(['26700', '26701'], [mov(1, '26700', 'traspaso', { lote_destino: '26701', litros: 500 })]));
    expect(cadenaIdentidad('26700', g)).toEqual(['26700']);
  });

  it('un lote sin renombres es él solo', () => {
    expect(cadenaIdentidad('26800', grafo(datos(['26800'], [])))).toEqual(['26800']);
  });

  it('no se cuelga con un ciclo de renombres', () => {
    const g = grafo(
      datos(['26a', '26b'], [
        mov(1, '26a', 'renombre', { lote_destino: '26b', litros: 1 }),
        mov(2, '26b', 'renombre', { lote_destino: '26a', litros: 1 }),
      ]),
    );
    expect(cadenaIdentidad('26a', g).sort()).toEqual(['26a', '26b']);
  });

  it('el tope de seguridad avisa en vez de colgarse', () => {
    // Se falsea el tamaño del grafo para forzar tope=1: el segundo paso lo
    // supera aunque la guarda de visitados esté sana.
    const g = grafo(datos(['TA', 'TB'], [mov(1, 'TA', 'renombre', { lote_destino: 'TB', litros: 1 })]));
    const gTrucado = { get: (k: string) => g.get(k), size: 0 } as unknown as Grafo;
    expect(() => cadenaIdentidad('TA', gTrucado)).toThrow(/cadenaIdentidad/);
  });
});

describe('detección de ciclos', () => {
  it('detecta un ciclo directo', () => {
    const encontrados = ciclos(
      datos(['26039', '26045'], [
        mov(1, '26039', 'traspaso', { lote_destino: '26045', litros: 100 }),
        mov(2, '26045', 'traspaso', { lote_destino: '26039', litros: 100 }),
      ]),
    );
    expect(encontrados.length).toBeGreaterThan(0);
    expect(new Set(encontrados[0])).toEqual(expect.objectContaining({}));
    expect(encontrados[0]).toEqual(expect.arrayContaining(['26039', '26045']));
  });

  it('detecta un ciclo de tres', () => {
    const encontrados = ciclos(
      datos(['A', 'B', 'C'], [
        mov(1, 'A', 'traspaso', { lote_destino: 'B', litros: 1 }),
        mov(2, 'B', 'traspaso', { lote_destino: 'C', litros: 1 }),
        mov(3, 'C', 'traspaso', { lote_destino: 'A', litros: 1 }),
      ]),
    );
    expect(encontrados.length).toBeGreaterThan(0);
  });

  it('un grafo sin ciclos devuelve lista vacía', () => {
    expect(
      ciclos(
        datos(['26039', '26040', '26045'], [
          mov(1, '26039', 'traspaso', { lote_destino: '26045', litros: 1 }),
          mov(2, '26040', 'traspaso', { lote_destino: '26045', litros: 1 }),
        ]),
      ),
    ).toEqual([]);
  });

  it('detecta un autociclo', () => {
    expect(ciclos(datos(['X'], [mov(1, 'X', 'traspaso', { lote_destino: 'X', litros: 1 })])).length).toBeGreaterThan(0);
  });
});

describe('recorrido de vasijas', () => {
  it('encadena estadías y deja la última abierta', () => {
    const movs = [
      mov(1, '26001', 'descube', { fecha: '2026-02-09', vasija_origen: 'T120', vasija_destino: 'B225-1', litros: 1000 }),
      mov(2, '26001', 'trasiego', { fecha: '2026-05-01', vasija_origen: 'B225-1', vasija_destino: 'B225-2', litros: 980 }),
    ];
    const r = recorridoVasijas('26001', movs);
    expect(r.map((e) => e.vasija)).toEqual(['B225-1', 'B225-2']);
    expect(r[0].desde).toBe('2026-02-09');
    expect(r[0].hasta).toBe('2026-05-01');
    expect(r[1].desde).toBe('2026-05-01');
    expect(r[1].hasta).toBeNull();
  });

  it('ordena por fecha aunque lleguen desordenados', () => {
    const movs = [
      mov(2, '26001', 'trasiego', { fecha: '2026-05-01', vasija_destino: 'B2' }),
      mov(1, '26001', 'descube', { fecha: '2026-02-09', vasija_destino: 'B1' }),
    ];
    expect(recorridoVasijas('26001', movs).map((e) => e.vasija)).toEqual(['B1', 'B2']);
  });

  it('un traspaso a otro lote cierra la estadía sin abrir otra', () => {
    const movs = [
      mov(1, '26043', 'descube', { fecha: '2026-02-09', vasija_destino: 'B1' }),
      mov(2, '26043', 'traspaso', { fecha: '2026-06-01', lote_destino: '26282', litros: 675 }),
    ];
    const r = recorridoVasijas('26043', movs);
    expect(r).toHaveLength(1);
    expect(r[0].vasija).toBe('B1');
    expect(r[0].hasta).toBe('2026-06-01');
  });

  it('un traspaso CON vasija_destino tampoco abre estadía: esa vasija es la del otro lote', () => {
    // Corte + achique: el lote del corte traspasa al hijo que va al T 209;
    // el vino del corte no se mudó al T 209.
    const movs = [
      mov(1, '26323', 'trasiego', { fecha: '2026-10-14', vasija_destino: 'T 206' }),
      mov(2, '26323', 'traspaso', { fecha: '2026-10-15', vasija_destino: 'T 209', lote_destino: '26324', litros: 900 }),
      mov(3, '26323', 'salida', { fecha: '2026-10-20', vasija_destino: 'Camión' }),
    ];
    expect(recorridoVasijas('26323', movs).map((e) => e.vasija)).toEqual(['T 206']);
  });

  it('solo toma los movimientos del lote pedido', () => {
    const movs = [
      mov(1, '26001', 'descube', { fecha: '2026-02-09', vasija_destino: 'B1' }),
      mov(2, '26002', 'descube', { fecha: '2026-02-10', vasija_destino: 'OTRA' }),
    ];
    expect(recorridoVasijas('26001', movs).map((e) => e.vasija)).toEqual(['B1']);
  });

  it('incluye las vasijas "sin dato" de la migración', () => {
    const movs = [mov(1, '26001', 'trasiego', { fecha: '2026-03-01', vasija_destino: 'sin dato' })];
    expect(recorridoVasijas('26001', movs).map((e) => e.vasija)).toEqual(['sin dato']);
  });

  it('sin movimientos es lista vacía', () => {
    expect(recorridoVasijas('26001', [])).toEqual([]);
  });

  it('un movimiento sin fecha no rompe el recorrido', () => {
    const movs = [
      mov(1, '26001', 'descube', { fecha: null, vasija_destino: 'B1' }),
      mov(2, '26001', 'trasiego', { fecha: '2026-05-01', vasija_destino: 'B2' }),
    ];
    expect(recorridoVasijas('26001', movs).map((e) => e.vasija)).toEqual(['B1', 'B2']);
  });
});

describe('el relleno no es una frontera de estadía', () => {
  it('un relleno entre dos trasiegos no duplica la estadía', () => {
    const movs = [
      mov(1, '26001', 'descube', { fecha: '2026-02-09', vasija_destino: 'B225-1', litros: 1000 }),
      mov(2, '26001', 'relleno', { fecha: '2026-03-01', vasija_destino: 'B225-1', litros: 20 }),
      mov(3, '26001', 'trasiego', { fecha: '2026-04-01', vasija_origen: 'B225-1', vasija_destino: 'B225-2', litros: 980 }),
    ];
    const r = recorridoVasijas('26001', movs);
    expect(r.map((e) => e.vasija)).toEqual(['B225-1', 'B225-2']);
    expect(r[0].hasta).toBe('2026-04-01');
  });

  it('no genera entradas consecutivas iguales', () => {
    const movs = [
      mov(1, '26001', 'descube', { fecha: '2026-01-01', vasija_destino: 'V1', litros: 1000 }),
      mov(2, '26001', 'relleno', { fecha: '2026-01-15', vasija_destino: 'V1', litros: 30 }),
      mov(3, '26001', 'relleno', { fecha: '2026-02-01', vasija_destino: 'V1', litros: 15 }),
    ];
    const vasijas = recorridoVasijas('26001', movs).map((e) => e.vasija);
    for (let i = 0; i < vasijas.length - 1; i++) expect(vasijas[i]).not.toBe(vasijas[i + 1]);
  });

  it('un relleno con vasija distinta se ignora por completo', () => {
    const movs = [
      mov(1, '26001', 'descube', { fecha: '2026-02-01', vasija_destino: 'B1', litros: 500 }),
      mov(2, '26001', 'relleno', { fecha: '2026-03-01', vasija_destino: 'OTRA', litros: 10 }),
      mov(3, '26001', 'trasiego', { fecha: '2026-04-01', vasija_origen: 'B1', vasija_destino: 'B2', litros: 490 }),
    ];
    expect(recorridoVasijas('26001', movs).map((e) => e.vasija)).toEqual(['B1', 'B2']);
  });
});

describe('línea de tiempo', () => {
  it('ordena todos los eventos por fecha', () => {
    const lote = { lote: '26001', fecha_ingreso: '2026-01-28' };
    const an = [{ lote: '26001', fecha_analisis: '2026-03-15', ph: 3.3 }];
    const movs = [mov(1, '26001', 'descube', { fecha: '2026-02-09', vasija_destino: 'B1' })];
    const hist = [{ etapa: 'fml', desde: '2026-02-09', por: 'Bmax' }];
    const t = lineaTiempo(lote, an, movs, hist);
    expect(t.map((e) => e.fecha)).toEqual([...t.map((e) => e.fecha)].sort());
    expect(t[0].clase).toBe('ingreso');
    const clases = new Set(t.map((e) => e.clase));
    for (const c of ['ingreso', 'movimiento', 'analisis', 'etapa']) expect(clases).toContain(c);
  });

  it('marca la corrección de SO2 como evento propio', () => {
    const an = [
      { lote: '26001', fecha_analisis: '2026-03-15', correccion: { so2_deseado: 35, mbk_a_agregar: 12.5, ot_n: 'OT-4' } },
    ];
    const clases = new Set(lineaTiempo({ lote: '26001' }, an, [], []).map((e) => e.clase));
    expect(clases).toContain('correccion');
  });

  it('ignora una corrección vacía', () => {
    const an = [
      { lote: '26001', fecha_analisis: '2026-03-15', correccion: { so2_deseado: null, mbk_a_agregar: null, ot_n: '' } },
    ];
    const clases = new Set(lineaTiempo({ lote: '26001' }, an, [], []).map((e) => e.clase));
    expect(clases).not.toContain('correccion');
  });

  it('descarta los eventos sin fecha', () => {
    const an = [{ lote: '26001', fecha_analisis: null, ph: 3.3 }];
    expect(lineaTiempo({ lote: '26001', fecha_ingreso: null }, an, [], [])).toEqual([]);
  });

  it('solo toma análisis del lote pedido', () => {
    const an = [{ lote: '26002', fecha_analisis: '2026-03-15', ph: 3.3 }];
    expect(lineaTiempo({ lote: '26001' }, an, [], [])).toEqual([]);
  });
});

describe('el marcador -999 nunca se muestra', () => {
  const conPh = (ph: unknown, av: number) =>
    lineaTiempo({ lote: '26001' }, [{ lote: '26001', fecha_analisis: '2026-03-15', ph, av }], [], []);

  it('como entero', () => {
    const t = conPh(-999, 3.4);
    expect(t[0].detalle).not.toContain('-999');
    expect(t[0].detalle).toContain('3.4');
  });

  it('como decimal', () => {
    const t = conPh(-999.0, 4.1);
    expect(t[0].detalle).not.toContain('-999');
    expect(t[0].detalle).toContain('4.1');
  });

  it('como texto', () => {
    const t = conPh('-999', 2.8);
    expect(t[0].detalle).not.toContain('-999');
    expect(t[0].detalle).toContain('2.8');
  });

  it('pero un negativo legítimo sí se muestra', () => {
    const t = lineaTiempo({ lote: '26001' }, [{ lote: '26001', fecha_analisis: '2026-03-15', malico: -0.5 }], [], []);
    expect(t[0].detalle).toContain('-0.5');
  });
});

describe('movimientos pendientes', () => {
  it('un traspaso pendiente no dibuja arista', () => {
    // Si esto falla, el árbol muestra una relación entre lotes que no existe.
    const g = grafo({
      lotes: [{ lote: '26001' }, { lote: '26002' }],
      movimientos: [
        { lote: '26001', tipo: 'traspaso', lote_destino: '26002', fecha: '2026-03-01', litros: 500, estado: 'pendiente' },
      ],
    });
    expect(n(g, '26001').hijos).toEqual([]);
    expect(n(g, '26002').padres).toEqual([]);
  });

  it('el mismo traspaso, ejecutado, sí la dibuja', () => {
    const g = grafo({
      lotes: [{ lote: '26001' }, { lote: '26002' }],
      movimientos: [
        { lote: '26001', tipo: 'traspaso', lote_destino: '26002', fecha: '2026-03-01', litros: 500, estado: 'ejecutado' },
      ],
    });
    expect(n(g, '26001').hijos).toHaveLength(1);
    expect(n(g, '26002').padres).toHaveLength(1);
  });

  it('el recorrido de vasijas ignora los pendientes', () => {
    const movs = [
      { lote: '26001', tipo: 'trasiego', vasija_origen: 'TqA', vasija_destino: 'TqB', fecha: '2026-03-01', estado: 'pendiente' },
    ];
    expect(recorridoVasijas('26001', movs)).toEqual(recorridoVasijas('26001', []));
  });

  it('el mismo trasiego, ejecutado, sí abre estadía', () => {
    const movs = [
      { lote: '26001', tipo: 'trasiego', vasija_origen: 'TqA', vasija_destino: 'TqB', fecha: '2026-03-01', estado: 'ejecutado' },
    ];
    expect(recorridoVasijas('26001', movs).map((e) => e.vasija)).toEqual(['TqB']);
  });
});

describe('normalización del número de lote', () => {
  it('recorta y convierte a texto; null da cadena vacía', () => {
    expect(normalizarLote(' 26001 ')).toBe('26001');
    expect(normalizarLote(26001)).toBe('26001');
    expect(normalizarLote(null)).toBe('');
    expect(normalizarLote(undefined)).toBe('');
    expect(normalizarLote(0)).toBe('0'); // no '' : la fórmula es la del original
  });
});

describe('lineaTiempo: otros agregados', () => {
  it('un registro solo de agregados no es un evento de analisis, si de agregado', () => {
    const an = [{ lote: '26001', fecha_analisis: '2026-10-05',
      agregados: [{ producto: 'TH2', cantidad: 380, unidad: 'g', ot_n: 'B231' },
                  { producto: 'DAP', cantidad: 5, unidad: 'g', ot_n: 'B231', anulada: { por: 'x' } }] }];
    const t = lineaTiempo({ lote: '26001' }, an, [], []);
    expect(t).toEqual([{ fecha: '2026-10-05', clase: 'agregado', titulo: 'Agregado', detalle: 'TH2 380 g, OT B231' }]);
  });
});
