/* ===== Lotes CIW — pestana Orden de muestras ===== */
'use strict';

import { $, esc, escA, num, DATOS, dashData, dashLoading, cargarDashboard,
         registrarVista } from './nucleo.js';
import { activarGrilla } from './grilla.js';
import { clasificarLote, pasaFuente, pasaBusqueda, tiposDeVasija,
         motivoDeFila, vasijaDeFila, litrosDeFila } from './orden-filas.js';
import { pasaMulti, opcionesValores, matchValor, initFiltrosMulti,
         limpiarFiltrosMulti, cmpValores, normVal } from './tabla.js';
import { HOJA_POR_PAGINA, pintarHojas, hojaTop, hojaMeta, hojaBanda } from './orden-hoja.js';
import { fmtFecha } from './fechas.js';

/*
 * _otRows: array de objetos { lote, variedad, vasija, litros, motivo, recipiente, cantidad }
 * Vive solo en memoria: NO se persiste en DATOS, NO se llama markDirty.
 */
let _otRows       = [];
let _otFuente     = 'vencidos_proximos';  // valor inicial del select
let _otAtencionTipo = 'todos';            // criterio granular, solo aplica si _otFuente==='atencion'
/* Un Set por columna filtrable, creados UNA vez: los widgets guardan estas
 * mismas referencias, asi que el estado sobrevive a los re-render. */
const filtOt = { lote: new Set(), variedad: new Set(), proyecto: new Set(),
                 etapa: new Set(), vasija: new Set() };
let _otBusqueda = '';                     // buscador de texto libre de la barra
let _descOt = [], _instOt = [];
let _otRecipiente = 'Tubo falcon';
let _otCantidad   = 1;
let _otTitulo     = 'Orden de Trabajo';   // titulo editable de la hoja, sincronizado entre paginas
let _otMapas      = [];                   // {src,nombre,pie} -- imagenes de sesion, nunca se guardan

/* Lista de recipientes validos. Unico lugar: antes vivia repetida como
 * literal en dos puntos del archivo (la fila y el select por defecto). */
const RECIPIENTES_OT = ['Tubo falcon', 'Botella 120 mL'];
const ORDEN_PER_PAGE = HOJA_POR_PAGINA;

/* Adaptador de la grilla sobre _otRows.
 *
 * OJO: _otRows se REASIGNA enteros en _otBuildRows() (cambiar fuente, filtro,
 * o "Recargar filas"). Estas funciones cierran sobre la VARIABLE del modulo,
 * no sobre una copia local, asi que siempre leen y escriben el array VIGENTE
 * aunque haya sido reemplazado despues de que activarGrilla se llamo.
 *
 * lote/variedad/vasija/litros son de solo lectura EN LA GRILLA (paste, Ctrl+D,
 * Ctrl+Enter, Delete no los tocan): salen del lote, no de la muestra. Motivo,
 * recipiente y cantidad si se editan. Nunca markDirty: esta orden es efimera,
 * no vive en DATOS.
 */
const _otAdaptador = {
  objetoDe(f){ return _otRows[f] != null ? _otRows[f] : null; },
  leer(obj, k){ return obj ? obj[k] : undefined; },
  escribir(obj, k, texto){
    if (!obj) return 'ro';
    if (k !== 'motivo' && k !== 'recipiente' && k !== 'cantidad') return 'ro';

    const val = String(texto ?? '').trim();

    if (k === 'motivo'){
      obj.motivo = val;   // texto libre, sin normalizar a null (igual que el listener manual)
      return 'ok';
    }
    if (k === 'recipiente'){
      const m = RECIPIENTES_OT.find(r => r.toLowerCase() === val.toLowerCase());
      if (!m) return 'invalido';
      obj.recipiente = m;
      return 'ok';
    }
    // cantidad: entero >= 1
    const n = num(val);
    if (n == null || n < 1) return 'invalido';
    obj.cantidad = Math.round(n);
    return 'ok';
  },
  escribirCrudo(obj, k, valor){ if (obj) obj[k] = valor; },
  onCambio(){ _otRenderTabla(); _otPintarPaginas(); },   // no se persiste: sin markDirty
};

