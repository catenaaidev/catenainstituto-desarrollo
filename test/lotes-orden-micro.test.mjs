/* Tests de la orden de microbiologia (Orden de muestras, tipo 🦠): textos
 * editables con defaults del Excel 0868, columnas del papel y cartel. */
import { describe, it, expect } from 'vitest';
import { TEXTOS_MICRO_DEF, textosMicro, renglones, cfgHojasMicro, hojaCartel }
  from '../public/lotes/js/orden-micro.js';

describe('textosMicro', () => {
  it('sin nada guardado devuelve los textos del Excel', () => {
    expect(textosMicro(null)).toEqual(TEXTOS_MICRO_DEF);
    expect(textosMicro(undefined).destino).toBe('Vista Flores');
  });
  it('lo guardado pisa el default, incluso vacio', () => {
    const t = textosMicro({ nota: 'Entregar a Rosana', retira: '' });
    expect(t.nota).toBe('Entregar a Rosana');
    expect(t.retira).toBe('');
    expect(t.de).toBe('Oriana - CIW');
  });
  it('ignora claves desconocidas y valores que no son texto', () => {
    const t = textosMicro({ nota: 5, hack: '<x>', de: null });
    expect(t).toEqual(TEXTOS_MICRO_DEF);
    expect('hack' in t).toBe(false);
  });
});

describe('renglones', () => {
  it('un div por renglon, sin vacios, escapado', () => {
    expect(renglones('a\r\n\n  b <i> ')).toBe('<div>a</div><div>b &lt;i&gt;</div>');
    expect(renglones('')).toBe('');
  });
});

describe('cfgHojasMicro', () => {
  const filas = [{ lote: '26141', vasija: 'Barricas', variedad: 'Malbec' }];
  const cfg = cfgHojasMicro({ filas, textos: null, dia: 'lunes' });

  it('papel con # / Check / Lote / Vasija, sin variedad', () => {
    expect(cfg.columnas).toBe(4);
    expect(cfg.thead).toMatch(/#.*Check.*Lote.*Vasija/);
    const tr = cfg.renderFila({ numero: 1, fila: filas[0] });
    expect(tr).toContain('26141');
    expect(tr).toContain('Barricas');
    expect(tr).not.toContain('Malbec');
  });
  it('banda, instrucciones, subtitulo y cierre salen de los textos', () => {
    expect(cfg.banda).toEqual(['Microbiología VF', 'lunes', '']);
    expect(cfg.antesBanda).toContain('Tomar muestras según protocolo adjunto');
    expect(cfg.nota).toContain('Bolsas estériles 200 ml');
    expect(cfg.despuesTabla).toContain('Entregarlas a Pineda');
  });
  it('un texto borrado no deja un bloque vacio', () => {
    const c = cfgHojasMicro({ filas, textos: { instrucciones: '', subtitulo: ' ', cierre: '' } });
    expect(c.antesBanda).toBe('');
    expect(c.nota).toBe('');
    expect(c.despuesTabla).toBe('');
  });
  it('el cartel va primero entre las hojas extra', () => {
    const c = cfgHojasMicro({ filas, textos: null, hojasExtra: ['<div>mapa</div>'] });
    expect(c.hojasExtra).toHaveLength(2);
    expect(c.hojasExtra[0]).toContain('oh-cartel');
    expect(c.hojasExtra[1]).toBe('<div>mapa</div>');
  });
});

describe('hojaCartel', () => {
  it('lleva los cinco campos con lo editado, escapado', () => {
    const h = hojaCartel({ nota: 'Entregar a <Julieta>' });
    for (const l of ['De:', 'Retira en Agrelo:', 'Para:', 'Destino:', 'Nota:']) expect(h).toContain(l);
    expect(h).toContain('Oriana - CIW');
    expect(h).toContain('Entregar a &lt;Julieta&gt;');
  });
});
