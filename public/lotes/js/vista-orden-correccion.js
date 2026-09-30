/* ===== Lotes CIW — pestana Orden de correccion de SO2 =====
 *
 * Una fila por barrica, con su numero, sus litros reales y su dosis. Las
 * barricas de un lote van juntas porque comparten la diferencia de SO2: el SO2
 * se mide en el lote, no barrica por barrica, y lo que cambia por barrica son
 * los litros.
 *
 * Esta vista NO decide el criterio. Las filas vienen resueltas de
 * /api/orden-correccion, incluido el orden por urgencia. La fuente de verdad
 * del calculo es motor_correccion.py; aca solo se recalcula la dosis cuando el
 * usuario pisa el objetivo de un lote, con la misma formula.
 *
 * TODO(refactor): _dosis() es la tercera implementacion de la misma formula
 * (las otras dos son motor_fml.py y calcCorreccionSO2 en vista-so2.js).
 * El modulo compartido js/so2-bitacora.js ya existe (subsistema L, Task 6),
 * pero no absorbio la formula de la dosis porque eso era un refactor aparte.
 * Lo que queda es mover las dos copias JS de la formula a so2-bitacora.js
 * y dejar Python como fuente de verdad. */
'use strict';

import { $, esc, escA, registrarVista, DATOS, markDirty, guardar,
         mostrarOverlay, cerrarOverlay, usuarioActual } from './nucleo.js';
import { armarCorreccion, aplicarCorreccion,
         anularCorreccion, revertirAnulacion } from './so2-bitacora.js';
import { pintarHojas, HOJA_POR_PAGINA } from './orden-hoja.js';
import { filaPapel, theadPapel, COLGROUP_PAPEL, COLUMNAS_PAPEL,
         INSTRUCCIONES_SOLUCION } from './orden-correccion-papel.js';
import { pasaMulti, opcionesValores, matchValor, initFiltrosMulti,
         limpiarFiltrosMulti } from './tabla.js';

/* Formateador local: usa toFixed y muestra '—' para null/Infinity.
 * nucleo.js no exporta fmt (es local en cada vista que lo necesita). */
const fmt = (v, dec) => (v != null && Number.isFinite(v)) ? Number(v).toFixed(dec) : '—';

/* Estado de modulo. Efimero a proposito: la hoja no se persiste, igual que la
 * Orden de muestras. Si se recarga la pagina se vuelve a pedir al servidor. */
let _ocOrden = null;        // respuesta cruda del endpoint
let _ocExcluidos = new Set();    // lotes destildados por el usuario
let _ocObjetivos = new Map();    // lote -> objetivo pisado a mano
const _ocTitulo = 'Orden de corrección de SO₂';

/* Filtros: un Set por columna filtrable, creados UNA vez. Los widgets guardan
 * una referencia a estos mismos objetos, asi que el estado sobrevive al
 * re-render de la vista. */
const filtOc = { variedad: new Set(), proyecto: new Set(),
                 etapa: new Set(), grupo: new Set(), lote: new Set() };

/* Los cinco filtros son multi-select con casillas, todos iguales, asi que una
 * sola lista alcanza: la que recorre pasaMulti es la misma que initFiltrosMulti
 * convierte en paneles. */
let _descOc = [], _instOc = [];

/* Etiquetas legibles para el grupo del cruce con el mapa. Los valores crudos
 * (tanque_grande, sin_ubicar) no son para mostrarle a nadie. */
const OC_GRUPO_LBL = { normal: 'Normal', marcado: 'Marcado',
                       tanque_grande: 'Tanque grande', sin_ubicar: 'Sin ubicar' };

/* Unidad en la que se expresa la dosis. Las dos aportan el MISMO SO2: son la
 * misma correccion dicha de dos maneras, no dos correcciones distintas.
 *
 * El polvo se pesa; la solucion d1030 se mide con probeta. Ojo con el x2 de la
 * formula del MBK: no es un margen de seguridad, es que el metabisulfito es
 * ~50% SO2 en masa, asi que hacen falta 2 g de polvo por cada gramo de SO2. La
 * solucion esta a 55 g/L DE SO2 (no de sal), y por eso su formula no lo lleva.
 * Hay un test que fija esa equivalencia.
 *
 * Segun el dia la bodega tiene una u otra preparada, y la hoja tiene que hablar
 * el idioma de lo que el operario va a usar: si dice gramos y el tipo tiene la
 * probeta en la mano, la conversion la termina haciendo a ojo.
 *
 * Arranca en 'sol' porque es lo que la hoja venia imprimiendo. Vive en memoria:
 * sobrevive a cambiar de pestana, se resetea al recargar la pagina. */
let _ocUnidad = 'sol';   // 'mbk' | 'sol'

/** Como se expresa la dosis en la unidad elegida. Un solo lugar decide el
 *  numero, los decimales y la etiqueta, para que papel, pantalla y chip no
 *  puedan discrepar. */
const OC_UNIDAD = {
  mbk: { col: 'MBK (g)',  prod: 'MBK',     dec: 2, de: d => d.mbk_g,       total: f => f.mbk_total_g,
         suf: 'g',  nota: 'Agregar el MBK indicado en cada barrica.',
         chip: g => (g / 1000).toFixed(3) + ' kg de MBK' },
  sol: { col: 'mL sol.',  prod: 'Sol1030', dec: 1, de: d => d.ml_solucion, total: f => f.ml_total,
         suf: 'mL', nota: 'Agregar los mL de solución indicados en cada barrica.',
         chip: ml => (ml / 1000).toFixed(2) + ' L de solución d1030' },
};

/** La config de la unidad vigente. Exportada para testearla sin DOM. */
export function _ocUni(u){ return OC_UNIDAD[u || _ocUnidad] || OC_UNIDAD.sol; }

/** La OTRA unidad. El boton alterna entre dos, asi que hay un solo destino. */
export function _ocOtraUnidad(u){ return (u || _ocUnidad) === 'mbk' ? 'sol' : 'mbk'; }

/* El boton dice EN QUE ESTA, no a que cambia: el operario tiene que poder mirar
 * la barra y saber en que unidad esta leyendo la hoja sin tener que deducirlo.
 * A que cambia lo dice el tooltip. */
const OC_UNIDAD_BTN = { mbk: '⚖️ Dosis: MBK (polvo)', sol: '🧪 Dosis: Solución d1030' };

/** Pinta la etiqueta y el tooltip del boton segun la unidad vigente. */
function _ocPintarBotonUnidad(){
  const b = $('btnOcUnidad');
  if (!b) return;
  b.textContent = OC_UNIDAD_BTN[_ocUnidad] || OC_UNIDAD_BTN.sol;
  b.title = 'Estás dosificando en ' + _ocUni().col.replace(' (g)', ' (polvo, se pesa)')
                                              .replace('mL sol.', 'solución d1030 (se mide con probeta)') +
            '. Clic para pasar a ' + (OC_UNIDAD_BTN[_ocOtraUnidad()] || '').replace(/^\S+\s/, '') +
            '. Es la misma dosis de SO₂ dicha de dos maneras.';
}

/* Espejo de la formula de motor_fml.calcular_correccion_so2. Se recalcula en el
 * cliente solo para responder al toque del objetivo sin ir al servidor. La
 * fuente de verdad es Python: si cambia alla, cambia aca.
 *
 * mbk = ((dif * L * 1.5) / 1000) * 2  -- en gramos
 * ml  = (dif * L * 1.5) / 55           -- en mL de solucion */
export function _dosis(diferencia, litros){
  return {
    mbk_g:       ((diferencia * litros * 1.5) / 1000) * 2,
    ml_solucion:  (diferencia * litros * 1.5) / 55,
  };
}

