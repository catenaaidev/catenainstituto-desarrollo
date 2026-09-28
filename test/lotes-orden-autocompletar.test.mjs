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
