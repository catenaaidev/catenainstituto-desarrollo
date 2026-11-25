import { describe, it, expect } from 'vitest';
import { crearSync } from '../public/ordenes/js/guia-sync.js';

const O = { modulo: 'lotes', id: 'ot-1', tipo: 'traslado', numero: '0957', fecha: '2026-11-03', estado: 'pendiente', lotes: [] };
const resp = (status, body) => ({ ok: status < 300, status, json: async () => body });

/** Servidor falso: guarda en memoria con versión, igual que la ruta. */
function servidor(inicial = { version: 0, guia: { emitio: '', recibio: '', renglones: [], hechas: [] } }){
  const s = { ...inicial, posts: 0, falla: 0 };
  s.fetch = async (url, init) => {
    if (!init || init.method !== 'POST') return resp(200, { version: s.version, guia: s.guia, ordenes: [O], puedeEditar: true, modulos: {} });
    s.posts++;
    if (s.falla > 0){ s.falla--; throw new Error('red'); }
    const b = JSON.parse(init.body);
    if (b.version !== s.version) return resp(409, { error: 'conflicto', version: s.version, guia: s.guia });
    s.version++; s.guia = b.guia;
    return resp(200, { version: s.version });
  };
  return s;
}
const nuevo = (s, extra) => crearSync({ fetch: s.fetch, ahora: () => '2026-11-04T10:00:00.000Z', alCambiar(){}, alEstado(){}, ...extra });

