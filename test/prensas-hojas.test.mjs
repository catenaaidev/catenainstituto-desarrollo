import { describe, it, expect } from 'vitest';
import { TIPOS_HOJA_PRENSAS, esTipoHojaPrensas, numerosWebPrensas, htmlHojaMuestras, htmlHojaRellenos,
         htmlHojaAccion, htmlHojaAgregados } from '../public/prensas/js/hojas-prensas.js';
import { SERIE_PRENSAS } from '../src/ordenes/resumen.ts';

const fila = n => ({ lote: String(25000 + n), variedad: 'Malbec', vasija: 'Barril', cant: '1', recipiente: 'Tubo falcon' });
const muestras = (n, x = {}) => ({ titulo: 'Orden de Trabajo', fecha: '2026-11-04', nro: '0951', dia: 'Martes', recibio: 'Luis',
  filas: Array.from({ length: n }, (_, i) => fila(i)), ...x });
const cuenta = (html, s) => html.split(s).length - 1;

describe('tipos de Prensas', () => {
  it('ids, series y espejo con el servidor', () => {
    expect(Object.keys(TIPOS_HOJA_PRENSAS)).toEqual(['prensas-muestras', 'prensas-rellenos', 'prensas-accion', 'prensas-agregados']);
    for (const [id, t] of Object.entries(TIPOS_HOJA_PRENSAS)) expect(SERIE_PRENSAS[id]).toBe(t.serie);
    expect(esTipoHojaPrensas('muestras')).toBe(false);
  });
  it('numerosWebPrensas', () => {
    const d = { ordenes_hojas: [{ tipo: 'prensas-muestras', ot: '0951' }, { tipo: 'prensas-accion', ot: 'B245' }, { tipo: 'prensas-rellenos', ot: '' }] };
    expect(numerosWebPrensas(d, 'principal')).toEqual([951]);
    expect(numerosWebPrensas(d, 'B')).toEqual([245]);
  });
});

describe('Orden de muestras', () => {
  it('editable: 25 filas por hoja, con inputs y borrar fila', () => {
    const h = htmlHojaMuestras(muestras(26));
    expect(cuenta(h, 'class="orden-hoja"')).toBe(2);
    expect(h).toContain('Hoja 2 de 2');
    expect(h).toContain('data-gi="25" data-f="lote"');
    expect(h).toContain('data-delrow="0"');
    expect(h).toContain('<b>N° de Orden:</b> 0951');
    expect(h).toContain('<b>Emitió:</b> Marcelo');
  });
  it('vacía: el texto de siempre', () => {
    expect(htmlHojaMuestras(muestras(0))).toContain('No hay lotes para los criterios elegidos.');
  });
  it('solo lectura: sin inputs, selects ni borrar; los valores como texto escapado', () => {
    const h = htmlHojaMuestras(muestras(1, { filas: [{ ...fila(0), variedad: '<b>x</b>' }] }), { soloLectura: true });
    expect(h).not.toMatch(/<input|<select|delrow/);
    expect(h).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(h).toContain('25000');
  });
});

describe('Rellenos, Acción rápida, Agregados', () => {
  it('rellenos: instrucciones como checklist y solo lectura sin inputs', () => {
    const f = { titulo: 'Orden de Trabajo', fecha: '2026-11-04', nro: '0952', dia: '', emitio: 'Ana', recibio: '',
      instrucciones: 'Paso uno\nPaso dos', pie: 'Limpiar', filas: [{ lote: '25001', vasija: 'barril', cant: '1', rellenarCon: '25003' }] };
    expect(cuenta(htmlHojaRellenos(f), '<li>')).toBe(3);
    expect(htmlHojaRellenos(f, { soloLectura: true })).not.toMatch(/<input|<select|delrow/);
  });
  it('acción: 35 por hoja y la dosis en la nota', () => {
    const f = { titulo: 'Orden de Trabajo — Acción Rápida', fecha: '2026-11-04', nro: 'B245', densidad: '', emitio: '', recibio: '', ml: '250',
      filas: Array.from({ length: 36 }, (_, i) => ({ lote: String(i), anio: '2026', vasija: 'Barricas', recip: '1', sol: 'Sol 1.030', ml: '250' })) };
    const h = htmlHojaAccion(f);
    expect(cuenta(h, 'class="orden-hoja"')).toBe(2);
    expect(h).toContain('<b>250 mL de Solución 1.030</b>');
    expect(h).toContain('CORRECCIÓN DE ANHÍDRIDO SULFUROSO');
  });
  it('agregados: una banda por tipo', () => {
    const f = { titulo: 'Orden de Trabajo — Agregados', fecha: '2026-11-04', nro: 'B246', emitio: '', recibio: '',
      filas: [{ tipo: 'TH2', lote: '1', variedad: '', cantidad: '1', unidad: 'g/L', obs: '' },
              { tipo: 'SO2', lote: '2', variedad: '', cantidad: '30', unidad: 'ppm', obs: '' }] };
    const h = htmlHojaAgregados(f);
    expect(h).toContain('TH2 (ác. tartárico)');
    expect(h).toContain('SO2 (anh. sulfuroso)');
    expect(htmlHojaAgregados(f, { soloLectura: true })).not.toMatch(/<input|<select|delrow/);
  });
});

describe('copiarFoto (la orden guardada no comparte filas con el editor)', () => {
  it('copia profunda: mutar las filas vivas no cambia la copia', async () => {
    const { copiarFoto } = await import('../public/prensas/js/hojas-prensas.js');
    const vivas = [fila(0), fila(1)];
    const foto = muestras(0, { filas: vivas });
    const copia = copiarFoto(foto);
    expect(copia).toEqual(foto);
    vivas[0].vasija = 'Tanque'; vivas.push(fila(2)); vivas.sort(() => -1); foto.nro = '9999';
    expect(copia.filas).toHaveLength(2);
    expect(copia.filas[0].vasija).toBe('Barril');
    expect(copia.filas[0].lote).toBe('25000');
    expect(copia.nro).toBe('0951');
  });
  it('null/undefined pasan tal cual', async () => {
    const { copiarFoto } = await import('../public/prensas/js/hojas-prensas.js');
    expect(copiarFoto(null)).toBe(null);
    expect(copiarFoto(undefined)).toBe(undefined);
  });
});

describe('título de la hoja guardada sin titulo', () => {
  it('cae al título de fábrica (TITULOS_DEF), nunca "undefined"', () => {
    const sin = (f) => { const x = { ...f }; delete x.titulo; return x; };
    const casos = [
      [htmlHojaMuestras, muestras(1), 'Orden de Trabajo'],
      [htmlHojaRellenos, muestras(1), 'Orden de Trabajo'],
      [htmlHojaAccion, muestras(1), 'Orden de Trabajo — Acción Rápida'],
      [htmlHojaAgregados, { ...muestras(0), filas: [] }, 'Orden de Trabajo — Agregados'],
    ];
    for (const [fn, foto, tit] of casos) {
      for (const soloLectura of [true, false]) {
        const h = fn(sin(foto), { soloLectura });
        expect(h).not.toContain('undefined');
        expect(h).toContain(tit);
      }
    }
  });
});
