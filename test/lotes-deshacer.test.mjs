/* Deshacer de toda la página de Lotes: la foto por fila y la diferencia
 * (spec 2026-10-05, sección 2). */
import { describe, it, expect } from 'vitest';
import { tomarFoto, diferencia, aplicar, crearHistorial, describirPaso, describirCambio } from '../public/lotes/js/deshacer.js';

const doc = () => ({
  meta: { version: 7, autor: 'x' },
  lotes: [{ lote: '26001', litros: 100 }, { lote: '26002', litros: 200 }],
  analisis: [{ lote: '26001', ph: 3.5 }, { lote: '26001', ph: 3.6 }],
  movimientos: [{ id: 'm1', lote: '26001' }],
  estado_lote: { '26001': { etapa: 'FML' } },
  config: { criterios_fml: { a: 1 }, destinos_externos: [] },
});

describe('tomarFoto', () => {
  it('no incluye meta', () => {
    expect(tomarFoto(doc()).meta).toBeUndefined();
  });
  it('usa la clave natural de cada sección y contenido donde no hay', () => {
    const f = tomarFoto(doc());
    expect(f.lotes.tipo).toBe('clave');
    expect(f.lotes.claves).toEqual(['26001', '26002']);
    expect(f.movimientos.tipo).toBe('clave');
    expect(f.analisis.tipo).toBe('contenido');
    expect(f.estado_lote.tipo).toBe('objeto');
  });
  it('una sección con clave repetida se compara por contenido', () => {
    const d = doc(); d.lotes.push({ lote: '26001', litros: 5 });
    expect(tomarFoto(d).lotes.tipo).toBe('contenido');
  });
});

describe('diferencia', () => {
  it('sin cambios no devuelve nada', () => {
    const d = doc();
    expect(diferencia(tomarFoto(d), d).cambios).toEqual([]);
  });
  it('un cambio en meta no cuenta', () => {
    const d = doc(); const f = tomarFoto(d);
    d.meta.version = 8;
    expect(diferencia(f, d).cambios).toEqual([]);
  });
  it('edición de un lote: antes y después de esa fila', () => {
    const d = doc(); const f = tomarFoto(d);
    d.lotes[1].litros = 150;
    const { cambios } = diferencia(f, d);
    expect(cambios).toEqual([{ seccion: 'lotes', tipo: 'fila', clave: '26002',
      antes: JSON.stringify({ lote: '26002', litros: 200 }),
      despues: JSON.stringify({ lote: '26002', litros: 150 }), pos: 1 }]);
  });
  it('alta y baja de lotes', () => {
    const d = doc(); const f = tomarFoto(d);
    d.lotes.splice(0, 1);
    d.lotes.push({ lote: '26003', litros: 0 });
    const { cambios } = diferencia(f, d);
    expect(cambios).toContainEqual({ seccion: 'lotes', tipo: 'fila', clave: '26001',
      antes: JSON.stringify({ lote: '26001', litros: 100 }), despues: null, pos: 0 });
    expect(cambios).toContainEqual({ seccion: 'lotes', tipo: 'fila', clave: '26003',
      antes: null, despues: JSON.stringify({ lote: '26003', litros: 0 }), pos: 1 });
    expect(cambios.some(c => c.tipo === 'orden')).toBe(false);
  });
  it('reordenar sin tocar filas anota el orden', () => {
    const d = doc(); const f = tomarFoto(d);
    d.lotes.reverse();
    expect(diferencia(f, d).cambios).toEqual([{ seccion: 'lotes', tipo: 'orden',
      antes: ['26001', '26002'], despues: ['26002', '26001'] }]);
  });
  it('análisis editado en su lugar = una fila con antes y después', () => {
    const d = doc(); const f = tomarFoto(d);
    d.analisis[1].ph = 3.7;
    expect(diferencia(f, d).cambios).toEqual([{ seccion: 'analisis', tipo: 'fila', clave: null,
      antes: JSON.stringify({ lote: '26001', ph: 3.6 }),
      despues: JSON.stringify({ lote: '26001', ph: 3.7 }), pos: 1 }]);
  });
  it('análisis agregados y borrados', () => {
    const d = doc(); const f = tomarFoto(d);
    d.analisis.splice(0, 1);
    d.analisis.push({ lote: '26002', ph: 3.4 }, { lote: '26002', ph: 3.3 });
    const { cambios } = diferencia(f, d);
    expect(cambios.filter(c => c.antes && !c.despues)).toHaveLength(1);
    expect(cambios.filter(c => !c.antes && c.despues)).toHaveLength(2);
  });
  it('dos análisis idénticos: borrar uno es un solo cambio', () => {
    const d = doc(); d.analisis.push({ lote: '26001', ph: 3.6 });
    const f = tomarFoto(d);
    d.analisis.pop();
    const { cambios } = diferencia(f, d);
    expect(cambios).toHaveLength(1);
    expect(cambios[0].despues).toBeNull();
  });
  it('objetos: un campo por clave', () => {
    const d = doc(); const f = tomarFoto(d);
    d.estado_lote['26001'].etapa = 'Crianza';
    d.estado_lote['26002'] = { etapa: 'FML' };
    delete d.config.destinos_externos;
    const { cambios } = diferencia(f, d);
    expect(cambios).toContainEqual({ seccion: 'estado_lote', tipo: 'campo', clave: '26001',
      antes: '{"etapa":"FML"}', despues: '{"etapa":"Crianza"}' });
    expect(cambios).toContainEqual({ seccion: 'estado_lote', tipo: 'campo', clave: '26002',
      antes: null, despues: '{"etapa":"FML"}' });
    expect(cambios).toContainEqual({ seccion: 'config', tipo: 'campo', clave: 'destinos_externos',
      antes: '[]', despues: null });
  });
  it('una sección nueva o que desaparece es un cambio de valor entero', () => {
    const d = doc(); const f = tomarFoto(d);
    d.mermas = [{ id: 'x' }];
    expect(diferencia(f, d).cambios).toEqual([{ seccion: 'mermas', tipo: 'valor',
      antes: undefined, despues: '[{"id":"x"}]' }]);
  });
  it('la foto devuelta es la nueva base', () => {
    const d = doc(); const f = tomarFoto(d);
    d.lotes[0].litros = 1;
    const { foto } = diferencia(f, d);
    expect(diferencia(foto, d).cambios).toEqual([]);
  });
});