/** Objetivo vigente de un lote: el pisado a mano si hay, si no el del servidor. */
function _objetivoDe(l){
  const pisado = _ocObjetivos.get(l.lote);
  return (pisado != null && Number.isFinite(pisado)) ? pisado : l.objetivo_libre;
}

/* Aplana la respuesta a filas de papel. Cada lote aporta una fila separadora
 * mas una fila por barrica, en ese orden, para que el paginado a 25 no separe
 * una barrica de su encabezado de lote mas de lo inevitable.
 *
 * Funcion pura: recibe los datos y los conjuntos en vez de leer el estado del
 * modulo, para poder testearse sin side effects. El wrapper de modulo
 * _ocBuildRowsLocal() la llama con el estado vigente.
 *
 * @param {object} orden  - respuesta del endpoint (puede ser null)
 * @param {Set}    excluidos - Set de lotes excluidos (strings)
 * @param {Map}    objetivos - Map lote -> objetivo pisado a mano (puede ser null)
 * @param {Array}  filtros   - descriptores de filtro multi (puede ser [] para no filtrar)
 */
export function _ocBuildRows(orden, excluidos, objetivos, filtros){
  if (!orden) return [];
  const excl = excluidos || new Set();
  const objs = objetivos || new Map();
  const filt = filtros || [];
  const filas = [];
  for (const l of (orden.lotes || [])){
    if (excl.has(l.lote)) continue;
    if (filt.length && !pasaMulti(l, filt)) continue;
    const pisado = objs.get(l.lote);
    const objetivo = (pisado != null && Number.isFinite(pisado)) ? pisado : l.objetivo_libre;
    const diferencia = objetivo - l.so2_libre;
    /* Acumular totales desde las dosis de las barricas: el total es la suma
     * por construccion, nunca puede divergir del precalculado del servidor. */
    let mbk_total = 0, ml_total = 0;
    const dosisBarricas = l.barricas.map(b => {
      const d = _dosis(diferencia, b.litros_usados);
      mbk_total += d.mbk_g;
      ml_total  += d.ml_solucion;
      return { barrica: b, dosis: d };
    });
    filas.push({ tipo: 'lote', lote: l, objetivo, diferencia,
                 mbk_total_g: mbk_total, ml_total });
    for (const { barrica, dosis } of dosisBarricas){
      filas.push({ tipo: 'barrica', lote: l, barrica, dosis });
    }
  }
  return filas;
}

/* Wrapper que llama a _ocBuildRows con el estado del modulo. */
function _ocBuildRowsLocal(){
  return _ocBuildRows(_ocOrden, _ocExcluidos, _ocObjetivos, _descOc);
}

/** Agrupa los suprimidos por OT, conservando el orden de aparicion.
 *  Puro y exportado: es la unica logica de la tabla que vale la pena testear. */
export function _ocAgruparPorOt(suprimidos){
  const orden = [];
  const porOt = new Map();
  for (const s of (suprimidos || [])){
    /* Se agrupa por el valor CRUDO, no por una etiqueta bonita: el boton de
     * "cancelar toda la OT" despues filtra suprimidos[] por este mismo valor, y
     * si aca se sustituyera un vacio por "(sin OT)" el filtro no encontraria
     * nada y el boton no haria nada en silencio. Lo bonito es cosa del render. */
    const ot = String(s.ot ?? '');
    if (!porOt.has(ot)){ porOt.set(ot, []); orden.push(ot); }
    porOt.get(ot).push(s);
  }
  return orden.map(ot => ({ ot, lotes: porOt.get(ot) }));
}

/* Tabla de los lotes que la regla dejo fuera, con el boton para cancelar la
 * correccion que los saco.
 *
 * Se agrupa por OT porque el error tipico no es "me equivoque en este lote"
 * sino "ejecute la orden equivocada", y deshacer 106 lotes de a uno no es una
 * opcion. Cada grupo trae su boton de cancelar todo, y cada fila el suyo. */
function _ocTablaSuprimidos(supr){
  if (!supr.length) return '';
  const grupos = _ocAgruparPorOt(supr);
  const filas = grupos.map(g =>
    '<tr class="oc-sep">' +
      '<td colspan="5"><b>OT ' + esc(g.ot || '(sin OT)') + '</b> · ' + g.lotes.length + ' lote' +
        (g.lotes.length === 1 ? '' : 's') + '</td>' +
      '<td class="c"><button class="btn" data-oc-anular-ot="' + escA(g.ot) + '" ' +
        'title="Cancelar la corrección de los ' + g.lotes.length + ' lotes de esta OT">' +
        '↩ Cancelar toda la OT</button></td>' +
    '</tr>' +
    g.lotes.map(s =>
      '<tr>' +
        '<td><b>' + esc(s.lote) + '</b></td>' +
        '<td>' + esc(s.variedad || '') + '</td>' +
        '<td class="c">' + esc(_fechaCorta(s.fecha)) + '</td>' +
        '<td class="num">' + (s.so2_prev == null ? '—' : fmt(s.so2_prev, 1)) + '</td>' +
        '<td style="font-size:12px;color:var(--muted)">' + esc(s.motivo || '') + '</td>' +
        /* El N de OT viaja en el boton porque (lote, fecha) NO identifica una
         * correccion: hay claves duplicadas en los datos reales. */
        '<td class="c"><button class="btn" data-oc-anular="' + escA(s.lote) + '" ' +
          'data-oc-anular-fecha="' + escA(s.fecha || '') + '" ' +
          'data-oc-anular-otn="' + escA(s.ot || '') + '" ' +
          'title="Cancelar esta corrección: el lote vuelve a proponerse">↩ Cancelar</button></td>' +
      '</tr>').join('')
  ).join('');

  return '<div class="card" style="margin-top:4px">' +
    '<h2 style="font-size:15px">Ya corregidos, no se proponen (' + supr.length + ')</h2>' +
    '<div style="color:var(--muted);font-size:12px;margin-bottom:8px">' +
      'Estos lotes salieron de la orden porque ya se corrigieron. Si alguna corrección ' +
      'se registró por error, cancelala y el lote vuelve a proponerse. La entrada no se ' +
      'borra: queda en la bitácora marcada como anulada, con quién y cuándo.</div>' +
    '<div class="scroll"><table id="ocTablaSupr"><thead><tr>' +
      '<th>Lote</th><th>Variedad</th><th class="c">Fecha</th>' +
      '<th class="num">SO₂ previo</th><th>Motivo</th><th class="c">Acción</th>' +
    '</tr></thead><tbody>' + filas + '</tbody></table></div></div>';
}

let _ocAnulEnVuelo = false;

/* Anula las correcciones de los lotes indicados, guarda y recarga la orden.
 *
 * Mismo contrato que ejecutar, por los mismos motivos: se escribe en DATOS(),
 * se guarda, y si el guardado falla se REVIERTE lo escrito y se avisa. Sin el
 * rollback, un guardado fallido dejaria correcciones anuladas en memoria que el
 * proximo guardado de cualquier otra pantalla persistiria.
 *
 * @param {Array} objetivos - [{lote, fecha, ot}] tal como vienen de
 *   suprimidos[]. El `ot` NO es opcional en la practica: (lote, fecha) no
 *   identifica una correccion, hay claves duplicadas en los datos reales. */
