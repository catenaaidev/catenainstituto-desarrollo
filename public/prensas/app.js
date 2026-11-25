/* ===== Control de Prensas — lógica de la app ===== */
'use strict';

/* Base de la API del modulo. Antes era '/api'; al vivir los tres modulos en un
   mismo sitio, cada uno tiene su propio prefijo. Es el UNICO cambio que la
   migracion introduce en este archivo. */
const API = '/prensas/api';

/* ---------- filtros/orden que sobreviven al F5 (shared/filtros-sesion.js) ----------
   _FS puede faltar (servidor de prueba viejo, tests): en ese caso _lf cae en el
   valor por defecto y _gf no hace nada, como si la pestaña no persistiera nada. */
const _FS = window.CIWFiltros;
const _lf = (k,d) => _FS ? _FS.leer('prensas:'+k, d) : d;
const _gf = (k,v) => { if(_FS) _FS.guardar('prensas:'+k, v); };
const _sortValido = s => !!s && typeof s.key==='string' && (s.dir===1 || s.dir===-1);

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
   Los umbrales se editan en la pestaña Configuración (menú Más) y viven en
   DATOS.config.alertas; los valores por defecto y la validación están en
   shared/reglas-alertas.js, que también usa el reporte del servidor.
   NO OK si (por defecto): pH > 4 · AV >= 1 (o AV = -999, inválida) · Gluc/Fruc > 3 · Málico > 0.5
   REGLAS se rellena en aplicarReglas(): se muta en el lugar, así todo el que
   lee REGLAS.X ve el valor vigente. El −999 no es configurable. */
const REGLAS={AV_INVALIDA:-999};
function aplicarReglas(){
  const r=reglasAlertas(DATOS&&DATOS.config);
  Object.assign(REGLAS,{PH_MAX:r.ph_max, AV_MAX:r.av_max, AV_ATENCION:r.av_atencion, AV_SALTO:r.av_salto,
    GLUC_MAX:r.gluc_max, MALICO_MAX:r.malico_max, VENCIDO_DIAS:r.vencido_dias, PROXIMO_DIAS:r.proximo_dias, ACCION_ML:r.accion_ml});
  // textos fijos del HTML que citan un umbral
  document.querySelectorAll('[data-regla]').forEach(el=>{ el.textContent=r[el.dataset.regla]; });
  document.querySelectorAll('[data-plantilla]').forEach(el=>{ el.textContent=el.dataset.plantilla.replace(/\{(\w+)\}/g,(_,k)=>r[k]); });
  const ml=$('arMl'); if(ml) ml.value=r.accion_ml;
  return r;
}
aplicarReglas();
const badPH    = v => v!=null && v>REGLAS.PH_MAX;
const badAVhi  = v => v!=null && v>=REGLAS.AV_MAX;
const badAVneg = v => v!=null && v==REGLAS.AV_INVALIDA;
const badAV    = v => badAVhi(v) || badAVneg(v);
const badGluc  = v => v!=null && v>REGLAS.GLUC_MAX;
const badMalico= v => v!=null && v>REGLAS.MALICO_MAX;

const MEAS=['etanol','ph','av','gluc','malico','lactico','at','azucar','so2l','so2t'];
const esSeparador = a => MEAS.every(k=>a[k]==null||a[k]==='');
function mapaLotes(){ const m=new Map(); for(const l of DATOS.lotes) m.set(+l.lote,l); return m; }
const PM = () => window.PrensasMods;
/* Filtro Todos | Llenos | Vacíos de Lotes, Análisis y Degustación (shared/filtro-llenado.js).
   Se crean al cargar (necesitan el puente) y arrancan siempre en Todos. */
const filtroLlenado = {lotes:null, ana:null, deg:null};
function initFiltrosLlenado(){
  const crear=(id,render,clave)=>{ const f=PM().crearFiltroLlenado(render, PM().esVaciado, clave); const h=$(id); if(h) h.replaceChildren(f.el); return f; };
  filtroLlenado.lotes=crear('fltLlenadoLotes', ()=>renderLotes(), 'prensas:llenado:lotes');
  filtroLlenado.ana=crear('fltLlenadoAna', ()=>renderAnalisis(), 'prensas:llenado:ana');
  filtroLlenado.deg=crear('fltLlenadoDeg', ()=>renderDegustacion(), 'prensas:llenado:deg');
}

/* Años de vendimia (shared/selector-anios.js). Antes de montar, se ve todo. */
let SEL_ANIOS=null;
/* false hasta que cargar() creó todos los filtros: montarAnios() avisa el
   cambio de años en el acto (evento síncrono) y, sin esta guarda, el primer
   aviso dibujaba antes de que existieran los filtros. cargar() dibuja solo
   al final, ya con los años montados. */
let listo=false;
const visibleAnio = lote => !SEL_ANIOS || SEL_ANIOS.visible(lote);
const lotesVis = () => DATOS.lotes.filter(l=>visibleAnio(l.lote));
function montarAnios(){
  if(!SEL_ANIOS) SEL_ANIOS=PM().crearSelectorAnios({claveLS:'prensas_anios', idContenedor:'selAnios', evento:'prensas:anios-cambiados'});
  SEL_ANIOS.montar(DATOS.lotes);
}
document.addEventListener('prensas:anios-cambiados', ()=>{
  if(!DATOS || !listo) return;
  initMesSelectors(); initFiltroVariedad(); initAgrLotes();
  renderActive();
});

const UNIDAD_DEFECTO = {TH2:'g/L', SO2:'ppm'};
const unidadPorTipo = t => UNIDAD_DEFECTO[t] || '';
function nextAgregadoId(){ let mx=0; for(const a of DATOS.agregados){ const n=+a.id; if(!isNaN(n)&&n>mx) mx=n; } return mx+1; }

/* Copia del documento tal como lo trajo esta pantalla (o como quedó en su
   último guardado): contra ella se calcula qué cambió acá, para combinarlo con
   lo que guardaron otros (shared/fusion.js). */
let BASE = null;
const FUSION = window.CIWFusion;
const borradorActual = () => ({ base: BASE, local: DATOS });
/* Cuenta las ediciones: si mientras viaja un guardado se edita algo más, al
   volver la respuesta la pantalla NO queda como guardada (eso no se envió). */
let ediciones = 0;
function markDirty(){ ediciones++; dirty=true; $('btnGuardar').disabled=false; const s=$('status'); s.textContent='Cambios sin guardar'; s.className='status dirty';
  if(FUSION && DATOS) FUSION.borrador.programar('prensas', borradorActual); }
function markSaved(){ dirty=false; $('btnGuardar').disabled=true; const s=$('status'); s.textContent='Guardado · v'+DATOS.meta.version; s.className='status saved'; }

window.addEventListener('beforeunload', e => { if(dirty){ e.preventDefault(); e.returnValue=''; } });

/* ---------- usuario (trazabilidad: quién guarda) ---------- */
function usuarioActual(){ try{ return localStorage.getItem('prensas_usuario')||''; }catch(e){ return ''; } }
function pedirUsuario(forzar){
  let u=usuarioActual();
  if(!u||forzar){
    const r=(prompt('¿Quién está usando la app?\n(Queda registrado en cada guardado, para el historial.)', u||'')||'').trim();
    if(r){ u=r; try{ localStorage.setItem('prensas_usuario',u); }catch(e){} }
  }
  $('usuario').textContent=(u||'(sin nombre)');
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
    mostrarOverlay('<h2 style="margin-top:0">Historial de guardados</h2>'+
      '<p style="color:var(--muted);font-size:12px;margin-top:-6px">Quién guardó, cuándo y qué cambió. Una edición de un análisis cuenta como −1/+1.</p>'+
      '<div style="max-height:60vh;overflow:auto"><table class="hist">'+
      '<thead><tr><th>Versión</th><th>Fecha</th><th>Autor</th><th>Cambios</th></tr></thead>'+
      '<tbody>'+(filas||'<tr><td colspan="4" style="color:var(--muted)">Todavía no hay registros: se anotan a partir de ahora, con cada Guardar.</td></tr>')+'</tbody></table></div>'+
      '<div style="margin-top:12px;text-align:right"><button class="btn" onclick="cerrarOverlay()">Cerrar</button></div>');
  }catch(e){ alert('No se pudo cargar el historial.'); }
}
function cerrarOverlay(){ $('overlay').classList.remove('show'); }

/* ---------- API ---------- */
async function cargar(){
  const r = await fetch(API+'/datos');
  if(!r.ok){
    // Sin esto, un 401/403/500 quedaba como DATOS={error…} y la pantalla se
    // rompía a medio cargar sin decir nada.
    if(r.status===401){ location.replace('/login.html'); return; }
    const j=await r.json().catch(()=>({}));
    if(j.error==='debe_cambiar_clave'){ location.replace('/cambiar-clave.html'); return; }
    $('status').textContent='No se pudieron cargar los datos ('+r.status+'): '+((j.detalles&&j.detalles[0])||'probá recargar.');
    return;
  }
  DATOS = await r.json();
  DATOS.meta = DATOS.meta || {version:0};
  DATOS.degustaciones = DATOS.degustaciones || [];
  DATOS.agregados = DATOS.agregados || [];
  BASE = FUSION ? FUSION.clonar(DATOS) : null;
  // Cambios que quedaron sin guardar en este equipo (recarga, corte, sesión vencida).
  const recuperado = FUSION ? await FUSION.recuperar('prensas', DATOS) : null;
  if(recuperado){ DATOS = recuperado; DATOS.degustaciones = DATOS.degustaciones || []; DATOS.agregados = DATOS.agregados || []; }
  aplicarReglas();   // umbrales de DATOS.config.alertas (también si se recuperó un borrador)
  markSaved();
  if(recuperado) markDirty();
  montarAnios();
  initMesSelectors();
  initFiltroVariedad();
  initFiltrosLotes();
  initFiltrosAna();
  initFiltrosAgr();
  initFiltrosDeg();
  initFiltrosRiesgo();
  initFiltrosOrden();
  initFiltrosLlenado();
  initAgrLotes();
  listo=true;
  renderActive();
  /* Modo órdenes: se llegó desde la sección Órdenes de trabajo. */
  const modo = PM().leerModoOrden(location.search);
  // Se saca siempre (también si la orden no existe o el tipo es desconocido,
  // o si arrancarModoOrden falla): la puso el script del <head> de index.html.
  try { if (modo) arrancarModoOrden(modo); }
  finally { document.documentElement.classList.remove('modo-ordenes-cargando'); }
  cargarInfoRed();
  vigilarEstado();
}
/* Modo órdenes (/prensas/?orden=nueva:<tipo> o ?orden=<id>): Prensas muestra
   solo esa orden, con una banda para volver a la sección Órdenes de trabajo. */
function arrancarModoOrden(modo){
  document.body.classList.add('modo-ordenes');
  $('modoOrdenes').hidden=false;
  $('modoOrdenesVolver').href=PM().urlVolver(location.search);
  const titular=()=>{
    const m=PM().leerModoOrden(location.search);
    $('modoOrdenesTit').textContent=PM().tituloModoPrensas(PM().destinoPrensas(m,DATOS),DATOS);
  };
  const sinVista=msg=>{ $('modoOrdenesTit').textContent=msg; document.querySelectorAll('.view').forEach(s=>s.classList.remove('active')); };
  const dest=PM().destinoPrensas(modo,DATOS);
  if(dest.accion==='hoja-nueva'){
    if(window.CIW && window.CIW.rol==='lector'){ sinVista('No tenés permiso para emitir órdenes en Prensas'); return; }
    abrirHojaNueva(dest.tipo);
  } else if(dest.accion==='ver-hoja'){
    abrirHojaGuardada(dest.id);
  } else {
    sinVista(dest.accion==='no-existe' ? 'Esta orden no existe (¿la borraron?)' : 'Tipo de orden desconocido');
    return;
  }
  titular();
  document.addEventListener('prensas:modo-orden-cambio', titular);
}
/* N° del input de cabecera por tipo de hoja, y la función que la vuelve a
   pintar (para repintar al llegar el número propuesto). */
const NRO_INPUT_DE_TIPO={'prensas-muestras':'ordNro','prensas-rellenos':'relNro','prensas-accion':'arNro','prensas-agregados':'agrOrdNro'};
function repintarDe(tipo){
  if(tipo==='prensas-muestras') return pintarOrden;
  if(tipo==='prensas-rellenos') return pintarRelleno;
  if(tipo==='prensas-accion') return pintarAccion;
  if(tipo==='prensas-agregados') return pintarAgrOrden;
  return ()=>{};
}
/* Abre una hoja NUEVA del tipo pedido (hoja-nueva del modo órdenes): activa su
   vista, y en Acción rápida / Agregados abre también el panel de la hoja.
   Propone el N° de la carpeta de OneDrive al lado del input, como en Lotes. */
