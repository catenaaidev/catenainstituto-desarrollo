import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('Lotes ya no tiene órdenes fuera del modo órdenes', () => {
  const mov = env.LOTES_JS['js/vista-movimientos.js'];
  it('Movimientos: sin sub-pestaña Órdenes de trabajo, con Inventario de tanques', () => {
    const sel = mov.slice(mov.indexOf('function _selectorSub'), mov.indexOf('function _cablearSelector'));
    expect(sel).not.toContain("b('ordenes'");
    expect(sel).toContain("b('tanques', 'Inventario de tanques')");
    expect(sel).toContain("b('mermas', 'Mermas')");
  });
  it('el 🖨 del Historial lleva a la OT en modo órdenes', () => {
    expect(mov).toContain("'/lotes/?orden=' + encodeURIComponent(ot.id)");
  });
  it('Correcciones: sin la sub-pestaña Orden de corrección', () => {
    const corr = (env.LOTES_HTML.match(/<div class="corr-sub"[\s\S]*?<\/div>/) || [''])[0];
    expect(corr).not.toContain('data-sub="ordencorr"');
    expect(corr).toContain('data-sub="so2"');
    expect(corr).toContain('data-sub="agregados"');
  });
  it('el Registro ya no pinta la lista de órdenes fuera del modo', () => {
    const so2 = env.LOTES_JS['js/vista-so2.js'];
    expect(so2).not.toContain('<div class="card" id="so2Ordenes" style="margin-bottom:14px"></div>');
  });
  it('el menú Más ya no tiene la Orden de muestras', () => {
    expect(env.LOTES_HTML).not.toContain('data-v="orden"');
  });
  it('la Agenda ya no arma la orden localmente: navega al modo órdenes', () => {
    const ag = env.LOTES_JS['js/vista-agenda.js'];
    expect(ag).not.toContain('precargarOrden(');
    expect(ag).toContain('nueva:muestras');
  });
  it('vista-agregados.js ya no tiene el botón Registrar', () => {
    const ag = env.LOTES_JS['js/vista-agregados.js'];
    expect(ag).not.toContain('data-registrar');
  });
});