async function _ocAnularCorrecciones(objetivos, descripcion){
  /* Guarda de reentrada, por el mismo motivo que en ejecutar: dos llamadas
   * superpuestas sobre el mismo lote hacen que el snapshot de la segunda
   * capture lo que escribio la primera, y si los dos guardados fallan el
   * rollback restaura una anulacion que nunca se guardo. */
  const msg0 = $('ocMsg');
  if (_ocAnulEnVuelo){
    if (msg0) msg0.innerHTML = '<div class="msg info">Ya se está cancelando algo. ' +
      'Esperá a que termine.</div>';
    return;
  }
  if (!objetivos.length){
    /* Nunca salir mudo: si el usuario apreto un boton, algo tiene que pasar.
     * Este caso se da si se aprieta durante la recarga, con _ocOrden en null. */
    if (msg0) msg0.innerHTML = '<div class="msg err">No hay nada para cancelar en este momento. ' +
      'Puede que la orden se esté recargando; probá de nuevo en un segundo.</div>';
    return;
  }
  if (!confirm('Vas a cancelar la corrección de ' + descripcion + '.\n\n' +
               'La entrada NO se borra: queda en la bitácora marcada como anulada, ' +
               'con tu nombre y la fecha. ' +
               (objetivos.length === 1 ? 'El lote vuelve' : 'Los lotes vuelven') +
               ' a proponerse en la orden.\n\n¿Confirmás?')) return;

  _ocAnulEnVuelo = true;
  try {
    const quien = { por: usuarioActual() || 'desconocido',
                    cuando: new Date().toISOString().slice(0, 10) };
    const snaps = [];
    for (const o of objetivos){
      const s = anularCorreccion(DATOS().analisis, o.lote, o.fecha, o.ot, quien);
      if (s) snaps.push(s);
    }

    if (!snaps.length){
      const m = $('ocMsg');
      if (m) m.innerHTML = '<div class="msg err">No se encontró la corrección a cancelar. ' +
        'Puede que ya se haya cancelado desde otra PC; probá con 🔄 Recargar.</div>';
      return;
    }

    markDirty();
    let ok = false;
    try { ok = await guardar(); } catch (_) { ok = false; }
    if (!ok){
      snaps.forEach(revertirAnulacion);
      const m2 = $('ocMsg');
      if (m2) m2.innerHTML = '<div class="msg err">No se pudo guardar. No se canceló nada.</div>';
      else alert('No se pudo guardar. No se canceló nada.');
      return;
    }

    _ocOrden = null;
    await _ocCargar();
    _ocRenderTabla();
    _ocPintarPaginas();

    const m3 = $('ocMsg');
    if (!m3) return;

    /* Si la recarga fallo, _ocCargar dejo _ocOrden en null y su propio error en
     * ocMsg. NO se puede afirmar que el lote volvio: no hay con que compararlo.
     * Pisar ese error con un verde que promete "ya vuelve a proponerse" seria
     * el mismo modo de falla que este bloque viene a cerrar, por otra puerta. */
    if (!_ocOrden){
      m3.innerHTML = '<div class="msg info">Se guardaron ' + snaps.length +
        ' anulaciones, pero no se pudo recargar la orden para confirmarlas. ' +
        'Apretá 🔄 Recargar para verificar que los lotes volvieron.</div>';
      return;
    }

    /* NO alcanza con contar lo que se marco: hay que confirmar que el lote
     * VOLVIO. Marcar una entrada y que el servidor siga suprimiendo el lote es
     * exactamente el modo de falla peligroso (el vino no recibe SO2 y la
     * pantalla dice que si), y solo se detecta comparando contra el
     * suprimidos[] recien recargado. Cualquier asimetria futura entre este
     * lookup y el de Python se vuelve ruidosa en vez de silenciosa.
     *
     * Se compara por (lote, fecha, ot), no por lote solo, para separar dos
     * casos que se ven iguales desde afuera:
     *   - sobrevive con OTRA clave: el lote tenia una correccion previa ademas
     *     de la que se cancelo. Es legitimo y ademas frecuente (16 claves de
     *     los datos reales tienen dos o mas correcciones). Informativo.
     *   - sobrevive con LA MISMA clave: no se movio nada. Ese es el rojo. */
    const clave = x => String(x.lote) + '|' + String(x.fecha ?? '') + '|' + String(x.ot ?? '');
    const supr = _ocOrden.suprimidos || [];
    const clavesVivas = new Set(supr.map(clave));
    const lotesVivos = new Set(supr.map(s => String(s.lote)));

    const noSeMovieron = objetivos.filter(o => clavesVivas.has(clave(o)));
    const conOtraCorreccion = objetivos.filter(
      o => !clavesVivas.has(clave(o)) && lotesVivos.has(String(o.lote)));

    if (noSeMovieron.length){
      const ls = noSeMovieron.map(o => String(o.lote));
      m3.innerHTML = '<div class="msg err"><b>Ojo:</b> se guardaron ' + snaps.length +
        ' anulaciones, pero ' + ls.length + ' lote' + (ls.length === 1 ? '' : 's') +
        ' sigue' + (ls.length === 1 ? '' : 'n') + ' sin proponerse con la MISMA ' +
        'corrección que cancelaste: ' + esc(ls.join(', ')) + '. Algo no se aplicó ' +
        'como esperabas. Revisá la bitácora antes de dosificar a mano.</div>';
      return;
    }
    if (conOtraCorreccion.length){
      const ls = conOtraCorreccion.map(o => String(o.lote));
      m3.innerHTML = '<div class="msg info">✓ Se canceló la corrección de ' +
        snaps.length + ' lote' + (snaps.length === 1 ? '' : 's') + '. ' +
        esc(ls.join(', ')) + ' sigue' + (ls.length === 1 ? '' : 'n') +
        ' sin proponerse porque tenía' + (ls.length === 1 ? '' : 'n') +
        ' otra corrección previa: si esa también fue un error, cancelala desde ' +
        'la lista de abajo.</div>';
      return;
    }
    m3.innerHTML = '<div class="msg ok">✓ Se canceló la corrección de ' +
      snaps.length + ' lote' + (snaps.length === 1 ? '' : 's') +
      ', que ya vuelve' + (snaps.length === 1 ? '' : 'n') + ' a proponerse. ' +
      'Quedan en la bitácora marcadas como anuladas.</div>';
  } finally {
    _ocAnulEnVuelo = false;
  }
}

/* dd/mm de un ISO. Devuelve el original si no tiene la forma esperada: un
 * cartel con la fecha rara es mejor que un cartel sin fecha. */
function _fechaCorta(iso){
  const p = String(iso || '').split('-');
  return p.length === 3 ? (p[2] + '/' + p[1]) : String(iso || '');
}

/** Cartel de "este lote ya se corrigio". Dos intensidades:
 *
 *  - normal: el lote volvio porque el SO2 se movio mas de 5 ppm desde la
 *    correccion. Informativo.
 *  - fuerte (sin_analisis): vencio la ventana de 30 dias y todavia NADIE lo
 *    remidio. El SO2 de la fila es anterior a la correccion, asi que la dosis
 *    se esta calculando sobre un numero viejo. Este cartel no caduca: solo se
 *    apaga cuando aparece un analisis nuevo. */
export function _ocCartelCorregido(l){
  const c = l && l.corregido_en;
  if (!c) return '';
  const f = _fechaCorta(c.fecha);
  if (c.sin_analisis){
    return '⚠⚠ corregido en OT ' + c.ot + ' el ' + f +
           ' y sin análisis desde entonces — el SO₂ de esta fila es ANTERIOR a esa corrección';
  }
  return '⚠ corregido en OT ' + c.ot + ' el ' + f +
         (c.so2_prev != null ? ' — SO₂ era ' + Number(c.so2_prev).toFixed(1) : '');
}

/** Aviso por grupo. Los tres numeros de litros van juntos: un aviso pelado no le
 *  dice al operario cuanto volumen queda sin tratar.
 *  tanque_grande no es un error: el mapa no ve vasijas de mas de 500 L por diseno. */
