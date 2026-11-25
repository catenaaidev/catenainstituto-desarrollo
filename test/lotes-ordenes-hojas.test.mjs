import { describe, it, expect } from 'vitest';
import { TIPOS_HOJA, esTipoHoja, armarOrdenHoja, guardarOrdenHoja, ordenHojaPorId,
         marcarEjecutada, anularOrdenHoja, revertirEjecucion, revertirAnulacion, textoPendientePrevia } from '../public/lotes/js/ordenes-hojas.js';

const base = (x = {}) => armarOrdenHoja({ id: 'oh-1', tipo: 'muestras', numero: ' 0950 ', fecha: '2026-11-04',
  quien: 'Ana', ahora: '2026-11-04T10:00:00Z', lotes: ['26034', '26034', '', 26038], hoja: { filas: [] }, ...x });

describe('armarOrdenHoja', () => {
  it('arma una orden pendiente con los lotes sin repetir', () => {
    expect(base()).toEqual({
      id: 'oh-1', tipo: 'muestras', ot: '0950', fecha: '2026-11-04', estado: 'pendiente',
      emitida_por: 'Ana', emitida_el: '2026-11-04T10:00:00Z', ejecutada_por: '', ejecutada_el: '',
      anulada: null, lotes: [{ lote: '26034' }, { lote: '26038' }], hoja: { filas: [] }, registro: null, pdf: null,
    });
  });
  it('los tipos y sus series', () => {
    expect(Object.keys(TIPOS_HOJA)).toEqual(['muestras', 'micro', 'agregados']);
    expect(TIPOS_HOJA.agregados.serie).toBe('B');
    expect(TIPOS_HOJA.micro.serie).toBe('principal');
    expect(esTipoHoja('micro')).toBe(true);
    expect(esTipoHoja('traslado')).toBe(false);
  });
});

describe('guardarOrdenHoja', () => {
  it('agrega la primera y crea la sección si falta', () => {
    const d = {};
    expect(guardarOrdenHoja(d, base())).toEqual({ ok: true, reemplazo: false, id: 'oh-1' });
    expect(d.ordenes_hojas).toHaveLength(1);
  });
  it('otra pendiente con el mismo tipo y N° no se pisa: devuelve la previa sin tocar nada', () => {
    const d = { ordenes_hojas: [base()] };
    const antes = structuredClone(d);
    const res = guardarOrdenHoja(d, base({ id: 'oh-2', hoja: { filas: [1] } }));
    expect(res).toEqual({ ok: false, error: 'pendiente', previa: d.ordenes_hojas[0] });
    expect(d).toEqual(antes);
    // un reemplazarId que no es el de la previa tampoco alcanza
    expect(guardarOrdenHoja(d, base({ id: 'oh-2' }), { reemplazarId: 'oh-9' })).toMatchObject({ ok: false, error: 'pendiente' });
    expect(d).toEqual(antes);
  });
  it('con reemplazarId = la previa, la reemplaza conservando el id', () => {
    const d = { ordenes_hojas: [base()] };
    const nueva = base({ id: 'oh-2', hoja: { filas: [1] } });
    expect(guardarOrdenHoja(d, nueva, { reemplazarId: 'oh-1' })).toEqual({ ok: true, reemplazo: true, id: 'oh-1' });
    expect(d.ordenes_hojas).toHaveLength(1);
    expect(d.ordenes_hojas[0].id).toBe('oh-1');
    expect(d.ordenes_hojas[0].hoja).toEqual({ filas: [1] });
  });
  it('textoPendientePrevia: quién, cuándo y qué lotes', () => {
    const t = textoPendientePrevia({ ...base(), emitida_el: '' });
    expect(t).toMatchObject({ titulo: 'Ya hay una orden 0950 pendiente', si: 'Reemplazar', no: 'Dejar la anterior', peligro: true });
    expect(t.texto).toBe('La emitió Ana el 04/11/2026 con los lotes 26034, 26038. ¿Reemplazarla por la que acabás de imprimir?');
    expect(textoPendientePrevia({ ...base({ lotes: [] }), emitida_el: '' }).texto).toContain('con la hoja en blanco');
  });
  it('dos hojas sin N° del mismo tipo son dos órdenes distintas (no se preguntan una por la otra)', () => {
    const d = { ordenes_hojas: [base({ numero: '', tipo: 'micro' })] };
    expect(guardarOrdenHoja(d, base({ id: 'oh-2', numero: '  ', tipo: 'micro' }))).toEqual({ ok: true, reemplazo: false, id: 'oh-2' });
    expect(d.ordenes_hojas.map(o => o.id)).toEqual(['oh-1', 'oh-2']);
  });
  it('una hoja sin N° se reemplaza solo por su propio id', () => {
    const d = { ordenes_hojas: [base({ numero: '', tipo: 'micro' })] };
    const res = guardarOrdenHoja(d, base({ id: 'oh-2', numero: '', tipo: 'micro', hoja: { filas: [1] } }), { reemplazarId: 'oh-1' });
    expect(res).toEqual({ ok: true, reemplazo: true, id: 'oh-1' });
    expect(d.ordenes_hojas).toHaveLength(1);
    expect(d.ordenes_hojas[0].hoja).toEqual({ filas: [1] });
  });
  it('el mismo N° de OTRO tipo es otra orden', () => {
    const d = { ordenes_hojas: [base()] };
    guardarOrdenHoja(d, base({ id: 'oh-2', tipo: 'micro' }));
    expect(d.ordenes_hojas).toHaveLength(2);
  });
  it('no pisa una ya ejecutada; una anulada no cuenta', () => {
    const d = { ordenes_hojas: [{ ...base(), estado: 'ejecutada' }] };
    expect(guardarOrdenHoja(d, base({ id: 'oh-2' }))).toEqual({ ok: false, error: 'ejecutada' });
    const d2 = { ordenes_hojas: [{ ...base(), estado: 'anulada' }] };
    expect(guardarOrdenHoja(d2, base({ id: 'oh-2' }))).toEqual({ ok: true, reemplazo: false, id: 'oh-2' });
    expect(d2.ordenes_hojas).toHaveLength(2);
  });
});

