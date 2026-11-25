/* Tests de ot-editar.js: editar una OT pendiente actualiza la OT y sus
 * movimientos sin perder lo que sigue igual. */
import { describe, it, expect } from 'vitest';
import { armarOT, movimientosDeOT } from '../public/lotes/js/ot-armado.js';
import { aplicarEdicionOT, conOtras, filasManuales, clasificarFila, lotesConFilas } from '../public/lotes/js/ot-editar.js';
import { etiquetaPdf } from '../public/lotes/js/ot-pdf.js';
import { aplicarEdicionOT as editarA } from '../public/lotes/js/ot-editar.js';
import { armarOT as armarA, movimientosDeOT as movsA } from '../public/lotes/js/ot-armado.js';

const b = (num, cap = 225) => ({ num, cap, estado: 'LLENO' });
function base(){
  const ot = armarOT({ id: 'ot-1', numero: '0952', plantilla: 'barrica-tanque', fecha: '2026-10-26', destino: 'T 190',
    emitio: 'Ana', lotes: [{ lote: '26210', barriles: [b('a'), b('c')] }, { lote: '26211', barriles: [b('x')] }] });
  ot.bloques = [{ tipo: 'paso', texto: 'Mi paso' }, { tipo: 'tabla-vaciado', celdas: { 3: 'anotado' } }, { tipo: 'ids', celdas: { 0: 'x' } }];
  ot.pdf = { estado: 'carpeta', nombre: '0952 x.pdf' };
  const datos = { ordenes_trabajo: [ot], movimientos: movimientosDeOT(ot, 'ana', '2026-10-26') };
  return { ot, datos };
}
const lotesNuevos = ot => armarOT({ id: 'tmp', numero: ot.ot, plantilla: ot.plantilla, fecha: ot.fecha,
  lotes: [{ lote: '26210', barriles: [b('a')], otras: [{ nombre: 'IBC 1', litros: 300 }] },
          { lote: '26220', barriles: [], tanques: [{ num: '189', litros: 3000 }] }] }).lotes;

describe('aplicarEdicionOT', () => {
  it('conserva el movimiento del lote que sigue, crea el del nuevo y borra el del quitado', () => {
    const { ot, datos } = base();
    const idViejo = ot.lotes[0].mov_id;
    const r = aplicarEdicionOT(datos, ot, { lotes: lotesNuevos(ot), destino: 'T 191' }, { usuario: 'ana', hoy: '2026-10-27' });
    expect(r).toMatchObject({ cambio: true, quitados: ['26211'], agregados: ['26220'] });
    expect(ot.lotes.map(l => l.lote)).toEqual(['26210', '26220']);
    expect(ot.lotes[0].mov_id).toBe(idViejo);
    expect(new Set(ot.lotes.map(l => l.mov_id)).size).toBe(2);
    expect(datos.movimientos.map(m => m.lote).sort()).toEqual(['26210', '26220']);
    const m0 = datos.movimientos.find(m => m.id === idViejo);
    expect(m0).toMatchObject({ vasija_origen: '1 barrica a + IBC 1', vasija_destino: 'T 191', litros: 525, estado: 'pendiente' });
    expect(datos.movimientos.find(m => m.lote === '26220')).toMatchObject({ litros: 3000, ot: '0952', estado: 'pendiente' });
  });
  it('si cambian las vasijas se reinician las celdas de tablas e ID, no los pasos; el PDF queda viejo', () => {
    const { ot, datos } = base();
    const r = aplicarEdicionOT(datos, ot, { lotes: lotesNuevos(ot) }, {});
    expect(r.celdasLimpias).toBe(true);
    expect(ot.bloques[0].texto).toBe('Mi paso');
    expect(ot.bloques[1].celdas).toBeUndefined();
    expect(ot.bloques[2].celdas).toBeUndefined();
    expect(ot.pdf.estado).toBe('viejo');
    expect(etiquetaPdf(ot)).toMatchObject({ txt: '⚠ PDF viejo · reimprimir' });
  });
  it('solo cambiar el destino no toca las celdas', () => {
    const { ot, datos } = base();
    const r = aplicarEdicionOT(datos, ot, { destino: 'T 200' }, {});
    expect(r).toMatchObject({ cambio: true, celdasLimpias: false });
    expect(ot.bloques[1].celdas).toEqual({ 3: 'anotado' });
    expect(datos.movimientos.every(m => m.vasija_destino === 'T 200')).toBe(true);
  });
  it('sin cambios no marca nada', () => {
    const { ot, datos } = base();
    expect(aplicarEdicionOT(datos, ot, { destino: 'T 190' }, {}).cambio).toBe(false);
    expect(ot.pdf.estado).toBe('carpeta');
  });
  it('cambiar el lote del corte cambia el lote destino de los traspasos', () => {
    const { ot, datos } = base();
    ot.lote_corte = { lote: '26300', id_texto: 'C' };
    aplicarEdicionOT(datos, ot, { lote_corte: { lote: '26200', id_texto: 'Base', existente: true } }, {});
    expect(ot.lote_corte).toEqual({ lote: '26200', id_texto: 'Base', existente: true });
    expect(datos.movimientos.every(m => m.tipo === 'traspaso' && m.lote_destino === '26200')).toBe(true);
  });
});