export function _ocAviso(l){
  if (l.grupo === 'marcado'){
    const faltan = (l.litros_declarados || 0) - (l.litros_mapa || 0);
    return '⚠ declara ' + (l.litros_declarados || 0) + ' L · el mapa ve ' + (l.litros_mapa || 0) + ' L · ' +
           (faltan > 0 ? 'faltan ' + faltan + ' L' : (-faltan) + ' L de más') +
           ' · severidad ' + (l.severidad || '');
  }
  if (l.grupo === 'sin_ubicar'){
    return '⚠⚠ el mapa no ubica ninguna barrica · dosis sobre los litros declarados';
  }
  if (l.grupo === 'tanque_grande'){
    return 'vasija grande, fuera del mapa por diseño';
  }
  return '';
}

/* El papel sigue el formato de la B219 (orden en Excel de bodega): lote, año,
 * numero de barril y dosis. Todo lo demas (pH, SO2, objetivo, molecular,
 * capacidad, estado, litros, avisos y posicion) se sigue calculando y se ve en
 * la tabla de pantalla, pero no se imprime: al operario no le sirve para
 * dosificar. El armado de la fila vive en orden-correccion-papel.js (puro). */
function _ocRenderFila(x){ return filaPapel(x, _ocUni()); }

function _ocPintarPaginas(){
  const cont = $('ocPaginas');
  if (!cont) return;

  const fechaISO = $('ocFecha') ? $('ocFecha').value : '';
  const p = fechaISO.split('-');
  const fechaTxt = p.length === 3 ? (p[2] + '/' + p[1] + '/' + p[0]) : fechaISO;
  const meta = { fechaTxt, anio: p.length === 3 ? p[0] : '',
                 nro: $('ocNumOrden') ? $('ocNumOrden').value : '' };
  const banda = ['CORRECCIÓN SO₂', '', 'Bodega'];

  cont.innerHTML = pintarHojas({
    filas: _ocBuildRowsLocal(),
    porPagina: HOJA_POR_PAGINA,
    titulo: _ocTitulo,
    meta, banda,
    emitio: $('ocEmitio') ? $('ocEmitio').value : '',
    recibio: $('ocRecibio') ? $('ocRecibio').value : '',
    /* Las instrucciones de densidad son de la solucion: con MBK no van. */
    antesBanda: _ocUnidad === 'sol' ? INSTRUCCIONES_SOLUCION : '',
    nota: _ocUni().nota,
    claseTabla: 'oh-tabla-justa',
    colgroup: COLGROUP_PAPEL,
    thead: theadPapel(_ocUni()),
    columnas: COLUMNAS_PAPEL,
    textoVacio: 'No hay lotes a corregir para los criterios elegidos.',
    renderFila: _ocRenderFila,
  });
}

async function _ocCargar(){
  const msg = $('ocMsg');
  try {
    const r = await fetch(API+'/orden-correccion');
    if (r.status === 503){
      const e = await r.json();
      /* Sin mapa no hay numeros de barril, que es el punto del subsistema. El
       * mensaje tiene que decir eso, no dejar una pantalla vacia. */
      if (msg) msg.innerHTML = '<div class="msg err">El mapa de barriles no está ' +
        'disponible, así que no se pueden emitir órdenes con número de barril. ' +
        esc(e.error || '') + '</div>';
      _ocOrden = null;
      return;
    }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    _ocOrden = await r.json();
    if (msg) msg.innerHTML = '';
  } catch (e){
    if (msg) msg.innerHTML = '<div class="msg err">No se pudo cargar la orden: ' + esc(String(e)) + '</div>';
    _ocOrden = null;
  }
}

/* Renderiza la tabla editable en pantalla y actualiza el sello de pantalla.
 *
 * I1: el encabezado (9 columnas) se actualizo para describir lo que las filas
 * de barrica muestran realmente: #/Barrica/CAP./Estado/Litros/MBK(g)/mL/Pos/Aviso.
 * Las filas separadoras del lote (resumen) tambien tienen 9 columnas.
 *
 * I2: el listener del objetivo usa 'change'/'blur' en vez de 'input' para no
 * rearmar el tbody mientras el usuario tipea. 'input' destruia el <input> activo
 * en cada tecla, impidiendo tipear numeros de varios digitos.
 *
 * I3: el chip refleja los lotes VISIBLES (filtrados y no excluidos) en vez del
 * resumen del servidor, que no cambia al destildar. mbk_total_g / 1000 = kg.
 *
 * #8: la suma del chip deriva de _ocBuildRows para evitar el doble acumulado que
 * existia entre _ocBuildRows y _ocRenderTabla. */
