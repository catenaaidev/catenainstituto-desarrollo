/* Tests de la Orden de correccion guardada (copia de lo impreso). */
import { describe, it, expect } from 'vitest';
import { modoPorDefecto, armarOrdenGuardada, lotesPendientes, analisisPosterior, unidadDe,
         entradasDeEjecucion, escribirEjecucion, revertirEjecucion, anularOrden, revertirAnulacionOrden,
         filasDeGuardada, modoDeGuardada, textosPapelGuardado }
  from '../public/lotes/js/orden-correccion-guardada.js';
import { filasPapelPorModo, INSTRUCCIONES_SOLUCION } from '../public/lotes/js/orden-correccion-papel.js';

const barr = (num, litros = 225, cap = 225) => ({ num, vasija: '', cap, estado: 'LLENO', litros_usados: litros });
/* Filas como las arma _ocBuildRows: una de lote y una por barrica. */
function filasDe(lote, so2, objetivo, barricas){
  const dif = objetivo - so2;
  const dosis = b => ({ mbk_g: dif * b.litros_usados * 1.5 / 1000 * 2, ml_solucion: dif * b.litros_usados * 1.5 / 55 });
  const ds = barricas.map(dosis);
  return [
    { tipo: 'lote', lote: { lote, variedad: 'Malbec', so2_libre: so2, barricas }, objetivo, diferencia: dif,
      mbk_total_g: ds.reduce((s, d) => s + d.mbk_g, 0), ml_total: ds.reduce((s, d) => s + d.ml_solucion, 0) },
    ...barricas.map((b, i) => ({ tipo: 'barrica', lote: { lote }, barrica: b, dosis: ds[i] })),
  ];
}
const enc = { id: 'oc-1', numero: 'B230', fecha: '2026-11-02', emitio: 'Oriana', recibio: '',
              unidad: 'sol', quien: 'oriana@x', ahora: '2026-11-02T10:00:00Z' };

describe('modoPorDefecto', () => {
  it('generica si todas son barricas iguales', () => {
    expect(modoPorDefecto([barr('1'), barr('2'), barr('3')])).toBe('generica');
  });
  it('por barril si cambian los litros o la capacidad', () => {
    expect(modoPorDefecto([barr('1'), barr('2', 180)])).toBe('barril');
    expect(modoPorDefecto([barr('1'), barr('2', 50, 50)])).toBe('barril');
  });
  it('por barril si mezcla barricas con una vasija sin numero', () => {
    expect(modoPorDefecto([barr('1'), { num: '', vasija: 'T 201', cap: null, litros_usados: 900 }])).toBe('barril');
  });
  it('una sola vasija (o ninguna) es generica', () => {
    expect(modoPorDefecto([{ num: '', vasija: 'T 201', cap: null, litros_usados: 900 }])).toBe('generica');
    expect(modoPorDefecto([])).toBe('generica');
  });
});

describe('armarOrdenGuardada', () => {
  const filas = [...filasDe('26001', 18, 35, [barr('11'), barr('12')]),
                 ...filasDe('26014', 21, 35, [barr('21'), barr('22', 180)])];

  it('copia lote, objetivo vigente y dosis de cada vasija tal cual', () => {
    const o = armarOrdenGuardada({ ...enc, filas, modos: new Map() });
    expect(o).toMatchObject({ id: 'oc-1', numero: 'B230', fecha: '2026-11-02', emitio: 'Oriana',
      unidad: 'sol', estado: 'pendiente', ejecucion: null, anulada: null,
      creada_por: 'oriana@x', creada_en: '2026-11-02T10:00:00Z' });
    expect(o.lotes.map(l => l.lote)).toEqual(['26001', '26014']);
    const l = o.lotes[0];
    expect(l).toMatchObject({ variedad: 'Malbec', so2_libre: 18, objetivo: 35, diferencia: 17 });
    expect(l.vasijas).toHaveLength(2);
    expect(l.vasijas[0]).toEqual({ num: '11', vasija: '', cap: 225, litros: 225,
      mbk_g: filas[1].dosis.mbk_g, ml: filas[1].dosis.ml_solucion });
    expect(l.ml_total).toBeCloseTo(filas[0].ml_total, 6);
  });

  it('modo: el elegido a mano manda; si no, el por defecto', () => {
    const o = armarOrdenGuardada({ ...enc, filas, modos: new Map([['26001', 'barril']]) });
    expect(o.lotes[0].modo).toBe('barril');
    expect(o.lotes[1].modo).toBe('barril');   // 225 y 180 L: por defecto por barril
    const o2 = armarOrdenGuardada({ ...enc, filas, modos: new Map([['26014', 'generica']]) });
    expect(o2.lotes[0].modo).toBe('generica');
    expect(o2.lotes[1].modo).toBe('generica');
  });

  it('unidad desconocida cae en solucion y el numero se recorta', () => {
    const o = armarOrdenGuardada({ ...enc, numero: ' B230 ', unidad: 'x', filas, modos: new Map() });
    expect(o.unidad).toBe('sol');
    expect(o.numero).toBe('B230');
  });
});

