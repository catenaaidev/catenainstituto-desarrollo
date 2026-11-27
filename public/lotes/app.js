/* ===== Lotes CIW — entry point ===== */
'use strict';

/* Cada vista se registra sola al importarse (registrarVista). */
import { cargarDatos, mostrarTab, refrescarAvisos, refrescarInfo,
         guardarAhora, deshacer, rehacer, pedirUsuario, verHistorial, cerrarOverlay, cerrarOMinimizar,
         cargarDashboard, $, registrarInit, invalidarVistas, invalidarDashMap,
         renderActivo, DATOS, arrancarEnVivo, irALote, pantallaDeUrl,
         vistaActiva, vistaAntesDeFicha, enModoOrdenes } from './js/nucleo.js';
import { limpiarFiltrosMulti } from './js/tabla.js';
import { montarSelectorAnios } from './js/selector-anios.js';
import { montarMas } from './js/barra-lotes.js';
import { loteDeHash } from './js/ficha-url.js';
import { descargarDocumentoCompleto } from './js/exportar-completo.js';

import './js/vista-dashboard.js';
import { renderLotes, agregarLote, ordenarLotes, descLotes, instLotes, resetLlenado,
         ajustarAnchosLotes, resetAnchosLotes, buscaLotesGuardado, guardarBuscaLotes,
         olvidarFiltrosLotes } from './js/vista-lotes.js';