/* Construye _otRows a partir de la fuente elegida */
function _otBuildRows(){
  if (!dashData()) return [];

  /* mapa lote -> DATOS.lotes para vasija y litros */
  const loteMap = new Map();
  for (const l of (DATOS().lotes || [])){
    loteMap.set(String(l.lote ?? ''), l);
  }

  const fuente = _otFuente;

  let lotes = (dashData().lotes || []).filter(l => pasaMulti(l, _descOt));

  if (fuente === 'hoja_en_blanco') return [];

  /* El segundo argumento es el lote completo: la fila del dashboard no trae
   * los envases y sin el no se puede resolver la ronda de tanques. */
  lotes = lotes.filter(l => pasaFuente(
    clasificarLote(l, loteMap.get(String(l.lote ?? ''))), fuente, _otAtencionTipo));

  /* ordenar por número de lote */
  lotes = [...lotes].sort((a, b) => {
    const na = parseFloat(String(a.lote ?? ''));
    const nb = parseFloat(String(b.lote ?? ''));
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a.lote ?? '').localeCompare(String(b.lote ?? ''), 'es');
  });

  /* El buscador se aplica DESPUES del map, no antes: mira vasija y motivo, que
   * no existen en la fila del dashboard -- recien aparecen al armar la fila. */
  return lotes.map(l => {
    const info = loteMap.get(String(l.lote ?? ''));
    const cls  = clasificarLote(l, info);
    return {
      lote:       String(l.lote ?? ''),
      variedad:   l.variedad || '',
      vasija:     vasijaDeFila(info),
      litros:     litrosDeFila(info),
      motivo:     motivoDeFila(cls, fuente),
      recipiente: _otRecipiente,
      cantidad:   _otCantidad,
    };
  }).filter(r => pasaBusqueda(r, _otBusqueda));
}

