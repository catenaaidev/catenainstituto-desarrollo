import { describe, it, expect } from 'vitest';
import { criteriosEfectivos, objetivoSo2Libre, objetivoSo2LibreOT } from '../src/lotes/motores/fml';

describe('CIW-01b: techo operativo sin alterar objetivo quimico', () => {
  const cfg = () => criteriosEfectivos({}, 'Malbec');
  it('preserva el objetivo molecular original por encima de 40 ppm', () => {
    const p = 3.9;
    expect(objetivoSo2Libre(p, cfg())).toBeCloseTo(0.38 * (1 + 10 ** (p - 1.8)), 9);
    expect(objetivoSo2LibreOT(p, cfg())).toBe(40);
  });
  it('acepta techo configurable y conserva piso quimico', () => {
    const c = Object.assign(cfg(), { so2_libre_piso: 51.6, so2_libre_techo: 35 });
    expect(objetivoSo2Libre(3, c)).toBeCloseTo(51.6, 9);
    expect(objetivoSo2LibreOT(3, c)).toBe(35);
  });
  it('mantiene los objetivos inferiores al techo', () => {
    expect(objetivoSo2LibreOT(3, cfg())).toBe(objetivoSo2Libre(3, cfg()));
  });
  it('no inventa objetivo cuando falta pH', () => {
    expect(objetivoSo2LibreOT(null, cfg())).toBeNull();
  });
  it('limita todas las evaluaciones de pH al techo predeterminado', () => {
    for (let p = 2.5; p <= 4.5; p += 0.025) {
      expect(objetivoSo2LibreOT(p, cfg())!).toBeLessThanOrEqual(40);
    }
  });
});
