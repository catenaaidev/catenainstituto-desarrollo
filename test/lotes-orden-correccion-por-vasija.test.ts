import { describe, it, expect } from 'vitest';
import { normalizarMapa } from '../src/lotes/motores/mapa';
import { armarOrden } from '../src/lotes/motores/correccion';
import { objetivoSo2Libre, calcularCorreccionSo2, CRITERIOS_DEFAULT } from '../src/lotes/motores/fml';

const d = (iso: string) => Date.parse(iso + 'T00:00:00Z');
const HOY = d('2026-10-20');
const mapaCon = (inventario: unknown) => normalizarMapa({ version: 1, estado: { inventario } });
const lote = { lote: '26056', variedad: 'Malbec', litros_actuales: 900, etapa: 'crianza' };
const barril = (num: string) => ({ num, lote: '26056', cap: 225, litros: 225, estado: 'LLENO' });
const MAPA = mapaCon(['1100923', '1100305', '1100527', '1100051'].map(barril));
const an = (fecha: string, so2: number, vasija?: string, ph = 3.6) =>
  ({ lote: '26056', fecha_analisis: fecha, so2_libre: so2, ph, ...(vasija ? { vasija } : {}) });

describe('armarOrden barril por barril', () => {
  it('26056: cada barril con su SO2 y su dosis; el lote toma la peor', () => {
    const o = armarOrden({ lotes: [lote], analisis: [
      an('2026-10-01', 20), an('2026-10-09', 6, '923'), an('2026-10-09', 41, '305'),
      an('2026-10-09', 23, '527'), an('2026-10-09', 8, '51'),
    ] }, MAPA, HOY);
    expect(o.lotes).toHaveLength(1);
    const l = o.lotes[0];
    expect(l.por_vasija).toBe(true);
    expect(l.so2_libre).toBe(6);
    expect(l.so2_min).toBe(6);
    expect(l.so2_max).toBe(41);
    const por = Object.fromEntries(l.barricas.map((b) => [b.num, b]));
    expect(por['1100923'].so2_libre).toBe(6);
    expect(por['1100305'].so2_libre).toBe(41);
    expect(por['1100923'].mbk_g!).toBeGreaterThan(por['1100527'].mbk_g!);
    // dosis distinta por barril
    expect(new Set(l.barricas.map((b) => b.mbk_g)).size).toBeGreaterThan(1);
  });
  it('análisis del lote más nuevo: como hoy, misma dosis para todos', () => {
    const o = armarOrden({ lotes: [lote], analisis: [an('2026-10-09', 6, '923'), an('2026-10-15', 20)] }, MAPA, HOY);
    const l = o.lotes[0];
    expect(l.por_vasija).toBeUndefined();
    expect(new Set(l.barricas.map((b) => b.mbk_g)).size).toBe(1);
  });
  it('barril sin análisis propio: sin dosis y con aviso', () => {
    const o = armarOrden({ lotes: [lote], analisis: [an('2026-10-09', 6, '923')] }, MAPA, HOY);
    const b = o.lotes[0].barricas.find((x) => x.num === '1100305')!;
    expect(b.mbk_g).toBeNull();
    expect(b.aviso).toMatch(/sin análisis propio/);
  });
  it('todas en objetivo: activable en_objetivo', () => {
    const o = armarOrden({ lotes: [lote], analisis: ['923', '305', '527', '51'].map((v) => an('2026-10-09', 60, v)) }, MAPA, HOY);
    expect(o.lotes).toHaveLength(0);
    expect(o.activables[0]).toMatchObject({ lote: '26056', fuera: 'en_objetivo', por_vasija: true });
  });
});

