/* ===== Control de Prensas — lógica de la app ===== */
'use strict';

/* Base de la API del modulo. Antes era '/api'; al vivir los tres modulos en un
   mismo sitio, cada uno tiene su propio prefijo. Es el UNICO cambio que la
   migracion introduce en este archivo. */
const API = '/prensas/api';

let DATOS = null;          // {meta, lotes, analisis}
let dirty = false;
const today = new Date();

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const num = v => { if(v===''||v==null) return null; const n=parseFloat(String(v).replace(',','.')); return isNaN(n)?null:n; };
const monthOf = s => { if(!s) return null; const d=new Date(s+'T00:00:00'); return isNaN(d)?null:d.getMonth()+1; };
const mesDe = a => (a.mes!=null && a.mes!=='') ? +a.mes : monthOf(a.fecha);
const diasDesde = s => { if(!s) return null; const d=new Date(s+'T00:00:00'); if(isNaN(d)) return null; return Math.round((today-d)/86400000); };
const escA = v => String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const esc = v => String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ---------- REGLAS DE CALIDAD (fuente única del front) ----------
   Deben coincidir con las constantes UMBRAL_* de servidor.py (y reporte.py).
   NO OK si: pH > 4 · AV >= 1 (o AV = -999, inválida) · Gluc/Fruc > 3 · Málico > 0.5
   AV_SALTO viene de shared/reglas-av.js (allí vive la regla y sus tests). */
const REGLAS={PH_MAX:4, AV_MAX:1, AV_INVALIDA:-999, AV_ATENCION:0.85, AV_SALTO, GLUC_MAX:3, MALICO_MAX:0.5, VENCIDO_DIAS:30, PROXIMO_DIAS:21};
const badPH    = v => v!=null && v>REGLAS.PH_MAX;
const badAVhi  = v => v!=null && v>=REGLAS.AV_MAX;
const badAVneg = v => v!=null && v==REGLAS.AV_INVALIDA;
const badAV    = v => badAVhi(v) || badAVneg(v);
const badGluc  = v => v!=null && v>REGLAS.GLUC_MAX;
const badMalico= v => v!=null && v>REGLAS.MALICO_MAX;

const MEAS=['etanol','ph','av','gluc','malico','lactico','at','azucar','so2l','so2t'];
const esSeparador = a => MEAS.every(k=>a[k]==null||a[k]==='');
function mapaLotes(){ const m=new Map(); for(const l of DATOS.lotes) m.set(+l.lote,l); return m; }

const UNIDAD_DEFECTO = {TH2:'g/L', SO2:'ppm'};
const unidadPorTipo = t => UNIDAD_DEFECTO[t] || '';
function nextAgregadoId(){ let mx=0; for(const a of DATOS.agregados){ const n=+a.id; if(!isNaN(n)&&n>mx) mx=n; } return mx+1; }

function markDirty(){ dirty=true; $('btnGuardar').disabled=false; const s=$('status'); s.textContent='● Cambios sin guardar'; s.className='status dirty'; }
function markSaved(){ dirty=false; $('btnGuardar').disabled=true; const s=$('status'); s.textContent='✓ Guardado (v'+DATOS.meta.version+')'; s.className='status saved'; }

window.addEventListener('beforeunload', e => { if(dirty){ e.preventDefault(); e.returnValue=''; } });

/* ---------- usuario (trazabilidad: quién guarda) ---------- */
function usuarioActual(){ try{ return localStorage.getItem('prensas_usuario')||''; }catch(e){ return ''; } }
function pedirUsuario(forzar){
  let u=usuarioActual();
  if(!u||forzar){
    const r=(prompt('¿Quién está usando la app?\n(Queda registrado en cada guardado, para el historial.)', u||'')||'').trim();
    if(r){ u=r; try{ localStorage.setItem('prensas_usuario',u); }catch(e){} }
  }
  $('usuario').textContent='👤 '+(u||'(sin nombre)');
  return u;
}

/* ---------- historial de guardados ---------- */
async function verHistorial(){
  try{
    const r=await fetch(API+'/historial');
    if(!r.ok){ alert('No se pudo cargar el historial ('+r.status+').'); return; }
    const j=await r.json();
    const filas=(j.historial||[]).map(h=>
      `<tr><td class="num">v${esc(h.version)}</td><td style="white-space:nowrap">${esc(h.ts||'')}</td>`+
      `<td>${esc(h.autor||'')}</td><td>${esc(h.resumen||'')}</td></tr>`).join('');
    mostrarOverlay('<h2 style="margin-top:0">🕘 Historial de guardados</h2>'+
      '<p style="color:#8c857b;font-size:12px;margin-top:-6px">Quién guardó, cuándo y qué cambió. Una edición de un análisis cuenta como −1/+1.</p>'+
      '<div style="max-height:60vh;overflow:auto"><table class="hist">'+
      '<thead><tr><th>Versión</th><th>Fecha</th><th>Autor</th><th>Cambios</th></tr></thead>'+
      '<tbody>'+(filas||'<tr><td colspan="4" style="color:#8c857b">Todavía no hay registros: se anotan a partir de ahora, con cada Guardar.</td></tr>')+'</tbody></table></div>'+
      '<div style="margin-top:12px;text-align:right"><button class="btn" onclick="cerrarOverlay()">Cerrar</button></div>');
  }catch(e){ alert('No se pudo cargar el historial.'); }
}
function cerrarOverlay(){ $('overlay').classList.remove('show'); }

/* ---------- API ---------- */
async function cargar(){
  const r = await fetch(API+'/datos'); DATOS = await r.json();
  DATOS.meta = DATOS.meta || {version:0};
  DATOS.degustaciones = DATOS.degustaciones || [];
  DATOS.agregados = DATOS.agregados || [];
  markSaved();
  initMesSelectors();
  initFiltroVariedad();
  initFiltrosLotes();
  initFiltrosAna();
  initFiltrosAgr();
  initFiltrosDeg();
  initFiltrosRiesgo();
  initFiltrosOrden();
  initFiltrosEvo(); initAgrLotes();
  renderActive();
  cargarInfoRed();
  vigilarEstado();
}
/* Guarda la dirección para abrir la app desde el celular u otra PC de la misma
   red (la calcula el servidor) y muestra el botón "Conectar". Si no hay IP de
   red, el botón queda oculto. El QR se arma al tocar el botón. */
let urlRed='';
async function cargarInfoRed(){
  try{
    const r=await fetch(API+'/info'); if(!r.ok) return;
    const j=await r.json(); const ip=(j.ips||[])[0];
    if(!ip) return;
    urlRed='http://'+ip+':'+j.port;
    $('btnConectar').style.display='';
  }catch(e){/* sin red: se omite */}
}
/* Muestra un QR con la dirección de red en el overlay, para escanear desde el
   celular y abrir la app sin tipear la IP. */
function mostrarQR(){
  if(!urlRed) return;
  const qr=qrcode(0,'M'); qr.addData(urlRed); qr.make();
  const svg=qr.createSvgTag({cellSize:6,margin:4,scalable:true});
  mostrarOverlay(
    `<h3 style="margin:0 0 6px">📱 Conectar celular</h3>`+
    `<p style="color:var(--muted);margin:0 0 16px">Escaneá para abrir la app en el celular</p>`+
    `<div style="width:240px;height:240px;margin:0 auto">${svg}</div>`+
    `<div style="margin-top:20px"><button class="btn" onclick="cerrarOverlay()">Cerrar</button></div>`
  );
}
/* Cabecera común de las hojas imprimibles (Orden de muestras, Rellenos, Acción
   Rápida). El título "Orden de Trabajo" es editable y centrado: se guarda en
   ordenTitulos[clave] para que sobreviva al repintado y salga igual en todas
   las hojas. La empresa va en la franja del encabezado, junto al texto RCI. */
const ordenTitulos={muestras:'Orden de Trabajo', rellenos:'Orden de Trabajo', accion:'Orden de Trabajo — Acción Rápida', agregados:'Orden de Trabajo — Agregados'};
function ohTop(){
  return `<div class="oh-top"><span class="oh-empresa">BODEGAS ESMERALDA S.A.</span>`+
    `<span>ORDEN DE TRABAJO - RCI 08 - Rev. 02 &nbsp;·&nbsp; Aprobado por: Roy Urvieta &nbsp;·&nbsp; Emisión: 28/01/2013</span></div>`;
}
function ohTitulo(clave){
  return `<input class="oh-titulo" data-titkey="${clave}" value="${escA(ordenTitulos[clave])}" title="Título editable (clic para cambiar)">`;
}
/* Banner de avisos del servidor: otro servidor activo en la red, versión que
   retrocedió (conflicto OneDrive) o archivos de conflicto junto a datos.json.
   Se consulta al cargar y cada 60 s. */
async function vigilarEstado(){
  try{
    const r=await fetch(API+'/estado'); if(!r.ok) return;
    const j=await r.json(); const el=$('avisos');
    if(j.avisos && j.avisos.length){
      el.innerHTML=j.avisos.map(a=>`<div class="aviso"><b>⚠️ Atención:</b> ${esc(a)}</div>`).join('');
      el.style.display='block';
    } else el.style.display='none';
  }catch(e){/* servidor sin /api/estado o caído: se omite */}
}
async function guardar(forzar){
  if(!dirty) return true;
  DATOS.meta.autor = usuarioActual() || pedirUsuario(true) || 'desconocido';
  let r;
  try{
    r = await fetch(API+'/datos'+(forzar?'?forzar=1':''), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(DATOS)});
  }catch(e){
    alert('No se pudo guardar: el servidor no responde. Revisá que esté abierto (Abrir Prensas.bat) y probá de nuevo. Tus cambios siguen en pantalla.');
    return false;
  }
  if(r.status===400){
    const j=await r.json().catch(()=>({}));
    if(j.error==='validacion'){
      const det=(j.detalles||[]).join('\n• ');
      if(!forzar && confirm('⚠️ El servidor FRENÓ este guardado para proteger los datos:\n\n• '+det+
        '\n\n¿Era tu intención? Aceptar = guardar igual (queda registrado como FORZADO en el historial).\nCancelar = no guardar nada y revisar.')){
        return guardar(true);
      }
      if(forzar) alert('No se pudo guardar:\n• '+det);
      return false;
    }
    alert('Error al guardar: '+(j.error||r.status)); return false;
  }
  if(r.status===409){
    const j = await r.json();
    mostrarOverlay('<h2 style="margin-top:0;color:#ffd766">Conflicto de versión</h2>'+
      '<p style="color:#8c857b">Otra PC guardó cambios mientras editabas. Para no pisar su trabajo, recargá la última versión.</p>'+
      '<p style="color:#ff8a7a;font-size:13px">⚠️ Tus cambios sin guardar se perderán al recargar.</p>'+
      '<button class="btn primary" onclick="location.reload()">🔄 Recargar última versión</button>');
    return false;
  }
  if(!r.ok){ alert('Error al guardar: '+r.status); return false; }
  const j = await r.json();
  DATOS.meta.version = j.version; DATOS.meta.guardado = j.guardado;
  markSaved();
  try{ postGuardarDeg(); }catch(e){}
  if(j.respaldo){ const s=$('status'); s.textContent='✓ Guardado (v'+DATOS.meta.version+') · respaldo: '+j.respaldo+(j.reporte?' · reporte actualizado':''); s.title='Respaldo .md en backups'+(j.reporte?' · '+j.reporte+' actualizado para el jefe (OneDrive)':''); }
  return true;
}
function mostrarOverlay(html){ $('overlayBox').innerHTML=html; $('overlay').classList.add('show'); }

/* ---------- motor de reglas (compartido) ---------- */
function indexarAnalisis(){
  const m = new Map();
  for(const a of DATOS.analisis){ const k=+a.lote; if(!m.has(k)) m.set(k,[]); m.get(k).push(a); }
  return m;
}
function evaluarLotes(mesActual){
  const idx = indexarAnalisis();
  const out = [];
  for(const l of DATOS.lotes){
    if(num(l.litros)===0) continue;   // lote vaciado (0 L): no se analiza más
    const rows = (idx.get(+l.lote)||[]).filter(r=>mesDe(r)!=null);
    const f = {lote:l.lote, variedad:l.variedad, prensa:l.prensa, mes:null, fecha:null,
               ph:null, av:null, gluc:null, malico:null,
               fpH:false, fAVhi:false, fAVneg:false, fAV:false, fGl:false, fMal:false,
               noOk:false, criterios:'', sinMes:false, dias:null, vencido:false, proximo:false, sinAnalisis:rows.length===0};
    if(rows.length){
      const last = rows.reduce((a,b)=> mesDe(b)>=mesDe(a)?b:a);
      f.mes=mesDe(last); f.fecha=last.fecha;
      f.ph=num(last.ph); f.av=num(last.av); f.gluc=num(last.gluc); f.malico=num(last.malico);
      f.fpH = badPH(f.ph);
      f.fAVhi = badAVhi(f.av);
      f.fAVneg = badAVneg(f.av);
      f.fAV = f.fAVhi || f.fAVneg;
      f.fGl = badGluc(f.gluc);
      f.fMal = badMalico(f.malico);
      f.noOk = f.fpH||f.fAV||f.fGl||f.fMal;
      const c=[]; if(f.fpH)c.push('pH'); if(f.fAVhi)c.push('AV'); if(f.fAVneg)c.push('AV (−999)'); if(f.fGl)c.push('Gluc/Fruc'); if(f.fMal)c.push('Málico');
      f.criterios=c.join(', ');
      f.sinMes = !rows.some(r=>mesDe(r)==mesActual);
      f.dias = diasDesde(f.fecha);
      f.vencido = f.dias!=null && f.dias>REGLAS.VENCIDO_DIAS;
      f.proximo = f.dias!=null && f.dias>=REGLAS.PROXIMO_DIAS && f.dias<=REGLAS.VENCIDO_DIAS;
    } else { f.sinMes=true; }
    out.push(f);
  }
  return out;
}
function mesActual(){ return parseInt($('selMes').value,10) || (DATOS.meta.mes_actual||1); }
// Mes elegido en la pestaña de Degustación (independiente del Dashboard).
function mesDeg(){ const el=$('selMesDeg'); return (el&&parseInt(el.value,10)) || (DATOS.meta.mes_actual||1); }

/* ---------- selectores de mes ---------- */
function initMesSelectors(){
  const set=new Set(DATOS.analisis.map(mesDe).filter(m=>m!=null));
  if(DATOS.meta.mes_actual!=null) set.add(+DATOS.meta.mes_actual);
  const meses=[...set].sort((a,b)=>a-b);
  const sel=$('selMes'); sel.innerHTML='';
  for(const m of meses){ const o=document.createElement('option'); o.value=m; o.textContent='Mes '+m; sel.appendChild(o); }
  sel.value = DATOS.meta.mes_actual ?? meses[meses.length-1];
  $('hoy').textContent=today.toLocaleDateString('es-AR');
  initMesDegSelector();
}
// Selector de mes propio de la Degustación: meses con datos (análisis o degustación) + mes actual.
function initMesDegSelector(){
  const sel=$('selMesDeg'); if(!sel) return;
  const prev=parseInt(sel.value,10);
  const set=new Set(DATOS.analisis.map(mesDe).filter(m=>m!=null));
  DATOS.degustaciones.forEach(d=>{ if(d.mes!=null) set.add(+d.mes); });
  if(DATOS.meta.mes_actual!=null) set.add(+DATOS.meta.mes_actual);
  const meses=[...set].sort((a,b)=>a-b);
  sel.innerHTML='';
  for(const m of meses){ const o=document.createElement('option'); o.value=m; o.textContent='Mes '+m; sel.appendChild(o); }
  sel.value = (prev && meses.includes(prev)) ? prev : (DATOS.meta.mes_actual ?? meses[meses.length-1]);
}

/* ===================== DASHBOARD ===================== */
let sortDash={tNoOk:{key:'lote',dir:1}, tVenc:{key:'dias',dir:-1}, tProx:{key:'dias',dir:-1}};

/* Prioridad "atención" para órdenes de muestreo: lote aún OK pero con
   acidez volátil por encima de 0.85 (tendencia a vigilar). El −999 es inválido
   y esos lotes ya son NO OK, así que se excluyen explícitamente. */
function esAtencion(f){ return !f.noOk && f.av!=null && f.av!==REGLAS.AV_INVALIDA && f.av>REGLAS.AV_ATENCION; }

