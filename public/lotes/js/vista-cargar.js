/* ===== Lotes CIW — pestana Cargar analisis ===== */
'use strict';

import { $, esc, escA, DATOS, markDirty, registrarVista, mostrarTab } from './nucleo.js';
import { activarGrilla } from './grilla.js';
import { ORDEN_PLANILLA, planDeColumnas, parsearFila, faltanParaControl, NUMERICAS, parsearFecha } from './carga-cols.js';
import { marcarRepetidos } from './carga-duplicados.js';
import { planActualizacion, aplicarActualizacion } from './carga-actualizar.js';
import { fmtFecha } from './fechas.js';
import { avisar, confirmar } from './dialogos.js';

/* 'agregar' (cada fila es un análisis nuevo) o 'actualizar' (cada fila corrige
 * el análisis ya cargado de ese lote y fecha): ver carga-actualizar.js. */
function modo(){
  const el = document.querySelector('input[name="cargarModo"]:checked');
  return el && el.value === 'actualizar' ? 'actualizar' : 'agregar';
}

const AYUDA_MODO = {
  agregar: 'Cada fila se agrega como un análisis nuevo. Las filas idénticas a un análisis ya cargado se saltean.',
  actualizar: 'Cada fila busca el análisis ya cargado del mismo lote y fecha (y vasija, si la pegás) y cambia ' +
    'SOLO los casilleros que traen un valor: los vacíos no se tocan. Para corregir un solo dato, pegá lote, fecha ' +
    'y ese valor — podés acortar el orden de columnas, por ejemplo: lote, fecha, so2_libre. ' +
    'No crea análisis nuevos. Para borrar un dato, usá la pestaña Análisis.',
};

function _mostrarAyudaModo(){
  const el = $('cargarModoAyuda');
  if (el) el.textContent = AYUDA_MODO[modo()];
}

/* Cambiar de modo invalida la previsualización: la misma fila significa otra
 * cosa (agregar vs. corregir), así que hay que volver a previsualizar. */
function _alCambiarModo(){
  _mostrarAyudaModo();
  $('cargarPreview').style.display = 'none';
  $('cargarMsg').innerHTML = '';
  $('tCargar').innerHTML = '';
  $('tCargar')._filas = null;
}

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

    /* Los errores de LECTURA se guardan aparte: al confirmar se vuelve a
     * planificar contra los datos de ese momento, y los errores del plan
     * ("no hay un análisis…") se recalculan desde cero, no se acumulan. */
    obj._errLectura = [...obj._errores];
    filas.push(obj);
  }

  marcarSegunModo(filas, colsMostrar);
  return { colsMostrar, filas };
}

/* Agregar: lo que ya esta cargado igualito no se vuelve a cargar (ver
 * carga-duplicados.js). Actualizar: cada fila busca su analisis y anota que
 * casilleros cambia (ver carga-actualizar.js). En los dos casos contra los
 * datos de AHORA. */
function marcarSegunModo(filas, colsMostrar){
  for (const f of filas) f._errores = [...(f._errLectura || [])];
  if (modo() === 'actualizar'){
    for (const f of filas) delete f._repetido;
    planActualizacion(filas, DATOS().analisis, colsMostrar);
  } else {
    marcarRepetidos(filas, DATOS().analisis, colsMostrar);
  }
}

/* Un valor tal como se lee en la tabla: la coma decimal de la planilla, la
 * fecha dd/mm/aaaa y una raya si no había nada. */
function _vistaValor(campo, v){
  if (v == null || v === '') return '—';
  if (campo === 'fecha_analisis') return fmtFecha(v);
  return typeof v === 'number' ? String(v).replace('.', ',') : String(v);
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
  if (modo() === 'actualizar') return _previsualizarActualizar(colsMostrar, filas);

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
    errNote.textContent = 'Hay filas con errores — igual podés agregar las válidas';
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
  $('tCargar')._modo = 'agregar';
}

/* Previsualización del modo "Actualizar": por fila, qué análisis toca y cada
 * casillero que cambia como "antes → después". Nada se aplica hasta confirmar. */
