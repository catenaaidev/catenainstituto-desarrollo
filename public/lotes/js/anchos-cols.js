/* ===== Lotes CIW — ancho de columnas arrastrable =====
 *
 * Arrastrar el borde DERECHO del encabezado cambia el ancho; doble clic ahi
 * mismo lo autoajusta al contenido, como en Excel. Los anchos son una
 * preferencia de pantalla de cada persona: viven en el localStorage, igual que
 * el colapsado de grupos (ver CLAVE_GRUPOS en vista-lotes.js). Guardarlos en
 * datos.json obligaria a apretar Guardar y le pisaria la vista a los demas.
 *
 * TRES DECISIONES QUE EXPLICAN TODO EL ARCHIVO
 *
 * 1) Los anchos se aplican como una REGLA CSS por columna, no como estilo en
 *    las celdas. Las vistas repintan la tabla entera con innerHTML en cada
 *    filtro, orden y edicion; un style inline en las th se borraria en el
 *    primer repintado. Una regla keyeada por [data-k] sobrevive sola y no hay
 *    que reaplicar nada despues de cada render.
 *
 * 2) El agarre esta a la DERECHA del encabezado porque la izquierda ya esta
 *    ocupada: los primeros 8px de cada th seleccionan la columna entera
 *    (grilla.js, "Encabezado: los primeros 8px toman la columna"), y el resto
 *    del th ordena. El borde derecho era el unico gesto libre.
 *
 * 3) El modulo es una FABRICA (crearAnchos) y no un singleton, porque lo usan
 *    dos pestanas con tablas distintas. Cada instancia tiene su mapa de anchos,
 *    su clave de localStorage y su <style>, asi que arrastrar 'lote' en Lotes
 *    no mueve nada en Analisis.
 *
 *    Pero los listeners de mousedown/dblclick/click NO son por instancia: van
 *    una sola vez a nivel modulo y despachan a la instancia dueña de la tabla
 *    del evento. Tiene que ser asi porque Analisis rehace su <table> entera en
 *    cada render (sec.innerHTML), asi que el guardrail tabla._anchosWired nunca
 *    se cumple: colgarlos dentro de activar() los acumularia en cada repintado
 *    y la fuga creceria toda la sesion.
 *
 * La parte de arriba del archivo es pura y tiene tests (test/lotes-anchos.test.mjs);
 * la frontera con el DOM esta marcada por la banda de igual-signos a mitad del
 * archivo. Importar el modulo no toca el DOM: por eso los tests pueden correr
 * dentro del runtime de Workers.
 */
'use strict';

/* Minimo: por debajo de 40px la columna queda ilegible Y sin superficie para
 * agarrar el borde y volver a agrandarla. Maximo: una columna mas ancha que eso
 * empuja todo lo demas fuera de la pantalla, que es el problema que este
 * subsistema viene a resolver. */
export const MIN_ANCHO = 40;
export const MAX_ANCHO = 600;

/* Las claves salen de las COLS_* de cada vista, pero el mapa se lee del
 * localStorage, que cualquiera puede editar a mano. Una clave con comillas o
 * llaves se colaria al CSS generado, asi que se aceptan solo nombres de
 * columna. */
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

/** El CSS de los anchos guardados, scopeado a una tabla. Una regla por columna
 *  resizeada; las que nunca se tocaron no aparecen y las sigue midiendo el
 *  navegador.
 *
 *  `tablaId` es obligatorio: sin el, el selector saldria `#undefined` y las
 *  reglas no aplicarian a nada. Devolver '' es preferible a emitir basura. */
