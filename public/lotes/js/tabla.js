/* ===== Lotes CIW — orden de tablas y filtros multi-select ===== */
'use strict';

import { $, num } from './nucleo.js';
import { posicionDePanel } from './posicion-panel.js';
import { aIso } from './fechas.js';

/* Set de un embudo que sobrevive al F5 en esta pestaña (shared/filtros-sesion.js).
   Sin CIWFiltros (tests, servidor de prueba viejo), un Set común. */
export const setF = (pantalla, k) => (typeof window !== 'undefined' && window.CIWFiltros)
  ? window.CIWFiltros.set('lotes:' + pantalla + ':f:' + k) : new Set();

/* --- sort --- */
/* ordenValido vive aparte (modulo puro) para poder testearlo sin nucleo.js. */
export { ordenValido } from './orden-valido.js';
export function toggleSort(st, k){ if (st.key===k) st.dir*=-1; else { st.key=k; st.dir=1; } }
export function sortRows(rows, st){
  return [...rows].sort((a,b)=>{
    let x=a[st.key], y=b[st.key];
    if (x==null) return 1; if (y==null) return -1;
    if (typeof x==='string'&&typeof y==='string') return st.dir * x.localeCompare(y,'es');
    return st.dir * (x-y);
  });
}

/* --- filtros multi-select --- */
const VACIO_LBL = '(vacío)';
export function normVal(v){ return (v==null||String(v).trim()==='')?'':String(v).trim(); }
export function cmpValores(a,b){
  if (a===b) return 0;
  if (a==='') return -1; if (b==='') return 1;
  const na=parseFloat(a.replace(',','.')), nb=parseFloat(b.replace(',','.'));
  const aNum=!isNaN(na)&&/^[\d.,]+$/.test(a), bNum=!isNaN(nb)&&/^[\d.,]+$/.test(b);
  if (aNum&&bNum) return na-nb;
  return a.localeCompare(b,'es');
}
/* `textoDe` separa el valor que se filtra del texto que se lee en la casilla.
 * Lo necesita la columna Fecha: el valor tiene que seguir siendo el ISO (es lo
 * que compara el match, y ordenarlo como texto es ordenarlo cronologicamente),
 * pero la casilla tiene que decir 10/09/2026. Sin esto, la lista saldria
 * ordenada por dia: un 01/12 antes que un 02/03. */
export function opcionesValores(rows, valorDe, textoDe){
  const texto = textoDe || (v => v);
  return [...new Set(rows.map(r=>normVal(valorDe(r))))].sort(cmpValores).map(v=>({val:v,text:(v===''?VACIO_LBL:texto(v))}));
}
export function matchValor(valorDe){ return (row,set)=>set.has(normVal(valorDe(row))); }

/* cfg.anclado = true monta el filtro en "modo cabecera": el panel se cuelga de
 * <body> con position:fixed y el filtro NO trae boton propio -- lo dispara un
 * elemento externo que le pasa a abrir(). Lo usa la pestaña Lotes, que pone el
 * embudo dentro de cada <th>.
 *
 * El panel tiene que salir del flujo normal si o si: la tabla de Lotes vive
 * dentro de .scroll.tall{overflow:auto} y un panel position:absolute adentro
 * quedaria RECORTADO por ese contenedor. Colgarlo de <body> es lo que lo salva.
 *
 * Las otras cinco pestañas siguen usando el modo de siempre (boton + panel
 * absolute dentro de .mfilt), que no cambia en nada. */