function _previsualizarActualizar(colsMostrar, filas){
  const msgEl   = $('cargarMsg');
  const errNote = $('cargarErrNote');
  const btnAgg  = $('btnAgregarAnalisis');

  const conErrores  = filas.filter(f => f._errores.length > 0).length;
  const sinCambios  = filas.filter(f => !f._errores.length && !f._cambios.length).length;
  const aActualizar = filas.filter(f => !f._errores.length && f._cambios.length).length;

  let h = '<thead><tr>';
  for (const c of colsMostrar) h += `<th data-k="${escA(c)}">${esc(CARGAR_LABELS[c] || c)}</th>`;
  h += '<th data-k="_cambios">Qué cambia</th><th data-k="_estado">Estado</th></tr></thead>';

  let tb = '<tbody>';
  for (const f of filas){
    const hayError = f._errores.length > 0;
    const fondo = hayError ? '#fbeeeb' : !f._cambios.length ? '#fbf4e4' : '';
    tb += `<tr${fondo ? ` style="background:${fondo}"` : ''}>`;
    for (const c of colsMostrar){
      const v = f[c];
      const vista = v == null || v === '' ? '' : _vistaValor(c, v);
      tb += `<td${c==='lote'||c==='vasija'||c==='fecha_analisis'?'':' class="num"'}>${esc(vista)}</td>`;
    }
    const cambios = f._cambios.map(ch =>
      `<b>${esc(CARGAR_LABELS[ch.campo] || ch.campo)}</b>: ${esc(_vistaValor(ch.campo, ch.antes))} → <b>${esc(_vistaValor(ch.campo, ch.despues))}</b>`
    ).join('<br>');
    tb += `<td>${cambios || '<span style="color:var(--muted)">—</span>'}</td>`;
    if (hayError)            tb += `<td><span class="pill bad">${esc(f._errores.join(', '))}</span></td>`;
    else if (!f._cambios.length) tb += `<td><span class="pill warn">ya tiene esos valores — no cambia nada</span></td>`;
    else                     tb += `<td><span class="pill ok">se actualiza</span></td>`;
    tb += '</tr>';
  }
  tb += '</tbody>';

  $('tCargar').innerHTML = h + tb;
  activarGrilla($('tCargar'));

  let html = '';
  if (conErrores > 0){
    html += `<div class="msg err">${filas.length} filas leídas — <b>${aActualizar} para actualizar</b>, <b>${conErrores} que no se pueden aplicar</b> (marcadas en rojo). Revisalas antes de seguir.</div>`;
    errNote.textContent = 'Hay filas que no se pueden aplicar — igual podés actualizar las válidas';
    errNote.style.display = 'inline-block';
  } else {
    errNote.style.display = 'none';
  }
  if (sinCambios > 0){
    html += `<div class="msg warn">⚠ <b>${sinCambios} ${sinCambios === 1 ? 'fila ya tiene' : 'filas ya tienen'} esos valores</b> (marcadas en amarillo): no cambian nada.</div>`;
  }
  if (conErrores === 0){
    html += aActualizar > 0
      ? `<div class="msg ok">✓ ${aActualizar} análisis para actualizar. Revisá en "Qué cambia" que sea lo que querés: solo se tocan esos casilleros.</div>`
      : `<div class="msg info">No hay nada para actualizar.</div>`;
  }
  msgEl.innerHTML = html;

  btnAgg.textContent = `✏️ Actualizar ${aActualizar} análisis`;
  btnAgg.disabled = aActualizar === 0;
  $('cargarPreview').style.display = 'block';

  $('tCargar')._filas = filas;
  $('tCargar')._colsMostrar = colsMostrar;
  $('tCargar')._modo = 'actualizar';
}

function _confirmarActualizar(t){
  /* Se planifica de nuevo contra lo cargado AHORA: en el medio pudo entrar un
   * guardado de otra computadora, y los cambios se calculan sobre eso. */
  marcarSegunModo(t._filas, t._colsMostrar);
  const aplicables = t._filas.filter(f => !f._errores.length && f._cambios.length);
  if (!aplicables.length){
    avisar('No hay nada para actualizar: los análisis ya tienen esos valores o no se encontraron.', { tipo: 'info' });
    return;
  }
  const casilleros = aplicables.reduce((n, f) => n + f._cambios.length, 0);
  const analisis = aplicarActualizacion(t._filas, DATOS().analisis);
  markDirty();

  $('cargarMsg').innerHTML = `<div class="msg ok">✓ ${casilleros === 1 ? 'Se actualizó' : 'Se actualizaron'} <b>${casilleros} ${casilleros === 1 ? 'casillero' : 'casilleros'}</b> en <b>${analisis} análisis</b>. Se guarda solo en unos segundos.</div>`;
  $('btnAgregarAnalisis').disabled = true;
  $('cargarErrNote').style.display = 'none';
}