function abrirHojaNueva(tipo){
  const t=PM().TIPOS_HOJA_PRENSAS[tipo];
  document.body.classList.add('modo-p-'+tipo.slice(8));
  activarVista(t.vista);
  if(tipo==='prensas-accion'){ $('accionWrap').style.display='block'; regenerarAccion(); }
  else if(tipo==='prensas-agregados'){ $('agrOrdenWrap').style.display='block'; pintarAgrOrden(); }
  const input=$(NRO_INPUT_DE_TIPO[tipo]);
  const contenedor=input.closest('.campo')||input.parentElement;
  contenedor.insertAdjacentHTML('beforeend', PM().chipCarpeta(t.serie));
  const repintar=repintarDe(tipo);
  const proponer=()=>PM().proponerNumero(t.serie).then(p=>{
    if(!input.value.trim()){ input.value=p.numero; repintar(); }
  });
  PM().cablearChipsCarpeta(contenedor, proponer);
  proponer();
}
/* Renderizador (htmlHoja*) de PrensasMods que corresponde a cada tipo. */
function renderizadorDe(tipo){
  if(tipo==='prensas-muestras') return PM().htmlHojaMuestras;
  if(tipo==='prensas-rellenos') return PM().htmlHojaRellenos;
  if(tipo==='prensas-accion') return PM().htmlHojaAccion;
  if(tipo==='prensas-agregados') return PM().htmlHojaAgregados;
  return null;
}
/* Abre una hoja GUARDADA (ver-hoja del modo órdenes): pinta el papel tal como
   quedó (solo lectura) y la cabecera con Marcar ejecutada / Anular /
   Reimprimir (htmlCabeceraOrden + cablearCabeceraOrden, compartidos con
   Lotes). También la usa cablearCabeceraOrden como `alCambiar`, para
   repintar todo tras ejecutar/anular (se haya guardado o se haya deshecho). */
/* Id de la orden guardada que se está mostrando (null = hoja editable). Con
   esto puesto, TODO repintado (renderActive por el selector de años o por la
   fusión tras un 409, y los pintar* de cada hoja) vuelve a pintar el papel
   guardado en solo lectura, nunca la hoja editable regenerada. */
let HOJA_GUARDADA_ID=null;
/* Si se está mostrando una orden guardada, repinta su papel (solo lectura) y
   devuelve true; si no, false (y el que llama pinta la hoja editable). */
function pintarHojaGuardada(){
  if(!HOJA_GUARDADA_ID) return false;
  const o=PM().ordenHojaPorId(DATOS, HOJA_GUARDADA_ID);
  if(!o || !PM().esTipoHojaPrensas(o.tipo)) return true;
  $(contenedorDe(o.tipo)).innerHTML=renderizadorDe(o.tipo)(o.hoja, { soloLectura: true });
  return true;
}
function abrirHojaGuardada(id){
  const o=PM().ordenHojaPorId(DATOS, id);
  if(!o || !PM().esTipoHojaPrensas(o.tipo)){ $('modoOrdenesTit').textContent='Orden no encontrada'; return; }
  const t=PM().TIPOS_HOJA_PRENSAS[o.tipo];
  HOJA_GUARDADA_ID=id;
  document.body.classList.add('modo-ordenes','hoja-guardada','modo-p-'+o.tipo.slice(8));
  activarVista(t.vista); // su renderActive ya pinta el papel guardado
  if(o.tipo==='prensas-accion') $('accionWrap').style.display='block';
  else if(o.tipo==='prensas-agregados') $('agrOrdenWrap').style.display='block';
  pintarHojaGuardada();
  const cab=$('modoOrdenesCab');
  cab.innerHTML=PM().htmlCabeceraOrden(o, { puedeEditar: !(window.CIW && window.CIW.rol==='lector') });
  if(!cab._cableada){
    cab._cableada=true;
    PM().cablearCabeceraOrden(cab, id, { reimprimir: ()=>{ pintarHojaGuardada(); window.print(); }, alCambiar: ()=>abrirHojaGuardada(id) });
  }
  document.dispatchEvent(new Event('prensas:modo-orden-cambio'));
}
/* Modo órdenes: imprimir = guardar la orden (pendiente) en ordenes_hojas, con
 * N° de la carpeta. La foto es lo que salió en el papel, sin los mapas. */
