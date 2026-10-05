/* Autoguardado de Lotes: cuando se llama a guardar (spec 2026-10-05, seccion 1). */
import { describe, it, expect } from 'vitest';
import { crearAutoguardado, ESPERA_MS, REINTENTOS_MS } from '../public/lotes/js/autoguardado.js';

/* Reloj falso: los timers corren solo cuando el test avanza el tiempo. */
function relojFalso(){
  let ahora = 0, id = 0;
  const timers = new Map();
  return {
    setTimeout(fn, ms){ timers.set(++id, { fn, en: ahora + ms }); return id; },
    clearTimeout(i){ timers.delete(i); },
    async avanzar(ms){
      ahora += ms;
      for (;;){
        const prox = [...timers].filter(([, t]) => t.en <= ahora).sort((a, b) => a[1].en - b[1].en)[0];
        if (!prox) break;
        timers.delete(prox[0]);
        prox[1].fn();
        await vaciar();
      }
      await vaciar();
    },
    cuantos(){ return timers.size; },
  };
}
// Deja correr las promesas pendientes (los await de ejecutar).
const vaciar = () => new Promise(r => setTimeout(r, 0));

function armar(respuestas){
  const reloj = relojFalso();
  const avisos = [];
  let llamadas = 0;
  const ag = crearAutoguardado({
    ejecutar: async () => { llamadas++; return respuestas.shift() ?? 'ok'; },
    avisar: (e, info) => avisos.push(info ? [e, info] : [e]),
    reloj,
  });
  return { ag, reloj, avisos, llamadas: () => llamadas };
}

