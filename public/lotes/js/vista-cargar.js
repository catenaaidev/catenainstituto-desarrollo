/* ===== Lotes CIW — pestana Cargar analisis ===== */
'use strict';

import { $, esc, escA, DATOS, markDirty, registrarVista } from './nucleo.js';
import { activarGrilla } from './grilla.js';

const COLS_CARGAR_DEFAULT = 'lote, fecha, ph, av, gluc_fruc, malico, lactico, acidez_total, etanol, so2_libre';

/* --- keys numéricas (se parsean con num()) --- */
const CARGAR_NUMS = new Set(['ph','av','gluc_fruc','malico','lactico','acidez_total','etanol','so2_libre']);

/* --- parseo de fecha: acepta dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd --- */
function parsearFecha(raw){
  const s = String(raw||'').trim();
  if (!s) return null;
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)){
    const d = new Date(s + 'T00:00:00');
    return isNaN(d) ? null : s;
  }
  // dd/mm/yyyy or dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m){
    const iso = m[3] + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0');
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? null : iso;
  }
  return null;
}

/* --- parseo principal --- */
function parsearPegado(texto){
  const cols = ($('cargarCols').value || COLS_CARGAR_DEFAULT)
    .split(',').map(c => c.trim().toLowerCase()).filter(Boolean);

  const lineas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
  const filas = [];

  for (const linea of lineas){
    // detectar separador: si hay tab usamos tab, sino coma
    const sep = linea.includes('\t') ? '\t' : ',';
    const celdas = linea.split(sep);

    const obj = { _raw: linea, _errores: [] };

    cols.forEach((col, i) => {
      const crudo = (celdas[i] || '').trim();
      if (col === 'fecha'){
        obj.fecha_analisis = parsearFecha(crudo);
        if (!obj.fecha_analisis) obj._errores.push('fecha inválida');
      } else if (CARGAR_NUMS.has(col)){
        // normalizar coma decimal → punto
        const normalizado = crudo.replace(',', '.');
        obj[col] = crudo === '' ? null : (isNaN(parseFloat(normalizado)) ? null : parseFloat(normalizado));
      } else {
        obj[col] = crudo === '' ? null : crudo;
      }
    });

    // validar lote existe en DATOS
    const loteStr = String(obj.lote || '').trim();
    if (!loteStr){
      obj._errores.push('lote vacío');
    } else {
      const existe = DATOS().lotes.some(l => String(l.lote).trim() === loteStr);
      if (!existe) obj._errores.push('lote no existe');
    }

    filas.push(obj);
  }
  return { cols, filas };
}

/* --- encabezados de la tabla de preview --- */
const CARGAR_LABELS = {
  lote:'Lote', fecha_analisis:'Fecha', ph:'pH', av:'AV',
  gluc_fruc:'Gluc+Fruc', malico:'Málico', lactico:'Láctico',
  acidez_total:'Acidez total', etanol:'Etanol', so2_libre:'SO₂ libre',
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

  const { cols, filas } = parsearPegado(texto);

  // columnas a mostrar: las del orden declarado + fecha_analisis si viene de 'fecha'
  const colsMostrar = cols.map(c => c === 'fecha' ? 'fecha_analisis' : c);

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
      tb += `<td${c==='lote'||c==='fecha_analisis'?'':' class="num"'}>${esc(v == null ? '' : v)}</td>`;
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
  msgEl.innerHTML = `<div class="msg ok">✓ Se agregaron <b>${limpias.length} análisis</b> a la memoria. <b>Acordate de Guardar</b> (botón arriba a la derecha) para que queden grabados.</div>`;
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
  $('cargarCols').value = COLS_CARGAR_DEFAULT;
}

registrarVista('cargar', () => { /* sin re-render automático: el usuario controla */ });