let _imprimiendo=false;
async function imprimirOrdenPrensas(tipo){
  if(_imprimiendo) return;
  _imprimiendo=true;
  try {
    // Copia profunda: la foto trae los arrays vivos del editor (ordenRows,
    // rellenoRows, arRows, agrOrdenRows); la orden guardada no debe cambiar
    // si después se sigue editando la hoja.
    const M=PM(), t=M.TIPOS_HOJA_PRENSAS[tipo], foto=M.copiarFoto(fotoDe(tipo));
    const inputNro=$(NRO_INPUT_DE_TIPO[tipo]);
    const r=await M.imprimirYGuardar({ claseBody: 'printing-prensas', contenedor: $(contenedorDe(tipo)),
      serie: t.serie, numero: foto.nro, titulo: t.nombre });
    if(!r.ok){ if(r.numeroLibre){ inputNro.value=r.numeroLibre; repintarDe(tipo)(); } return; }
    inputNro.value=r.numero; foto.nro=r.numero;
    const orden=M.armarOrdenHoja({ id: 'oh-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
      tipo, numero: r.numero, fecha: foto.fecha, quien: quienEmite(), ahora: new Date().toISOString(),
      lotes: foto.filas.map(f=>f.lote), hoja: foto });
    const res=await M.guardarOrdenHojaConfirmando(orden);
    if(!res.ok){
      M.avisar(res.error==='ejecutada'
        ? 'La orden '+r.numero+' ya está ejecutada: esta impresión no se guardó como orden.'
        : 'Esta impresión no se guardó como orden. Usá otro N° si es una orden distinta.', { tipo: 'mal' });
      return;
    }
    markDirty();
    // Aunque guardar falle, la orden ya está en DATOS (y en el borrador): se
    // pasa igual a la vista guardada, como Lotes. Quedarse en la hoja
    // editable llevaba a reimprimir el mismo N° ("ya hay un archivo" +
    // "pendiente previa").
    const ok=await guardar(false);
    if(!ok) M.avisar('La orden quedó en este equipo sin guardar: tocá Guardar cuando vuelva la conexión.', { tipo: 'mal' });
    const u=new URL(location.href);
    u.searchParams.set('orden', res.id);
    history.replaceState(null, '', u.pathname+u.search);
    abrirHojaGuardada(res.id);
  } finally { _imprimiendo=false; }
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
    `<h3 style="margin:0 0 6px">Conectar celular</h3>`+
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
/* Quién figura como emisor de la orden guardada (trazabilidad): el nombre de
   sesión (window.CIW.nombre) si lo hay, si no el usuario de Prensas. El papel
   impreso sigue diciendo "Emitió: Marcelo" en Muestras (hojas-prensas.js). */
function quienEmite(){ return (window.CIW && window.CIW.nombre) || usuarioActual(); }
/* Despacho por id de tipo de hoja (prensas-muestras|prensas-rellenos|
   prensas-accion|prensas-agregados), para el cableado de guardar/reimprimir
   de las entregas siguientes (Task 6-8). */
function fotoDe(tipo){
  if(tipo==='prensas-muestras') return fotoMuestras();
  if(tipo==='prensas-rellenos') return fotoRellenos();
  if(tipo==='prensas-accion') return fotoAccion();
  if(tipo==='prensas-agregados') return fotoAgregados();
  return null;
}
function contenedorDe(tipo){
  if(tipo==='prensas-muestras') return 'ordenPaginas';
  if(tipo==='prensas-rellenos') return 'rellenoPaginas';
  if(tipo==='prensas-accion') return 'accionPaginas';
  if(tipo==='prensas-agregados') return 'agrOrdenPaginas';
  return null;
}
/* Fija el entorno de órdenes de papel (guardar-ot.js / vista-orden-guardada.js,
   compartidos con Lotes) apenas llegan los módulos, y recién ahí carga los
   datos: nada de lo que usa PM() corre antes de este punto. */
function iniciarConModulos(){
  PM().fijarEntornoOT({
    datos: () => DATOS, markDirty, guardar, usuarioActual: quienEmite, mostrarOverlay, cerrarOverlay,
    api: '/prensas/api', numerosWeb: PM().numerosWebPrensas, eventoModo: 'prensas:modo-orden-cambio',
  });
  cargar();
}
/* Banner de avisos del servidor: otro servidor activo en la red, versión que
   retrocedió (conflicto OneDrive) o archivos de conflicto junto a datos.json.
   Se consulta al cargar y cada 60 s. */
async function vigilarEstado(){
  try{
    const r=await fetch(API+'/estado'); if(!r.ok) return;
    const j=await r.json(); const el=$('avisos');
    if(j.avisos && j.avisos.length){
      el.innerHTML=j.avisos.map(a=>`<div class="aviso"><b>Atención:</b> ${esc(a)}</div>`).join('');
      el.style.display='block';
    } else el.style.display='none';
  }catch(e){/* servidor sin /api/estado o caído: se omite */}
}
async function guardar(forzar, intento=0){
  if(!dirty) return true;
  DATOS.meta.autor = usuarioActual() || pedirUsuario(true) || 'desconocido';
  if(FUSION) await FUSION.borrador.guardar('prensas', borradorActual);
  // Lo que se envía es esta foto: si se sigue editando durante el viaje, eso
  // queda pendiente para el próximo guardado.
  const enviado = JSON.stringify(DATOS);
  const edicionesAlEnviar = ediciones;
  let r;
  try{
    r = await fetch(API+'/datos'+(forzar?'?forzar=1':''), {method:'POST', headers:{'Content-Type':'application/json'}, body:enviado});
  }catch(e){
    alert('No se pudo guardar: no hay conexión con el servidor. Tus cambios siguen en pantalla y quedaron guardados en este equipo; probá de nuevo cuando vuelva la señal.');
    return false;
  }
  if(r.status===401){
    alert('Tu sesión se cerró. Tus cambios siguen en pantalla y quedaron guardados en este equipo.\n\nIniciá sesión en la pestaña que se abre y después volvé a tocar Guardar.');
    window.open('/login.html','_blank');
    return false;
  }
  if(r.status===400){
    const j=await r.json().catch(()=>({}));
    if(j.error==='validacion'){
      const det=(j.detalles||[]).join('\n• ');
      if(!forzar && confirm('El servidor FRENÓ este guardado para proteger los datos:\n\n• '+det+
        '\n\n¿Era tu intención? Aceptar = guardar igual (queda registrado como FORZADO en el historial).\nCancelar = no guardar nada y revisar.')){
        return guardar(true);
      }
      if(forzar) alert('No se pudo guardar:\n• '+det);
      return false;
    }
    alert('Error al guardar: '+(j.error||r.status)); return false;
  }
  if(r.status===409){
    const j = await r.json().catch(()=>({}));
    // Otra persona guardó mientras se editaba acá: se combinan los cambios de
    // las dos y se vuelve a guardar. Nadie pierde lo suyo.
    if(FUSION && BASE && j.actual && intento<4){
      const serv = j.actual;
      DATOS = FUSION.fusionarDocumento(BASE, DATOS, serv);
      DATOS.degustaciones = DATOS.degustaciones || []; DATOS.agregados = DATOS.agregados || [];
      BASE = FUSION.clonar(serv);
      // Lo del otro puede traer otros umbrales (config.alertas) o lotes de otro año.
      try{ aplicarReglas(); montarAnios(); renderActive(); }catch(e){}
      return guardar(forzar, intento+1);
    }
    mostrarOverlay('<h2 style="margin-top:0;color:var(--warn)">Conflicto de versión</h2>'+
      '<p style="color:var(--muted)">Otra PC guardó cambios mientras editabas y no se pudieron combinar solos.</p>'+
      '<p style="color:var(--muted);font-size:13px">Tus cambios quedaron guardados en este equipo: al recargar se te ofrece recuperarlos.</p>'+
      '<button class="btn primary" onclick="location.reload()">Recargar y recuperar</button>');
    return false;
  }
  if(r.status===403){
    const j=await r.json().catch(()=>({}));
    alert('No se pudo guardar: '+((j.detalles&&j.detalles[0])||'tu usuario no tiene permiso para guardar en Prensas.'));
    return false;
  }
  if(!r.ok){ alert('Error al guardar: '+r.status+'. Tus cambios siguen en pantalla y guardados en este equipo.'); return false; }
  const j = await r.json();
  DATOS.meta.version = j.version; DATOS.meta.guardado = j.guardado;
  // La base pasa a ser lo que efectivamente llegó al servidor, no la pantalla
  // actual (que puede tener ediciones posteriores, todavía sin enviar).
  if(FUSION){ BASE = JSON.parse(enviado); BASE.meta.version = j.version; BASE.meta.guardado = j.guardado; }
  if(ediciones !== edicionesAlEnviar){
    // Se editó durante el viaje: queda pendiente (y en el borrador del equipo).
    markDirty();
    return true;
  }
  if(FUSION) FUSION.borrador.borrar('prensas');
  markSaved();
  if(intento>0){ const s=$('status'); s.textContent='Guardado · v'+DATOS.meta.version+' · combinado con lo que guardaron otros'; }
  if(j.respaldo){ const s=$('status'); s.textContent='Guardado · v'+DATOS.meta.version+' · respaldo: '+j.respaldo+(j.reporte?' · reporte actualizado':''); s.title='Respaldo .md en backups'+(j.reporte?' · '+j.reporte+' actualizado para el jefe (OneDrive)':''); }
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
  for(const l of lotesVis()){
    if(num(l.litros)===0) continue;   // lote vaciado (0 L): no se analiza más
    const rows = (idx.get(+l.lote)||[]).filter(r=>mesDe(r)!=null);
    const f = {lote:l.lote, variedad:l.variedad, prensa:l.prensa, mes:null, fecha:null,
               ph:null, av:null, gluc:null, malico:null,
               fpH:false, fAVhi:false, fAVneg:false, fAV:false, fGl:false, fMal:false,
               noOk:false, criterios:'', sinMes:false, dias:null, vencido:false, proximo:false, sinAnalisis:rows.length===0};
    if(rows.length){
      const last = PM().ultimoAnalisis(rows);
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
  const set=new Set(DATOS.analisis.filter(a=>visibleAnio(a.lote)).map(mesDe).filter(m=>m!=null));
  if(DATOS.meta.mes_actual!=null) set.add(+DATOS.meta.mes_actual);
  const meses=[...set].sort((a,b)=>a-b);
  const sel=$('selMes'); const prev=parseInt(sel.value,10); sel.innerHTML='';
  for(const m of meses){ const o=document.createElement('option'); o.value=m; o.textContent='Mes '+m; sel.appendChild(o); }
  // El mes que eligió el usuario se respeta mientras siga existiendo (igual que en Degustación).
  sel.value = (prev && meses.includes(prev)) ? prev : (DATOS.meta.mes_actual ?? meses[meses.length-1]);
  // F5: el mes guardado gana si sigue entre las opciones (si no, queda el default de arriba).
  const gSelMes=_lf('selMes',''); if([...sel.options].some(o=>o.value===gSelMes)) sel.value=gSelMes;
  $('hoy').textContent=today.toLocaleDateString('es-AR');
  initMesDegSelector();
}
// Selector de mes propio de la Degustación: meses con datos (análisis o degustación) + mes actual.
function initMesDegSelector(){
  const sel=$('selMesDeg'); if(!sel) return;
  const prev=parseInt(sel.value,10);
  const set=new Set(DATOS.analisis.filter(a=>visibleAnio(a.lote)).map(mesDe).filter(m=>m!=null));
  DATOS.degustaciones.forEach(d=>{ if(d.mes!=null && visibleAnio(d.lote)) set.add(+d.mes); });
  if(DATOS.meta.mes_actual!=null) set.add(+DATOS.meta.mes_actual);
  const meses=[...set].sort((a,b)=>a-b);
  sel.innerHTML='';
  for(const m of meses){ const o=document.createElement('option'); o.value=m; o.textContent='Mes '+m; sel.appendChild(o); }
  sel.value = (prev && meses.includes(prev)) ? prev : (DATOS.meta.mes_actual ?? meses[meses.length-1]);
  const gSelMesDeg=_lf('selMesDeg',''); if([...sel.options].some(o=>o.value===gSelMesDeg)) sel.value=gSelMesDeg;
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

  const pal=PALETA();
  renderDonut([{label:'OK',value:ok.length,color:pal.ok},{label:'NO OK',value:nook.length,color:pal.nook},{label:'Sin análisis',value:sinA.length,color:pal.line}], pal);
  renderBars([
    {label:'pH',value:conA.filter(f=>f.fpH).length},{label:'AV≥'+REGLAS.AV_MAX,value:conA.filter(f=>f.fAVhi).length},
    {label:'AV −999',value:conA.filter(f=>f.fAVneg).length},{label:'Gluc',value:conA.filter(f=>f.fGl).length},
    {label:'Málico',value:conA.filter(f=>f.fMal).length},{label:'Vencidos',value:venc.length}], pal);
  renderScatter(conA.filter(f=>f.ph!=null&&f.av!=null&&f.av!=-999), pal);

  $('kTotal').textContent=total; $('kOk').textContent=ok.length; $('kNoOk').textContent=nook.length; $('kSinMes').textContent=sinMes.length;
  $('kProx').textContent=prox.length;
  $('kOkPct').textContent=pct(ok.length); $('kNoOkPct').textContent=pct(nook.length); $('kSinMesPct').textContent='mes '+mes;

  const crit=[['pH','&gt; '+REGLAS.PH_MAX,conA.filter(f=>f.fpH).length],['Acidez Volátil','&ge; '+REGLAS.AV_MAX+' g/L',conA.filter(f=>f.fAVhi).length],
    ['AV inválida','= −999',conA.filter(f=>f.fAVneg).length],['Gluc/Fruc','&gt; '+REGLAS.GLUC_MAX+' g/L',conA.filter(f=>f.fGl).length],
    ['Ác. Málico','&gt; '+REGLAS.MALICO_MAX+' g/L',conA.filter(f=>f.fMal).length],['Vencidos','&gt; '+REGLAS.VENCIDO_DIAS+' días',venc.length]];
  const maxCrit=Math.max(1,...crit.map(c=>c[2]));
  $('critList').innerHTML=crit.map(([n,l,v])=>`<div class="row"><span class="name">${n}<small>${l}</small></span><span class="tr"><i style="width:${(100*v/maxCrit).toFixed(1)}%"></i></span><span class="val ${v===0?'zero':''}">${v}</span></div>`).join('');

  tablaSimple('tNoOk', nook, [
    {key:'lote',label:'Lote',num:true},{key:'variedad',label:'Variedad'},{key:'mes',label:'Últ. Mes',num:true},
    {key:'fecha',label:'Fecha'},{key:'ph',label:'pH',num:true,bad:f=>f.fpH},{key:'av',label:'AV',num:true,bad:f=>f.fAV},
    {key:'gluc',label:'Gluc/Fruc',num:true,bad:f=>f.fGl},{key:'malico',label:'Málico',num:true,bad:f=>f.fMal},
    {key:'criterios',label:'Criterio fallido',render:f=>`<span class="pill bad">${esc(f.criterios)}</span>`}], sortDash.tNoOk, k=>{toggleSort(sortDash.tNoOk,k);_gf('orden:dash',sortDash);renderDashboard();});
  $('cntNoOk').textContent=nook.length;

  tablaSimple('tVenc', venc, [
    {key:'lote',label:'Lote',num:true},{key:'variedad',label:'Variedad'},{key:'mes',label:'Últ. Mes',num:true},
    {key:'fecha',label:'Última fecha'},{key:'dias',label:'Días desde análisis',num:true,render:f=>`<span class="pill warn">${f.dias} d</span>`}],
    sortDash.tVenc, k=>{toggleSort(sortDash.tVenc,k);_gf('orden:dash',sortDash);renderDashboard();});
  $('cntVenc').textContent=venc.length;

  tablaSimple('tProx', prox, [
    {key:'lote',label:'Lote',num:true},{key:'variedad',label:'Variedad'},{key:'mes',label:'Últ. Mes',num:true},
    {key:'fecha',label:'Última fecha'},{key:'dias',label:'Días desde análisis',num:true,render:f=>`<span class="pill warn">${f.dias} d</span>`}],
    sortDash.tProx, k=>{toggleSort(sortDash.tProx,k);_gf('orden:dash',sortDash);renderDashboard();});
  $('cntProx').textContent=prox.length;

  const ultAgr=(DATOS.agregados||[]).filter(a=>visibleAnio(a.lote)).sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||''))).slice(0,15)
    .map(a=>{const l=mapaLotes().get(+a.lote); return {fecha:a.fecha,lote:a.lote,variedad:l?l.variedad:'',tipo:a.tipo,cantidad:a.cantidad,unidad:a.unidad};});
  tablaSimple('tUltAgr', ultAgr, [
    {key:'fecha',label:'Fecha'},{key:'lote',label:'Lote',num:true},{key:'variedad',label:'Variedad'},
    {key:'tipo',label:'Tipo'},{key:'cantidad',label:'Cantidad',num:true},{key:'unidad',label:'Unidad'}],
    {key:'fecha',dir:-1}, ()=>{});
  $('cntUltAgr').textContent=ultAgr.length;
}
function toggleSort(st,k){ if(st.key===k) st.dir*=-1; else {st.key=k; st.dir=1;} }
function sortRows(rows,st){ return [...rows].sort((a,b)=>{let x=a[st.key],y=b[st.key]; if(x==null)return 1; if(y==null)return -1; if(typeof x==='string'&&typeof y==='string')return st.dir*x.localeCompare(y); return st.dir*(x-y);}); }
function tablaSimple(id,rows,cols,st,onSort){
  const sorted=sortRows(rows,st);
  let h='<thead><tr>'+cols.map(c=>{const ar=st.key===c.key?`<span class="arrow">${st.dir>0?'▲':'▼'}</span>`:''; return `<th data-k="${c.key}" class="${c.num?'num':''}">${c.label}${ar}</th>`;}).join('')+'</tr></thead>';
  // Los valores crudos se escapan: los cargó cualquier editor y los ve todo el mundo,
  // admins incluidos (un "<img onerror=…>" en la variedad corría en su sesión).
  // Lo que viene de c.render ya es HTML armado por la app.
  h+='<tbody>'+sorted.map(f=>'<tr>'+cols.map(c=>{let v=c.render?c.render(f):(f[c.key]==null?'—':esc(f[c.key])); const cl=(c.num?'num ':'')+(c.bad&&c.bad(f)?'val-bad':''); return `<td class="${cl}">${v}</td>`;}).join('')+'</tr>').join('')+'</tbody>';
  const t=$(id); t.innerHTML=h;
  t.querySelectorAll('th').forEach(th=>th.onclick=()=>onSort(th.dataset.k));
}

/* ---------- gráficos SVG ---------- */
/* Colores de los gráficos: salen de los tokens del CSS (Piedra y tinta), así
   un cambio de paleta no deja colores viejos escritos acá. */