describe('lotesPendientes', () => {
  it('solo las pendientes, lote -> numero', () => {
    const m = lotesPendientes([
      { numero: 'B230', estado: 'pendiente', lotes: [{ lote: '26001' }, { lote: '26014' }] },
      { numero: 'B231', estado: 'ejecutada', lotes: [{ lote: '26020' }] },
      { numero: 'B232', estado: 'anulada', lotes: [{ lote: '26021' }] },
    ]);
    expect([...m]).toEqual([['26001', 'B230'], ['26014', 'B230']]);
  });
  it('sin lista no rompe', () => {
    expect(lotesPendientes(undefined).size).toBe(0);
  });
});

describe('analisisPosterior', () => {
  const orden = { fecha: '2026-10-28', lotes: [{ lote: '26001' }, { lote: '26014' }] };
  it('el ultimo analisis con SO2 posterior a la orden, por lote', () => {
    const m = analisisPosterior(orden, [
      { lote: '26001', fecha_analisis: '2026-10-28', so2_libre: 20 },   // mismo dia: no
      { lote: '26001', fecha_analisis: '2026-10-30', so2_libre: 28 },
      { lote: '26001', fecha_analisis: '2026-10-29', so2_libre: 25 },
      { lote: '26014', fecha_analisis: '2026-11-01', so2_libre: -999 }, // sin dato
      { lote: '26014', fecha_analisis: '2026-11-01', correccion: {} },  // solo correccion
      { lote: '26099', fecha_analisis: '2026-11-01', so2_libre: 30 },   // otro lote
    ]);
    expect([...m]).toEqual([['26001', { fecha: '2026-10-30', so2_libre: 28 }]]);
  });
});

describe('unidadDe', () => {
  const v = { mbk_g: 11.475, ml: 104.318 };
  const l = { mbk_total_g: 22.95, ml_total: 208.6 };
  it('solucion en mL con 1 decimal', () => {
    const u = unidadDe({ unidad: 'sol' });
    expect([u.suf, u.dec, u.de(v), u.total(l)]).toEqual(['mL', 1, 104.318, 208.6]);
  });
  it('MBK en g con 2 decimales', () => {
    const u = unidadDe({ unidad: 'mbk' });
    expect([u.suf, u.dec, u.de(v), u.total(l)]).toEqual(['g', 2, 11.475, 22.95]);
  });
});

function ordenDePrueba(){
  const filas = [...filasDe('26001', 18, 35, [barr('11'), barr('12')]),
                 ...filasDe('26014', 21, 35, [barr('21'), barr('22', 180), barr('23')])];
  return armarOrdenGuardada({ ...enc, filas, modos: new Map([['26001', 'generica'], ['26014', 'barril']]) });
}

