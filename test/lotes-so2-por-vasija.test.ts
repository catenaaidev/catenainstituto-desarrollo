import { describe, it, expect } from 'vitest';
import { asignarVasija, medicionesPorVasija } from '../src/lotes/motores/so2-por-vasija';
import { valorValido } from '../src/lotes/motores/fml';

const u = (num: string, cap = 225) => ({ num, cap, litros: cap, estado: 'LLENO' });
const LOTE = [u('1100923'), u('1100305'), u('1100527'), u('1100051'), u('50042', 50), u('1140446', 200)];

describe('asignarVasija', () => {
  it('sin texto o sin dígitos (nombre de tanque) es análisis del lote', () => {
    expect(asignarVasija('', LOTE)).toEqual({ tipo: 'lote' });
    expect(asignarVasija(null, LOTE)).toEqual({ tipo: 'lote' });
    expect(asignarVasija('Barricas', LOTE)).toEqual({ tipo: 'lote' });
  });
  it('número completo gana (T50 se carga con el número completo)', () => {
    expect(asignarVasija('50042', LOTE)).toEqual({ tipo: 'vasija', num: '50042' });
    expect(asignarVasija('1100923', LOTE)).toEqual({ tipo: 'vasija', num: '1100923' });
  });
  it('hasta 3 dígitos: por los últimos 3 del barril (con ceros a la izquierda)', () => {
    expect(asignarVasija('923', LOTE)).toEqual({ tipo: 'vasija', num: '1100923' });
    expect(asignarVasija('51', LOTE)).toEqual({ tipo: 'vasija', num: '1100051' });
    expect(asignarVasija(' 446 ', LOTE)).toEqual({ tipo: 'vasija', num: '1140446' });
    expect(asignarVasija('B923', LOTE)).toEqual({ tipo: 'vasija', num: '1100923' });
  });
  it('más de 3 dígitos sin número completo igual NO cae a los últimos 3', () => {
    expect(asignarVasija('50923', LOTE)).toEqual({ tipo: 'sin_match', texto: '50923' });
  });
  it('dos vasijas que terminan igual: ambiguo', () => {
    const r = asignarVasija('042', [...LOTE, u('1200042'), u('1300042')]);
    expect(r).toEqual({ tipo: 'ambiguo', texto: '042', nums: ['1200042', '1300042'] });
  });
  it('los últimos 3 dígitos NO matchean T50 (se cargan con el número completo)', () => {
    expect(asignarVasija('042', LOTE)).toEqual({ tipo: 'sin_match', texto: '042' });
    expect(asignarVasija('042', [...LOTE, u('1200042')])).toEqual({ tipo: 'vasija', num: '1200042' });
    expect(asignarVasija('50042', LOTE)).toEqual({ tipo: 'vasija', num: '50042' });
  });
  it('nombres de tanque o lugar con números son análisis del lote', () => {
    for (const t of ['T 201', 'Nave 2', '12 barricas', 'Tanque 12', 'H 170 + Barricas', 'h172', '923/305']) {
      expect(asignarVasija(t, LOTE)).toEqual({ tipo: 'lote' });
    }
    expect(asignarVasija('B 923', LOTE)).toEqual({ tipo: 'vasija', num: '1100923' });
  });
  it('número que no está en el lote: sin_match', () => {
    expect(asignarVasija('777', LOTE)).toEqual({ tipo: 'sin_match', texto: '777' });
  });
  it('t50 / t200 sin número: la única de esa capacidad, si no ambiguo', () => {
    expect(asignarVasija('t50', LOTE)).toEqual({ tipo: 'vasija', num: '50042' });
    expect(asignarVasija('T200', LOTE)).toEqual({ tipo: 'vasija', num: '1140446' });
    const dos = asignarVasija('t50', [...LOTE, u('50043', 50)]);
    expect(dos.tipo).toBe('ambiguo');
    expect(asignarVasija('t50', [u('1100923')])).toEqual({ tipo: 'sin_match', texto: 't50' });
  });
});

const so2De = (a: any) => valorValido(a.so2_libre);
const B = [u('1100923'), u('1100305'), u('1100527'), u('1100051')];
const an = (fecha: string, so2: number, vasija?: string, ph?: number) =>
  ({ lote: '26056', fecha_analisis: fecha, so2_libre: so2, ...(vasija ? { vasija } : {}), ...(ph ? { ph } : {}) });