function PALETA(){
  const st=getComputedStyle(document.documentElement), v=n=>st.getPropertyValue(n).trim();
  return {txt:v('--txt'), muted:v('--muted'), line:v('--line'), ok:v('--ok'), nook:v('--nook'), warn:v('--warn'), accent:v('--accent'), serif:v('--serif')};
}
function renderDonut(segs, pal){
  const total=segs.reduce((s,x)=>s+x.value,0)||1, r=50,C=2*Math.PI*r,cx=64,cy=64; let off=0;
  const arcs=segs.map(s=>{const len=s.value/total*C; const el=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="14" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"></circle>`; off+=len; return el;}).join('');
  const svg=`<svg viewBox="0 0 128 128" width="128" height="128">${arcs}<text x="${cx}" y="${cy+6}" text-anchor="middle" fill="${pal.txt}" font-family="${escA(pal.serif)}" font-size="32">${total}</text><text x="${cx}" y="${cy+22}" text-anchor="middle" fill="${pal.muted}" font-size="9" letter-spacing="1.5">LOTES</text></svg>`;
  const lg=segs.map(s=>`<div class="lg"><span class="dot" style="background:${s.color}"></span>${s.label} <b style="margin-left:auto;font-variant-numeric:tabular-nums">${s.value}</b></div>`).join('');
  $('chDonut').innerHTML=`<div class="donut-wrap">${svg}<div class="legend">${lg}</div></div>`;
}
function renderBars(items, pal){
  const max=Math.max(1,...items.map(i=>i.value)), rowH=24,w=300,labelW=64,barMax=w-labelW-34;
  const rows=items.map((i,idx)=>{const bw=i.value/max*barMax,y=idx*rowH,color=i.value===0?pal.line:pal.accent;
    return `<text x="0" y="${y+rowH/2+4}" fill="${pal.muted}" font-size="11">${i.label}</text><rect x="${labelW}" y="${y+9}" width="${bw}" height="6" fill="${color}"></rect><text x="${labelW+bw+6}" y="${y+rowH/2+4}" fill="${pal.txt}" font-size="11" font-weight="600">${i.value}</text>`;}).join('');
  $('chBars').innerHTML=`<svg viewBox="0 0 ${w} ${items.length*rowH+6}" width="100%" height="${items.length*rowH+6}">${rows}</svg>`;
}
function renderScatter(pts, pal){
  const W=300,H=220,m={l:36,r:12,t:12,b:32}; const xs=pts.map(p=>p.ph),ys=pts.map(p=>p.av);
  const xmin=Math.min(REGLAS.PH_MAX-1,...xs),xmax=Math.max(REGLAS.PH_MAX+0.3,...xs),ymin=0,ymax=Math.max(REGLAS.AV_MAX+0.3,...ys);
  const sx=v=>m.l+(v-xmin)/(xmax-xmin)*(W-m.l-m.r), sy=v=>H-m.b-(v-ymin)/(ymax-ymin)*(H-m.t-m.b);
  let g=`<line x1="${m.l}" y1="${H-m.b}" x2="${W-m.r}" y2="${H-m.b}" stroke="${pal.txt}" stroke-width=".8"/><line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${H-m.b}" stroke="${pal.txt}" stroke-width=".8"/>`;
  const vx=sx(REGLAS.PH_MAX),hy=sy(REGLAS.AV_MAX);
  g+=`<line x1="${vx}" y1="${m.t}" x2="${vx}" y2="${H-m.b}" stroke="${pal.nook}" stroke-width="1" stroke-dasharray="3 3"/><line x1="${m.l}" y1="${hy}" x2="${W-m.r}" y2="${hy}" stroke="${pal.nook}" stroke-width="1" stroke-dasharray="3 3"/>`;
  g+=`<text x="${vx+3}" y="${m.t+9}" fill="${pal.nook}" font-size="9">pH ${REGLAS.PH_MAX}</text><text x="${W-m.r-3}" y="${hy-4}" fill="${pal.nook}" font-size="9" text-anchor="end">AV ${REGLAS.AV_MAX}</text>`;
  g+=`<text x="${m.l}" y="${H-m.b+13}" fill="${pal.muted}" font-size="9" text-anchor="middle">${xmin.toFixed(1)}</text><text x="${W-m.r}" y="${H-m.b+13}" fill="${pal.muted}" font-size="9" text-anchor="middle">${xmax.toFixed(1)}</text>`;
  g+=`<text x="${m.l-5}" y="${H-m.b+3}" fill="${pal.muted}" font-size="9" text-anchor="end">0</text><text x="${m.l-5}" y="${m.t+8}" fill="${pal.muted}" font-size="9" text-anchor="end">${ymax.toFixed(1)}</text>`;
  g+=pts.map(p=>`<circle cx="${sx(p.ph).toFixed(1)}" cy="${sy(p.av).toFixed(1)}" r="${p.noOk?3.4:2.8}" fill="${p.noOk?pal.nook:pal.ok}" fill-opacity="${p.noOk?0.95:0.6}"/>`).join('');
  g+=`<text x="${(m.l+W-m.r)/2}" y="${H-2}" fill="${pal.muted}" font-size="10" text-anchor="middle">pH</text><text x="11" y="${(m.t+H-m.b)/2}" fill="${pal.muted}" font-size="10" text-anchor="middle" transform="rotate(-90 11 ${(m.t+H-m.b)/2})">AV (g/L)</text>`;
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
  {k:'lote',label:'Lote',num:true},
  {k:'_variedad',label:'Variedad',ro:true,compute:a=>loteDe(a).variedad||''},
  {k:'_prensa',label:'Prensa',ro:true,compute:a=>loteDe(a).prensa||''},{k:'mes',label:'Mes',ro:true,num:true,compute:a=>mesDe(a)},
  {k:'fecha',label:'Fecha',date:true,derivaMes:true},{k:'etanol',label:'Etanol',num:true},
  {k:'ph',label:'pH',num:true,bad:o=>badPH(num(o.ph))},
  {k:'av',label:'AV',num:true,bad:o=>badAV(num(o.av))},
  {k:'gluc',label:'Gluc/Fruc',num:true,bad:o=>badGluc(num(o.gluc))},
  {k:'malico',label:'Málico',num:true,bad:o=>badMalico(num(o.malico))},
  {k:'lactico',label:'Láctico',num:true},{k:'at',label:'AT',num:true},{k:'azucar',label:'Azúcar Red',num:true},
  {k:'so2l',label:'SO2 L',num:true},{k:'so2t',label:'SO2 T',num:true},{k:'ot',label:'OT n°'}];

let sortLotes={key:'lote',dir:1}, sortAna={key:'lote',dir:1};
const COLS_AGR=[
  {k:'lote',label:'Lote',num:true},
  {k:'_variedad',label:'Variedad',ro:true,compute:a=>loteDe(a).variedad||''},
  {k:'_prensa',label:'Prensa',ro:true,compute:a=>loteDe(a).prensa||''},
  {k:'fecha',label:'Fecha',date:true},
  {k:'tipo',label:'Tipo'},
  {k:'cantidad',label:'Cantidad',num:true},
  {k:'unidad',label:'Unidad'}];
let sortAgr={key:'fecha',dir:-1};

function valCol(o,c){ return c.compute?c.compute(o):o[c.k]; }
function tablaEditable(id, cols, rows, sort, onSort, onDel, rowClass, fc){
  const t=$(id); t._rows=rows; t._cols=cols;
  let h='<thead><tr>'+cols.map(c=>{const ar=sort.key===c.k?`<span class="arrow">${sort.dir>0?'▲':'▼'}</span>`:''; return `<th data-k="${c.k}" class="${c.num?'num':''}">${c.label}${ar}${embudoHTML(fc,c.k,c.label)}</th>`;}).join('')+'<th></th></tr>';
  h+='</thead>';
  let tb='<tbody>';
  rows.forEach((o,ri)=>{
    const rc = rowClass ? (rowClass(o)||'') : '';
    tb+=`<tr class="${rc}">`;
    for(const c of cols){
      if(c.ro){ const v=c.compute?c.compute(o):o[c.k]; tb+=`<td class="ro ${c.num?'num':''}">${v==null?'':esc(v)}</td>`; }
      else { const v=o[c.k]==null?'':o[c.k]; const bad=c.bad&&c.bad(o)?'bad2':''; tb+=`<td><input class="cell ${c.num?'num':''} ${bad}" type="${c.date?'date':'text'}"${c.num?' inputmode="decimal"':''} data-row="${ri}" data-k="${c.k}" value="${escA(v)}"></td>`; }
    }
    tb+=`<td><button class="rowbtn" data-del="${ri}" title="Eliminar">✕</button></td></tr>`;
  });
  tb+='</tbody>'; t.innerHTML=h+tb;
  t.querySelectorAll('th[data-k]').forEach(th=>th.onclick=e=>{ if(e.target.closest('.th-flt'))return; onSort(th.dataset.k); });
  cablearEmbudos(t, fc);
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
/* Lista de casillas con buscador. Dos modos:
 *  - normal: trae su propio botón (lo usa Orden de muestras);
 *  - anclado (cfg.anclado): sin botón, el panel cuelga de <body> con
 *    position:fixed y lo abre el embudo de un <th>, para que no lo recorte el
 *    .scroll{overflow:auto} de la tabla. Mismo criterio que crearFiltroMulti
 *    de public/lotes/js/tabla.js.
 * cfg.rango = {state, k, tipo:'num'|'date', onChange} agrega arriba los campos
 * "desde / hasta", que escriben en state[k] = {min, max}. */
function crearFiltroMulti(cfg){
  const {label,set}=cfg; const anclado=cfg.anclado===true;
  const wrap=document.createElement('div'); wrap.className='mfilt';
  const btn=document.createElement('button'); btn.type='button'; btn.className='mfilt-btn';
  const panel=document.createElement('div'); panel.className='mfilt-panel'+(anclado?' mfilt-anclado':'');
  const search=document.createElement('input'); search.className='mfilt-search'; search.placeholder='Buscar…';
  const todas=document.createElement('label'); todas.className='mfilt-opt mfilt-all';
  const todasCb=document.createElement('input'); todasCb.type='checkbox';
  todas.appendChild(todasCb); todas.appendChild(document.createTextNode(' Todas'));
  const list=document.createElement('div'); list.className='mfilt-list';
  const foot=document.createElement('div'); foot.className='mfilt-foot';
  const limpiar=document.createElement('button'); limpiar.type='button'; limpiar.textContent='Limpiar';
  foot.appendChild(limpiar);
  let rangoIn=null;
  if(cfg.rango){
    const r=cfg.rango, esFecha=r.tipo==='date';
    const tit=document.createElement('div'); tit.className='mfilt-rango-tit'; tit.textContent=esFecha?'Entre fechas':'Entre valores';
    const box=document.createElement('div'); box.className='mfilt-rango';
    const campo=(rol,ph)=>{ const i=document.createElement('input'); i.type=esFecha?'date':'text'; i.placeholder=ph;
      if(!esFecha) i.inputMode='decimal';
      i.value=(r.state[r.k]&&r.state[r.k][rol])||'';
      i.addEventListener('input',()=>{ const st=r.state[r.k]||(r.state[r.k]={}); st[rol]=i.value;
        if(!PrensasFiltros.rangoActivo(st)) delete r.state[r.k]; r.onChange(); });
      box.appendChild(i); return i; };
    rangoIn={min:campo('min','desde'), max:campo('max','hasta')};
    panel.appendChild(tit); panel.appendChild(box);
  }
  panel.appendChild(search); panel.appendChild(todas); panel.appendChild(list); panel.appendChild(foot);
  if(anclado) document.body.appendChild(panel);
  else { wrap.appendChild(btn); wrap.appendChild(panel); }
  let opts=[];   // {val, text, li, cb}
  function build(){
    list.innerHTML=''; opts=[];
    const nuevas=cfg.opciones();
    // Los Sets de CIWFiltros vuelven del F5 con lo de antes: la primera vez se
    // descarta lo que ya no es una opción (ver shared/filtros-sesion.js).
    if(set.podar) set.podar(new Set(nuevas.map(o=>o.val)));
    for(const o of nuevas){
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
    if(!anclado){ btn.textContent=(n?`${label} (${n})`:label)+' ▾'; btn.classList.toggle('active', n>0); }
    const vis=opts.filter(o=>!o.li.classList.contains('hide'));
    todasCb.checked=vis.length>0 && vis.every(o=>o.cb.checked);
  }
  function sync(){
    opts.forEach(o=>o.cb.checked=set.has(o.val));
    if(rangoIn){ const st=cfg.rango.state[cfg.rango.k]||{}; rangoIn.min.value=st.min||''; rangoIn.max.value=st.max||''; }
    actualizar();
  }
  search.addEventListener('input',()=>{ const q=search.value.toLowerCase().trim();
    opts.forEach(o=>{ o.li.classList.toggle('hide', !!q&&!o.text.toLowerCase().includes(q)); });
    actualizar();
  });
  todasCb.addEventListener('change',()=>{ const vis=opts.filter(o=>!o.li.classList.contains('hide'));
    vis.forEach(o=>{ o.cb.checked=todasCb.checked; if(todasCb.checked) set.add(o.val); else set.delete(o.val); });
    actualizar(); cfg.onChange();
  });
  limpiar.addEventListener('click',()=>{ set.clear(); if(rangoIn) delete cfg.rango.state[cfg.rango.k]; sync(); cfg.onChange(); });
  // Abrir/cerrar es un toggle. `ancla` (solo modo anclado) es el embudo del <th>.
  function abrir(ancla){
    const abierto=panel.classList.contains('open');
    document.querySelectorAll('.mfilt-panel.open').forEach(p=>p.classList.remove('open'));
    if(abierto) return;
    // En modo anclado la lista se arma al abrir: es el único momento en que alguien la mira.
    if(anclado) build();
    sync();
    panel.classList.add('open'); search.value=''; opts.forEach(o=>o.li.classList.remove('hide')); actualizar();
    // Posicionar DESPUÉS de mostrarlo: con display:none mide 0×0.
    if(anclado && ancla){
      const a=ancla.getBoundingClientRect();
      const {izq,top}=PrensasFiltros.posicionDePanel({left:a.left,top:a.top,bottom:a.bottom},
        {ancho:panel.offsetWidth,alto:panel.offsetHeight},{ancho:innerWidth,alto:innerHeight});
      panel.style.left=izq+'px'; panel.style.top=top+'px';
    }
    (rangoIn?rangoIn.min:search).focus();
  }
  btn.addEventListener('click',(e)=>{ e.stopPropagation(); abrir(); });
  panel.addEventListener('click',e=>e.stopPropagation());
  if(!anclado) build();
  actualizar();
  return { el:wrap, sync, abrir, rebuild:()=>{ build(); actualizar(); } };
}

/* Un embudo por columna, como en Lotes web. cols: [{k,label,num?,date?,
 * compute?, valor?, opciones?}]; base(): filas con las que se arman las listas.
 * Las columnas numéricas y de fecha suman "desde / hasta". */
function crearFiltrosColumnas(cols, base, onChange, clave){
  const FS=window.CIWFiltros, cl=clave&&FS?('prensas:'+clave+':'):null;
  // Rangos y Sets vuelven del F5 en esta pestaña (shared/filtros-sesion.js).
  const rangos=cl?Object.assign({}, FS.leer(cl+'rangos', {})):{}, map=new Map();
  const cambio=()=>{ if(cl) FS.guardar(cl+'rangos', rangos); onChange(); };
  for(const c of cols){
    const valorDe=c.valor||(r=>valCol(r,c));
    const tipo=c.date?'date':(c.num?'num':null);
    const set=cl?FS.set(cl+'f:'+c.k):new Set();
    const inst=crearFiltroMulti({anclado:true, label:c.label, set, onChange,
      opciones:c.opciones||(()=>opcionesValores(base(),valorDe)),
      rango:tipo?{state:rangos,k:c.k,tipo,onChange:cambio}:null});
    map.set(c.k,{c,set,inst,valorDe,tipo});
  }
  return {
    map,
    n:k=>{ const f=map.get(k); return f ? f.set.size+(PrensasFiltros.rangoActivo(rangos[k])?1:0) : 0; },
    pasa:row=>{
      for(const f of map.values()){
        if(f.set.size && !f.set.has(normVal(f.valorDe(row)))) return false;
        if(f.tipo && !PrensasFiltros.pasaRango(f.valorDe(row), rangos[f.c.k], f.tipo)) return false;
      }
      return true;
    },
    limpiar:()=>{ map.forEach(f=>f.set.clear()); Object.keys(rangos).forEach(k=>delete rangos[k]); if(cl) FS.borrar(cl); map.forEach(f=>f.inst.sync()); },
  };
}
// Botón ▾ dentro del <th>; muestra cuántos filtros tiene puestos esa columna.
function embudoHTML(fc, k, label){
  if(!fc || !fc.map.has(k)) return '';
  const n=fc.n(k);
  const tit=n?`${label}: ${n} filtro${n>1?'s':''} puesto${n>1?'s':''}`:`Filtrar por ${label}`;
  return ` <button type="button" class="th-flt${n?' active':''}" data-flt="${escA(k)}" title="${escA(tit)}">▾${n?' '+n:''}</button>`;
}
function cablearEmbudos(t, fc){
  if(!fc) return;
  t.querySelectorAll('.th-flt').forEach(b=>b.addEventListener('click',e=>{
    e.stopPropagation(); const f=fc.map.get(b.dataset.flt); if(f) f.inst.abrir(b); }));
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
let fcLotes=null;
function initFiltrosLotes(){ fcLotes=crearFiltrosColumnas(COLS_LOTES, ()=>lotesVis(), renderLotes, 'lotes'); }
function limpiarFiltrosLotes(){ fcLotes.limpiar(); $('buscaLotes').value=''; _gf('buscaLotes',''); filtroLlenado.lotes.reset(); renderLotes(); }

function renderLotes(){
  const q=($('buscaLotes').value||'').toLowerCase().trim();
  let rows=lotesVis();
  if(q) rows=rows.filter(l=>[l.lote,l.variedad,l.origen,l.ig,l.id_origen,l.ot_prensado].some(v=>v!=null&&String(v).toLowerCase().includes(q)));
  rows=rows.filter(fcLotes.pasa);
  rows=rows.filter(filtroLlenado.lotes.pasa);
  rows=sortRows(rows,sortLotes);
  // mapa de evaluación por lote para resaltar críticos / vencidos
  const evalMap=new Map(); evaluarLotes(mesActual()).forEach(f=>evalMap.set(+f.lote,f));
  const rc=o=>{ const f=evalMap.get(+o.lote); const cls=[];
    if(f&&f.noOk)cls.push('crit'); else if(f&&f.vencido)cls.push('venc');
    if(PM().esVaciado(o))cls.push('vacio');
    return cls.join(' '); };
  tablaEditable('tLotes',COLS_LOTES,rows,sortLotes,k=>{toggleSort(sortLotes,k);_gf('orden:lotes',sortLotes);renderLotes();},o=>{
    if(confirm('¿Eliminar el lote '+o.lote+'?')){ DATOS.lotes.splice(DATOS.lotes.indexOf(o),1); markDirty(); renderLotes(); }}, rc, fcLotes);
  $('lotesCount').textContent=rows.length+' / '+lotesVis().length+' lotes';
}
function initFiltroVariedad(){
  const vars=[...new Set(lotesVis().map(l=>(l.variedad||'').trim()).filter(v=>v))].sort();
  const opts='<option value="">Todas</option>'+vars.map(v=>`<option value="${escA(v)}">${esc(v)}</option>`).join('');
  document.querySelectorAll('select.fvar').forEach(sel=>{ const cur=sel.value; sel.innerHTML=opts; sel.value=cur; });
}
function anaEsNook(a){ return badPH(num(a.ph))||badAV(num(a.av))||badGluc(num(a.gluc))||badMalico(num(a.malico)); }
let fcAna=null;
function initFiltrosAna(){ fcAna=crearFiltrosColumnas(COLS_ANA, ()=>{ lmRefresh(); return DATOS.analisis.filter(a=>visibleAnio(a.lote)); }, renderAnalisis, 'ana'); }
function limpiarFiltrosAna(){ fcAna.limpiar(); $('buscaAna').value=''; _gf('buscaAna',''); $('anaMostrar').value=''; _gf('anaMostrar',''); filtroLlenado.ana.reset(); renderAnalisis(); }
// "Mostrar" no es una columna: con análisis, solo separadores o solo NO OK.
function pasaMostrar(a, m){
  if(m==='con') return !esSeparador(a);
  if(m==='sep') return esSeparador(a);
  if(m==='nook') return anaEsNook(a);
  return true;
}

function renderAnalisis(){
  const ml=mapaLotes();
  const q=($('buscaAna').value||'').toLowerCase().trim();
  lmRefresh();
  const base=DATOS.analisis.filter(a=>visibleAnio(a.lote)); let rows=base;
  if(q) rows=rows.filter(a=>String(a.lote||'').toLowerCase().includes(q));
  const mostrar=$('anaMostrar').value;
  rows=rows.filter(a=>pasaMostrar(a,mostrar));
  rows=rows.filter(fcAna.pasa);
  rows=rows.filter(a=>filtroLlenado.ana.pasa(ml.get(+a.lote)));
  rows=sortRows(rows,sortAna);
  const rc=o=>[esSeparador(o)?'sep':'', PM().esVaciado(ml.get(+o.lote))?'vacio':''].join(' ').trim();
  tablaEditable('tAna',COLS_ANA,rows,sortAna,k=>{toggleSort(sortAna,k);_gf('orden:ana',sortAna);renderAnalisis();},o=>{
    if(confirm('¿Eliminar este análisis del lote '+o.lote+'?')){ DATOS.analisis.splice(DATOS.analisis.indexOf(o),1); markDirty(); renderAnalisis(); }}, rc, fcAna);
  $('anaCount').textContent=rows.length+' / '+base.length+' análisis';
}

let fcAgr=null;
function initFiltrosAgr(){ fcAgr=crearFiltrosColumnas(COLS_AGR, ()=>{ lmRefresh(); return DATOS.agregados.filter(a=>visibleAnio(a.lote)); }, renderAgregados, 'agr'); }
function limpiarFiltrosAgr(){ fcAgr.limpiar(); $('buscaAgr').value=''; _gf('buscaAgr',''); renderAgregados(); }

function agregadosFiltrados(){
  const q=($('buscaAgr').value||'').toLowerCase().trim();
  lmRefresh();
  let rows=DATOS.agregados.filter(a=>visibleAnio(a.lote));
  if(q) rows=rows.filter(a=>String(a.lote||'').toLowerCase().includes(q));
  rows=rows.filter(fcAgr.pasa);
  return sortRows(rows,sortAgr);
}
/* datalist de lotes para los campos de Agregados */
function initAgrLotes(){ const dl=$('agrLotes'); if(dl) dl.innerHTML=lotesVis().map(l=>`<option value="${escA(l.lote??'')}">`).join(''); }
function renderAgregados(){
  const rows=agregadosFiltrados();
  tablaEditable('tAgr',COLS_AGR,rows,sortAgr,k=>{toggleSort(sortAgr,k);_gf('orden:agr',sortAgr);renderAgregados();},o=>{
    if(confirm('¿Eliminar este agregado del lote '+o.lote+'?')){ DATOS.agregados.splice(DATOS.agregados.indexOf(o),1); markDirty(); renderAgregados(); }}, null, fcAgr);
  $('agrCount').textContent=rows.length+' / '+DATOS.agregados.filter(a=>visibleAnio(a.lote)).length+' agregados';
}
/* ---- Orden de trabajo de Agregados (imprimible, transitoria) ---- */
let agrOrdenRows=[];
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
  const orden=PM().AGR_TIPO_ORDEN;
  agrOrdenRows.sort((x,y)=>(orden[x.tipo]-orden[y.tipo])||((+x.lote)-(+y.lote)));
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
/* La "foto" que lee htmlHojaAgregados (PM()): filas tal cual están en memoria
   más los datos de encabezado/pie leídos de los inputs, y el título editable
   (sobrevive al repintado en ordenTitulos). */
function fotoAgregados(){
  return { filas: agrOrdenRows, fecha: $('agrOrdFecha').value, nro: $('agrOrdNro').value,
    emitio: $('agrOrdEmitio').value, recibio: $('agrOrdRecibio').value, titulo: ordenTitulos.agregados };
}
function pintarAgrOrden(){
  if(pintarHojaGuardada()) return;
  $('agrOrdCount').textContent=agrOrdenRows.length+' agregados';
  $('agrOrdenPaginas').innerHTML=PM().htmlHojaAgregados(fotoAgregados());
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
  for(const l of lotesVis()){
    if(num(l.litros)===0) continue;
    let rows=(idx.get(+l.lote)||[]).filter(r=>mesDe(r)!=null && !esSeparador(r));
    if(!rows.length) continue;
    rows=PM().ordenarPorTiempo(rows);
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
const COLS_RIESGO_FLT=[{k:'lote',label:'Lote'},{k:'variedad',label:'Variedad'},{k:'prensa',label:'Prensa'},{k:'motivo',label:'Motivo'}];
let fcRiesgo=null;
function initFiltrosRiesgo(){ fcRiesgo=crearFiltrosColumnas(COLS_RIESGO_FLT, ()=>evaluarRiesgo(), renderRiesgo, 'riesgo'); }
function limpiarFiltrosRiesgo(){ fcRiesgo.limpiar(); $('buscaRiesgo').value=''; _gf('buscaRiesgo',''); renderRiesgo(); }

function renderRiesgo(){
  const q=($('buscaRiesgo').value||'').toLowerCase().trim();
  let filas=evaluarRiesgo();
  if(q) filas=filas.filter(f=>String(f.lote||'').toLowerCase().includes(q));
  filas=filas.filter(fcRiesgo.pasa);
  filas.sort((a,b)=>(+a.lote)-(+b.lote));
  const avBad=v=>v!=null&&v>REGLAS.AV_ATENCION, malBad=badMalico, glBad=badGluc;
  const fmt=v=>(v==null||v==='')?'—':esc(v);
  // [rótulo, clave del embudo]; el embudo filtra por lote completo (las dos filas juntas).
  const heads=[['Lote','lote'],['Variedad','variedad'],['Prensa','prensa'],['Análisis'],['Mes'],['Fecha'],['pH'],['AV'],['Gluc/Fruc'],['Málico'],['Motivo','motivo']];
  /* avAlerta resalta el AV del último análisis cuando hubo salto, aunque el valor
     esté por debajo de 0.85 y no sea "malo" por sí solo. */
  const celdasAna=(a,avAlerta)=>{
    const ph=num(a.ph),av=num(a.av),gl=num(a.gluc),mal=num(a.malico);
    const b=(val,isbad)=>`<td class="num ${isbad?'val-bad':''}">${fmt(val)}</td>`;
    return `<td class="num">${fmt(mesDe(a))}</td><td>${fmt(a.fecha)}</td>`+
           b(ph,false)+b(av,avBad(av)||!!avAlerta)+b(gl,glBad(gl))+b(mal,malBad(mal));
  };
  let h='<thead><tr>'+heads.map(([x,k])=>`<th>${x}${k?embudoHTML(fcRiesgo,k,x):''}</th>`).join('')+'</tr></thead><tbody>';
  for(const f of filas){
    const rs=f.pen?2:1;
    const ini=`<td class="num" rowspan="${rs}">${esc(f.lote)}</td><td rowspan="${rs}">${esc(f.variedad||'—')}</td><td rowspan="${rs}">${esc(f.prensa||'—')}</td>`;
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
  cablearEmbudos($('tRiesgo'), fcRiesgo);
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
const ESTADOS_DEG=[{val:'sin',text:'Sin degustar'},{val:'ok',text:'OK'},{val:'nook',text:'NO OK'}];
const COLS_DEG_FLT=[{k:'lote',label:'Lote'},{k:'id_origen',label:'ID Lote Origen'},{k:'variedad',label:'Variedad'},{k:'prensa',label:'Prensa'},
  {k:'estado',label:'Estado',valor:r=>r.estado||'sin',opciones:()=>ESTADOS_DEG}];
let fcDeg=null;
function initFiltrosDeg(){ fcDeg=crearFiltrosColumnas(COLS_DEG_FLT, ()=>lotesVis(), renderDegustacion, 'deg'); }
function limpiarFiltrosDeg(){ fcDeg.limpiar(); $('buscaDeg').value=''; _gf('buscaDeg',''); filtroLlenado.deg.reset(); renderDegustacion(); }

function renderDegustacion(){
  const ml=mapaLotes();
  const mes=mesDeg();
  const q=($('buscaDeg').value||'').toLowerCase().trim();
  const degMap=new Map(); DATOS.degustaciones.forEach(d=>{ if(+d.mes===+mes) degMap.set(+d.lote,d); });
  let rows=lotesVis().map(l=>{ const dg=degMap.get(+l.lote)||{};
    return {lote:l.lote, id_origen:l.id_origen, dias:diasDesde(l.dia_prensado), variedad:l.variedad, prensa:l.prensa,
            comentario:dg.comentario||'', estado:dg.estado||null, motivo:dg.motivo||null, motivo_detalle:dg.motivo_detalle||''};});
  if(q) rows=rows.filter(r=>[r.lote,r.id_origen,r.variedad].some(v=>v!=null&&String(v).toLowerCase().includes(q)));
  rows=rows.filter(fcDeg.pasa);
  rows=rows.filter(r=>filtroLlenado.deg.pasa(ml.get(+r.lote)));
  rows=sortRows(rows,sortDeg);
  const cols=[{k:'lote',label:'Lote',num:true},{k:'id_origen',label:'ID Lote Origen'},{k:'variedad',label:'Variedad'},{k:'prensa',label:'Prensa'},{k:'dias',label:'Días prensado',num:true}];
  let h='<thead><tr>'+cols.map(c=>{const ar=sortDeg.key===c.k?`<span class="arrow">${sortDeg.dir>0?'▲':'▼'}</span>`:''; return `<th data-k="${c.k}" class="${c.num?'num':''}">${c.label}${ar}${embudoHTML(fcDeg,c.k,c.label)}</th>`;}).join('')
    +`<th>Comentario</th><th>Estado${embudoHTML(fcDeg,'estado','Estado')}</th><th>Motivo (si NO OK)</th></tr></thead>`;
  const dash='<span style="color:var(--muted)">—</span>';
  let tb='<tbody>';
  rows.forEach(r=>{
    let mot=dash;
    if(r.estado==='nook'){
      mot='<div class="deg-motivos">'+MOTIVOS_DEG.map(m=>`<button class="degbtn motivo ${r.motivo===m?'active':''}" data-degmotivo="${escA(r.lote)}" data-m="${m}">${m}</button>`).join('')+'</div>';
      if(r.motivo==='Otro') mot+=`<input class="deg-otro" data-degotro="${escA(r.lote)}" placeholder="especificar…" value="${escA(r.motivo_detalle||'')}">`;
    }
    tb+=`<tr class="${[r.estado==='nook'?'crit':'', PM().esVaciado(ml.get(+r.lote))?'vacio':''].join(' ').trim()}">`
      +`<td class="num">${r.lote==null?'':esc(r.lote)}</td>`
      +`<td>${r.id_origen==null||r.id_origen===''?dash:esc(r.id_origen)}</td>`
      +`<td>${r.variedad?esc(r.variedad):dash}</td><td>${r.prensa?esc(r.prensa):dash}</td>`
      +`<td class="num">${r.dias==null?dash:r.dias+' d'}</td>`
      +`<td><input class="cell deg-com" data-degcom="${escA(r.lote)}" value="${escA(r.comentario||'')}" placeholder="comentario sensorial…"></td>`
      +`<td><div class="deg-estado"><button class="degbtn ok ${r.estado==='ok'?'active':''}" data-degestado="${escA(r.lote)}" data-e="ok">OK</button>`
      +`<button class="degbtn nook ${r.estado==='nook'?'active':''}" data-degestado="${escA(r.lote)}" data-e="nook">NO OK</button></div></td>`
      +`<td>${mot}</td></tr>`;
  });
  tb+='</tbody>';
  const t=$('tDeg'); t.innerHTML=h+tb;
  t.querySelectorAll('th[data-k]').forEach(th=>th.onclick=e=>{ if(e.target.closest('.th-flt'))return; toggleSort(sortDeg,th.dataset.k);_gf('orden:deg',sortDeg);renderDegustacion();});
  cablearEmbudos(t, fcDeg);
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
  vasija:($('arVasija').value||'Barricas'), recip:'1', sol:'Sol 1.030', ml:($('arMl').value||String(REGLAS.ACCION_ML))}; }
function regenerarAccion(){
  const mes=mesDeg();
  const anio=($('arFecha').value||'').slice(0,4)||String(today.getFullYear());
  const vas=$('arVasija').value||'Barricas', ml=$('arMl').value||String(REGLAS.ACCION_ML);
  const noOk=DATOS.degustaciones.filter(d=>+d.mes===mes && d.estado==='nook' && visibleAnio(d.lote)).slice().sort((a,b)=>(+a.lote)-(+b.lote));
  arRows=noOk.map(d=>({lote:d.lote, anio:anio, vasija:vas, recip:'1', sol:'Sol 1.030', ml:ml}));
  pintarAccion();
}
/* La "foto" que lee htmlHojaAccion (PM()). El mL del texto de la nota
   (REGLAS.ACCION_ML si el campo está vacío) se resuelve ACÁ: el renderizador
   solo imprime foto.ml tal cual, sin fallback propio (igual que hoy). Cada
   fila conserva su propio r.ml (no se pisa con este valor). */
function fotoAccion(){
  return { filas: arRows, fecha: $('arFecha').value, nro: $('arNro').value, densidad: $('arDensidad').value,
    emitio: $('arEmitio').value, recibio: $('arRecibio').value, ml: $('arMl').value||String(REGLAS.ACCION_ML),
    titulo: ordenTitulos.accion };
}
function pintarAccion(){
  if(pintarHojaGuardada()) return;
  $('arCount').textContent=arRows.length+' lotes NO OK';
  $('accionPaginas').innerHTML=PM().htmlHojaAccion(fotoAccion());
}
function arAplicar(){ const vas=$('arVasija').value||'Barricas', ml=$('arMl').value||String(REGLAS.ACCION_ML); arRows.forEach(r=>{r.vasija=vas;r.ml=ml;}); pintarAccion(); }

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
/* Tira de pasos de las cargas: 1 Pegar, 2 Revisar, 3 Cargar. */
function marcarPaso(id, n){ document.querySelectorAll('#'+id+' li').forEach(li=>li.classList.toggle('on', +li.dataset.p===n)); }
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
  msg.innerHTML=`<div class="msg ${errN?'info':'ok'}">Detectadas <b>${cargaPreview.length}</b> filas · <b style="color:var(--ok)">${okN}</b> se cargan · <b style="color:var(--nook)">${errN}</b> descartadas (lote inexistente/ inválido).<br>Formato de fecha detectado: <b>${fmtTxt}</b>.</div>`;
  const cols=[['estado','']	,['lote','Lote'],['fecha','Fecha'],['ph','pH'],['av','AV'],['gluc','Gluc'],['malico','Málico'],['so2l','SO2 L'],['motivo','Estado']];
  let h='<thead><tr>'+cols.map(c=>`<th>${c[1]}</th>`).join('')+'</tr></thead><tbody>';
  h+=cargaPreview.map(p=>{
    const pill=p.estado==='ok'?'<span class="pill ok">✓</span>':p.estado==='warn'?'<span class="pill warn">!</span>':'<span class="pill bad">✕</span>';
    const e=v=>(v==null||v==='')?'—':esc(v);
    return '<tr>'+`<td>${pill}</td><td class="num">${e(p.row.lote)}</td><td>${e(p.row.fecha)}</td><td class="num">${e(p.row.ph)}</td><td class="num">${e(p.row.av)}</td><td class="num">${e(p.row.gluc)}</td><td class="num">${e(p.row.malico)}</td><td class="num">${e(p.row.so2l)}</td><td style="color:var(--muted)">${esc(p.motivo)}</td>`+'</tr>';
  }).join('')+'</tbody>';
  $('tPreview').innerHTML=h;
  $('btnConfirmarCarga').style.display = okN>0?'inline-block':'none';
  marcarPaso('pasosCarga', 2);
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
  $('importMsg').innerHTML=`<div class="msg ok">${validos.length} análisis agregados al historial. Acordate de <b>Guardar</b>.</div>`;
  $('pasteArea').value=''; $('tPreview').innerHTML=''; $('btnConfirmarCarga').style.display='none'; cargaPreview=[];
  marcarPaso('pasosCarga', 3);
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
  msg.innerHTML=`<div class="msg ${errN?'info':'ok'}">Detectadas <b>${agrCargaPreview.length}</b> filas · <b style="color:var(--ok)">${okN}</b> se cargan · <b style="color:var(--nook)">${errN}</b> descartadas (lote inexistente / inválido).<br>Formato de fecha detectado: <b>${fmtTxt}</b>.</div>`;
  const cols=[['estado',''],['lote','Lote'],['fecha','Fecha'],['tipo','Tipo'],['cantidad','Cantidad'],['unidad','Unidad'],['motivo','Estado']];
  let h='<thead><tr>'+cols.map(c=>`<th>${c[1]}</th>`).join('')+'</tr></thead><tbody>';
  h+=agrCargaPreview.map(p=>{
    const pill=p.estado==='ok'?'<span class="pill ok">✓</span>':p.estado==='warn'?'<span class="pill warn">!</span>':'<span class="pill bad">✕</span>';
    const e=v=>(v==null||v==='')?'—':esc(v);
    return '<tr>'+`<td>${pill}</td><td class="num">${e(p.row.lote)}</td><td>${e(p.row.fecha)}</td><td>${esc(p.row.tipo)||'—'}</td><td class="num">${e(p.row.cantidad)}</td><td>${esc(p.row.unidad)||'—'}</td><td style="color:var(--muted)">${esc(p.motivo)}</td>`+'</tr>';
  }).join('')+'</tbody>';
  $('tAgrPreview').innerHTML=h;
  $('btnConfirmarCargaAgr').style.display = okN>0?'inline-block':'none';
  marcarPaso('pasosCargaAgr', 2);
}
function confirmarCargaAgr(){
  const validos=agrCargaPreview.filter(p=>p.estado!=='err');
  if(!validos.length) return;
  for(const p of validos){
    const r=p.row;
    DATOS.agregados.unshift({id:nextAgregadoId(), lote:r.lote, fecha:r.fecha, tipo:r.tipo, cantidad:r.cantidad, unidad:r.unidad});
  }
  markDirty();
  $('agrImportMsg').innerHTML=`<div class="msg ok">${validos.length} agregados sumados a la bitácora. Acordate de <b>Guardar</b>.</div>`;
  $('agrPasteArea').value=''; $('tAgrPreview').innerHTML=''; $('btnConfirmarCargaAgr').style.display='none'; agrCargaPreview=[];
  marcarPaso('pasosCargaAgr', 3);
  renderAgregados();
}

/* ===================== ORDEN DE MUESTRAS (imprimible) ===================== */
let ordenRows=[];
const ORDEN_PER_PAGE=25;
let ordenMapas=[];   // imágenes {src,nombre,pie} del mapa de barriles, anexadas al final
function pintarMapaChipsOrden(){
  $('ordMapaChips').innerHTML=ordenMapas.length
    ? ordenMapas.map((m,i)=>`<span class="chip">${esc(m.nombre)}<button data-delmapaord="${i}" title="Quitar imagen">✕</button></span>`).join('')
    : '<span class="tag">(sin imágenes)</span>';
}

function filaOrdenVacia(){ return {lote:'',variedad:'',vasija:($('ordVasija').value||''),cant:$('ordCant').value,recipiente:$('ordRecipiente').value}; }
const filtOrdenM={variedad:_FS?_FS.set('prensas:orden:f:variedad'):new Set(), prensa:_FS?_FS.set('prensas:orden:f:prensa'):new Set()};
let _descOrden=[], _instOrden=[];
function initFiltrosOrden(){
  _descOrden=[
    {label:'Variedad', set:filtOrdenM.variedad,
     opciones:()=>opcionesValores(lotesVis(), l=>l.variedad),
     match:matchValor(f=>f.variedad)},
    {label:'Prensa', set:filtOrdenM.prensa,
     opciones:()=>opcionesValores(lotesVis(), l=>l.prensa),
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
/* La "foto" que lee htmlHojaMuestras (PM()): filas tal cual están en memoria
   más los datos de encabezado/pie leídos de los inputs. */
function fotoMuestras(){
  return { filas: ordenRows, fecha: $('ordFecha').value, nro: $('ordNro').value, dia: $('ordDia').value,
    recibio: $('ordRecibio').value, titulo: ordenTitulos.muestras };
}
function pintarOrden(){
  if(pintarHojaGuardada()) return;
  $('ordenCount').textContent=ordenRows.length+' lotes';
  const fechaISO=$('ordFecha').value, p=fechaISO.split('-');
  const fechaTxt=p.length===3?`${p[2]}/${p[1]}/${p[0]}`:fechaISO, anio=p.length===3?p[0]:'';
  const nro=esc($('ordNro').value||''), dia=esc($('ordDia').value||'');
  let html=PM().htmlHojaMuestras(fotoMuestras());
  const totMapasOrd=ordenMapas.length;
  ordenMapas.forEach((m,i)=>{
    const sufijo=totMapasOrd>1?` (${i+1} de ${totMapasOrd})`:'';
    html+=`<div class="orden-hoja oh-mapa">`+
      PM().ohTop()+
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
  return [...new Set(lotesVis().map(l=>(l.variedad||'').trim()).filter(v=>v))].sort();
}
// Lotes llenos de las variedades elegidas (vacío = todas); útil para poblar orígenes.
function lotesRellenoVariedad(){
  if(!DATOS||!DATOS.lotes) return [];
  let sel=lotesVis().filter(l=>(l.litros||0)>0);
  if(rellenoVariedades.length) sel=sel.filter(l=>rellenoVariedades.includes((l.variedad||'').trim()));
  return sel.sort((a,b)=>(+a.lote)-(+b.lote));
}
function poblarRelVar(){
  const disp=variedadesDisponibles().filter(v=>!rellenoVariedades.includes(v));
  $('relVarAdd').innerHTML='<option value="">Agregar variedad…</option>'+
    disp.map(v=>`<option value="${escA(v)}">${esc(v)}</option>`).join('');
}
function pintarChipsVar(){
  $('relVarChips').innerHTML=rellenoVariedades.map(v=>
    `<span class="chip">${esc(v)}<button data-delvar="${escA(v)}" title="Quitar variedad">✕</button></span>`).join('');
}
function poblarRelOrigen(){
  const disponibles=lotesRellenoVariedad().filter(l=>!rellenoOrigenes.includes(+l.lote));
  $('relOrigenAdd').innerHTML='<option value="">Agregar lote origen…</option>'+
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
    ? rellenoMapas.map((m,i)=>`<span class="chip">${esc(m.nombre)}<button data-delmapa="${i}" title="Quitar imagen">✕</button></span>`).join('')
    : '<span class="tag">(sin imágenes)</span>';
}
function regenerarRelleno(){
  const vas=$('relVasija').value||'barril', cant=$('relCant').value||'1', rc=$('relRellenarCon').value||'';
  const sel=lotesRellenoVariedad().filter(l=>!rellenoOrigenes.includes(+l.lote));
  rellenoRows=sel.map(l=>({lote:l.lote, vasija:vas, cant:cant, rellenarCon:rc}));
  pintarRelleno();
}
/* La "foto" que lee htmlHojaRellenos (PM()): filas tal cual están en memoria
   más los datos de encabezado/pie/instrucciones leídos de los inputs. */
function fotoRellenos(){
  return { filas: rellenoRows, fecha: $('relFecha').value, nro: $('relNro').value, dia: $('relDia').value,
    emitio: $('relEmitio').value, recibio: $('relRecibio').value,
    instrucciones: $('relInstrucciones').value, pie: $('relPie').value, titulo: ordenTitulos.rellenos };
}
function pintarRelleno(){
  if(pintarHojaGuardada()) return;
  $('rellenoCount').textContent=rellenoRows.length+' lotes';
  const fechaISO=$('relFecha').value, p=fechaISO.split('-');
  const fechaTxt=p.length===3?`${p[2]}/${p[1]}/${p[0]}`:fechaISO, anio=p.length===3?p[0]:'';
  const nro=esc($('relNro').value||''), dia=esc($('relDia').value||'');
  let html=PM().htmlHojaRellenos(fotoRellenos());
  const totMapas=rellenoMapas.length;
  rellenoMapas.forEach((m,i)=>{
    const sufijo=totMapas>1?` (${i+1} de ${totMapas})`:'';
    html+=`<div class="orden-hoja oh-mapa">`+
      PM().ohTop()+
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

/* ===================== CONFIGURACIÓN ===================== */
/* Un recuadro por criterio de alerta (CAMPOS_ALERTAS, en shared/reglas-alertas.js).
   Editar cambia DATOS.config.alertas y recalcula REGLAS en el acto; se guarda
   con Guardar como cualquier otro cambio. Vacío = valor por defecto (se borra la clave). */
function cfgAlertas(){ if(!DATOS.config) DATOS.config={}; if(!DATOS.config.alertas) DATOS.config.alertas={}; return DATOS.config.alertas; }
function renderConfig(){
  const r=reglasAlertas(DATOS.config);
  let h='', grupo=null;
  for(const c of CAMPOS_ALERTAS){
    if(c.grupo!==grupo){ if(grupo!==null) h+='</div>'; grupo=c.grupo; h+=`<h2 class="cfg-grupo">${esc(grupo)}</h2><div class="cfg-grid">`; }
    h+=`<div class="card cfg-card" data-card="${c.k}">`+
      `<h3>${esc(c.titulo)}</h3>`+
      `<div class="cfg-valor"><input class="txt cfg-input" type="number" min="0" step="${c.int?1:'any'}" data-k="${c.k}" value="${escA(r[c.k])}"><span class="cfg-unidad">${esc(c.unidad)}</span></div>`+
      `<div class="cfg-regla"></div><div class="cfg-def"></div></div>`;
  }
  if(grupo!==null) h+='</div>';
  $('cfgCriterios').innerHTML=h;
  pintarConfigTextos();
}
/* Frases, "modificado" y avisos: se repintan sin rearmar los inputs (no pierde el foco). */
function pintarConfigTextos(){
  const guardado=(DATOS.config&&DATOS.config.alertas)||{};
  const r=reglasAlertas(DATOS.config);
  for(const c of CAMPOS_ALERTAS){
    const card=document.querySelector(`#cfgCriterios [data-card="${c.k}"]`); if(!card) continue;
    const propio=valorValido(guardado[c.k])!=null && valorValido(guardado[c.k])!==ALERTAS_DEFAULT[c.k];
    card.classList.toggle('cfg-propio', propio);
    card.querySelector('.cfg-regla').textContent=c.regla(r[c.k], r);
    card.querySelector('.cfg-def').innerHTML=`Por defecto: ${esc(ALERTAS_DEFAULT[c.k])} ${esc(c.unidad)}`+(propio?' · <b>modificado</b>':'');
  }
  $('cfgAvisos').innerHTML=avisosAlertas(r).map(a=>`<div class="aviso"><b>Atención:</b> ${esc(a)}</div>`).join('');
}
function setupConfig(){
  $('cfgCriterios').addEventListener('input',e=>{
    const inp=e.target.closest('input.cfg-input'); if(!inp) return;
    const c=CAMPOS_ALERTAS.find(x=>x.k===inp.dataset.k); if(!c) return;
    const txt=inp.value.trim(), v=valorValido(txt);
    const mal=txt!=='' && (v==null || (!!c.int && !Number.isInteger(v)));   // booleano: toggle(x, undefined) invierte
    inp.classList.toggle('cfg-mal', mal);
    inp.title=mal?(c.int?'Tiene que ser un número entero, 0 o mayor.':'Tiene que ser un número, 0 o mayor.'):'';
    if(mal) return;                                   // no se guarda basura: queda el último válido
    const al=cfgAlertas();
    if(txt==='') delete al[c.k]; else al[c.k]=v;
    aplicarReglas(); markDirty(); pintarConfigTextos();
  });
  // al salir de un campo vacío, mostrar el valor por defecto que quedó vigente
  $('cfgCriterios').addEventListener('focusout',e=>{
    const inp=e.target.closest('input.cfg-input'); if(!inp) return;
    if(inp.value.trim()===''||inp.classList.contains('cfg-mal')){ inp.value=reglasAlertas(DATOS.config)[inp.dataset.k]; inp.classList.remove('cfg-mal'); inp.title=''; }
  });
  $('btnCfgRestaurar').onclick=()=>{
    if(!confirm('¿Volver todos los criterios de alerta a los valores por defecto?\n\nEl cambio queda firme cuando guardes con Guardar.')) return;
    if(DATOS.config) delete DATOS.config.alertas;
    aplicarReglas(); markDirty(); renderConfig();
  };
}

/* ===================== NAV / INIT ===================== */
function renderActive(){
  if(pintarHojaGuardada()) return; // orden guardada: solo su papel, en solo lectura
  // La vista activa sale de la sección (#v-<v>), no del botón de pestaña:
  // Muestras y Rellenos (modo órdenes) ya no tienen botón, y leerlo de ahí
  // tiraba TypeError al abrir una orden nueva de esos tipos.
  const sec=document.querySelector('.view.active');
  const v=sec?sec.id.slice(2):'dashboard';
  if(v==='dashboard')renderDashboard();
  else if(v==='riesgo')renderRiesgo();
  else if(v==='lotes')renderLotes();
  else if(v==='analisis')renderAnalisis();
  else if(v==='agregados')renderAgregados();
  else if(v==='degustacion')renderDegustacion();
  else if(v==='orden')renderOrden();
  else if(v==='relleno')renderRelleno();
  else if(v==='config')renderConfig();
}
/* Muestra la vista <v> (#v-<v>), marca el/los botones de pestaña activos y
   dibuja. Es lo que hacía a mano el click de setupTabs; se extrae para que el
   modo órdenes (arrancarModoOrden/abrirHojaNueva) también pueda activar una
   vista sin simular un click. */
/* Modo órdenes (/prensas/?orden=…): la pantalla no se anota en el #hash. */
function enModoOrdenesP(){ return !!new URLSearchParams(location.search).get('orden'); }
/* op.sinHistorial: no anotar en la URL (Atrás/Adelante o el F5, que ya la
   tienen). Sin guarda de botón: el modo órdenes abre Muestras/Rellenos, que ya
   no tienen pestaña. */
function activarVista(v, op={}){
  if(!$('v-'+v)) return;
  // La pantalla queda en la URL (#analisis…, shared/pantalla-url.js): el F5
  // vuelve a ella y Atrás a la anterior. En modo órdenes, no.
  if(!op.sinHistorial && !enModoOrdenesP() && window.CIWPantalla) CIWPantalla.anotarPantalla(v);
  const masBtn=$('masBtn');
  const b=document.querySelector('.tabs [data-v="'+v+'"]');
  document.querySelectorAll('.tabs button[data-v]').forEach(x=>x.classList.toggle('active',x.dataset.v===v));
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  $('v-'+v).classList.add('active');
  const enMas=!document.querySelector('.tabs > button[data-v="'+v+'"]');
  masBtn.classList.toggle('active',enMas);
  masBtn.textContent=enMas?(b?b.textContent:v):'Más';
  // Antes de que cargar() traiga los datos no hay qué dibujar: lo dibuja él.
  if(listo) renderActive();
}
function setupTabs(){
  const masBtn=$('masBtn'), masMenu=$('masMenu');
  const cerrarMas=()=>{ masMenu.classList.remove('open'); masBtn.setAttribute('aria-expanded','false'); };
  masBtn.addEventListener('click',e=>{ e.stopPropagation(); const ab=!masMenu.classList.contains('open');
    masMenu.classList.toggle('open',ab); masBtn.setAttribute('aria-expanded',String(ab)); });
  document.addEventListener('click',e=>{ if(!e.target.closest('#masWrap')) cerrarMas(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') cerrarMas(); });
  $('tabs').addEventListener('click',e=>{ const b=e.target.closest('button[data-v]'); if(!b)return;
    cerrarMas(); activarVista(b.dataset.v);
  });
  const pantallas=[...document.querySelectorAll('.tabs button[data-v]')].map(b=>b.dataset.v);
  const deUrl=()=>window.CIWPantalla?CIWPantalla.pantallaDeHash(location.hash,pantallas):null;
  // Sin hash es la de entrada: el Panel. En modo órdenes (?orden=…) la
  // pantalla no va al hash: ni Atrás ni el F5 la mueven (manda arrancarModoOrden).
  window.addEventListener('popstate',()=>{ if(enModoOrdenesP()) return; cerrarMas(); activarVista(deUrl()||'dashboard',{sinHistorial:true}); });
  // F5 sobre una pantalla: se abre ya; cargar() la dibuja al llegar los datos.
  const enUrl=enModoOrdenesP()?null:deUrl(); if(enUrl) activarVista(enUrl,{sinHistorial:true});
  if(window.CIWPantalla) CIWPantalla.restaurada();
  $('btnHistorial').addEventListener('click',cerrarMas);
  // La barra de Prensas queda pegada debajo de la barra de la plataforma, que
  // la inyecta el servidor con defer: se mide cuando ya está.
  const medir=()=>{ const cb=document.getElementById('ciw-barra');
    document.documentElement.style.setProperty('--ciw-h',(cb?cb.offsetHeight:0)+'px'); };
  medir(); window.addEventListener('load',medir); window.addEventListener('resize',medir);
}
/* Solapas del panel: una sola tabla de pendientes a la vista. La elegida se
   recuerda en este navegador. */
const SOLAPAS=['tNoOk','tVenc','tProx','tUltAgr'];
function elegirSolapa(id){
  if(!SOLAPAS.includes(id)) id='tNoOk';
  document.querySelectorAll('#dashSolapas [data-sol]').forEach(b=>{ const on=b.dataset.sol===id; b.classList.toggle('active',on); b.setAttribute('aria-selected',String(on)); });
  document.querySelectorAll('.sol-panel').forEach(p=>p.classList.toggle('activo',p.dataset.sol===id));
  try{ localStorage.setItem('prensas_solapa',id); }catch(e){}
}
function setupSolapas(){
  $('dashSolapas').addEventListener('click',e=>{ const b=e.target.closest('[data-sol]'); if(b) elegirSolapa(b.dataset.sol); });
  let id='tNoOk'; try{ id=localStorage.getItem('prensas_solapa')||id; }catch(e){}
  elegirSolapa(id);
}
function setup(){
  // Buscadores y selects escalares que sobreviven al F5 en esta pestaña
  // (shared/filtros-sesion.js): se restauran ANTES del primer render, que
  // llega recién con cargar() (al final de esta función, por el puente).
  $('buscaLotes').value=_lf('buscaLotes','');
  $('buscaAna').value=_lf('buscaAna','');
  $('buscaAgr').value=_lf('buscaAgr','');
  $('buscaRiesgo').value=_lf('buscaRiesgo','');
  $('buscaDeg').value=_lf('buscaDeg','');
  // Selects: el valor guardado solo se aplica si sigue entre las opciones (si
  // no, queda el default que ya trae el HTML). Mismo cuidado que selMes más abajo.
  const _restaurarSelect=(id,d)=>{ const g=_lf(id,d); const el=$(id); if([...el.options].some(o=>o.value===g)) el.value=g; };
  _restaurarSelect('anaMostrar','');
  _restaurarSelect('ordenFuente','todos');
  _restaurarSelect('ordenNookTipo','todos');
  // Orden de cada tabla (selMes/selMesDeg se restauran en initMesSelectors,
  // después de armar sus opciones).
  [['orden:lotes',sortLotes],['orden:ana',sortAna],['orden:agr',sortAgr],['orden:deg',sortDeg]]
    .forEach(([k,st])=>{ const g=_lf(k,null); if(_sortValido(g)) Object.assign(st,g); });
  const gDash=_lf('orden:dash',null);
  if(gDash && _sortValido(gDash.tNoOk) && _sortValido(gDash.tVenc) && _sortValido(gDash.tProx)) Object.assign(sortDash,gDash);

  setupTabs();
  setupSolapas();
  setupConfig();
  pedirUsuario(false);
  $('usuario').onclick=()=>pedirUsuario(true);
  $('btnHistorial').onclick=verHistorial;
  $('btnConectar').onclick=mostrarQR;
  $('selMes').onchange=()=>{ _gf('selMes',$('selMes').value); renderActive(); };
  $('btnGuardar').onclick=()=>guardar();   // ojo: sin argumento (el click pasaría el evento como "forzar")
  $('btnExport').onclick=async()=>{ if(dirty){ if(!await guardar())return; } CIW_EXPORTAR('prensas', DATOS); };
  $('buscaLotes').oninput=()=>{ _gf('buscaLotes',$('buscaLotes').value); renderLotes(); }; $('btnAddLote').onclick=()=>{ DATOS.lotes.unshift({lote:null,variedad:null,origen:null,ig:null,id_origen:null,ot_prensado:null,litros:null,dia_prensado:null,prensa:null,so2_agregado:null,comentario:null,accion:null,comentario2:null,accion2:null}); markDirty(); renderLotes(); };
  $('buscaAna').oninput=()=>{ _gf('buscaAna',$('buscaAna').value); renderAnalisis(); };
  $('btnLimpiarFltAna').onclick=limpiarFiltrosAna;
  $('anaMostrar').onchange=()=>{ _gf('anaMostrar',$('anaMostrar').value); renderAnalisis(); };
  $('buscaRiesgo').oninput=()=>{ _gf('buscaRiesgo',$('buscaRiesgo').value); renderRiesgo(); };
  $('btnLimpiarFltRiesgo').onclick=limpiarFiltrosRiesgo;
  // degustación
  if(!$('degFecha').value){ const d=new Date(),z=n=>String(n).padStart(2,'0'); $('degFecha').value=`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }
  $('buscaDeg').oninput=()=>{ _gf('buscaDeg',$('buscaDeg').value); renderDegustacion(); };
  $('btnLimpiarFltDeg').onclick=limpiarFiltrosDeg;
  $('selMesDeg').onchange=()=>{ _gf('selMesDeg',$('selMesDeg').value); renderDegustacion(); };
  (()=>{ const td=$('tDeg');
    td.addEventListener('click',e=>{
      const be=e.target.closest('[data-degestado]'); if(be){ setDegEstado(be.dataset.degestado, be.dataset.e); return; }
      const bm=e.target.closest('[data-degmotivo]'); if(bm){ setDegMotivo(bm.dataset.degmotivo, bm.dataset.m); return; }
    });
    td.addEventListener('input',e=>{
      const ci=e.target.closest('[data-degcom]'); if(ci){ const dg=getDegRow(ci.dataset.degcom,mesDeg(),true); dg.comentario=ci.value; if(dg.estado&&!dg.fecha)dg.fecha=($('degFecha').value||null); podarDeg(dg); markDirty(); return; }
      const oi=e.target.closest('[data-degotro]'); if(oi){ const dg=getDegRow(oi.dataset.degotro,mesDeg(),true); dg.motivo_detalle=oi.value; markDirty(); return; }
    });
  })();
  // acción rápida (corrección SO2)
  if(!$('arFecha').value){ const d=new Date(),z=n=>String(n).padStart(2,'0'); $('arFecha').value=`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }
  $('btnArRegenerar').onclick=regenerarAccion;
  $('btnArImprimir').onclick=()=>imprimirOrdenPrensas('prensas-accion');
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
  $('ordenFuente').addEventListener('change',()=>{ _gf('ordenFuente',$('ordenFuente').value); ordenRows=[]; regenerarOrden(); });
  $('ordenNookTipo').addEventListener('change',()=>{ _gf('ordenNookTipo',$('ordenNookTipo').value); regenerarOrden(); });
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
  $('btnImprimir').onclick=()=>imprimirOrdenPrensas('prensas-muestras');
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
  $('btnImprimirRelleno').onclick=()=>imprimirOrdenPrensas('prensas-rellenos');
  $('btnAddAna').onclick=()=>{ DATOS.analisis.unshift({lote:null,mes:null,fecha:null,etanol:null,ph:null,av:null,gluc:null,malico:null,lactico:null,at:null,azucar:null,so2l:null,so2t:null,ot:null}); markDirty(); renderAnalisis(); };
  // agregados
  if(!$('agrFecha').value){ const d=new Date(),z=n=>String(n).padStart(2,'0'); $('agrFecha').value=`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }
  $('agrUnidad').value=unidadPorTipo($('agrTipo').value);
  $('agrTipo').onchange=()=>{ $('agrUnidad').value=unidadPorTipo($('agrTipo').value); };
  $('buscaAgr').oninput=()=>{ _gf('buscaAgr',$('buscaAgr').value); renderAgregados(); };
  $('btnLimpiarFltAgr').onclick=limpiarFiltrosAgr;
  // orden de trabajo de agregados
  if(!$('agrOrdFecha').value){ const d=new Date(),z=n=>String(n).padStart(2,'0'); $('agrOrdFecha').value=`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }
  $('btnAgrOrdFiltrados').onclick=agrOrdAgregarFiltrados;
  $('btnAgrOrdVaciar').onclick=agrOrdVaciar;
  $('btnAgrOrdAdd').onclick=agrOrdAgregarManual;
  $('btnAgrOrdPegar').onclick=agrOrdAgregarPegados;
  ['agrOrdLote','agrOrdCant'].forEach(id=>$(id).addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); agrOrdAgregarManual(); } }));
  $('btnAgrOrdImprimir').onclick=()=>imprimirOrdenPrensas('prensas-agregados');
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
  $('pasteArea').addEventListener('input',()=>marcarPaso('pasosCarga',1));
  $('agrPasteArea').addEventListener('input',()=>marcarPaso('pasosCargaAgr',1));
  $('btnAnalizar').onclick=analizarPegado; $('btnConfirmarCarga').onclick=confirmarCarga;
  $('fileCsv').onchange=e=>{ const f=e.target.files[0]; if(!f)return; const rd=new FileReader(); rd.onload=()=>{$('pasteArea').value=rd.result; analizarPegado();}; rd.readAsText(f); };
  setInterval(vigilarEstado, 60000);   // vigilancia periódica de conflictos
  // Los módulos compartidos llegan por js/puente.js (type=module, corre después
  // de este script): recién con ellos se fija el entorno de órdenes de papel
  // (guardar-ot.js / vista-orden-guardada.js, compartidos con Lotes) y se
  // cargan y dibujan los datos.
  if(window.PrensasMods) iniciarConModulos(); else document.addEventListener('prensas:mods-listos', iniciarConModulos, {once:true});
  // Si el puente no llega (archivo que no baja, error en un módulo), la
  // pantalla quedaría en "Cargando…" para siempre sin decir nada.
  setTimeout(()=>{ if(!window.PrensasMods && !DATOS) window.__puenteFallo(); }, 8000);
}
/* Lo llama también el onerror del <script type=module> de index.html. */
window.__puenteFallo = function(){
  const s=$('status'); if(!s) return;
  s.textContent='No se pudo cargar la app. Recargá con Ctrl+F5.';
  s.className='status dirty';
};
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