function renderDashboard(){
  const mes=mesActual();
  const filas=evaluarLotes(mes);
  const total=filas.length;
  const conA=filas.filter(f=>!f.sinAnalisis);
  const nook=conA.filter(f=>f.noOk), ok=conA.filter(f=>!f.noOk);
  const sinMes=filas.filter(f=>f.sinMes), venc=conA.filter(f=>f.vencido);
  const prox=conA.filter(f=>f.proximo);
  const sinA=filas.filter(f=>f.sinAnalisis);
  const pct=n=>total?(100*n/total).toFixed(0)+'% del total':'';

  renderDonut([{label:'OK',value:ok.length,color:'#4f9163'},{label:'NO OK',value:nook.length,color:'#c0473b'},{label:'Sin análisis',value:sinA.length,color:'#8c857b'}]);
  renderBars([
    {label:'pH',value:conA.filter(f=>f.fpH).length},{label:'AV≥1',value:conA.filter(f=>f.fAVhi).length},
    {label:'AV −999',value:conA.filter(f=>f.fAVneg).length},{label:'Gluc',value:conA.filter(f=>f.fGl).length},
    {label:'Málico',value:conA.filter(f=>f.fMal).length},{label:'Vencidos',value:venc.length}]);
  renderScatter(conA.filter(f=>f.ph!=null&&f.av!=null&&f.av!=-999));

  $('kTotal').textContent=total; $('kOk').textContent=ok.length; $('kNoOk').textContent=nook.length; $('kSinMes').textContent=sinMes.length;
  $('kProx').textContent=prox.length;
  $('kOkPct').textContent=pct(ok.length); $('kNoOkPct').textContent=pct(nook.length); $('kSinMesPct').textContent='mes '+mes;

  const crit=[['pH','&gt; 4',conA.filter(f=>f.fpH).length],['Acidez Volátil','&ge; 1 g/L',conA.filter(f=>f.fAVhi).length],
    ['AV inválida','= −999',conA.filter(f=>f.fAVneg).length],['Gluc/Fruc','&gt; 3 g/L',conA.filter(f=>f.fGl).length],
    ['Ác. Málico','&gt; 0.5 g/L',conA.filter(f=>f.fMal).length],['Vencidos','&gt; 30 días',venc.length]];
  $('critList').innerHTML=crit.map(([n,l,v])=>`<div class="row"><div class="name">${n}<small>${l}</small></div><div class="val ${v===0?'zero':''}">${v}</div></div>`).join('');

  tablaSimple('tNoOk', nook, [
    {key:'lote',label:'Lote',num:true},{key:'variedad',label:'Variedad'},{key:'mes',label:'Últ. Mes',num:true},
    {key:'fecha',label:'Fecha'},{key:'ph',label:'pH',num:true,bad:f=>f.fpH},{key:'av',label:'AV',num:true,bad:f=>f.fAV},
    {key:'gluc',label:'Gluc/Fruc',num:true,bad:f=>f.fGl},{key:'malico',label:'Málico',num:true,bad:f=>f.fMal},
    {key:'criterios',label:'Criterio fallido',render:f=>`<span class="pill bad">${esc(f.criterios)}</span>`}], sortDash.tNoOk, k=>{toggleSort(sortDash.tNoOk,k);renderDashboard();});
  $('cntNoOk').textContent=nook.length+' lotes';

  tablaSimple('tVenc', venc, [
    {key:'lote',label:'Lote',num:true},{key:'variedad',label:'Variedad'},{key:'mes',label:'Últ. Mes',num:true},
    {key:'fecha',label:'Última fecha'},{key:'dias',label:'Días desde análisis',num:true,render:f=>`<span class="pill warn">${f.dias} d</span>`}],
    sortDash.tVenc, k=>{toggleSort(sortDash.tVenc,k);renderDashboard();});
  $('cntVenc').textContent=venc.length+' lotes';

  tablaSimple('tProx', prox, [
    {key:'lote',label:'Lote',num:true},{key:'variedad',label:'Variedad'},{key:'mes',label:'Últ. Mes',num:true},
    {key:'fecha',label:'Última fecha'},{key:'dias',label:'Días desde análisis',num:true,render:f=>`<span class="pill warn">${f.dias} d</span>`}],
    sortDash.tProx, k=>{toggleSort(sortDash.tProx,k);renderDashboard();});
  $('cntProx').textContent=prox.length+' lotes';

  const ultAgr=[...(DATOS.agregados||[])].sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||''))).slice(0,15)
    .map(a=>{const l=mapaLotes().get(+a.lote); return {fecha:a.fecha,lote:a.lote,variedad:l?l.variedad:'',tipo:a.tipo,cantidad:a.cantidad,unidad:a.unidad};});
  tablaSimple('tUltAgr', ultAgr, [
    {key:'fecha',label:'Fecha'},{key:'lote',label:'Lote',num:true},{key:'variedad',label:'Variedad'},
    {key:'tipo',label:'Tipo'},{key:'cantidad',label:'Cantidad',num:true},{key:'unidad',label:'Unidad'}],
    {key:'fecha',dir:-1}, ()=>{});
  $('cntUltAgr').textContent=(DATOS.agregados||[]).length+' en total';
}
function toggleSort(st,k){ if(st.key===k) st.dir*=-1; else {st.key=k; st.dir=1;} }
function sortRows(rows,st){ return [...rows].sort((a,b)=>{let x=a[st.key],y=b[st.key]; if(x==null)return 1; if(y==null)return -1; if(typeof x==='string'&&typeof y==='string')return st.dir*x.localeCompare(y); return st.dir*(x-y);}); }
function tablaSimple(id,rows,cols,st,onSort){
  const sorted=sortRows(rows,st);
  let h='<thead><tr>'+cols.map(c=>{const ar=st.key===c.key?`<span class="arrow">${st.dir>0?'▲':'▼'}</span>`:''; return `<th data-k="${c.key}" class="${c.num?'num':''}">${c.label}${ar}</th>`;}).join('')+'</tr></thead>';
  h+='<tbody>'+sorted.map(f=>'<tr>'+cols.map(c=>{let v=c.render?c.render(f):(f[c.key]==null?'—':f[c.key]); const cl=(c.num?'num ':'')+(c.bad&&c.bad(f)?'val-bad':''); return `<td class="${cl}">${v}</td>`;}).join('')+'</tr>').join('')+'</tbody>';
  const t=$(id); t.innerHTML=h;
  t.querySelectorAll('th').forEach(th=>th.onclick=()=>onSort(th.dataset.k));
}

