/* Tests de las cuentas de la tabla virtual (ventana-virtual.js): donde empieza
 * cada fila, cual cae en una altura y que rango dibujar. La parte que toca el
 * DOM (tabla-virtual.js) no se importa: el runtime de Workers no tiene document. */
import { describe, it, expect } from 'vitest';
import { armarOffsets, filaEnAltura, filasVisibles, rangoADibujar,
         scrollParaVer } from '../public/lotes/js/ventana-virtual.js';

describe('armarOffsets', () => {
  it('acumula los altos y deja el total al final', () => {
    const altos = [20, 30, 20];
    expect([...armarOffsets(3, i => altos[i])]).toEqual([0, 20, 50, 70]);
  });
  it('sin filas es solo el cero', () => {
    expect([...armarOffsets(0, () => 20)]).toEqual([0]);
  });
});

describe('filaEnAltura', () => {
  const off = armarOffsets(4, i => [20, 30, 20, 25][i]);   // 0 20 50 70 95
  it('ubica la fila que contiene la altura', () => {
    expect(filaEnAltura(off, 0)).toBe(0);
    expect(filaEnAltura(off, 19.9)).toBe(0);
    expect(filaEnAltura(off, 20)).toBe(1);
    expect(filaEnAltura(off, 69)).toBe(2);
    expect(filaEnAltura(off, 70)).toBe(3);
  });
  it('acota afuera de la tabla', () => {
    expect(filaEnAltura(off, -50)).toBe(0);
    expect(filaEnAltura(off, 95)).toBe(3);
    expect(filaEnAltura(off, 10000)).toBe(3);
  });
  it('con la tabla vacia devuelve 0', () => {
    expect(filaEnAltura(armarOffsets(0, () => 1), 10)).toBe(0);
  });
});

describe('filasVisibles', () => {
  const off = armarOffsets(100, () => 20);   // 2000 de alto
  it('cubre la primera y la ultima fila tocadas, fin exclusivo', () => {
    expect(filasVisibles(off, 0, 100)).toEqual({ ini: 0, fin: 6 });
    expect(filasVisibles(off, 30, 70)).toEqual({ ini: 1, fin: 4 });
  });
  it('al fondo no se pasa de n', () => {
    expect(filasVisibles(off, 1950, 2400)).toEqual({ ini: 97, fin: 100 });
  });
  it('vacia', () => {
    expect(filasVisibles(armarOffsets(0, () => 20), 0, 500)).toEqual({ ini: 0, fin: 0 });
  });
});

describe('rangoADibujar', () => {
  it('sin nada dibujado, lo visible mas el margen', () => {
    expect(rangoADibujar(1000, { ini: 100, fin: 130 }, null, 40)).toEqual({ ini: 60, fin: 170 });
  });
  it('acota en los bordes', () => {
    expect(rangoADibujar(50, { ini: 0, fin: 30 }, null, 40)).toEqual({ ini: 0, fin: 50 });
  });
  it('no redibuja si lo dibujado cubre lo visible con medio margen de sobra', () => {
    expect(rangoADibujar(1000, { ini: 110, fin: 140 }, { ini: 60, fin: 170 }, 40)).toBeNull();
  });
  it('redibuja cuando lo visible se acerca al borde de lo dibujado', () => {
    expect(rangoADibujar(1000, { ini: 140, fin: 160 }, { ini: 60, fin: 170 }, 40))
      .toEqual({ ini: 100, fin: 200 });
  });
  it('en el fondo de la tabla no pide colchon que no existe', () => {
    expect(rangoADibujar(100, { ini: 80, fin: 100 }, { ini: 40, fin: 100 }, 40)).toBeNull();
  });
  it('si la tabla se achico por debajo de lo dibujado, redibuja', () => {
    expect(rangoADibujar(10, { ini: 0, fin: 10 }, { ini: 0, fin: 50 }, 40)).toEqual({ ini: 0, fin: 10 });
  });
});

describe('scrollParaVer', () => {
  it('nada si la fila ya se ve entera', () => {
    expect(scrollParaVer(100, 120, 50, 200)).toBeNull();
  });
  it('sube hasta el borde de arriba de la fila', () => {
    expect(scrollParaVer(40, 60, 50, 200)).toBe(40);
  });
  it('baja lo justo para que entre el borde de abajo', () => {
    expect(scrollParaVer(240, 260, 50, 200)).toBe(60);
  });
});