export function crearFiltroMulti(cfg){
  const { label, set } = cfg;
  const anclado = cfg.anclado === true;
  /* cfg.perezoso = true no arma la lista de casillas hasta que alguien abre el
   * panel. Lo usa la pestaña Analisis, que tiene un embudo en CADA una de sus
   * 18 columnas: construirlas todas de entrada son ~2000 casillas (6000 nodos)
   * para paneles que en su enorme mayoria nadie va a abrir, y recorrer los 2601
   * analisis 18 veces. Al abrir, alternarPanel llama a rebuildSiCambio, que es
   * justo lo que hacia la vista en cada render. */
  const perezoso = cfg.perezoso === true;
  const wrap=document.createElement('div'); wrap.className='mfilt';
  const btn=document.createElement('button'); btn.type='button'; btn.className='mfilt-btn';
  const panel=document.createElement('div'); panel.className='mfilt-panel';
  if (anclado) panel.classList.add('mfilt-anclado');
  const search=document.createElement('input'); search.className='mfilt-search'; search.placeholder='buscar…';
  const todas=document.createElement('label'); todas.className='mfilt-opt mfilt-all';
  const todasCb=document.createElement('input'); todasCb.type='checkbox';
  todas.appendChild(todasCb); todas.appendChild(document.createTextNode(' Todas'));
  const list=document.createElement('div'); list.className='mfilt-list';
  const foot=document.createElement('div'); foot.className='mfilt-foot';
  const limpiar=document.createElement('button'); limpiar.type='button'; limpiar.textContent='Limpiar';
  foot.appendChild(limpiar);
  panel.appendChild(search); panel.appendChild(todas); panel.appendChild(list); panel.appendChild(foot);
  /* En modo anclado el boton no se usa (lo reemplaza el embudo del <th>) y el
     panel se va a <body>; wrap queda suelto y el llamador no lee .el. */
  if (anclado) document.body.appendChild(panel);
  else { wrap.appendChild(btn); wrap.appendChild(panel); }
  let opts=[];
  /* Firma de las opciones con las que se construyo la lista, para poder saltear
   * la reconstruccion cuando no cambiaron. Ver rebuildSiCambio. El separador es
   * un NUL, que no aparece en un valor tipeado por nadie. */
  let firma=null;
  const firmaDe=(lista)=>lista.map(o=>o.val).join('\u0000');
  function build(lista){
    const nuevas=lista||cfg.opciones();
    /* Los Sets de CIWFiltros vuelven del F5 con lo de antes: la primera vez se
       descarta lo que ya no es una opción (ver shared/filtros-sesion.js).
       Si todavia no hay opciones (ej. la carga de datos fallo), no podar: con
       la lista vacia se borraria TODO lo restaurado y se guardaria asi. Se deja
       `restaurado` prendido para que el primer build con datos reales pode. */
    if (set.podar && nuevas.length) set.podar(new Set(nuevas.map(o => o.val)));
    list.innerHTML=''; opts=[];
    for (const o of nuevas){
      const li=document.createElement('label'); li.className='mfilt-opt';
      const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=set.has(o.val);
      const span=document.createElement('span'); span.textContent=o.text;
      li.appendChild(cb); li.appendChild(span); list.appendChild(li);
      cb.addEventListener('change',()=>{ if(cb.checked) set.add(o.val); else set.delete(o.val); actualizar(); cfg.onChange(); });
      opts.push({val:o.val,text:o.text,li,cb});
    }
    firma=firmaDe(nuevas);
  }
  function actualizar(){
    const n=set.size;
    /* En modo anclado el boton esta detached y nadie lo ve: quien muestra el
       label y el contador es el embudo del <th>, que la vista repinta en cada
       render leyendo el tamaño del Set. */
    if (!anclado){
      btn.textContent=(n?`${label} (${n})`:label)+' ▾';
      btn.classList.toggle('active', n>0);
    }
    const vis=opts.filter(o=>!o.li.classList.contains('hide'));
    todasCb.checked=vis.length>0&&vis.every(o=>o.cb.checked);
  }
  function sync(){ opts.forEach(o=>o.cb.checked=set.has(o.val)); actualizar(); }
  search.addEventListener('input',()=>{
    const q=search.value.toLowerCase().trim();
    opts.forEach(o=>{ o.li.classList.toggle('hide', !!q&&!o.text.toLowerCase().includes(q)); });
    actualizar();
  });
  todasCb.addEventListener('change',()=>{
    const vis=opts.filter(o=>!o.li.classList.contains('hide'));
    vis.forEach(o=>{ o.cb.checked=todasCb.checked; if(todasCb.checked) set.add(o.val); else set.delete(o.val); });
    actualizar(); cfg.onChange();
  });
  limpiar.addEventListener('click',()=>{ set.clear(); sync(); cfg.onChange(); });
  /* Abrir/cerrar es un toggle: volver a apretar el mismo disparador lo cierra.
     `ancla` es el elemento bajo el cual colocarlo y solo lo usa el modo
     anclado; con el boton propio la posicion la resuelve el CSS. */
  function alternarPanel(ancla){
    const abierto=panel.classList.contains('open');
    document.querySelectorAll('.mfilt-panel.open').forEach(p=>p.classList.remove('open'));
    if (abierto) return;
    /* La lista se pone al dia ACA y no en cada render de la vista: es el unico
       momento en que alguien la va a mirar, y asi el filtro perezoso arma la
       suya la primera vez que se lo abre. rebuildSiCambio no crea ni un nodo si
       las opciones no cambiaron. */
    rebuildSiCambio();
    panel.classList.add('open'); search.value='';
    opts.forEach(o=>o.li.classList.remove('hide')); actualizar();
    /* Posicionar DESPUES de mostrarlo: con display:none el panel mide 0x0 y no
       habria forma de saber si entra abajo del ancla o hay que volcarlo arriba. */
    if (anclado && ancla){
      const a=ancla.getBoundingClientRect(), p=panel.getBoundingClientRect();
      const {izq,top}=posicionDePanel(
        { left:a.left, top:a.top, bottom:a.bottom },
        { ancho:p.width, alto:p.height },
        { ancho:window.innerWidth, alto:window.innerHeight });
      panel.style.left=izq+'px'; panel.style.top=top+'px';
    }
    search.focus();
  }
  /* Igual que rebuild, pero solo rehace la lista si las opciones cambiaron; si
   * son las mismas, se limita a resincronizar los tildes y el contador, que no
   * crea ni un nodo. Lo llaman alternarPanel (al abrir) y las vistas que
   * quieran forzarlo. Devuelve si reconstruyo, para poder verificarlo.
   *
   * Saltear el build es seguro porque los checkbox que ya existen quedan
   * colgados del `set` de siempre (es el mismo objeto Set, no una copia), asi
   * que sus listeners siguen escribiendo donde corresponde. */
  function rebuildSiCambio(){
    const nuevas=cfg.opciones();
    if (firmaDe(nuevas)===firma){ sync(); return false; }
    build(nuevas); actualizar(); return true;
  }
  btn.addEventListener('click',(e)=>{ e.stopPropagation(); alternarPanel(); });
  panel.addEventListener('click',e=>e.stopPropagation());
  /* El perezoso no arma nada todavia: `firma` queda en null, asi que el primer
     rebuildSiCambio (el de alternarPanel) siempre construye. `actualizar` si
     corre, para que el boton nazca con el label y el contador correctos. */
  if (!perezoso) build();
  actualizar();
  return {
    el:wrap, sync, abrir:alternarPanel, rebuildSiCambio,
    rebuild:()=>{ build(); actualizar(); },
  };
}