describe('marcarEjecutada', () => {
  it('cierra una pendiente con quién y cuándo', () => {
    const d = { ordenes_hojas: [base()] };
    expect(marcarEjecutada(d, 'oh-1', { quien: 'Luis', cuando: '2026-11-05T09:00:00Z' })).toMatchObject({ ok: true });
    expect(ordenHojaPorId(d, 'oh-1')).toMatchObject({ estado: 'ejecutada', ejecutada_por: 'Luis', ejecutada_el: '2026-11-05T09:00:00Z' });
  });
  it('una sola vez', () => {
    const d = { ordenes_hojas: [base()] };
    marcarEjecutada(d, 'oh-1', { quien: 'Luis', cuando: 'x' });
    expect(marcarEjecutada(d, 'oh-1', { quien: 'Luis', cuando: 'y' })).toEqual({ ok: false, error: 'no-pendiente' });
    expect(marcarEjecutada(d, 'nada', { quien: 'Luis', cuando: 'y' })).toEqual({ ok: false, error: 'no-existe' });
  });
  it('agregados: registra en análisis exactamente lo guardado al imprimir', () => {
    const registro = [{ lote: '26034', fecha: '2026-11-04',
      items: [{ producto: 'TH2', cantidad: 30, unidad: 'g', dosis_vasija: 10, litros_ref: 225, vasijas: 3 }] }];
    const d = { analisis: [], ordenes_hojas: [base({ tipo: 'agregados', numero: 'B250', registro })] };
    marcarEjecutada(d, 'oh-1', { quien: 'Luis', cuando: '2026-11-05T09:00:00Z' });
    const a = d.analisis.find((x) => x.lote === '26034');
    expect(a.agregados).toHaveLength(1);
    expect(a.agregados[0]).toMatchObject({ producto: 'TH2', cantidad: 30, unidad: 'g', ot_n: 'B250',
      registrado_por: 'Luis', dosis_vasija: 10, litros_ref: 225, vasijas: 3 });
  });
  it('agregados: dos entradas del mismo lote y fecha se juntan (no se pisan)', () => {
    const registro = [
      { lote: '26034', fecha: '2026-11-04', items: [{ producto: 'TH2', cantidad: 30, unidad: 'g' }] },
      { lote: '26034', fecha: '2026-11-04', items: [{ producto: 'Quitosano', cantidad: 10, unidad: 'g' }] },
    ];
    const d = { analisis: [], ordenes_hojas: [base({ tipo: 'agregados', numero: 'B251', registro })] };
    marcarEjecutada(d, 'oh-1', { quien: 'Luis', cuando: '2026-11-05T09:00:00Z' });
    const a = d.analisis.find((x) => x.lote === '26034');
    expect(a.agregados).toHaveLength(2);
    expect(a.agregados).toContainEqual(expect.objectContaining({ producto: 'TH2', ot_n: 'B251' }));
    expect(a.agregados).toContainEqual(expect.objectContaining({ producto: 'Quitosano', ot_n: 'B251' }));
  });
  it('muestras: no toca análisis', () => {
    const d = { analisis: [], ordenes_hojas: [base()] };
    marcarEjecutada(d, 'oh-1', { quien: 'Luis', cuando: 'x' });
    expect(d.analisis).toEqual([]);
  });
});