/* ---------- gráficos SVG ---------- */
function renderDonut(segs){
  const total=segs.reduce((s,x)=>s+x.value,0)||1, r=54,C=2*Math.PI*r,cx=70,cy=70; let off=0;
  const arcs=segs.map(s=>{const len=s.value/total*C; const el=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="22" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"></circle>`; off+=len; return el;}).join('');
  const svg=`<svg viewBox="0 0 140 140" width="140" height="140">${arcs}<text x="${cx}" y="${cy-2}" text-anchor="middle" fill="#2a2622" font-size="26" font-weight="700">${total}</text><text x="${cx}" y="${cy+16}" text-anchor="middle" fill="#8c857b" font-size="10">lotes</text></svg>`;
  const lg=segs.map(s=>`<div class="lg"><span class="dot" style="background:${s.color}"></span>${s.label} <b style="margin-left:auto">${s.value}</b></div>`).join('');
  $('chDonut').innerHTML=`<div class="donut-wrap">${svg}<div class="legend">${lg}</div></div>`;
}
function renderBars(items){
  const max=Math.max(1,...items.map(i=>i.value)), rowH=28,w=300,labelW=64,barMax=w-labelW-34;
  const rows=items.map((i,idx)=>{const bw=i.value/max*barMax,y=idx*rowH,color=i.value===0?'#ddd6c8':'#b07d2c';
    return `<text x="0" y="${y+rowH/2+4}" fill="#8c857b" font-size="11">${i.label}</text><rect x="${labelW}" y="${y+6}" width="${bw}" height="${rowH-14}" rx="3" fill="${color}"></rect><text x="${labelW+bw+6}" y="${y+rowH/2+4}" fill="#2a2622" font-size="11" font-weight="600">${i.value}</text>`;}).join('');
  $('chBars').innerHTML=`<svg viewBox="0 0 ${w} ${items.length*rowH+6}" width="100%" height="${items.length*rowH+6}">${rows}</svg>`;
}
function renderScatter(pts){
  const W=300,H=230,m={l:40,r:14,t:14,b:34}; const xs=pts.map(p=>p.ph),ys=pts.map(p=>p.av);
  const xmin=Math.min(3,...xs),xmax=Math.max(4.3,...xs),ymin=0,ymax=Math.max(1.3,...ys);
  const sx=v=>m.l+(v-xmin)/(xmax-xmin)*(W-m.l-m.r), sy=v=>H-m.b-(v-ymin)/(ymax-ymin)*(H-m.t-m.b);
  let g=`<rect x="${m.l}" y="${m.t}" width="${W-m.l-m.r}" height="${H-m.t-m.b}" fill="none" stroke="#e0dacd"/>`;
  const vx=sx(4),hy=sy(1);
  g+=`<line x1="${vx}" y1="${m.t}" x2="${vx}" y2="${H-m.b}" stroke="#c0473b" stroke-width="1" stroke-dasharray="4 3"/><line x1="${m.l}" y1="${hy}" x2="${W-m.r}" y2="${hy}" stroke="#c0473b" stroke-width="1" stroke-dasharray="4 3"/>`;
  g+=`<text x="${vx+3}" y="${m.t+10}" fill="#c0473b" font-size="9">pH 4</text><text x="${W-m.r-3}" y="${hy-3}" fill="#c0473b" font-size="9" text-anchor="end">AV 1</text>`;
  g+=`<text x="${m.l}" y="${H-m.b+12}" fill="#8c857b" font-size="9" text-anchor="middle">${xmin.toFixed(1)}</text><text x="${W-m.r}" y="${H-m.b+12}" fill="#8c857b" font-size="9" text-anchor="middle">${xmax.toFixed(1)}</text>`;
  g+=`<text x="${m.l-4}" y="${H-m.b+3}" fill="#8c857b" font-size="9" text-anchor="end">0</text><text x="${m.l-4}" y="${m.t+8}" fill="#8c857b" font-size="9" text-anchor="end">${ymax.toFixed(1)}</text>`;
  g+=pts.map(p=>`<circle cx="${sx(p.ph).toFixed(1)}" cy="${sy(p.av).toFixed(1)}" r="3" fill="${p.noOk?'#c0473b':'#4f9163'}" fill-opacity="0.7"/>`).join('');
  g+=`<text x="${(m.l+W-m.r)/2}" y="${H-2}" fill="#8c857b" font-size="10" text-anchor="middle">pH</text><text x="11" y="${(m.t+H-m.b)/2}" fill="#8c857b" font-size="10" text-anchor="middle" transform="rotate(-90 11 ${(m.t+H-m.b)/2})">AV (g/L)</text>`;
  $('chScatter').innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${g}</svg>`;
}

/* ===================== TABLAS EDITABLES ===================== */
const COLS_LOTES=[
  {k:'lote',label:'Lote',num:true},{k:'variedad',label:'Variedad'},{k:'origen',label:'Lote de Origen',num:true},
  {k:'ig',label:'IG'},{k:'id_origen',label:'ID Lote de Origen'},{k:'ot_prensado',label:'OT prensado'},
  {k:'litros',label:'Litros',num:true},{k:'dia_prensado',label:'Día prensado',date:true},
  {k:'_dias',label:'Días prensado',ro:true,num:true,compute:l=>diasDesde(l.dia_prensado)},
  {k:'prensa',label:'Prensa'},{k:'so2_agregado',label:'SO2 agregado'},
  {k:'comentario',label:'Comentario'},{k:'accion',label:'Acción'},{k:'comentario2',label:'Comentario 2'},{k:'accion2',label:'Acción 2'}];
const COLS_ANA=[
  {k:'lote',label:'Lote',num:true},{k:'mes',label:'Mes',ro:true,num:true,compute:a=>mesDe(a)},
  {k:'fecha',label:'Fecha',date:true,derivaMes:true},{k:'etanol',label:'Etanol',num:true},
  {k:'ph',label:'pH',num:true,bad:o=>badPH(num(o.ph))},
  {k:'av',label:'AV',num:true,bad:o=>badAV(num(o.av))},
  {k:'gluc',label:'Gluc/Fruc',num:true,bad:o=>badGluc(num(o.gluc))},
  {k:'malico',label:'Málico',num:true,bad:o=>badMalico(num(o.malico))},
  {k:'lactico',label:'Láctico',num:true},{k:'at',label:'AT',num:true},{k:'azucar',label:'Azúcar Red',num:true},
  {k:'so2l',label:'SO2 L',num:true},{k:'so2t',label:'SO2 T',num:true},{k:'ot',label:'OT n°'}];

let sortLotes={key:'lote',dir:1}, sortAna={key:'lote',dir:1};
let filtAna={};
const fltCfgAna={state:filtAna, onChange:()=>renderAnalisis(), _active:null};
const COLS_AGR=[
  {k:'lote',label:'Lote',num:true},
  {k:'_variedad',label:'Variedad',ro:true,compute:a=>{const l=mapaLotes().get(+a.lote);return l?(l.variedad||''):'';}},
  {k:'fecha',label:'Fecha',date:true},
  {k:'tipo',label:'Tipo'},
  {k:'cantidad',label:'Cantidad',num:true},
  {k:'unidad',label:'Unidad'}];
let sortAgr={key:'fecha',dir:-1};
let filtAgr={};
const fltCfgAgr={state:filtAgr, onChange:()=>renderAgregados(), _active:null};

function valCol(o,c){ return c.compute?c.compute(o):o[c.k]; }
function pasaFiltros(o, cols, state){
  for(const c of cols){
    const f=state[c.k]; if(!f) continue;
    if(c.num){
      const raw=valCol(o,c); const v=(raw===''||raw==null)?null:parseFloat(String(raw).replace(',','.'));
      if(f.min!=null&&f.min!==''){ const mn=parseFloat(String(f.min).replace(',','.')); if(!isNaN(mn)&&(v==null||v<mn)) return false; }
      if(f.max!=null&&f.max!==''){ const mx=parseFloat(String(f.max).replace(',','.')); if(!isNaN(mx)&&(v==null||v>mx)) return false; }
    } else if(c.date){
      const v=valCol(o,c)||'';
      if(f.min){ if(!v||v<f.min) return false; }
      if(f.max){ if(!v||v>f.max) return false; }
    } else {
      if(f.txt){ const v=String(valCol(o,c)??'').toLowerCase(); if(!v.includes(String(f.txt).toLowerCase())) return false; }
    }
  }
  return true;
}

function tablaEditable(id, cols, rows, sort, onSort, onDel, rowClass, flt){
  const t=$(id); t._rows=rows; t._cols=cols;
  let h='<thead><tr>'+cols.map(c=>{const ar=sort.key===c.k?`<span class="arrow">${sort.dir>0?'▲':'▼'}</span>`:''; return `<th data-k="${c.k}" class="${c.num?'num':''}">${c.label}${ar}</th>`;}).join('')+'<th></th></tr>';
  if(flt){
    h+='<tr class="fltrow">'+cols.map(c=>{
      const st=flt.state[c.k]||{};
      if(c.num) return `<th><div class="fltcell"><input data-flt="${c.k}" data-role="min" placeholder="mín" value="${escA(st.min||'')}"><input data-flt="${c.k}" data-role="max" placeholder="máx" value="${escA(st.max||'')}"></div></th>`;
      if(c.date) return `<th><div class="fltcell"><input type="date" data-flt="${c.k}" data-role="min" value="${escA(st.min||'')}"><input type="date" data-flt="${c.k}" data-role="max" value="${escA(st.max||'')}"></div></th>`;
      return `<th><div class="fltcell"><input data-flt="${c.k}" data-role="txt" placeholder="filtrar" value="${escA(st.txt||'')}"></div></th>`;
    }).join('')+'<th><button class="fltclear" title="Limpiar filtros de columna">✕</button></th></tr>';
  }
  h+='</thead>';
  let tb='<tbody>';
  rows.forEach((o,ri)=>{
    const rc = rowClass ? (rowClass(o)||'') : '';
    tb+=`<tr class="${rc}">`;
    for(const c of cols){
      if(c.ro){ const v=c.compute?c.compute(o):o[c.k]; tb+=`<td class="ro ${c.num?'num':''}">${v==null?'':v}</td>`; }
      else { const v=o[c.k]==null?'':o[c.k]; const bad=c.bad&&c.bad(o)?'bad2':''; tb+=`<td><input class="cell ${c.num?'num':''} ${bad}" type="${c.date?'date':'text'}" data-row="${ri}" data-k="${c.k}" value="${escA(v)}"></td>`; }
    }
    tb+=`<td><button class="rowbtn" data-del="${ri}" title="Eliminar">✕</button></td></tr>`;
  });
  tb+='</tbody>'; t.innerHTML=h+tb;
  t.querySelectorAll('th[data-k]').forEach(th=>th.onclick=()=>onSort(th.dataset.k));
  if(flt){
    const hr=t.querySelector('thead tr'); if(hr) t.style.setProperty('--hh', hr.offsetHeight+'px');
    t.querySelectorAll('input[data-flt]').forEach(inp=>{
      inp.addEventListener('input',()=>{
        const k=inp.dataset.flt, role=inp.dataset.role;
        const st=flt.state[k]||(flt.state[k]={});
        st[role]=inp.value;
        if(!st.min&&!st.max&&!st.txt) delete flt.state[k];
        flt._active={k,role,sel:(()=>{try{return inp.selectionStart;}catch(e){return null;}})()};
        flt.onChange();
      });
    });
    const cb=t.querySelector('.fltclear'); if(cb) cb.onclick=()=>{ Object.keys(flt.state).forEach(kk=>delete flt.state[kk]); flt._active=null; flt.onChange(); };
    if(flt._active){
      const inp=t.querySelector(`input[data-flt="${flt._active.k}"][data-role="${flt._active.role}"]`);
      if(inp){ inp.focus(); try{ if(flt._active.sel!=null) inp.setSelectionRange(flt._active.sel,flt._active.sel); }catch(e){} }
    }
  }
  if(!t._wired){
    t._wired=true;
    t.addEventListener('input',e=>{ const inp=e.target.closest('input.cell'); if(!inp)return;
      const o=t._rows[+inp.dataset.row], c=t._cols.find(x=>x.k===inp.dataset.k);
      o[inp.dataset.k]= c.num ? num(inp.value) : (inp.value===''?null:inp.value);
      if(c.derivaMes){ o.mes=monthOf(inp.value); }
      markDirty();
    });
    t.addEventListener('click',e=>{ const b=e.target.closest('[data-del]'); if(!b)return; onDel(t._rows[+b.dataset.del]); });
  }
}

/* ===================== FILTROS MULTI-SELECT (genérico) ===================== */
const VACIO_LBL='(vacío)';
function normVal(v){ return (v==null||String(v).trim()==='')?'':String(v).trim(); }
function cmpValores(a,b){
  if(a===b) return 0;
  if(a==='') return -1; if(b==='') return 1;
  const na=parseFloat(a.replace(',','.')), nb=parseFloat(b.replace(',','.'));
  const aNum=!isNaN(na)&&/^[\d.,]+$/.test(a), bNum=!isNaN(nb)&&/^[\d.,]+$/.test(b);
  if(aNum&&bNum) return na-nb;
  return a.localeCompare(b,'es');
}
// mapa de lotes por render (evita recomputar por fila en los match)
let _lm=null;
function lmRefresh(){ _lm=mapaLotes(); return _lm; }
function loteDe(row){ return (_lm||lmRefresh()).get(+row.lote)||{}; }
// opciones {val,text} a partir de valores distintos de un conjunto de filas
function opcionesValores(rows, valorDe){
  return [...new Set(rows.map(r=>normVal(valorDe(r))))].sort(cmpValores).map(v=>({val:v, text:(v===''?VACIO_LBL:v)}));
}
function matchValor(valorDe){ return (row,set)=>set.has(normVal(valorDe(row))); }
// componente puro de UI
function crearFiltroMulti(cfg){
  const {label,set}=cfg;
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
  let opts=[];   // {val, text, li, cb}
  function build(){
    list.innerHTML=''; opts=[];
    for(const o of cfg.opciones()){
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
    todasCb.checked=vis.length>0 && vis.every(o=>o.cb.checked);
  }
  function sync(){ opts.forEach(o=>o.cb.checked=set.has(o.val)); actualizar(); }
  search.addEventListener('input',()=>{ const q=search.value.toLowerCase().trim();
    opts.forEach(o=>{ o.li.classList.toggle('hide', !!q&&!o.text.toLowerCase().includes(q)); });
    actualizar();
  });
  todasCb.addEventListener('change',()=>{ const vis=opts.filter(o=>!o.li.classList.contains('hide'));
    vis.forEach(o=>{ o.cb.checked=todasCb.checked; if(todasCb.checked) set.add(o.val); else set.delete(o.val); });
    actualizar(); cfg.onChange();
  });
  limpiar.addEventListener('click',()=>{ set.clear(); sync(); cfg.onChange(); });
  btn.addEventListener('click',(e)=>{ e.stopPropagation();
    const abierto=panel.classList.contains('open');
    document.querySelectorAll('.mfilt-panel.open').forEach(p=>p.classList.remove('open'));
    if(!abierto){ panel.classList.add('open'); search.value=''; opts.forEach(o=>o.li.classList.remove('hide')); actualizar(); search.focus(); }
  });
  panel.addEventListener('click',e=>e.stopPropagation());
  build(); actualizar();
  return { el:wrap, sync, rebuild:()=>{ build(); actualizar(); } };
}
// helpers genéricos
function initFiltrosMulti(barId, descriptores, onChange){
  const bar=$(barId); if(!bar) return [];
  bar.innerHTML=''; const inst=[];
  for(const d of descriptores){
    const f=crearFiltroMulti({label:d.label, opciones:d.opciones, set:d.set, onChange});
    bar.appendChild(f.el); inst.push(f);
  }
  return inst;
}
function pasaMulti(row, descriptores){
  for(const d of descriptores){ if(d.set.size){ if(!d.match(row,d.set)) return false; } }
  return true;
}
function limpiarFiltros(descriptores, buscadorId, instancias, onChange){
  descriptores.forEach(d=>d.set.clear());
  if(buscadorId){ const b=$(buscadorId); if(b) b.value=''; }
  instancias.forEach(f=>f.sync());
  onChange();
}

/* ---- Lotes ---- */
const CAMPOS_FLT_LOTES=[
  {campo:'lote',label:'Lote'},
  {campo:'variedad',label:'Variedad'},
  {campo:'origen',label:'Lote de Origen'},
  {campo:'ig',label:'IG'},
  {campo:'id_origen',label:'ID de Origen'},
  {campo:'prensa',label:'Prensa'},
];
const filtLotes={}; CAMPOS_FLT_LOTES.forEach(c=>filtLotes[c.campo]=new Set());
let _descLotes=[], _instLotes=[];
function initFiltrosLotes(){
  _descLotes=CAMPOS_FLT_LOTES.map(c=>({
    label:c.label, set:filtLotes[c.campo],
    opciones:()=>opcionesValores(DATOS.lotes, l=>l[c.campo]),
    match:matchValor(l=>l[c.campo]),
  }));
  _instLotes=initFiltrosMulti('fltLotesBar', _descLotes, renderLotes);
}
function limpiarFiltrosLotes(){ limpiarFiltros(_descLotes,'buscaLotes',_instLotes,renderLotes); }
function pasaFiltrosLotes(l){ return pasaMulti(l, _descLotes); }

function renderLotes(){
  const q=($('buscaLotes').value||'').toLowerCase().trim();
  let rows=DATOS.lotes;
  if(q) rows=rows.filter(l=>[l.lote,l.variedad,l.origen,l.ig,l.id_origen,l.ot_prensado].some(v=>v!=null&&String(v).toLowerCase().includes(q)));
  rows=rows.filter(pasaFiltrosLotes);
  rows=sortRows(rows,sortLotes);
  // mapa de evaluación por lote para resaltar críticos / vencidos
  const evalMap=new Map(); evaluarLotes(mesActual()).forEach(f=>evalMap.set(+f.lote,f));
  const rc=o=>{const f=evalMap.get(+o.lote); if(!f)return ''; if(f.noOk)return 'crit'; if(f.vencido)return 'venc'; return '';};
  tablaEditable('tLotes',COLS_LOTES,rows,sortLotes,k=>{toggleSort(sortLotes,k);renderLotes();},o=>{
    if(confirm('¿Eliminar el lote '+o.lote+'?')){ DATOS.lotes.splice(DATOS.lotes.indexOf(o),1); markDirty(); renderLotes(); }}, rc);
  $('lotesCount').textContent=rows.length+' / '+DATOS.lotes.length+' lotes';
}
function initFiltroVariedad(){
  const vars=[...new Set(DATOS.lotes.map(l=>(l.variedad||'').trim()).filter(v=>v))].sort();
  const opts='<option value="">Todas</option>'+vars.map(v=>`<option value="${escA(v)}">${esc(v)}</option>`).join('');
  document.querySelectorAll('select.fvar').forEach(sel=>{ const cur=sel.value; sel.innerHTML=opts; sel.value=cur; });
}
const filtAnaM={lote:new Set(),variedad:new Set(),prensa:new Set(),mes:new Set(),mostrar:new Set()};
let _descAna=[], _instAna=[];
function anaEsNook(a){ return badPH(num(a.ph))||badAV(num(a.av))||badGluc(num(a.gluc))||badMalico(num(a.malico)); }
function initFiltrosAna(){
  _descAna=[
    {label:'Lote', set:filtAnaM.lote,
     opciones:()=>opcionesValores(DATOS.analisis, a=>a.lote),
     match:matchValor(a=>a.lote)},
    {label:'Variedad', set:filtAnaM.variedad,
     opciones:()=>{ lmRefresh(); return opcionesValores(DATOS.analisis, a=>loteDe(a).variedad); },
     match:matchValor(a=>loteDe(a).variedad)},
    {label:'Prensa', set:filtAnaM.prensa,
     opciones:()=>{ lmRefresh(); return opcionesValores(DATOS.analisis, a=>loteDe(a).prensa); },
     match:matchValor(a=>loteDe(a).prensa)},
    {label:'Mes', set:filtAnaM.mes,
     opciones:()=>opcionesValores(DATOS.analisis, a=>mesDe(a)),
     match:matchValor(a=>mesDe(a))},
    {label:'Mostrar', set:filtAnaM.mostrar,
     opciones:()=>[{val:'con',text:'Con análisis'},{val:'sep',text:'Separador'},{val:'nook',text:'NO OK'}],
     match:(a,set)=>((set.has('con')&&!esSeparador(a))||(set.has('sep')&&esSeparador(a))||(set.has('nook')&&anaEsNook(a)))},
  ];
  _instAna=initFiltrosMulti('fltAnaBar', _descAna, renderAnalisis);
}
function limpiarFiltrosAna(){ limpiarFiltros(_descAna,'buscaAna',_instAna,renderAnalisis); }

function renderAnalisis(){
  const q=($('buscaAna').value||'').toLowerCase().trim();
  lmRefresh();
  let rows=DATOS.analisis;
  if(q) rows=rows.filter(a=>String(a.lote||'').toLowerCase().includes(q));
  rows=rows.filter(a=>pasaMulti(a,_descAna));
  rows=rows.filter(a=>pasaFiltros(a,COLS_ANA,filtAna));
  rows=sortRows(rows,sortAna);
  const rc=o=>esSeparador(o)?'sep':'';
  tablaEditable('tAna',COLS_ANA,rows,sortAna,k=>{toggleSort(sortAna,k);renderAnalisis();},o=>{
    if(confirm('¿Eliminar este análisis del lote '+o.lote+'?')){ DATOS.analisis.splice(DATOS.analisis.indexOf(o),1); markDirty(); renderAnalisis(); }}, rc, fltCfgAna);
  $('anaCount').textContent=rows.length+' / '+DATOS.analisis.length+' análisis';
}

const filtAgrM={variedad:new Set(),prensa:new Set(),tipo:new Set()};
let _descAgr=[], _instAgr=[];
function initFiltrosAgr(){
  _descAgr=[
    {label:'Variedad', set:filtAgrM.variedad,
     opciones:()=>{ lmRefresh(); return opcionesValores(DATOS.agregados, a=>loteDe(a).variedad); },
     match:matchValor(a=>loteDe(a).variedad)},
    {label:'Prensa', set:filtAgrM.prensa,
     opciones:()=>{ lmRefresh(); return opcionesValores(DATOS.agregados, a=>loteDe(a).prensa); },
     match:matchValor(a=>loteDe(a).prensa)},
    {label:'Tipo', set:filtAgrM.tipo,
     opciones:()=>opcionesValores(DATOS.agregados, a=>a.tipo),
     match:matchValor(a=>a.tipo)},
  ];
  _instAgr=initFiltrosMulti('fltAgrBar', _descAgr, renderAgregados);
}
function limpiarFiltrosAgr(){ limpiarFiltros(_descAgr,'buscaAgr',_instAgr,renderAgregados); }

function agregadosFiltrados(){
  const q=($('buscaAgr').value||'').toLowerCase().trim();
  lmRefresh();
  let rows=DATOS.agregados;
  if(q) rows=rows.filter(a=>String(a.lote||'').toLowerCase().includes(q));
  rows=rows.filter(a=>pasaMulti(a,_descAgr));
  rows=rows.filter(a=>pasaFiltros(a,COLS_AGR,filtAgr));
  return sortRows(rows,sortAgr);
}
function renderAgregados(){
  const rows=agregadosFiltrados();
  tablaEditable('tAgr',COLS_AGR,rows,sortAgr,k=>{toggleSort(sortAgr,k);renderAgregados();},o=>{
    if(confirm('¿Eliminar este agregado del lote '+o.lote+'?')){ DATOS.agregados.splice(DATOS.agregados.indexOf(o),1); markDirty(); renderAgregados(); }}, null, fltCfgAgr);
  $('agrCount').textContent=rows.length+' / '+DATOS.agregados.length+' agregados';
}
/* ---- Orden de trabajo de Agregados (imprimible, transitoria) ---- */
let agrOrdenRows=[];
const AGR_ORD_PER_PAGE=35;
const AGR_TIPO_LABEL={TH2:'TH2 (ác. tartárico)', SO2:'SO2 (anh. sulfuroso)', Otro:'Otro'};
const AGR_TIPO_ORDEN={TH2:0, SO2:1, Otro:2};
function agrOrdNuevaFila(tipo, lote, cantidad, unidad, ml){
  const t=normalizarTipoAgr(tipo)||'Otro';
  const m=ml||mapaLotes();
  return {tipo:t, lote:(lote==null?'':lote),
    variedad:(m.get(+lote)||{}).variedad||'',
    cantidad:(cantidad==null?'':cantidad),
    unidad:(unidad!=null&&unidad!==''?unidad:unidadPorTipo(t)),
    obs:''};
}
function agrOrdAppend(filas){
  agrOrdenRows.push(...filas);
  agrOrdenRows.sort((x,y)=>(AGR_TIPO_ORDEN[x.tipo]-AGR_TIPO_ORDEN[y.tipo])||((+x.lote)-(+y.lote)));
  pintarAgrOrden();
}
function agrOrdAgregarFiltrados(){
  const ml=mapaLotes();
  agrOrdAppend(agregadosFiltrados().map(a=>agrOrdNuevaFila(a.tipo, a.lote, a.cantidad, a.unidad, ml)));
}
function agrOrdAgregarManual(){
  const lote=($('agrOrdLote').value||'').trim();
  if(!lote){ $('agrOrdLote').focus(); return; }
  agrOrdAppend([agrOrdNuevaFila($('agrOrdTipo').value, lote, ($('agrOrdCant').value||'').trim())]);
  $('agrOrdLote').value=''; $('agrOrdCant').value=''; $('agrOrdLote').focus();
}
function agrOrdAgregarPegados(){
  const txt=$('agrOrdPaste').value||'';
  const lines=txt.replace(/\r/g,'').split('\n').filter(l=>l.trim()!=='');
  const celdasDe=line=>line.includes('\t')?line.split('\t'):line.split(/[,;]/);
  const ml=mapaLotes(), filas=[];
  for(const line of lines){
    const c=celdasDe(line);
    const lote=(c[0]!=null?c[0].trim():'');
    if(!/^\d+$/.test(lote)) continue;   // salta encabezados / líneas sin lote numérico
    filas.push(agrOrdNuevaFila((c[1]!=null?c[1].trim():''), lote, (c[2]!=null?c[2].trim():''), undefined, ml));
  }
  agrOrdAppend(filas);
  $('agrOrdPaste').value='';
  $('agrOrdPasteMsg').textContent=filas.length+' filas agregadas';
}
function agrOrdVaciar(){ agrOrdenRows=[]; pintarAgrOrden(); }
function agrOrdFilaHTML(r, gi){
  return `<tr>`+
    `<td class="c oh-check"></td>`+
    `<td class="c"><input class="agr-ord-cell c" data-gi="${gi}" data-f="lote" value="${escA(r.lote)}" style="text-align:center"></td>`+
    `<td><input class="agr-ord-cell" data-gi="${gi}" data-f="variedad" value="${escA(r.variedad)}"></td>`+
    `<td class="c"><input class="agr-ord-cell c" data-gi="${gi}" data-f="cantidad" value="${escA(r.cantidad)}" style="text-align:center"></td>`+
    `<td class="c"><input class="agr-ord-cell c" data-gi="${gi}" data-f="unidad" value="${escA(r.unidad)}" style="text-align:center"></td>`+
    `<td><input class="agr-ord-cell" data-gi="${gi}" data-f="obs" value="${escA(r.obs)}"></td>`+
    `<td class="delcol c"><button class="delrow" data-agrorddel="${gi}" title="Eliminar fila">✕</button></td>`+
  `</tr>`;
}
function pintarAgrOrden(){
  $('agrOrdCount').textContent=agrOrdenRows.length+' agregados';
  const fechaISO=$('agrOrdFecha').value, p=fechaISO.split('-');
  const fechaTxt=p.length===3?`${p[2]}/${p[1]}/${p[0]}`:fechaISO;
  const nro=esc($('agrOrdNro').value||''), emitio=esc($('agrOrdEmitio').value||''), recibio=esc($('agrOrdRecibio').value||'');
  const thead=`<thead><tr><th class="c oh-check">Check</th><th class="c">Lote</th><th>Variedad</th><th class="c">Cantidad</th><th class="c">Unidad</th><th>Observaciones</th><th class="delcol"></th></tr></thead>`;
  const pages=Math.max(1,Math.ceil(agrOrdenRows.length/AGR_ORD_PER_PAGE));
  let html='';
  for(let pg=0; pg<pages; pg++){
    const start=pg*AGR_ORD_PER_PAGE, slice=agrOrdenRows.slice(start,start+AGR_ORD_PER_PAGE);
    let cuerpo='';
    if(!slice.length){
      cuerpo=`<table>${thead}<tbody><tr><td colspan="7" class="c" style="padding:18px">Agregá lotes con el formulario de arriba, pegá una lista, o usá "Agregar filtrados".</td></tr></tbody></table>`;
    } else {
      let lastTipo=null, filas='';
      slice.forEach((r,i)=>{ const gi=start+i;
        if(r.tipo!==lastTipo){
          if(filas){ cuerpo+=`<table>${thead}<tbody>${filas}</tbody></table>`; filas=''; }
          cuerpo+=`<div class="oh-banda"><span>${esc(AGR_TIPO_LABEL[r.tipo]||r.tipo)}</span></div>`;
          lastTipo=r.tipo;
        }
        filas+=agrOrdFilaHTML(r,gi);
      });
      if(filas) cuerpo+=`<table>${thead}<tbody>${filas}</tbody></table>`;
    }
    html+=`<div class="orden-hoja">`+
      ohTop()+
      ohTitulo('agregados')+
      `<div class="oh-meta"><span><b>Fecha:</b> ${fechaTxt}</span><span><b>N° de Orden:</b> ${nro}</span></div>`+
      cuerpo+
      `<div class="oh-pie"><div class="firma"><b>Emitió:</b> ${emitio} &nbsp;&nbsp; Firma:</div><div class="firma"><b>Recibió:</b> ${recibio} &nbsp;&nbsp; Firma:</div></div>`+
      `<div class="oh-hoja-num">Hoja ${pg+1} de ${pages}</div>`+
    `</div>`;
  }
  $('agrOrdenPaginas').innerHTML=html;
}

/* ===================== ALTO RIESGO ===================== */

/* Un análisis es de riesgo si (málico>0.5 y AV>0.85) o gluc/fruc>3.
   AV=−999 es inválido y no es >0.85, así que no cuenta para el par málico+AV.
   La INCLUSIÓN del lote se decide solo sobre el ÚLTIMO análisis; el penúltimo
   se muestra únicamente como referencia de tendencia.
   Segundo criterio de inclusión: un salto de AV >= 0.3 g/L respecto del análisis
   anterior (ver saltoAV en shared/reglas-av.js). Entra aunque el AV siga bajo el
   NO OK, que es justo el caso que se escapaba: subida rápida todavía en rango. */
function cumpleRiesgo(a){
  if(!a) return false;
  const av=num(a.av), mal=num(a.malico), gl=num(a.gluc);
  const malAv = badMalico(mal) && (av!=null&&av>REGLAS.AV_ATENCION);
  const glAlto = badGluc(gl);
  return malAv||glAlto;
}
function motivosRiesgo(a){
  if(!cumpleRiesgo(a)) return [];
  const av=num(a.av), mal=num(a.malico), gl=num(a.gluc), m=[];
  if(badMalico(mal)&&(av!=null&&av>REGLAS.AV_ATENCION)) m.push('Málico+AV');
  if(badGluc(gl)) m.push('Gluc/Fruc');
  return m;
}
function evaluarRiesgo(){
  const idx=indexarAnalisis(), out=[];
  for(const l of DATOS.lotes){
    if(num(l.litros)===0) continue;
    let rows=(idx.get(+l.lote)||[]).filter(r=>mesDe(r)!=null && !esSeparador(r));
    if(!rows.length) continue;
    rows=rows.slice().sort((a,b)=>(mesDe(a)-mesDe(b))||String(a.fecha||'').localeCompare(String(b.fecha||'')));
    const ult=rows[rows.length-1], pen=rows.length>1?rows[rows.length-2]:null;
    const salto=saltoAV(rows, REGLAS.AV_SALTO);      // subida rápida de volátil
    if(!cumpleRiesgo(ult) && !salto) continue;       // inclusión: último análisis o salto de AV
    const motivos=motivosRiesgo(ult);
    /* Se muestran ambos valores porque al puentear un −999 la referencia del
       salto puede NO ser la fila "Penúlt." que se ve arriba. */
    if(salto) motivos.push(`Salto AV +${salto.delta.toFixed(2)} (${salto.avAnt}→${salto.avAct})`);
    out.push({lote:l.lote, variedad:l.variedad, prensa:l.prensa, ult, pen, salto,
              motivo: motivos.join(', ')});
  }
  return out;
}
/* Tabla de dos filas por lote: penúltimo (referencia) arriba, último abajo.
   Lote/Variedad/Prensa/Motivo van con rowspan; las celdas fuera de criterio se
   resaltan en ambas filas (AV>0.85, Málico>0.5, Gluc/Fruc>3). */
const filtRiesgoM={variedad:new Set(),prensa:new Set()};
let _descRiesgo=[], _instRiesgo=[];
function initFiltrosRiesgo(){
  _descRiesgo=[
    {label:'Variedad', set:filtRiesgoM.variedad,
     opciones:()=>opcionesValores(DATOS.lotes, l=>l.variedad),
     match:matchValor(f=>f.variedad)},
    {label:'Prensa', set:filtRiesgoM.prensa,
     opciones:()=>opcionesValores(DATOS.lotes, l=>l.prensa),
     match:matchValor(f=>f.prensa)},
  ];
  _instRiesgo=initFiltrosMulti('fltRiesgoBar', _descRiesgo, renderRiesgo);
}
function limpiarFiltrosRiesgo(){ limpiarFiltros(_descRiesgo,'buscaRiesgo',_instRiesgo,renderRiesgo); }

function renderRiesgo(){
  const q=($('buscaRiesgo').value||'').toLowerCase().trim();
  let filas=evaluarRiesgo();
  if(q) filas=filas.filter(f=>String(f.lote||'').toLowerCase().includes(q));
  filas=filas.filter(f=>pasaMulti(f,_descRiesgo));
  filas.sort((a,b)=>(+a.lote)-(+b.lote));
  const avBad=v=>v!=null&&v>REGLAS.AV_ATENCION, malBad=badMalico, glBad=badGluc;
  const fmt=v=>(v==null||v==='')?'—':v;
  const heads=['Lote','Variedad','Prensa','Análisis','Mes','Fecha','pH','AV','Gluc/Fruc','Málico','Motivo'];
  /* avAlerta resalta el AV del último análisis cuando hubo salto, aunque el valor
     esté por debajo de 0.85 y no sea "malo" por sí solo. */
  const celdasAna=(a,avAlerta)=>{
    const ph=num(a.ph),av=num(a.av),gl=num(a.gluc),mal=num(a.malico);
    const b=(val,isbad)=>`<td class="num ${isbad?'val-bad':''}">${fmt(val)}</td>`;
    return `<td class="num">${fmt(mesDe(a))}</td><td>${fmt(a.fecha)}</td>`+
           b(ph,false)+b(av,avBad(av)||!!avAlerta)+b(gl,glBad(gl))+b(mal,malBad(mal));
  };
  let h='<thead><tr>'+heads.map(x=>`<th>${x}</th>`).join('')+'</tr></thead><tbody>';
  for(const f of filas){
    const rs=f.pen?2:1;
    const ini=`<td class="num" rowspan="${rs}">${f.lote}</td><td rowspan="${rs}">${esc(f.variedad||'—')}</td><td rowspan="${rs}">${esc(f.prensa||'—')}</td>`;
    const motivo=`<td rowspan="${rs}"><span class="pill bad">${esc(f.motivo)}</span></td>`;
    if(f.pen){
      h+=`<tr class="rg-top">${ini}<td class="ro">Penúlt.</td>${celdasAna(f.pen)}${motivo}</tr>`;
      h+=`<tr><td class="ro">Último</td>${celdasAna(f.ult,f.salto)}</tr>`;
    } else {
      h+=`<tr class="rg-top">${ini}<td class="ro">Último</td>${celdasAna(f.ult,f.salto)}${motivo}</tr>`;
    }
  }
  h+='</tbody>';
  $('tRiesgo').innerHTML=h;
  $('cntRiesgo').textContent=filas.length+' lotes de alto riesgo';
}

/* ===================== DEGUSTACIÓN ===================== */
let sortDeg={key:'lote',dir:1};
const MOTIVOS_DEG=['AV','Abierto','Otro'];

function getDegRow(lote, mes, crear){
  let dg=DATOS.degustaciones.find(d=>+d.lote===+lote && +d.mes===+mes);
  if(!dg && crear){
    dg={lote:+lote, mes:+mes, fecha:($('degFecha').value||null), comentario:'', estado:null, motivo:null, motivo_detalle:''};
    DATOS.degustaciones.push(dg);
  }
  return dg;
}
function degVacio(dg){ return !dg.estado && !dg.motivo && !(dg.comentario&&dg.comentario.trim()) && !(dg.motivo_detalle&&dg.motivo_detalle.trim()); }
function podarDeg(dg){ if(dg && degVacio(dg)){ const i=DATOS.degustaciones.indexOf(dg); if(i>=0) DATOS.degustaciones.splice(i,1); } }
function setDegEstado(lote, estado){
  const dg=getDegRow(lote, mesDeg(), true);
  dg.estado = (dg.estado===estado) ? null : estado;          // re-clic = desmarcar
  if(dg.estado!=='nook'){ dg.motivo=null; dg.motivo_detalle=''; }
  if(dg.estado && !dg.fecha) dg.fecha=($('degFecha').value||null);
  podarDeg(dg); markDirty(); renderDegustacion();
}
function setDegMotivo(lote, motivo){
  const dg=getDegRow(lote, mesDeg(), true);
  dg.estado='nook';
  dg.motivo = (dg.motivo===motivo) ? null : motivo;          // re-clic = desmarcar
  if(dg.motivo!=='Otro') dg.motivo_detalle='';
  if(!dg.fecha) dg.fecha=($('degFecha').value||null);
  markDirty(); renderDegustacion();
}
const filtDegM={variedad:new Set(),prensa:new Set(),estado:new Set()};
let _descDeg=[], _instDeg=[];
function initFiltrosDeg(){
  _descDeg=[
    {label:'Variedad', set:filtDegM.variedad,
     opciones:()=>opcionesValores(DATOS.lotes, l=>l.variedad),
     match:matchValor(r=>r.variedad)},
    {label:'Prensa', set:filtDegM.prensa,
     opciones:()=>opcionesValores(DATOS.lotes, l=>l.prensa),
     match:matchValor(r=>r.prensa)},
    {label:'Estado', set:filtDegM.estado,
     opciones:()=>[{val:'sin',text:'Sin degustar'},{val:'ok',text:'OK'},{val:'nook',text:'NO OK'}],
     match:(r,set)=>set.has(r.estado||'sin')},
  ];
  _instDeg=initFiltrosMulti('fltDegBar', _descDeg, renderDegustacion);
}
function limpiarFiltrosDeg(){ limpiarFiltros(_descDeg,'buscaDeg',_instDeg,renderDegustacion); }

function renderDegustacion(){
  const mes=mesDeg();
  const q=($('buscaDeg').value||'').toLowerCase().trim();
  const degMap=new Map(); DATOS.degustaciones.forEach(d=>{ if(+d.mes===+mes) degMap.set(+d.lote,d); });
  let rows=DATOS.lotes.map(l=>{ const dg=degMap.get(+l.lote)||{};
    return {lote:l.lote, id_origen:l.id_origen, dias:diasDesde(l.dia_prensado), variedad:l.variedad, prensa:l.prensa,
            comentario:dg.comentario||'', estado:dg.estado||null, motivo:dg.motivo||null, motivo_detalle:dg.motivo_detalle||''};});
  if(q) rows=rows.filter(r=>[r.lote,r.id_origen,r.variedad].some(v=>v!=null&&String(v).toLowerCase().includes(q)));
  rows=rows.filter(r=>pasaMulti(r,_descDeg));
  rows=sortRows(rows,sortDeg);
  const cols=[{k:'lote',label:'Lote',num:true},{k:'id_origen',label:'ID Lote Origen'},{k:'dias',label:'Días prensado',num:true}];
  let h='<thead><tr>'+cols.map(c=>{const ar=sortDeg.key===c.k?`<span class="arrow">${sortDeg.dir>0?'▲':'▼'}</span>`:''; return `<th data-k="${c.k}" class="${c.num?'num':''}">${c.label}${ar}</th>`;}).join('')
    +'<th>Comentario</th><th>Estado</th><th>Motivo (si NO OK)</th></tr></thead>';
  const dash='<span style="color:var(--muted)">—</span>';
  let tb='<tbody>';
  rows.forEach(r=>{
    let mot=dash;
    if(r.estado==='nook'){
      mot='<div class="deg-motivos">'+MOTIVOS_DEG.map(m=>`<button class="degbtn motivo ${r.motivo===m?'active':''}" data-degmotivo="${escA(r.lote)}" data-m="${m}">${m}</button>`).join('')+'</div>';
      if(r.motivo==='Otro') mot+=`<input class="deg-otro" data-degotro="${escA(r.lote)}" placeholder="especificar…" value="${escA(r.motivo_detalle||'')}">`;
    }
    tb+=`<tr class="${r.estado==='nook'?'crit':''}">`
      +`<td class="num">${r.lote==null?'':r.lote}</td>`
      +`<td>${r.id_origen==null||r.id_origen===''?dash:esc(r.id_origen)}</td>`
      +`<td class="num">${r.dias==null?dash:r.dias+' d'}</td>`
      +`<td><input class="cell deg-com" data-degcom="${escA(r.lote)}" value="${escA(r.comentario||'')}" placeholder="comentario sensorial…"></td>`
      +`<td><div class="deg-estado"><button class="degbtn ok ${r.estado==='ok'?'active':''}" data-degestado="${escA(r.lote)}" data-e="ok">OK</button>`
      +`<button class="degbtn nook ${r.estado==='nook'?'active':''}" data-degestado="${escA(r.lote)}" data-e="nook">NO OK</button></div></td>`
      +`<td>${mot}</td></tr>`;
  });
  tb+='</tbody>';
  const t=$('tDeg'); t.innerHTML=h+tb;
  t.querySelectorAll('th[data-k]').forEach(th=>th.onclick=()=>{toggleSort(sortDeg,th.dataset.k);renderDegustacion();});
  const vals=[...degMap.values()];
  const okN=vals.filter(d=>d.estado==='ok').length, nookN=vals.filter(d=>d.estado==='nook').length;
  $('cntDeg').textContent=`Mes ${mes} · ${rows.length} lotes · ${okN} OK · ${nookN} NO OK · ${okN+nookN} degustados`;
  $('accionHint').textContent = nookN ? `${nookN} lote(s) NO OK este mes → listos para la OT` : 'Sin lotes NO OK este mes';
  if($('accionWrap').style.display!=='none') regenerarAccion();   // si el panel está abierto, mantenerlo sincronizado
}

/* ===================== ACCIÓN RÁPIDA (corrección de SO₂, imprimible) ===================== */
let arRows=[];
const AR_PER_PAGE=35;
function arFilaVacia(){ return {lote:'', anio:($('arFecha').value||'').slice(0,4)||String(today.getFullYear()),
  vasija:($('arVasija').value||'Barricas'), recip:'1', sol:'Sol 1.030', ml:($('arMl').value||'250')}; }
function regenerarAccion(){
  const mes=mesDeg();
  const anio=($('arFecha').value||'').slice(0,4)||String(today.getFullYear());
  const vas=$('arVasija').value||'Barricas', ml=$('arMl').value||'250';
  const noOk=DATOS.degustaciones.filter(d=>+d.mes===mes && d.estado==='nook').slice().sort((a,b)=>(+a.lote)-(+b.lote));
  arRows=noOk.map(d=>({lote:d.lote, anio:anio, vasija:vas, recip:'1', sol:'Sol 1.030', ml:ml}));
  pintarAccion();
}
function pintarAccion(){
  $('arCount').textContent=arRows.length+' lotes NO OK';
  const fechaISO=$('arFecha').value, p=fechaISO.split('-');
  const fechaTxt=p.length===3?`${p[2]}/${p[1]}/${p[0]}`:fechaISO, anio=p.length===3?p[0]:'';
  const nro=esc($('arNro').value||''), dens=esc($('arDensidad').value||''), emitio=esc($('arEmitio').value||''), recibio=esc($('arRecibio').value||'');
  const pages=Math.max(1,Math.ceil(arRows.length/AR_PER_PAGE));
  let html='';
  for(let pg=0; pg<pages; pg++){
    const start=pg*AR_PER_PAGE, slice=arRows.slice(start,start+AR_PER_PAGE);
    const filas=slice.map((r,i)=>{const gi=start+i;
      return `<tr>`+
        `<td class="c oh-check"></td>`+
        `<td class="c"><input class="ar-cell c" data-gi="${gi}" data-f="lote" value="${escA(r.lote==null?'':r.lote)}" style="text-align:center"></td>`+
        `<td class="c"><input class="ar-cell c" data-gi="${gi}" data-f="anio" value="${escA(r.anio||'')}" style="text-align:center"></td>`+
        `<td><input class="ar-cell" data-gi="${gi}" data-f="vasija" value="${escA(r.vasija||'')}"></td>`+
        `<td class="c"><input class="ar-cell c" data-gi="${gi}" data-f="recip" value="${escA(r.recip||'')}" style="text-align:center"></td>`+
        `<td><input class="ar-cell" data-gi="${gi}" data-f="sol" value="${escA(r.sol||'')}"></td>`+
        `<td class="c"><input class="ar-cell c" data-gi="${gi}" data-f="ml" value="${escA(r.ml||'')}" style="text-align:center"></td>`+
        `<td class="delcol c"><button class="delrow" data-ardel="${gi}" title="Eliminar fila">✕</button></td>`+
      `</tr>`;
    }).join('');
    html+=`<div class="orden-hoja">`+
      ohTop()+
      ohTitulo('accion')+
      `<div class="oh-meta"><span><b>Fecha:</b> ${fechaTxt}</span><span>${anio}</span><span><b>N° de Orden:</b> ${nro}</span></div>`+
      `<div class="oh-banda"><span>CORRECCIÓN DE ANHÍDRIDO SULFUROSO</span></div>`+
      `<div class="oh-nota">Por cada barril/vasija agregar <b>250 mL de Solución 1.030</b>. Chequear el valor de la solución con DMA: si es menor a 1,028 concentrar, si es mayor a 1,032 diluir. Homogeneizar. &nbsp;&nbsp;<b>Densidad:</b> ${dens||'____________'} (completar)</div>`+
      `<table><thead><tr><th class="c oh-check">Check</th><th class="c">Lote</th><th class="c">Año</th><th>N° vasija</th><th class="c">Cant. recipientes</th><th>P - MBK - Sol1030</th><th class="c">mL por vasija</th><th class="delcol"></th></tr></thead>`+
      `<tbody>${filas||'<tr><td colspan="8" class="c" style="padding:18px">No hay lotes NO OK en la degustación del mes.</td></tr>'}</tbody></table>`+
      `<div class="oh-pie"><div class="firma"><b>Emitió:</b> ${emitio} &nbsp;&nbsp; Firma:</div><div class="firma"><b>Recibió:</b> ${recibio} &nbsp;&nbsp; Firma:</div></div>`+
      `<div class="oh-hoja-num">Hoja ${pg+1} de ${pages}</div>`+
    `</div>`;
  }
  $('accionPaginas').innerHTML=html;
}
function arAplicar(){ const vas=$('arVasija').value||'Barricas', ml=$('arMl').value||'250'; arRows.forEach(r=>{r.vasija=vas;r.ml=ml;}); pintarAccion(); }
// al guardar, si estamos en Degustación y hay lotes NO OK, generar y mostrar la Acción Rápida
function postGuardarDeg(){
  const activo=document.querySelector('.tabs button.active');
  if(!activo || activo.dataset.v!=='degustacion') return;
  const hayNoOk=DATOS.degustaciones.some(d=>+d.mes===mesDeg() && d.estado==='nook');
  if(hayNoOk){ $('accionWrap').style.display='block'; regenerarAccion(); }
}

/* ===================== CARGAR ANÁLISIS ===================== */
// orden esperado: 0 Lote,1 Vasija,2 Año,3 Fecha,4 Etanol,5 PH,6 AV,7 Gluc,8 Málico,9 Láctico,10 AT,11 Azúcar,12 BRIX,13 SO2L
let cargaPreview=[];
// Detecta el orden día/mes de un lote de fechas con barras o guiones.
// Si alguna fecha tiene el primer número > 12 ⇒ día primero (DD/MM);
// si tiene el segundo > 12 ⇒ mes primero (MM/DD, formato EEUU).
// Gana la evidencia mayoritaria del lote; si no hay ninguna pista, asume DD/MM.
function detectarOrdenFechas(strs){
  let dmy=0, mdy=0;
  for(const s of strs){
    const m=String(s||'').trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-]\d{2,4}/);
    if(!m) continue;
    const a=+m[1], b=+m[2];
    if(a>12 && b<=12) dmy++;
    else if(b>12 && a<=12) mdy++;
  }
  return mdy>dmy ? 'mdy' : 'dmy';
}
// Convierte una fecha a ISO (YYYY-MM-DD). Acepta ISO directo, o D/M/Y y M/D/Y
// con barras o guiones. Para los casos ambiguos (ambos números ≤ 12) usa el
// `orden` detectado del lote ('mdy' = formato EEUU); por defecto, día primero.
function parseFecha(s, orden){
  if(!s) return null; s=String(s).trim();
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m){ const mm=+m[2], dd=+m[3]; if(mm<1||mm>12||dd<1||dd>31) return null;
    return `${m[1]}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`; }
  m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if(m){
    let a=+m[1], b=+m[2], y=+m[3]; if(y<100)y+=2000;
    let dd, mm;
    if(a>12 && b<=12){ dd=a; mm=b; }        // día primero (DD/MM)
    else if(b>12 && a<=12){ mm=a; dd=b; }   // mes primero (MM/DD, EEUU)
    else if(orden==='mdy'){ mm=a; dd=b; }   // ambiguo: usar el orden del lote
    else { dd=a; mm=b; }                     // ambiguo: día primero (defecto)
    if(mm<1||mm>12||dd<1||dd>31) return null;
    return `${y}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  }
  return null;
}
function analizarPegado(){
  const txt=$('pasteArea').value; const msg=$('importMsg');
  if(!txt.trim()){ msg.innerHTML='<div class="msg err">No hay datos pegados.</div>'; return; }
  let lines=txt.replace(/\r/g,'').split('\n').filter(l=>l.trim()!=='');
  if($('chkHeader').checked && lines.length) lines=lines.slice(1);
  const lotesSet=new Set(DATOS.lotes.map(l=>+l.lote));
  // Detectar el orden de fecha (día/mes vs mes/día EEUU) mirando TODO el lote,
  // para que las fechas ambiguas se interpreten igual que las inequívocas.
  const celdasDe = line => line.includes('\t')?line.split('\t'):line.split(/[,;]/);
  const ordenFechas = detectarOrdenFechas(lines.map(l=>{const c=celdasDe(l); return c[3]!=null?c[3].trim():'';}));
  cargaPreview=lines.map(line=>{
    const cells = celdasDe(line);
    const g=i=>(cells[i]!=null?cells[i].trim():'');
    const lote=parseInt(g(0),10);
    const fecha=parseFecha(g(3), ordenFechas);
    const row={lote, fecha, etanol:num(g(4)), ph:num(g(5)), av:num(g(6)), gluc:num(g(7)),
               malico:num(g(8)), lactico:num(g(9)), at:num(g(10)), azucar:num(g(11)), so2l:num(g(13))};
    let estado='ok', motivo='Se carga';
    if(!lote || isNaN(lote)){ estado='err'; motivo='Lote inválido'; }
    else if(!lotesSet.has(lote)){ estado='err'; motivo='Lote no existe en maestro'; }
    else if(!fecha){ estado='warn'; motivo='Sin fecha (se carga sin mes)'; }
    return {row,estado,motivo};
  });
  const okN=cargaPreview.filter(p=>p.estado!=='err').length;
  const errN=cargaPreview.filter(p=>p.estado==='err').length;
  const fmtTxt = ordenFechas==='mdy' ? 'mes/día (MM/DD, formato EEUU)' : 'día/mes (DD/MM)';
  msg.innerHTML=`<div class="msg ${errN?'info':'ok'}">Detectadas <b>${cargaPreview.length}</b> filas · <b style="color:#7be3a0">${okN}</b> se cargan · <b style="color:#ff8a7a">${errN}</b> descartadas (lote inexistente/ inválido).<br>Formato de fecha detectado: <b>${fmtTxt}</b>.</div>`;
  const cols=[['estado','']	,['lote','Lote'],['fecha','Fecha'],['ph','pH'],['av','AV'],['gluc','Gluc'],['malico','Málico'],['so2l','SO2 L'],['motivo','Estado']];
  let h='<thead><tr>'+cols.map(c=>`<th>${c[1]}</th>`).join('')+'</tr></thead><tbody>';
  h+=cargaPreview.map(p=>{
    const pill=p.estado==='ok'?'<span class="pill ok">✓</span>':p.estado==='warn'?'<span class="pill warn">!</span>':'<span class="pill bad">✕</span>';
    return '<tr>'+`<td>${pill}</td><td class="num">${p.row.lote||'—'}</td><td>${p.row.fecha||'—'}</td><td class="num">${p.row.ph??'—'}</td><td class="num">${p.row.av??'—'}</td><td class="num">${p.row.gluc??'—'}</td><td class="num">${p.row.malico??'—'}</td><td class="num">${p.row.so2l??'—'}</td><td style="color:var(--muted)">${p.motivo}</td>`+'</tr>';
  }).join('')+'</tbody>';
  $('tPreview').innerHTML=h;
  $('btnConfirmarCarga').style.display = okN>0?'inline-block':'none';
}
function confirmarCarga(){
  const validos=cargaPreview.filter(p=>p.estado!=='err');
  if(!validos.length) return;
  for(const p of validos){
    const r=p.row;
    DATOS.analisis.push({lote:r.lote, mes:monthOf(r.fecha), fecha:r.fecha, etanol:r.etanol, ph:r.ph, av:r.av,
      gluc:r.gluc, malico:r.malico, lactico:r.lactico, at:r.at, azucar:r.azucar, revisar_av:null, brett:null,
      aceticas:null, lacticas:null, levaduras:null, hongos:null, so2l:r.so2l, so2t:null, so2molec:null,
      fecha_corr:null, so2_corr:null, th2:null, otro:null, ot:null});
  }
  markDirty();
  $('importMsg').innerHTML=`<div class="msg ok">✅ ${validos.length} análisis agregados al historial. Acordate de <b>Guardar</b>.</div>`;
  $('pasteArea').value=''; $('tPreview').innerHTML=''; $('btnConfirmarCarga').style.display='none'; cargaPreview=[];
  initMesSelectors();
}

/* ===================== CARGAR AGREGADOS ===================== */
// orden esperado: 0 Lote, 1 Fecha, 2 Tipo, 3 Cantidad (la unidad se deriva del tipo)
let agrCargaPreview=[];
function normalizarTipoAgr(s){
  const t=String(s||'').trim().toUpperCase();
  if(!t) return '';
  if(t.includes('TH2')||t.includes('TART')) return 'TH2';
  if(t.includes('SO2')||t.includes('SULF')||t.includes('ANH')) return 'SO2';
  return 'Otro';
}
function analizarPegadoAgr(){
  const txt=$('agrPasteArea').value; const msg=$('agrImportMsg');
  if(!txt.trim()){ msg.innerHTML='<div class="msg err">No hay datos pegados.</div>'; return; }
  let lines=txt.replace(/\r/g,'').split('\n').filter(l=>l.trim()!=='');
  if($('agrChkHeader').checked && lines.length) lines=lines.slice(1);
  const lotesSet=new Set(DATOS.lotes.map(l=>+l.lote));
  const celdasDe = line => line.includes('\t')?line.split('\t'):line.split(/[,;]/);
  const ordenFechas = detectarOrdenFechas(lines.map(l=>{const c=celdasDe(l); return c[1]!=null?c[1].trim():'';}));
  agrCargaPreview=lines.map(line=>{
    const cells=celdasDe(line);
    const g=i=>(cells[i]!=null?cells[i].trim():'');
    const lote=parseInt(g(0),10);
    const fecha=parseFecha(g(1), ordenFechas);
    const tipo=normalizarTipoAgr(g(2));
    const cantidad=num(g(3));
    const row={lote, fecha, tipo, cantidad, unidad:unidadPorTipo(tipo)};
    let estado='ok', motivo='Se carga';
    if(!lote || isNaN(lote)){ estado='err'; motivo='Lote inválido'; }
    else if(!lotesSet.has(lote)){ estado='err'; motivo='Lote no existe en maestro'; }
    else if(!tipo){ estado='err'; motivo='Sin tipo'; }
    else if(cantidad==null){ estado='err'; motivo='Cantidad inválida'; }
    else if(!fecha){ estado='warn'; motivo='Sin fecha'; }
    return {row,estado,motivo};
  });
  const okN=agrCargaPreview.filter(p=>p.estado!=='err').length;
  const errN=agrCargaPreview.filter(p=>p.estado==='err').length;
  const fmtTxt = ordenFechas==='mdy' ? 'mes/día (MM/DD, formato EEUU)' : 'día/mes (DD/MM)';
  msg.innerHTML=`<div class="msg ${errN?'info':'ok'}">Detectadas <b>${agrCargaPreview.length}</b> filas · <b style="color:#7be3a0">${okN}</b> se cargan · <b style="color:#ff8a7a">${errN}</b> descartadas (lote inexistente / inválido).<br>Formato de fecha detectado: <b>${fmtTxt}</b>.</div>`;
  const cols=[['estado',''],['lote','Lote'],['fecha','Fecha'],['tipo','Tipo'],['cantidad','Cantidad'],['unidad','Unidad'],['motivo','Estado']];
  let h='<thead><tr>'+cols.map(c=>`<th>${c[1]}</th>`).join('')+'</tr></thead><tbody>';
  h+=agrCargaPreview.map(p=>{
    const pill=p.estado==='ok'?'<span class="pill ok">✓</span>':p.estado==='warn'?'<span class="pill warn">!</span>':'<span class="pill bad">✕</span>';
    return '<tr>'+`<td>${pill}</td><td class="num">${p.row.lote||'—'}</td><td>${p.row.fecha||'—'}</td><td>${esc(p.row.tipo)||'—'}</td><td class="num">${p.row.cantidad??'—'}</td><td>${esc(p.row.unidad)||'—'}</td><td style="color:var(--muted)">${esc(p.motivo)}</td>`+'</tr>';
  }).join('')+'</tbody>';
  $('tAgrPreview').innerHTML=h;
  $('btnConfirmarCargaAgr').style.display = okN>0?'inline-block':'none';
}
function confirmarCargaAgr(){
  const validos=agrCargaPreview.filter(p=>p.estado!=='err');
  if(!validos.length) return;
  for(const p of validos){
    const r=p.row;
    DATOS.agregados.unshift({id:nextAgregadoId(), lote:r.lote, fecha:r.fecha, tipo:r.tipo, cantidad:r.cantidad, unidad:r.unidad});
  }
  markDirty();
  $('agrImportMsg').innerHTML=`<div class="msg ok">✅ ${validos.length} agregados sumados a la bitácora. Acordate de <b>Guardar</b>.</div>`;
  $('agrPasteArea').value=''; $('tAgrPreview').innerHTML=''; $('btnConfirmarCargaAgr').style.display='none'; agrCargaPreview=[];
  renderAgregados();
}

/* ===================== EVOLUCIÓN POR LOTE ===================== */
function miniLineSVG(pts, limit, color, labels, incl){
  const W=320,H=160,m={l:34,r:10,t:12,b:30};
  if(!pts.length) return '<div style="color:var(--muted);font-size:12px;padding:24px 10px">Sin datos de este parámetro.</div>';
  const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
  let xmin=Math.min(...xs),xmax=Math.max(...xs); if(xmin===xmax){xmin-=0.5;xmax+=0.5;}
  let ymin=Math.min(0,...ys), ymax=Math.max(limit*1.2,...ys); if(ymin===ymax)ymax=ymin+1;
  const sx=v=>m.l+(v-xmin)/(xmax-xmin)*(W-m.l-m.r), sy=v=>H-m.b-(v-ymin)/(ymax-ymin)*(H-m.t-m.b);
  let g=`<rect x="${m.l}" y="${m.t}" width="${W-m.l-m.r}" height="${H-m.t-m.b}" fill="none" stroke="#e0dacd"/>`;
  if(limit>=ymin&&limit<=ymax){const ly=sy(limit); g+=`<line x1="${m.l}" y1="${ly}" x2="${W-m.r}" y2="${ly}" stroke="#c0473b" stroke-width="1" stroke-dasharray="4 3"/><text x="${W-m.r-2}" y="${ly-3}" fill="#c0473b" font-size="9" text-anchor="end">límite ${limit}</text>`;}
  const s=[...pts].sort((a,b)=>a.x-b.x);
  g+=`<polyline fill="none" stroke="${color}" stroke-width="2" points="${s.map(p=>sx(p.x).toFixed(1)+','+sy(p.y).toFixed(1)).join(' ')}"/>`;
  g+=s.map(p=>{const lab=labels&&labels[p.x]!=null?labels[p.x]:p.x; return `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3.5" fill="${((incl?p.y>=limit:p.y>limit)||p.y==-999)?'#c0473b':color}"><title>${lab}: ${p.y}</title></circle>`;}).join('');
  const skip=labels&&labels.length>9?Math.ceil(labels.length/9):1;
  g+=s.map((p,i)=>{ if(i%skip!==0) return ''; const lab=labels&&labels[p.x]!=null?labels[p.x]:p.x;
    return `<text x="${sx(p.x).toFixed(1)}" y="${H-m.b+12}" fill="#8c857b" font-size="8" text-anchor="middle" transform="rotate(-30 ${sx(p.x).toFixed(1)} ${H-m.b+12})">${lab}</text>`;}).join('');
  g+=`<text x="${m.l-4}" y="${H-m.b+3}" fill="#8c857b" font-size="9" text-anchor="end">${ymin.toFixed(1)}</text><text x="${m.l-4}" y="${m.t+8}" fill="#8c857b" font-size="9" text-anchor="end">${ymax.toFixed(1)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${g}</svg>`;
}
/* ---- Evolución: filtros propios (Variedad / Prensa) ---- */
const filtEvoM={variedad:new Set(),prensa:new Set()};
let _descEvo=[], _instEvo=[];
let ordenEvo='lote';                 // 'lote' | 'estado' | 'variedad'
const evoAbiertos=new Set();         // lotes con el detalle expandido
let _evoModelCache=new Map();        // lote -> item, para el lazy-render/expand
let _evoObserver=null;

function initAgrLotes(){ const dl=$('agrLotes'); if(dl) dl.innerHTML=DATOS.lotes.map(l=>`<option value="${l.lote}">`).join(''); }

function initFiltrosEvo(){
  _descEvo=[
    {label:'Variedad', set:filtEvoM.variedad,
     opciones:()=>opcionesValores(DATOS.lotes, l=>l.variedad),
     match:matchValor(x=>x.variedad)},
    {label:'Prensa', set:filtEvoM.prensa,
     opciones:()=>opcionesValores(DATOS.lotes, l=>l.prensa),
     match:matchValor(x=>x.prensa)},
  ];
  _instEvo=initFiltrosMulti('fltEvoBar', _descEvo, renderEvolucion);
}
function limpiarFiltrosEvo(){ limpiarFiltros(_descEvo,'buscaEvo',_instEvo,renderEvolucion); }

// Modelo: lotes evaluados (mismas reglas del Dashboard) con búsqueda + Solo NO OK
// + multi-filtros Variedad/Prensa + orden, y su historial de análisis para graficar.
function evoModelo(){
  const q=($('buscaEvo').value||'').toLowerCase().trim();
  const soloNoOk=$('btnEvoNoOk').classList.contains('active');
  let base=evaluarLotes(mesActual());
  if(q) base=base.filter(f=>String(f.lote).includes(q)||String(f.variedad||'').toLowerCase().includes(q));
  if(soloNoOk) base=base.filter(f=>f.noOk);
  base=base.filter(f=>pasaMulti(f,_descEvo));
  if(ordenEvo==='estado') base.sort((a,b)=>((b.noOk?1:0)-(a.noOk?1:0))||((+a.lote)-(+b.lote)));
  else if(ordenEvo==='variedad') base.sort((a,b)=>String(a.variedad||'').localeCompare(String(b.variedad||''),'es')||((+a.lote)-(+b.lote)));
  else base.sort((a,b)=>(+a.lote)-(+b.lote));
  const idx=indexarAnalisis();
  return base.map(f=>{
    const rows=(idx.get(+f.lote)||[]).filter(a=>!esSeparador(a)).map(a=>({...a,_mes:mesDe(a)}))
      .sort((a,b)=>{ const fa=a.fecha||'',fb=b.fecha||''; if(fa&&fb) return fa<fb?-1:fa>fb?1:0; return (a._mes||0)-(b._mes||0); });
    return {lote:+f.lote, variedad:f.variedad||'', prensa:f.prensa||'', noOk:f.noOk, criterios:f.criterios, sinAnalisis:f.sinAnalisis, rows};
  });
}

function evoCardHTML(it){
  const abierto=evoAbiertos.has(it.lote);
  const badge=it.sinAnalisis
    ? `<span class="evo-badge">sin análisis</span>`
    : (it.noOk ? `<span class="evo-badge nook">NO OK · ${esc(it.criterios)}</span>`
               : `<span class="evo-badge ok">OK</span>`);
  return `<div class="evo-card${abierto?' open':''}" data-lote="${it.lote}">`
    +`<div class="evo-cardhead">`
    +`<span class="tit">Lote ${it.lote}</span>`
    +`<span class="sub">${esc(it.variedad||'(sin variedad)')} · prensa ${esc(it.prensa||'?')} · ${it.rows.length} análisis</span>`
    +badge
    +`<span class="caret">▶</span>`
    +`</div>`
    +`<div class="evo-charts" data-charts></div>`
    +`<div class="evo-detalle" data-detalle style="${abierto?'':'display:none'}"></div>`
    +`</div>`;
}

function evoChartsHTML(it){
  const rows=it.rows;
  if(!rows.length) return `<div class="note" style="margin:0">Este lote no tiene análisis para graficar.</div>`;
  const fmtCorto=s=>{ if(!s) return 'M?'; const p=s.split('-'); return p.length===3?`${p[2]}/${p[1]}`:s; };
  const labels=rows.map(a=>a.fecha?fmtCorto(a.fecha):'M'+(a._mes||'?'));
  const params=[{k:'ph',label:'pH',limit:REGLAS.PH_MAX,color:'#5b7b86',u:''},
    {k:'av',label:'Acidez Volátil',limit:REGLAS.AV_MAX,color:'#b07d2c',u:' g/L',incl:true},
    {k:'malico',label:'Ácido Málico',limit:REGLAS.MALICO_MAX,color:'#8a5a86',u:' g/L'},
    {k:'gluc',label:'Gluc/Fruc',limit:REGLAS.GLUC_MAX,color:'#4f9163',u:' g/L'}];
  return `<div class="evo-grid">`+params.map(p=>{
    const pts=rows.map((a,i)=>({x:i,y:num(a[p.k])})).filter(pt=>pt.y!=null);
    return `<div class="evo-box"><h4>${p.label}</h4><div class="lim">NO OK si ${p.incl?'&ge;':'&gt;'} ${p.limit}${p.u} · ${rows.length} análisis</div>${miniLineSVG(pts,p.limit,p.color,labels,p.incl)}</div>`;
  }).join('')+`</div>`;
}

// Detalle estático (sin ordenar por columna) para mantenerlo simple por tarjeta.
function evoDetalleHTML(it){
  const cell=v=>v==null?'—':v;
  const cols=[['mes','Mes'],['fecha','Fecha'],['ph','pH'],['av','AV'],['gluc','Gluc/Fruc'],['malico','Málico'],['at','AT'],['so2l','SO2 L']];
  const meds=it.rows.map(a=>({mes:a._mes,fecha:a.fecha,ph:num(a.ph),av:num(a.av),gluc:num(a.gluc),malico:num(a.malico),at:num(a.at),so2l:num(a.so2l)}));
  let med=`<h4>Mediciones del lote</h4><div class="scroll"><table><thead><tr>`
    +cols.map(c=>`<th class="num">${c[1]}</th>`).join('')+`</tr></thead><tbody>`
    +meds.map(m=>`<tr>`+cols.map(c=>`<td class="num">${cell(m[c[0]])}</td>`).join('')+`</tr>`).join('')
    +`</tbody></table></div>`;
  const ag=(DATOS.agregados||[]).filter(a=>+a.lote===it.lote)
    .sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
  let agr='';
  if(ag.length){
    const ac=[['fecha','Fecha'],['tipo','Tipo'],['cantidad','Cantidad'],['unidad','Unidad']];
    agr=`<h4>Agregados de este lote (${ag.length})</h4><div class="scroll"><table><thead><tr>`
      +ac.map(c=>`<th>${c[1]}</th>`).join('')+`</tr></thead><tbody>`
      +ag.map(r=>`<tr>`+ac.map(c=>`<td>${r[c[0]]==null?'—':esc(r[c[0]])}</td>`).join('')+`</tr>`).join('')
      +`</tbody></table></div>`;
  }
  return med+agr;
}

function evoConectarLazy(){
  if(_evoObserver) _evoObserver.disconnect();
  _evoObserver=new IntersectionObserver((entries)=>{
    for(const e of entries){
      if(!e.isIntersecting) continue;
      const box=e.target;
      if(!box.dataset.rendered){
        const lote=+box.closest('.evo-card').dataset.lote;
        const it=_evoModelCache.get(lote);
        if(it){ box.innerHTML=evoChartsHTML(it); box.dataset.rendered='1'; }
      }
      _evoObserver.unobserve(box);
    }
  }, {root:null, rootMargin:'250px 0px'});
  $('evoLista').querySelectorAll('.evo-charts').forEach(b=>_evoObserver.observe(b));
}

function renderEvolucion(){
  const lista=$('evoLista'), vacio=$('evoVacio');
  if(!DATOS.lotes.length){ lista.innerHTML=''; vacio.style.display='block'; vacio.textContent='No hay lotes cargados.'; $('evoCount').textContent=''; return; }
  const items=evoModelo();
  _evoModelCache=new Map(items.map(it=>[it.lote,it]));
  $('evoCount').textContent=items.length+' / '+DATOS.lotes.length+' lotes';
  if(!items.length){
    lista.innerHTML=''; vacio.style.display='block';
    vacio.textContent='No hay lotes que coincidan con la búsqueda o los filtros.';
    return;
  }
  vacio.style.display='none';
  lista.innerHTML=items.map(evoCardHTML).join('');
  evoConectarLazy();
  // re-armar el detalle de las tarjetas que quedaron abiertas
  lista.querySelectorAll('.evo-card.open').forEach(card=>{
    const it=_evoModelCache.get(+card.dataset.lote);
    if(it){ const d=card.querySelector('[data-detalle]'); d.innerHTML=evoDetalleHTML(it); d.dataset.rendered='1'; d.style.display=''; }
  });
}

function evoToggleCard(card){
  const lote=+card.dataset.lote;
  const d=card.querySelector('[data-detalle]');
  const abrir=!card.classList.contains('open');
  card.classList.toggle('open', abrir);
  if(abrir){
    evoAbiertos.add(lote);
    if(!d.dataset.rendered){ const it=_evoModelCache.get(lote); if(it){ d.innerHTML=evoDetalleHTML(it); d.dataset.rendered='1'; } }
    d.style.display='';
  } else {
    evoAbiertos.delete(lote);
    d.style.display='none';
  }
}

/* ===================== ORDEN DE MUESTRAS (imprimible) ===================== */
let ordenRows=[];
const RECIPIENTES=['Tubo falcon','Botella 120 mL','Tubo falcon + Botella 120 mL'];
const ORDEN_PER_PAGE=25;
let ordenMapas=[];   // imágenes {src,nombre,pie} del mapa de barriles, anexadas al final
function pintarMapaChipsOrden(){
  $('ordMapaChips').innerHTML=ordenMapas.length
    ? ordenMapas.map((m,i)=>`<span class="chip">🗺️ ${esc(m.nombre)}<button data-delmapaord="${i}" title="Quitar imagen">✕</button></span>`).join('')
    : '<span class="tag">(sin imágenes)</span>';
}

function filaOrdenVacia(){ return {lote:'',variedad:'',vasija:($('ordVasija').value||''),cant:$('ordCant').value,recipiente:$('ordRecipiente').value}; }
const filtOrdenM={variedad:new Set(),prensa:new Set()};
let _descOrden=[], _instOrden=[];
function initFiltrosOrden(){
  _descOrden=[
    {label:'Variedad', set:filtOrdenM.variedad,
     opciones:()=>opcionesValores(DATOS.lotes, l=>l.variedad),
     match:matchValor(f=>f.variedad)},
    {label:'Prensa', set:filtOrdenM.prensa,
     opciones:()=>opcionesValores(DATOS.lotes, l=>l.prensa),
     match:matchValor(f=>f.prensa)},
  ];
  _instOrden=initFiltrosMulti('fltOrdenBar', _descOrden, regenerarOrden);
}
function limpiarFiltrosOrden(){ limpiarFiltros(_descOrden,null,_instOrden,regenerarOrden); }

function regenerarOrden(){
  const fuente=$('ordenFuente').value;
  // el selector de criterio sólo aplica a la fuente "Lotes NO OK"
  $('wrapNookTipo').style.display = (fuente==='nook') ? '' : 'none';
  // hoja en blanco: arranca con una fila vacía y se completa a mano (no se toca si ya hay filas cargadas)
  if(fuente==='blanco'){ if(!ordenRows.length) ordenRows=[filaOrdenVacia()]; pintarOrden(); return; }
  const ml=mapaLotes();
  let sel=evaluarLotes(mesActual()).filter(f=>{
    if(fuente==='todos') return true;
    if(fuente==='vencidos') return f.vencido;
    if(fuente==='proximos') return f.proximo;
    if(fuente==='venc_prox') return f.vencido||f.proximo;
    if(fuente==='nook') return f.noOk;
    if(fuente==='atencion') return esAtencion(f);
    return false;
  });
  if(fuente==='nook'){ const tipo=$('ordenNookTipo').value; if(tipo!=='todos') sel=sel.filter(f=>f[tipo]); }
  sel=sel.filter(f=>pasaMulti(f,_descOrden));
  sel.sort((a,b)=>(+a.lote)-(+b.lote));
  const rec=$('ordRecipiente').value, cant=$('ordCant').value, vas=$('ordVasija').value||'';
  ordenRows=sel.map(f=>{const l=ml.get(+f.lote)||{}; return {lote:f.lote, variedad:(l.variedad||f.variedad||''), vasija:vas, cant:cant, recipiente:rec};});
  pintarOrden();
}
function pintarOrden(){
  $('ordenCount').textContent=ordenRows.length+' lotes';
  const fechaISO=$('ordFecha').value, p=fechaISO.split('-');
  const fechaTxt=p.length===3?`${p[2]}/${p[1]}/${p[0]}`:fechaISO, anio=p.length===3?p[0]:'';
  const nro=esc($('ordNro').value||''), dia=esc($('ordDia').value||''), recibio=esc($('ordRecibio').value||'');
  const pages=Math.max(1,Math.ceil(ordenRows.length/ORDEN_PER_PAGE));
  let html='';
  for(let pg=0; pg<pages; pg++){
    const start=pg*ORDEN_PER_PAGE, slice=ordenRows.slice(start,start+ORDEN_PER_PAGE);
    const filas=slice.map((r,i)=>{const gi=start+i;
      return `<tr>`+
        `<td class="c oh-num">${gi+1}</td>`+
        `<td class="c"><input class="ord-cell" data-gi="${gi}" data-f="lote" value="${escA(r.lote==null?'':r.lote)}"></td>`+
        `<td><input class="ord-cell" data-gi="${gi}" data-f="variedad" value="${escA(r.variedad||'')}"></td>`+
        `<td><input class="ord-cell" data-gi="${gi}" data-f="vasija" value="${escA(r.vasija||'')}"></td>`+
        `<td class="c"><input class="ord-cell c" data-gi="${gi}" data-f="cant" value="${escA(r.cant||'')}" style="text-align:center"></td>`+
        `<td><select class="ord-cell" data-gi="${gi}" data-f="recipiente">${RECIPIENTES.map(x=>`<option ${x===r.recipiente?'selected':''}>${x}</option>`).join('')}</select></td>`+
        `<td class="oh-check"></td>`+
        `<td class="delcol c"><button class="delrow" data-delrow="${gi}" title="Eliminar fila">✕</button></td>`+
      `</tr>`;
    }).join('');
    html+=`<div class="orden-hoja">`+
      ohTop()+
      ohTitulo('muestras')+
      `<div class="oh-meta"><span><b>Fecha:</b> ${fechaTxt}</span><span>${anio}</span><span><b>N° de Orden:</b> ${nro}</span></div>`+
      `<div class="oh-banda"><span>MUESTRAS</span><span>${dia}</span><span>Lab CIW + Degustación</span></div>`+
      `<div class="oh-nota">Tomar muestra en un tubo falcon y luego sanitizar jeringa para cada lote.</div>`+
      `<table><colgroup><col style="width:32px"><col style="width:62px"><col><col style="width:72px"><col style="width:46px"><col style="width:232px"><col style="width:46px"><col style="width:28px"></colgroup><thead><tr><th class="c oh-num">#</th><th class="c">LOTE</th><th>VARIEDAD</th><th>VASIJA</th><th class="c">Cant.</th><th>Recipiente</th><th class="oh-check">Check</th><th class="delcol"></th></tr></thead>`+
      `<tbody>${filas||'<tr><td colspan="8" class="c" style="padding:18px">No hay lotes para los criterios elegidos.</td></tr>'}</tbody></table>`+
      `<div class="oh-pie"><div class="firma"><b>Emitió:</b> Marcelo &nbsp;&nbsp; Firma:</div><div class="firma"><b>Recibió:</b> ${recibio} &nbsp;&nbsp; Firma:</div></div>`+
      `<div class="oh-hoja-num">Hoja ${pg+1} de ${pages}</div>`+
    `</div>`;
  }
  const totMapasOrd=ordenMapas.length;
  ordenMapas.forEach((m,i)=>{
    const sufijo=totMapasOrd>1?` (${i+1} de ${totMapasOrd})`:'';
    html+=`<div class="orden-hoja oh-mapa">`+
      ohTop()+
      `<div class="oh-titulo">Mapa de barriles${sufijo}</div>`+
      `<div class="oh-meta"><span><b>Fecha:</b> ${fechaTxt}</span><span>${anio}</span><span><b>N° de Orden:</b> ${nro}</span></div>`+
      `<div class="oh-banda"><span>MUESTRAS</span><span>${dia}</span><span>Lab CIW + Degustación</span></div>`+
      `<img class="oh-mapa-img" src="${m.src}" alt="Mapa de barriles">`+
      `<input class="oh-mapa-pie" data-mapapieord="${i}" value="${escA(m.pie||'')}" placeholder="Escribí una descripción de la imagen…">`+
    `</div>`;
  });
  $('ordenPaginas').innerHTML=html;
  const lotesOrd=ordenRows.map(r=>r.lote).filter(l=>l!=null&&l!=='');
  $('ordenLotesLista').innerHTML=lotesOrd.length
    ? `<b>Lotes:</b> ${esc(lotesOrd.join(', '))}`
    : '';
}
function renderOrden(){ pintarMapaChipsOrden(); if(!ordenRows.length) regenerarOrden(); else pintarOrden(); }
function ordAplicar(campo){ const map={recipiente:$('ordRecipiente').value, cant:$('ordCant').value, vasija:($('ordVasija').value||'')};
  ordenRows.forEach(r=>{ if(campo==='todos'){r.recipiente=map.recipiente;r.cant=map.cant;r.vasija=map.vasija;} else r[campo]=map[campo]; }); pintarOrden(); }

/* ===================== RELLENOS (orden de relleno imprimible) ===================== */
let rellenoRows=[];
let rellenoOrigenes=[];
let rellenoVariedades=[];   // variedades elegidas para rellenar (vacío = todas)
let rellenoMapas=[];        // imágenes {src,nombre,pie} del mapa de barriles, anexadas al final
const RELLENO_PER_PAGE=25;
const REL_INSTRUCCIONES_DEF=`Estirar barriles de lotes seleccionados
Decolorar y desinfectar todos los elementos a utilizar
Agregar 300mL solución 1030 a Barril ____
Ir rellenando según indicaciones; si la merma supera 5 litros, avisar.`;
const REL_PIE_DEF=`Al finalizar limpiar bien todas las barricas por fuera. CEPILLAR HONGOS Y BARRICAS QUE TENGAN BORRA.
Desinfectar todos los bitoques, luego volver a colocar.`;

// Lista de variedades disponibles en los datos (trim, sin vacías), ordenada.
function variedadesDisponibles(){
  if(!DATOS||!DATOS.lotes) return [];
  return [...new Set(DATOS.lotes.map(l=>(l.variedad||'').trim()).filter(v=>v))].sort();
}
// Lotes llenos de las variedades elegidas (vacío = todas); útil para poblar orígenes.
function lotesRellenoVariedad(){
  if(!DATOS||!DATOS.lotes) return [];
  let sel=DATOS.lotes.filter(l=>(l.litros||0)>0);
  if(rellenoVariedades.length) sel=sel.filter(l=>rellenoVariedades.includes((l.variedad||'').trim()));
  return sel.sort((a,b)=>(+a.lote)-(+b.lote));
}
function poblarRelVar(){
  const disp=variedadesDisponibles().filter(v=>!rellenoVariedades.includes(v));
  $('relVarAdd').innerHTML='<option value="">➕ Agregar variedad…</option>'+
    disp.map(v=>`<option value="${escA(v)}">${esc(v)}</option>`).join('');
}
function pintarChipsVar(){
  $('relVarChips').innerHTML=rellenoVariedades.map(v=>
    `<span class="chip">${esc(v)}<button data-delvar="${escA(v)}" title="Quitar variedad">✕</button></span>`).join('');
}
function poblarRelOrigen(){
  const disponibles=lotesRellenoVariedad().filter(l=>!rellenoOrigenes.includes(+l.lote));
  $('relOrigenAdd').innerHTML='<option value="">➕ Agregar lote origen…</option>'+
    disponibles.map(l=>`<option value="${+l.lote}">${esc(l.lote)}${l.variedad?' · '+esc(l.variedad):''}</option>`).join('');
}
function pintarChipsOrigen(){
  $('relOrigenChips').innerHTML=rellenoOrigenes.map(n=>
    `<span class="chip">${esc(n)}<button data-delorigen="${n}" title="Quitar origen">✕</button></span>`).join('');
  const cur=$('relRellenarCon').value;
  $('relRellenarCon').innerHTML='<option value="">(vacío)</option>'+
    rellenoOrigenes.map(n=>`<option value="${escA(n)}">${esc(n)}</option>`).join('');
  // si hay un solo origen, preseleccionarlo; si no, conservar la elección previa si sigue válida
  if(rellenoOrigenes.length===1) $('relRellenarCon').value=String(rellenoOrigenes[0]);
  else if([...$('relRellenarCon').options].some(o=>o.value===cur)) $('relRellenarCon').value=cur;
}
function pintarMapaChips(){
  $('relMapaChips').innerHTML=rellenoMapas.length
    ? rellenoMapas.map((m,i)=>`<span class="chip">🗺️ ${esc(m.nombre)}<button data-delmapa="${i}" title="Quitar imagen">✕</button></span>`).join('')
    : '<span class="tag">(sin imágenes)</span>';
}
function regenerarRelleno(){
  const vas=$('relVasija').value||'barril', cant=$('relCant').value||'1', rc=$('relRellenarCon').value||'';
  const sel=lotesRellenoVariedad().filter(l=>!rellenoOrigenes.includes(+l.lote));
  rellenoRows=sel.map(l=>({lote:l.lote, vasija:vas, cant:cant, rellenarCon:rc}));
  pintarRelleno();
}
// Convierte un texto multilínea en una lista de pasos, cada uno con su casillero
// de check vacío para que el operario lo tilde a mano en la orden impresa.
function notaConChecks(raw){
  const lineas=(raw||'').split('\n').map(s=>s.trim()).filter(s=>s.length);
  if(!lineas.length) return '';
  return `<ul class="oh-checklist">`+
    lineas.map(l=>`<li><span class="chk"></span><span class="txt">${esc(l)}</span></li>`).join('')+
  `</ul>`;
}
function pintarRelleno(){
  $('rellenoCount').textContent=rellenoRows.length+' lotes';
  const fechaISO=$('relFecha').value, p=fechaISO.split('-');
  const fechaTxt=p.length===3?`${p[2]}/${p[1]}/${p[0]}`:fechaISO, anio=p.length===3?p[0]:'';
  const nro=esc($('relNro').value||''), dia=esc($('relDia').value||''),
        emitio=esc($('relEmitio').value||''), recibio=esc($('relRecibio').value||'');
  const instr=notaConChecks($('relInstrucciones').value||''), pie=notaConChecks($('relPie').value||'');
  const pages=Math.max(1,Math.ceil(rellenoRows.length/RELLENO_PER_PAGE));
  let html='';
  for(let pg=0; pg<pages; pg++){
    const start=pg*RELLENO_PER_PAGE, slice=rellenoRows.slice(start,start+RELLENO_PER_PAGE);
    const filas=slice.map((r,i)=>{const gi=start+i;
      return `<tr>`+
        `<td class="c oh-num">${gi+1}</td>`+
        `<td class="oh-check"></td>`+
        `<td class="c"><input class="rel-cell" data-gi="${gi}" data-f="lote" value="${escA(r.lote==null?'':r.lote)}"></td>`+
        `<td><input class="rel-cell" data-gi="${gi}" data-f="vasija" value="${escA(r.vasija||'')}"></td>`+
        `<td class="c"><input class="rel-cell c" data-gi="${gi}" data-f="cant" value="${escA(r.cant||'')}" style="text-align:center"></td>`+
        `<td class="c"><input class="rel-cell c" data-gi="${gi}" data-f="rellenarCon" value="${escA(r.rellenarCon||'')}" style="text-align:center"></td>`+
        `<td class="delcol c"><button class="delrow" data-delrow="${gi}" title="Eliminar fila">✕</button></td>`+
      `</tr>`;
    }).join('');
    html+=`<div class="orden-hoja">`+
      ohTop()+
      ohTitulo('rellenos')+
      `<div class="oh-meta"><span><b>Fecha:</b> ${fechaTxt}</span><span>${anio}</span><span><b>N° de Orden:</b> ${nro}</span></div>`+
      `<div class="oh-banda"><span>RELLENOS</span><span>${dia}</span><span>Lab CIW + Degustación</span></div>`+
      `<div class="oh-nota">${instr}</div>`+
      `<table><thead><tr><th class="c oh-num">#</th><th class="oh-check">Check</th><th class="c">LOTE</th><th>VASIJA</th><th class="c">Cant.</th><th class="c">Rellenar con</th><th class="delcol"></th></tr></thead>`+
      `<tbody>${filas||'<tr><td colspan="7" class="c" style="padding:18px">No hay lotes para los criterios elegidos.</td></tr>'}</tbody></table>`+
      `<div class="oh-nota">${pie}</div>`+
      `<div class="oh-pie"><div class="firma"><b>Emitió:</b> ${emitio} &nbsp;&nbsp; Firma:</div><div class="firma"><b>Recibió:</b> ${recibio} &nbsp;&nbsp; Firma:</div></div>`+
      `<div class="oh-hoja-num">Hoja ${pg+1} de ${pages}</div>`+
    `</div>`;
  }
  const totMapas=rellenoMapas.length;
  rellenoMapas.forEach((m,i)=>{
    const sufijo=totMapas>1?` (${i+1} de ${totMapas})`:'';
    html+=`<div class="orden-hoja oh-mapa">`+
      ohTop()+
      `<div class="oh-titulo">Mapa de barriles${sufijo}</div>`+
      `<div class="oh-meta"><span><b>Fecha:</b> ${fechaTxt}</span><span>${anio}</span><span><b>N° de Orden:</b> ${nro}</span></div>`+
      `<div class="oh-banda"><span>RELLENOS</span><span>${dia}</span><span>Lab CIW + Degustación</span></div>`+
      `<img class="oh-mapa-img" src="${m.src}" alt="Mapa de barriles">`+
      `<input class="oh-mapa-pie" data-mapapie="${i}" value="${escA(m.pie||'')}" placeholder="Escribí una descripción de la imagen…">`+
    `</div>`;
  });
  $('rellenoPaginas').innerHTML=html;
  const lotesRel=rellenoRows.map(r=>r.lote).filter(l=>l!=null&&l!=='');
  $('rellenoLotesLista').innerHTML=lotesRel.length
    ? `<b>Lotes:</b> ${esc(lotesRel.join(', '))}`
    : '';
}
function renderRelleno(){ poblarRelVar(); pintarChipsVar(); poblarRelOrigen(); pintarChipsOrigen(); pintarMapaChips(); if(!rellenoRows.length) regenerarRelleno(); else pintarRelleno(); }

/* ===================== ASISTENTE (Ollama local) ===================== */
let chatHistorial=[];
const CAMPOS_LOTE={variedad:'variedad',prensa:'prensa',litros:'litros',comentario:'comentario',so2_agregado:'so2_agregado',dia_prensado:'dia_prensado',origen:'origen',ig:'ig',id_origen:'id_origen',ot_prensado:'ot_prensado',
  litros_actuales:'litros',so2:'so2_agregado','día prensado':'dia_prensado','dia prensado':'dia_prensado'};

function chatAppend(role, html){
  const box=$('chatBox'); const row=document.createElement('div');
  row.className='msg-row '+(role==='user'?'user':'bot');
  row.innerHTML=`<div class="bubble">${html}</div>`;
  box.appendChild(row); box.scrollTop=box.scrollHeight; return row;
}
function descAccion(a){
  if(a.tipo==='agregar_analisis'){
    const campos=['ph','av','gluc','malico','lactico','at','azucar','so2l'].filter(k=>a[k]!=null).map(k=>`${k}=${a[k]}`).join(', ');
    return `Agregar análisis al lote <b>${esc(a.lote)}</b> (fecha ${esc(a.fecha||'?')})${campos?': '+esc(campos):''}`;
  }
  if(a.tipo==='editar_lote') return `Editar lote <b>${esc(a.lote)}</b>: ${esc(a.campo)} = ${esc(a.valor)}`;
  if(a.tipo==='agregar_lote') return `Agregar lote <b>${esc(a.lote)}</b> (${esc(a.variedad||'')}, prensa ${esc(a.prensa||'?')}${a.litros!=null?', '+esc(a.litros)+' L':''})`;
  return 'Acción: '+esc(JSON.stringify(a));
}
function tarjetaAccion(a){
  const card=document.createElement('div'); card.className='accion-card';
  card.innerHTML=`<div class="tit">${descAccion(a)}</div><div class="btns"><button class="ap">✅ Aplicar</button><button class="de">Descartar</button></div>`;
  card.querySelector('.ap').onclick=()=>aplicarAccion(a,card);
  card.querySelector('.de').onclick=()=>{ card.classList.add('descartada'); card.querySelector('.btns').innerHTML='<span style="color:var(--muted)">Descartado</span>'; };
  return card;
}
function aplicarAccion(a,card){
  const ml=mapaLotes(); let msg='';
  try{
    if(a.tipo==='agregar_analisis'){
      if(!ml.has(+a.lote)) throw new Error('el lote '+a.lote+' no existe en el maestro');
      DATOS.analisis.push({lote:+a.lote, mes:monthOf(a.fecha), fecha:a.fecha||null,
        etanol:null, ph:num(a.ph), av:num(a.av), gluc:num(a.gluc), malico:num(a.malico),
        lactico:num(a.lactico), at:num(a.at), azucar:num(a.azucar), revisar_av:null, brett:null,
        aceticas:null, lacticas:null, levaduras:null, hongos:null, so2l:num(a.so2l), so2t:null,
        so2molec:null, fecha_corr:null, so2_corr:null, th2:null, otro:null, ot:null});
      msg='Análisis agregado al lote '+a.lote+'.';
    } else if(a.tipo==='editar_lote'){
      const k=CAMPOS_LOTE[(a.campo||'').toLowerCase().trim()];
      if(!k) throw new Error('campo no permitido: '+a.campo);
      const l=ml.get(+a.lote); if(!l) throw new Error('el lote '+a.lote+' no existe');
      l[k]=(k==='litros')?num(a.valor):a.valor;
      msg='Lote '+a.lote+' actualizado ('+k+').';
    } else if(a.tipo==='agregar_lote'){
      if(ml.has(+a.lote)) throw new Error('el lote '+a.lote+' ya existe');
      DATOS.lotes.push({lote:+a.lote, variedad:a.variedad||null, origen:null, ig:null, id_origen:null,
        ot_prensado:null, litros:num(a.litros), dia_prensado:null, prensa:a.prensa||null,
        so2_agregado:null, comentario:null, accion:null, comentario2:null, accion2:null});
      msg='Lote '+a.lote+' agregado.';
    } else { throw new Error('tipo de acción desconocido'); }
    markDirty(); initFiltroVariedad(); initFiltrosEvo(); initAgrLotes(); renderActive();
    card.classList.add('aplicada');
    card.querySelector('.btns').innerHTML='<span style="color:var(--ok)">✓ '+esc(msg)+' Acordate de <b>Guardar</b>.</span>';
  }catch(e){
    card.querySelector('.btns').innerHTML='<span style="color:#ff8a7a">No se pudo aplicar: '+esc(String(e.message||e))+'</span>';
  }
}
async function enviarPregunta(){
  const inp=$('chatPregunta'); const q=(inp.value||'').trim(); if(!q) return;
  inp.value=''; chatAppend('user', esc(q));
  const pensando=chatAppend('bot','<span class="pensando">Pensando… (puede tardar unos segundos en esta PC)</span>');
  $('chatEnviar').disabled=true;
  try{
    const r=await fetch(API+'/asistente',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({pregunta:q, historial:chatHistorial.slice(-6)})});
    const j=await r.json();
    const bubble=pensando.querySelector('.bubble'); bubble.classList.remove('pensando');
    if(!r.ok){ bubble.innerHTML='<span style="color:#ff8a7a">'+esc(j.error||('Error '+r.status))+'</span>'; return; }
    bubble.innerHTML=esc(j.respuesta||'(sin respuesta)');
    chatHistorial.push({role:'user',content:q},{role:'assistant',content:j.respuesta||''});
    if(Array.isArray(j.acciones)&&j.acciones.length){
      const cont=document.createElement('div'); cont.className='acciones';
      cont.innerHTML='<div style="font-size:12px;color:var(--muted)">Cambios propuestos — revisá y confirmá:</div>';
      j.acciones.forEach(acc=>cont.appendChild(tarjetaAccion(acc)));
      bubble.appendChild(cont);
    }
  }catch(e){
    pensando.querySelector('.bubble').innerHTML='<span style="color:#ff8a7a">No se pudo contactar al asistente. ¿Está corriendo Ollama? ('+esc(String(e))+')</span>';
  }finally{ $('chatEnviar').disabled=false; $('chatBox').scrollTop=$('chatBox').scrollHeight; }
}
let _chatSaludado=false;
function renderAsistente(){
  if(!_chatSaludado){ _chatSaludado=true;
    chatAppend('bot','¡Hola! Soy tu asistente local de prensas. Preguntame sobre los lotes (estado, vencidos, criterios) o pedime cambios — los aplico solo si los confirmás.');
  }
}