/* Helper: hace algo sobre d, devuelve los cambios como los apilaria nucleo. */
function paso(d, fn){
  const f = tomarFoto(d);
  fn(d);
  return diferencia(f, d).cambios;
}

describe('aplicar', () => {
  it('deshacer y rehacer una edición, en el mismo objeto', () => {
    const d = doc(); const obj = d.lotes[1];
    const c = paso(d, x => { x.lotes[1].litros = 150; });
    expect(aplicar(d, c, 'deshacer')).toEqual({ aplicados: 1, salteados: [] });
    expect(d.lotes[1]).toBe(obj);
    expect(obj.litros).toBe(200);
    aplicar(d, c, 'rehacer');
    expect(obj.litros).toBe(150);
  });
  it('deshacer una baja la devuelve a su lugar', () => {
    const d = doc();
    const c = paso(d, x => { x.lotes.splice(0, 1); });
    aplicar(d, c, 'deshacer');
    expect(d.lotes.map(l => l.lote)).toEqual(['26001', '26002']);
  });
  it('deshacer un alta la saca', () => {
    const d = doc();
    const c = paso(d, x => { x.lotes.push({ lote: '26009' }); });
    aplicar(d, c, 'deshacer');
    expect(d.lotes.map(l => l.lote)).toEqual(['26001', '26002']);
  });
  it('deshacer un reordenamiento', () => {
    const d = doc();
    const c = paso(d, x => { x.lotes.reverse(); });
    aplicar(d, c, 'deshacer');
    expect(d.lotes.map(l => l.lote)).toEqual(['26001', '26002']);
  });
  it('análisis: agregar tres y deshacer', () => {
    const d = doc();
    const c = paso(d, x => { x.analisis.push({ lote: 'a' }, { lote: 'b' }, { lote: 'c' }); });
    aplicar(d, c, 'deshacer');
    expect(d.analisis).toEqual(doc().analisis);
  });
  it('análisis editado en su lugar vuelve en el mismo objeto', () => {
    const d = doc(); const obj = d.analisis[1];
    const c = paso(d, x => { x.analisis[1].ph = 9; });
    aplicar(d, c, 'deshacer');
    expect(d.analisis[1]).toBe(obj);
    expect(obj.ph).toBe(3.6);
  });
  it('objetos: estado_lote y config', () => {
    const d = doc();
    const c = paso(d, x => { x.estado_lote['26001'].etapa = 'Crianza'; delete x.config.destinos_externos; });
    aplicar(d, c, 'deshacer');
    expect(d.estado_lote).toEqual(doc().estado_lote);
    expect(d.config).toEqual(doc().config);
  });
  it('una fila que otro cambió después no se toca y se informa', () => {
    const d = doc();
    const c = paso(d, x => { x.lotes[0].litros = 1; x.lotes[1].litros = 2; });
    d.lotes[0].litros = 999;   // llega lo de otra persona (409 o en vivo)
    const r = aplicar(d, c, 'deshacer');
    expect(r.aplicados).toBe(1);
    expect(r.salteados.map(s => s.clave)).toEqual(['26001']);
    expect(d.lotes[0].litros).toBe(999);
    expect(d.lotes[1].litros).toBe(200);
  });
  it('deshacer una baja no duplica si otro ya volvió a crear esa clave', () => {
    const d = doc();
    const c = paso(d, x => { x.lotes.splice(0, 1); });
    d.lotes.push({ lote: '26001', litros: 7 });
    const r = aplicar(d, c, 'deshacer');
    expect(r.salteados).toHaveLength(1);
    expect(d.lotes.filter(l => l.lote === '26001')).toHaveLength(1);
  });
  it('sección entera que apareció: deshacer la quita', () => {
    const d = doc();
    const c = paso(d, x => { x.mermas = [{ id: 'x' }]; });
    aplicar(d, c, 'deshacer');
    expect('mermas' in d).toBe(false);
  });
  it('campo en sección reemplazada por array: se saltea sin tocar', () => {
    const d = doc();
    const c = { seccion: 'estado_lote', tipo: 'campo', clave: '26001',
      antes: '{"etapa":"FML"}', despues: '{"etapa":"Crianza"}' };
    d.estado_lote['26001'].etapa = 'Crianza';
    d.estado_lote = [];  // otro cambio la convirtió en array
    const r = aplicar(d, [c], 'deshacer');
    expect(r.salteados).toHaveLength(1);
    expect(Array.isArray(d.estado_lote)).toBe(true);
    expect(d.estado_lote).toEqual([]);
  });
  it('campo en sección ausente: rehacer la crea', () => {
    const d = doc();
    delete d.estado_lote;
    const c = { seccion: 'estado_lote', tipo: 'campo', clave: '26009',
      antes: null, despues: '{"etapa":"FML"}' };
    aplicar(d, [c], 'rehacer');
    expect(d.estado_lote).toEqual({ '26009': { etapa: 'FML' } });
  });
  it('dos bajas no adyacentes en un paso: deshacer y rehacer restauran orden', () => {
    const d = doc();
    d.lotes.push({ lote: '26003', litros: 0 }, { lote: '26004', litros: 0 }, { lote: '26005', litros: 0 });
    const f = tomarFoto(d);
    d.lotes.splice(1, 1);  // quita 26002
    d.lotes.splice(2, 1);  // quita 26004 (ahora en índice 2)
    const c = diferencia(f, d).cambios;
    expect(d.lotes.map(l => l.lote)).toEqual(['26001', '26003', '26005']);
    aplicar(d, c, 'deshacer');
    expect(d.lotes.map(l => l.lote)).toEqual(['26001', '26002', '26003', '26004', '26005']);
    aplicar(d, c, 'rehacer');
    expect(d.lotes.map(l => l.lote)).toEqual(['26001', '26003', '26005']);
  });
});

