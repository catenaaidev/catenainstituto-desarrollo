/**
 * La capa de altas a mano y su deshacer.
 *
 * Va en .mjs y no en .ts a propósito, igual que `barriles-pendientes.test.mjs`:
 * `tsconfig.json` solo incluye `test/**\/*.ts`, y este archivo importa un .js sin
 * declaraciones de tipos. No lo pases a .ts.
 *
 * El import es por efecto: `altas.js` se carga como <script> clásico en la
 * página, así que no exporta nada — se cuelga del objeto global.
 */

import { describe, it, expect } from 'vitest';
import '../public/barriles/js/altas.js';

const { resolverAltas, fusionarAltas, agruparTandas, marcarTandaBorrada, usoDeVasijas } = globalThis;

// Un alta como la que arma `confirmarAlta()`, con lo mínimo para las pruebas.
const alta = (num, extra = {}) => ({
  num: String(num), cap: '225', estado: 'VACIO', marca: '', lote: 'X', cosecha: '2026',
  litros: '', creadoEl: '2026-09-23', tanda: 't1', ts: 1000, ...extra,
});

describe('resolverAltas', () => {
  it('sin lápidas están todas vivas y no hay nada que podar', () => {
    const r = resolverAltas([alta(101), alta(102)]);
    expect(r.vivas.map(a => a.num)).toEqual(['101', '102']);
    expect([...r.tapiadas]).toEqual([]);
  });

  it('una entrada con lápida sale de las vivas y su número queda para podar', () => {
    const r = resolverAltas([alta(101, { borrado: true, borradoTs: 2000 }), alta(102)]);
    expect(r.vivas.map(a => a.num)).toEqual(['102']);
    expect([...r.tapiadas]).toEqual(['101']);
  });

  // El caso central: cargar 50 con el lote equivocado, deshacer, y volver a
  // cargar los MISMOS números bien. El alta nueva tiene que ganarle a la lápida.
  it('un alta posterior a la lápida revive el número', () => {
    const r = resolverAltas([
      alta(101, { tanda: 't1', ts: 1000, borrado: true, borradoTs: 2000, lote: 'MAL' }),
      alta(101, { tanda: 't2', ts: 3000, lote: 'BIEN' }),
    ]);
    expect(r.vivas.map(a => a.lote)).toEqual(['BIEN']);
    expect([...r.tapiadas]).toEqual([]);   // hay fila viva: no se poda nada
  });

  // Al revés que el anterior: la lápida es más nueva que el alta que revive.
  // Pasa cuando llega por fusión una tanda vieja que ya se había deshecho.
  it('una lápida posterior al alta la tapa igual', () => {
    const r = resolverAltas([
      alta(101, { tanda: 't1', ts: 3000 }),
      alta(101, { tanda: 't2', ts: 1000, borrado: true, borradoTs: 4000 }),
    ]);
    expect(r.vivas).toEqual([]);
    expect([...r.tapiadas]).toEqual(['101']);
  });

  it('las altas viejas sin ts se comportan como siempre', () => {
    const r = resolverAltas([{ num: '101', creadoEl: '2026-09-01' }]);
    expect(r.vivas.map(a => a.num)).toEqual(['101']);
    expect([...r.tapiadas]).toEqual([]);
  });

  it('aguanta nulos y listas vacías', () => {
    expect(resolverAltas(null).vivas).toEqual([]);
    expect([...resolverAltas(undefined).tapiadas]).toEqual([]);
  });
});

describe('fusionarAltas', () => {
  it('sube las altas locales que el servidor no tiene', () => {
    const serv = [alta(101)];
    const r = fusionarAltas(serv, [alta(101), alta(102, { tanda: 't2' })]);
    expect(r.map(a => a.num)).toEqual(['101', '102']);
  });

  // Esto es lo que antes no podía pasar: la fusión vieja descartaba lo local
  // cuando el número ya figuraba arriba, así que un borrado hecho en el celular
  // no llegaba nunca y el servidor lo resucitaba en el sync siguiente.
  it('la lápida local viaja al servidor', () => {
    const serv = [alta(101)];
    fusionarAltas(serv, [alta(101, { borrado: true, borradoTs: 2000 })]);
    expect(serv[0].borrado).toBe(true);
    expect(serv[0].borradoTs).toBe(2000);
  });

  it('la lápida del servidor no la pisa un local que todavía no se enteró', () => {
    const serv = [alta(101, { borrado: true, borradoTs: 2000 })];
    fusionarAltas(serv, [alta(101)]);
    expect(serv[0].borrado).toBe(true);
  });

  // Dos celulares deshaciendo y recargando en distinto orden tienen que terminar
  // en el mismo lugar, sin importar quién sincroniza primero.
  it('converge igual en los dos órdenes', () => {
    const vieja = alta(101, { tanda: 't1', ts: 1000, borrado: true, borradoTs: 2000, lote: 'MAL' });
    const nueva = alta(101, { tanda: 't2', ts: 3000, lote: 'BIEN' });
    const unOrden = resolverAltas(fusionarAltas([{ ...vieja }], [{ ...nueva }]));
    const otroOrden = resolverAltas(fusionarAltas([{ ...nueva }], [{ ...vieja }]));
    expect(unOrden.vivas.map(a => a.lote)).toEqual(['BIEN']);
    expect(otroOrden.vivas.map(a => a.lote)).toEqual(['BIEN']);
    expect([...unOrden.tapiadas]).toEqual([...otroOrden.tapiadas]);
  });

  it('el dato más nuevo por tanda le gana al viejo', () => {
    const serv = [alta(101, { ts: 1000, lote: 'VIEJO' })];
    fusionarAltas(serv, [alta(101, { ts: 5000, lote: 'NUEVO' })]);
    expect(serv[0].lote).toBe('NUEVO');
  });

  // Las tandas distintas no se pisan aunque compartan el número: si se unieran
  // por número a secas, el alta que revive se comería la lápida de la anterior.
  it('dos tandas del mismo número conviven', () => {
    const r = fusionarAltas([alta(101, { tanda: 't1' })], [alta(101, { tanda: 't2' })]);
    expect(r.length).toBe(2);
  });

  it('aguanta que un lado no exista', () => {
    expect(fusionarAltas(null, [alta(101)]).map(a => a.num)).toEqual(['101']);
    expect(fusionarAltas([alta(101)], null).map(a => a.num)).toEqual(['101']);
  });
});