export function initFiltrosMulti(barId, descriptores, onChange){
  const bar=$(barId); if(!bar) return [];
  bar.innerHTML=''; const inst=[];
  for (const d of descriptores){
    const f=crearFiltroMulti({label:d.label, opciones:d.opciones, set:d.set, onChange});
    bar.appendChild(f.el); inst.push(f);
  }
  return inst;
}
export function pasaMulti(row, descriptores){
  for (const d of descriptores){ if(d.set.size){ if(!d.match(row,d.set)) return false; } }
  return true;
}
export function limpiarFiltrosMulti(descriptores, buscadorId, instancias, onChange){
  descriptores.forEach(d=>d.set.clear());
  if (buscadorId){ const b=$(buscadorId); if(b) b.value=''; }
  instancias.forEach(f=>f.sync());
  onChange();
}

/* --- escritura de celdas ---
 * Unico lugar donde vive la conversion texto -> valor del modelo. La edicion a
 * mano de cada vista y el pegado en bloque de la grilla tienen que aplicar la
 * MISMA regla; tener dos copias divergiendo seria un bug esperando.
 *
 * Devuelve:
 *   'ok'       escribio obj[k]
 *   'ro'       la columna es de solo lectura (o no existe): no escribe
 *   'invalido' el texto no sirve para esa columna: no escribe
 */
export function escribirCelda(cols, obj, k, texto){
  const c = cols.find(x => x.k === k);
  if (!c || c.ro) return 'ro';

  const t = String(texto ?? '').trim();

  if (c.sel){
    // Comparacion sin mayusculas contra la lista de opciones permitidas.
    const opt = c.sel.find(s => String(s).toLowerCase() === t.toLowerCase());
    if (opt === undefined) return 'invalido';
    obj[k] = opt === '' ? null : opt;
    return 'ok';
  }

  if (c.fecha){
    /* Se guarda en ISO venga como venga escrito: ver fechas.js. */
    const iso = aIso(t);
    if (iso === null) return 'invalido';
    obj[k] = iso === '' ? null : iso;
    return 'ok';
  }

  if (c.num){
    if (t === ''){ obj[k] = null; return 'ok'; }
    // num() acepta coma decimal pero devuelve null tanto para '' como para
    // texto basura, asi que el vacio se descarta ANTES para poder distinguir.
    const n = num(t);
    if (n === null) return 'invalido';
    obj[k] = c.int ? Math.round(n) : n;
    return 'ok';
  }

  obj[k] = t === '' ? null : t;
  return 'ok';
}
