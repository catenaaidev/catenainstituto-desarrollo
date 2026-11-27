/** Límite operativo, distinto del criterio químico. No revalida registros históricos intactos. */
import { criteriosEfectivos } from './fml';
import type { Datos } from '../../prensas/validacion';
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const filas = (v: unknown): Obj[] => Array.isArray(v) ? v.map(obj) : [];
const numero = (v: unknown): number | null => {
  if (v == null || typeof v === 'boolean' || (typeof v !== 'number' && typeof v !== 'string') || String(v).trim() === '') return null;
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const clave = (x: unknown) => String(x ?? '').trim();
const vigente = (v: unknown) => !v || (typeof v === 'object' && Object.keys(v).length === 0);
const canon = (x: unknown): string => {
  if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canon(v)).join(',') + '}';
  return JSON.stringify(x) ?? 'null';
};
function limite(datos: Datos, lote: unknown): number {
  const l = filas(datos.lotes).find(x => clave(x.lote) === clave(lote)) || {};
  const c = criteriosEfectivos(obj(obj(datos.config).criterios_fml), l.variedad, l.proyecto);
  const n = numero(c.so2_libre_techo);
  return n !== null && n > 0 ? Math.min(40,n) : 40;
}
/** Comprueba objetivo y dosis exigiendo volumen para dosis positivas. No cambia la fórmula de CIW. */
export function problemaTechoSo2(actual: unknown, objetivo: unknown, litros: unknown, gramos: unknown, ml: unknown, techo: number, excepcional = false): string {
  const t = numero(objetivo), a = numero(actual), L = numero(litros), g = numero(gramos), m = numero(ml);
  const max = excepcional && Number.isFinite(techo) && techo > 0 ? techo : Math.min(40, techo > 0 ? techo : 40);
  if (objetivo != null && objetivo !== '' && (t === null || t < 0 || t > max)) return `el objetivo de SO₂ supera el techo de ${max} ppm o es inválido`;
  if ((gramos != null && gramos !== '' && g === null) || (ml != null && ml !== '' && m === null) || (g ?? 0) < 0 || (m ?? 0) < 0) return 'dosis de SO₂ inválida';
  if (!( (g ?? 0) > 0 || (m ?? 0) > 0)) return '';
  if (t === null || a === null || a < 0 || a >= t) return 'faltan mediciones válidas para el agregado de SO₂ o el valor actual ya alcanza el objetivo';
  if (L === null || L <= 0) return 'faltan litros válidos para verificar la dosis de SO₂; recargá o regenerá la corrección';
  {
    const dif = Math.max(0, max - a);
    if ((g ?? 0) > dif * L * 1.5 / 1000 * 2 + 1e-8 || (m ?? 0) > dif * L * 1.5 / 55 + 1e-8) return `la dosis supera el techo operativo de ${max} ppm`;
  }
  return '';
}
const firmaCorreccion = (a: Obj) => {
  const c = obj(a.correccion);
  return canon([clave(a.lote), clave(c.fecha ?? a.fecha_analisis), clave(c.ot_n), c.vasija, c.so2_libre_actual, c.so2_deseado, c.mbk_a_agregar, c.ml_exactos, c.litros, c.vasijas, c.excepcion_so2]);
};
const firmaOrden = (o: Obj) => canon([o.id, o.numero, o.lotes]);
function contador<T>(xs: T[], firma: (x:T)=>string) { const m = new Map<string, number>(); for (const x of xs) {const k=firma(x);m.set(k,(m.get(k)||0)+1);} return m; }
function consumir(m: Map<string,number>, k: string) {const n=m.get(k)||0;if(n){m.set(k,n-1);return true;}return false;}
type AutorExcepcion = { rol?: string | null; email?: string; ahora?: string };
const exDe = (l: Obj) => obj(l.excepcion_so2);
const tieneEx = (l: Obj) => Object.keys(exDe(l)).length > 0;
const autorizado = (e: Obj) => typeof e.autorizada_por === 'string' && !!e.autorizada_por && typeof e.autorizada_en === 'string' && !!e.autorizada_en;
const limpio = (l: Obj) => { const { excepcion_so2, ...resto } = l; const e = obj(excepcion_so2); return canon([resto, e.objetivo, e.motivo]); };
const casi = (a: unknown, b: unknown) => { const x=numero(a), y=numero(b); return x !== null && y !== null && Math.abs(x-y) <= 1e-8; };
const puedeAutorizar = (a: AutorExcepcion) => a.rol === 'admin' && typeof a.email === 'string' && !!a.email && typeof a.ahora === 'string' && !!a.ahora;
function problemaExcepcion(l: Obj, e: Obj, techo: number): string {
  const t = numero(e.objetivo), motivo = e.motivo;
  if (t === null || t <= techo || !casi(l.objetivo,t) || typeof motivo !== 'string' || motivo.trim().length < 5 || motivo.length > 500) return 'excepción SO₂ inválida: se requiere objetivo exacto y motivo técnico';
  const vs = filas(l.vasijas);
  if (!vs.length) return 'la excepción requiere vasijas identificadas';
  for (const v of vs) {
    const objetivo = v.objetivo ?? l.objetivo;
    if (!casi(objetivo,t)) return 'una vasija no coincide con el objetivo excepcional';
    const actual = l.por_vasija ? v.so2_libre : l.so2_libre;
    const error = problemaTechoSo2(actual, objetivo, v.litros, v.mbk_g, v.ml,t,true);
    if (error) return error;
  }
  return '';
}
/** La excepción sólo existe en una OT de corrección, no en Configuración ni en correcciones manuales. */
export function validarTechoSo2(nuevo: Datos, anterior: Datos, autor: AutorExcepcion = {}): string[] {
  const errores: string[] = [];
  const nuevas = filas(nuevo.ordenes_correccion), antiguas = filas(anterior.ordenes_correccion);
  // Las autorizaciones previas provienen exclusivamente de la copia persistida, nunca del cliente.
  for (const vieja of antiguas) {
    if (!filas(vieja.lotes).some(tieneEx)) continue;
    const coincidencias = nuevas.filter(o=>clave(o.id)===clave(vieja.id));
    if (coincidencias.length !== 1) { errores.push(`OT ${clave(vieja.numero)}: no se puede borrar ni duplicar una excepción registrada.`); continue; }
    const o = coincidencias[0];
    if (vieja.estado === 'ejecutada' || vieja.estado === 'anulada') {
      if (firmaOrden(vieja)!==firmaOrden(o) || vieja.estado!==o.estado || canon(vieja.ejecucion)!==canon(o.ejecucion) || canon(vieja.anulada)!==canon(o.anulada)) errores.push(`OT ${clave(vieja.numero)}: excepción histórica inmutable.`);
    } else if ((firmaOrden(vieja)!==firmaOrden(o) || vieja.estado!==o.estado) && !puedeAutorizar(autor)) {
      // Se normalizan abajo los sellos faltantes de clientes anteriores, pero nunca cambios reales.
      if (vieja.estado!==o.estado || clave(vieja.numero)!==clave(o.numero) || canon(filas(vieja.lotes).map(limpio))!==canon(filas(o.lotes).map(limpio))) errores.push(`OT ${clave(vieja.numero)}: sólo un administrador puede modificar o ejecutar una excepción.`);
    }
  }
  for (const o of nuevas) {
    const vieja = antiguas.find(x=>clave(x.id)===clave(o.id));
    const lotes = filas(o.lotes);
    if (!lotes.some(tieneEx)) continue;
    if (!clave(o.id) || !clave(o.numero) || nuevas.filter(x=>clave(x.id)===clave(o.id)).length!==1 || (o.estado!=='anulada' && nuevas.filter(x=>clave(x.numero)===clave(o.numero)&&x.estado!=='anulada').length!==1) || new Set(lotes.map(l=>clave(l.lote))).size!==lotes.length) {
      errores.push(`OT ${clave(o.numero)}: identificación excepcional ambigua.`); continue;
    }
    for (const l of lotes.filter(tieneEx)) {
      const e = exDe(l), previo = filas(vieja?.lotes).find(x=>clave(x.lote)===clave(l.lote)), ep = exDe(previo||{});
      const mismo = !!previo && autorizado(ep) && limpio(previo)===limpio(l) && clave(vieja?.numero)===clave(o.numero);
      if (mismo) {
        l.excepcion_so2 = { ...ep }; // no confiar en autor/fecha enviados por el navegador
        if (o.estado==='ejecutada' && vieja?.estado==='pendiente') {
          if (!puedeAutorizar(autor)) errores.push(`OT ${clave(o.numero)}: ejecución excepcional reservada a administrador.`);
          const error=problemaExcepcion(l,ep,limite(nuevo,l.lote));
          if(error) errores.push(`OT ${clave(o.numero)}: ${error}.`);
        }
        continue;
      }
      if (!puedeAutorizar(autor) || o.estado!=='pendiente' || (vieja && vieja.estado!=='pendiente' && vieja.estado!=='borrador')) {
        errores.push(`OT ${clave(o.numero)}: la excepción nueva requiere administrador y orden pendiente.`); continue;
      }
      const error=problemaExcepcion(l,e,limite(nuevo,l.lote));
      if(error){ errores.push(`OT ${clave(o.numero)}, lote ${clave(l.lote)}: ${error}.`); continue; }
      l.excepcion_so2={objetivo:numero(e.objetivo),motivo:String(e.motivo).trim(),autorizada_por:autor.email,autorizada_en:autor.ahora};
    }
  }
  const usadas = new Set<string>();
  const prev = contador(filas(anterior.analisis).filter(a=>vigente(obj(a.correccion).anulada)), firmaCorreccion);
  for(const a of filas(nuevo.analisis)) {
    const c = obj(a.correccion);
    if (!Object.keys(c).length || !vigente(c.anulada) || consumir(prev,firmaCorreccion(a))) continue;
    const techo=limite(nuevo,a.lote), vs=filas(c.vasijas);
    if (Object.keys(obj(c.excepcion_so2)).length) {
      const e=obj(c.excepcion_so2), id=clave(e.orden_id), vieja=antiguas.find(o=>clave(o.id)===id), nueva=nuevas.find(o=>clave(o.id)===id);
      const l=filas(vieja?.lotes).find(x=>clave(x.lote)===clave(a.lote)), ln=filas(nueva?.lotes).find(x=>clave(x.lote)===clave(a.lote)), ep=exDe(l||{});
      const k=canon([id,clave(a.lote)]);
      let error='';
      if (!puedeAutorizar(autor) || !vieja || !nueva || vieja.estado!=='pendiente' || nueva.estado!=='ejecutada' || !l || !ln || !autorizado(ep) || limpio(l)!==limpio(ln) || clave(c.ot_n)!==clave(vieja.numero) || !casi(e.objetivo,ep.objetivo) || e.motivo!==ep.motivo || usadas.has(k)) error='excepción no autorizada para esta ejecución';
      else {
        const indices=e.indices, vasos=filas(l.vasijas);
        if (!Array.isArray(indices) || !indices.length || new Set(indices).size!==indices.length || indices.some(i=>!Number.isInteger(i)||i<0||i>=vasos.length) || (l.modo==='generica' && indices.length!==vasos.length)) error='selección de vasijas excepcional inválida';
        else {
          const seleccion=indices.map(i=>vasos[i]);
          if (seleccion.some(v=>numero(v.mbk_g)===null||numero(v.ml)===null||numero(v.litros)===null)) error='faltan datos válidos de la vasija';
          const suma=(campo:string)=>seleccion.reduce((total,v)=>total+(numero(v[campo])??0),0);
          if (!casi(c.so2_deseado,ep.objetivo) || !casi(c.so2_libre_actual,l.so2_libre) || !casi(c.mbk_a_agregar,suma('mbk_g')) || !casi(c.ml_exactos,suma('ml')) || !casi(c.litros,suma('litros'))) error='los valores de la corrección no coinciden con la OT autorizada';
          if (l.por_vasija) {
            const esperado=seleccion.map(v=>({num:v.num,so2_libre:v.so2_libre??null,objetivo:v.objetivo??null,mbk_g:v.mbk_g,ml:v.ml,litros:v.litros}));
            if(canon(vs)!==canon(esperado)) error='detalle de vasijas distinto de la excepción autorizada';
          } else if(vs.length) error='detalle de vasijas inesperado';
          error ||= problemaExcepcion(l,ep,techo);
        }
      }
      if(error) errores.push(`Lote ${clave(a.lote)}: ${error}.`);
      else { usadas.add(k); c.excepcion_so2={...ep,orden_id:id,indices:e.indices}; }
      continue;
    }
    const problemas = vs.length ? [problemaTechoSo2(c.so2_libre_actual,c.so2_deseado,null,null,null,techo), ...vs.map(v=>problemaTechoSo2(v.so2_libre,v.objetivo,v.litros,v.mbk_g,v.ml,techo))]
      : [problemaTechoSo2(c.so2_libre_actual,c.so2_deseado,c.litros,c.mbk_a_agregar,c.ml_exactos,techo)];
    const error=problemas.find(Boolean);if(error) errores.push(`Lote ${clave(a.lote)}: ${error}.`);
  }
  const ordenes = contador(filas(anterior.ordenes_correccion).filter(o=>o.estado!=='borrador' && o.estado!=='anulada'),firmaOrden);
  for (const o of filas(nuevo.ordenes_correccion)) {
    if (consumir(ordenes,firmaOrden(o)) || o.estado === 'anulada' || o.estado === 'borrador') continue;
    for (const l of filas(o.lotes)) {
      if (tieneEx(l)) continue; // validada y sellada arriba
      const techo=limite(nuevo,l.lote);
      const problemas=[problemaTechoSo2(l.so2_libre,l.objetivo,null,null,null,techo), ...filas(l.vasijas).map(v=>problemaTechoSo2(v.so2_libre??l.so2_libre,v.objetivo??l.objetivo,v.litros,v.mbk_g,v.ml,techo))];
      const error=problemas.find(Boolean);if(error) errores.push(`OT ${clave(o.numero)}, lote ${clave(l.lote)}: ${error}.`);
    }
  }
  return [...new Set(errores)];
}

/** Sellos persistidos que el cliente usa para actualizar su copia sin recargar. */
export function sellosExcepcionesSo2(datos: Datos) {
  return filas(datos.ordenes_correccion).flatMap(o => filas(o.lotes).filter(l => autorizado(exDe(l))).map(l => ({orden_id:clave(o.id), lote:clave(l.lote), excepcion:exDe(l)})));
}