describe('anularOrdenHoja', () => {
  it('anula una pendiente (no se borra) y no registra nada', () => {
    const d = { analisis: [], ordenes_hojas: [base({ tipo: 'agregados', registro: [{ lote: '1', fecha: 'f', items: [{ producto: 'X', cantidad: 1, unidad: 'g' }] }] })] };
    expect(anularOrdenHoja(d, 'oh-1', { quien: 'Luis', cuando: 'z' })).toMatchObject({ ok: true });
    expect(ordenHojaPorId(d, 'oh-1')).toMatchObject({ estado: 'anulada', anulada: { por: 'Luis', en: 'z' } });
    expect(d.analisis).toEqual([]);
    expect(anularOrdenHoja(d, 'oh-1', { quien: 'Luis', cuando: 'z' })).toEqual({ ok: false, error: 'no-pendiente' });
  });
});

describe('revertir si falla el guardado', () => {
  it('revertirEjecucion: la orden vuelve a pendiente y Análisis queda como antes', () => {
    const previa = { lote: '26034', fecha_analisis: '2026-11-04', ph: 3.6,
      agregados: [{ producto: 'Tanino', cantidad: 5, unidad: 'g', ot_n: 'B100' }] };
    const registro = [
      { lote: '26034', fecha: '2026-11-04', items: [{ producto: 'TH2', cantidad: 30, unidad: 'g' }] },
      { lote: '26038', fecha: '2026-11-04', items: [{ producto: 'Quitosano', cantidad: 10, unidad: 'g' }] },
    ];
    const d = { analisis: [structuredClone(previa)], ordenes_hojas: [base({ tipo: 'agregados', numero: 'B250', registro })] };
    const res = marcarEjecutada(d, 'oh-1', { quien: 'Luis', cuando: '2026-11-05T09:00:00Z' });
    expect(d.analisis).toHaveLength(2);
    revertirEjecucion(d, 'oh-1', res.deshacer);
    expect(ordenHojaPorId(d, 'oh-1')).toMatchObject({ estado: 'pendiente', ejecutada_por: '', ejecutada_el: '' });
    expect(d.analisis).toEqual([previa]);
  });
  it('revertirEjecucion sobre el documento fusionado (otros objetos) también deshace', () => {
    const registro = [{ lote: '26034', fecha: '2026-11-04', items: [{ producto: 'TH2', cantidad: 30, unidad: 'g' }] }];
    const d = { analisis: [], ordenes_hojas: [base({ tipo: 'agregados', numero: 'B250', registro })] };
    const res = marcarEjecutada(d, 'oh-1', { quien: 'Luis', cuando: 'x' });
    const fusionado = structuredClone(d);
    revertirEjecucion(fusionado, 'oh-1', res.deshacer);
    expect(fusionado.analisis).toEqual([]);
    expect(ordenHojaPorId(fusionado, 'oh-1').estado).toBe('pendiente');
  });
  it('revertirAnulacion: la orden vuelve a pendiente', () => {
    const d = { ordenes_hojas: [base()] };
    const res = anularOrdenHoja(d, 'oh-1', { quien: 'Luis', cuando: 'z' });
    revertirAnulacion(d, 'oh-1', res.deshacer);
    expect(ordenHojaPorId(d, 'oh-1')).toMatchObject({ estado: 'pendiente', anulada: null });
    expect(marcarEjecutada(d, 'oh-1', { quien: 'Luis', cuando: 'y' })).toMatchObject({ ok: true });
  });
});