function _ocRenderTabla(){
  const tbody = $('ocTbody');
  if (!tbody) return;

  /* La columna que no se usa se oculta por CSS en vez de sacarla del HTML: la
   * 6 es MBK y la 7 es mL tanto en el encabezado como en la fila del lote y en
   * la de barrica, asi que dos reglas nth-child las esconden de forma
   * consistente sin tocar el codigo que arma las filas.
   * Va ANTES del guard de "sin datos" para que la tabla vacia ya muestre las
   * columnas correctas y no cambie de ancho al llegar los datos. */
  const tabla = $('ocTable');
  if (tabla){
    tabla.classList.toggle('u-mbk', _ocUnidad === 'mbk');
    tabla.classList.toggle('u-sol', _ocUnidad === 'sol');
  }

  /* Actualizar sello de pantalla (el del papel se mete en la nota de pintarHojas) */
  const selloEl = $('ocSelloPantalla');
  if (selloEl){
    const p = (_ocOrden && _ocOrden.procedencia) || {};
    selloEl.textContent = 'Mapa v' + (p.version || '?') + ' · actualizado ' + (p.actualizado || '?') + ' · ' + (p.archivo || '?');
  }

  /* I4: actualizar la nota de sin_volumen cada vez que se renderiza (no solo al
   * montar la vista). Si se emite en el innerHTML inicial, _ocOrden es null en
   * la primera visita y la nota queda en blanco aunque despues haya 46 lotes. */
  const sinVolEl = $('ocSinVolumen');
  if (sinVolEl){
    const sinVol = (_ocOrden && _ocOrden.sin_volumen) || [];
    sinVolEl.innerHTML = sinVol.length
      ? '<div class="note"><b>Sin volumen declarado (' + sinVol.length + '):</b> ' + esc(sinVol.join(', ')) + '</div>'
      : '';
  }

  /* Los suprimidos NO desaparecen en silencio: mismo criterio que sin_volumen y
   * no_calculables. Los que esperan analisis son, ademas, el insumo natural de
   * la Orden de muestras. */
  const suprEl = $('ocSuprimidos');
  if (suprEl) suprEl.innerHTML = _ocTablaSuprimidos((_ocOrden && _ocOrden.suprimidos) || []);

  if (!_ocOrden){
    tbody.innerHTML = '<tr><td colspan="9" style="color:var(--muted);padding:18px">Sin datos.</td></tr>';
    return;
  }

  /* I3+#8: derivar totales de las filas VISIBLES, no del resumen del servidor.
   * El resumen del servidor es fijo (no cambia al filtrar ni al destildar);
   * el chip tiene que reflejar lo que el operario ve y va a imprimir. */
  const filasBuildRows = _ocBuildRows(_ocOrden, _ocExcluidos, _ocObjetivos, _descOc);
  const lotesVisibles = new Set(filasBuildRows.filter(f => f.tipo === 'lote').map(f => f.lote.lote));
  const barricasVisibles = filasBuildRows.filter(f => f.tipo === 'barrica').length;
  /* El chip dice cuanto insumo hay que preparar, asi que se expresa en la
   * unidad elegida: kg de polvo o L de solucion. */
  const u = _ocUni();
  const totalVisible = filasBuildRows.filter(f => f.tipo === 'lote')
    .reduce((s, f) => s + u.total(f), 0);

  const resEl = $('ocResumen');
  if (resEl){
    resEl.textContent = lotesVisibles.size + ' lotes · ' + barricasVisibles + ' barricas · ' +
      u.chip(totalVisible);
  }

  let tb = '';
  for (const l of _ocOrden.lotes){
    const excluido = _ocExcluidos.has(l.lote);
    const pasaFiltro = pasaMulti(l, _descOc);
    if (!pasaFiltro) continue;
    const objetivo = _objetivoDe(l);
    const diferencia = objetivo - l.so2_libre;
    const aviso = _ocAviso(l);
    const cartel = _ocCartelCorregido(l);
    /* El cartel va primero en el array: dice algo sobre la validez del numero
     * que el operario va a usar, y eso pesa mas que el estado del inventario. */
    const avisos = [cartel, aviso].filter(Boolean);

    /* Precalcular las dosis de barricas para derivar el total: el total es la
     * suma de las dosis que se muestran, no el precalculado del servidor. */
    let mbkTotalPantalla = 0, mlTotalPantalla = 0;
    const dosisBarricasPantalla = l.barricas.map(b => {
      const d = _dosis(diferencia, b.litros_usados);
      mbkTotalPantalla += d.mbk_g;
      mlTotalPantalla  += d.ml_solucion;
      return { b, d };
    });

    /* Fila separadora del lote (I1: 9 columnas, resumen compacto).
     * Las tres metricas de pH/SO2/Molecular/Objetivo se condensen en col 3-7;
     * la col 8-9 lleva el aviso con colspan=2 para completar las 9. */
    tb += '<tr class="oc-sep">' +
      '<td style="white-space:nowrap;padding:6px 9px">' +
        '<input type="checkbox" ' + (excluido ? '' : 'checked') + ' data-oc-lote="' + escA(l.lote) + '" title="Incluir este lote en la orden"> ' +
        '<b>' + esc(l.lote) + '</b></td>' +
      '<td>' + esc(l.variedad) + '</td>' +
      '<td class="num" title="pH">' + fmt(l.ph, 2) + '</td>' +
      '<td class="num" title="SO₂ libre actual (mg/L)">' + fmt(l.so2_libre, 1) + '</td>' +
      '<td class="num" title="Objetivo SO₂ libre (mg/L) — editá para recalcular">' +
        /* I2: 'change'/'blur' reemplaza 'input': el listener esta en tbody (ver abajo).
         * 'input' destruia el <input> activo en cada tecla porque _ocRenderTabla
         * reconstruye tbody.innerHTML. Con 'change'/'blur' el rearme ocurre solo
         * cuando el usuario confirma el valor (Tab, Enter o click fuera). */
        '<input class="cell num" type="text" style="width:60px" ' +
        'data-oc-obj="' + escA(l.lote) + '" value="' + escA(fmt(objetivo, 1)) + '" ' +
        'title="Objetivo SO₂ libre (mg/L). Editá para recalcular la dosis."></td>' +
      '<td class="num"><b>' + fmt(mbkTotalPantalla, 2) + '</b> g</td>' +
      '<td class="num">' + fmt(mlTotalPantalla, 0) + ' mL</td>' +
      '<td colspan="2">' + avisos.map(a =>
        '<span class="oc-aviso">' + esc(a) + '</span>').join('<br>') + '</td>' +
    '</tr>';

    if (excluido) continue;

    /* Filas de barricas (I1: 9 columnas: #/Barrica/CAP./Estado/Litros/MBK/mL/Pos/Aviso) */
    for (const { b, d } of dosisBarricasPantalla){
      tb += '<tr>' +
        '<td class="c">' + esc(b.num || '—') + '</td>' +
        '<td>' + esc(b.vasija || '') + '</td>' +
        '<td class="num">' + esc(b.cap == null ? '—' : String(b.cap)) + '</td>' +
        '<td class="c">' + esc(b.estado) + '</td>' +
        '<td class="num">' + fmt(b.litros_usados, 0) + (b.litros_de_capacidad ? '*' : '') + '</td>' +
        /* mbk_g y ml_solucion son derivados: solo lectura, no se tipean.
         * La fuente de verdad de la formula es motor_correccion.py. */
        '<td class="num ro"><b>' + fmt(d.mbk_g, 2) + '</b></td>' +
        '<td class="num ro">' + fmt(d.ml_solucion, 1) + '</td>' +
        '<td class="c" style="font-size:11px;color:var(--muted)">' + esc((l.posiciones || []).join(', ')) + '</td>' +
        '<td></td>' +
      '</tr>';
    }
  }

  tbody.innerHTML = tb || '<tr><td colspan="9" style="color:var(--muted);padding:18px">No hay lotes a corregir para los criterios elegidos.</td></tr>';

  /* Listeners delegados: se conectan UNA sola vez (tbody._ocWired) porque tbody
   * es el mismo elemento aunque su innerHTML se reconstruya. */
  if (tbody._ocWired) return;
  tbody._ocWired = true;

  /* Casilla de inclusion por lote */
  tbody.addEventListener('change', e => {
    const cb = e.target.closest('input[type="checkbox"][data-oc-lote]');
    if (!cb) return;
    const lote = cb.dataset.ocLote;
    if (cb.checked) _ocExcluidos.delete(lote); else _ocExcluidos.add(lote);
    _ocRenderTabla();
    _ocPintarPaginas();
  });

  /* I2: Objetivo editable por lote — listener en 'change' (Tab/Enter/click fuera),
   * no en 'input' (cada tecla). 'input' destruia el <input> activo porque
   * _ocRenderTabla reconstruye tbody.innerHTML y el elemento desaparecia.
   * Tambien valida el rango: un objetivo <= SO2 actual produce dosis negativas. */
  tbody.addEventListener('change', e => {
    const inp = e.target.closest('input[data-oc-obj]');
    if (!inp) return;
    const lote = inp.dataset.ocObj;
    const val = parseFloat(inp.value.replace(',', '.'));
    /* Buscar el SO2 actual del lote para la validacion de rango */
    const loteData = (_ocOrden.lotes || []).find(l => l.lote === lote);
    const so2Actual = loteData ? (loteData.so2_libre || 0) : 0;
    if (!Number.isNaN(val) && val > so2Actual){
      _ocObjetivos.set(lote, val);
    } else {
      /* Objetivo invalido: restaurar el valor anterior y mostrar un aviso breve */
      _ocObjetivos.delete(lote);
      if (!Number.isNaN(val)){
        inp.title = 'El objetivo (' + val.toFixed(1) + ') debe ser mayor que el SO₂ actual (' + so2Actual.toFixed(1) + '). Se restauro el valor del servidor.';
        inp.style.borderColor = 'var(--nook)';
        setTimeout(() => {
          inp.style.borderColor = '';
          inp.title = 'Objetivo SO₂ libre (mg/L). Editá para recalcular la dosis.';
        }, 2500);
      }
    }
    _ocRenderTabla();
    _ocPintarPaginas();
  });
}

/* Los tres pasos que dispara cualquier cambio de filtro. */
function _ocAplicarFiltros(){
  _ocRenderTabla();
  _ocPintarPaginas();
}

