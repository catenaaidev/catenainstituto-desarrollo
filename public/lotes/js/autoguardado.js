/* ===== Lotes CIW — cuando se guarda solo =====
 * Puro: no toca el DOM ni la red. Recibe la funcion que guarda (`ejecutar`,
 * la pone nucleo.js) y decide cuando llamarla:
 *  - 2 s despues del ultimo cambio (cada cambio vuelve a empezar la espera);
 *  - nunca dos a la vez: si vence la espera con uno en vuelo, sale otra vuelta
 *    apenas vuelve;
 *  - sin red, reintenta a los 5, 15, 30 y despues cada 60 s, sin carteles;
 *  - sesion vencida o error: para hasta el proximo cambio o Ctrl+S;
 *  - solo lectura o conflicto sin combinar: para hasta recargar.
 * El reloj se inyecta para poder testearlo sin esperar de verdad.
 * Spec: docs/superpowers/specs/2026-10-05-lotes-autoguardado-deshacer-design.md
 */
'use strict';

export const ESPERA_MS = 2000;
export const REINTENTOS_MS = [5000, 15000, 30000, 60000];

const PARA_SIEMPRE = new Set(['permiso', 'conflicto']);
const PARA_HASTA_CAMBIO = new Set(['sesion', 'error']);

export function crearAutoguardado({ ejecutar, avisar = () => {}, reloj = globalThis }){
  let timer = null, enVuelo = false, otraVuelta = false, intentos = 0, parado = null;

  function cancelar(){ if (timer !== null){ reloj.clearTimeout(timer); timer = null; } }
  function programar(ms){ cancelar(); timer = reloj.setTimeout(() => { timer = null; correr(); }, ms); }

  async function correr(){
    if (PARA_SIEMPRE.has(parado)) return;
    if (enVuelo){ otraVuelta = true; return; }
    enVuelo = true;
    avisar('guardando');
    let res;
    try { res = await ejecutar(); } catch (e) { res = 'red'; }
    enVuelo = false;

    if (res === 'red'){
      otraVuelta = false;
      const ms = REINTENTOS_MS[Math.min(intentos, REINTENTOS_MS.length - 1)];
      intentos++;
      avisar('reintentando', { ms });
      programar(ms);
      return;
    }
    intentos = 0;
    if (PARA_SIEMPRE.has(res) || PARA_HASTA_CAMBIO.has(res)){
      parado = res;
      otraVuelta = false;
      cancelar();
      avisar('parado', { motivo: res });
      return;
    }
    if (otraVuelta){ otraVuelta = false; return correr(); }
    avisar('listo');
  }

  return {
    /** Hubo un cambio: guardar dentro de ESPERA_MS. */
    cambio(){
      if (PARA_SIEMPRE.has(parado)) return;
      parado = null;
      programar(ESPERA_MS);
    },
    /** Ctrl+S: guardar ya. */
    ahora(){
      if (PARA_SIEMPRE.has(parado)) return Promise.resolve();
      parado = null;
      cancelar();
      return correr();
    },
    pendiente(){ return timer !== null || enVuelo; },
    parado(){ return parado; },
  };
}
