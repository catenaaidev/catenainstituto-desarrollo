// Vendimia V6: piezas sin estado (testeables en Node) usadas por libros-app.js.
export const VERSION = 'V6 · 2026-11-25';
export const CAMPOS_ID = [['lote_sistema','LOTE SISTEMA'],['variedad','VARIEDAD'],['distrito','DISTRITO'],['proyecto','PROYECTO'],['vinedo','VIÑEDO'],['ct','CT'],['clon','CLON'],['id_texto','ID'],['organico_convencional','ORGÁNICO / CONVENCIONAL'],['origen','ORIGEN']];
export const ETAPAS = [
 ['precarga','Precarga de identificación',null],['ot_ingreso','OT de ingreso y molienda','molienda-ch-v1'],['analisis_iniciales','Análisis iniciales','tintos-v1'],
 ['agregados','Agregados','B005 OT agregados siembra.xlsx'],['nutrientes','Agregado de nutrientes','Agregado de nutrientes'],['seguimiento_fa','Seguimiento de FA','brix-v1'],
 ['fin_fa','Evaluación fin de FA','tintos-v1'],['fml','FML (si termina)',null],['pie_de_cuba','Pie de cuba (si no termina)',null],
 ['correccion_ph','Corrección de pH','criterios-v1'],['inoculacion_bal','Inoculación con BAL',null],['crianza_so2','Crianza y correcciones de SO₂','Anhídrido sulfuroso (SO₂)']];
export const ESTADO_ETAPA = {pendiente:'Pendiente',en_curso:'En curso',hecha:'Hecha',no_aplica:'No corresponde'};
export const SIGUIENTE_ESTADO = {pendiente:'en_curso',en_curso:'hecha',hecha:'no_aplica',no_aplica:'pendiente'};
export const norm = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export const normVasija = v => String(v ?? '').trim().toLowerCase().replace(/\s+/g,'');
const serialAISO = n => new Date(Date.UTC(1899,11,30) + Math.round(n)*86400000).toISOString().slice(0,10);
export const isoASerial = iso => Math.round((Date.parse(iso+'T00:00:00Z') - Date.UTC(1899,11,30))/86400000);

/** Ubica la tabla diaria de la planilla de Tintos por sus encabezados (no por coordenadas). */
function tablaDiaria(s){
 const enc = s.celldata.find(c => { const t = norm(c.v?.v ?? c.v?.m); return t.startsWith('brix (') && t.includes('6'); });
 if (!enc) return null;
 const fila = s.celldata.filter(c => c.r === enc.r);
 const fc = fila.find(c => norm(c.v?.v).startsWith('fecha'))?.c, tc = fila.find(c => norm(c.v?.v).startsWith('°c'))?.c;
 if (fc === undefined) return null;
 return {r: enc.r, brix: enc.c, temp: tc, fecha: fc};
}

/** Incorpora mediciones (de la planilla de control diario) en la tabla diaria
 *  de la Tintos del mismo lote y vasija. Nunca pisa fórmulas ni valores
 *  distintos: los devuelve como conflictos para que la persona decida. */
export function integrarMediciones(snapshot, mediciones){
 const next = structuredClone(snapshot), res = {snapshot: next, agregadas: 0, conflictos: [], sinFila: []};
 const si = next.sheets.findIndex(s => tablaDiaria(s)); if (si < 0) throw Error('No se encontró la tabla diaria (columna “Brix (6 a.m)”). Si cambiaste el encabezado, cargá los valores a mano.');
 const s = next.sheets[si], t = tablaDiaria(s), celda = (r,c) => s.celldata.find(x => x.r === r && x.c === c);
 const filas = new Map();
 for (const c of s.celldata) if (c.c === t.fecha && c.r > t.r && typeof c.v?.v === 'number' && c.v.v > 30000) filas.set(serialAISO(c.v.v), c.r);
 for (const m of mediciones) {
  const r = filas.get(String(m.fecha).slice(0,10));
  if (r === undefined) { res.sinFila.push(m); continue; }
  for (const [campo, col] of [['brix', t.brix], ['temperatura', t.temp]]) {
   if (col === undefined || m[campo] === null || m[campo] === undefined) continue;
   const x = celda(r, col), actual = x?.v?.v;
   if (x?.v?.f) { res.conflictos.push({hoja: si, r, c: col, campo, fecha: m.fecha, planilla: '(fórmula)', medicion: m[campo], formula: true}); continue; }
   if (actual === undefined || actual === null || actual === '') { if (x) x.v = {...x.v, v: m[campo], m: String(m[campo])}; else s.celldata.push({r, c: col, v: {v: m[campo], m: String(m[campo])}}); res.agregadas++; }
   else if (Number(actual) !== Number(m[campo])) res.conflictos.push({hoja: si, r, c: col, campo, fecha: m.fecha, planilla: actual, medicion: m[campo]});
  }
 }
 return res;
}
export function ponerValor(snapshot, {hoja, r, c, medicion}){
 const next = structuredClone(snapshot), s = next.sheets[hoja], x = s.celldata.find(x => x.r === r && x.c === c);
 if (x?.v?.f) throw Error('La celda tiene una fórmula: no se reemplaza.');
 if (x) x.v = {...x.v, v: medicion, m: String(medicion)}; else s.celldata.push({r, c, v: {v: medicion, m: String(medicion)}});
 return next;
}