describe('conOtras', () => {
  it('litros que eran la suma siguen siendo la suma', () => {
    const l = { barriles: [b('a')], tanques: [], otras: [], litros_previstos: 225 };
    expect(conOtras(l, [{ nombre: 'IBC', litros: 300 }])).toMatchObject({ litros_previstos: 525, otras: [{ nombre: 'IBC', litros: 300 }] });
  });
  it('litros escritos a mano se ajustan por la diferencia', () => {
    const l = { barriles: [b('a')], tanques: [], otras: [{ nombre: 'IBC', litros: 300 }], litros_previstos: 500 };
    expect(conOtras(l, [{ nombre: 'IBC', litros: 200 }]).litros_previstos).toBe(400);
  });
});

describe('editar un Corte + achique', () => {
  const base = () => {
    const ot = armarA({ id: 'ot-e', numero: '0944', plantilla: 'corte-achique', fecha: '2026-10-14',
      destino: 'TQ pulmón', emitio: 'Oriana', lotes: [{ lote: '26034', barriles: [{ num: '1', cap: 225 }] }],
      lote_corte: { lote: '26323', id_texto: 'PN' },
      achique: { destinos: [{ tipo: 'tanque', num: '206', litros: 100, lote: '26323' },
                            { tipo: 'tanque', num: '209', litros: 100, lote: '26324', nuevo: true }] },
      usuario: 'ana', hoy: 'h' });
    return { ot, datos: { movimientos: movsA(ot, 'ana', 'h') } };
  };
  it('agregar un destino suma su traspaso y conserva el del hijo que sigue', () => {
    const { ot, datos } = base();
    const r = editarA(datos, ot, { achique: { destinos: [...ot.achique.destinos,
      { tipo: 'tanque', num: '210', litros: 50, lote: '26325', nuevo: true }] } });
    expect(r.cambio).toBe(true);
    expect(ot.achique.destinos.map(d => d.mov_id)).toEqual([null, 'ot-e-a0', 'ot-e-a1']);
    expect(datos.movimientos.map(m => m.id).sort()).toEqual(['ot-e-0', 'ot-e-a0', 'ot-e-a1']);
    expect(r.hijosQuitados).toEqual([]);
  });
  const conCeldas = ot => { ot.bloques = [
    { tipo: 'tabla-vaciado', celdas: { 0: 'v' } }, { tipo: 'rotular', de: 'corte', celdas: { 0: 'rc' } },
    { tipo: 'tabla-achique', celdas: { 0: 'a' } }, { tipo: 'rotular', de: 'achique', celdas: { 0: 'ra' } }]; };
  it('si cambian solo las vasijas definitivas, se reinician solo las celdas del achique', () => {
    const { ot, datos } = base();
    conCeldas(ot);
    const r = editarA(datos, ot, { achique: { destinos: [ot.achique.destinos[0], { ...ot.achique.destinos[1], num: '210' }] } });
    expect(r.celdasLimpias).toBe(true);
    expect(ot.bloques.map(b => b.celdas)).toEqual([{ 0: 'v' }, { 0: 'rc' }, undefined, undefined]);
  });
  it('cambiar el tipo de un tanque con numero tambien reinicia las celdas del achique (el papel lo imprime)', () => {
    const { ot, datos } = base();
    const C75 = { tipo: 'TANQUE AC.INOX.', cap: 7500 };
    editarA(datos, ot, { achique: { destinos: [ot.achique.destinos[0], { ...ot.achique.destinos[1], clase: C75 }] } });
    conCeldas(ot);
    const r = editarA(datos, ot, { achique: { destinos: [ot.achique.destinos[0],
      { ...ot.achique.destinos[1], clase: { tipo: 'TANQUE AC.INOX.', cap: 4200 } }] } });
    expect(r.celdasLimpias).toBe(true);
    expect(ot.bloques.map(b => b.celdas)).toEqual([{ 0: 'v' }, { 0: 'rc' }, undefined, undefined]);
  });
  it('si cambian las vasijas de los origenes, se reinician todas', () => {
    const { ot, datos } = base();
    conCeldas(ot);
    editarA(datos, ot, { lotes: [{ ...ot.lotes[0], barriles: [{ num: '2', cap: 225 }] }] });
    expect(ot.bloques.every(b => b.celdas === undefined)).toBe(true);
  });
  it('quitar un hijo borra su traspaso y avisa el lote', () => {
    const { ot, datos } = base();
    const r = editarA(datos, ot, { achique: { destinos: [ot.achique.destinos[0]] } });
    expect(datos.movimientos.map(m => m.id)).toEqual(['ot-e-0']);
    expect(r.hijosQuitados).toEqual(['26324']);
  });
});

