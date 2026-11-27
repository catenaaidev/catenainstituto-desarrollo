// Ficha tecnica de solo lectura. No altera criterios ni persistencia.
import {normVasija} from './v6.js?v=8';
export const presente = v => v !== null && v !== undefined && (typeof v === 'number' || typeof v === 'string') && String(v).trim() !== '';
export function numero(v) {
  if (!presente(v)) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n !== -999 ? n : null;
}
export function datosRegistro(r) {
  try { const d = typeof r?.datos === 'string' ? JSON.parse(r.datos) : r?.datos; return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch { return {}; }
}
const tiempo = r => Date.parse(/^\d{4}-\d{2}-\d{2} \d/.test(r.fecha_muestra||'') ? r.fecha_muestra.replace(' ','T')+'Z' : r.fecha_muestra);
export function fichaVasija(lote, vasija) {
  const n = normVasija(vasija), coincide = r => n !== '' && normVasija(r.vasija) === n;
  const registros = (lote.registros || []).filter(r=>coincide(r) && !r.anulado && Number.isFinite(tiempo(r))).sort((a,b)=>tiempo(a)-tiempo(b));
  const datosPorRegistro = new Map(registros.map(r=>[r,datosRegistro(r)]));
  const inicial = registros.findLast(r=>r.tipo==='analisis_inicial');
  const ots = (lote.ots || []).filter(coincide);
  const movimientos = (lote.movs || []).filter(m=>n!=='' && [m.origen,m.destino].some(v=>normVasija(v)===n));
  const decisiones = (lote.decisiones || []).filter(coincide);
  const ultima = k => { for(let i=registros.length-1;i>=0;i--){const r=registros[i],valor=numero(datosPorRegistro.get(r)[k]);if(valor!==null)return {valor,r};}return null; };
  const serie = k => registros.flatMap(r=>{const valor=numero(datosPorRegistro.get(r)[k]);return valor===null?[]:[{t:tiempo(r),valor}];});
  return {registros,inicial,datos:datosPorRegistro.get(inicial)||{},ots,movimientos,decisiones,ultima,serie};
}
const fmt = n => new Intl.NumberFormat('es-AR',{maximumFractionDigits:3}).format(n);
const corto = t => new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Mendoza',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(t));
// Etiquetas fijas en SVG; todo dato insertado es numerico o fecha formateada.
export function curvaResumen(serie, tipo) {
  const nombres={brix:'Brix (°Bx)',temperatura:'Temperatura (°C)',ph:'pH',az_red:'Azúcares reductores'};
  const titulo=nombres[tipo]; if(!titulo)return '';
  const p=serie.filter(x=>Number.isFinite(x.t)&&Math.abs(x.t)<=8640000000000000&&Number.isFinite(x.valor)).sort((a,b)=>a.t-b.t);
  if(!p.length)return '';
  const W=480,H=194,L=58,R=20,T=16,B=42;
  const t0=p[0].t,t1=p.at(-1).t,vs=p.map(x=>x.valor),min=Math.min(...vs),max=Math.max(...vs),pad=(max-min)*.12||Math.max(Math.abs(min)*.05,.1),lo=min-pad,hi=max+pad;
  const X=t=>t0===t1?(W+L-R)/2:L+(t-t0)/(t1-t0)*(W-L-R),Y=v=>T+(hi-v)/(hi-lo)*(H-T-B);
  const grid=Array.from({length:4},(_,i)=>{const v=lo+(hi-lo)*i/3,y=Y(v).toFixed(2);return `<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}" class="rs-grid"/><text x="${L-7}" y="${y}" text-anchor="end" dominant-baseline="middle">${fmt(v)}</text>`;}).join('');
  const dots=p.map(x=>`<circle cx="${X(x.t).toFixed(2)}" cy="${Y(x.valor).toFixed(2)}" r="3.6"><title>${corto(x.t)} · ${fmt(x.valor)}</title></circle>`).join('');
  return `<svg class="rs-curva rs-${tipo}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución de ${titulo}">${grid}${p.length>1?`<polyline points="${p.map(x=>X(x.t).toFixed(2)+','+Y(x.valor).toFixed(2)).join(' ')}"/>`:''}${dots}<text x="${L}" y="${H-12}">${corto(t0)}</text>${t1!==t0?`<text x="${W-R}" y="${H-12}" text-anchor="end">${corto(t1)}</text>`:''}</svg>`;
}