import './js/vista-ficha.js';
import { cargarPrevisualizar, cargarConfirmar, cargarLimpiar, cargarResetCols } from './js/vista-cargar.js';
import './js/vista-analisis.js';
import './js/vista-tablero.js';
import './js/vista-agenda.js';
import { fijarOrdenUnica } from './js/vista-so2.js';
import { abrirOTUnica, emitirEnModoOrden } from './js/vista-movimientos.js';
import { leerModoOrden, destinoDeModo, urlVolver, tituloModo } from './js/modo-ordenes.js';
import { abrirOrdenMuestrasNueva, abrirOrdenMuestrasGuardada, precargarOrden } from './js/vista-orden.js';
import './js/vista-cruce.js';
import './js/vista-orden-correccion.js';
import { abrirAgregadosNueva, abrirAgregadosGuardada } from './js/vista-agregados.js';
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
  montarMas();

  /* Buscar lote (barra): abre la ficha. Siempre visible, también en el celular. */
  $('buscarLote').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('buscarLoteNum').value.trim();
    if (!v) return;
    $('buscarLoteNum').value = '';
    $('buscarLoteNum').blur();      // en el celular baja el teclado
    irALote(v);
  });
  registrarInit(() => {
    $('buscarLoteLista').innerHTML = (DATOS().lotes || [])
      .map(l => String(l.lote ?? '').trim()).filter(Boolean)
      .map(l => '<option value="' + l.replace(/"/g, '&quot;') + '">').join('');
  });
  /* Atrás / Adelante del navegador: la URL dice a qué pantalla (o ficha) volver.
     Sin hash es la de entrada: Lotes. */
  window.addEventListener('popstate', () => {
    const l = loteDeHash(location.hash);
    if (l) irALote(l, { sinHistorial: true });
    // Modo órdenes: no hay pantallas en el hash, solo la ficha: Atrás desde
    // la ficha vuelve a la vista de la orden.
    else if (enModoOrdenes()) { if (vistaActiva() === 'ficha') mostrarTab(vistaAntesDeFicha(), { sinHistorial: true }); }
    else mostrarTab(pantallaDeUrl() || 'lotes', { sinHistorial: true });
  });

  /* tabs */
  document.querySelectorAll('.tabs button[data-v]').forEach(b => {
    /* El boton de Correcciones es data-v="so2", pero lleva a la ultima
       sub-pestaña usada del grupo (mostrarTab('correcciones')). */
    b.addEventListener('click', () => mostrarTab(b.dataset.v === 'so2' ? 'correcciones' : b.dataset.v));
  });
  document.querySelectorAll('#analisisSub [data-analisis-v]').forEach(b => {
    b.addEventListener('click', () => mostrarTab(b.dataset.analisisV));
  });
  document.querySelectorAll('#corrSub [data-sub]').forEach(b => {
    b.addEventListener('click', () => mostrarTab(b.dataset.sub));
  });

  /* cerrar filtros al hacer clic fuera */
  document.addEventListener('click', () => {
    document.querySelectorAll('.mfilt-panel.open').forEach(p=>p.classList.remove('open'));
  });

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
     (deshace lo que vas tipeando). Con un dialogo abierto (formulario o
     pregunta) no se deshace nada: el paso se anota recien al aceptar. Y
     tampoco el navegador: sin el preventDefault, Chrome aplica su deshacer
     nativo al ultimo <input> que se edito en la tabla de atras (inputType
     'historyUndo') y eso llega al modelo. La grilla, cuando tiene seleccion,
     despacha lotes:deshacer/lotes:rehacer y llega al mismo lugar (con un
     dialogo abierto no despacha y cae aca). */
  const esCampoDeTexto = el => !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' ||
    (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'date'].includes(el.type)));
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    const esDeshacer = k === 'z' && !e.shiftKey;
    const esRehacer = k === 'y' || (k === 'z' && e.shiftKey);
    if (!esDeshacer && !esRehacer) return;
    if (esCampoDeTexto(document.activeElement)) return;
    if (document.querySelector('dialog[open]')){ e.preventDefault(); return; }
    e.preventDefault();
    if (esDeshacer) deshacer(); else rehacer();
  });
  // Con una OT a medio armar, clic afuera y Escape la minimizan (no se pierde).
  $('overlay').addEventListener('click', e => { if(e.target===$('overlay')) cerrarOMinimizar(); });
  $('overlay').addEventListener('cancel', e => { e.preventDefault(); cerrarOMinimizar(); });

  /* botones de cabecera */
  $('btnHistorial').addEventListener('click', verHistorial);
  $('btnExportarCompleto').addEventListener('click', () => descargarDocumentoCompleto(DATOS()));

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
    olvidarFiltrosLotes();
  });

  /* anchos de columna de la pestaña Lotes */
  $('btnAjustarAnchos').addEventListener('click', () => ajustarAnchosLotes());
  $('btnResetAnchos').addEventListener('click', () => resetAnchosLotes());

  /* buscador Lotes: vuelve del F5 antes del primer render (cargarDatos, abajo) */
  $('buscaLotes').value = buscaLotesGuardado();
  $('buscaLotes').addEventListener('input', () => { guardarBuscaLotes($('buscaLotes').value); renderLotes(); });

  /* nuevo lote (asistente) y ordenar los lotes nuevos que quedaron arriba */
  $('btnAddLote').addEventListener('click', () => agregarLote());
  $('btnOrdenarLotes').addEventListener('click', () => ordenarLotes());

  /* configuración */
  $('btnAgregarVariedad').addEventListener('click', () => agregarVariedadConfig());
  $('btnAgregarProyecto').addEventListener('click', () => agregarProyectoConfig());
  $('btnRestaurarDefaults').addEventListener('click', () => restaurarDefaultsConfig());

  /* usuario de la sesión */
  pedirUsuario();

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

  /* F5 sobre una pantalla (#analisis…): se abre ya, sin esperar los datos;
     cargarDatos la dibuja al llegar. La ficha espera a los datos (más abajo). */
  // En modo órdenes manda ?orden= (arrancarModoOrden, abajo), no el hash.
  const pantallaEnUrl = enModoOrdenes() ? null : pantallaDeUrl();
  if (pantallaEnUrl) mostrarTab(pantallaEnUrl, { sinHistorial: true });
  /* La ficha espera a los datos (más abajo); cualquier otra cosa ya está. */
  if (!loteDeHash(location.hash)) window.CIWPantalla?.restaurada();

  /* La ficha (ver mas arriba) dejo pendiente este segundo restaurada() hasta
     que lleguen los datos: si cargarDatos o el dashboard rechazaran la
     promesa, sin el finally la pantalla se quedaria tapada hasta el freno de
     5 s. try/finally no cambia el manejo de errores de cada uno (cada cual
     ya avisa el suyo en statusBar); solo garantiza que esto corra siempre. */
  try {
    const dash = cargarDashboard();
    await cargarDatos();
    refrescarAvisos();
    refrescarInfo();
    await dash;

    /* Modo órdenes: se llegó desde la sección Órdenes de trabajo. Manda
       sobre la pantalla del #hash (que en modo órdenes no se anota). */
    const modo = leerModoOrden(location.search);
    // Se saca siempre (también si la orden no existe o el tipo es desconocido,
    // o si arrancarModoOrden falla): la puso el script del <head> de index.html.
    try { if (modo) arrancarModoOrden(modo); }
    finally { document.documentElement.classList.remove('modo-ordenes-cargando'); }

    const loteEnUrl = loteDeHash(location.hash);
    if (loteEnUrl) irALote(loteEnUrl, { sinHistorial: true });
  } finally {
    window.CIWPantalla?.restaurada();
  }

  /* ver en vivo lo que guardan los demas (cada 15 s, con la pestaña a la vista) */
  arrancarEnVivo();

  /* refrescar avisos cada 60 s */
  setInterval(refrescarAvisos, 60000);
});