describe('filas manuales en un Corte + achique', () => {
  it('una fila con un hijo o con el lote del corte queda solo en papel: no se vuelve origen', () => {
    const ot = armarA({ id: 'ot-f', numero: '0950', plantilla: 'corte-achique', fecha: '2026-10-14',
      destino: 'TQ pulmón', emitio: 'Oriana', lotes: [{ lote: '26034', barriles: [{ num: '1', cap: 225 }] }],
      lote_corte: { lote: '26323', id_texto: 'PN' },
      achique: { destinos: [{ tipo: 'tanque', num: '206', litros: 100, lote: '26323' },
                            { tipo: 'tanque', num: '209', litros: 100, lote: '26324', nuevo: true }] },
      usuario: 'ana', hoy: 'h' });
    const datos = { movimientos: movsA(ot, 'ana', 'h') };
    const LOTES = [{ lote: 26034 }, { lote: 26323 }, { lote: 26324 }];
    expect(clasificarFila({ lote: '26324' }, ot, LOTES)).toBe('papel');
    expect(clasificarFila({ lote: '26323' }, ot, LOTES)).toBe('papel');
    const filas = [{ lote: '26324', nombre: 'IBC 1', litros: 300 }, { lote: '26323', nombre: 'IBC 2', litros: 100 }];
    editarA(datos, ot, lotesConFilas(ot, filas, LOTES), {});
    expect(ot.lotes.map(l => l.lote)).toEqual(['26034']);
    expect(ot.filas_papel.map(f => f.lote)).toEqual(['26324', '26323']);
    expect(datos.movimientos.filter(m => m.lote === '26324')).toEqual([]);
  });
});

describe('tanques destino extra al editar', () => {
  it('conserva el mov_id del extra que sigue, crea el nuevo, saca el quitado y avisa el hijo quitado', () => {
    const ot = armarOT({ id: 'ot-9', numero: '0990', plantilla: 'tq-tq', fecha: '2026-11-12', destino: 'T 212', emitio: '',
      lotes: [{ lote: '26217', barriles: [], tanques: [{ num: '189', litros: 4000 }], otras: [], litros_previstos: 4000,
        destinos_extra: [{ num: '214', lote: '26330' }, { num: '213', lote: '26331' }] }], usuario: '', hoy: '' });
    const datos = { movimientos: movimientosDeOT(ot, '', ''), ordenes_trabajo: [ot] };
    const idSigue = ot.lotes[0].destinos_extra[0].mov_id;
    const r = aplicarEdicionOT(datos, ot, { lotes: [{ ...ot.lotes[0],
      destinos_extra: [ot.lotes[0].destinos_extra[0], { num: '210', lote: '26332' }] }] });
    expect(ot.lotes[0].destinos_extra.map(d => d.num)).toEqual(['214', '210']);
    expect(ot.lotes[0].destinos_extra[0].mov_id).toBe(idSigue);
    expect(datos.movimientos.map(m => m.lote_destino).filter(Boolean).sort()).toEqual(['26330', '26332']);
    expect(r.hijosQuitados).toEqual(['26331']);
  });
  it('un extra nuevo que llega con mov_id de otra OT (la temporal de la sesion) recibe un id de esta OT', () => {
    const ot = armarOT({ id: 'ot-9', numero: '0990', plantilla: 'tq-tq', fecha: '2026-11-12', destino: 'T 212', emitio: '',
      lotes: [{ lote: '26217', barriles: [], tanques: [{ num: '189', litros: 4000 }], otras: [], litros_previstos: 4000,
        destinos_extra: [{ num: '214', lote: '26330' }] }], usuario: '', hoy: '' });
    const datos = { movimientos: movimientosDeOT(ot, '', ''), ordenes_trabajo: [ot] };
    const idSigue = ot.lotes[0].destinos_extra[0].mov_id;
    aplicarEdicionOT(datos, ot, { lotes: [{ ...ot.lotes[0],
      destinos_extra: [ot.lotes[0].destinos_extra[0], { num: '210', lote: '26332', mov_id: 'ot-tmp-x0-0' }] }] });
    const ids = ot.lotes[0].destinos_extra.map(d => d.mov_id);
    expect(ids[0]).toBe(idSigue);
    expect(ids[1].startsWith('ot-9-')).toBe(true);
    expect(ids[1]).not.toBe(idSigue);
    expect(datos.movimientos.some(m => m.id === 'ot-tmp-x0-0')).toBe(false);
  });
  it('corte: lo mismo con los extra de la OT', () => {
    const ot = armarOT({ id: 'ot-8', numero: '0991', plantilla: 'barricas-tanque', fecha: '2026-11-12', destino: 'T 201', emitio: '',
      lote_corte: { lote: '26400', id_texto: 'Corte' },
      lotes: [{ lote: '26217', barriles: [], tanques: [{ num: '189', litros: 4000 }], otras: [], litros_previstos: 4000 }],
      destinos_extra: [{ num: '214', lote: '26401' }], usuario: '', hoy: '' });
    const datos = { movimientos: movimientosDeOT(ot, '', ''), ordenes_trabajo: [ot] };
    aplicarEdicionOT(datos, ot, { destinos_extra: [...ot.destinos_extra, { num: '215', lote: '26402', mov_id: 'ot-tmp-xc-0' }] });
    expect(ot.destinos_extra[1].mov_id.startsWith('ot-8-')).toBe(true);
  });
});

