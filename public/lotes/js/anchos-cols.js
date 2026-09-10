/* ===== Lotes CIW — ancho de las columnas de la pestana Lotes =====
 *
 * Arrastrar el borde DERECHO del encabezado cambia el ancho; doble clic ahi
 * mismo lo autoajusta al contenido, como en Excel. Los anchos son una
 * preferencia de pantalla de cada persona: viven en el localStorage, igual que
 * el colapsado de grupos (ver CLAVE_GRUPOS en vista-lotes.js). Guardarlos en
 * datos.json obligaria a apretar Guardar y le pisaria la vista a los demas.
 *
 * DOS DECISIONES QUE EXPLICAN TODO EL ARCHIVO
 *
 * 1) Los anchos se aplican como una REGLA CSS por columna, no como estilo en
 *    las celdas. renderLotes() repinta la tabla entera con innerHTML en cada
 *    filtro, orden y edicion; un style inline en las th se borraria en el
 *    primer repintado. Una regla keyeada por [data-k] sobrevive sola y no hay
 *    que reaplicar nada despues de cada render.
 *
 * 2) El agarre esta a la DERECHA del encabezado porque la izquierda ya esta
 *    ocupada: los primeros 8px de cada th seleccionan la columna entera
 *    (grilla.js, "Encabezado: los primeros 8px toman la columna"), y el resto
 *    del th ordena. El borde derecho era el unico gesto libre.
 *
 * La parte de arriba del archivo es pura y tiene tests (test/lotes-anchos.test.mjs);
 * activarAnchos() y abajo es la que toca el DOM. Importar el modulo no toca el
 * DOM: por eso los tests pueden correr dentro del runtime de Workers.
 */
'use strict';

/* Minimo: por debajo de 40px la columna queda ilegible Y sin superficie para
 * agarrar el borde y volver a agrandarla. Maximo: una columna mas ancha que eso
 * empuja todo lo demas fuera de la pantalla, que es el problema que este
 * subsistema viene a resolver. */
export const MIN_ANCHO = 40;
export const MAX_ANCHO = 600;

/* Las claves salen de COLS_LOTES, pero el mapa se lee del localStorage, que
 * cualquiera puede editar a mano. Una clave con comillas o llaves se colaria
 * al CSS generado, asi que se aceptan solo nombres de columna. */
const CLAVE_OK = /^[A-Za-z0-9_]+$/;

/** Mapa {columna: px} limpio: descarta la basura y acota los extremos. */
export function normalizarAnchos(obj){
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)){
    if (!CLAVE_OK.test(k)) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue;
    out[k] = Math.min(MAX_ANCHO, Math.max(MIN_ANCHO, Math.round(v)));
  }
  return out;
}

/** El CSS de los anchos guardados. Una regla por columna resizeada; las que
 *  nunca se tocaron no aparecen y las sigue midiendo el navegador. */
export function cssDeAnchos(anchos){
  const lim = normalizarAnchos(anchos);
  const partes = [];
  for (const [k, px] of Object.entries(lim)){
    /* Las tres propiedades y no solo width: en una tabla de layout automatico
     * width es una sugerencia que el navegador estira si el contenido no entra. */
    partes.push(`#tLotes th[data-k="${k}"],#tLotes td[data-k="${k}"]`
              + `{width:${px}px;min-width:${px}px;max-width:${px}px}`);
    /* td input.cell trae min-width:60px de index.html: sin pisarlo la columna
     * no baja de ahi por mas que se arrastre el agarre. */
    partes.push(`#tLotes td[data-k="${k}"] input.cell,`
              + `#tLotes td[data-k="${k}"] select.cell`
              + `{min-width:0;max-width:100%}`);
  }
  return partes.join('\n');
}

/** Ancho que hace entrar al texto mas largo de la columna (encabezado incluido).
 *  `medir` recibe un string y devuelve su ancho en px; se inyecta para que la
 *  funcion sea pura y testeable sin canvas. */
export function anchoAutoajustado(textos, medir, pad){
  let max = 0;
  for (const t of (textos || [])){
    if (typeof t !== 'string' || t === '') continue;
    const w = medir(t);
    if (w > max) max = w;
  }
  if (max === 0) return MIN_ANCHO;
  return Math.min(MAX_ANCHO, Math.max(MIN_ANCHO, Math.ceil(max + (pad || 0))));
}

/* ==================== de aca para abajo se toca el DOM ==================== */

const CLAVE_ANCHOS = 'lotes_cols_ancho';
/* Ancho de la franja del borde derecho que agarra la columna. 6px es el mismo
 * orden que los 8px del agarre de seleccion de la izquierda; mas que eso empieza
 * a comerse el clic de ordenar en las columnas angostas. */
