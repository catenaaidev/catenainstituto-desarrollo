/* ===== Lotes CIW — orden de tablas y filtros multi-select ===== */
'use strict';

import { $, num } from './nucleo.js';

/* --- sort --- */
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
export function opcionesValores(rows, valorDe){
  return [...new Set(rows.map(r=>normVal(valorDe(r))))].sort(cmpValores).map(v=>({val:v,text:(v===''?VACIO_LBL:v)}));
}
export function matchValor(valorDe){ return (row,set)=>set.has(normVal(valorDe(row))); }

export function crearFiltroMulti(cfg){
  const { label, set } = cfg;
  const wrap=document.createElement('div'); wrap.className='mfilt';
  const btn=document.createElement('button'); btn.type='button'; btn.className='mfilt-btn';
  const panel=document.createElement('div'); panel.className='mfilt-panel';
  const search=document.createElement('input'); search.className='mfilt-search'; search.placeholder='buscar…';
  const todas=document.createElement('label'); todas.className='mfilt-opt mfilt-all';
  const todasCb=document.createElement('input'); todasCb.type='checkbox';
  todas.appendChild(todasCb); todas.appendChild(document.createTextNode(' Todas'));
  const list=document.createElement('div'); list.className='mfilt-list';
  const foot=document.createElement('div'); foot.className='mfilt-foot';
  const limpiar=document.createElement('button'); limpiar.type='button'; limpiar.textContent='Limpiar';
  foot.appendChild(limpiar);
  panel.appendChild(search); panel.appendChild(todas); panel.appendChild(list); panel.appendChild(foot);
  wrap.appendChild(btn); wrap.appendChild(panel);
  let opts=[];
  function build(){
    list.innerHTML=''; opts=[];
    for (const o of cfg.opciones()){
      const li=document.createElement('label'); li.className='mfilt-opt';
      const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=set.has(o.val);
      const span=document.createElement('span'); span.textContent=o.text;
      li.appendChild(cb); li.appendChild(span); list.appendChild(li);
      cb.addEventListener('change',()=>{ if(cb.checked) set.add(o.val); else set.delete(o.val); actualizar(); cfg.onChange(); });
      opts.push({val:o.val,text:o.text,li,cb});
    }
  }
  function actualizar(){
    const n=set.size;
    btn.textContent=(n?`${label} (${n})`:label)+' ▾';
    btn.classList.toggle('active', n>0);
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
  btn.addEventListener('click',(e)=>{
    e.stopPropagation();
    const abierto=panel.classList.contains('open');
    document.querySelectorAll('.mfilt-panel.open').forEach(p=>p.classList.remove('open'));
    if (!abierto){ panel.classList.add('open'); search.value=''; opts.forEach(o=>o.li.classList.remove('hide')); actualizar(); search.focus(); }
  });
  panel.addEventListener('click',e=>e.stopPropagation());
  build(); actualizar();
  return { el:wrap, sync, rebuild:()=>{ build(); actualizar(); } };
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

/* Fechas: se guardan siempre en ISO (YYYY-MM-DD) porque asi las comparan las
 * etapas, el linaje y las alarmas. Se aceptan las tres formas con las que una
 * fecha llega pegada desde el Excel; cualquier otra cosa se rechaza, en lugar de
 * guardar un texto que despues nadie puede comparar. Mismo criterio que
 * norm_fecha en migrar_excel.py.
 *
 * Devuelve el ISO, '' si el texto venia vacio, o null si no es una fecha. */
const _RE_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const _RE_DMY = /^(\d{1,2})([/-])(\d{1,2})\2(\d{4})$/;

function normalizarFecha(texto){
  const t = String(texto ?? '').trim();
  if (t === '') return '';

  let a, m, d;
  const iso = _RE_ISO.exec(t);
  if (iso){
    a = +iso[1]; m = +iso[2]; d = +iso[3];
  } else {
    // El backreference \2 obliga a que los dos separadores sean el mismo, asi
    // que '28/01-2026' no pasa.
    const dmy = _RE_DMY.exec(t);
    if (!dmy) return null;
    d = +dmy[1]; m = +dmy[3]; a = +dmy[4];
  }

  /* Que tenga la forma correcta no la hace una fecha real: el 31 de febrero no
   * existe. Se construye en UTC para que la zona horaria no corra el dia. */
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d)
    return null;

  const dos = n => String(n).padStart(2, '0');
  return `${a}-${dos(m)}-${dos(d)}`;
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
    const iso = normalizarFecha(t);
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