/* ===================== NAV / INIT ===================== */
function renderActive(){
  const v=document.querySelector('.tabs button.active').dataset.v;
  if(v==='dashboard')renderDashboard();
  else if(v==='riesgo')renderRiesgo();
  else if(v==='lotes')renderLotes();
  else if(v==='analisis')renderAnalisis();
  else if(v==='agregados')renderAgregados();
  else if(v==='evolucion')renderEvolucion();
  else if(v==='degustacion')renderDegustacion();
  else if(v==='orden')renderOrden();
  else if(v==='relleno')renderRelleno();
  else if(v==='asistente')renderAsistente();
}
function setupTabs(){
  $('tabs').addEventListener('click',e=>{ const b=e.target.closest('button[data-v]'); if(!b)return;
    document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); $('v-'+b.dataset.v).classList.add('active'); renderActive();
  });
}
function setup(){
  setupTabs();
  pedirUsuario(false);
  $('usuario').onclick=()=>pedirUsuario(true);
  $('btnHistorial').onclick=verHistorial;
  $('btnConectar').onclick=mostrarQR;
  $('selMes').onchange=()=>renderActive();
  $('btnGuardar').onclick=()=>guardar();   // ojo: sin argumento (el click pasaría el evento como "forzar")
  $('btnExport').onclick=async()=>{ if(dirty){ if(!await guardar())return; } window.location=API+'/exportar'; };
  $('buscaLotes').oninput=renderLotes; $('btnAddLote').onclick=()=>{ DATOS.lotes.unshift({lote:null,variedad:null,origen:null,ig:null,id_origen:null,ot_prensado:null,litros:null,dia_prensado:null,prensa:null,so2_agregado:null,comentario:null,accion:null,comentario2:null,accion2:null}); markDirty(); renderLotes(); };
  $('buscaAna').oninput=renderAnalisis;
  $('btnLimpiarFltAna').onclick=limpiarFiltrosAna;
  $('buscaEvo').oninput=renderEvolucion;
  $('btnEvoNoOk').onclick=()=>{ $('btnEvoNoOk').classList.toggle('active'); renderEvolucion(); };
  $('btnLimpiarFltEvo').onclick=limpiarFiltrosEvo;
  $('ordenEvo').onchange=()=>{ ordenEvo=$('ordenEvo').value; renderEvolucion(); };
  $('evoLista').addEventListener('click', e=>{ const h=e.target.closest('.evo-cardhead'); if(h) evoToggleCard(h.closest('.evo-card')); });
  $('buscaRiesgo').oninput=renderRiesgo;
  $('btnLimpiarFltRiesgo').onclick=limpiarFiltrosRiesgo;
  // degustación
  if(!$('degFecha').value){ const d=new Date(),z=n=>String(n).padStart(2,'0'); $('degFecha').value=`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }
  $('buscaDeg').oninput=renderDegustacion;
  $('btnLimpiarFltDeg').onclick=limpiarFiltrosDeg;
  $('selMesDeg').onchange=renderDegustacion;
  (()=>{ const td=$('tDeg');
    td.addEventListener('click',e=>{
      const be=e.target.closest('[data-degestado]'); if(be){ setDegEstado(be.dataset.degestado, be.dataset.e); return; }
      const bm=e.target.closest('[data-degmotivo]'); if(bm){ setDegMotivo(bm.dataset.degmotivo, bm.dataset.m); return; }
    });
    td.addEventListener('input',e=>{
      const ci=e.target.closest('[data-degcom]'); if(ci){ const dg=getDegRow(ci.dataset.degcom,mesActual(),true); dg.comentario=ci.value; if(dg.estado&&!dg.fecha)dg.fecha=($('degFecha').value||null); podarDeg(dg); markDirty(); return; }
      const oi=e.target.closest('[data-degotro]'); if(oi){ const dg=getDegRow(oi.dataset.degotro,mesActual(),true); dg.motivo_detalle=oi.value; markDirty(); return; }
    });
  })();
  // acción rápida (corrección SO2)
  if(!$('arFecha').value){ const d=new Date(),z=n=>String(n).padStart(2,'0'); $('arFecha').value=`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }
  $('btnGenAccion').onclick=()=>{ $('accionWrap').style.display='block'; regenerarAccion(); $('accionWrap').scrollIntoView({behavior:'smooth',block:'start'}); };
  $('btnArOcultar').onclick=()=>{ $('accionWrap').style.display='none'; };
  $('btnArRegenerar').onclick=regenerarAccion;
  $('btnArImprimir').onclick=()=>window.print();
  ['arNro','arFecha','arDensidad','arEmitio','arRecibio'].forEach(id=>{ const el=$(id); el.addEventListener('input',pintarAccion); el.addEventListener('change',pintarAccion); });
  $('arVasija').oninput=arAplicar; $('arMl').oninput=arAplicar;
  $('btnArAplicar').onclick=arAplicar;
  $('btnArAddFila').onclick=()=>{ arRows.push(arFilaVacia()); pintarAccion(); };
  (()=>{ const arc=$('accionPaginas');
    arc.addEventListener('input',e=>{ const el=e.target.closest('.ar-cell'); if(!el)return; const r=arRows[+el.dataset.gi]; if(r) r[el.dataset.f]=el.value; });
    arc.addEventListener('click',e=>{ const b=e.target.closest('[data-ardel]'); if(!b)return; arRows.splice(+b.dataset.ardel,1); pintarAccion(); });
  })();
  $('btnLimpiarFltLotes').onclick=limpiarFiltrosLotes;
  document.addEventListener('click',()=>document.querySelectorAll('.mfilt-panel.open').forEach(p=>p.classList.remove('open')));
  // orden de muestras
  if(!$('ordFecha').value){ const d=new Date(),z=n=>String(n).padStart(2,'0'); $('ordFecha').value=`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }
  // fuente/filtros -> regeneran la lista
  $('ordenFuente').addEventListener('change',()=>{ ordenRows=[]; regenerarOrden(); });
  $('ordenNookTipo').addEventListener('change',regenerarOrden);
  $('btnLimpiarFltOrden').onclick=limpiarFiltrosOrden;
  $('btnRegenerar').onclick=regenerarOrden;
  // encabezado/pie -> solo repintan
  ['ordNro','ordFecha','ordDia','ordRecibio'].forEach(id=>{ const el=$(id); el.addEventListener('input',pintarOrden); el.addEventListener('change',pintarOrden); });
  // defaults recipiente/cantidad/vasija -> aplican a todas las filas
  $('ordRecipiente').onchange=()=>ordAplicar('recipiente');
  $('ordVasija').oninput=()=>ordAplicar('vasija');
  $('ordCant').oninput=()=>ordAplicar('cant');
  $('ordCantMenos').onclick=()=>{ $('ordCant').value=Math.max(1,(parseInt($('ordCant').value,10)||1)-1); ordAplicar('cant'); };
  $('ordCantMas').onclick=()=>{ $('ordCant').value=(parseInt($('ordCant').value,10)||0)+1; ordAplicar('cant'); };
  $('btnAplicarTodos').onclick=()=>ordAplicar('todos');
  $('btnAddOrdenFila').onclick=()=>{ ordenRows.push(filaOrdenVacia()); pintarOrden(); };
  // edición de celdas (delegación)
  const cont=$('ordenPaginas');
  cont.addEventListener('input',e=>{
    const pie=e.target.closest('[data-mapapieord]');
    if(pie){ const m=ordenMapas[+pie.dataset.mapapieord]; if(m) m.pie=pie.value; return; }
    const el=e.target.closest('.ord-cell'); if(!el)return; const r=ordenRows[+el.dataset.gi]; if(r) r[el.dataset.f]=el.value;
  });
  cont.addEventListener('change',e=>{ const el=e.target.closest('select.ord-cell'); if(!el)return; const r=ordenRows[+el.dataset.gi]; if(r) r[el.dataset.f]=el.value; });
  cont.addEventListener('click',e=>{ const b=e.target.closest('[data-delrow]'); if(!b)return; ordenRows.splice(+b.dataset.delrow,1); pintarOrden(); });
  // mapas de barriles: adjuntar una o varias imágenes, cada una anexada como hoja final
  $('btnOrdMapa').onclick=()=>$('ordMapaFile').click();
  $('ordMapaFile').addEventListener('change',e=>{
    const files=[...(e.target.files||[])]; if(!files.length)return;
    const slots=new Array(files.length); let pend=files.length;
    files.forEach((f,idx)=>{
      const rd=new FileReader();
      rd.onload=()=>{ slots[idx]={src:rd.result,nombre:f.name,pie:''};
        if(--pend===0){ ordenMapas.push(...slots); pintarMapaChipsOrden(); pintarOrden(); } };
      rd.readAsDataURL(f);
    });
    e.target.value='';
  });
  $('ordMapaChips').addEventListener('click',e=>{ const b=e.target.closest('[data-delmapaord]'); if(!b)return;
    ordenMapas.splice(+b.dataset.delmapaord,1); pintarMapaChipsOrden(); pintarOrden(); });
  $('btnImprimir').onclick=()=>window.print();
  // título "Orden de Trabajo" editable y centrado: guarda en ordenTitulos y
  // sincroniza el mismo texto en todas las hojas de la orden
  ['ordenPaginas','rellenoPaginas','accionPaginas','agrOrdenPaginas'].forEach(id=>{ const c=$(id); if(!c) return;
    c.addEventListener('input',e=>{ const t=e.target; const k=t.dataset.titkey; if(!k) return;
      ordenTitulos[k]=t.value;
      c.querySelectorAll(`input[data-titkey="${k}"]`).forEach(o=>{ if(o!==t) o.value=t.value; });
    });
  });
  // rellenos
  if(!$('relFecha').value){ const d=new Date(),z=n=>String(n).padStart(2,'0'); $('relFecha').value=`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }
  if(!$('relInstrucciones').value) $('relInstrucciones').value=REL_INSTRUCCIONES_DEF;
  if(!$('relPie').value) $('relPie').value=REL_PIE_DEF;
  poblarRelVar();
  poblarRelOrigen();
  // agregar variedad al filtro (multi-variedad)
  $('relVarAdd').addEventListener('change',e=>{ const v=e.target.value; if(v==='')return; if(!rellenoVariedades.includes(v)) rellenoVariedades.push(v); e.target.value=''; poblarRelVar(); pintarChipsVar(); poblarRelOrigen(); pintarChipsOrigen(); regenerarRelleno(); });
  // quitar chip de variedad
  $('relVarChips').addEventListener('click',e=>{ const b=e.target.closest('[data-delvar]'); if(!b)return; const v=b.dataset.delvar; rellenoVariedades=rellenoVariedades.filter(x=>x!==v); poblarRelVar(); pintarChipsVar(); poblarRelOrigen(); pintarChipsOrigen(); regenerarRelleno(); });
  // agregar lote origen
  $('relOrigenAdd').addEventListener('change',e=>{ const v=e.target.value; if(v==='')return; const n=+v; if(!rellenoOrigenes.includes(n)) rellenoOrigenes.push(n); e.target.value=''; poblarRelOrigen(); pintarChipsOrigen(); regenerarRelleno(); });
  // quitar chip de origen
  $('relOrigenChips').addEventListener('click',e=>{ const b=e.target.closest('[data-delorigen]'); if(!b)return; const n=+b.dataset.delorigen; rellenoOrigenes=rellenoOrigenes.filter(x=>x!==n); poblarRelOrigen(); pintarChipsOrigen(); regenerarRelleno(); });
  // "Rellenar con (defecto)" -> aplicar a todas las filas
  $('relRellenarCon').addEventListener('change',()=>{ const v=$('relRellenarCon').value; rellenoRows.forEach(r=>r.rellenarCon=v); pintarRelleno(); });
  $('btnRegenerarRelleno').onclick=regenerarRelleno;
  // encabezado/pie/instrucciones -> solo repintan
  ['relNro','relFecha','relDia','relEmitio','relRecibio','relInstrucciones','relPie'].forEach(id=>{ const el=$(id); el.addEventListener('input',pintarRelleno); el.addEventListener('change',pintarRelleno); });
  // defaults vasija/cantidad -> aplican a todas las filas
  $('relVasija').oninput=()=>{ rellenoRows.forEach(r=>r.vasija=$('relVasija').value); pintarRelleno(); };
  $('relCant').oninput=()=>{ rellenoRows.forEach(r=>r.cant=$('relCant').value); pintarRelleno(); };
  $('relCantMenos').onclick=()=>{ $('relCant').value=Math.max(1,(parseInt($('relCant').value,10)||1)-1); rellenoRows.forEach(r=>r.cant=$('relCant').value); pintarRelleno(); };
  $('relCantMas').onclick=()=>{ $('relCant').value=(parseInt($('relCant').value,10)||0)+1; rellenoRows.forEach(r=>r.cant=$('relCant').value); pintarRelleno(); };
  $('btnAddRellenoFila').onclick=()=>{ rellenoRows.push({lote:'',vasija:$('relVasija').value||'barril',cant:$('relCant').value||'1',rellenarCon:$('relRellenarCon').value||''}); pintarRelleno(); };
  // edición de celdas (delegación)
  const contRel=$('rellenoPaginas');
  contRel.addEventListener('input',e=>{
    const pie=e.target.closest('[data-mapapie]');
    if(pie){ const m=rellenoMapas[+pie.dataset.mapapie]; if(m) m.pie=pie.value; return; }
    const el=e.target.closest('.rel-cell'); if(!el)return; const r=rellenoRows[+el.dataset.gi]; if(r) r[el.dataset.f]=el.value;
  });
  contRel.addEventListener('click',e=>{ const b=e.target.closest('[data-delrow]'); if(!b)return; rellenoRows.splice(+b.dataset.delrow,1); pintarRelleno(); });
  // mapas de barriles: adjuntar una o varias imágenes, cada una anexada como hoja final
  $('btnRelMapa').onclick=()=>$('relMapaFile').click();
  $('relMapaFile').addEventListener('change',e=>{
    const files=[...(e.target.files||[])]; if(!files.length)return;
    const slots=new Array(files.length); let pend=files.length;
    files.forEach((f,idx)=>{
      const rd=new FileReader();
      rd.onload=()=>{ slots[idx]={src:rd.result,nombre:f.name,pie:''};
        if(--pend===0){ rellenoMapas.push(...slots); pintarMapaChips(); pintarRelleno(); } };
      rd.readAsDataURL(f);
    });
    e.target.value='';
  });
  $('relMapaChips').addEventListener('click',e=>{ const b=e.target.closest('[data-delmapa]'); if(!b)return;
    rellenoMapas.splice(+b.dataset.delmapa,1); pintarMapaChips(); pintarRelleno(); });
  $('btnImprimirRelleno').onclick=()=>window.print();
  // asistente
  $('chatEnviar').onclick=enviarPregunta;
  $('chatPregunta').addEventListener('keydown',e=>{ if(e.key==='Enter') enviarPregunta(); });
  document.querySelectorAll('.chip-ej').forEach(b=>b.onclick=()=>{ $('chatPregunta').value=b.textContent; enviarPregunta(); });
  $('btnAddAna').onclick=()=>{ DATOS.analisis.unshift({lote:null,mes:null,fecha:null,etanol:null,ph:null,av:null,gluc:null,malico:null,lactico:null,at:null,azucar:null,so2l:null,so2t:null,ot:null}); markDirty(); renderAnalisis(); };
  // agregados
  if(!$('agrFecha').value){ const d=new Date(),z=n=>String(n).padStart(2,'0'); $('agrFecha').value=`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }
  $('agrUnidad').value=unidadPorTipo($('agrTipo').value);
  $('agrTipo').onchange=()=>{ $('agrUnidad').value=unidadPorTipo($('agrTipo').value); };
  $('buscaAgr').oninput=renderAgregados;
  $('btnLimpiarFltAgr').onclick=limpiarFiltrosAgr;
  $('btnImprimirAgr').onclick=()=>window.print();
  // orden de trabajo de agregados
  if(!$('agrOrdFecha').value){ const d=new Date(),z=n=>String(n).padStart(2,'0'); $('agrOrdFecha').value=`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }
  $('btnAgrOrden').onclick=()=>{ const w=$('agrOrdenWrap'); const ver=w.style.display==='none'; w.style.display=ver?'block':'none'; if(ver){ pintarAgrOrden(); w.scrollIntoView({behavior:'smooth',block:'start'}); } };
  $('btnAgrOrdOcultar').onclick=()=>{ $('agrOrdenWrap').style.display='none'; };
  $('btnAgrOrdFiltrados').onclick=agrOrdAgregarFiltrados;
  $('btnAgrOrdVaciar').onclick=agrOrdVaciar;
  $('btnAgrOrdAdd').onclick=agrOrdAgregarManual;
  $('btnAgrOrdPegar').onclick=agrOrdAgregarPegados;
  ['agrOrdLote','agrOrdCant'].forEach(id=>$(id).addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); agrOrdAgregarManual(); } }));
  $('btnAgrOrdImprimir').onclick=()=>window.print();
  ['agrOrdNro','agrOrdFecha','agrOrdEmitio','agrOrdRecibio'].forEach(id=>{ const el=$(id); el.addEventListener('input',pintarAgrOrden); el.addEventListener('change',pintarAgrOrden); });
  (()=>{ const c=$('agrOrdenPaginas');
    c.addEventListener('input',e=>{ const el=e.target.closest('.agr-ord-cell'); if(!el)return; const r=agrOrdenRows[+el.dataset.gi]; if(r) r[el.dataset.f]=el.value; });
    c.addEventListener('click',e=>{ const b=e.target.closest('[data-agrorddel]'); if(!b)return; agrOrdenRows.splice(+b.dataset.agrorddel,1); pintarAgrOrden(); });
  })();
  $('btnAddAgr').onclick=()=>{
    const lote=parseInt($('agrLote').value,10);
    if(isNaN(lote)||!mapaLotes().has(lote)){ alert('Ingresá un lote válido (existente).'); return; }
    const cantidad=num($('agrCant').value);
    if(cantidad==null){ alert('Ingresá una cantidad numérica.'); return; }
    DATOS.agregados.unshift({id:nextAgregadoId(), lote, fecha:($('agrFecha').value||null),
      tipo:$('agrTipo').value, cantidad, unidad:($('agrUnidad').value||null)});
    $('agrLote').value=''; $('agrCant').value='';
    markDirty(); renderAgregados();
  };
  // cargar agregados (pegar desde Excel)
  $('btnAgrImport').onclick=()=>{ const w=$('agrImportWrap'); const ver=w.style.display==='none'; w.style.display=ver?'block':'none'; if(ver) w.scrollIntoView({behavior:'smooth',block:'start'}); };
  $('btnAnalizarAgr').onclick=analizarPegadoAgr;
  $('btnConfirmarCargaAgr').onclick=confirmarCargaAgr;
  $('agrFileCsv').onchange=e=>{ const f=e.target.files[0]; if(!f)return; const rd=new FileReader(); rd.onload=()=>{$('agrPasteArea').value=rd.result; analizarPegadoAgr();}; rd.readAsText(f); };
  $('btnAnalizar').onclick=analizarPegado; $('btnConfirmarCarga').onclick=confirmarCarga;
  $('fileCsv').onchange=e=>{ const f=e.target.files[0]; if(!f)return; const rd=new FileReader(); rd.onload=()=>{$('pasteArea').value=rd.result; analizarPegado();}; rd.readAsText(f); };
  setInterval(vigilarEstado, 60000);   // vigilancia periódica de conflictos
  cargar();
}
setup();

