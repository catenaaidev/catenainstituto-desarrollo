/* Tests del autocompletado de la Orden de muestras: al tipear un numero de lote
 * en una hoja en blanco, la fila tiene que salir igual que si la hubiera traido
 * el filtro. datosDeLote es el unico lugar que arma esos campos. */
import { describe, it, expect } from 'vitest';
import { datosDeLote, claveLote } from '../public/lotes/js/orden-filas.js';

const DASH = { lote: '26264', variedad: 'Malbec', vencido: true,
               dias_desde_control: 40, frecuencia_max: 30, alarmas: [] };
const INFO = { lote: '26264', variedad: 'Malbec', vasija_actual: 'H 170 + Barricas',
               vasija_grande: 2600, litros_actuales: 3050 };

describe('datosDeLote', () => {
  it('arma variedad, vasija, litros y motivo desde el lote', () => {
    expect(datosDeLote(DASH, INFO, 'hoja_en_blanco')).toEqual({
      variedad: 'Malbec', vasija: 'H 170', litros: '2600 de 3050', motivo: 'Vencido',
    });
  });

  it('sin fila del dashboard igual trae variedad, vasija y litros', () => {
    const d = datosDeLote(undefined, INFO, 'hoja_en_blanco');
    expect(d.variedad).toBe('Malbec');
    expect(d.vasija).toBe('H 170');
    expect(d.motivo).toBe('');
  });

  it('sin lote completo trae lo que tiene el dashboard', () => {
    const d = datosDeLote(DASH, undefined, 'todos');
    expect(d).toEqual({ variedad: 'Malbec', vasija: '', litros: '', motivo: 'Vencido' });
  });
});

describe('claveLote', () => {
  it('iguala espacios y numeros', () => {
    expect(claveLote(' 26264 ')).toBe('26264');
    expect(claveLote(26264)).toBe('26264');
    expect(claveLote(null)).toBe('');
  });
});

import { parsearListaLotes, ordenarFilasOt } from '../public/lotes/js/orden-filas.js';

describe('parsearListaLotes', () => {
  it('acepta una columna del Excel', () => {
    expect(parsearListaLotes('26264\r\n26015\r\n26064\r\n')).toEqual(['26264', '26015', '26064']);
  });
  it('acepta una fila del Excel (tabs), comas y espacios', () => {
    expect(parsearListaLotes('26264\t26015\t26064')).toEqual(['26264', '26015', '26064']);
    expect(parsearListaLotes('26264, 26015; 26064  26126')).toEqual(['26264', '26015', '26064', '26126']);
  });
  it('saca repetidos y conserva el orden', () => {
    expect(parsearListaLotes('26015\n26264\n26015')).toEqual(['26015', '26264']);
  });
  it('texto vacio da lista vacia', () => {
    expect(parsearListaLotes('  \n\t ')).toEqual([]);
  });
});

describe('ordenarFilasOt', () => {
  const F = [
    { lote: '26264', variedad: 'Cabernet Sauvignon', litros: '1850' },
    { lote: '',      variedad: '',                   litros: '' },
    { lote: '26015', variedad: 'chardonnay',         litros: '150' },
    { lote: '26140', variedad: 'Sangiovese',         litros: '2600 de 3050' },
  ];
  const lotes = fs => fs.map(f => f.lote);

  it('lote de menor a mayor y al reves, con las vacias al final', () => {
    expect(lotes(ordenarFilasOt(F, 'lote', 1))).toEqual(['26015', '26140', '26264', '']);
    expect(lotes(ordenarFilasOt(F, 'lote', -1))).toEqual(['26264', '26140', '26015', '']);
  });
  it('litros ordena por numero, no por texto', () => {
    expect(lotes(ordenarFilasOt(F, 'litros', -1))).toEqual(['26140', '26264', '26015', '']);
  });
  it('texto sin importar mayusculas', () => {
    expect(lotes(ordenarFilasOt(F, 'variedad', 1))).toEqual(['26264', '26015', '26140', '']);
  });
  it('no modifica el array original', () => {
    ordenarFilasOt(F, 'lote', 1);
    expect(lotes(F)).toEqual(['26264', '', '26015', '26140']);
  });
});