describe('crearHistorial', () => {
  const p = n => ({ cambios: [{ n }], etiqueta: 'p' + n, vista: 'lotes' });
  it('un paso vacío no se apila', () => {
    const h = crearHistorial();
    expect(h.apilar({ cambios: [], etiqueta: '', vista: null })).toBe(false);
    expect(h.deshacer()).toBeNull();
  });
  it('deshacer y rehacer en orden', () => {
    const h = crearHistorial();
    h.apilar(p(1)); h.apilar(p(2));
    expect(h.deshacer().etiqueta).toBe('p2');
    expect(h.rehacer().etiqueta).toBe('p2');
    expect(h.rehacer()).toBeNull();
  });
  it('algo nuevo después de deshacer descarta el rehacer', () => {
    const h = crearHistorial();
    h.apilar(p(1)); h.deshacer(); h.apilar(p(2));
    expect(h.rehacer()).toBeNull();
  });
  it('tope', () => {
    const h = crearHistorial(3);
    [1, 2, 3, 4].forEach(n => h.apilar(p(n)));
    expect(h.tamano()).toEqual({ atras: 3, adelante: 0 });
    h.deshacer(); h.deshacer(); h.deshacer();
    expect(h.deshacer()).toBeNull();
  });
});

describe('descripciones', () => {
  it('una sola fila nombra lo que es', () => {
    const d = doc();
    expect(describirPaso(paso(d, x => { x.lotes[1].litros = 1; }))).toBe('lote 26002');
    expect(describirPaso(paso(d, x => { x.analisis[0].ph = 1; }))).toBe('análisis del lote 26001');
    expect(describirPaso(paso(d, x => { x.estado_lote['26001'].etapa = 'z'; }))).toBe('estado del lote 26001');
  });
  it('varias filas de una sección las cuenta', () => {
    const d = doc();
    expect(describirPaso(paso(d, x => { x.analisis.push({ lote: 'a' }, { lote: 'b' }, { lote: 'c' }); }))).toBe('3 análisis');
  });
  it('mezcla de secciones', () => {
    const d = doc();
    expect(describirPaso(paso(d, x => { x.lotes[0].litros = 1; x.movimientos.push({ id: 'm2' }); }))).toBe('2 cambios');
  });
  it('describirCambio de un análisis sin lote', () => {
    expect(describirCambio({ seccion: 'analisis', tipo: 'fila', clave: null, antes: '{}', despues: null, pos: 0 })).toBe('análisis');
  });
});
