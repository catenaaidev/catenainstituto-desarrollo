/* ===== Órdenes de trabajo — vista Guía de trabajos =====
 * Arma la hoja, escucha los botones (data-acc) y los textos editables, y
 * manda cada cambio a guia-sync. El texto se guarda a los 800 ms de dejar de
 * tipear y, sí o sí, al salir del renglón (focusout). Repintar mientras se
 * tipea movería el cursor: mientras haya foco en un texto, solo se repinta
 * lo de afuera de la hoja.
 *
 * #ordCuerpo es el MISMO elemento en todas las vistas (app.js solo le cambia
 * el innerHTML): si los listeners se colgaran directo de cuerpo, entrar dos
 * veces a la guía (portada → guía → portada → guía, o con atrás/adelante)
 * los apilaría y cada clic se aplicaría varias veces. Por eso acá se arma un
 * <div class="gt-vista"> propio, con todos los listeners colgados de ÉL, y
 * ese div se tira a la basura (junto con sus listeners) en cuanto otra vista
 * vuelve a pintar #ordCuerpo. */
'use strict';
import { crearSync } from './guia-sync.js';
import { hojaGuia, extrasGuia } from './guia-hoja.js';
import { fotoImpresa } from './guia.js';
import { proponerNumero, chipCarpeta, cablearChipsCarpeta, imprimirYGuardar } from '../../lotes/js/guardar-ot.js';
import { fijarEntornoOT } from '../../lotes/js/entorno-ot.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const ESTADOS = {
  guardando: 'Guardando…', guardado: 'Guardado', error: 'No se pudo guardar.',
  rechazado: 'No se pudo guardar y se descartaron los últimos cambios: se volvió a cargar la guía.',
};
const nuevoId = () => 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function montarGuia(cuerpo, { volver }){
  // Quién tildó: el nombre del perfil (window.CIW lo pone el Worker en servirOrdenes).
  const quien = (window.CIW && (window.CIW.nombre || window.CIW.email)) || '';
  let _foco = null;   // data-id del renglón recién agregado, para ponerle el cursor

  // guardar-ot.js (de Lotes) abre su diálogo "Imprimir y guardar" con estas dos.
  // Los números de la web llegan por /ordenes/api/numeros: datos/numerosWeb vacíos.
  let ov = document.getElementById('overlay');
  if (!ov){
    ov = document.createElement('div');
    ov.className = 'overlay'; ov.id = 'overlay';
    ov.innerHTML = '<div class="box" id="overlayBox" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(ov);
  }
  fijarEntornoOT({
    datos: () => ({}), numerosWeb: () => [],
    mostrarOverlay: html => { document.getElementById('overlayBox').innerHTML = html; ov.classList.add('show'); },
    cerrarOverlay: () => ov.classList.remove('show'),
  });
  let _numero = '';   // N° propuesto o tipeado; no es parte de la guía viva

  cuerpo.innerHTML = `<div class="gt-vista">` +
    `<div class="gt-barra"><button type="button" class="ci-btn" id="gtImprimir">Imprimir</button>${chipCarpeta('principal')}` +
    `<span class="gt-estado" id="gtEstado" role="status" aria-live="polite"></span></div>` +
    `<div id="gtHoja"><p class="ord-msg">Cargando la guía…</p></div><div id="gtExtras"></div>` +
    `</div>`;
  const vista = cuerpo.querySelector('.gt-vista');
  const $h = vista.querySelector('#gtHoja'), $x = vista.querySelector('#gtExtras'), $e = vista.querySelector('#gtEstado');

  cablearChipsCarpeta(vista.querySelector('.gt-barra'), () => proponer());
  // El N° que sigue en la serie 'principal' de la carpeta (+ los que ya numeró la web).
  async function proponer(){
    try { _numero = (await proponerNumero('principal')).numero || ''; } catch { _numero = ''; }
    const n = $h.querySelector('[data-numero]');
    if (n && document.activeElement !== n) n.textContent = _numero;
  }

  const sync = crearSync({
    fetch: (...a) => window.fetch(...a),
    ahora: () => new Date().toISOString(),
    alCambiar: () => pintar(),
    alEstado: e => {
      if (!vista.isConnected) return;   // la vista ya no está en pantalla (se fue a otra pestaña)
      if (e === 'error-carga'){ $h.innerHTML = `<p class="ord-msg">No se pudo cargar la guía. Probá recargar.</p>`; return; }
      if (e === 'cargado'){
        // Un lector imprime sin número (como antes): ni carpeta ni N° propuesto.
        if (!sync.estado().puedeEditar) vista.querySelector('.ot-carpeta')?.remove();
        else proponer();   // resuelve después del primer pintado: ahí ya está el casillero del N°
      }
      $e.innerHTML = e === 'error'
        ? `${esc(ESTADOS.error)} <button type="button" class="ci-btn" id="gtReintentar">Reintentar</button>`
        : esc(ESTADOS[e] || '');
      if (e === 'error') window.CI?.avisar?.('No se pudo guardar la guía. Tus cambios siguen en pantalla.', { tipo: 'mal' });
      if (e === 'rechazado') window.CI?.avisar?.(ESTADOS.rechazado, { tipo: 'mal' });
    },
  });

  function pintar(){
    if (!vista.isConnected) return;   // idem: ya se fue de pantalla, no hay nada que repintar
    const { guia, ordenes, puedeEditar } = sync.estado();
    if (!guia) return;
    const tipeando = $h.contains(document.activeElement) && document.activeElement.isContentEditable;
    if (!tipeando){
      const d = new Date();
      const fechaTxt = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
      $h.innerHTML = hojaGuia(guia, ordenes, { fechaTxt, anio: String(d.getFullYear()), puedeEditar, volver, numero: _numero });
      if (_foco){ $h.querySelector(`.gt-txt[data-id="${CSS.escape(_foco)}"]`)?.focus(); _foco = null; }
    }
    // Los <details> (Hechas / Órdenes ocultas) se vuelven a armar en cada repintado
    // (click, guardado, carga en vivo…): sin esto, se cerrarían solos cada vez.
    const abiertos = new Set([...$x.querySelectorAll('details[data-k][open]')].map(d => d.dataset.k));
    $x.innerHTML = extrasGuia(guia, ordenes, { puedeEditar });
    $x.querySelectorAll('details[data-k]').forEach(d => { if (abiertos.has(d.dataset.k)) d.open = true; });
  }

  // El mousedown en un botón de control, con un texto tipeado al lado, blurea
  // el texto ANTES del click (es el orden normal del navegador): eso dispara
  // el focusout de más abajo, que repinta #gtHoja con un setTimeout. Si ese
  // repintado llega antes del mouseup, el botón bajo el dedo queda
  // reemplazado por uno nuevo y el click nunca sale. Mientras haya foco en un
  // texto, se frena el cambio de foco por mouse hacia un botón (el teclado
  // -Tab y después Enter/Espacio- no pasa por acá y sigue andando).
  vista.addEventListener('pointerdown', e => {
    const b = e.target.closest('button[data-acc]');
    if (b && document.activeElement?.isContentEditable) e.preventDefault();
  });

  vista.addEventListener('click', e => {
    if (e.target.closest('#gtImprimir')) return imprimir();
    if (e.target.closest('#gtReintentar')) return sync.reintentar();
    const b = e.target.closest('button[data-acc]');
    if (!b) return;
    // El pointerdown de arriba frenó el cambio de foco (para que el click no se
    // pierda), así que el texto puede seguir con el foco acá. Si es así, hay que
    // sacarlo ANTES de aplicar el op: si no, pintar() lo toma como "sigue
    // tipeando" y se salta el repintado de la hoja (el renglón agregado, movido
    // o tildado no se ve hasta el próximo blur). El guardado del texto ya se
    // aplicó con el 'input' de más abajo; acá solo hace falta mandarlo (como
    // hace focusout) antes de que se sume el op del botón.
    const activo = document.activeElement;
    if (activo?.isContentEditable && vista.contains(activo)){
      activo.blur();
      sync.guardarYa();
    }
    const id = b.dataset.id, acc = b.dataset.acc;
    if (acc === 'agregar'){ _foco = nuevoId(); return sync.ejecutar({ op: 'agregar', id: _foco }); }
    if (acc === 'mover-arriba') return sync.ejecutar({ op: 'mover', id, delta: -1 });
    if (acc === 'mover-abajo') return sync.ejecutar({ op: 'mover', id, delta: 1 });
    if (acc === 'hecha') return sync.ejecutar({ op: 'hecha', id, ahora: new Date().toISOString(), por: quien });
    if (['tipo', 'quitar', 'mostrar', 'deshacer'].includes(acc)) return sync.ejecutar({ op: acc, id });
  });

  // Texto de un renglón y firmas: se aplica al tipear (sin repintar la hoja) y se guarda con demora.
  vista.addEventListener('input', e => {
    const t = e.target.closest('[contenteditable]');
    if (!t) return;
    if (t.hasAttribute('data-numero')){ _numero = t.textContent.replace(/\D/g, '').slice(0, 4); return; }
    const valor = t.textContent.replace(/\s+/g, ' ').trim();
    if (t.dataset.firma) sync.ejecutar({ op: 'firma', campo: t.dataset.firma, valor }, { demora: 800 });
    else if (t.dataset.id) sync.ejecutar({ op: 'texto', id: t.dataset.id, texto: valor }, { demora: 800 });
  });
  vista.addEventListener('focusout', e => {
    if (!e.target.closest?.('[contenteditable]')) return;
    sync.guardarYa();
    // Si el foco se va a otro control DE LA VISTA (un botón ▲▼✓✕…), ese click
    // ya va a repintar solo (ejecutar → alCambiar → pintar): repintar acá de
    // nuevo, antes del mouseup, es lo que detacha el botón (ver el comentario
    // de pointerdown más arriba). Si el foco se va afuera (otra pestaña,
    // dirección del navegador…) sí hace falta este repintado.
    if (e.relatedTarget && vista.contains(e.relatedTarget)) return;
    setTimeout(pintar);   // ya sin foco: la hoja se pone al día (números, renglones de otros)
  });
  // Enter en un renglón = terminar de escribir (no saltos de línea en la tarea).
  vista.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.closest?.('[contenteditable]')){ e.preventDefault(); e.target.blur(); }
  });

  /* Imprimir: N° de la carpeta, PDF "<N°> Guía de trabajos.pdf" en ella (guardar-ot
   * de Lotes) y, si salió, la foto de lo impreso al Historial del servidor. */
  async function imprimir(){
    const { guia, puedeEditar } = sync.estado();
    if (!guia) return;
    if (!puedeEditar) return window.print();          // un lector imprime sin número, como antes
    await sync.guardarYa();
    // Releer el estado DESPUÉS de guardar: guardarYa manda el último renglón
    // tipeado (el guardado con demora de 800 ms puede seguir pendiente), y la
    // foto que se postea tiene que ser la de la hoja que de verdad se imprimió.
    const { guia: guiaImpresa, ordenes: ordenesImpresas } = sync.estado();
    // "939" -> "0939": igual que el nombre del PDF, para que el papel (y la
    // foto) muestren el mismo N° con ceros que el archivo guardado.
    if (/^\d{1,4}$/.test(_numero)) _numero = _numero.padStart(4, '0');
    const n = $h.querySelector('[data-numero]');
    if (n) n.textContent = _numero;
    const r = await imprimirYGuardar({ claseBody: 'printing-guia', contenedor: $h, serie: 'principal',
      numero: _numero, titulo: 'Guía de trabajos' });
    if (!r.ok){
      if (r.numeroLibre){ _numero = r.numeroLibre; pintar(); }
      return;
    }
    try {
      const resp = await fetch('/ordenes/api/guia/impresas', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero: r.numero, foto: fotoImpresa(guiaImpresa, ordenesImpresas) }) });
      if (!resp.ok) throw new Error('http ' + resp.status);
      window.CI?.avisar?.('Guía N° ' + r.numero + ' guardada en el Historial.', { tipo: 'ok' });
    } catch (_) {
      window.CI?.avisar?.('Se imprimió la ' + r.numero + ' pero no quedó en el Historial. Avisá a sistemas.', { tipo: 'mal' });
    }
    await proponer();
  }

  sync.cargar();
}
