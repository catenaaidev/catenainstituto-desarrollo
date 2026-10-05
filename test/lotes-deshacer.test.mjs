/* Deshacer de toda la página de Lotes: la foto por fila y la diferencia
 * (spec 2026-10-05, sección 2). */
import { describe, it, expect } from 'vitest';
import { tomarFoto, diferencia } from '../public/lotes/js/deshacer.js';

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
