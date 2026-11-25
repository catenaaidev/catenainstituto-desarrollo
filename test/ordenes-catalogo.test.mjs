import { describe, it, expect } from 'vitest';
import { TIPOS, buscarTipos, normalizar, nombreDeTipo, modulosEditablesDe } from '../public/ordenes/js/catalogo.js';
import { PLANTILLAS_OT } from '../public/lotes/js/ot-plantillas.js';
import { TIPOS_HOJA_PRENSAS } from '../public/prensas/js/hojas-prensas.js';

const ids = (r) => r.map((t) => t.id);

describe('catálogo de órdenes', () => {
  it('Lotes ofrece todas las plantillas de OT más la corrección SO₂, y nada más', () => {
    const lotes = TIPOS.filter((t) => t.modulo === 'lotes').map((t) => t.id).sort();
    expect(lotes).toEqual([...PLANTILLAS_OT.map((p) => p.id), 'correccion', 'muestras', 'micro', 'agregados'].sort());
  });
  it('el nombre de una plantilla es el mismo que en Lotes', () => {
    for (const p of PLANTILLAS_OT) expect(nombreDeTipo(p.id)).toBe(p.nombre);
    expect(nombreDeTipo('correccion')).toBe('Corrección SO₂');
    expect(nombreDeTipo('raro')).toBe('raro');
  });
  it('Prensas: sus 4 órdenes, con ids propios', () => {
    expect(TIPOS.filter(t => t.modulo === 'prensas').map(t => t.id))
      .toEqual(['prensas-muestras', 'prensas-rellenos', 'prensas-accion', 'prensas-agregados']);
    expect(buscarTipos('relleno', ['prensas']).map(t => t.id)).toEqual(['prensas-rellenos']);
    expect(buscarTipos('so2', ['prensas', 'lotes']).map(t => t.id)).toEqual(expect.arrayContaining(['correccion', 'prensas-accion']));
    expect(modulosEditablesDe({ prensas: 'editor' })).toEqual(['prensas']);
  });
  it('los tipos de Prensas coinciden con TIPOS_HOJA_PRENSAS (mismos ids y nombres)', () => {
    const prensas = TIPOS.filter((t) => t.modulo === 'prensas');
    expect(prensas.map((t) => t.id).sort()).toEqual(Object.keys(TIPOS_HOJA_PRENSAS).sort());
    for (const t of prensas) expect(t.nombre).toBe(TIPOS_HOJA_PRENSAS[t.id].nombre);
  });
});

describe('buscarTipos', () => {
  const L = ['lotes'];
  it('sin texto devuelve todos los del módulo editable, en orden del catálogo', () => {
    expect(ids(buscarTipos('', L))).toEqual(ids(TIPOS.filter((t) => t.modulo === 'lotes')));
  });
  it('sin módulos editables no devuelve nada', () => {
    expect(buscarTipos('', [])).toEqual([]);
  });
  it('encuentra por sinónimo, sin importar tildes ni mayúsculas', () => {
    expect(ids(buscarTipos('so2', L))).toEqual(['correccion']);
    expect(ids(buscarTipos('SULFUROSO', L))).toEqual(['correccion']);
    expect(ids(buscarTipos('correccion', L))).toEqual(['correccion']);
    expect(ids(buscarTipos('mezcla', L))).toEqual(['barricas-tanque', 'corte-achique']);
    expect(ids(buscarTipos('barrica a tanque', L))).toContain('barrica-tanque');
  });
  it('todas las palabras tienen que aparecer', () => {
    expect(ids(buscarTipos('trasiego tq', L))).toEqual(['tq-barricas', 'tq-tq']);
  });
  it('normalizar saca tildes y espacios de más', () => {
    expect(normalizar('  Corrección   SO₂ ')).toBe('correccion so2');
  });
  it('los nombres de las órdenes de papel son los de Lotes', async () => {
    const { TIPOS_HOJA } = await import('../public/lotes/js/ordenes-hojas.js');
    for (const [id, t] of Object.entries(TIPOS_HOJA)) expect(nombreDeTipo(id)).toBe(t.nombre);
  });
  it('encuentra las órdenes de papel por sinónimo', () => {
    expect(buscarTipos('laboratorio', ['lotes']).map((t) => t.id)).toEqual(['muestras', 'micro']);
    expect(buscarTipos('cartel caja', ['lotes']).map((t) => t.id)).toEqual(['micro']);
    expect(buscarTipos('th2', ['lotes']).map((t) => t.id)).toEqual(['agregados']);
  });
});

describe('nombreDeTipo', () => {
  it('la guía impresa tiene nombre', () => expect(nombreDeTipo('guia')).toBe('Guía de trabajos'));
});

describe('modulosEditablesDe', () => {
  it('cuenta solo los módulos con rol editor/admin que tienen tipos', () => {
    expect(modulosEditablesDe({ lotes: 'editor' })).toEqual(['lotes']);
    expect(modulosEditablesDe({ lotes: 'admin', prensas: 'admin' })).toEqual(['lotes', 'prensas']);
    expect(modulosEditablesDe({ lotes: 'lector', prensas: 'editor' })).toEqual(['prensas']);
    expect(modulosEditablesDe({ prensas: 'admin' })).toEqual(['prensas']);
    expect(modulosEditablesDe(undefined)).toEqual([]);
  });
});
