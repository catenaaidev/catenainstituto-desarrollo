import { describe, it, expect } from 'vitest';
import { esVaciado, claveTiempo, ordenarPorTiempo, ultimoAnalisis }
  from '../public/prensas/js/reglas-lote.js';

describe('esVaciado', () => {
  it('0 litros es vaciado, con número o texto', () => {
    expect(esVaciado({ litros: 0 })).toBe(true);
    expect(esVaciado({ litros: '0' })).toBe(true);
    expect(esVaciado({ litros: '0,0' })).toBe(true);
  });
  it('con litros no es vaciado', () => {
    expect(esVaciado({ litros: 225 })).toBe(false);
    expect(esVaciado({ litros: '50' })).toBe(false);
  });
  it('sin el dato NO es vaciado (lote recién creado)', () => {
    expect(esVaciado({ litros: null })).toBe(false);
    expect(esVaciado({ litros: '' })).toBe(false);
    expect(esVaciado({})).toBe(false);
    expect(esVaciado(null)).toBe(false);
    expect(esVaciado(undefined)).toBe(false);
  });
});

describe('claveTiempo', () => {
  it('usa la fecha ISO si la hay', () => {
    expect(claveTiempo({ lote: 25701, mes: 1, fecha: '2026-01-16' })).toBe('2026-01-16');
  });
  it('sin fecha usa año del lote + mes', () => {
    expect(claveTiempo({ lote: 25701, mes: 3, fecha: null })).toBe('2025-03-00');
  });
  it('sin fecha ni año queda al principio', () => {
    expect(claveTiempo({ lote: null, mes: null, fecha: null })).toBe('0000-00-00');
  });
});

describe('ultimoAnalisis', () => {
  it('enero del año siguiente gana a diciembre', () => {
    const dic = { lote: 25701, mes: 12, fecha: '2025-12-10' };
    const ene = { lote: 25701, mes: 1, fecha: '2026-01-16' };
    expect(ultimoAnalisis([ene, dic])).toBe(ene);
  });
  it('dentro del mismo mes gana la fecha más nueva', () => {
    const a = { lote: 26701, mes: 3, fecha: '2026-03-03' };
    const b = { lote: 26701, mes: 3, fecha: '2026-03-20' };
    expect(ultimoAnalisis([b, a])).toBe(b);
  });
  it('empate exacto: gana el que viene después en la lista (como antes)', () => {
    const a = { lote: 26701, mes: 3, fecha: '2026-03-03', ph: 1 };
    const b = { lote: 26701, mes: 3, fecha: '2026-03-03', ph: 2 };
    expect(ultimoAnalisis([a, b])).toBe(b);
  });
  it('lista vacía da null', () => {
    expect(ultimoAnalisis([])).toBe(null);
  });
});

describe('ordenarPorTiempo', () => {
  it('ordena ascendente sin tocar la lista original', () => {
    const r = [{ lote: 25701, fecha: '2026-01-16' }, { lote: 25701, fecha: '2025-12-10' }];
    const o = ordenarPorTiempo(r);
    expect(o.map(x => x.fecha)).toEqual(['2025-12-10', '2026-01-16']);
    expect(r[0].fecha).toBe('2026-01-16');
  });
});
