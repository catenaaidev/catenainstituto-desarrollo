/* ===== Lotes CIW — pestana Cargar analisis ===== */
'use strict';

import { $, esc, escA, DATOS, markDirty, registrarVista } from './nucleo.js';
import { activarGrilla } from './grilla.js';
import { ORDEN_PLANILLA, planDeColumnas, parsearFila, faltanParaControl } from './carga-cols.js';
import { marcarRepetidos } from './carga-duplicados.js';
import { fmtFecha } from './fechas.js';
import { avisar } from './dialogos.js';

/* --- parseo principal ---
 * El "que campo es cada posicion" y el "como se lee una celda" viven en
 * carga-cols.js, con tests. Aca queda lo que necesita DATOS(): validar que el
 * lote exista de verdad. */
function parsearPegado(texto){
  const plan = planDeColumnas($('cargarCols').value.trim() || ORDEN_PLANILLA);

  /* Las columnas que se van a MOSTRAR en la previsualizacion: solo las que se
   * guardan. Las descartadas (año, los huecos) no se listan a
   * proposito — asi se ve de un vistazo que entra y que no. */
  const colsMostrar = [...new Set(plan.filter(Boolean))];

  const lineas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
  const filas = [];

  for (const linea of lineas){
    const { campos, errores } = parsearFila(linea, plan);
    const obj = Object.assign({ _raw: linea, _errores: errores }, campos);

    /* Que el lote EXISTA no lo puede saber carga-cols.js: necesita DATOS(). */
    const loteStr = String(obj.lote ?? '').trim();
    if (loteStr && !DATOS().lotes.some(l => String(l.lote).trim() === loteStr))
      obj._errores.push('lote no existe');

    filas.push(obj);
  }

  /* Lo que ya esta cargado igualito no se vuelve a cargar: ver
   * carga-duplicados.js. Se compara solo en las columnas del pegado. */
  marcarRepetidos(filas, DATOS().analisis, colsMostrar);
  return { colsMostrar, filas };
}

/* --- encabezados de la tabla de preview --- */
const CARGAR_LABELS = {
  lote:'Lote', vasija:'Vasija', fecha_analisis:'Fecha', ph:'pH', av:'AV',
  gluc_fruc:'Gluc+Fruc', azucar_reductor:'Az. Reductor',
  malico:'Málico', lactico:'Láctico',
  acidez_total:'Acidez total', etanol:'Etanol', so2_libre:'SO₂ libre',
  comentario:'Comentario',
};

/* 'malico' -> 'Málico'; varias -> 'Etanol y Málico', 'Etanol, AV y Málico'. */
function _nombres(claves){
  const n = claves.map(k => CARGAR_LABELS[k] || k);
  return n.length > 1 ? n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1] : n.join('');
}