/* Renderiza la tabla editable de la OT (sin re-construir el shell) */
function _otRenderTabla(){
  const tbody = $('otTbody');
  if (!tbody) return;

  let tb = '';
  _otRows.forEach((r, i) => {
    const recOpts = RECIPIENTES_OT.map(v =>
      `<option value="${escA(v)}"${v === r.recipiente ? ' selected' : ''}>${esc(v)}</option>`
    ).join('');

    tb += `<tr data-oti="${i}">
  <td><input class="cell" type="text" data-oti="${i}" data-otk="lote"      value="${escA(r.lote)}"></td>
  <td><input class="cell" type="text" data-oti="${i}" data-otk="variedad"  value="${escA(r.variedad)}"></td>
  <td><input class="cell" type="text" data-oti="${i}" data-otk="vasija"    value="${escA(r.vasija)}"></td>
  <td><input class="cell num" type="text" data-oti="${i}" data-otk="litros" value="${escA(r.litros)}"></td>
  <td><input class="cell" type="text" data-oti="${i}" data-otk="motivo"   value="${escA(r.motivo)}"></td>
  <td><select class="cell" data-oti="${i}" data-otk="recipiente">${recOpts}</select></td>
  <td style="white-space:nowrap">
    <button class="rowbtn" data-ot-minus="${i}" title="Menos" style="font-size:13px">−</button>
    <input class="cell num" type="text" data-oti="${i}" data-otk="cantidad" value="${escA(String(r.cantidad))}" style="width:34px;text-align:center;display:inline-block">
    <button class="rowbtn" data-ot-plus="${i}" title="Más" style="font-size:13px">+</button>
  </td>
  <td class="ot-del-col"><button class="rowbtn" data-ot-del="${i}" title="Quitar fila">✕</button></td>
</tr>`;
  });

  tbody.innerHTML = tb || `<tr id="otAddRow"><td colspan="8" style="color:var(--muted)">Sin filas. Usá "Agregar fila" o cambiá la fuente.</td></tr>`;

  /* Fila de agregar (siempre al final) */
  const addRow = document.createElement('tr');
  addRow.id = 'otAddRow';
  addRow.innerHTML = `<td colspan="8" style="padding:6px 8px">
    <button class="btn" id="btnOtAgregar">➕ Agregar fila</button>
  </td>`;
  tbody.appendChild(addRow);

  /* Grilla tipo planilla: se re-activa en CADA llamada (antes del guard de
   * cableado de abajo), porque el tbody se reconstruye entero en cada una
   * (cambiar fuente/filtro, +/-, agregar, quitar fila) y activarGrilla es
   * quien recalcula la geometria y restaura la seleccion por identidad. */
  const otTable = $('otTable');
  if (otTable) activarGrilla(otTable, _otAdaptador);

  /* Listeners delegados en tbody: enganchar UNA sola vez. El nodo tbody persiste
     entre renders (solo se reemplaza su innerHTML), así que sin este guard se
     acumularían y los botones ±/✕/agregar dispararían múltiples veces. */
  if (tbody._otWired) return;
  tbody._otWired = true;

  tbody.addEventListener('input', e => {
    const el = e.target.closest('input.cell[data-otk]');
    if (!el) return;
    const i = +el.dataset.oti;
    if (!_otRows[i]) return;
    if (el.dataset.otk === 'cantidad'){
      // entero >= 1; un valor invalido (todavia incompleto mientras se tipea)
      // no pisa el numero vigente, igual que el resto de la grilla.
      const n = num(el.value);
      if (n != null && n >= 1) _otRows[i].cantidad = Math.round(n);
    } else {
      _otRows[i][el.dataset.otk] = el.value;
    }
    _otPintarPaginas();
  });

  tbody.addEventListener('change', e => {
    const el = e.target.closest('select.cell[data-otk]');
    if (!el) return;
    const i = +el.dataset.oti;
    if (_otRows[i]) _otRows[i][el.dataset.otk] = el.value;
    _otPintarPaginas();
  });

  tbody.addEventListener('click', e => {
    /* borrar fila */
    const del = e.target.closest('[data-ot-del]');
    if (del){ _otRows.splice(+del.dataset.otDel, 1); _otRenderTabla(); _otPintarPaginas(); return; }

    /* menos */
    const minus = e.target.closest('[data-ot-minus]');
    if (minus){
      const i = +minus.dataset.otMinus;
      if (_otRows[i] && _otRows[i].cantidad > 1){ _otRows[i].cantidad--; _otRenderTabla(); _otPintarPaginas(); } return;
    }

    /* más */
    const plus = e.target.closest('[data-ot-plus]');
    if (plus){
      const i = +plus.dataset.otPlus;
      if (_otRows[i]){ _otRows[i].cantidad++; _otRenderTabla(); _otPintarPaginas(); } return;
    }

    /* agregar fila */
    const add = e.target.closest('#btnOtAgregar');
    if (add){
      _otRows.push({ lote:'', variedad:'', vasija:'', litros:'', motivo:'', recipiente:_otRecipiente, cantidad:_otCantidad });
      _otRenderTabla();
      _otPintarPaginas();
      return;
    }
  });
}

/* Pinta #otPaginas: la vista de PAPEL, paginada a 25 filas, mas una hoja
 * final por cada mapa de barriles adjunto. Separada de _otRenderTabla():
 * esta es la unica seccion visible al imprimir (ver CSS de printing-orden). */