describe('filas manuales de la hoja', () => {
  const LOTES = [{ lote: 26210 }, { lote: 26211 }, { lote: '26230', id_texto: 'Syrah' }];
  it('clasifica: lote de la OT, lote existente que entra, o solo papel', () => {
    const { ot } = base();
    expect(clasificarFila({ lote: '26210' }, ot, LOTES)).toBe('ot');
    expect(clasificarFila({ lote: '26230' }, ot, LOTES)).toBe('nuevo');
    expect(clasificarFila({ lote: 'Agua' }, ot, LOTES)).toBe('papel');
    expect(clasificarFila({ lote: '' }, ot, LOTES)).toBe('papel');
  });
  it('una fila con un lote existente lo suma a la OT con su movimiento; la de papel no cuenta', () => {
    const { ot, datos } = base();
    const filas = [...filasManuales(ot), { lote: '26210', nombre: 'IBC 1', litros: 300 },
      { lote: '26230', nombre: 'IBC 2', litros: 500 }, { lote: 'Agua', nombre: 'Bin 2', litros: 50 }];
    const r = aplicarEdicionOT(datos, ot, lotesConFilas(ot, filas, LOTES), {});
    expect(r.agregados).toEqual(['26230']);
    expect(ot.lotes.find(l => l.lote === '26210')).toMatchObject({ otras: [{ nombre: 'IBC 1', litros: 300 }], litros_previstos: 750 });
    expect(ot.lotes.find(l => l.lote === '26230')).toMatchObject({ id_texto: 'Syrah', litros_previstos: 500 });
    expect(ot.filas_papel).toEqual([{ lote: 'Agua', nombre: 'Bin 2', litros: 50 }]);
    expect(datos.movimientos.find(m => m.lote === '26230')).toMatchObject({ litros: 500, vasija_origen: 'IBC 2' });
    expect(datos.movimientos.some(m => m.lote === 'Agua')).toBe(false);
    expect(filasManuales(ot).map(f => f.lote)).toEqual(['26210', '26230', 'Agua']);
  });
  it('quitar la unica fila de un lote que entro por fila manual lo saca de la OT', () => {
    const { ot, datos } = base();
    aplicarEdicionOT(datos, ot, lotesConFilas(ot, [{ lote: '26230', nombre: 'IBC 2', litros: 500 }], LOTES), {});
    expect(ot.lotes.map(l => l.lote)).toContain('26230');
    const r = aplicarEdicionOT(datos, ot, lotesConFilas(ot, [], LOTES), {});
    expect(r.quitados).toEqual(['26230']);
    expect(ot.lotes.map(l => l.lote)).toEqual(['26210', '26211']);
  });
});
