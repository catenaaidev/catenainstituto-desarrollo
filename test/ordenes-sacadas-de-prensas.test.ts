import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('Prensas ya no tiene órdenes fuera del modo órdenes', () => {
  const html = env.PRENSAS_HTML;
  const menu = (html.match(/<nav class="tabs"[\s\S]*?<\/nav>/) || [''])[0];
  it('el menú no tiene Orden de muestras ni Rellenos', () => {
    expect(menu).not.toContain('data-v="orden"');
    expect(menu).not.toContain('data-v="relleno"');
    expect(menu).toContain('data-v="agregados"');
  });
  it('Degustación y Agregados llevan a Nueva orden en vez de armarla ahí', () => {
    expect(html).not.toContain('id="btnGenAccion"');
    expect(html).not.toContain('id="btnAgrOrden"');
    expect(html).not.toContain('id="btnImprimirAgr"');
    expect(html).toContain('/prensas/?orden=nueva%3Aprensas-accion');
    expect(html).toContain('/prensas/?orden=nueva%3Aprensas-agregados');
  });
  it('guardar ya no abre la Acción rápida sola', () => {
    expect(env.PRENSAS_JS['app.js']).not.toContain('function postGuardarDeg');
  });
});
