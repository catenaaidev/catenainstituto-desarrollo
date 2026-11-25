import { describe, it, expect } from 'vitest';
import { hojaGuia, hojaImpresa, extrasGuia } from '../public/ordenes/js/guia-hoja.js';

const O = { modulo: 'lotes', id: 'ot-1', tipo: 'traslado', numero: '0957', fecha: '2026-11-03', estado: 'pendiente', lotes: ['26329'], lote_corte: '' };
const GUIA = { emitio: 'Oriana', recibio: 'Enzo - Marcelo', renglones: [
  { id: 'a', tipo: 'tarea', texto: 'Lavar <barriles>' },
  { id: 'n', tipo: 'nota', texto: 'avisar a Oriana' },
  { id: 'o', tipo: 'orden', ref: 'lotes:ot-1' },
  { id: 'h', tipo: 'orden', ref: 'lotes:ot-2', oculta: true },
], hechas: [{ id: 'z', tipo: 'tarea', texto: 'Mechado', hecha: '2026-11-03T12:00:00Z', por: 'ana@x', lugar: 0 }] };
const ORD = [O, { ...O, id: 'ot-2', numero: '0960' }];
const OPC = { fechaTxt: '04/11/2026', anio: '2026', puedeEditar: true, volver: '/ordenes/?v=guia' };

describe('hojaGuia', () => {
  const h = hojaGuia(GUIA, ORD, OPC);
  it('encabezado RCI 08 y título', () => {
    expect(h).toContain('ORDEN DE TRABAJO - RCI 08 - Rev. 02');
    expect(h).toContain('GUÍA DE TRABAJOS, SEGUIR ORDEN INDICADO');
    expect(h).toContain('04/11/2026');
  });
  it('escapa el texto', () => {
    expect(h).toContain('Lavar &lt;barriles&gt;');
    expect(h).not.toContain('<barriles>');
  });
  it('numera tareas y órdenes; la nota no lleva número ni casilla', () => {
    expect(h).toMatch(/data-id="a"[\s\S]*?gt-num">1<[\s\S]*?gt-caja/);
    expect(h).toMatch(/<tr class="gt-r gt-nota" data-id="n"><td class="gt-num"><\/td><td class="gt-chk"><\/td>/);
    expect(h).toMatch(/data-id="o"[\s\S]*?gt-num">2</);
  });
  it('la orden muestra su texto con enlace y no es editable; la oculta no aparece', () => {
    expect(h).toContain('Traslado · N° 0957 · 26329');
    expect(h).toContain('href="/lotes/?orden=ot-1&amp;volver=');
    expect(h).not.toContain('N° 0960');
    expect(h).not.toMatch(/data-id="o"[^>]*contenteditable/);
  });
  it('editor: controles y firmas editables', () => {
    expect(h).toContain('data-acc="agregar"');
    expect(h).toContain('data-acc="hecha" data-id="a"');
    expect(h).not.toContain('data-acc="hecha" data-id="o"');
    expect(h).toContain('data-firma="emitio"');
    expect(h).toContain('Oriana');
  });
  it('lector: sin controles ni contenteditable', () => {
    const l = hojaGuia(GUIA, ORD, { ...OPC, puedeEditar: false });
    expect(l).not.toContain('data-acc=');
    expect(l).not.toContain('contenteditable');
    expect(l).toContain('Lavar &lt;barriles&gt;');
  });
  it('sin renglones: lo dice', () => {
    expect(hojaGuia({ emitio: '', recibio: '', renglones: [], hechas: [] }, [], OPC)).toContain('La guía está vacía');
  });
});

describe('recuadro y N°', () => {
  it('la hoja es .orden-hoja con título en caja, marco y relleno', () => {
    const h = hojaGuia(GUIA, ORD, { ...OPC, numero: '0966' });
    expect(h).toMatch(/^<div class="gt-hoja orden-hoja">/);
    expect(h).toContain('class="gt-tit"');
    expect(h).toContain('class="gt-relleno"');
  });
  it('N° editable para el editor, fijo para el lector, ____ si falta', () => {
    expect(hojaGuia(GUIA, ORD, { ...OPC, numero: '0966' })).toMatch(/<span class="gt-numot" contenteditable="plaintext-only" data-numero>0966<\/span>/);
    expect(hojaGuia(GUIA, ORD, { ...OPC, puedeEditar: false, numero: '' })).toContain('<span class="gt-numot">____</span>');
  });
});

describe('hojaImpresa', () => {
  const foto = { emitio: 'Ori', recibio: 'Enzo', renglones: [
    { n: 1, tipo: 'tarea', texto: 'Lavar <b>' }, { n: 0, tipo: 'nota', texto: 'ojo' }, { n: 2, tipo: 'orden', texto: 'Traslado · N° 0957' } ] };
  const h = hojaImpresa({ numero: '0966', fechaTxt: '11/11/2026', anio: '2026', foto });
  it('misma hoja, con N°, fecha y firmas, sin controles ni enlaces', () => {
    expect(h).toContain('ORDEN DE TRABAJO - RCI 08 - Rev. 02');
    expect(h).toContain('<span class="gt-numot">0966</span>');
    expect(h).toContain('11/11/2026');
    expect(h).toContain('Ori');
    expect(h).not.toContain('gt-ctl');
    expect(h).not.toContain('contenteditable');
    expect(h).not.toContain('<a ');
  });
  it('numera como salió, escapa, y la orden lleva su marca', () => {
    expect(h).toMatch(/gt-num">1<[\s\S]*?Lavar &lt;b&gt;/);
    expect(h).toMatch(/<tr class="gt-r gt-nota"><td class="gt-num"><\/td><td class="gt-chk"><\/td>/);
    expect(h).toContain('<span class="gt-ordtxt">Traslado · N° 0957</span>');
  });
});

describe('extrasGuia', () => {
  it('lista hechas con Deshacer y ocultas con Volver a mostrar', () => {
    const e = extrasGuia(GUIA, ORD, { puedeEditar: true });
    expect(e).toContain('Mechado');
    expect(e).toContain('data-acc="deshacer" data-id="z"');
    expect(e).toContain('N° 0960');
    expect(e).toContain('data-acc="mostrar" data-id="h"');
  });
  it('cada <details> tiene una clave estable (data-k) para poder recordar si estaba abierto al repintar', () => {
    const e = extrasGuia(GUIA, ORD, { puedeEditar: true });
    expect(e).toContain('<details class="gt-extra" data-k="hechas">');
    expect(e).toContain('<details class="gt-extra" data-k="ocultas">');
  });
  it('nada que mostrar: vacío', () => {
    expect(extrasGuia({ ...GUIA, hechas: [], renglones: [] }, [], { puedeEditar: true })).toBe('');
  });
});
