// Filtros de consulta: seleccion OR en una columna, AND entre columnas.
// Las tablas virtuales/editables conservan su propio motor; no se filtra su DOM.
export const valorFiltro = v => String(v ?? '').trim().replace(/\s+/g,' ');
export const coincideFiltros = (valores, filtros) => [...filtros].every(([i,s])=>s.has(valorFiltro(valores[i])));
export const opcionesColumna = (filas,i) => [...new Set(filas.map(r=>valorFiltro(r[i])))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true,sensitivity:'base'}));
const estados=new WeakMap(); let menu=null, disparador=null;
const el=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n;};
const btn=(txt,fn)=>{const n=el('button',txt);n.type='button';n.addEventListener('click',fn);return n;};
function cerrar(devolver=false){menu?.remove();menu=null;if(disparador){disparador.setAttribute('aria-expanded','false');if(devolver&&disparador.isConnected)disparador.focus();}disparador=null;}
function filasTabla(t,head){return [...t.rows].filter(r=>r!==head&&r.cells.length===head.cells.length&&[...r.cells].every(c=>c.tagName==='TD'&&c.colSpan===1&&c.rowSpan===1));}
function datosFila(r){return [...r.cells].map(c=>valorFiltro(c.textContent));}
function apta(t){
  if(!t.isConnected||t.closest('form, dialog, [contenteditable=true], [data-no-filtros], #editor-host, .jexcel, .jspreadsheet, [role=grid]'))return false;
  if(t.closest('.scroll')?._virtual||['tLotes','tAnalisis','tCargar'].includes(t.id))return false;
  if(t.querySelector('.th-flt, [data-flt], input, select, textarea, [contenteditable=true], .ggutter'))return false;
  if(t.matches('.historial-impresion, .print-table')||t.closest('[id*="impresion"], [id*="Impresion"], [class*="print-only"], [class*="hoja-ot"]'))return false;
  const head=t.rows[0];if(!head||head.cells.length<2||[...head.cells].some(c=>c.tagName!=='TH'||c.colSpan!==1||c.rowSpan!==1))return false;
  const rows=filasTabla(t,head);return rows.length>0&&rows.length===t.rows.length-1;
}
function aplicar(t,s){
  const rows=filasTabla(t,s.head);let visibles=0;
  for(const r of rows){const ok=!s.filtros.size||coincideFiltros(datosFila(r),s.filtros);r.classList.toggle('ciw-filtro-oculto',!ok);if(ok)visibles++;}
  for(const [i,b] of s.botones){const activo=s.filtros.has(i);b.classList.toggle('ciw-filtro-activo',activo);b.setAttribute('aria-label','Filtrar '+b.dataset.columna+(activo?' · activo':''));b.title='Filtrar '+b.dataset.columna+(activo?' · '+s.filtros.get(i).size+' seleccionados':'');}
  s.info.textContent=s.filtros.size?`${visibles} de ${rows.length} filas visibles`:`${rows.length} filas`;
  s.limpiar.hidden=!s.filtros.size;s.barra.hidden=!s.filtros.size;
}
function posicionar(){if(!menu||!disparador?.isConnected)return cerrar();const r=disparador.getBoundingClientRect(),w=menu.offsetWidth,h=menu.offsetHeight;menu.style.left=Math.max(8,Math.min(r.left,innerWidth-w-8))+'px';menu.style.top=Math.max(8,Math.min(r.bottom+5,innerHeight-h-8))+'px';}
function abrir(t,s,i,b){
  if(disparador===b){cerrar(true);return;}cerrar();disparador=b;b.setAttribute('aria-expanded','true');
  const opciones=opcionesColumna(filasTabla(t,s.head).map(datosFila),i),seleccion=new Set(s.filtros.get(i)||opciones);
  const p=el('section',undefined,'ciw-filtro-menu');p.setAttribute('role','dialog');p.setAttribute('aria-label','Filtrar '+b.dataset.columna);menu=p;
  const titulo=el('strong',b.dataset.columna),buscar=el('input');buscar.type='search';buscar.placeholder='Buscar valores…';buscar.setAttribute('aria-label','Buscar valores');
  const todos=el('input');todos.type='checkbox';const todosLabel=el('label',undefined,'ciw-filtro-todos');todosLabel.append(todos,el('span','Seleccionar todos los resultados'));const estado=el('small'),lista=el('div',undefined,'ciw-filtro-opciones'),acciones=el('div',undefined,'ciw-filtro-acciones');let visibles=[];
  const refrescar=()=>{const n=visibles.filter(v=>seleccion.has(v)).length;todos.checked=visibles.length>0&&n===visibles.length;todos.indeterminate=n>0&&n<visibles.length;todos.disabled=!visibles.length;estado.textContent=`${seleccion.size} de ${opciones.length} seleccionados`+(visibles.length>200?' · primeros 200 resultados, buscá para ver otros':'');};
  function pintar(){const q=buscar.value.toLocaleLowerCase('es');visibles=opciones.filter(v=>(v||'(Vacío)').toLocaleLowerCase('es').includes(q));const f=document.createDocumentFragment();for(const v of visibles.slice(0,200)){const label=el('label'),check=el('input');check.type='checkbox';check.checked=seleccion.has(v);check.addEventListener('change',()=>{if(check.checked)seleccion.add(v);else seleccion.delete(v);refrescar();});label.append(check,el('span',v||'(Vacío)'));f.append(label);}lista.replaceChildren(f);refrescar();}
  buscar.addEventListener('input',pintar);
  todos.addEventListener('change',()=>{for(const v of visibles){if(todos.checked)seleccion.add(v);else seleccion.delete(v);}pintar();});
  acciones.append(btn('Quitar filtro',()=>{s.filtros.delete(i);aplicar(t,s);cerrar(true);}),btn('Cancelar',()=>cerrar(true)),btn('Aplicar',()=>{if(seleccion.size===opciones.length)s.filtros.delete(i);else s.filtros.set(i,new Set(seleccion));aplicar(t,s);cerrar(true);}));
  p.append(titulo,buscar,todosLabel,estado,lista,acciones);document.body.append(p);pintar();posicionar();buscar.focus();
}
function montar(t){
  const previo=estados.get(t);if(previo&&previo.head===t.rows[0]&&[...previo.botones.values()].every(b=>b.isConnected)){aplicar(t,previo);return;}
  if(previo){previo.barra.remove();previo.botones.forEach(b=>{b.parentElement?.classList.remove('ciw-filtro-cabecera');b.remove();});for(const r of t.rows)r.classList.remove('ciw-filtro-oculto');estados.delete(t);}
  if(!apta(t))return;const head=t.rows[0],s={head,filtros:new Map(),botones:new Map()};estados.set(t,s);
  [...head.cells].forEach((th,i)=>{const nombre=th.textContent.trim();if(!nombre||/^(acciones?|editar|eliminar|ver|opciones)$/i.test(nombre)||th.querySelector('button,a,input,select'))return;const b=btn('',e=>{e.preventDefault();e.stopPropagation();abrir(t,s,i,b);});b.className='ciw-filtro-col';b.dataset.columna=nombre;b.setAttribute('aria-expanded','false');b.title='Filtrar '+nombre;b.setAttribute('aria-haspopup','dialog');th.classList.add('ciw-filtro-cabecera');th.append(b);s.botones.set(i,b);});
  if(!s.botones.size){estados.delete(t);return;}
  s.barra=el('div',undefined,'ciw-filtro-barra');s.info=el('span');s.limpiar=btn('Quitar todos los filtros',()=>{s.filtros.clear();aplicar(t,s);});s.barra.append(s.info,s.limpiar);t.before(s.barra);aplicar(t,s);
}
// Se monta solo en tablas de lectura simples. No cambia datos, ordenamiento, exportacion o permisos.
export function activarFiltrosTablas(){
  const pendientes=new Set();let raf=0;
  function agregar(t){if(t?.tagName==='TABLE'&&!t.closest('.scroll')?._virtual&&!['tLotes','tAnalisis','tCargar'].includes(t.id))pendientes.add(t);}
  function procesar(){raf=0;for(const t of pendientes)montar(t);pendientes.clear();}
  function programar(){if(pendientes.size&&!raf)raf=requestAnimationFrame(procesar);}
  document.querySelectorAll('table').forEach(agregar);programar();
  new MutationObserver(ms=>{for(const m of ms){if(m.target.closest?.('.ciw-filtro-menu,.ciw-filtro-barra,.ciw-filtro-col'))continue;for(const n of m.addedNodes){if(n.nodeType!==1||n.matches('.ciw-filtro-menu,.ciw-filtro-barra,.ciw-filtro-col'))continue;if(n.tagName==='TABLE')agregar(n);else if(n.tagName==='TBODY'||n.tagName==='THEAD'||n.tagName==='TR')agregar(n.closest('table'));else n.querySelectorAll?.('table').forEach(agregar);}}programar();if(disparador&&!disparador.isConnected)cerrar();}).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('pointerdown',e=>{if(menu&&!menu.contains(e.target)&&!disparador?.contains(e.target))cerrar();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu){e.stopPropagation();cerrar(true);}});window.addEventListener('resize',posicionar);window.addEventListener('scroll',e=>{if(menu&&!menu.contains(e.target instanceof Node?e.target:null))cerrar();},true);
}
if(typeof document!=='undefined'&&typeof MutationObserver!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',activarFiltrosTablas,{once:true});else activarFiltrosTablas();}
