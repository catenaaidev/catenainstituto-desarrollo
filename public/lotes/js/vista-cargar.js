/* ===== Lotes CIW — pestana Cargar analisis ===== */
'use strict';

import { $, esc, escA, DATOS, markDirty, registrarVista } from './nucleo.js';
import { activarGrilla } from './grilla.js';
import { ORDEN_PLANILLA, planDeColumnas, parsearFila } from './carga-cols.js';
import { fmtFecha } from './fechas.js';

/* --- parseo principal ---
 * El "que campo es cada posicion" y el "como se lee una celda" viven en
 * carga-cols.js, con tests. Aca queda lo que necesita DATOS(): validar que el
 * lote exista de verdad. */
function parsearPegado(texto){
  const plan = planDeColumnas($('cargarCols').value.trim() || ORDEN_PLANILLA);

  /* Las columnas que se van a MOSTRAR en la previsualizacion: solo las que se
   * guardan. Las descartadas (vasija, año, los huecos) no se listan a
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
  return { colsMostrar, filas };
}

/* --- encabezados de la tabla de preview --- */
const CARGAR_LABELS = {
  lote:'Lote', fecha_analisis:'Fecha', ph:'pH', av:'AV',
  gluc_fruc:'Gluc+Fruc', azucar_reductor:'Az. Reductor',
  malico:'Málico', lactico:'Láctico',
  acidez_total:'Acidez total', etanol:'Etanol', so2_libre:'SO₂ libre',
  comentario:'Comentario',
};

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
  if (!DATOS()){ alert('Los datos aún no cargaron.'); return; }

  const { colsMostrar, filas } = parsearPegado(texto);

  const conErrores  = filas.filter(f => f._errores.length > 0).length;
  const sinErrores  = filas.length - conErrores;

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
    tb += `<tr${hayError ? ' style="background:#fbeeeb"' : ''}>`;
    for (const c of colsMostrar){
      const v = f[c];
      /* La fecha ya viene normalizada a ISO por parsearFecha; aca se muestra
       * como se va a leer despues en Analisis. */
      const vista = c === 'fecha_analisis' ? fmtFecha(v) : (v == null ? '' : v);
      tb += `<td${c==='lote'||c==='fecha_analisis'?'':' class="num"'}>${esc(vista)}</td>`;
    }
    if (hayError){
      tb += `<td><span class="pill bad">${esc(f._errores.join(', '))}</span></td>`;
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

  const hayValidas = sinErrores > 0;
  if (conErrores > 0){
    msgEl.innerHTML = `<div class="msg err">${filas.length} filas leídas — <b>${sinErrores} válidas</b>, <b>${conErrores} con errores</b> (marcadas en rojo). Revisalas antes de agregar.</div>`;
    errNote.style.display = 'inline-block';
  } else {
    msgEl.innerHTML = `<div class="msg ok">✓ ${filas.length} filas válidas, listas para agregar.</div>`;
    errNote.style.display = 'none';
  }

  btnAgg.textContent = `➕ Agregar ${sinErrores} análisis`;
  btnAgg.disabled = !hayValidas;
  preview.style.display = 'block';

  // guardar filas parseadas para el confirmar
  $('tCargar')._filas = filas;
  $('tCargar')._colsMostrar = colsMostrar;
}

export function cargarConfirmar(){
  const t = $('tCargar');
  if (!t._filas || !DATOS()) return;

  const validas = t._filas.filter(f => f._errores.length === 0);
  if (validas.length === 0){ alert('No hay filas válidas para agregar.'); return; }

  // limpiar campos internos antes de insertar
  const limpias = validas.map(f => {
    const o = Object.assign({}, f);
    delete o._raw; delete o._errores;
    return o;
  });

  DATOS().analisis.push(...limpias);
  markDirty();

  // feedback
  const msgEl = $('cargarMsg');
  msgEl.innerHTML = `<div class="msg ok">✓ Se agregaron <b>${limpias.length} análisis</b> a la memoria. Se guardan solos en unos segundos.</div>`;
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
