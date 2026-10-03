/**
 * La tarjeta "SO₂ bajo objetivo" del Dashboard y su grafico tienen que contar
 * los MISMOS lotes que la alarma so2_no_ok del motor, que es la que muestran la
 * tabla de alarmas de la misma pantalla y el Tablero FML.
 *
 * Antes la tarjeta juzgaba por su cuenta y se separaba en tres bordes, los tres
 * vistos en los datos reales del 2026-10-02 (57 en la tarjeta, 58 en la alarma):
 *   - un proyecto sin SO2 (El Amiguito, so2_aplica 'no') contaba como deficit y
 *     sumaba gramos;
 *   - el placeholder 0 del ultimo analisis se tomaba como medicion;
 *   - el piso se comparaba distinto que en el motor.
 */
import { describe, it, expect } from 'vitest';
import { datosDashboard } from '../src/lotes/vistas';
import { metricasPorLote, resumen } from '../public/lotes/js/dash-metricas.js';

const HOY = Date.parse('2026-10-02T00:00:00Z');

const lote = (n, extra = {}) => ({
  lote: n, variedad: 'Malbec', proyecto: 'Base', litros_actuales: 1000,
  mermo: 'no', hace_fml: 'si', ...extra,
});
const an = (n, fecha, extra) => ({
  lote: n, fecha_analisis: fecha, etanol: 14, av: 0.4, malico: 0.1, ...extra,
});

function armar(lotes, analisis, porProyecto = {}) {
  const datos = {
    lotes, analisis, movimientos: [],
    config: { criterios_fml: { default: { so2_libre_piso: 25 }, por_proyecto: porProyecto } },
  };
  const dash = datosDashboard(JSON.parse(JSON.stringify(datos)), HOY);
  return { dash, filas: metricasPorLote(dash, datos) };
}

const alarmaSo2 = (dash) => (dash.alarmas.so2_no_ok || { cantidad: 0 }).cantidad;

describe('tarjeta SO₂ bajo objetivo del Dashboard', () => {
  it('no cuenta un proyecto que no lleva SO2', () => {
    const { dash, filas } = armar(
      [lote('26067', { proyecto: 'El Amiguito' })],
      [an('26067', '2026-09-20', { so2_libre: 4, ph: 3.2 })],
      { 'El Amiguito': { so2_aplica: 'no' } },
    );
    const r = resumen(filas);
    expect(alarmaSo2(dash)).toBe(0);
    expect(r.deficitSo2).toBe(0);
    expect(r.deficitGramos).toBe(0);
    // Tampoco es un lote "sin datos para evaluar": no hay nada que evaluar.
    expect(r.sinDatoSo2).toBe(0);
    expect(filas[0].so2Banda).toBeNull();
  });

  it('no toma el placeholder 0 como medicion', () => {
    const { dash, filas } = armar(
      [lote('26100')],
      [
        an('26100', '2026-09-10', { so2_libre: 32, ph: 3.4 }),
        an('26100', '2026-09-25', { so2_libre: 0, ph: 3.4 }),
      ],
    );
    expect(alarmaSo2(dash)).toBe(0);
    expect(resumen(filas).deficitSo2).toBe(0);
    expect(filas[0].so2).toBe(32);
  });

  it('el libre igual al piso no es deficit', () => {
    const { dash, filas } = armar(
      [lote('26045')],
      [an('26045', '2026-09-20', { so2_libre: 25, ph: 3.33 })],
    );
    expect(alarmaSo2(dash)).toBe(0);
    expect(resumen(filas).deficitSo2).toBe(0);
  });

  it('cuenta los mismos lotes que la alarma del motor', () => {
    const { dash, filas } = armar(
      [lote('1'), lote('2'), lote('3', { proyecto: 'El Amiguito' }), lote('4'), lote('5')],
      [
        an('1', '2026-09-20', { so2_libre: 18, ph: 3.4 }),   // bajo el piso
        an('2', '2026-09-20', { so2_libre: 30, ph: 3.9 }),   // molecular bajo
        an('3', '2026-09-20', { so2_libre: 4, ph: 3.2 }),    // no lleva SO2
        an('4', '2026-09-20', { so2_libre: 25, ph: 3.3 }),   // en el piso: ok
        an('5', '2026-09-20', { so2_libre: 0, ph: 3.3 }),    // placeholder: sin dato
      ],
      { 'El Amiguito': { so2_aplica: 'no' } },
    );
    const r = resumen(filas);
    expect(alarmaSo2(dash)).toBe(2);
    expect(r.deficitSo2).toBe(2);
    expect(r.sinDatoSo2).toBe(1);
    // Los gramos son solo de los dos con deficit: (25-18) y (objetivo-30) a 1000 L.
    expect(r.deficitGramos).toBeGreaterThan(7);
  });
});