describe('agruparTandas', () => {
  it('junta por id de tanda y cuenta las vasijas', () => {
    const t = agruparTandas([alta(101), alta(102), alta(201, { tanda: 't2', ts: 2000 })]);
    expect(t.length).toBe(2);
    expect(t[0].id).toBe('t2');            // la más nueva primero
    expect(t[1].cuantas).toBe(2);
    expect(t[1].nums).toEqual(['101', '102']);
  });

  it('no lista las tandas ya deshechas', () => {
    const t = agruparTandas([alta(101, { borrado: true, borradoTs: 2000 })]);
    expect(t).toEqual([]);
  });

  // Las altas cargadas antes de este cambio no tienen id de tanda. Se agrupan por
  // día y se marcan como tales, porque un día puede juntar dos cargas distintas.
  it('agrupa por día las altas viejas y las marca de legado', () => {
    const t = agruparTandas([
      { num: '101', creadoEl: '2026-09-01', lote: 'A' },
      { num: '102', creadoEl: '2026-09-01', lote: 'A' },
    ]);
    expect(t.length).toBe(1);
    expect(t[0].legado).toBe(true);
    expect(t[0].cuantas).toBe(2);
  });

  it('el rango va del primer al último número de la tanda', () => {
    const t = agruparTandas([alta(101), alta(102), alta(103)]);
    expect(t[0].desde).toBe('101');
    expect(t[0].hasta).toBe('103');
  });
});

describe('marcarTandaBorrada', () => {
  it('le pone lápida a las vasijas de esa tanda y no toca las otras', () => {
    const r = marcarTandaBorrada([alta(101), alta(201, { tanda: 't2' })], 't1', 9000);
    expect(r.marcadas).toBe(1);
    expect(r.altas[0].borrado).toBe(true);
    expect(r.altas[0].borradoTs).toBe(9000);
    expect(r.altas[1].borrado).toBeUndefined();
  });

  it('no modifica el array original', () => {
    const original = [alta(101)];
    marcarTandaBorrada(original, 't1', 9000);
    expect(original[0].borrado).toBeUndefined();
  });

  it('deshace una tanda de legado por día', () => {
    const viejas = [
      { num: '101', creadoEl: '2026-09-01' },
      { num: '102', creadoEl: '2026-09-02' },
    ];
    const r = marcarTandaBorrada(viejas, 'dia:2026-09-01', 9000);
    expect(r.marcadas).toBe(1);
    expect(r.altas[0].borrado).toBe(true);
    expect(r.altas[1].borrado).toBeUndefined();
  });

  it('una tanda que no existe no marca nada', () => {
    expect(marcarTandaBorrada([alta(101)], 'tX', 9000).marcadas).toBe(0);
  });
});

describe('usoDeVasijas', () => {
  const colecciones = {
    boxes: [{ celdas: { '1-1-1': '101', '1-1-2': 'HUECO' } }],
    palets: [{ celdas: { 3: '102' } }],
    tanques: [{ num: '103', lote: 'L' }],
    escaneos: [{ id: 'o1', codigos: ['104'] }],
  };

  it('no devuelve nada si ninguna está en uso', () => {
    expect(usoDeVasijas(['900', '901'], colecciones)).toEqual([]);
  });

  it('encuentra la que está puesta en una celda del mapa', () => {
    expect(usoDeVasijas(['101'], colecciones)).toEqual([{ num: '101', motivos: ['en el mapa'] }]);
  });

  it('encuentra las de palets, tanques y escáner', () => {
    const r = usoDeVasijas(['102', '103', '104'], colecciones);
    expect(r.map(x => x.num)).toEqual(['102', '103', '104']);
    expect(r.map(x => x.motivos[0])).toEqual(['en un palet', 'asociada a un lote', 'escaneada']);
  });

  it('junta los motivos de una misma vasija', () => {
    const r = usoDeVasijas(['101'], { ...colecciones, tanques: [{ num: '101' }] });
    expect(r[0].motivos).toEqual(['en el mapa', 'asociada a un lote']);
  });

  it('no confunde HUECO con un número de vasija', () => {
    expect(usoDeVasijas(['HUECO'], colecciones)).toEqual([]);
  });

  it('aguanta colecciones ausentes', () => {
    expect(usoDeVasijas(['101'], {})).toEqual([]);
  });
});