function _otPintarPaginas(){
  const cont = $('otPaginas');
  if (!cont) return;

  const fechaISO = $('otFecha') ? $('otFecha').value : '';
  const fechaTxt = fmtFecha(fechaISO);
  const anio = fechaISO.slice(0, 4);
  const nro = $('otNumOrden') ? $('otNumOrden').value : '';
  const dia = $('otDia') ? $('otDia').value : '';
  const recibio = $('otRecibio') ? $('otRecibio').value : '';
  const emitio = $('otEmitio') ? $('otEmitio').value : '';

  const meta = { fechaTxt, anio, nro };
  const banda = ['MUESTRAS', dia, 'Lab CIW + Degustación'];

  const hojasMapas = _otMapas.map((m, i) => {
    const sufijo = _otMapas.length > 1 ? ` (${i + 1} de ${_otMapas.length})` : '';
    return `<div class="orden-hoja oh-mapa">` +
      hojaTop() +
      `<div class="oh-titulo">Mapa de barriles${sufijo}</div>` +
      hojaMeta(meta) +
      hojaBanda(banda) +
      `<img class="oh-mapa-img" src="${m.src}" alt="Mapa de barriles">` +
      `<input class="oh-mapa-pie" data-mapapieot="${i}" value="${escA(m.pie || '')}" placeholder="Escribí una descripción de la imagen…">` +
    `</div>`;
  });

  cont.innerHTML = pintarHojas({
    filas: _otRows,
    porPagina: ORDEN_PER_PAGE,
    titulo: _otTitulo,
    meta, banda, emitio, recibio,
    nota: 'Tomar muestra en un tubo falcon y luego sanitizar jeringa para cada lote.',
    /* El PAPEL lleva 7 columnas, no las 9 de la grilla: LITROS y MOTIVO quedan
     * solo en pantalla. Son datos para DECIDIR a quien se le pide muestra, no
     * para quien camina la bodega con la hoja.
     *
     * No es cosmetico. Medido sobre el papel real (688px utiles = A4 menos el
     * margen de 14mm del @page), las 9 columnas necesitaban 763px para no
     * envolver: no entraban. VARIEDAD ("Cabernet Sauvignon") y VASIJA
     * ("Barrica + t50 + t200") caian a dos lineas, la fila pasaba de 30px a 41px
     * y 9 de cada 10 hojas se derramaban a una pagina fisica extra, dejando las
     * firmas sueltas al final. Con 7 columnas el requerimiento baja a ~559px y
     * sobran ~130px, asi que nada envuelve y la hoja entra entera. */
    colgroup: `<colgroup><col style="width:34px"><col style="width:60px"><col><col style="width:140px"><col style="width:50px"><col style="width:110px"><col style="width:56px"></colgroup>`,
    thead: `<tr><th class="c oh-num">#</th><th class="c">LOTE</th><th>VARIEDAD</th><th>VASIJA</th><th class="c">Cant.</th><th>Recipiente</th><th class="oh-check">Check</th></tr>`,
    columnas: 7,
    textoVacio: 'No hay lotes para los criterios elegidos.',
    /* Recipiente va como TEXTO, no como <select disabled>. El papel es un espejo
     * de solo lectura: el select no se podia usar, sumaba alto a cada fila y
     * obligaba a neutralizar su flechita con appearance:none en el CSS de print. */
    renderFila: ({ numero, fila: r }) => {
      return `<tr>` +
        `<td class="c oh-num">${numero}</td>` +
        `<td class="c">${esc(r.lote)}</td>` +
        `<td>${esc(r.variedad)}</td>` +
        `<td>${esc(r.vasija)}</td>` +
        `<td class="c">${esc(String(r.cantidad))}</td>` +
        `<td>${esc(r.recipiente || '')}</td>` +
        `<td class="oh-check"></td>` +
      `</tr>`;
    },
    hojasExtra: hojasMapas,
  });
}

/* Los tres pasos que dispara cualquier cambio de filtro. El tercero es el que
 * importa no olvidar: sin el, la hoja de papel imprimible queda desincronizada
 * de la tabla en pantalla y no se nota hasta que alguien imprime. */
function _otAplicarFiltros(){
  _otRows = _otBuildRows();
  _otRenderTabla();
  _otPintarPaginas();
  const c = $('otCount');
  if (c) c.textContent = _otRows.length + ' fila' + (_otRows.length !== 1 ? 's' : '');
}

