import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('Prensas dibuja las órdenes con hojas-prensas.js', () => {
  const app = env.PRENSAS_JS['app.js'];
  it('app.js ya no arma el markup de las hojas a mano', () => {
    expect(app).not.toContain('<b>Emitió:</b> Marcelo');
    expect(app).not.toContain('CORRECCIÓN DE ANHÍDRIDO SULFUROSO');
    for (const f of ['htmlHojaMuestras(', 'htmlHojaRellenos(', 'htmlHojaAccion(', 'htmlHojaAgregados(']) expect(app).toContain(f);
  });
  it('fija el entorno de órdenes de Prensas', () => {
    expect(app).toContain('fijarEntornoOT(');
    expect(app).toContain("api: '/prensas/api'");
    expect(app).toContain("eventoModo: 'prensas:modo-orden-cambio'");
  });
  it('el puente expone lo de las órdenes', () => {
    const p = env.PRENSAS_JS['js/puente.js'];
    for (const f of ['hojas-prensas.js', "lotes/js/guardar-ot.js", "lotes/js/vista-orden-guardada.js", "lotes/js/ordenes-hojas.js", "lotes/js/entorno-ot.js"])
      expect(p).toContain(f);
  });
  it('index.html: banda del modo y ocultar mientras carga', () => {
    expect(env.PRENSAS_HTML).toContain('id="modoOrdenes"');
    expect(env.PRENSAS_HTML).toContain('id="modoOrdenesVolver"');
    expect(env.PRENSAS_HTML).toContain('modo-ordenes-cargando');
    expect(env.PRENSAS_HTML).toMatch(/body\.modo-ordenes #tabs/);
  });

  it('imprimir en modo órdenes guarda la orden', () => {
    const app = env.PRENSAS_JS['app.js'];
    expect(app).toContain('async function imprimirOrdenPrensas(');
    expect(app).toContain('imprimirYGuardar(');
    expect(app).toContain('guardarOrdenHojaConfirmando(');
    expect(app).toContain('history.replaceState(');
  });

  it('la orden guardada es una copia de la foto, no los arrays vivos del editor', () => {
    const app = env.PRENSAS_JS['app.js'];
    expect(app).toMatch(/foto=M\.copiarFoto\(fotoDe\(tipo\)\)/);
  });

  it('orden guardada: cabecera + hoja en solo lectura', () => {
    const app = env.PRENSAS_JS['app.js'];
    expect(app).toContain('function abrirHojaGuardada(');
    expect(app).toContain('soloLectura: true');
    expect(app).toContain('cablearCabeceraOrden(');
    expect(env.PRENSAS_HTML).toMatch(/body\.hoja-guardada [^{]*\.doc-panel/);
  });

  it('orden guardada: ningún repintado vuelve a la hoja editable, y Reimprimir imprime el papel guardado', () => {
    const app = env.PRENSAS_JS['app.js'];
    const cuerpo = (nombre: string) => {
      const i = app.indexOf('function ' + nombre + '(');
      expect(i, nombre).toBeGreaterThan(-1);
      return app.slice(i, app.indexOf('\n}', i));
    };
    for (const f of ['renderActive', 'pintarOrden', 'pintarRelleno', 'pintarAccion', 'pintarAgrOrden'])
      expect(cuerpo(f).split('\n')[1], f).toContain('if(pintarHojaGuardada()) return');
    expect(cuerpo('pintarHojaGuardada')).toContain('soloLectura: true');
    expect(app).toMatch(/reimprimir: \(\)=>\{ pintarHojaGuardada\(\); window\.print\(\); \}/);
    expect(cuerpo('abrirHojaGuardada')).toContain('HOJA_GUARDADA_ID=id');
  });

  it('si guardar falla, igual pasa a la vista guardada (con el aviso de que quedó en este equipo)', () => {
    const app = env.PRENSAS_JS['app.js'];
    const i = app.indexOf('async function imprimirOrdenPrensas(');
    const f = app.slice(i, app.indexOf('\n}', i));
    expect(f).toContain('quedó en este equipo sin guardar');
    expect(f).not.toMatch(/sin guardar[^\n]*return;/);
    expect(f.indexOf('abrirHojaGuardada(res.id)')).toBeGreaterThan(f.indexOf('await guardar(false)'));
  });

  it('orden guardada: la hoja ocupa todo el ancho (.doc deja de ser grid de 2 columnas)', () => {
    expect(env.PRENSAS_HTML).toMatch(/body\.hoja-guardada \.doc\s*\{\s*display:\s*block/);
  });
});
