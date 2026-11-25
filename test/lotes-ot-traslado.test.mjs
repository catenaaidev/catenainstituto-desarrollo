/* OT de Traslado (referencia: 0957 Traslado CS a VF). El vino sale de la
 * bodega en camión: al confirmar, cada lote registra una SALIDA con los
 * litros que salieron y sus vasijas quedan vacías. */
import { describe, it, expect, beforeAll } from 'vitest';
import { plantillaPorId, hojasDePlantilla, esSalida } from '../public/lotes/js/ot-plantillas.js';
import { armarOT, movimientosDeOT, confirmarOT } from '../public/lotes/js/ot-armado.js';
import { tipoDestino, proponer, aplicarPropuesta } from '../public/lotes/js/propuesta-ot.js';
import { aplicarEdicionOT } from '../public/lotes/js/ot-editar.js';

let H;
beforeAll(async () => {
  globalThis.window ??= { addEventListener(){} };
  globalThis.document ??= { addEventListener(){} };
  H = await import('../public/lotes/js/ot-hojas.js');
}, 30000);

const PADRON = [{ num: '118', tipo: 'TANQUE AC.INOX.', cap_real: 16000, tabla: null, activa: true },
                { num: '60', tipo: 'TANQUE AC.INOX.', cap_real: 12000, tabla: null, activa: true }];

function otTraslado(lotes, destino = 'VF') {
  return armarOT({ id: 'ot-t', numero: '0957', plantilla: 'traslado', fecha: '2026-10-30', destino,
    emitio: 'Oriana', lotes, mapaVersion: 1, usuario: 'ana', hoy: '2026-10-29' });
}
const DOS = () => otTraslado([
  { lote: '25319', id_texto: 'CS Ct.3', tanques: [{ num: '118', litros: 15460 }] },
  { lote: '26329', id_texto: 'CS VSC', otras: [{ nombre: 'Tq 60 bodega', litros: 10100 }] },
]);

describe('plantilla traslado', () => {
  it('es una salida, una sola hoja, banda TRASLADO', () => {
    const pl = plantillaPorId('traslado');
    expect(pl.nombre).toBe('Traslado');
    expect(pl.banda[0]).toBe('TRASLADO');
    expect(esSalida('traslado')).toBe(true);
    expect(esSalida('tq-tq')).toBe(false);
    expect(hojasDePlantilla('traslado')).toEqual(['ot']);
    expect(tipoDestino('traslado')).toBe('salida');
  });
  it('trae los pasos de la 0957', () => {
    const textos = plantillaPorId('traslado').bloques.map(b => b.texto).filter(Boolean).join('\n');
    expect(textos).toContain('Sanitizar cisternas a utilizar. (técnico tiene que revisar)');
    expect(textos).toContain('Gasear cisterna hasta tener un valor menos al 20% de O2 y registrar');
    expect(textos).toContain('Medir el O2 disuelto en el vino al finalizar llenado de cisternas y registrar');
    expect(textos).toContain('Analizar completo antes de trasladar, de ser necesario corregir SO2 35 ppm');
    expect(textos).toContain('Tomar 2 muestras: 1x120 + 1x 750 ml de cada cisterna');
    expect(textos).toContain('Registrar pesos de camión:');
  });
});

describe('hoja del traslado', () => {
  it('una fila por vasija con las columnas de la 0957 y el total', () => {
    const h = H.hojaOT(DOS());
    for (const th of ['CIW lote', 'Vasija', 'Litros', 'Litros caudalímetro', 'Destino', 'Medida', 'O2 mg/L Final', 'Temp. °C'])
      expect(h).toContain(`<th>${th}</th>`);
    expect(h).toContain('<td>25319</td><td>T 118</td><td>15460</td>');
    expect(h).toContain('<td>26329</td><td>Tq 60 bodega</td><td>10100</td>');
    expect(h).toContain('25560');
  });
  it('la banda dice TRASLADO, los lotes y la bodega destino', () => {
    const h = H.hojaOT(DOS());
    expect(h).toContain('TRASLADO');
    expect(h).toContain('25319 CS Ct.3');
    expect(h).toContain('a VF');
  });
  it('lleva la línea del camión y los pesos', () => {
    const h = H.hojaOT(DOS());
    expect(h).toContain('Camión:');
    expect(h).toContain('BRUTO');
    expect(h).toContain('NETO');
  });
  it('sin bodega destino la banda no inventa nada', () => {
    expect(H.hojaOT(otTraslado([{ lote: '1', otras: [{ nombre: 'Tq 60', litros: 10 }] }], ''))).not.toContain('a VF');
  });
});