describe('medicionesPorVasija', () => {
  it('sin análisis por vasija: no es por vasija', () => {
    const r = medicionesPorVasija([an('2026-10-01', 20, undefined, 3.6)], B, so2De);
    expect(r.porVasija).toBe(false);
    expect(r.analisisLote).toHaveLength(1);
  });
  it('caso 26056: cada barril su SO2', () => {
    const r = medicionesPorVasija([
      an('2026-10-01', 20, undefined, 3.6),
      an('2026-10-09', 6, '923', 3.7), an('2026-10-09', 41, '305', 3.5),
      an('2026-10-09', 23, '527', 3.6), an('2026-10-09', 8, '51'),
    ], B, so2De);
    expect(r.porVasija).toBe(true);
    expect(r.vasijas.get('1100923')).toMatchObject({ so2: 6, ph: 3.7, fuente: 'propio', fecha: '2026-10-09' });
    expect(r.vasijas.get('1100305')!.so2).toBe(41);
    // sin pH propio ni anterior de la vasija: el último pH del lote
    expect(r.vasijas.get('1100051')).toMatchObject({ so2: 8, ph: 3.6, fuente: 'propio' });
    expect(r.fechaPropia).toBe('2026-10-09');
  });
  it('mismo día gana la vasija', () => {
    const r = medicionesPorVasija([an('2026-10-09', 20), an('2026-10-09', 6, '923')], B, so2De);
    expect(r.porVasija).toBe(true);
    expect(r.vasijas.get('1100923')!.fuente).toBe('propio');
  });
  it('análisis del lote más nuevo: vuelve a lo normal', () => {
    const r = medicionesPorVasija([an('2026-10-09', 6, '923'), an('2026-10-15', 30)], B, so2De);
    expect(r.porVasija).toBe(false);
  });
  it('vasija sin análisis propio: sin SO2 y con aviso', () => {
    const r = medicionesPorVasija([an('2026-10-09', 6, '923')], B, so2De);
    expect(r.vasijas.get('1100305')).toMatchObject({ so2: null, fuente: null });
    expect(r.vasijas.get('1100305')!.aviso).toMatch(/sin análisis propio/);
  });
  it('pH: el anterior de la misma vasija antes que el del lote', () => {
    const r = medicionesPorVasija([
      an('2026-09-01', 30, undefined, 3.4),
      an('2026-10-01', 10, '923', 3.8),
      an('2026-10-09', 6, '923'),
    ], B, so2De);
    expect(r.vasijas.get('1100923')).toMatchObject({ so2: 6, ph: 3.8 });
  });
  it('ambiguo y sin_match van a avisos del lote', () => {
    const r = medicionesPorVasija([an('2026-10-09', 6, '923'), an('2026-10-09', 9, '777')], B, so2De);
    expect(r.avisos).toEqual(['la vasija «777» no está llena en este lote']);
  });
  it('lote sin vasijas en el Mapa: nunca es por vasija', () => {
    const r = medicionesPorVasija([an('2026-10-09', 6, '923')], [], so2De);
    expect(r.porVasija).toBe(false);
  });
  it('fecha nula = la más nueva (igual que ordenarPorFecha)', () => {
    const sinFecha = { lote: '26056', fecha_analisis: null, so2_libre: 6, vasija: '923' };
    expect(medicionesPorVasija([an('2026-10-09', 20), sinFecha], B, so2De).porVasija).toBe(true);
    const loteSinFecha = { lote: '26056', fecha_analisis: null, so2_libre: 20 };
    expect(medicionesPorVasija([an('2026-10-09', 6, '923'), loteSinFecha], B, so2De).porVasija).toBe(false);
  });
  it('expone el último análisis del lote (SO2 y pH) para el tanque', () => {
    const r = medicionesPorVasija([an('2026-09-01', 30, undefined, 3.4), an('2026-10-01', 20), an('2026-10-09', 6, '923')], B, so2De);
    expect(r.so2Lote).toBe(20);
    expect(r.phLote).toBe(3.4);
  });
  it('fecha de la alerta: la del análisis asignado más nuevo, no la de uno sin match', () => {
    const r = medicionesPorVasija([an('2026-10-09', 6, '923'), an('2026-10-12', 9, '777')], B, so2De);
    expect(r.fechaPropia).toBe('2026-10-09');
  });
  it('analizaron 4 de 5: la quinta queda sin dosis aunque haya un análisis viejo del lote', () => {
    const r = medicionesPorVasija([an('2026-09-01', 30, undefined, 3.4), an('2026-10-09', 6, '923')], B, so2De);
    expect(r.vasijas.get('1100305')).toMatchObject({ so2: null, fuente: null });
  });
});