function initFiltrosOc(){
  const lotesDe = () => (_ocOrden && _ocOrden.lotes) || [];

  _descOc = [
    {
      /* Lote va primero porque es por donde el operario busca. Son ~108
       * opciones, pero el panel multi-select trae su propio buscador y un
       * "Todas" que tilda lo que quedo visible: se tipea 261 y se tildan todos
       * los 261xx de una. cmpValores ordena numericamente, asi que salen
       * 26005, 26014, 26228 y no en orden alfabetico. */
      label: 'Lote',
      set: filtOc.lote,
      opciones: () => opcionesValores(lotesDe(), l => l.lote),
      match: matchValor(l => l.lote),
    },
    {
      label: 'Variedad',
      set: filtOc.variedad,
      opciones: () => opcionesValores(lotesDe(), l => l.variedad),
      match: matchValor(l => l.variedad),
    },
    {
      label: 'Proyecto',
      set: filtOc.proyecto,
      opciones: () => opcionesValores(lotesDe(), l => l.proyecto || ''),
      match: matchValor(l => l.proyecto || ''),
    },
    {
      label: 'Etapa',
      set: filtOc.etapa,
      opciones: () => opcionesValores(lotesDe(), l => l.etapa || ''),
      match: matchValor(l => l.etapa || ''),
    },
    {
      /* El valor que se filtra es el crudo (normal, marcado, tanque_grande,
       * sin_ubicar); lo que se muestra es la etiqueta. Por eso las opciones se
       * mapean en vez de salir directo de opcionesValores. */
      label: 'Estado del cruce',
      set: filtOc.grupo,
      opciones: () => opcionesValores(lotesDe(), l => l.grupo || '')
        .map(o => ({ val: o.val, text: OC_GRUPO_LBL[o.val] || o.text })),
      match: matchValor(l => l.grupo || ''),
    },
  ];

  _instOc = initFiltrosMulti('ocFltBar', _descOc, _ocAplicarFiltros);
}

export async function renderOrdenCorreccion(){
  const sec = $('tab-ordencorr');
  if (!sec) return;

  /* --- fecha de hoy --- */
  const hoyISO = new Date().toISOString().slice(0, 10);

  /* I4: sinVolumen se lee DESPUES de _ocCargar(), no antes. Si se lee antes,
   * _ocOrden es null en la primera visita y la nota no se emite. Se emite
   * desde _ocRenderTabla() para que se actualice cada vez que se recarga. */
  sec.innerHTML = `
<div class="card" style="margin-bottom:14px">
  <h2>Orden de corrección de SO₂</h2>
  <div class="toolbar" id="ocToolbar" style="margin-bottom:14px">
    <div class="mfilt-bar" id="ocFltBar"></div>
    <button class="btn" id="btnOcLimpiarFlt">🧹 Limpiar filtros</button>
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)">
    <button class="btn" id="btnOcUnidad"></button>
    <button class="btn" id="btnOcRecargar">🔄 Recargar</button>
    <span class="tag" id="ocResumen"></span>
    <div class="spacer"></div>
    <button class="btn primary" id="btnOcEjecutar">✔ Ejecutar orden</button>
    <button class="btn primary" id="btnOcImprimir">🖨️ Imprimir</button>
  </div>
  <div id="ocMsg"></div>
  <div class="msg info" id="ocSelloWrap" style="margin-bottom:10px;font-size:12px">
    <b>Sello del mapa:</b> <span id="ocSelloPantalla">—</span>
  </div>
</div>

<!-- encabezado imprimible -->
<div class="card" style="margin-bottom:14px">
  <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start">
    <div style="flex:1;min-width:180px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:1.2px">N° de orden</div>
      <input class="txt" id="ocNumOrden" type="text" placeholder="OC-2026-001" style="width:100%">
    </div>
    <div style="flex:1;min-width:160px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:1.2px">Fecha</div>
      <input class="txt" id="ocFecha" type="date" value="${escA(hoyISO)}" style="width:100%">
    </div>
    <div style="flex:1;min-width:160px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:1.2px">Emitió</div>
      <input class="txt" id="ocEmitio" type="text" placeholder="Nombre…" style="width:100%">
    </div>
    <div style="flex:1;min-width:160px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:1.2px">Recibió</div>
      <input class="txt" id="ocRecibio" type="text" placeholder="Nombre…" style="width:100%">
    </div>
  </div>
</div>

<!-- tabla editable -->
<!-- I1: el encabezado tiene 9 columnas que describen las filas de BARRICA:
     #/Barrica/CAP./Estado/Litros/MBK(g)/mL sol./Posicion/Aviso.
     Las filas separadoras del lote tienen el mismo colspan total (9) pero
     condensan pH/SO2/Molecular/Objetivo en las columnas del medio. -->
<div class="scroll tall">
<table id="ocTable">
  <thead><tr>
    <th>Lote / Barrica</th>
    <th>Variedad / Vasija</th>
    <th class="num">CAP. / pH</th>
    <th class="num">Estado / SO₂</th>
    <th class="num">Objetivo</th>
    <th class="num">MBK (g)</th>
    <th class="num">mL sol.</th>
    <th>Posición</th>
    <th>Aviso</th>
  </tr></thead>
  <tbody id="ocTbody"></tbody>
</table>
</div>

<!-- I4: la nota de sin_volumen vive en un div separado que _ocRenderTabla
     actualiza despues de cargar, para que no quede en blanco en la primera visita. -->
<div id="ocSinVolumen" style="margin-top:12px"></div>
<div id="ocSuprimidos" style="margin-top:12px"></div>

<!-- vista de papel: oculta en pantalla, unica seccion visible al imprimir -->
<div id="ocPaginas" style="display:none"></div>`;

  /* Cargar datos si no estan disponibles o si se presiona Recargar */
  await _ocCargar();
  _ocRenderTabla();
  _ocPintarPaginas();

  /* Filtros multi */
  if (_descOc.length === 0){
    initFiltrosOc();
  } else {
    const bar = $('ocFltBar');
    if (bar){
      bar.innerHTML = '';
      _instOc.forEach(f => { bar.appendChild(f.el); f.rebuild(); });
    }
  }

  /* Limpiar: vacia los cinco Sets y sincroniza los cinco paneles. Sin id de
   * buscador porque ya no hay caja de texto aparte: cada panel trae la suya. */
  $('btnOcLimpiarFlt').addEventListener('click', () => {
    limpiarFiltrosMulti(_descOc, null, _instOc, _ocAplicarFiltros);
  });

  /* Cancelar correcciones. Delegado sobre el contenedor, que persiste mientras
   * la tabla de adentro se reconstruye en cada render. El contenedor se recrea
   * con sec.innerHTML en cada visita a la pestana, asi que los listeners no se
   * apilan y no hace falta guarda. */
  $('ocSuprimidos').addEventListener('click', e => {
    const uno = e.target.closest('[data-oc-anular]');
    if (uno){
      _ocAnularCorrecciones(
        [{ lote: uno.dataset.ocAnular, fecha: uno.dataset.ocAnularFecha,
           ot: uno.dataset.ocAnularOtn }],
        'el lote ' + uno.dataset.ocAnular);
      return;
    }
    const todaLaOt = e.target.closest('[data-oc-anular-ot]');
    if (todaLaOt){
      const ot = todaLaOt.dataset.ocAnularOt;
      const delOt = ((_ocOrden && _ocOrden.suprimidos) || [])
        .filter(s => String(s.ot ?? '') === ot)
        .map(s => ({ lote: s.lote, fecha: s.fecha, ot: s.ot }));
      _ocAnularCorrecciones(delOt,
        'los ' + delOt.length + ' lotes de la OT ' + ot);
    }
  });

  /* Unidad de la dosis: el boton alterna y repinta tabla y papel. No toca los
   * datos ni la bitacora, que guarda las dos formas: es solo como se expresa
   * el numero. */
  _ocPintarBotonUnidad();
  $('btnOcUnidad').addEventListener('click', () => {
    _ocUnidad = _ocOtraUnidad();
    _ocPintarBotonUnidad();
    _ocRenderTabla();
    _ocPintarPaginas();
  });

  /* Recargar */
  $('btnOcRecargar').addEventListener('click', async () => {
    _ocOrden = null;
    _ocExcluidos.clear();
    _ocObjetivos.clear();
    await _ocCargar();
    _ocRenderTabla();
    _ocPintarPaginas();
  });

  /* Encabezado -> solo repintan la hoja de papel */
  ['ocNumOrden', 'ocFecha', 'ocEmitio', 'ocRecibio'].forEach(id => {
    const el = $(id);
    if (el){
      el.addEventListener('input', _ocPintarPaginas);
      el.addEventListener('change', _ocPintarPaginas);
    }
  });

  /* Ejecutar orden */
  $('btnOcEjecutar').addEventListener('click', _ocAbrirEjecucion);

  /* Imprimir */
  $('btnOcImprimir').addEventListener('click', () => {
    document.body.classList.add('printing-ordencorr');
    window.print();
    document.body.classList.remove('printing-ordencorr');
  });
}