function initFiltrosOt(){
  /* Mapa lote -> objeto de DATOS().lotes, reconstruido en cada uso: capturarlo
   * una vez daria proyectos obsoletos si se editan los lotes. */
  const infoMapDe = () => {
    const m = new Map();
    for (const l of (DATOS().lotes || [])) m.set(String(l.lote ?? ''), l);
    return m;
  };
  const proyectoDe = (m) => (fila) => {
    const info = m.get(String(fila.lote ?? ''));
    return info ? (info.proyecto || '').trim() : '';
  };
  const vasijaDe = (m) => (fila) => {
    const info = m.get(String(fila.lote ?? ''));
    return info ? (info.vasija_actual || '').trim() : '';
  };

  _descOt = [
    {
      /* Va primero en la barra: es el filtro mas directo, "quiero estos lotes".
       * El widget ya trae su propio buscador y "Todas", asi que una lista de
       * doscientos numeros se maneja sola; cmpValores los ordena numericamente
       * (26001 antes que 26100) en vez de alfabeticamente. */
      label: 'Lote',
      set: filtOt.lote,
      opciones: () => opcionesValores((dashData() && dashData().lotes) || [], l => l.lote),
      match: matchValor(l => l.lote),
    },
    {
      /* variedad viene directa en la fila del dashboard: descriptor generico */
      label: 'Variedad',
      set: filtOt.variedad,
      opciones: () => opcionesValores((dashData() && dashData().lotes) || [], l => l.variedad),
      match: matchValor(l => l.variedad),
    },
    {
      /* proyecto NO viene en la fila del dashboard: hay que resolverlo por lote */
      label: 'Proyecto',
      set: filtOt.proyecto,
      opciones: () => opcionesValores((dashData() && dashData().lotes) || [], proyectoDe(infoMapDe())),
      match: (fila, set) => set.has(proyectoDe(infoMapDe())(fila)),
    },
    {
      /* etapa SI viene en la fila del dashboard: servidor.py la inyecta en
       * datos_dashboard() junto con pct e hitos. Descriptor generico. */
      label: 'Etapa',
      set: filtOt.etapa,
      opciones: () => opcionesValores((dashData() && dashData().lotes) || [], l => l.etapa),
      match: matchValor(l => l.etapa),
    },
    {
      /* Vasija es el unico filtro donde una fila cae en VARIAS opciones: un lote
       * en 't50 + Barrica' aparece bajo Barrica y bajo t50. Por eso no usa
       * opcionesValores/matchValor (que asumen un valor por fila) sino que
       * aplana tiposDeVasija(). El porque del agrupamiento esta en orden-filas.js. */
      label: 'Vasija',
      set: filtOt.vasija,
      opciones: () => {
        const de = vasijaDe(infoMapDe());
        const vals = new Set();
        for (const fila of ((dashData() && dashData().lotes) || [])){
          for (const t of tiposDeVasija(de(fila))) vals.add(normVal(t));
        }
        return [...vals].sort(cmpValores)
          .map(v => ({ val: v, text: v === '' ? '(sin vasija)' : v }));
      },
      match: (fila, set) => tiposDeVasija(vasijaDe(infoMapDe())(fila))
        .some(t => set.has(normVal(t))),
    },
  ];
  _instOt = initFiltrosMulti('otFltBar', _descOt, _otAplicarFiltros);
}

