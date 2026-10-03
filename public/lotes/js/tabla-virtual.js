/* ===== Lotes CIW — tabla virtual: dibuja solo las filas que se ven =====
 *
 * POR QUE EXISTE. Con 2025 y 2026 cargados, Analisis son ~7.000 filas x 20
 * columnas: armarlas todas eran 4-9 s la primera vez, y despues cada clic en una
 * celda (1,3 s), cada flecha (0,6 s) y cada cambio de pestaña (0,2-0,7 s) pagaban
 * el layout de 110.000 nodos aunque no cambiara nada. Aca se dibujan las filas
 * visibles mas un margen, y lo demas lo ocupan dos filas de relleno con el alto
 * exacto de lo que falta: la barra de scroll mide lo mismo que con la tabla
 * entera y la cabecera fija sigue siendo la de siempre.
 *
 * COMO SE USA. La vista arma el <thead> como siempre y deja un <tbody> vacio;
 * despues llama a montarVirtual con:
 *   - n          cuantas filas hay (incluye separadores, si la vista los tiene)
 *   - tipoDe(i)  un nombre por tipo de fila ('dato', 'separador'...). Las filas
 *                de un mismo tipo tienen que medir lo mismo: se miden las
 *                dibujadas y con eso se ubica a todas.
 *   - html(i)    el <tr> completo de la fila i, CON su celda de gutter
 *                (td.ggutter) al principio: grilla.js la inyecta en las filas
 *                que encuentra al activarse, pero las que aparecen al scrollear
 *                llegan despues.
 *   - columnas   cuantas celdas tiene una fila, gutter incluido (para el
 *                colspan del relleno)
 *   - alPintar() se llama cada vez que cambian las filas dibujadas, para que la
 *                grilla repinte su seleccion sobre las nuevas.
 *   - scrollInicial (opcional) donde dejar el scroll. Va aca y no lo pone la
 *                vista despues de montar: con el <tbody> todavia vacio la tabla
 *                no tiene alto y el navegador lo recortaria a 0.
 *
 * Las filas que siguen dibujadas al scrollear NO se rehacen: solo se agregan y
 * quitan las de los bordes. Por eso un input que se esta editando sobrevive a
 * mover la ruedita, y solo pierde el foco si su fila sale del todo de la vista.
 *
 * Las cuentas (donde empieza cada fila, que rango dibujar) viven en
 * ventana-virtual.js, que es puro y tiene tests.
 */
'use strict';

import { armarOffsets, filasVisibles, rangoADibujar, scrollParaVer } from './ventana-virtual.js';

/* Filas de mas a cada lado de lo visible. Crear una fila de Analisis (11
 * inputs) cuesta ~1 ms en las PCs de la bodega, asi que el margen es un
 * equilibrio: con 16 se redibuja de a tramos de ~10-20 filas (10-20 ms, no se
 * nota) y una ruedita normal nunca llega a ver el relleno en blanco. Con 30 los
 * tramos eran de 30-40 ms. */
const MARGEN = 16;
/* Alto que se supone antes de haber medido una fila de ese tipo. Despues del
 * primer dibujado se usa el medido. */
const ALTO_SUPUESTO = 26;
/* Si no se puede medir la vista (pestaña oculta), se dibuja como si midiera
 * esto: alcanza para la primera pantalla de cualquier monitor. */
const ALTO_VISTA_SUPUESTO = 1000;

/* Altos medidos, por tabla y tipo de fila. Sobreviven a los repintados: la
 * vista rehace la <table> en cada filtro, y volver a suponer 26 px en cada uno
 * haria saltar la barra de scroll. */
const _altos = new Map();

/* La tabla virtual vigente de cada <table>, por id, para un solo listener de
 * resize en todo el documento. Analisis recrea su tabla en cada render y Lotes
 * la reusa: en los dos casos un listener por render se acumularia toda la
 * sesion, y en Lotes las instancias viejas seguirian dibujando sobre filas que
 * ya no existen. */
const _vivas = new Map();
let _resizePuesto = false;
function _ponerResize(){
  if (_resizePuesto) return;
  _resizePuesto = true;
  window.addEventListener('resize', () => {
    for (const [id, v] of _vivas){
      if (!v.tabla.isConnected){ _vivas.delete(id); continue; }
      v.actualizar();
    }
  });
}