export function cssDeAnchos(anchos, tablaId){
  if (!tablaId || !CLAVE_OK.test(tablaId)) return '';
  const lim = normalizarAnchos(anchos);
  const partes = [];
  for (const [k, px] of Object.entries(lim)){
    /* Las tres propiedades y no solo width: en una tabla de layout automatico
     * width es una sugerencia que el navegador estira si el contenido no entra. */
    partes.push(`#${tablaId} th[data-k="${k}"],#${tablaId} td[data-k="${k}"]`
              + `{width:${px}px;min-width:${px}px;max-width:${px}px}`);
    /* td input.cell trae min-width:60px de index.html: sin pisarlo la columna
     * no baja de ahi por mas que se arrastre el agarre. */
    partes.push(`#${tablaId} td[data-k="${k}"] input.cell,`
              + `#${tablaId} td[data-k="${k}"] select.cell`
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

/* Ancho de la franja del borde derecho que agarra la columna. 6px es el mismo
 * orden que los 8px del agarre de seleccion de la izquierda; mas que eso empieza
 * a comerse el clic de ordenar en las columnas angostas. */
const AGARRE = 6;
/* Padding a sumarle al texto medido en el autoajuste: 18px del padding de la
 * celda (7px 9px en la regla th,td de index.html) + 12px del padding del input
 * + 2px de su borde + 4px de aire. Si cambia el padding de las celdas hay que
 * cambiar este numero. */
const PAD_AUTOFIT = 36;
/* Aire extra para el embudo de filtro de la cabecera (pestaña Lotes). El ancho
 * del embudo se MIDE en vivo (ver autoajustarTh); esto es solo el margen para
 * un digito mas del contador, que puede crecer despues del autoajuste sin que
 * nadie vuelva a medir: '▾ 9' -> '▾ 12'. Mismo criterio que los 14px que se le
 * dejan a la flecha de orden, que tambien aparece despues. */
const AIRE_EMBUDO = 8;

const acotar = px => Math.min(MAX_ANCHO, Math.max(MIN_ANCHO, Math.ceil(px)));

/* --- estado COMPARTIDO por todas las instancias ---
 * Un arrastre a la vez en todo el documento: el mouse es uno solo. */
const instancias = [];
let listenersPuestos = false;
let arrastre = null;        // {inst, th, x0, w0} mientras se arrastra
/* El th cuyo click de cierre hay que tragarse, o null. Es el th y no un
 * booleano a proposito: si el mouse se suelta fuera de la ventana el navegador
 * no manda ningun click, y un booleano quedaria armado comiendose el proximo
 * clic que haga la persona en cualquier lado. */
let thTragarClick = null;

let medidor = null;         // contexto 2D reusado por el autoajuste
let fuente = '';            // font del medidor, cacheada

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

function enAgarre(th, e){
  const r = th.getBoundingClientRect();
  return (r.right - e.clientX) <= AGARRE && e.clientX <= r.right;
}

/** La instancia dueña de la tabla a la que pertenece este th, o null.
 *  Prefiere la identidad del nodo antes que el id: Analisis recrea su <table>
 *  en cada render, asi que inst.tabla y tabla.id pueden divergir entre renders
 *  si hay dos instancias con el mismo tablaId registradas. La busqueda por
 *  nodo resuelve siempre el propietario real, sin ambiguedad. */
function instanciaDeTh(th){
  const tabla = th.closest('table');
  if (!tabla) return null;
  return instancias.find(i => i.tabla === tabla)
      || (tabla.id ? instancias.find(i => i.tablaId === tabla.id) : null)
      || null;
}

/* Los tres listeners de document, puestos UNA vez para todas las instancias.
 * En CAPTURA: la captura baja desde window, asi que estos handlers corren ANTES
 * del mousedown en captura de grilla.js (que selecciona) sin depender del orden
 * en que se cablearon los dos modulos. */
function ponerListenersDocumento(){
  if (listenersPuestos) return;
  listenersPuestos = true;

  document.addEventListener('mousedown', e => {
    const th = e.target.closest && e.target.closest('thead th[data-k]');
    if (!th || !enAgarre(th, e)) return;
    const inst = instanciaDeTh(th);
    if (!inst) return;
    e.preventDefault();
    e.stopPropagation();     // que la grilla no seleccione la columna
    empezarArrastre(inst, th, e.clientX);
  }, true);

  document.addEventListener('dblclick', e => {
    const th = e.target.closest && e.target.closest('thead th[data-k]');
    if (!th || !enAgarre(th, e)) return;
    const inst = instanciaDeTh(th);
    if (!inst) return;
    e.preventDefault();
    e.stopPropagation();
    if (inst.autoajustarTh(th)){ inst.guardar(); inst.aplicar(); }
  }, true);

  /* Arrastrar el borde no tiene que ordenar la columna. El onclick de ordenar
   * lo pone el render en el th, asi que hay que matar el click en captura antes
   * de que llegue. Se desarma siempre, se traga solo si el click es el de la
   * columna que se acaba de arrastrar: un click en otro lado significa que el
   * del arrastre nunca llego y no hay que comerselo. */
  document.addEventListener('click', e => {
    const objetivo = thTragarClick;
    if (!objetivo) return;
    thTragarClick = null;
    if (!e.target.closest || e.target.closest('th[data-k]') !== objetivo) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
}

function empezarArrastre(inst, th, x0){
  const tabla = th.closest('table');
  arrastre = { inst, th, x0, w0: th.getBoundingClientRect().width };
  thTragarClick = null;      // por si el arrastre anterior dejo uno pendiente
  /* La misma clase que usa la grilla para que el navegador no seleccione texto
   * mientras se arrastra. */
  tabla.classList.add('garrastrando');
  th.classList.add('ganchodrag');
  document.body.style.cursor = 'col-resize';

  const mover = ev => {
    const px = Math.min(MAX_ANCHO, Math.max(MIN_ANCHO,
      Math.round(arrastre.w0 + (ev.clientX - arrastre.x0))));
    arrastre.inst.anchos[arrastre.th.dataset.k] = px;
    arrastre.inst.aplicar();
  };
  const soltar = () => {
    document.removeEventListener('mousemove', mover);
    document.removeEventListener('mouseup', soltar);
    tabla.classList.remove('garrastrando');
    document.body.style.cursor = '';
    arrastre.th.classList.remove('ganchodrag');
    arrastre.th.style.cursor = '';
    thTragarClick = arrastre.th;   // el click que sigue al mouseup no ordena
    const inst = arrastre.inst;
    arrastre = null;
    inst.guardar();
  };
  document.addEventListener('mousemove', mover);
  document.addEventListener('mouseup', soltar);
}

/** Crea el manejador de anchos de UNA tabla.
 *
 *  @param tablaId         el id de la <table> (sin '#')
 *  @param claveStorage    la clave de localStorage donde guarda sus anchos
 *  @param filaEncabezado  selector de la fila de th a recorrer al autoajustar.
 *                         Lotes tiene encabezado de dos filas (bandas + columnas)
 *                         y Analisis de una sola.
 */
export function crearAnchos({ tablaId, claveStorage, filaEncabezado }){
  const inst = {
    tablaId,
    anchos: {},       // {columna: px} vigente
    tabla: null,      // la <table> del ultimo activar(); Analisis la recrea
    styleTag: null,
    onCambio: null,
    _leido: false,
  };

  inst.leer = function(){
    /* Una sola vez por instancia: Analisis recrea su <table> en cada render, y
     * sin este flag cada repintado volveria a leer el storage y pisaria los
     * anchos vivos con {} cuando el navegador tiene el storage bloqueado (el
     * catch de guardar() se traga el error en silencio). */
    if (inst._leido) return;
    inst._leido = true;
    /* Mismo try/catch que usuarioActual() en nucleo.js: si el navegador bloquea
     * el storage la pestana funciona igual y lo unico que se pierde es la
     * memoria de la preferencia. */
    try {
      inst.anchos = normalizarAnchos(JSON.parse(localStorage.getItem(claveStorage) || 'null'));
    } catch(e){
      inst.anchos = {};
    }
  };

  inst.guardar = function(){
    try {
      if (Object.keys(inst.anchos).length) localStorage.setItem(claveStorage, JSON.stringify(inst.anchos));
      else localStorage.removeItem(claveStorage);
    } catch(e){}
  };

  /** Reescribe el <style> y avisa a la vista para que muestre u oculte el boton
   *  de restablecer. No repinta la tabla: el CSS ya alcanza. */
  inst.aplicar = function(){
    if (!inst.styleTag){
      inst.styleTag = document.createElement('style');
      inst.styleTag.id = 'anchos_' + tablaId;
      /* Al final del head: asi le gana por orden a la regla
       * #tLotes td[data-k="id_texto"] input.cell{max-width:180px} de index.html,
       * que tiene la misma especificidad. */
      document.head.appendChild(inst.styleTag);
    }
    inst.styleTag.textContent = cssDeAnchos(inst.anchos, tablaId);
    if (typeof inst.onCambio === 'function') inst.onCambio(inst.hay());
  };

  /** Los textos de una columna: el label del encabezado y el valor de cada fila.
   *  Las columnas ro son <td> de texto plano y las editables tienen un input; las
   *  dos ramas hacen falta. */
  function textosDeColumna(k){
    const textos = [];
    for (const td of inst.tabla.querySelectorAll(`tbody td[data-k="${CSS.escape(k)}"]`)){
      const ctrl = td.querySelector('input.cell, select.cell');
      textos.push(ctrl ? (ctrl.value || '') : (td.textContent || '').trim());
    }
    return textos;
  }

  /** Calcula y guarda el ancho de una columna. Devuelve false si la columna no
   *  se puede medir: Etapa y Avance las pinta celdasEstado() sin data-k en las
   *  <td> (no son campos del lote), asi que no hay contenido que medir y
   *  ajustarlas al label solo las dejaria mas angostas que el chip y la barra
   *  que muestran. */
  inst.autoajustarTh = function(th){
    if (!inst.tabla) return false;
    const k = th.dataset.k;
    const textos = textosDeColumna(k);
    if (!textos.length && inst.tabla.tBodies[0] && inst.tabla.tBodies[0].rows.length) return false;

    const porCeldas = anchoAutoajustado(textos, t => anchoDeTexto(t, false), PAD_AUTOFIT);
    /* El encabezado tambien tiene que entrar. Va medido en negrita (las th son
     * font-weight:600) y con 14px extra para la flecha de orden, que aparece en
     * cuanto alguien hace clic en la columna.
     *
     * El label son los nodos de TEXTO DIRECTOS del th: la flecha de orden es un
     * <span> y el embudo de filtro un <button>, los dos hijos aparte. Antes esto
     * leia th.textContent y le sacaba las flechas con un replace; con el embudo
     * ya no alcanza, porque su ancho real (padding + borde + margen del boton)
     * no tiene nada que ver con lo que mide su glifo, y el contador que lleva
     * adentro ('▾ 2') se pegaria al label como si fuera parte del titulo. */
    const label = [...th.childNodes]
      .filter(n => n.nodeType === 3)
      .map(n => n.textContent).join('').trim();
    /* El embudo se MIDE en vivo en lugar de estimarlo con una constante: su
     * ancho depende del contador que lleva adentro y del peso de la fuente
     * ('▾' son 16px, '▾ 1' en negrita son 23), asi que una constante se queda
     * corta justo cuando el filtro esta puesto -- que es cuando mas falta hace
     * poder apretarlo. Medido ademas no se desfasa si cambia el CSS del boton. */
    const emb = th.querySelector('.th-flt');
    const anchoEmbudo = emb
      ? emb.getBoundingClientRect().width
        + parseFloat(getComputedStyle(emb).marginLeft) + AIRE_EMBUDO
      : 0;
    const porLabel = acotar(anchoDeTexto(label, true) + 14 + 18 + anchoEmbudo);

    inst.anchos[k] = Math.max(porCeldas, porLabel);
    return true;
  };

  /** Autoajusta de una todas las columnas visibles de la tabla. */
  inst.autoajustarTodas = function(){
    if (!inst.tabla) return;
    for (const th of inst.tabla.querySelectorAll(`${filaEncabezado} th[data-k]`))
      inst.autoajustarTh(th);
    inst.guardar();
    inst.aplicar();
  };

  /** true si la persona toco al menos un ancho. */
  inst.hay = function(){ return Object.keys(inst.anchos).length > 0; };

  /** Vuelve a dejar que el navegador mida las columnas. */
  inst.restablecer = function(){
    inst.anchos = {};
    inst.guardar();
    inst.aplicar();
  };

  /** Engancha el redimensionado en la tabla. Idempotente por tabla: las vistas
   *  la llaman en cada repintado, igual que a activarGrilla. Analisis pasa una
   *  <table> NUEVA en cada render (sec.innerHTML la recrea) y eso esta bien: lo
   *  unico que se cuelga por tabla es el mousemove del cursor, y la tabla vieja
   *  se va con su listener. */
  inst.activar = function(tabla, onCambio){
    inst.tabla = tabla;
    if (onCambio) inst.onCambio = onCambio;

    ponerListenersDocumento();
    if (!instancias.includes(inst)) instancias.push(inst);

    if (tabla._anchosWired){ inst.aplicar(); return; }
    tabla._anchosWired = true;

    inst.leer();
    inst.aplicar();

    /* Cursor col-resize solo cuando el mouse esta sobre la franja del agarre. No
     * se puede hacer con CSS: no hay selector para "los ultimos 6px". */
    tabla.addEventListener('mousemove', e => {
      const th = e.target.closest && e.target.closest('th[data-k]');
      if (!th || arrastre) return;
      th.style.cursor = enAgarre(th, e) ? 'col-resize' : '';
    });
  };

  return inst;
}