/** Entradas de bitacora a escribir, una por lote elegido.
 *
 *  Se alimenta de las filas de _ocBuildRows y no del _ocOrden crudo, porque las
 *  filas ya traen el objetivo vigente (el pisado a mano si lo hay) y los
 *  totales sumados de las barricas que se muestran. Tomar los precalculados del
 *  servidor registraria numeros distintos a los que el operario tuvo en la mano.
 *
 *  Pura: recibe las filas y el conjunto de elegidos en vez de leer el estado
 *  del modulo, para poder testearse sin DOM. */
export function _ocEntradasDeEjecucion(filas, elegidos, ot, fecha){
  const out = [];
  for (const f of (filas || [])){
    if (f.tipo !== 'lote') continue;
    if (!elegidos.has(f.lote.lote)) continue;
    /* Saltar filas con totales no finitos: pasaria si litros_usados es null en
     * alguna barrica. JSON.stringify convierte NaN en null, asi que persistir
     * esa entrada dejaria un mbk_total_g falso en la bitacora. Es mejor omitir
     * la entrada y dejar el lote en la orden para que el operario lo resuelva. */
    if (!Number.isFinite(f.mbk_total_g) || !Number.isFinite(f.ml_total)) continue;
    out.push({
      lote: f.lote.lote,
      correccion: armarCorreccion({
        so2Actual:  f.lote.so2_libre,
        so2Deseado: f.objetivo,
        mbk:        f.mbk_total_g,
        ml:         f.ml_total,
        ot, fecha,
      }),
    });
  }
  return out;
}

/* Estado del overlay: los lotes que el operario dice haber hecho. Vive solo
 * mientras el panel esta abierto, y es DISTINTO de _ocExcluidos: aquel decide
 * que se imprime, este decide que se registra. */
let _ocHechos = new Set();

function _ocAbrirEjecucion(){
  /* Enganchar los listeners ANTES del primer render, incluido el de la rama
   * "sin lotes". Si se llama despues del return temprano, el boton Cerrar del
   * mensaje de "sin lotes" no tiene listener y no responde. */
  _ocEjecWire();

  const filas = _ocBuildRowsLocal().filter(f => f.tipo === 'lote');
  if (!filas.length){
    mostrarOverlay('<h2 style="margin-top:0">Ejecutar orden</h2>' +
      '<p style="color:var(--muted)">No hay lotes en la orden con los filtros puestos.</p>' +
      '<button class="btn" data-oc-cancelar>Cerrar</button>');
    return;
  }

  /* Arranca con todo tildado: el caso normal es que la orden se haya hecho
   * entera, y destildar es la excepcion. */
  _ocHechos = new Set(filas.map(f => f.lote.lote));

  const hoyISO = new Date().toISOString().slice(0, 10);
  const fechaSug = ($('ocFecha') && $('ocFecha').value) || hoyISO;
  const otSug = ($('ocNumOrden') && $('ocNumOrden').value) || '';

  /* Los montos por lote van en la unidad elegida, igual que el total del pie y
   * que la hoja: el operario esta mirando la misma dosis en tres lugares y
   * verla en gramos aca y en mL en la hoja lo obliga a convertir de cabeza. */
  const u = _ocUni();
  const items = filas.map(f =>
    '<label style="display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid var(--line)">' +
      '<input type="checkbox" checked data-oc-hecho="' + escA(f.lote.lote) + '">' +
      '<b style="min-width:70px">' + esc(f.lote.lote) + '</b>' +
      '<span style="flex:1;color:var(--muted)">' + esc(f.lote.variedad) + '</span>' +
      '<span class="num">' + fmt(u.total(f), u.dec) + ' ' + u.suf + '</span>' +
    '</label>').join('');

  mostrarOverlay(
    '<h2 style="margin-top:0">Ejecutar orden de corrección</h2>' +
    '<p style="color:var(--muted);font-size:13px;margin-top:0">Se va a registrar en la bitácora de SO₂ una entrada por cada lote tildado. Destildá los que no se hicieron.</p>' +
    '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">' +
      '<div><div style="font-size:11px;color:var(--muted)">N° de OT (obligatorio)</div>' +
        '<input class="txt" id="ocEjecOT" value="' + escA(otSug) + '" placeholder="OC-2026-001" style="min-width:160px"></div>' +
      '<div><div style="font-size:11px;color:var(--muted)">Fecha real de la corrección</div>' +
        '<input class="txt" id="ocEjecFecha" type="date" value="' + escA(fechaSug) + '"></div>' +
    '</div>' +
    '<div style="max-height:320px;overflow:auto;margin-bottom:10px">' + items + '</div>' +
    '<div id="ocEjecTotal" class="tag" style="margin-bottom:10px"></div>' +
    '<div id="ocEjecMsg"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button class="btn" data-oc-cancelar>Cancelar</button>' +
      '<button class="btn primary" id="btnOcEjecConfirmar">✔ Confirmar y guardar</button>' +
    '</div>');

  _ocEjecActualizarTotal();
  /* _ocEjecWire() ya se llamo al principio de esta funcion, antes del primer
   * mostrarOverlay. No se repite aca. */
}

/* Total del pie y habilitacion del boton. El boton se apaga sin N de OT: sin
 * numero el cartel de "corregido en la OT tal" no tiene a que apuntar. */
function _ocEjecActualizarTotal(){
  const filas = _ocBuildRowsLocal().filter(f => f.tipo === 'lote' && _ocHechos.has(f.lote.lote));
  /* El total sigue la unidad elegida: es cuanto insumo hay que preparar, asi
   * que decirlo en kg de polvo cuando el operario va a medir solucion lo
   * obliga a convertir de cabeza. */
  const u = _ocUni();
  const tot = $('ocEjecTotal');
  if (tot) tot.textContent = filas.length + ' lotes · ' +
    u.chip(filas.reduce((s, f) => s + u.total(f), 0));
  const ot = $('ocEjecOT') ? $('ocEjecOT').value.trim() : '';
  const btn = $('btnOcEjecConfirmar');
  if (btn){
    btn.disabled = (!ot || filas.length === 0);
    btn.title = !ot ? 'Ingresá el N° de OT para poder confirmar'
                    : (filas.length === 0 ? 'No hay ningún lote tildado' : '');
  }
}

/* Listeners DELEGADOS y enganchados UNA sola vez.
 *
 * overlayBox es un elemento persistente del documento: mostrarOverlay solo le
 * reemplaza el innerHTML. Enganchar listeners en cada apertura los apilaria, y
 * la segunda ejecucion registraria cada lote dos veces. Por eso la guarda
 * box._ocEjecWired, el mismo patron que usa tbody._ocWired en esta vista.
 *
 * Todo va por delegacion, incluidos el input del OT y el boton de confirmar:
 * esos dos SI se recrean en cada apertura, asi que una referencia directa
 * quedaria apuntando a un elemento muerto.
 *
 * Los selectores son especificos de este overlay, asi que no interfieren con
 * los otros que comparten overlayBox (el historial, el conflicto de version). */
function _ocEjecWire(){
  const box = $('overlayBox');
  if (!box || box._ocEjecWired) return;
  box._ocEjecWired = true;

  box.addEventListener('change', e => {
    const cb = e.target.closest('input[data-oc-hecho]');
    if (!cb) return;
    if (cb.checked) _ocHechos.add(cb.dataset.ocHecho);
    else _ocHechos.delete(cb.dataset.ocHecho);
    _ocEjecActualizarTotal();
  });

  box.addEventListener('input', e => {
    if (e.target.closest('#ocEjecOT')) _ocEjecActualizarTotal();
  });

  box.addEventListener('click', e => {
    if (e.target.closest('[data-oc-cancelar]')){ cerrarOverlay(); return; }
    if (e.target.closest('#btnOcEjecConfirmar')) _ocEjecConfirmar();
  });
}

