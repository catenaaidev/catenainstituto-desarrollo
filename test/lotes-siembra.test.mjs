import { describe, it, expect } from 'vitest';
import { sembrarCriterios, BLANCAS } from '../scripts/sembrar-criterios-fml.mjs';

describe('siembra de criterios', () => {
  it('siembra las 15 blancas y los dos grupos de pH', () => {
    const { config, agregadas } = sembrarCriterios({});
    expect(BLANCAS).toHaveLength(15);
    expect(config.por_variedad.Chardonnay.hace_fml).toBe('no');
    expect(config.por_variedad.Chardonnay.ph_max).toBe(3.65);
    expect(config.por_variedad['Cabernet Sauvignon'].ph_max_inclusive).toBe('si');
    expect(config.por_proyecto['El Amiguito'].so2_aplica).toBe('no');
    expect(agregadas.length).toBeGreaterThan(0);
  });

  it('no pisa lo que alguien ya edito', () => {
    const previo = { por_variedad: { Chardonnay: { ph_max: 3.5 } } };
    const { config } = sembrarCriterios(previo);
    expect(config.por_variedad.Chardonnay.ph_max).toBe(3.5);   // respetado
    expect(config.por_variedad.Chardonnay.hace_fml).toBe('no'); // completado
  });

  it('correrlo dos veces no agrega nada la segunda', () => {
    const uno = sembrarCriterios({});
    const dos = sembrarCriterios(uno.config);
    expect(dos.agregadas).toEqual([]);
  });
});