describe('entradasDeEjecucion', () => {
  it('sin tildes no hay nada que registrar', () => {
    const r = entradasDeEjecucion(ordenDePrueba(), new Map(), '2026-11-03');
    expect(r).toEqual({ entradas: [], hechos: [] });
  });

  it('generica: un tilde registra todas las vasijas del lote', () => {
    const o = ordenDePrueba();
    const r = entradasDeEjecucion(o, new Map([['26001', new Set([0])]]), '2026-11-03');
    expect(r.entradas).toHaveLength(1);
    const c = r.entradas[0].correccion;
    expect(c).toMatchObject({ so2_libre_actual: 18, so2_deseado: 35, diferencia: 17,
                              ot_n: 'B230', fecha: '2026-11-03' });
    expect(c.ml_exactos).toBeCloseTo(o.lotes[0].ml_total, 6);
    expect(c.mbk_a_agregar).toBeCloseTo(o.lotes[0].mbk_total_g, 6);
    expect(r.hechos).toEqual([{ lote: '26001', vasijas: ['11', '12'],
      mbk_g: c.mbk_a_agregar, ml: c.ml_exactos }]);
  });

  it('por barril: registra la suma de lo tildado, nada mas', () => {
    const o = ordenDePrueba();
    const v = o.lotes[1].vasijas;
    const r = entradasDeEjecucion(o, new Map([['26014', new Set([2, 0])]]), '2026-11-03');
    expect(r.hechos[0].vasijas).toEqual(['21', '23']);
    expect(r.entradas[0].correccion.ml_exactos).toBeCloseTo(v[0].ml + v[2].ml, 6);
    expect(r.entradas[0].correccion.mbk_a_agregar).toBeCloseTo(v[0].mbk_g + v[2].mbk_g, 6);
  });

  it('una vasija sin numero se anota por su nombre', () => {
    const filas = filasDe('25306', 20, 40, [{ num: '', vasija: 'T 201', cap: null, litros_usados: 900 }]);
    const o = armarOrdenGuardada({ ...enc, filas, modos: new Map() });
    const r = entradasDeEjecucion(o, new Map([['25306', new Set([0])]]), '2026-11-03');
    expect(r.hechos[0].vasijas).toEqual(['T 201']);
  });

  it('una dosis no finita no se registra (el lote vuelve a la orden)', () => {
    const o = ordenDePrueba();
    o.lotes[0].vasijas[0].ml = NaN;
    const r = entradasDeEjecucion(o, new Map([['26001', new Set([0])]]), '2026-11-03');
    expect(r.entradas).toEqual([]);
  });

  it('una dosis null (NaN que paso por JSON) tampoco se registra', () => {
    const o = ordenDePrueba();
    o.lotes[0].vasijas[0].ml = null;   // Number(null) es 0, no NaN: el guard tiene que mirar antes de sumar
    const r = entradasDeEjecucion(o, new Map([['26001', new Set([0])]]), '2026-11-03');
    expect(r.entradas).toEqual([]);
  });
});

describe('escribirEjecucion / revertirEjecucion', () => {
  const datosCon = o => ({ analisis: [{ lote: '26001', fecha_analisis: '2026-10-25', so2_libre: 18 }],
                           ordenes_correccion: [o] });

  it('escribe la correccion en analisis y deja la orden ejecutada', () => {
    const o = ordenDePrueba();
    const d = datosCon(o);
    const r = escribirEjecucion(d, 'oc-1', { tildes: new Map([['26001', new Set([0])]]),
      fecha: '2026-11-03', quien: 'juan', ahora: '2026-11-03T12:00:00Z' });
    expect(r.ok).toBe(true);
    expect(d.analisis).toHaveLength(2);
    expect(d.analisis[1]).toMatchObject({ lote: '26001', fecha_analisis: '2026-11-03',
      correccion: { ot_n: 'B230' } });
    expect(o.estado).toBe('ejecutada');
    expect(o.ejecucion).toMatchObject({ fecha: '2026-11-03', por: 'juan', en: '2026-11-03T12:00:00Z' });
    expect(o.ejecucion.hechos.map(h => h.lote)).toEqual(['26001']);
  });

  it('revertir deja todo como estaba', () => {
    const o = ordenDePrueba();
    const d = datosCon(o);
    const antes = JSON.stringify(d);
    const r = escribirEjecucion(d, 'oc-1', { tildes: new Map([['26014', new Set([1])]]), fecha: '2026-11-03' });
    revertirEjecucion(d, 'oc-1', r.snaps);
    expect(JSON.stringify(d)).toBe(antes);
  });

  it('revertir tambien funciona sobre otro documento (despues de un 409 que fusiono)', () => {
    const o = ordenDePrueba();
    const d = datosCon(o);
    const r = escribirEjecucion(d, 'oc-1', { tildes: new Map([['26001', new Set([0])]]), fecha: '2026-11-03' });
    const fusionado = JSON.parse(JSON.stringify(d));
    revertirEjecucion(fusionado, 'oc-1', r.snaps);
    expect(fusionado.analisis).toHaveLength(1);
    expect(fusionado.ordenes_correccion[0]).toMatchObject({ estado: 'pendiente', ejecucion: null });
  });

  it('no ejecuta dos veces ni sin tildes', () => {
    const o = ordenDePrueba();
    const d = datosCon(o);
    expect(escribirEjecucion(d, 'oc-1', { tildes: new Map(), fecha: '2026-11-03' }).ok).toBe(false);
    escribirEjecucion(d, 'oc-1', { tildes: new Map([['26001', new Set([0])]]), fecha: '2026-11-03' });
    const otra = escribirEjecucion(d, 'oc-1', { tildes: new Map([['26014', new Set([0])]]), fecha: '2026-11-03' });
    expect(otra).toEqual({ ok: false, motivo: 'La orden B230 ya no está pendiente.' });
    expect(escribirEjecucion(d, 'no-existe', { tildes: new Map(), fecha: '2026-11-03' }).ok).toBe(false);
  });
});