const AGARRE = 6;
/* Padding a sumarle al texto medido en el autoajuste: 18px del padding de la
 * celda (7px 9px en la regla th,td de index.html) + 12px del padding del input
 * + 2px de su borde + 4px de aire. Si cambia el padding de las celdas hay que
 * cambiar este numero. */
const PAD_AUTOFIT = 36;

let anchos = {};            // {columna: px} vigente
let styleTag = null;        // <style> con las reglas, se reescribe entero
let medidor = null;         // contexto 2D reusado por el autoajuste
let fuente = '';            // font del medidor, cacheada
let onCambio = null;        // aviso a la vista para el boton de restablecer
let arrastre = null;        // {th, x0, w0} mientras se arrastra
/* El th cuyo click de cierre hay que tragarse, o null. Es el th y no un
 * booleano a proposito: si el mouse se suelta fuera de la ventana el navegador
 * no manda ningun click, y un booleano quedaria armado comiendose el proximo
 * clic que haga la persona en cualquier lado. */
let thTragarClick = null;

const acotar = px => Math.min(MAX_ANCHO, Math.max(MIN_ANCHO, Math.ceil(px)));

function leer(){
  /* Mismo try/catch que usuarioActual() en nucleo.js: si el navegador bloquea
   * el storage la pestana funciona igual y lo unico que se pierde es la memoria
   * de la preferencia. */
  try {
    anchos = normalizarAnchos(JSON.parse(localStorage.getItem(CLAVE_ANCHOS) || 'null'));
  } catch(e){
    anchos = {};
  }
}

function guardar(){
  try {
    if (Object.keys(anchos).length) localStorage.setItem(CLAVE_ANCHOS, JSON.stringify(anchos));
    else localStorage.removeItem(CLAVE_ANCHOS);
  } catch(e){}
}

/** Reescribe el <style> y avisa a la vista para que muestre u oculte el boton
 *  de restablecer. No repinta la tabla: el CSS ya alcanza. */
