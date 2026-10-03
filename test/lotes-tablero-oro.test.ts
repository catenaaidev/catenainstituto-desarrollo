/**
 * Casos de oro: lotes reales del tablero FML aprobado por los supervisores
 * (snapshot del 2026-09-14, var/outputs/estado_actual_lotes.csv).
 *
 * Si uno de estos falla, el motor de la web dejo de decir lo que dice el
 * tablero. Los numeros NO se ajustan para que pase: se arregla el motor.
 *
 * Los datos van literales: el Excel de origen es un archivo vivo y un test que
 * lo lee deja de ser determinista. Los analisis son una reconstruccion a partir
 * de lo que el propio tablero reporta (so2_ultima_valor, so2_ph_referencia,
 * av_ultimo_valor, fecha_ultimo_control_proceso, control_proceso_*), que es lo
 * que el motor necesita para llegar al mismo veredicto.
 *
 * Dos nombres se traducen al pasar del CSV al motor: el tablero escribe
 * "sin_datos" donde el motor usa "sin_dato" (fa_estado y fml_estado), y un
 * mermo vacio aparece en el CSV como el texto "desconocido".
 *
 * Tres de las once condiciones (control_proceso_pendiente, fa_no_finalizada,
 * no_lleno) no ocurren en ninguno de los 249 lotes del snapshot: van con casos
 * sinteticos en las Tasks 3, 8 y 9.
 */
import { describe, it, expect } from 'vitest';
import { evaluarLote, CRITERIOS_DEFAULT } from '../src/lotes/motores/fml';
import { sembrarCriterios } from '../scripts/sembrar-criterios-fml.mjs';

const d = (iso: string) => Date.parse(iso + 'T00:00:00Z');
const HOY = d('2026-09-14');
const CONFIG = { default: { ...CRITERIOS_DEFAULT }, ...sembrarCriterios({}).config };

const proc = (fecha: string, extra: Record<string, unknown> = {}) => ({
  fecha_analisis: fecha, etanol: 13.5, av: 0.4, malico: 0.1, ...extra,
});