export function cargarPrevisualizar(){
  const texto = ($('cargarTexto').value || '').trim();
  const preview = $('cargarPreview');
  const msgEl   = $('cargarMsg');
  const errNote = $('cargarErrNote');
  const btnAgg  = $('btnAgregarAnalisis');

  if (!texto){
    msgEl.innerHTML = '<div class="msg err">No hay texto para previsualizar. Pegá filas primero.</div>';
    preview.style.display = 'block';
    $('tCargar').innerHTML = '';
    errNote.style.display = 'none';
    btnAgg.disabled = true;
    return;
  }
  if (!DATOS()){ avisar('Los datos aún no cargaron.', { tipo: 'mal' }); return; }

  const { colsMostrar, filas } = parsearPegado(texto);

  const conErrores  = filas.filter(f => f._errores.length > 0).length;
  const repetidas   = filas.filter(f => f._repetido).length;
  const aCargar     = filas.length - conErrores - repetidas;

  /* Corrida del FOSS a medias: se carga igual (a veces el equipo de verdad no
   * da un valor), pero se avisa, porque ese analisis no reinicia la frecuencia
   * y el lote sigue saliendo vencido en la Orden de muestras. Solo cuenta en
   * las filas que se van a agregar: una repetida o con error no entra. */
  const incompleta = f => !f._errores.length && !f._repetido ? faltanParaControl(f) : [];
  const incompletas = filas.filter(f => incompleta(f).length);

  // encabezado
  let h = '<thead><tr>';
  for (const c of colsMostrar){
    h += `<th data-k="${escA(c)}">${esc(CARGAR_LABELS[c] || c)}</th>`;
  }
  h += '<th data-k="_estado">Estado</th></tr></thead>';

  // filas
  let tb = '<tbody>';
  for (const f of filas){
    const hayError = f._errores.length > 0;
    const falta = incompleta(f);
    const fondo = hayError ? '#fbeeeb' : (f._repetido || falta.length) ? '#fbf4e4' : '';
    tb += `<tr${fondo ? ` style="background:${fondo}"` : ''}>`;
    for (const c of colsMostrar){
      const v = f[c];
      /* La fecha ya viene normalizada a ISO por parsearFecha; aca se muestra
       * como se va a leer despues en Analisis. */
      const vista = c === 'fecha_analisis' ? fmtFecha(v) : (v == null ? '' : v);
      tb += `<td${c==='lote'||c==='vasija'||c==='fecha_analisis'?'':' class="num"'}>${esc(vista)}</td>`;
    }
    if (hayError){
      tb += `<td><span class="pill bad">${esc(f._errores.join(', '))}</span></td>`;
    } else if (f._repetido){
      tb += `<td><span class="pill warn">${esc(f._repetido)} — no se carga</span></td>`;
    } else if (falta.length){
      tb += `<td><span class="pill warn">⚠ falta ${esc(_nombres(falta))}: no cuenta como control de proceso</span></td>`;
    } else {
      tb += `<td><span class="pill ok">OK</span></td>`;
    }
    tb += '</tr>';
  }
  tb += '</tbody>';

  $('tCargar').innerHTML = h + tb;

  /* Grilla tipo planilla, solo copiar: es una previsualizacion antes de
   * agregar, no un lugar para editar en bloque (si algo esta mal se corrige
   * en el texto pegado y se previsualiza de nuevo). */
  activarGrilla($('tCargar'));

  let html = '';
  if (conErrores > 0){
    html += `<div class="msg err">${filas.length} filas leídas — <b>${aCargar} para agregar</b>, <b>${conErrores} con errores</b> (marcadas en rojo). Revisalas antes de agregar.</div>`;
    errNote.style.display = 'inline-block';
  } else {
    errNote.style.display = 'none';
  }
  if (repetidas > 0){
    const yaCargadas = filas.filter(f => f._repetido === 'ya cargado').length;
    const enPegado   = repetidas - yaCargadas;
    const partes = [];
    if (yaCargadas) partes.push(`<b>${yaCargadas} ${yaCargadas === 1 ? 'fila ya está cargada' : 'filas ya están cargadas'}</b>`);
    if (enPegado)   partes.push(`<b>${enPegado} ${enPegado === 1 ? 'fila está repetida' : 'filas están repetidas'} dentro del pegado</b>`);
    html += `<div class="msg warn">⚠ ${partes.join(' y ')} con exactamente los mismos datos (marcadas en amarillo). No se van a cargar de nuevo.</div>`;
  }
  if (incompletas.length > 0){
    const n = incompletas.length;
    const faltan = [...new Set(incompletas.flatMap(incompleta))];
    html += `<div class="msg warn">⚠ <b>${n} ${n === 1 ? 'fila tiene' : 'filas tienen'} la corrida del FOSS incompleta</b> (falta ${esc(_nombres(faltan))}, marcadas en amarillo). Esos análisis no reinician la frecuencia y el lote va a seguir saliendo como vencido en la Orden de muestras. Revisá el orden de columnas o la planilla antes de agregar.</div>`;
  }
  if (conErrores === 0){
    html += aCargar > 0
      ? `<div class="msg ok">✓ ${aCargar} ${aCargar === 1 ? 'fila nueva, lista' : 'filas nuevas, listas'} para agregar.</div>`
      : `<div class="msg info">No hay filas nuevas para agregar.</div>`;
  }
  msgEl.innerHTML = html;

  btnAgg.textContent = `➕ Agregar ${aCargar} análisis`;
  btnAgg.disabled = aCargar === 0;
  preview.style.display = 'block';

  // guardar filas parseadas para el confirmar
  $('tCargar')._filas = filas;
  $('tCargar')._colsMostrar = colsMostrar;
}

export function cargarConfirmar(){
  const t = $('tCargar');
  if (!t._filas || !DATOS()) return;

  /* Se vuelve a mirar contra lo cargado AHORA, no contra lo que habia al
   * previsualizar: el "en vivo" pudo traer esta misma carga hecha desde otra
   * computadora en el medio. */
  marcarRepetidos(t._filas, DATOS().analisis, t._colsMostrar);
  const validas = t._filas.filter(f => f._errores.length === 0 && !f._repetido);
  const salteadas = t._filas.filter(f => f._repetido).length;
  if (validas.length === 0){
    avisar(salteadas ? 'Todas las filas ya están cargadas: no hay nada nuevo para agregar.' : 'No hay filas válidas para agregar.', { tipo: 'info' });
    return;
  }

  // limpiar campos internos antes de insertar
  const limpias = validas.map(f => {
    const o = Object.assign({}, f);
    delete o._raw; delete o._errores; delete o._repetido;
    return o;
  });

  DATOS().analisis.push(...limpias);
  markDirty();

  // feedback
  const msgEl = $('cargarMsg');
  const nota = salteadas ? ` Se saltearon <b>${salteadas}</b> que ya estaban cargadas.` : '';
  msgEl.innerHTML = `<div class="msg ok">✓ Se agregaron <b>${limpias.length} análisis</b> a la memoria. Se guardan solos en unos segundos.${nota}</div>`;
  $('btnAgregarAnalisis').disabled = true;
  $('cargarErrNote').style.display = 'none';
}

export function cargarLimpiar(){
  $('cargarTexto').value = '';
  $('cargarPreview').style.display = 'none';
  $('cargarMsg').innerHTML = '';
  $('tCargar').innerHTML = '';
}

export function cargarResetCols(){
  $('cargarCols').value = ORDEN_PLANILLA;
}

registrarVista('cargar', () => {
  /* El orden por defecto lo pone el modulo, no el HTML: asi hay UNA sola fuente
   * de verdad. Solo se rellena si esta vacio, para no pisar un orden que la
   * persona haya tipeado y todavia no usado. */
  const el = $('cargarCols');
  if (el && !el.value.trim()) el.value = ORDEN_PLANILLA;
});