function aplicar(){
  if (!styleTag){
    styleTag = document.createElement('style');
    styleTag.id = 'anchosLotes';
    /* Al final del head: asi le gana por orden a la regla
     * #tLotes td[data-k="id_texto"] input.cell{max-width:180px} de index.html,
     * que tiene la misma especificidad. */
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = cssDeAnchos(anchos);
  if (typeof onCambio === 'function') onCambio(hayAnchos());
}

/** true si la persona toco al menos un ancho. */
export function hayAnchos(){ return Object.keys(anchos).length > 0; }

/** Vuelve a dejar que el navegador mida las columnas. */
export function restablecerAnchos(){
  anchos = {};
  guardar();
  aplicar();
}

/* --- medicion de texto ---
 * Con un canvas y no con un span de prueba: measureText no toca el DOM, asi que
 * autoajustar las 28 columnas de una no dispara 28 reflows. */
function anchoDeTexto(txt, negrita){
  if (!medidor){
    medidor = document.createElement('canvas').getContext('2d');
    /* La misma fuente de las celdas: font-size 13px de la regla `table` de
     * index.html y la familia que hereda del body. Se lee una sola vez:
     * getComputedStyle por cada celda serian miles de llamadas al autoajustar
     * las 28 columnas. */
    fuente = getComputedStyle(document.body).fontFamily;
  }
  medidor.font = `${negrita ? '600 ' : ''}13px ${fuente}`;
  return medidor.measureText(txt).width;
}

/** Los textos de una columna: el label del encabezado y el valor de cada fila.
 *  Las columnas ro son <td> de texto plano y las editables tienen un input; las
 *  dos ramas hacen falta. */
function textosDeColumna(tabla, k){
  const textos = [];
  for (const td of tabla.querySelectorAll(`tbody td[data-k="${CSS.escape(k)}"]`)){
    const ctrl = td.querySelector('input.cell, select.cell');
    textos.push(ctrl ? (ctrl.value || '') : (td.textContent || '').trim());
  }
  return textos;
}

/** Calcula y guarda el ancho de una columna. Devuelve false si la columna no se
 *  puede medir: Etapa y Avance las pinta celdasEstado() sin data-k en las <td>
 *  (no son campos del lote), asi que no hay contenido que medir y ajustarlas al
 *  label solo las dejaria mas angostas que el chip y la barra que muestran. */
function autoajustarTh(tabla, th){
  const k = th.dataset.k;
  const textos = textosDeColumna(tabla, k);
  if (!textos.length && tabla.tBodies[0] && tabla.tBodies[0].rows.length) return false;

  const porCeldas = anchoAutoajustado(textos, t => anchoDeTexto(t, false), PAD_AUTOFIT);
  /* El encabezado tambien tiene que entrar. Va medido en negrita (las th son
   * font-weight:600) y con 14px extra para la flecha de orden, que aparece en
   * cuanto alguien hace clic en la columna. El label viene sin la flecha, que
   * es un <span> aparte. */
  const label = (th.textContent || '').replace(/[▲▼]/g, '').trim();
  const porLabel = acotar(anchoDeTexto(label, true) + 14 + 18);

  anchos[k] = Math.max(porCeldas, porLabel);
  return true;
}

/** Autoajusta de una todas las columnas visibles de la tabla. */
export function autoajustarTodas(tabla){
  for (const th of tabla.querySelectorAll('thead tr:nth-child(2) th[data-k]'))
    autoajustarTh(tabla, th);
  guardar();
  aplicar();
}

/** Engancha el redimensionado en la tabla. Idempotente: renderLotes() la llama
 *  en cada repintado, igual que a activarGrilla.
 *
 *  @param tabla    la <table> de la pestana Lotes
 *  @param cambio   callback(hayAnchos) para que la vista muestre el boton de
 *                  restablecer solo cuando hay algo que restablecer
 */
export function activarAnchos(tabla, cambio){
  if (cambio) onCambio = cambio;
  if (tabla._anchosWired){ aplicar(); return; }
  tabla._anchosWired = true;

  leer();
  aplicar();

  /* Cursor col-resize solo cuando el mouse esta sobre la franja del agarre. No
   * se puede hacer con CSS: no hay selector para "los ultimos 6px". */
  tabla.addEventListener('mousemove', e => {
    const th = e.target.closest && e.target.closest('th[data-k]');
    if (!th || arrastre) return;
    th.style.cursor = enAgarre(th, e) ? 'col-resize' : '';
  });

  /* En CAPTURA sobre document, no sobre la tabla: la captura baja desde window,
   * asi que este handler corre ANTES del mousedown en captura de grilla.js (que
   * selecciona) sin depender del orden en que se cablearon los dos modulos. */
  document.addEventListener('mousedown', e => {
    const th = e.target.closest && e.target.closest('#tLotes thead th[data-k]');
    if (!th || !enAgarre(th, e)) return;
    e.preventDefault();
    e.stopPropagation();     // que la grilla no seleccione la columna
    empezarArrastre(tabla, th, e.clientX);
  }, true);

  document.addEventListener('dblclick', e => {
    const th = e.target.closest && e.target.closest('#tLotes thead th[data-k]');
    if (!th || !enAgarre(th, e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (autoajustarTh(tabla, th)){ guardar(); aplicar(); }
  }, true);

  /* Arrastrar el borde no tiene que ordenar la columna. El onclick de ordenar
   * lo pone renderLotes() en el th, asi que hay que matar el click en captura
   * antes de que llegue. Se desarma siempre, se traga solo si el click es el de
   * la columna que se acaba de arrastrar: un click en otro lado significa que
   * el del arrastre nunca llego y no hay que comerselo. */
  document.addEventListener('click', e => {
    const objetivo = thTragarClick;
    if (!objetivo) return;
    thTragarClick = null;
    if (!e.target.closest || e.target.closest('th[data-k]') !== objetivo) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
}

function enAgarre(th, e){
  const r = th.getBoundingClientRect();
  return (r.right - e.clientX) <= AGARRE && e.clientX <= r.right;
}

function empezarArrastre(tabla, th, x0){
  arrastre = { th, x0, w0: th.getBoundingClientRect().width };
  thTragarClick = null;      // por si el arrastre anterior dejo uno pendiente
  /* La misma clase que usa la grilla para que el navegador no seleccione texto
   * mientras se arrastra. */
  tabla.classList.add('garrastrando');
  th.classList.add('ganchodrag');
  document.body.style.cursor = 'col-resize';

  const mover = ev => {
    const px = Math.min(MAX_ANCHO, Math.max(MIN_ANCHO,
      Math.round(arrastre.w0 + (ev.clientX - arrastre.x0))));
    anchos[arrastre.th.dataset.k] = px;
    aplicar();
  };
  const soltar = () => {
    document.removeEventListener('mousemove', mover);
    document.removeEventListener('mouseup', soltar);
    tabla.classList.remove('garrastrando');
    document.body.style.cursor = '';
    arrastre.th.classList.remove('ganchodrag');
    arrastre.th.style.cursor = '';
    thTragarClick = arrastre.th;   // el click que sigue al mouseup no ordena
    arrastre = null;
    guardar();
  };
  document.addEventListener('mousemove', mover);
  document.addEventListener('mouseup', soltar);
}