/* ===== cellSelect — selección de celdas tipo Excel (tecla Alt) =====
   MANTENER SINCRONIZADO: bloque idéntico en app.js y en reporte.py (string JS).
   Sin dependencias, ES5. Se auto-inicializa con listeners a nivel document. */
(function(){
  'use strict';
  if (window.__cellSelectReady) return;
  window.__cellSelectReady = true;

  var sel = new Set();     // celdas (td) actualmente marcadas
  var selTable = null;     // tabla dueña de la selección actual
  var anchor = null;       // celda ancla del rango en curso
  var rangeBase = [];      // celdas a preservar bajo el rango en curso
  var dragging = false;
  var hud = null, hudTimer = null;

  function cellAt(t){ return t && t.closest ? t.closest('td,th') : null; }

  function clearSel(){
    sel.forEach(function(c){ c.classList.remove('cs-sel'); });
    sel = new Set(); anchor = null; rangeBase = []; selTable = null;
  }
  function addCell(c){ if(!sel.has(c)){ sel.add(c); c.classList.add('cs-sel'); } }
  function resetTo(base){
    sel.forEach(function(c){ if (base.indexOf(c) === -1) c.classList.remove('cs-sel'); });
    sel = new Set();
    for (var i=0;i<base.length;i++){ sel.add(base[i]); base[i].classList.add('cs-sel'); }
  }

  function selectRange(a, b){
    var table = a.closest('table');
    var rmin = Math.min(a.parentNode.rowIndex, b.parentNode.rowIndex);
    var rmax = Math.max(a.parentNode.rowIndex, b.parentNode.rowIndex);
    var cmin = Math.min(a.cellIndex, b.cellIndex);
    var cmax = Math.max(a.cellIndex, b.cellIndex);
    var rows = table.rows;
    for (var i=0;i<rows.length;i++){
      var tr = rows[i];
      if (tr.rowIndex < rmin || tr.rowIndex > rmax) continue;
      var cells = tr.cells;
      for (var j=0;j<cells.length;j++){
        var cell = cells[j];
        if (cell.tagName === 'TD' && cell.cellIndex >= cmin && cell.cellIndex <= cmax){ addCell(cell); }
      }
    }
  }
  function selectColumn(th){
    var tb = th.closest('table').tBodies[0];
    if (!tb) return;
    var ci = th.cellIndex, rows = tb.rows;
    for (var i=0;i<rows.length;i++){
      var cell = rows[i].cells[ci];
      if (cell && cell.tagName === 'TD') addCell(cell);
    }
  }

  function cellText(cell){
    var f = cell.querySelector('input, textarea, select');
    if (f) return f.value == null ? '' : String(f.value);
    return (cell.innerText || cell.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function buildTSV(){
    if (!sel.size) return '';
    var map = {}, rmin=Infinity, rmax=-Infinity, cmin=Infinity, cmax=-Infinity;
    sel.forEach(function(cell){
      var r = cell.parentNode.rowIndex, c = cell.cellIndex;
      map[r+','+c] = cellText(cell);
      if(r<rmin)rmin=r; if(r>rmax)rmax=r; if(c<cmin)cmin=c; if(c>cmax)cmax=c;
    });
    var out = [];
    for (var r=rmin;r<=rmax;r++){
      var line = [];
      for (var c=cmin;c<=cmax;c++){ line.push(map[r+','+c] != null ? map[r+','+c] : ''); }
      out.push(line.join('\t'));
    }
    return out.join('\n');
  }

  function ensureHud(){
    if (hud) return hud;
    hud = document.createElement('div');
    hud.className = 'cs-hud';
    document.body.appendChild(hud);
    return hud;
  }
  function updateHud(){
    if (!sel.size){ if (hud) hud.classList.remove('show'); return; }
    var rmin=Infinity, rmax=-Infinity, cmin=Infinity, cmax=-Infinity;
    sel.forEach(function(cell){
      var r=cell.parentNode.rowIndex, c=cell.cellIndex;
      if(r<rmin)rmin=r; if(r>rmax)rmax=r; if(c<cmin)cmin=c; if(c>cmax)cmax=c;
    });
    var h = ensureHud();
    h.textContent = sel.size + ' celdas · ' + (rmax-rmin+1) + '×' + (cmax-cmin+1);
    h.classList.remove('cs-ok'); h.classList.add('show');
  }
  function flash(msg, ok){
    var h = ensureHud();
    h.textContent = msg;
    h.classList.add('show'); h.classList.toggle('cs-ok', !!ok);
    clearTimeout(hudTimer);
    hudTimer = setTimeout(function(){ h.classList.remove('show'); }, 1300);
  }

  function copyText(text){
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){ flash('Copiado ✓', true); },
        function(){ fallbackCopy(text); });
    } else { fallbackCopy(text); }
  }
  function fallbackCopy(text){
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position='fixed'; ta.style.top='-1000px'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch(e){}
    document.body.removeChild(ta);
    flash(ok ? 'Copiado ✓' : 'No se pudo copiar', ok);
  }

  document.addEventListener('mousedown', function(e){
    if (!e.altKey){ if (sel.size){ clearSel(); updateHud(); } return; }
    var cell = cellAt(e.target);
    var table = cell && cell.closest('table');
    if (!table){ if (sel.size){ clearSel(); updateHud(); } return; }
    e.preventDefault();
    var additive = e.ctrlKey || e.metaKey;
    if (selTable && selTable !== table) clearSel();

    if (cell.tagName === 'TH'){
      if (!additive) clearSel();
      selectColumn(cell);
      anchor = null; dragging = false;
      selTable = table; table.classList.add('cs-arming');
      rangeBase = Array.from(sel);
      updateHud();
      return;
    }

    var extend = e.shiftKey && anchor && anchor.closest('table') === table;
    if (extend){
      resetTo(rangeBase);
      selectRange(anchor, cell);
    } else {
      if (!additive) clearSel();
      rangeBase = Array.from(sel);
      anchor = cell;
      selectRange(anchor, cell);
    }
    selTable = table; table.classList.add('cs-arming');
    dragging = true;
    updateHud();
  });

  document.addEventListener('mousemove', function(e){
    if (!dragging || !anchor) return;
    var cell = cellAt(e.target);
    if (!cell || cell.tagName !== 'TD' || cell.closest('table') !== selTable) return;
    resetTo(rangeBase);
    selectRange(anchor, cell);
    updateHud();
  });

  document.addEventListener('mouseup', function(){
    dragging = false;
    var armed = document.querySelectorAll('table.cs-arming');
    for (var i=0;i<armed.length;i++) armed[i].classList.remove('cs-arming');
  });

  document.addEventListener('click', function(e){
    if (!e.altKey) return;
    var cell = cellAt(e.target);
    if (cell && cell.closest('table')){ e.stopPropagation(); e.preventDefault(); }
  }, true);

  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ if (sel.size){ clearSel(); updateHud(); } return; }
    var isCopy = (e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C');
    if (isCopy && sel.size){ copyText(buildTSV()); e.preventDefault(); }
  });
})();