describe('anularOrden / revertirAnulacionOrden', () => {
  it('anula solo una pendiente, sin borrarla', () => {
    const o = ordenDePrueba();
    const d = { analisis: [], ordenes_correccion: [o] };
    expect(anularOrden(d, 'oc-1', 'oriana', '2026-11-03')).toBe(true);
    expect(d.ordenes_correccion).toHaveLength(1);
    expect(o).toMatchObject({ estado: 'anulada', anulada: { por: 'oriana', fecha: '2026-11-03' } });
    expect(anularOrden(d, 'oc-1', 'oriana', '2026-11-03')).toBe(false);
    revertirAnulacionOrden(d, 'oc-1');
    expect(o).toMatchObject({ estado: 'pendiente', anulada: null });
  });
});

/* La garantia central del subsistema: lo que sale en el papel, lo que queda
 * guardado en la orden y lo que se registra al ejecutar tienen que ser EL
 * MISMO numero, en las dos unidades. Las tres rutas de calculo son
 * independientes (papel via filasPapelPorModo/gruposPorLote, guardado via
 * armarOrdenGuardada, ejecucion via entradasDeEjecucion), asi que esto no es
 * redundante con los tests de arriba: cubre que no diverjan entre si. */
describe('papel == guardado == ejecutado (las tres unidades de medida)', () => {
  // '26001' queda generica (dos barricas iguales); '26014' por barril (litros
  // distintos). El objetivo de cada lote es el que se "piso" en pantalla, no
  // necesariamente el que mandaria el servidor: eso no cambia la equivalencia,
  // porque las tres rutas parten de las mismas filas ya resueltas.
  const filas = [...filasDe('26001', 18, 35, [barr('11'), barr('12')]),
                 ...filasDe('26014', 21, 40, [barr('21'), barr('22', 180)])];
  const modos = new Map([['26001', 'generica'], ['26014', 'barril']]);
  const modoDe = lote => modos.get(lote.lote) || 'generica';

  const UNI_PAPEL = {
    sol: { prod: 'Sol1030', dec: 1, de: d => d.ml_solucion, suf: 'mL' },
    mbk: { prod: 'MBK', dec: 2, de: d => d.mbk_g, suf: 'g' },
  };
  // Mismo accesor pero sobre la forma GUARDADA (vasijas de armarOrdenGuardada),
  // que usa otros nombres de campo ('ml', no 'ml_solucion').
  const UNI_GUARDADO = { sol: v => v.ml, mbk: v => v.mbk_g };

  function totalesPapelPorLote(u){
    const totales = new Map();
    for (const g of filasPapelPorModo(filas, modoDe, u))
      totales.set(g.lote.lote, (totales.get(g.lote.lote) || 0) + g.dosis * g.cantidad);
    return totales;
  }

  for (const unidad of ['sol', 'mbk']){
    it('unidad ' + unidad + ': papel, guardado y ejecucion coinciden por lote', () => {
      const papel = totalesPapelPorLote(UNI_PAPEL[unidad]);
      const de = UNI_GUARDADO[unidad];
      const orden = armarOrdenGuardada({ ...enc, unidad, filas, modos });

      for (const l of orden.lotes){
        const guardado = l.vasijas.reduce((s, v) => s + de(v), 0);
        expect(guardado).toBeCloseTo(papel.get(l.lote), 6);
      }

      // Ejecutar con todo tildado: lo registrado tiene que sumar lo mismo.
      const tildes = new Map(orden.lotes.map(l => [l.lote, new Set(l.vasijas.map((_, i) => i))]));
      const r = entradasDeEjecucion(orden, tildes, '2026-11-03');
      expect(r.entradas).toHaveLength(orden.lotes.length);
      for (const l of orden.lotes){
        const e = r.entradas.find(x => x.lote === l.lote);
        const registrado = unidad === 'mbk' ? e.correccion.mbk_a_agregar : e.correccion.ml_exactos;
        expect(registrado).toBeCloseTo(papel.get(l.lote), 6);
      }
    });
  }
});