/** Desengancha la tabla virtual de una <table> que vuelve a dibujarse entera
 *  (por ejemplo, el cartel de "sin filas"): que el scroll y el resize dejen de
 *  llamar a una instancia cuyas filas ya no estan. */
export function soltarVirtual(tabla){
  if (!tabla) return;
  _vivas.delete(tabla.id);
  const cont = tabla.closest('.scroll');
  if (cont) cont._virtual = null;
}

export function montarVirtual(cfg){
  const { tabla, n, tipoDe, html, columnas, alPintar, scrollInicial } = cfg;
  const id = tabla.id;
  const tb = tabla.tBodies[0] || tabla.appendChild(document.createElement('tbody'));
  const cont = tabla.closest('.scroll');

  const altoDe = i => _altos.get(id + ':' + tipoDe(i)) || ALTO_SUPUESTO;
  let off = armarOffsets(n, altoDe);
  let actual = null;   // {ini, fin} dibujado, fin exclusivo

  const relleno = cual => `<tr class="vrelleno" data-vr="${cual}" aria-hidden="true">`
    + `<td class="ggutter"></td><td colspan="${Math.max(1, columnas - 1)}"></td></tr>`;
  tb.innerHTML = relleno('arriba') + relleno('abajo');
  const arriba = tb.rows[0], abajo = tb.rows[1];

  function htmlRango(ini, fin){
    let s = '';
    for (let i = ini; i < fin; i++) s += html(i);
    return s;
  }

  function ajustarRellenos(){
    const r = actual || { ini: 0, fin: 0 };
    arriba.cells[1].style.height = off[r.ini] + 'px';
    abajo.cells[1].style.height = (off[n] - off[r.fin]) + 'px';
  }

  /* Saca la fila sin dejar un foco colgando: si el input que se estaba editando
   * se va, se lo suelta antes para que su change/focusout corran como siempre. */
  function quitar(tr){
    const act = document.activeElement;
    if (act && tr.contains(act) && act.blur) act.blur();
    tr.remove();
  }

  /* Despues de dibujar se miden las filas de cada tipo. Si no miden lo que se
   * supuso (la primera vez, o si cambio el CSS), se rehacen las posiciones: sin
   * esto la barra de scroll mentiria y las filas saltarian al llegar.
   *
   * Se toma el alto MAS REPETIDO de cada tipo y no el de la primera fila: con
   * border-collapse la fila pegada a un relleno (que no tiene borde) mide medio
   * pixel distinto, y medio pixel multiplicado por 7.000 filas son 3.500 px de
   * error en la barra de scroll. */
  function medir(){
    if (!actual) return false;
    const porTipo = new Map();   // tipo -> Map<alto, veces>
    let tr = arriba.nextElementSibling;
    for (let i = actual.ini; i < actual.fin && tr && tr !== abajo; i++, tr = tr.nextElementSibling){
      const h = Math.round(tr.getBoundingClientRect().height * 4) / 4;
      if (!(h > 0)) continue;   // pestaña oculta: no hay nada que medir todavia
      const tipo = tipoDe(i);
      let cuenta = porTipo.get(tipo);
      if (!cuenta){ cuenta = new Map(); porTipo.set(tipo, cuenta); }
      cuenta.set(h, (cuenta.get(h) || 0) + 1);
    }
    let cambio = false;
    for (const [tipo, cuenta] of porTipo){
      let h = 0, veces = 0;
      for (const [alto, v] of cuenta) if (v > veces){ h = alto; veces = v; }
      const clave = id + ':' + tipo;
      const antes = _altos.get(clave);
      if (antes == null || Math.abs(antes - h) > 0.2){ _altos.set(clave, h); cambio = true; }
    }
    if (cambio){ off = armarOffsets(n, altoDe); ajustarRellenos(); }
    return cambio;
  }

  function dibujar(r){
    if (actual && r.ini < actual.fin && r.fin > actual.ini){
      /* Se superponen: se quitan y agregan solo los bordes. */
      for (let k = actual.ini; k < r.ini; k++) quitar(arriba.nextElementSibling);
      for (let k = r.fin; k < actual.fin; k++) quitar(abajo.previousElementSibling);
      if (r.ini < actual.ini) arriba.insertAdjacentHTML('afterend', htmlRango(r.ini, actual.ini));
      if (r.fin > actual.fin) abajo.insertAdjacentHTML('beforebegin', htmlRango(actual.fin, r.fin));
    } else {
      while (arriba.nextElementSibling && arriba.nextElementSibling !== abajo) quitar(arriba.nextElementSibling);
      arriba.insertAdjacentHTML('afterend', htmlRango(r.ini, r.fin));
    }
    actual = r;
    ajustarRellenos();
  }

  /* La parte de las filas que se ve, en las coordenadas de `off` (0 = la
   * primera fila, debajo de la cabecera). La cabecera es sticky: tapa lo que
   * pasa por debajo, asi que se descuenta. */
  function vista(){
    const altoHead = tabla.tHead ? tabla.tHead.offsetHeight : 0;
    const scroll = cont ? cont.scrollTop : 0;
    const altoCont = cont && cont.clientHeight > 0 ? cont.clientHeight : ALTO_VISTA_SUPUESTO;
    return { desde: scroll, alto: Math.max(1, altoCont - altoHead) };
  }

  function actualizar(forzar){
    const v = vista();
    const visibles = filasVisibles(off, v.desde, v.desde + v.alto);
    const r = rangoADibujar(n, visibles, forzar ? null : actual, MARGEN);
    if (!r) return;
    dibujar(r);
    /* Si medir cambio las posiciones, lo visible puede ser otro: una pasada mas
     * (ya con los altos buenos, no vuelve a cambiar). */
    if (medir()){
      const r2 = rangoADibujar(n, filasVisibles(off, v.desde, v.desde + v.alto), actual, MARGEN);
      if (r2) dibujar(r2);
    }
    if (alPintar) alPintar();
  }

  /** El <tr> de la fila i si esta dibujada, o null. */
  function trDe(i){
    if (!actual || i < actual.ini || i >= actual.fin) return null;
    return tb.rows[1 + (i - actual.ini)] || null;
  }

  /** Scrollea lo justo para que la fila i se vea entera y la dibuja ya, sin
   *  esperar al evento de scroll: quien llama (la grilla) la necesita en el
   *  DOM en la linea siguiente. */
  function irA(i){
    if (i < 0 || i >= n || !cont) return;
    const v = vista();
    const s = scrollParaVer(off[i], off[i + 1], v.desde, v.alto);
    if (s != null) cont.scrollTop = s;
    actualizar();
    if (!trDe(i)){
      /* La vista no se pudo mover hasta ahi (pestaña oculta, contenedor sin
       * alto): se dibuja alrededor de la fila igual. */
      dibujar(rangoADibujar(n, { ini: i, fin: i + 1 }, null, MARGEN));
      if (alPintar) alPintar();
    }
  }

  /** Dibuja TODAS las filas. Para imprimir: la hoja tiene que salir entera, no
   *  con la pantalla que se estaba viendo y un relleno en blanco. Despues de
   *  imprimir, actualizar(true) vuelve a dejar solo las visibles. */
  function todo(){
    dibujar({ ini: 0, fin: n });
    if (alPintar) alPintar();
  }

  const inst = { tabla, actualizar, irA, trDe, todo, n };
  /* La tabla tiene su alto entero ANTES de que nadie lea el layout: si no, el
   * navegador recorta el scroll al alto de un <tbody> vacio y Lotes (que reusa
   * su contenedor) volveria arriba de todo en cada repintado. */
  ajustarRellenos();
  if (cont){
    /* Sin esto el navegador "ancla" el scroll: al agrandar el relleno de arriba
     * o insertar filas sobre lo visible, corre scrollTop para que lo que se
     * estaba viendo no se mueva. Aca eso es justo al reves de lo que se quiere
     * (el relleno ya ocupa el lugar exacto) y dispara una cadena de scrolls que
     * manda la tabla al fondo. */
    cont.style.overflowAnchor = 'none';
    /* Un solo listener por contenedor, que atiende a la instancia vigente. */
    if (!cont._virtualEscucha){
      cont._virtualEscucha = true;
      cont.addEventListener('scroll', () => { if (cont._virtual) cont._virtual.actualizar(); }, { passive: true });
    }
    cont._virtual = inst;
    if (scrollInicial > 0) cont.scrollTop = scrollInicial;
  }
  _vivas.set(id, inst);
  _ponerResize();
  actualizar(true);
  return inst;
}
