/* ===== Lotes CIW — entry point ===== */
'use strict';

/* Cada vista se registra sola al importarse (registrarVista). */
import { cargarDatos, mostrarTab, refrescarAvisos, refrescarInfo,
         guardarAhora, deshacer, rehacer, pedirUsuario, usuarioActual, verHistorial, cerrarOverlay,
         cargarDashboard, $, registrarInit, invalidarVistas, invalidarDashMap,
         renderActivo, DATOS, arrancarEnVivo } from './js/nucleo.js';
import { limpiarFiltrosMulti } from './js/tabla.js';
import { montarSelectorAnios } from './js/selector-anios.js';

import './js/vista-dashboard.js';
import { renderLotes, agregarLote, ordenarLotes, descLotes, instLotes, resetLlenado,
         ajustarAnchosLotes, resetAnchosLotes } from './js/vista-lotes.js';
import './js/vista-ficha.js';
import { cargarPrevisualizar, cargarConfirmar, cargarLimpiar, cargarResetCols } from './js/vista-cargar.js';
import './js/vista-analisis.js';
import './js/vista-tablero.js';
import './js/vista-so2.js';
import './js/vista-movimientos.js';
import './js/vista-orden.js';
import './js/vista-cruce.js';
import './js/vista-orden-correccion.js';
import { agregarVariedadConfig, agregarProyectoConfig, restaurarDefaultsConfig } from './js/vista-config.js';

/* ---------- handlers inline del HTML ----------
 * Dentro de un modulo ES las funciones no viven en el scope global, asi que los
 * onclick="..." del HTML no las encuentran. Se exponen en window (cambio minimo).
 */
window.cargarResetCols     = cargarResetCols;      // index.html: onclick "Resetear"
window.cargarPrevisualizar = cargarPrevisualizar;  // index.html: onclick "Previsualizar"
window.cargarLimpiar       = cargarLimpiar;        // index.html: onclick "Limpiar"
window.cargarConfirmar     = cargarConfirmar;      // index.html: onclick "Agregar analisis"
window.cerrarOverlay       = cerrarOverlay;        // nucleo.js verHistorial(): onclick "Cerrar"

/* ---------- ARRANQUE ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  /* tabs */
  document.querySelectorAll('.tabs button[data-v]').forEach(b => {
    b.addEventListener('click', () => mostrarTab(b.dataset.v));
  });

  /* cerrar filtros al hacer clic fuera */
  document.addEventListener('click', () => {
    document.querySelectorAll('.mfilt-panel.open').forEach(p=>p.classList.remove('open'));
  });

  /* overlay: cerrar con Escape */
  document.addEventListener('keydown', e => { if(e.key==='Escape') cerrarOverlay(); });

  /* Ctrl+S: guardar ya, sin esperar los 2 s del autoguardado. Se intercepta
     para que el navegador no abra "Guardar página como". */
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 's' || e.key === 'S')){
      e.preventDefault();
      guardarAhora();
    }
  });

  /* Ctrl+Z / Ctrl+Y (y Ctrl+Shift+Z): deshacer y rehacer de TODA la pagina.
     Si el foco esta en un campo donde se escribe, la tecla es del navegador
     (deshace lo que vas tipeando). Con un overlay abierto no se deshace nada:
     el paso se anota recien al aceptar. La grilla, cuando tiene seleccion,
     despacha lotes:deshacer/lotes:rehacer y llega al mismo lugar. */
  const esCampoDeTexto = el => !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' ||
    (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'date'].includes(el.type)));
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    const esDeshacer = k === 'z' && !e.shiftKey;
    const esRehacer = k === 'y' || (k === 'z' && e.shiftKey);
    if (!esDeshacer && !esRehacer) return;
    if (esCampoDeTexto(document.activeElement)) return;
    if ($('overlay').classList.contains('show')) return;
    e.preventDefault();
    if (esDeshacer) deshacer(); else rehacer();
  });
  $('overlay').addEventListener('click', e => { if(e.target===$('overlay')) cerrarOverlay(); });

  /* botones de cabecera */
  $('btnHistorial').addEventListener('click', verHistorial);
  $('usuario').addEventListener('click', () => pedirUsuario(true));

  /* cuadricula completa en todas las tablas: preferencia de pantalla de cada
     persona, guardada en su navegador como los anchos de columna */
  let cuadricula = false;
  try { cuadricula = localStorage.getItem('lotes_cuadricula') === '1'; } catch(e) {}
  const aplicarCuadricula = () => {
    document.body.classList.toggle('cuadricula', cuadricula);
    $('btnCuadricula').classList.toggle('on', cuadricula);
    $('btnCuadricula').setAttribute('aria-pressed', String(cuadricula));
  };
  aplicarCuadricula();
  $('btnCuadricula').addEventListener('click', () => {
    cuadricula = !cuadricula;
    aplicarCuadricula();
    try { localStorage.setItem('lotes_cuadricula', cuadricula ? '1' : '0'); } catch(e) {}
  });

  /* botón limpiar filtros Lotes */
  $('btnLimpiarFltLotes').addEventListener('click', () => {
    /* resetLlenado antes de limpiar: limpiarFiltrosMulti es la que repinta, y
       asi la tabla se dibuja una sola vez con todo ya en cero. */
    resetLlenado();
    limpiarFiltrosMulti(descLotes(), 'buscaLotes', instLotes(), renderLotes);
  });

  /* anchos de columna de la pestaña Lotes */
  $('btnAjustarAnchos').addEventListener('click', () => ajustarAnchosLotes());
  $('btnResetAnchos').addEventListener('click', () => resetAnchosLotes());

  /* buscador Lotes */
  $('buscaLotes').addEventListener('input', () => renderLotes());

  /* nuevo lote (asistente) y ordenar los lotes nuevos que quedaron arriba */
  $('btnAddLote').addEventListener('click', () => agregarLote());
  $('btnOrdenarLotes').addEventListener('click', () => ordenarLotes());

  /* configuración */
  $('btnAgregarVariedad').addEventListener('click', () => agregarVariedadConfig());
  $('btnAgregarProyecto').addEventListener('click', () => agregarProyectoConfig());
  $('btnRestaurarDefaults').addEventListener('click', () => restaurarDefaultsConfig());

  /* usuario guardado */
  const u = usuarioActual();
  $('usuario').textContent = '👤 ' + (u || '(sin nombre)');

  /* cargar todo. /datos y /dashboard salen juntos: antes el dashboard recien
   * se pedia cuando terminaba /datos, y la pantalla de inicio esperaba las dos
   * idas y vueltas en fila. Si el dashboard llega primero no pasa nada:
   * cargarDashboard no dibuja sin DATOS(), y cargarDatos lo dibuja al llegar. */
  /* selector de años: se monta con los lotes ya cargados (registrarInit corre
     antes del primer render) y cada cambio rearma todo lo que muestra lotes. */
  registrarInit(() => montarSelectorAnios(DATOS().lotes));
  document.addEventListener('lotes:anios-cambiados', () => {
    invalidarVistas();
    invalidarDashMap();
    cargarDashboard();
    renderActivo();
  });

  const dash = cargarDashboard();
  await cargarDatos();
  refrescarAvisos();
  refrescarInfo();
  await dash;

  /* ver en vivo lo que guardan los demas (cada 15 s, con la pestaña a la vista) */
  arrancarEnVivo();

  /* refrescar avisos cada 60 s */
  setInterval(refrescarAvisos, 60000);
});