describe('movimientos del traslado', () => {
  it('cada lote es una SALIDA pendiente hacia la bodega destino, sin vasija destino', () => {
    const ms = movimientosDeOT(DOS(), 'ana', '2026-10-29');
    expect(ms).toHaveLength(2);
    for (const m of ms) expect(m).toMatchObject({ tipo: 'salida', estado: 'pendiente', destino_externo: 'VF',
      vasija_destino: '', lote_destino: '', ot: '0957' });
    expect(ms[0]).toMatchObject({ lote: '25319', litros: 15460, vasija_origen: 'T 118' });
  });
  it('confirmar pone los litros que salieron y conserva la salida', () => {
    const o = DOS();
    const ms = movimientosDeOT(o, 'ana', '2026-10-29');
    confirmarOT(o, ms, { operario: 'Ignacio', por_lote: [{ destino_real: 'VF', litros_reales: 15400 }, { destino_real: 'VF', litros_reales: 10100 }] }, 'ana', '2026-10-30');
    expect(ms[0]).toMatchObject({ tipo: 'salida', estado: 'ejecutado', litros: 15400, vasija_destino: '', destino_externo: 'VF' });
  });
  it('editar la bodega destino de una OT pendiente actualiza el destino externo', () => {
    const o = DOS();
    const datos = { ordenes_trabajo: [o], movimientos: movimientosDeOT(o, 'ana', '2026-10-29'), lotes: [] };
    aplicarEdicionOT(datos, o, { destino: 'Granel' }, { usuario: 'ana', hoy: '2026-10-29' });
    expect(datos.movimientos.map(m => m.destino_externo)).toEqual(['Granel', 'Granel']);
  });
});

describe('confirmar un traslado: propuesta', () => {
  const lotes = () => [{ lote: 25319, vasija_grande: 15460, litros_actuales: 15460, vasija_actual: 'T 118' },
                       { lote: 26329, vasija_grande: 10100, cap225: 2, litros_actuales: 10550, vasija_actual: 'T 60 + 2 barricas' }];
  const o = () => otTraslado([
    { lote: '25319', tanques: [{ num: '118', litros: 15460 }] },
    { lote: '26329', tanques: [{ num: '60', litros: 10100 }] },
  ]);
  it('vacía lo que salió y no llena nada; la merma es previsto - salido', () => {
    const p = proponer({ ot: o(), lotes: lotes(), mermas: [], padron: PADRON, hoy: '2026-10-30',
      entradas: { por_lote: [{ litros_salida: 15400 }, { litros_salida: 10100 }] } });
    expect(p.items[0]).toMatchObject({ bloqueado: false, litros_llegados: 15400, merma_litros: 60, litros_despues: 0,
      despues: { vasija_grande: 0, vasija_actual: '' } });
    expect(p.items[1]).toMatchObject({ bloqueado: false, litros_despues: 450, despues: { cap225: 2, vasija_grande: 0 } });
    expect(p.items[1].despues.vasija_actual).toBe('2 barricas');
  });
  it('sin litros salidos queda bloqueado', () => {
    const p = proponer({ ot: o(), lotes: lotes(), mermas: [], padron: PADRON, hoy: '2026-10-30',
      entradas: { por_lote: [{ litros_salida: '' }, { litros_salida: 10100 }] } });
    expect(p.items[0].bloqueado).toBe(true);
    expect(p.items[0].avisos).toContain('Faltan los litros que salieron.');
  });
  it('aplicar deja el lote vacío', () => {
    const datos = { lotes: lotes(), mermas: [] };
    const ot = o();
    const p = proponer({ ot, lotes: datos.lotes, mermas: [], padron: PADRON, hoy: '2026-10-30',
      entradas: { por_lote: [{ litros_salida: 15400 }, { litros_salida: 10100 }] } });
    aplicarPropuesta(datos, ot, p, new Set(['25319', '26329']), 'ana', '2026-10-30');
    expect(datos.lotes[0]).toMatchObject({ vasija_grande: null, litros_actuales: 0, vasija_actual: '' });
    expect(datos.lotes[1]).toMatchObject({ vasija_grande: null, cap225: 2, litros_actuales: 450 });
  });
});

describe('bodega destino en la lista de destinos externos', () => {
  it('la suma si no estaba, sin repetir por mayúsculas, y la devuelve con el nombre de la lista', async () => {
    const { sumarDestinoExterno } = await import('../public/lotes/js/ot-armado.js');
    const config = { destinos_externos: ['Granel'] };
    expect(sumarDestinoExterno(config, ' VF ')).toBe('VF');
    expect(sumarDestinoExterno(config, 'granel')).toBe('Granel');
    expect(sumarDestinoExterno(config, '')).toBe('');
    expect(config.destinos_externos).toEqual(['Granel', 'VF']);
    const sinLista = {};
    sumarDestinoExterno(sinLista, 'VF');
    expect(sinLista.destinos_externos).toEqual(['VF']);
  });
});