/** Fija la fecha de recepción en la copia de trabajo de molienda: reemplaza
 *  =TODAY() del encabezado “Fecha:” para que no cambie al reabrir. La
 *  plantilla original conserva su fórmula. */
export function fijarFechaMolienda(snapshot, iso){
 const next = structuredClone(snapshot), s = next.sheets[0];
 const lab = s.celldata.find(c => norm(c.v?.v) === 'fecha:'); if (!lab) return {snapshot, cambio: false};
 const x = s.celldata.filter(c => c.r === lab.r && c.c > lab.c && (c.v?.f || (c.v?.v ?? "") !== "")).sort((a,b) => a.c - b.c)[0];
 if (!x || (x.v?.f && !/^=?\+?today\(\)$/i.test(String(x.v.f).replace(/\s/g,'')))) return {snapshot, cambio: false};
 const serial = isoASerial(iso), m = iso.split('-').reverse().join('/');
 if (!x.v?.f && x.v?.v === serial) return {snapshot, cambio: false};
 x.v = {...x.v, v: serial, m}; delete x.v.f;
 return {snapshot: next, cambio: true};
}

/** Filtro del historial. */
export function filtrar(ingresos, f){
 const q = norm(f.q);
 return ingresos.filter(x => {
  const info = x._info || {};
  if (f.anio && String(x._anio) !== String(f.anio)) return false;
  if (f.estado && x.estado !== f.estado) return false;
  for (const k of ['variedad','distrito','proyecto','vinedo']) if (f[k] && info[k] !== f[k]) return false;
  if (f.vasija && !x._vasijas.includes(normVasija(f.vasija))) return false;
  if (f.autor && x.autor !== f.autor) return false;
  if (f.planilla && !String(x.planillas || '').split(',').includes(f.planilla)) return false;
  if (f.desde && (x.recepcion || String(x.actualizado).slice(0,10)) < f.desde) return false;
  return !q || norm([x.lote, x.nombre_lote, x.vasija, x.estado, ...Object.values(info).filter(v => typeof v === 'string')].join(' ')).includes(q);
 });
}
export function enriquecer(x){
 let info = {}; try { info = JSON.parse(x.informacion_id || '{}'); } catch {}
 const anio = /^\d{5}$/.test(x.lote) ? 2000 + Number(x.lote.slice(0,2)) : Number(String(x.recepcion || x.actualizado).slice(0,4));
 const vasijas = [x.vasija, ...(info.recepcion_detalle?.destinos || []).map(d => d.vasija)].map(normVasija).filter(Boolean);
 return {...x, _info: info, _anio: anio, _vasijas: vasijas};
}

/** Gráfico SVG de Brix y temperatura (datos reales; no interpola valores faltantes). */
export function graficoSVG(puntos){
 const p = puntos.filter(x => x.brix !== null || x.temperatura !== null).sort((a,b) => a.fecha < b.fecha ? -1 : 1);
 if (!p.length) return '<p class="muted">Todavía no hay mediciones de Brix o temperatura para esta vasija.</p>';
 const W = 640, H = 240, L = 40, R = 40, T = 16, B = 34, fechas = [...new Set(p.map(x => x.fecha))];
 const X = f => L + (fechas.length < 2 ? (W-L-R)/2 : fechas.indexOf(f) * (W-L-R) / (fechas.length-1));
 const esc = (vals, a, b) => { const v = vals.filter(x => x !== null); const lo = Math.min(...v, a), hi = Math.max(...v, b); return y => T + (hi - y) * (H-T-B) / ((hi - lo) || 1); };
 const yb = esc(p.map(x => x.brix), 0, 25), yt = esc(p.map(x => x.temperatura), 10, 30);
 const linea = (k, y, cls) => { const q = p.filter(x => x[k] !== null); return `<polyline class="${cls}" fill="none" points="${q.map(x => X(x.fecha).toFixed(1)+','+y(x[k]).toFixed(1)).join(' ')}"/>` + q.map(x => `<circle class="${cls}" cx="${X(x.fecha).toFixed(1)}" cy="${y(x[k]).toFixed(1)}" r="3.5"><title>${x.fecha.split('-').reverse().join('/')} · ${k === 'brix' ? 'Brix' : 'Temp.'} ${x[k]}</title></circle>`).join(''); };
 const et = fechas.filter((_, i) => i % Math.ceil(fechas.length / 8) === 0).map(f => `<text x="${X(f)}" y="${H-12}" text-anchor="middle">${f.slice(8,10)}/${f.slice(5,7)}</text>`).join('');
 return `<svg class="v6-grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución de Brix y temperatura"><line x1="${L}" y1="${H-B}" x2="${W-R}" y2="${H-B}" class="eje"/>${et}<text x="4" y="12" class="g-brix">°Brix</text><text x="${W-4}" y="12" text-anchor="end" class="g-temp">°C</text>${linea('brix', yb, 'g-brix')}${linea('temperatura', yt, 'g-temp')}</svg>`;
}