// Fix round 1 (revisión de Task 3): casos borde que la primera tanda de tests
// no cubría. Mismo MAPA/lote/an() de arriba. `lote.vasija_grande = 100` da
// veredicto 'difiere' (no 'solo_representacion'): declarado = 0, litros_mapa
// de las 4 barricas = 900, |0 + 100 − 900| = 800 > UMBRAL_REPRESENTACION (250).
describe('armarOrden barril por barril: casos borde', () => {
  const loteConTanque = { ...lote, vasija_grande: 100 };
  const eff = CRITERIOS_DEFAULT;
  const ph = 3.6;
  const objLote = objetivoSo2Libre(ph, eff)!;

  it('tanque grande, por vasija, con dato de lote: se dosifica con so2/ph del LOTE', () => {
    const o = armarOrden({ lotes: [loteConTanque], analisis: [
      an('2026-10-01', 20), an('2026-10-09', 6, '923'), an('2026-10-09', 41, '305'),
      an('2026-10-09', 23, '527'), an('2026-10-09', 8, '51'),
    ] }, MAPA, HOY);
    const l = o.lotes[0];
    expect(l.por_vasija).toBe(true);
    const tanque = l.barricas.find((b) => b.num === '')!;
    expect(tanque).toBeDefined();
    expect(tanque.litros_usados).toBe(100);
    const esperado = calcularCorreccionSo2(0, objLote - 20, 100);
    expect(tanque.mbk_g).toBeCloseTo(esperado.mbk_a_agregar!, 6);
    expect(tanque.aviso).toBeUndefined();
  });

  it('tanque grande, por vasija: lleva el SO2/pH/objetivo del lote para que el cliente lo dosifique', () => {
    const o = armarOrden({ lotes: [loteConTanque], analisis: [
      an('2026-10-01', 20), an('2026-10-09', 6, '923'), an('2026-10-09', 41, '305'),
    ] }, MAPA, HOY);
    const tanque = o.lotes[0].barricas.find((b) => b.num === '')!;
    expect(tanque).toMatchObject({ so2_libre: 20, ph: 3.6, objetivo: objLote, fuente: 'lote' });
  });

  it('vasija con SO2 propio pero sin ningún pH: sin dosis, conserva su SO2', () => {
    const sinPh = (fecha: string, so2: number, vasija: string) => ({ lote: '26056', fecha_analisis: fecha, so2_libre: so2, vasija });
    const o = armarOrden({ lotes: [lote], analisis: [sinPh('2026-10-09', 6, '923'), an('2026-10-09', 10, '305')] }, MAPA, HOY);
    const b = o.lotes[0].barricas.find((x) => x.num === '1100923')!;
    expect(b.mbk_g).toBeNull();
    expect(b).toMatchObject({ so2_libre: 6, ph: null, fuente: 'propio', aviso: 'sin objetivo (sin pH)' });
  });

  it('nombre de tanque con números en vasija: análisis del lote, modo normal', () => {
    const o = armarOrden({ lotes: [lote], analisis: [an('2026-10-01', 20), an('2026-10-09', 6, 'T 201')] }, MAPA, HOY);
    const l = o.lotes[0];
    expect(l.por_vasija).toBeUndefined();
    expect(l.so2_libre).toBe(6);
  });

  it('tanque grande, por vasija, SIN ningún análisis de lote: sin dosis y con aviso', () => {
    const o = armarOrden({ lotes: [loteConTanque], analisis: [
      an('2026-10-09', 6, '923'), an('2026-10-09', 41, '305'), an('2026-10-09', 23, '527'), an('2026-10-09', 8, '51'),
    ] }, MAPA, HOY);
    const l = o.lotes[0];
    expect(l.por_vasija).toBe(true);
    const tanque = l.barricas.find((b) => b.num === '')!;
    expect(tanque.mbk_g).toBeNull();
    expect(tanque.aviso).toBe('sin SO₂ o pH válido del lote');
  });

  it('ninguna vasija calculable (solo un análisis ambiguo/sin match) con dato de lote: cae al lote', () => {
    // '777' no matchea ninguna de las 4 barricas (923/305/527/051): sin_match.
    // Al venir en analisis[].vasija entra a deVasija y sigue disparando el
    // modo por vasija, aunque no asigne ninguna barrica.
    const o = armarOrden({ lotes: [lote], analisis: [
      an('2026-10-01', 20), an('2026-10-09', 99, '777'),
    ] }, MAPA, HOY);
    const l = o.lotes[0];
    expect(l.por_vasija).toBe(true);
    expect(l.so2_libre).toBe(20);
    expect(l.ph).toBe(3.6);
    expect(l.so2_min).toBeUndefined();
    expect(l.so2_max).toBeUndefined();
    expect(l.avisos_vasija).toContain('la vasija «777» no está llena en este lote');
    for (const b of l.barricas) {
      expect(b.mbk_g).toBeNull();
      expect(b.aviso).toMatch(/sin análisis propio/);
    }
  });

  it('ninguna vasija calculable y SIN dato de lote: no_calculables', () => {
    const o = armarOrden({ lotes: [lote], analisis: [an('2026-10-09', 99, '777')] }, MAPA, HOY);
    expect(o.lotes).toHaveLength(0);
    expect(o.no_calculables).toEqual([
      { lote: '26056', variedad: 'Malbec', so2_libre: null, ph: null, motivo: 'sin SO2 valido' },
    ]);
  });

  it('una barrica sin análisis propio, el resto en objetivo: activable en_objetivo, la sin-análisis queda sin dosis', () => {
    const o = armarOrden({ lotes: [lote], analisis: [
      an('2026-10-09', 60, '923'), an('2026-10-09', 60, '305'), an('2026-10-09', 60, '527'),
      // '51' (barrica 1100051) no tiene ningún análisis propio.
    ] }, MAPA, HOY);
    expect(o.lotes).toHaveLength(0);
    const act = o.activables[0];
    expect(act).toMatchObject({ lote: '26056', fuera: 'en_objetivo', por_vasija: true });
    const sinAnalisis = act.barricas.find((b) => b.num === '1100051')!;
    expect(sinAnalisis.mbk_g).toBeNull();
    expect(sinAnalisis.aviso).toMatch(/sin análisis propio/);
  });

  it('corrección dentro de la ventana + remedido POR BARRICA a ±5 ppm: NO se suprime (el ±5 ppm es del lote entero)', () => {
    const corregido = {
      lote: '26056', fecha_analisis: '2026-10-05', so2_libre: 18,
      correccion: { ot_n: 'B230', fecha: '2026-10-05', so2_libre_actual: 20 },
    };
    const o = armarOrden({ lotes: [lote], analisis: [corregido, an('2026-10-09', 22, '923')] }, MAPA, HOY);
    expect(o.suprimidos).toHaveLength(0);
    expect(o.lotes).toHaveLength(1);
    const l = o.lotes[0];
    expect(l.por_vasija).toBe(true);
    expect(l.corregido_en).not.toBeNull();
  });

  it('mismos datos SIN vasija: se suprime como siempre (±5 ppm del lote)', () => {
    const corregido = {
      lote: '26056', fecha_analisis: '2026-10-05', so2_libre: 18,
      correccion: { ot_n: 'B230', fecha: '2026-10-05', so2_libre_actual: 20 },
    };
    const o = armarOrden({ lotes: [lote], analisis: [corregido, an('2026-10-09', 22)] }, MAPA, HOY);
    expect(o.suprimidos).toHaveLength(1);
    expect(o.lotes).toHaveLength(0);
  });
});