export function renderOrden(){
  const sec = $('tab-orden'); if (!sec) return;

  /* --- si no hay datos del dashboard, mostrar placeholder y disparar carga --- */
  if (!dashData()){
    sec.innerHTML = '<div class="msg info" style="margin-top:10px">Cargando datos del motor de análisis…</div>';
    if (!dashLoading()) cargarDashboard();
    return;
  }

  /* --- fecha de hoy --- */
  const hoyISO  = new Date().toISOString().slice(0, 10);
  const diasSem = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const hoyDia  = diasSem[new Date().getDay()];

  const fuenteOpts = [
    { v:'vencidos',          l:'Vencidos'              },
    { v:'proximos',          l:'Próximos a vencer (≤ 5 d)' },
    { v:'vencidos_proximos', l:'Vencidos + próximos'   },
    { v:'sin_analisis',      l:'Sin análisis'          },
    { v:'atencion',          l:'Atención (NO OK)'      },
    { v:'todos',             l:'Todos los lotes'       },
    { v:'ronda_tanques',     l:'Ronda de tanques'      },
    { v:'hoja_en_blanco',    l:'Hoja en blanco'        },
  ].map(o => `<option value="${escA(o.v)}"${o.v === _otFuente ? ' selected' : ''}>${esc(o.l)}</option>`).join('');

  const atencionOpts = [
    { v:'todos',      l:'Todos los criterios'    },
    { v:'so2',        l:'SO2 no OK'              },
    { v:'ph',         l:'pH no OK'               },
    { v:'av',         l:'AV alerta'              },
    { v:'fa',         l:'FA no finalizada'       },
    { v:'fml',        l:'FML no finalizada'      },
    { v:'noLleno',    l:'No lleno'               },
    { v:'so2Caida',   l:'Caída de SO₂ libre'     },
    { v:'sinControl', l:'Sin control de proceso' },
  ].map(o => `<option value="${escA(o.v)}"${o.v === _otAtencionTipo ? ' selected' : ''}>${esc(o.l)}</option>`).join('');

  const recOpts = RECIPIENTES_OT.map(v =>
    `<option value="${escA(v)}"${v === _otRecipiente ? ' selected' : ''}>${esc(v)}</option>`
  ).join('');

  sec.innerHTML = `
<div id="ordenControls" class="card" style="margin-bottom:14px">
  <h2>Orden de trabajo — muestras</h2>

  <!-- fuente + filtros -->
  <div class="toolbar" id="ordenToolbar" style="margin-bottom:14px">
    <label style="font-size:12px;color:var(--muted);white-space:nowrap">Incluir:</label>
    <select id="otFuente">${fuenteOpts}</select>
    <span id="otWrapAtencion" style="display:${_otFuente === 'atencion' ? '' : 'none'}">
      <label style="font-size:12px;color:var(--muted);white-space:nowrap">Criterio de atención:</label>
      <select id="otAtencionTipo">${atencionOpts}</select>
    </span>
    <div class="mfilt-bar" id="otFltBar"></div>
    <input class="txt" id="otBuscar" type="search" placeholder="Buscar lote, variedad, vasija…"
           value="${escA(_otBusqueda)}" style="width:210px">
    <button class="btn" id="btnOtLimpiarFlt" title="Limpiar el buscador y todos los filtros">🧹 Limpiar filtros</button>
    <button class="btn" id="btnOtRecargar">🔄 Recargar filas</button>
    <span class="tag" id="otCount"></span>
    <div class="spacer"></div>
    <button class="btn primary" id="btnOtImprimir">🖨️ Imprimir</button>
  </div>

  <!-- recipiente + cantidad globales -->
  <div class="controls" style="margin-bottom:14px;gap:12px">
    <label style="font-size:12px;color:var(--muted);white-space:nowrap">Recipiente por defecto:</label>
    <select id="otDefRecipiente">${recOpts}</select>
    <label style="font-size:12px;color:var(--muted);white-space:nowrap">Cantidad:</label>
    <button class="btn" id="btnOtDefMinus" style="padding:6px 12px">−</button>
    <span id="otDefCantidad" style="min-width:24px;display:inline-block;text-align:center;font-weight:600">${esc(String(_otCantidad))}</span>
    <button class="btn" id="btnOtDefPlus" style="padding:6px 12px">+</button>
    <button class="btn" id="btnOtAplicarDef" title="Aplica el recipiente y cantidad seleccionados a TODAS las filas">Aplicar a todas las filas</button>
  </div>

  <!-- mapas de barriles -->
  <div class="controls" style="gap:12px;align-items:flex-start">
    <label style="font-size:12px;color:var(--muted);white-space:nowrap;padding-top:4px">Mapas de barriles:</label>
    <input type="file" id="otMapaFile" accept="image/*" multiple style="display:none">
    <button class="btn" id="btnOtMapa">🗺️ Adjuntar mapa…</button>
    <span id="otMapaChips"></span>
    <span class="tag" style="font-size:11px">Cada imagen se agrega como hoja final al imprimir.</span>
  </div>
</div>

<!-- encabezado imprimible de la OT -->
<div id="otHeader" class="card" style="margin-bottom:14px">
  <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start">
    <div style="flex:1;min-width:200px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:1.2px">N° de orden</div>
      <input class="txt" id="otNumOrden" type="text" placeholder="OT-2026-001" style="width:100%">
    </div>
    <div style="flex:1;min-width:160px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:1.2px">Fecha</div>
      <input class="txt" id="otFecha" type="date" value="${escA(hoyISO)}" style="width:100%">
    </div>
    <div style="flex:1;min-width:160px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:1.2px">Día</div>
      <input class="txt" id="otDia" type="text" value="${escA(hoyDia)}" style="width:100%">
    </div>
    <div style="flex:1;min-width:160px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:1.2px">Emitió</div>
      <input class="txt" id="otEmitio" type="text" placeholder="Nombre…" style="width:100%">
    </div>
    <div style="flex:1;min-width:160px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:1.2px">Recibió</div>
      <input class="txt" id="otRecibio" type="text" placeholder="Nombre…" style="width:100%">
    </div>
  </div>
</div>

<!-- tabla editable de la OT -->
<div class="scroll tall">
<table id="otTable">
  <thead><tr>
    <th data-k="lote">Lote</th>
    <th data-k="variedad">Variedad</th>
    <th data-k="vasija">Vasija</th>
    <th data-k="litros" class="num">Litros</th>
    <th data-k="motivo">Motivo</th>
    <th data-k="recipiente">Recipiente</th>
    <th data-k="cantidad" class="num">Cantidad</th>
    <th class="ot-del-col"></th>
  </tr></thead>
  <tbody id="otTbody"></tbody>
</table>
</div>

<!-- vista de papel: oculta en pantalla, unica seccion visible al imprimir -->
<div id="otPaginas" style="display:none"></div>`;

  /* --- construir filas iniciales si la tabla está vacía o si se cambia la fuente --- */
  _otAplicarFiltros();

  /* --- listeners de controles (re-wired en cada render porque sec.innerHTML cambia) --- */

  /* fuente */
  $('otFuente').addEventListener('change', e => {
    _otFuente = e.target.value;
    $('otWrapAtencion').style.display = (_otFuente === 'atencion') ? '' : 'none';
    _otAplicarFiltros();
  });

  /* criterio de atencion granular */
  $('otAtencionTipo').addEventListener('change', e => {
    _otAtencionTipo = e.target.value;
    _otAplicarFiltros();
  });

  /* --- filtros multi (re-montados en cada render porque sec.innerHTML se recreo) --- */
  if (_descOt.length === 0){
    initFiltrosOt();
  } else {
    const bar = $('otFltBar');
    if (bar){
      bar.innerHTML = '';
      _instOt.forEach(f => { bar.appendChild(f.el); f.rebuild(); });
    }
  }

  /* buscador de texto libre. Sin debounce a proposito: la grilla ya ignora las
   * teclas cuando el foco esta en un control que no le pertenece
   * (grilla.js, cablearTeclado), asi que tipear aca no roba el foco ni arranca
   * a editar una celda. El input vive en #ordenControls, fuera del tbody que
   * _otRenderTabla() repinta, por eso conserva el cursor entre teclas. */
  $('otBuscar').addEventListener('input', e => {
    _otBusqueda = e.target.value;
    _otAplicarFiltros();
  });

  /* limpiar: el buscador Y los cuatro multi-select de una. limpiarFiltrosMulti
   * vacia los Sets, blanquea el input y llama a onChange una sola vez, asi que
   * _otBusqueda se resetea ANTES para que ese unico repintado ya lo vea. */
  $('btnOtLimpiarFlt').addEventListener('click', () => {
    _otBusqueda = '';
    limpiarFiltrosMulti(_descOt, 'otBuscar', _instOt, _otAplicarFiltros);
  });

  /* recargar filas manualmente */
  $('btnOtRecargar').addEventListener('click', () => {
    _otAplicarFiltros();
  });

  /* recipiente / cantidad por defecto */
  $('otDefRecipiente').addEventListener('change', e => { _otRecipiente = e.target.value; });
  $('btnOtDefMinus').addEventListener('click', () => {
    if (_otCantidad > 1){ _otCantidad--; $('otDefCantidad').textContent = _otCantidad; }
  });
  $('btnOtDefPlus').addEventListener('click', () => {
    _otCantidad++;
    $('otDefCantidad').textContent = _otCantidad;
  });
  $('btnOtAplicarDef').addEventListener('click', () => {
    _otRows.forEach(r => { r.recipiente = _otRecipiente; r.cantidad = _otCantidad; });
    _otRenderTabla();
    _otPintarPaginas();
  });

  /* encabezado (N de orden/fecha/dia/emitio/recibio) -> solo repintan la hoja de papel */
  ['otNumOrden', 'otFecha', 'otDia', 'otEmitio', 'otRecibio'].forEach(id => {
    $(id).addEventListener('input', _otPintarPaginas);
    $(id).addEventListener('change', _otPintarPaginas);
  });

  /* titulo editable de la hoja: se sincroniza en todas las paginas */
  $('otPaginas').addEventListener('input', e => {
    const t = e.target.closest('[data-tituloot]');
    if (t){
      _otTitulo = t.value;
      $('otPaginas').querySelectorAll('[data-tituloot]').forEach(o => { if (o !== t) o.value = t.value; });
      return;
    }
    const pie = e.target.closest('[data-mapapieot]');
    if (pie){ const m = _otMapas[+pie.dataset.mapapieot]; if (m) m.pie = pie.value; return; }
  });

  /* mapas de barriles: adjuntar una o varias imagenes, cada una anexada como hoja final */
  $('btnOtMapa').addEventListener('click', () => $('otMapaFile').click());
  $('otMapaFile').addEventListener('change', e => {
    const files = [...(e.target.files || [])]; if (!files.length) return;
    const slots = new Array(files.length); let pend = files.length;
    files.forEach((f, idx) => {
      const rd = new FileReader();
      rd.onload = () => {
        slots[idx] = { src: rd.result, nombre: f.name, pie: '' };
        if (--pend === 0){ _otMapas.push(...slots); _otPintarMapaChips(); _otPintarPaginas(); }
      };
      rd.readAsDataURL(f);
    });
    e.target.value = '';
  });
  $('otMapaChips').addEventListener('click', e => {
    const b = e.target.closest('[data-delmapaot]'); if (!b) return;
    _otMapas.splice(+b.dataset.delmapaot, 1);
    _otPintarMapaChips();
    _otPintarPaginas();
  });
  _otPintarMapaChips();

  /* imprimir */
  $('btnOtImprimir').addEventListener('click', () => {
    document.body.classList.add('printing-orden');
    window.print();
    document.body.classList.remove('printing-orden');
  });
}

/* Chips de mapas adjuntos, con boton de quitar -- vive fuera de #otPaginas
 * (que se reconstruye entero en cada _otPintarPaginas) para no perder el
 * listener; se repinta solo cuando cambia _otMapas. */
function _otPintarMapaChips(){
  const cont = $('otMapaChips');
  if (!cont) return;
  cont.innerHTML = _otMapas.length
    ? _otMapas.map((m, i) => `<span class="tag">🗺️ ${esc(m.nombre)} <button data-delmapaot="${i}" title="Quitar imagen" style="border:none;background:none;color:#c0392b;cursor:pointer">✕</button></span>`).join(' ')
    : '<span class="tag">(sin imágenes)</span>';
}

registrarVista('orden', () => renderOrden());