const CASOS: Array<{ nombre: string; lote: Record<string, unknown>; analisis: Record<string, unknown>[]; espera: Record<string, unknown> }> = [
  {
    nombre: '26002 Ugni Blanc: el piso manda aunque el molecular alcance',
    lote: { lote: '26002', variedad: 'Ugni Blanc', proyecto: 'Brandy', litros_actuales: 3500, mermo: 'no' },
    analisis: [proc('2026-09-09', { ph: 3.21, so2_libre: 16, av: 0.41 })],
    espera: { so2_estado: 'no_ok', ph_estado: 'ok', fml_estado: 'excluida', fml_excluida_origen: 'variedad_blanca', estado_frecuencia: 'al_dia', alarmas: ['so2_no_ok'] },
  },
  {
    // El tablero aprobado lo daba no_ok. Desde el 2026-10-02 el piso es
    // inclusive por decision de la bodega: 20 clavado en el piso de 20 esta
    // bien (molecular 0,49 a pH 3,4). La caida de 14 ppm sigue alarmando.
    nombre: '26008 Pinot Noir: SO2 en 20 clavado es OK (piso inclusive), y la caida de 14 alarma',
    lote: { lote: '26008', variedad: 'Pinot Noir', proyecto: 'Domaine Nico', litros_actuales: 1575, mermo: 'no', hace_fml: 'si' },
    analisis: [
      proc('2026-08-10', { ph: 3.4, so2_libre: 34 }),
      proc('2026-09-11', { ph: 3.4, so2_libre: 20, av: 0.58 }),
    ],
    espera: { so2_estado: 'ok', fml_estado: 'finalizada', alarmas: ['so2_caida_alerta'] },
  },
  {
    nombre: '26003 Semillon: 24 ppm es OK con el piso nuevo',
    lote: { lote: '26003', variedad: 'Semillón', proyecto: 'Field Blend Blanco', litros_actuales: 100, mermo: 'no' },
    analisis: [proc('2026-09-09', { ph: 3.11, so2_libre: 24, av: 0.0 })],
    espera: { so2_estado: 'ok', ph_estado: 'ok', fml_estado: 'excluida', alarmas: [] },
  },
  {
    nombre: '26079 Chardonnay: pH 3.70 pasa el limite 3.65 de la variedad',
    lote: { lote: '26079', variedad: 'Chardonnay', proyecto: 'White Colluvium', litros_actuales: 725, mermo: 'no' },
    analisis: [proc('2026-09-08', { ph: 3.7, so2_libre: 55, av: 0.14 })],
    espera: { ph_estado: 'no_ok', so2_estado: 'ok', alarmas: ['ph_no_ok'] },
  },
  {
    // ESTE CASO FALLA A PROPOSITO. El motor agrega 'control_proceso_pendiente'
    // que el tablero no tiene: ultimoControlProceso() filtra con valorValido(),
    // que descarta el -999, asi que la corrida del FOSS del 09/09 no cuenta como
    // control de proceso. El original (rules.latest_process_control) pregunta
    // "is not None": el -999 ES una medicion informada, solo que fuera de rango.
    // La fila del CSV lo confirma: control_proceso_av = -999.0 con
    // control_proceso_pendiente = False y estado_frecuencia = al_dia.
    // No se afloja el esperado: se arregla ultimoControlProceso.
    nombre: '26023 Chardonnay: el -999 del FOSS alarma',
    lote: { lote: '26023', variedad: 'Chardonnay', proyecto: 'White Colluvium', litros_actuales: 50, mermo: 'no' },
    analisis: [proc('2026-09-09', { ph: 3.32, so2_libre: 37, av: -999, azucar_reductor: 1.0 })],
    espera: { av_alerta: true, av_motivo: 'fuera_rango_foss', fa_estado: 'finalizada', alarmas: ['av_alerta'] },
  },
  {
    nombre: '26025 Chardonnay: vencido a los 41 dias con frecuencia de 30',
    lote: { lote: '26025', variedad: 'Chardonnay', proyecto: 'White Colluvium', litros_actuales: 50, mermo: 'no' },
    analisis: [proc('2026-08-04', { ph: 3.22, so2_libre: 42, av: 0.01 })],
    espera: { estado_frecuencia: 'vencido', frecuencia_max: 30, alarmas: ['frecuencia_vencida'] },
  },
  {
    nombre: '26007 Pinot Noir: FML sin terminar exige los 15 dias',
    lote: { lote: '26007', variedad: 'Pinot Noir', proyecto: 'Domaine Nico', litros_actuales: 2025, mermo: 'no', hace_fml: 'si' },
    analisis: [proc('2026-09-11', { ph: 3.28, so2_libre: 27, av: 0.49, malico: 1.4 })],
    espera: { fml_estado: 'no_finalizada', fml_excluida_origen: 'lote', frecuencia_max: 15, estado_frecuencia: 'al_dia', alarmas: ['fml_no_finalizada'] },
  },
  {
    // Igual que 26008: el tablero aprobado daba el SO2 no_ok; con el piso
    // inclusive (2026-10-02) 20 en el piso de 20 a pH 3,25 esta bien.
    nombre: '26011 Chardonnay: sin mermo cargado, datos incompletos',
    lote: { lote: '26011', variedad: 'Chardonnay', proyecto: 'White Colluvium', litros_actuales: 100 },
    analisis: [proc('2026-09-09', { ph: 3.25, so2_libre: 20, av: 0.02 })],
    espera: { so2_estado: 'ok', estado_llenado: 'desconocido', alarmas: ['datos_operativos_incompletos'] },
  },
  {
    nombre: '26280 Syrah: sin ningun analisis, y la FML sin dato no afloja la frecuencia',
    lote: { lote: '26280', variedad: 'Syrah', proyecto: 'Desarrollo productos', litros_actuales: 225 },
    analisis: [],
    espera: { fml_estado: 'sin_dato', frecuencia_max: 15, estado_frecuencia: 'sin_datos', alarmas: ['sin_analisis_valido', 'datos_operativos_incompletos'] },
  },
];

describe('casos de oro del tablero aprobado', () => {
  for (const c of CASOS) {
    it(c.nombre, () => {
      const r = evaluarLote(c.lote, c.analisis, CONFIG, HOY);
      for (const [k, v] of Object.entries(c.espera)) {
        if (k === 'alarmas') expect(r.alarmas.sort()).toEqual([...(v as string[])].sort());
        else expect(r[k as keyof typeof r]).toBe(v);
      }
    });
  }
});