/* Ver una orden desde Pendientes / Historial: se redibuja el papel que se
 * imprimio, con los mismos renglones, dosis, titulo e instrucciones. */
describe('papel de una orden guardada', () => {
  const filas = [...filasDe('26001', 18, 35, [barr('11'), barr('12'), barr('13', 180)]),
                 ...filasDe('26014', 21, 35, [barr('21'), { num: '', vasija: 'T 201', cap: null, litros_usados: 900 }])];
  const modos = new Map([['26001', 'generica'], ['26014', 'barril']]);
  const u = { de: d => d.ml_solucion };
  const renglon = g => ({ lote: g.lote.lote, barril: g.barril, num: g.num || '', cap: g.cap, vasija: g.vasija,
                          litros: g.litros, cantidad: g.cantidad, dosis: g.dosis });

  it('los renglones son los mismos que los del papel impreso', () => {
    const o = armarOrdenGuardada({ ...enc, filas, modos });
    const impreso = filasPapelPorModo(filas, l => modos.get(l.lote), u).map(renglon);
    const visto = filasPapelPorModo(filasDeGuardada(o), modoDeGuardada(o), u).map(renglon);
    expect(visto).toEqual(impreso);
    expect(visto.length).toBe(4);   // 26001: 2 iguales + 1 de 180 L; 26014: 2 por barril
  });

  it('en MBK la dosis es la de MBK', () => {
    const o = armarOrdenGuardada({ ...enc, unidad: 'mbk', filas, modos });
    const um = { de: d => d.mbk_g };
    const visto = filasPapelPorModo(filasDeGuardada(o), modoDeGuardada(o), um);
    expect(visto[0].dosis).toBeCloseTo(filas[1].dosis.mbk_g, 6);
  });

  it('guarda el titulo y las instrucciones tal como se imprimieron', () => {
    const o = armarOrdenGuardada({ ...enc, filas, modos, titulo: 'Corrección urgente', instrucciones: 'Medir antes.' });
    expect(textosPapelGuardado(o)).toEqual({ titulo: 'Corrección urgente', instrucciones: 'Medir antes.' });
  });

  it('instrucciones borradas en el papel siguen borradas', () => {
    const o = armarOrdenGuardada({ ...enc, filas, modos, titulo: 'T', instrucciones: '' });
    expect(textosPapelGuardado(o).instrucciones).toBe('');
  });

  it('una orden vieja (sin textos guardados) usa los de siempre', () => {
    const o = armarOrdenGuardada({ ...enc, filas, modos });
    delete o.titulo; delete o.instrucciones;
    expect(textosPapelGuardado(o)).toEqual({ titulo: 'Orden de corrección de SO₂', instrucciones: INSTRUCCIONES_SOLUCION });
    expect(textosPapelGuardado({ ...o, unidad: 'mbk' }).instrucciones).toBe('');
  });
});
