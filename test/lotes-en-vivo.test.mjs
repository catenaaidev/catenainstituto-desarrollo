/* Ver en vivo lo que guardan los demas (spec 2026-10-05, seccion 4). */
import { describe, it, expect } from 'vitest';
import { decidirActualizacion, ocupadoSegun, CADA_MS } from '../public/lotes/js/en-vivo.js';

describe('decidirActualizacion', () => {
  const base = { versionServidor: 10, versionLocal: 9, pendiente: false, ocupado: false };
  it('cada 15 s', () => { expect(CADA_MS).toBe(15000); });
  it('misma versión: nada', () => {
    expect(decidirActualizacion({ ...base, versionServidor: 9 })).toBe('nada');
  });
  it('versión del servidor más vieja (la mía se adelantó): nada', () => {
    expect(decidirActualizacion({ ...base, versionServidor: 8 })).toBe('nada');
  });
  it('hay algo mío sin subir: nada (lo combina el 409 del autoguardado)', () => {
    expect(decidirActualizacion({ ...base, pendiente: true })).toBe('nada');
  });
  it('estoy escribiendo: esperar', () => {
    expect(decidirActualizacion({ ...base, ocupado: true })).toBe('esperar');
  });
  it('libre y hay versión nueva: adoptar', () => {
    expect(decidirActualizacion(base)).toBe('adoptar');
  });
  it('versión que no es número: nada', () => {
    expect(decidirActualizacion({ ...base, versionServidor: undefined })).toBe('nada');
  });
});

describe('ocupadoSegun', () => {
  const campo = (x) => ({ tag: 'INPUT', tipo: 'text', enTabla: false, valor: '', valorOriginal: '', editable: false, ...x });
  it('overlay abierto', () => { expect(ocupadoSegun({ overlayAbierto: true, activo: null })).toBe(true); });
  it('nada con foco', () => { expect(ocupadoSegun({ overlayAbierto: false, activo: null })).toBe(false); });
  it('un campo fuera de las tablas con foco (buscador, formulario)', () => {
    expect(ocupadoSegun({ overlayAbierto: false, activo: campo({}) })).toBe(true);
  });
  it('celda de tabla con foco pero sin tipear', () => {
    expect(ocupadoSegun({ overlayAbierto: false, activo: campo({ enTabla: true, valor: '3,5', valorOriginal: '3,5' }) })).toBe(false);
  });
  it('celda de tabla a medio tipear', () => {
    expect(ocupadoSegun({ overlayAbierto: false, activo: campo({ enTabla: true, valor: '3,', valorOriginal: '3,5' }) })).toBe(true);
  });
  it('un botón con foco no cuenta', () => {
    expect(ocupadoSegun({ overlayAbierto: false, activo: { tag: 'BUTTON', tipo: '', enTabla: false, valor: '', valorOriginal: '', editable: false } })).toBe(false);
  });
});