describe('autoguardado', () => {
  it('guarda 2 s después del último cambio', async () => {
    const { ag, reloj, llamadas } = armar([]);
    ag.cambio();
    await reloj.avanzar(ESPERA_MS - 1);
    expect(llamadas()).toBe(0);
    await reloj.avanzar(1);
    expect(llamadas()).toBe(1);
  });
  it('cada cambio vuelve a empezar la espera', async () => {
    const { ag, reloj, llamadas } = armar([]);
    ag.cambio();
    await reloj.avanzar(1500);
    ag.cambio();
    await reloj.avanzar(1500);
    expect(llamadas()).toBe(0);
    await reloj.avanzar(500);
    expect(llamadas()).toBe(1);
  });
  it('ahora() corta la espera', async () => {
    const { ag, llamadas } = armar([]);
    ag.cambio();
    await ag.ahora();
    expect(llamadas()).toBe(1);
  });
  it('nunca dos a la vez: lo que llega en vuelo sale en la vuelta siguiente', async () => {
    const reloj = relojFalso();
    let enCurso = 0, maximo = 0, llamadas = 0, soltar;
    const ag = crearAutoguardado({
      ejecutar: () => { llamadas++; enCurso++; maximo = Math.max(maximo, enCurso);
        return new Promise(r => { soltar = () => { enCurso--; r('ok'); }; }); },
      reloj,
    });
    ag.cambio();
    await reloj.avanzar(ESPERA_MS);       // sale el primero y queda colgado
    ag.cambio();
    await reloj.avanzar(ESPERA_MS);       // vence la espera con uno en vuelo
    expect(llamadas).toBe(1);
    soltar(); await vaciar(); await vaciar();
    expect(llamadas).toBe(2);
    soltar(); await vaciar();
    expect(maximo).toBe(1);
  });
  it('sin red reintenta a los 5, 15, 30 y después cada 60 s', async () => {
    const { ag, reloj, avisos, llamadas } = armar(['red', 'red', 'red', 'red', 'red']);
    ag.cambio();
    await reloj.avanzar(ESPERA_MS);
    for (const ms of [...REINTENTOS_MS, 60000]){
      const antes = llamadas();
      await reloj.avanzar(ms - 1);
      expect(llamadas()).toBe(antes);
      await reloj.avanzar(1);
      expect(llamadas()).toBe(antes + 1);
    }
    expect(avisos.filter(a => a[0] === 'reintentando').map(a => a[1].ms))
      .toEqual([5000, 15000, 30000, 60000, 60000]);
  });
  it('un ok vuelve los reintentos a cero', async () => {
    const { ag, reloj, avisos } = armar(['red', 'ok', 'red']);
    ag.cambio(); await reloj.avanzar(ESPERA_MS);
    await reloj.avanzar(5000);              // reintento: ok
    ag.cambio(); await reloj.avanzar(ESPERA_MS);
    expect(avisos.filter(a => a[0] === 'reintentando').map(a => a[1].ms)).toEqual([5000, 5000]);
  });
  it('sesión vencida: para, y un cambio nuevo lo reanuda', async () => {
    const { ag, reloj, llamadas } = armar(['sesion', 'ok']);
    ag.cambio(); await reloj.avanzar(ESPERA_MS);
    expect(ag.parado()).toBe('sesion');
    await reloj.avanzar(120000);
    expect(llamadas()).toBe(1);
    ag.cambio(); await reloj.avanzar(ESPERA_MS);
    expect(llamadas()).toBe(2);
    expect(ag.parado()).toBeNull();
  });
  it('cancelado (el freno deshizo): como ok, sin reintento ni parada', async () => {
    const { ag, reloj, avisos, llamadas } = armar(['cancelado']);
    ag.cambio(); await reloj.avanzar(ESPERA_MS);
    expect(ag.parado()).toBeNull();
    expect(avisos.at(-1)).toEqual(['listo']);
    await reloj.avanzar(120000);
    expect(llamadas()).toBe(1);
    expect(reloj.cuantos()).toBe(0);
  });
  it('error (el freno no pudo deshacer nada): para hasta el próximo cambio', async () => {
    const { ag, reloj, avisos, llamadas } = armar(['error', 'ok']);
    ag.cambio(); await reloj.avanzar(ESPERA_MS);
    expect(ag.parado()).toBe('error');
    expect(avisos.at(-1)).toEqual(['parado', { motivo: 'error' }]);
    await reloj.avanzar(120000);
    expect(llamadas()).toBe(1);
    ag.cambio(); await reloj.avanzar(ESPERA_MS);
    expect(llamadas()).toBe(2);
    expect(ag.parado()).toBeNull();
  });
  it('solo lectura: para para siempre', async () => {
    const { ag, reloj, llamadas } = armar(['permiso']);
    ag.cambio(); await reloj.avanzar(ESPERA_MS);
    ag.cambio(); await reloj.avanzar(ESPERA_MS);
    await ag.ahora();
    expect(llamadas()).toBe(1);
    expect(ag.parado()).toBe('permiso');
  });
  it('pendiente() mientras espera o guarda', async () => {
    const { ag, reloj } = armar([]);
    expect(ag.pendiente()).toBe(false);
    ag.cambio();
    expect(ag.pendiente()).toBe(true);
    await reloj.avanzar(ESPERA_MS);
    expect(ag.pendiente()).toBe(false);
  });
  it('si ejecutar revienta se trata como sin red', async () => {
    const reloj = relojFalso(); const avisos = [];
    const ag = crearAutoguardado({ ejecutar: async () => { throw new Error('x'); },
      avisar: (e, i) => avisos.push([e, i]), reloj });
    ag.cambio(); await reloj.avanzar(ESPERA_MS);
    expect(avisos.some(a => a[0] === 'reintentando')).toBe(true);
  });
  it('ahora() espera ambas laps si la primera está en vuelo', async () => {
    const reloj = relojFalso();
    let enCurso = 0, maximo = 0, llamadas = 0, soltar;
    const ag = crearAutoguardado({
      ejecutar: () => { llamadas++; enCurso++; maximo = Math.max(maximo, enCurso);
        return new Promise(r => { soltar = () => { enCurso--; r('ok'); }; }); },
      reloj,
    });
    ag.cambio();
    await reloj.avanzar(ESPERA_MS);       // sale el primero y queda colgado
    let listo = false;
    const p = ag.ahora();
    p.then(() => { listo = true; });
    await vaciar();
    expect(listo).toBe(false);            // el primero sigue en vuelo
    expect(llamadas).toBe(1);
    soltar();
    await vaciar();
    await vaciar();
    expect(llamadas).toBe(2);             // sale la segunda lap
    expect(listo).toBe(false);            // aún en vuelo
    soltar();
    await vaciar();
    expect(listo).toBe(true);             // ahora sí resuelto
    expect(maximo).toBe(1);               // nunca dos a la vez
  });
});