/* Modo órdenes (/lotes/?orden=nueva:<tipo> o ?orden=<id>): Lotes muestra solo
 * esa orden, con una banda para volver a la sección Órdenes de trabajo. */
function arrancarModoOrden(modo){
  document.body.classList.add('modo-ordenes');
  $('modoOrdenes').hidden = false;
  $('modoOrdenesVolver').href = urlVolver(location.search);
  const titular = () => {
    const m = leerModoOrden(location.search);
    $('modoOrdenesTit').textContent = tituloModo(destinoDeModo(m, DATOS()), DATOS());
  };
  const dest = destinoDeModo(modo, DATOS());
  if (dest.accion === 'emitir') emitirEnModoOrden(dest.plantilla);
  else if (dest.accion === 'correccion') mostrarTab('ordencorr');
  else if (dest.accion === 'ver-ot') abrirOTUnica(dest.id);
  else if (dest.accion === 'ver-oc'){ fijarOrdenUnica(dest.id); mostrarTab('so2'); }
  /* Orden de muestras / microbiología: nueva (con los lotes de la Agenda si
   * la URL trae ?lotes=a,b) o guardada, en solo lectura. Otros agregados:
   * nueva = solo Armar; guardada = cabecera + papel, solo lectura. */
  else if (dest.accion === 'hoja-nueva' && (dest.tipo === 'muestras' || dest.tipo === 'micro')){
    abrirOrdenMuestrasNueva(dest.tipo);
    const lotes = (new URLSearchParams(location.search).get('lotes') || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    if (lotes.length) precargarOrden(lotes);
  }
  else if (dest.accion === 'ver-hoja' && (dest.tipo === 'muestras' || dest.tipo === 'micro'))
    abrirOrdenMuestrasGuardada(dest.id);
  else if (dest.accion === 'hoja-nueva' && dest.tipo === 'agregados') abrirAgregadosNueva();
  else if (dest.accion === 'ver-hoja' && dest.tipo === 'agregados') abrirAgregadosGuardada(dest.id);
  else {
    $('modoOrdenesTit').textContent = dest.accion === 'no-existe'
      ? 'Esta orden no existe (¿la borraron?)' : 'Tipo de orden desconocido';
    document.querySelectorAll('.view').forEach(s => s.classList.remove('active'));
    return;
  }
  titular();
  document.addEventListener('lotes:modo-orden-cambio', titular);
}