describe('guia-sync', () => {
  it('cargar une la guía con los pendientes (la orden entra al final)', async () => {
    const s = servidor(); const g = nuevo(s);
    await g.cargar();
    expect(g.estado().guia.renglones.map((r) => r.id)).toEqual(['o_lotes:ot-1']);
    expect(g.estado().puedeEditar).toBe(true);
  });
  it('ejecutar aplica en pantalla al toque y guarda', async () => {
    const s = servidor(); const g = nuevo(s);
    await g.cargar();
    g.ejecutar({ op: 'agregar', id: 'a', texto: 'Lavar' });
    expect(g.estado().guia.renglones.map((r) => r.id)).toEqual(['o_lotes:ot-1', 'a']);
    await g.guardarYa();
    expect(s.version).toBe(1);
    expect(s.guia.renglones.map((r) => r.id)).toEqual(['o_lotes:ot-1', 'a']);
  });
  it('409: toma la del servidor y re-aplica el cambio encima', async () => {
    const s = servidor(); const g = nuevo(s);
    await g.cargar();
    // Otra persona guarda en el medio.
    s.version = 5; s.guia = { emitio: 'Oriana', recibio: '', renglones: [{ id: 'x', tipo: 'tarea', texto: 'De otro' }], hechas: [] };
    g.ejecutar({ op: 'agregar', id: 'a', texto: 'Mío' });
    await g.guardarYa();
    expect(s.version).toBe(6);
    expect(s.guia.emitio).toBe('Oriana');
    expect(s.guia.renglones.map((r) => r.id)).toEqual(['x', 'o_lotes:ot-1', 'a']);
    expect(g.estado().guia).toEqual(s.guia);
  });
  it('error de red: avisa error, no pierde el cambio, reintentar lo guarda', async () => {
    const s = servidor(); const estados = [];
    const g = nuevo(s, { alEstado: (e) => estados.push(e) });
    await g.cargar();
    s.falla = 1;
    g.ejecutar({ op: 'agregar', id: 'a' });
    await g.guardarYa();
    expect(estados).toContain('error');
    expect(g.estado().guia.renglones.some((r) => r.id === 'a')).toBe(true);
    await g.reintentar();
    expect(s.guia.renglones.some((r) => r.id === 'a')).toBe(true);
    expect(estados.at(-1)).toBe('guardado');
  });
  it('varios cambios seguidos salen en un solo guardado', async () => {
    const s = servidor(); const g = nuevo(s);
    await g.cargar();
    g.ejecutar({ op: 'agregar', id: 'a' }, { demora: 1000 });
    g.ejecutar({ op: 'texto', id: 'a', texto: 'Lav' }, { demora: 1000 });
    g.ejecutar({ op: 'texto', id: 'a', texto: 'Lavar' }, { demora: 1000 });
    await g.guardarYa();
    expect(s.posts).toBe(1);
    expect(s.guia.renglones.find((r) => r.id === 'a').texto).toBe('Lavar');
  });
  it('poda las hechas viejas al guardar', async () => {
    const s = servidor({ version: 1, guia: { emitio: '', recibio: '', renglones: [], hechas: [
      { id: 'v', tipo: 'tarea', texto: '', hecha: '2026-10-01T00:00:00.000Z', por: '', lugar: 0 }] } });
    const g = nuevo(s);
    await g.cargar();
    g.ejecutar({ op: 'firma', campo: 'emitio', valor: 'Oriana' });
    await g.guardarYa();
    expect(s.guia.hechas).toEqual([]);
  });
  it('poda: cuando se quitan hechas viejas, alCambiar se llama después del guardado', async () => {
    let cambiarCount = 0;
    const s = servidor({ version: 1, guia: { emitio: '', recibio: '', renglones: [], hechas: [
      { id: 'v', tipo: 'tarea', texto: '', hecha: '2026-10-01T00:00:00.000Z', por: '', lugar: 0 }] } });
    const g = nuevo(s, { alCambiar: () => cambiarCount++ });
    await g.cargar();
    const countBeforeSave = cambiarCount;
    g.ejecutar({ op: 'firma', campo: 'emitio', valor: 'Oriana' });
    const countBeforeGuardar = cambiarCount;
    await g.guardarYa();
    expect(cambiarCount).toBeGreaterThan(countBeforeGuardar);
    expect(g.estado().guia.hechas).toEqual([]);
  });

  describe('un cambio que el servidor rechaza no debe trabar el guardado para siempre', () => {
    it('400: descarta el cambio en pantalla, recarga de cero y avisa "rechazado"', async () => {
      const estados = [];
      const fetch = async (url, init) => {
        if (!init || init.method !== 'POST') return resp(200, {
          version: 1, guia: { emitio: '', recibio: '', renglones: [], hechas: [] },
          ordenes: [O], puedeEditar: true, modulos: { lotes: 'editor' } });
        return resp(400, { error: 'guia_invalida', detalles: ['Texto demasiado largo.'] });
      };
      const g = crearSync({ fetch, ahora: () => '2026-11-04T10:00:00.000Z', alCambiar(){}, alEstado: (e) => estados.push(e) });
      await g.cargar();
      g.ejecutar({ op: 'agregar', id: 'a' });
      await g.guardarYa();
      expect(estados).toContain('rechazado');
      // Se descartó el pendiente y se recargó: el renglón agregado ya no está.
      expect(g.estado().guia.renglones.some((r) => r.id === 'a')).toBe(false);
      expect(g.estado().guia.renglones.map((r) => r.id)).toEqual(['o_lotes:ot-1']);
    });
    it('403: marca que ya no puede editar (la recarga, con el rol ya perdido, lo confirma)', async () => {
      let gets = 0;
      const fetch = async (url, init) => {
        if (!init || init.method !== 'POST'){
          gets++;
          // Primera carga: todavía editor (para poder armar el cambio). Cuando
          // el 403 fuerza una recarga, el servidor ya refleja que perdió el rol.
          return resp(200, {
            version: 1, guia: { emitio: '', recibio: '', renglones: [], hechas: [] },
            ordenes: [O], puedeEditar: gets === 1, modulos: gets === 1 ? { lotes: 'editor' } : { lotes: 'lector' } });
        }
        return resp(403, { error: 'sin_permiso' });
      };
      const g = crearSync({ fetch, ahora: () => '2026-11-04T10:00:00.000Z', alCambiar(){}, alEstado(){} });
      await g.cargar();
      g.ejecutar({ op: 'agregar', id: 'a' });
      await g.guardarYa();
      expect(g.estado().puedeEditar).toBe(false);
    });
    it('409 sin versión numérica (garabateado): se trata como rechazo, no como error eterno', async () => {
      const estados = [];
      const fetch = async (url, init) => {
        if (!init || init.method !== 'POST') return resp(200, {
          version: 1, guia: { emitio: '', recibio: '', renglones: [], hechas: [] },
          ordenes: [O], puedeEditar: true, modulos: { lotes: 'editor' } });
        return resp(409, { error: 'conflicto' });   // sin version
      };
      const g = crearSync({ fetch, ahora: () => '2026-11-04T10:00:00.000Z', alCambiar(){}, alEstado: (e) => estados.push(e) });
      await g.cargar();
      g.ejecutar({ op: 'agregar', id: 'a' });
      await g.guardarYa();
      expect(estados).toContain('rechazado');
      expect(g.estado().guia.renglones.some((r) => r.id === 'a')).toBe(false);
    });
    it('409 VÁLIDO que se repite (MAX_CONFLICTOS agotado): no se descarta el cambio, queda "error" y Reintentar lo guarda', async () => {
      const estados = [];
      let posts = 0;
      const fetch = async (url, init) => {
        if (!init || init.method !== 'POST') return resp(200, {
          version: 1, guia: { emitio: '', recibio: '', renglones: [], hechas: [] },
          ordenes: [O], puedeEditar: true, modulos: { lotes: 'editor' } });
        posts++;
        // "Otro guardó antes" cuatro veces seguidas (con versión válida): el
        // cambio sigue siendo legítimo, no hay que tirarlo.
        if (posts <= 4) return resp(409, {
          error: 'conflicto', version: posts, guia: { emitio: '', recibio: '', renglones: [], hechas: [] },
          ordenes: [O], modulos: { lotes: 'editor' } });
        return resp(200, { version: posts + 1 });
      };
      const g = crearSync({ fetch, ahora: () => '2026-11-04T10:00:00.000Z', alCambiar(){}, alEstado: (e) => estados.push(e) });
      await g.cargar();
      g.ejecutar({ op: 'agregar', id: 'a' });
      await g.guardarYa();
      expect(estados.at(-1)).toBe('error');
      // El cambio NO se descartó (se re-aplicó sobre la guía nueva, pero sigue ahí).
      expect(g.estado().guia.renglones.some((r) => r.id === 'a')).toBe(true);
      await g.reintentar();
      expect(estados.at(-1)).toBe('guardado');
      expect(g.estado().guia.renglones.some((r) => r.id === 'a')).toBe(true);
    });
  });

  it('409 (hallazgo 1b): la guía fresca trae `ordenes` para las órdenes nuevas y no se pierden al re-aplicar', async () => {
    const O2 = { ...O, id: 'ot-2', numero: '0960' };
    let posted = 0;
    const fetch = async (url, init) => {
      if (!init || init.method !== 'POST') return resp(200, {
        version: 1, guia: { emitio: '', recibio: '', renglones: [], hechas: [] },
        ordenes: [O], puedeEditar: true, modulos: { lotes: 'editor' } });
      posted++;
      if (posted === 1) return resp(409, {
        error: 'conflicto', version: 2, guia: { emitio: '', recibio: '', renglones: [], hechas: [] },
        ordenes: [O, O2], modulos: { lotes: 'editor' } });
      return resp(200, { version: 3 });
    };
    const g = crearSync({ fetch, ahora: () => '2026-11-04T10:00:00.000Z', alCambiar(){}, alEstado(){} });
    await g.cargar();
    g.ejecutar({ op: 'firma', campo: 'emitio', valor: 'Oriana' });
    await g.guardarYa();
    expect(g.estado().guia.renglones.map((r) => r.id)).toEqual(['o_lotes:ot-1', 'o_lotes:ot-2']);
  });
});
