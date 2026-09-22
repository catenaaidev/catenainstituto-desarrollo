import { describe, it, expect } from 'vitest';
import { textoCriterios } from '../public/lotes/js/tablero-datos.js';
import { CRITERIOS_DEFAULT } from '../public/lotes/js/criterios.js';

const regla = (lista, titulo) => lista.find(x => x.titulo === titulo).regla;

describe('textoCriterios', () => {
  it('escribe los umbrales que rigen, no los del codigo', () => {
    const lista = textoCriterios({ ...CRITERIOS_DEFAULT, ph_max: 3.65 });
    expect(regla(lista, 'pH no OK')).toContain('3.65');
    expect(regla(lista, 'pH no OK')).not.toContain('3.75');
  });

  it('el pH inclusivo cambia el signo, no solo el numero', () => {
    expect(regla(textoCriterios({ ...CRITERIOS_DEFAULT, ph_max: 3.79, ph_max_inclusive: 'si' }), 'pH no OK')).toContain('≥ 3.79');
    expect(regla(textoCriterios(CRITERIOS_DEFAULT), 'pH no OK')).toContain('> 3.75');
  });

  it('dice que el SO2 no aplica cuando el proyecto lo apaga', () => {
    expect(regla(textoCriterios({ ...CRITERIOS_DEFAULT, so2_aplica: 'no' }), 'SO2 no OK')).toContain('No se evalúa');
  });

  it('nombra las once condiciones', () => {
    expect(textoCriterios(CRITERIOS_DEFAULT)).toHaveLength(11);
  });
});