export function cargarConfirmar(){
  if(window.CIW?.rol === 'lector'){ avisar('Tu perfil es de solo lectura.', {tipo:'mal'}); return; }
  const t = $('tCargar');
  if (!t._filas || !DATOS()) return;
  /* Si se cambió de modo después de previsualizar, _alCambiarModo ya borró
   * t._filas; igual se confirma con el modo de la previsualización. */
  if (t._modo === 'actualizar') return _confirmarActualizar(t);

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
    delete o._errLectura; delete o._cambios; delete o._destino;
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
  renderManual();
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


/* Carga manual: usa el documento en memoria y el autoguardado existente. */
const MANUAL = ['lote','vasija','fecha_analisis','etanol','ph','av','gluc_fruc','malico','lactico','acidez_total','so2_libre','azucar_reductor','comentario'];
const MEDIDAS = MANUAL.slice(3);
let paginaManual = 0, editManual = null;
const hoyManual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const textoManual = v => String(v ?? '').trim();
const tieneMedicion = a => MEDIDAS.some(k => textoManual(a[k]) !== '');
function validarManual(raw, anterior = null){
  const a = {};
  for (const k of MANUAL){
    const v = textoManual(raw[k]);
    if (anterior && v === textoManual(anterior[k])) continue;
    if (k === 'fecha_analisis') { a[k] = parsearFecha(v); if (!a[k]) throw Error('Fecha inválida.'); }
    else if (NUMERICAS.has(k)) {
      if (v && !/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(v)) throw Error('Revisá el valor de '+CARGAR_LABELS[k]+'.');
      a[k] = v ? Number(v.replace(',','.')) : null;
      if (v && !Number.isFinite(a[k])) throw Error('Número inválido.');
    } else a[k] = v || null;
  }
  const final = {...anterior,...a};
  if (!textoManual(final.lote) || !DATOS().lotes.some(l=>textoManual(l.lote)===textoManual(final.lote))) throw Error('Elegí un lote existente.');
  if (!parsearFecha(final.fecha_analisis)) throw Error('Fecha inválida.');
  if (!tieneMedicion(final)) throw Error('Completá al menos un parámetro.');
  if (anterior && Object.keys(anterior).some(k=>!MANUAL.includes(k)) && ['lote','vasija','fecha_analisis'].some(k=>k in a)) throw Error('Este análisis tiene información asociada. No cambies su identificación desde esta pantalla.');
  const prueba = {...final,_errores:[]};
  marcarRepetidos([prueba],DATOS().analisis.filter(x=>x!==anterior),MANUAL);
  if (prueba._repetido) throw Error('Ya existe un análisis idéntico.');
  return a;
}
function camposManual(a={}){
  return MANUAL.map(k=>`<td><input class="txt" style="width:${k==='fecha_analisis'?'132':k==='comentario'?'150':k==='lote'||k==='vasija'?'95':'76'}px;min-width:0" aria-label="${escA(CARGAR_LABELS[k])}" data-manual="${k}" ${k==='lote'?'list="manualLotes"':''} ${k==='fecha_analisis'?'type="date"':''} ${NUMERICAS.has(k)?'inputmode="decimal"':''} value="${escA(k==='fecha_analisis'?(parsearFecha(a[k])||''):textoManual(a[k]))}"></td>`).join('');
}
function camposAltaManual(a={}){
  return MANUAL.map(k=>`<label class="ciw03-campo"><span>${esc(CARGAR_LABELS[k])}${k==='lote'||k==='fecha_analisis'?' *':''}</span><input class="txt" data-manual="${k}" ${k==='lote'?'list="manualLotes" required':''} ${k==='fecha_analisis'?'type="date" required':''} ${NUMERICAS.has(k)?'inputmode="decimal"':''} value="${escA(k==='fecha_analisis'?(parsearFecha(a[k])||''):textoManual(a[k]))}"></label>`).join('');
}
function leerManual(row){ return Object.fromEntries([...row.querySelectorAll('[data-manual]')].map(e=>[e.dataset.manual,e.value])); }
function renderManual(){
  const panel=$('manualAnalisis'); if(!panel || !DATOS()) return;
  $('manualLotes').innerHTML=[...new Set(DATOS().lotes.map(l=>textoManual(l.lote)))].filter(Boolean).map(v=>`<option value="${escA(v)}"></option>`).join('');
  if(editManual) return; // no perder una edición al llegar un refresco
  const q=$('manualBuscar').value.trim().toLowerCase();
  const rows=DATOS().analisis.map((a,i)=>({a,i})).filter(({a})=>a && tieneMedicion(a) && [a.lote,a.vasija,a.fecha_analisis,fmtFecha(a.fecha_analisis)].join(' ').toLowerCase().includes(q)).reverse();
  paginaManual=Math.min(paginaManual,Math.max(0,Math.ceil(rows.length/50)-1));
  const visibles=rows.slice(paginaManual*50,paginaManual*50+50);
  const body=$('manualHistBody'); body._rows=visibles;
  body.innerHTML=visibles.map(({a},i)=>`<tr>${MANUAL.map(k=>`<td>${esc(k==='fecha_analisis'?fmtFecha(a[k]):_vistaValor(k,a[k]))}</td>`).join('')}<td style="white-space:nowrap">${window.CIW?.rol === 'lector' ? '' : `<button type="button" class="btn" data-editar="${i}">Editar</button> <button type="button" class="btn" data-borrar="${i}">Eliminar</button>`}</td></tr>`).join('');
  $('manualCuenta').textContent=`${rows.length} análisis · Página ${paginaManual+1} de ${Math.max(1,Math.ceil(rows.length/50))}`;
  $('manualAnterior').disabled=!paginaManual; $('manualSiguiente').disabled=(paginaManual+1)*50>=rows.length;
}
function vigenteManual(a, snapshot){return !!DATOS() && DATOS().analisis.includes(a) && JSON.stringify(a)===snapshot;}
function guardarManual(row, anterior=null){
  if(!DATOS()) throw Error('Los datos aún no cargaron.');
  if(window.CIW?.rol === 'lector') throw Error('Tu perfil es de solo lectura.');
  const raw=leerManual(row);
  // conservar campos sin cambios, incluso representación original de fechas
  if(anterior) for(const k of MANUAL) if(raw[k]===textoManual(k==='fecha_analisis'?parsearFecha(anterior[k]):anterior[k])) raw[k]=anterior[k];
  const cambios=validarManual(raw,anterior);
  if (!anterior && !MEDIDAS.some(k=>NUMERICAS.has(k) && typeof cambios[k] === 'number' && Number.isFinite(cambios[k]) && cambios[k] !== -999)) throw Error('Completá al menos una medición numérica válida.');
  if(anterior) { if(!Object.keys(cambios).length) return; Object.assign(anterior,cambios); }
  else DATOS().analisis.push(cambios);
  markDirty();
  avisar(anterior?'Análisis editado. Guardado automático en curso.':'Análisis agregado. Guardado automático en curso.',{tipo:'ok'});
}
function montarManual(){
  if($('manualAnalisis')) { renderManual(); return; }
  const sec=$('tab-cargar'), cols=$('cargarCols'); if(!sec||!cols) return;
  const card=cols.closest('.card'), preview=$('cargarPreview'); if(!card||!preview) return;
  const panel=document.createElement('div'); panel.id='manualAnalisis'; panel.className='card';
  const headers=MANUAL.map(k=>`<th>${esc(CARGAR_LABELS[k])}</th>`).join('');
  panel.innerHTML=`<div class="toolbar"><h2 style="margin:0">Cargar análisis individual</h2><button class="btn" type="button" id="manualVolver">Volver a Análisis</button></div><p style="color:var(--muted)">Elegí el lote y completá solo los parámetros medidos. No hace falta copiar desde Excel.</p><datalist id="manualLotes"></datalist><div class="ciw03-alta" id="manualAlta">${camposAltaManual({fecha_analisis:hoyManual()})}</div><div class="toolbar" style="justify-content:flex-end;margin-top:10px"><button class="btn" type="button" id="manualLimpiar">Limpiar</button><button class="btn primary" type="button" id="manualAgregar">Guardar análisis</button></div><hr><div class="controls"><h2 style="margin:0">Análisis cargados</h2><input id="manualBuscar" class="txt" placeholder="Buscar lote, vasija o fecha..."></div><p id="manualCuenta" style="color:var(--muted)"></p><div class="scroll tall"><table><thead><tr>${headers}<th>Acciones</th></tr></thead><tbody id="manualHistBody"></tbody></table></div><div class="toolbar"><button type="button" class="btn" id="manualAnterior">Anterior</button><button type="button" class="btn" id="manualSiguiente">Siguiente</button></div>`;
  sec.insertBefore(panel,card);
  const detalles=document.createElement('details'); detalles.style.marginTop='12px';
  const resumen=document.createElement('summary'); resumen.textContent='Importar desde Excel / CSV'; resumen.style.cursor='pointer'; detalles.append(resumen);
  sec.insertBefore(detalles,card); detalles.append(card,preview);
  const radio=card.querySelector('input[name="cargarModo"][value="agregar"]'); if(radio) radio.checked=true;
  $('manualVolver').onclick=()=>mostrarTab('analisis');
  const limpiar=()=>{$('manualAlta').innerHTML=camposAltaManual({fecha_analisis:hoyManual()});};
  if(window.CIW?.rol === 'lector'){ $('manualLimpiar').disabled=true; $('manualAgregar').disabled=true; $('manualAlta').querySelectorAll('input').forEach(e=>e.disabled=true); }
  $('manualLimpiar').onclick=limpiar;
  $('manualAgregar').onclick=()=>{try{guardarManual($('manualAlta'));limpiar();paginaManual=0;renderManual();}catch(e){avisar(e.message,{tipo:'mal'});}};
  $('manualBuscar').oninput=()=>{if(editManual)return;paginaManual=0;renderManual();};
  $('manualAnterior').onclick=()=>{if(!editManual){paginaManual--;renderManual();}};
  $('manualSiguiente').onclick=()=>{if(!editManual){paginaManual++;renderManual();}};
  $('manualHistBody').addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;const body=$('manualHistBody');
    if(b.hasAttribute('data-cancelar')){editManual=null;renderManual();return;}
    if(b.hasAttribute('data-guardar')){if(!editManual)return;try{if(!vigenteManual(editManual.a,editManual.snapshot))throw Error('El análisis cambió. Cancelá y volvé a abrirlo.');guardarManual(b.closest('tr'),editManual.a);editManual=null;renderManual();}catch(err){avisar(err.message,{tipo:'mal'});}return;}
    if(editManual || window.CIW?.rol === 'lector')return;
    const r=body._rows?.[Number(b.dataset.editar??b.dataset.borrar)];if(!r)return;const a=r.a,snapshot=JSON.stringify(a);
    if(!vigenteManual(a,snapshot)){renderManual();return;}
    if(b.hasAttribute('data-editar')){editManual={a,snapshot};b.closest('tr').innerHTML=camposManual(a)+'<td><button type="button" class="btn primary" data-guardar>Guardar</button> <button type="button" class="btn" data-cancelar>Cancelar</button></td>';return;}
    if(!b.hasAttribute('data-borrar'))return;
    if(!await confirmar({titulo:'Eliminar medición',texto:`Lote ${a.lote} · ${fmtFecha(a.fecha_analisis)}. Se eliminarán solo los valores de esta medición.`,si:'Eliminar',no:'Cancelar',peligro:true}))return;
    if(!vigenteManual(a,snapshot)){avisar('El análisis cambió. Volvé a seleccionarlo.',{tipo:'mal'});renderManual();return;}
    // No quitar correcciones, agregados u otros campos asociados.
    if(Object.keys(a).some(k=>!MANUAL.includes(k))){for(const k of MEDIDAS)if(k in a)a[k]=null;}
    else DATOS().analisis.splice(DATOS().analisis.indexOf(a),1);
    markDirty();renderManual();avisar('Medición eliminada. Guardado automático en curso.',{tipo:'ok'});
  });
  renderManual();
}

registrarVista('cargar', () => {
  montarManual();
  /* El orden por defecto lo pone el modulo, no el HTML: asi hay UNA sola fuente
   * de verdad. Solo se rellena si esta vacio, para no pisar un orden que la
   * persona haya tipeado y todavia no usado. */
  const el = $('cargarCols');
  if (el && !el.value.trim()) el.value = ORDEN_PLANILLA;
  _mostrarAyudaModo();
  /* Los botones de modo se enganchan una sola vez (esta funcion corre cada vez
   * que se abre la pestana). */
  document.querySelectorAll('input[name="cargarModo"]').forEach(r => {
    if (r._enganchado) return;
    r._enganchado = true;
    r.addEventListener('change', _alCambiarModo);
  });
});