/* Escribe las entradas a DATOS().analisis y devuelve snapshots para rollback.
 *
 * Delega la escritura y la busqueda en aplicarCorreccion (so2-bitacora.js),
 * que ahora devuelve { que, ref, anterior }. Una sola copia del predicado
 * lote+fecha garantiza que un campo nuevo no cree dos versiones distintas del
 * lookup: el riesgo descrito en el encabezado de so2-bitacora.js.
 *
 * El snapshot guarda una REFERENCIA al objeto, no su indice. Asi el rollback
 * funciona aunque otra pantalla haya hecho splice al array durante el await:
 * indexOf resuelve la posicion actual en el momento de revertir, no la que
 * tenia cuando se escribio. */
export function _ocEscribirEntradas(analisis, entradas, fecha){
  const snaps = [];
  for (const e of entradas){
    /* aplicarCorreccion busca, muta y devuelve { que, ref, anterior }.
     * 'anterior' es la correccion que habia antes (undefined si no habia nada). */
    const { que, ref, anterior } = aplicarCorreccion(analisis, e.lote, fecha, e.correccion);
    snaps.push({ tipo: que, ref, corrAnterior: anterior });
  }
  return snaps;
}

/* Revierte lo que escribio _ocEscribirEntradas. Se aplica en orden inverso para
 * que el splice de los "creados" no corra los indices de los que siguen.
 * Si el objeto ya no esta en el array (otra pantalla lo borro durante el await),
 * no se hace nada: no hay nada que revertir. */
export function _ocRevertirEntradas(analisis, snaps){
  for (let i = snaps.length - 1; i >= 0; i--){
    const s = snaps[i];
    if (s.tipo === 'creado'){
      const pos = analisis.indexOf(s.ref);
      if (pos !== -1) analisis.splice(pos, 1);
    } else {
      /* El objeto sigue siendo el mismo; si esta en el array, restaurar */
      const pos = analisis.indexOf(s.ref);
      if (pos !== -1){
        if (s.corrAnterior === undefined){
          delete analisis[pos].correccion;
        } else {
          analisis[pos].correccion = s.corrAnterior;
        }
      }
    }
  }
}

/* Escribe, guarda y recarga. El guardado es PARTE de ejecutar: la supresion se
 * calcula en el servidor leyendo datos.json, asi que sin guardar los lotes
 * reaparecerian hasta el proximo guardado manual.
 *
 * Si guardar() falla (409 de version, servidor caido):
 * - Se revierten las correcciones en memoria: el array vuelve al estado anterior
 *   al intento, sin que ninguna referencia externa quede colgada.
 * - No se recarga la orden: el estado en memoria ya volvio a ser el de antes
 *   del intento, y una recarga seria una ida al servidor innecesaria.
 * - El overlay queda abierto con el aviso "no se registro nada, reintenta". */
let _ocEjecEnVuelo = false;  /* guarda de reentrada para doble clic (fix A) */
async function _ocEjecConfirmar(){
  /* A: guarda de reentrada — doble clic rapido dispara un segundo POST con el
   * mismo meta.version, el servidor responde 409 y el handler de 409 pisa el
   * overlay con el panel de "Conflicto de version". Un falso alarma provocado
   * por el propio usuario. Con la guarda el segundo clic simplemente no hace nada. */
  if (_ocEjecEnVuelo) return;

  const msg = $('ocEjecMsg');
  const ot = $('ocEjecOT') ? $('ocEjecOT').value.trim() : '';
  const fecha = $('ocEjecFecha') ? $('ocEjecFecha').value.trim() : '';
  if (!ot){ if (msg) msg.innerHTML = '<div class="msg err">Falta el N° de OT.</div>'; return; }
  if (!fecha){ if (msg) msg.innerHTML = '<div class="msg err">Falta la fecha.</div>'; return; }

  const entradas = _ocEntradasDeEjecucion(_ocBuildRowsLocal(), _ocHechos, ot, fecha);
  if (!entradas.length){
    if (msg) msg.innerHTML = '<div class="msg err">No hay ningún lote tildado con totales válidos.</div>';
    return;
  }

  /* Deshabilitar el boton mientras el guardado esta en vuelo (fix A) */
  const btn = $('btnOcEjecConfirmar');
  _ocEjecEnVuelo = true;
  if (btn) btn.disabled = true;

  /* B: capturar el estado previo y escribir con posibilidad de rollback */
  const snaps = _ocEscribirEntradas(DATOS().analisis, entradas, fecha);
  markDirty();

  if (msg) msg.innerHTML = '<div class="msg info">Guardando…</div>';
  let ok;
  try {
    ok = await guardar();
  } catch (_) {
    /* guardar() puede rechazar si el servidor devuelve un 200 con cuerpo roto
     * (r.json() lanza) o si hay un error de red. En ese caso tratamos el fallo
     * como ok = false: el rollback corre igual que si el servidor hubiera
     * devuelto false, y el usuario ve el aviso de "no se registro nada". */
    ok = false;
  } finally {
    /* Rehabilitar el boton pase lo que pase (fix A) */
    _ocEjecEnVuelo = false;
    const btnPost = $('btnOcEjecConfirmar');
    if (btnPost) btnPost.disabled = false;
  }

  if (!ok){
    /* B: revertir las correcciones en memoria: el array vuelve al estado anterior */
    _ocRevertirEntradas(DATOS().analisis, snaps);

    /* C: buscar ocEjecMsg de nuevo despues del await — si guardar() llamo a
     * mostrarOverlay (caso 409), el nodo anterior quedo desconectado y escribir
     * en el se iria a la nada. Si el usuario cerro el overlay con Escape o con
     * click en el fondo mientras el guardado estaba en vuelo, el nodo sigue
     * conectado al DOM (cerrarOverlay solo saca la clase 'show', el CSS lo oculta
     * con display:none), pero el aviso seria invisible. El predicado correcto es
     * que el overlay este VISIBLE, no solo conectado. Caer al fallback si el
     * overlay no tiene la clase 'show'. */
    const errTxt = '<div class="msg err">No se pudo guardar. No se registró nada. ' +
      'Resolvé el conflicto y volvé a confirmar.</div>';
    const msgPost = $('ocEjecMsg');
    if (msgPost && $('overlay') && $('overlay').classList.contains('show')){
      msgPost.innerHTML = errTxt;
    } else {
      const fallback = $('ocMsg');
      if (fallback) fallback.innerHTML = errTxt;
      else alert('No se pudo guardar. No se registró nada. Resolvé el conflicto y volvé a confirmar.');
    }
    return;
  }

  cerrarOverlay();
  /* G: borrar solo los lotes efectivamente registrados, no todos los del modulo.
   * Si el usuario desteldo un lote antes de confirmar (porque no se hizo),
   * su objetivo pisado a mano y su estado de exclusion sobreviven para la
   * proxima ejecucion: no se pierden en silencio. */
  for (const e of entradas){
    _ocObjetivos.delete(e.lote);
    _ocExcluidos.delete(e.lote);
  }
  _ocOrden = null;
  await _ocCargar();
  _ocRenderTabla();
  _ocPintarPaginas();
  const m = $('ocMsg');
  if (m) m.innerHTML = '<div class="msg ok">✓ Se registraron ' + entradas.length +
    ' correcciones en la bitácora con la OT ' + esc(ot) + '.</div>';
}

registrarVista('ordencorr', () => renderOrdenCorreccion());
