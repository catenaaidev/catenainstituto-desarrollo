/* ===== Lotes CIW — vista Planilla de la Orden de correccion de SO2 =====
 *
 * La otra cara de la misma orden: una fila por vasija con todo a la vista
 * (lote, año, tipo, vasija, litros, SO2 actual, deseado, diferencia y dosis),
 * como la planilla en Excel que se usaba en bodega. Pedido del usuario
 * 2026-11-11.
 *
 * Sale de las MISMAS filas que la hoja (_ocBuildRowsLocal, con las dosis a
 * mano puestas): lo que se ve aca es lo que se imprime, se guarda y se ejecuta.
 * Los controles por lote (incluirlo, Genérica / Por barril, objetivo) usan los
 * mismos data-* que la banda de la hoja, asi que los maneja el mismo codigo.
 *
 * Organico = el numero de lote en verde (esOrganico, la misma regla que la
 * pestaña Lotes); sin color = convencional.
 *
 * Puro (sin DOM ni nucleo.js) para poder testearlo. */
'use strict';

import { esT50, NOMBRE_T50 } from './envases.js';
import { anioDeLote } from './orden-correccion-papel.js';

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escA = v => esc(v).replace(/"/g, '&quot;');
const fmt = (v, dec) => (v != null && Number.isFinite(v)) ? Number(v).toFixed(dec) : '—';
const litrosTxt = v => (Number.isFinite(Number(v)) ? String(Math.round(Number(v) * 10) / 10) : '—');

/** Tipo y nombre de una vasija de la orden. Con numero de barril es barrica
 *  (o T50 si la capacidad es de 50 L); sin numero es la vasija grande del lote
 *  (tanque) o, si no se sabe cual, "Sin ubicar". */
export function tipoVasija(b){
  const x = b || {};
  if (x.num){
    const t50 = x.cap != null && esT50(Number(x.cap));
    return { tipo: t50 ? NOMBRE_T50 : 'Barrica', vasija: (t50 ? NOMBRE_T50 : 'Barrica') + ' ' + x.num };
  }
  return x.vasija ? { tipo: 'Tanque', vasija: String(x.vasija) } : { tipo: 'Sin ubicar', vasija: '—' };
}

/** Aplana las filas de _ocBuildRows (ya con aplicarManuales) en bloques por
 *  lote: {lote, objetivo, diferencia, vasijas:[{b, dosis, clave, manual}]}. */
export function bloquesPlanilla(filas){
  const out = [];
  let actual = null;
  for (const f of filas || []){
    if (f.tipo === 'lote'){
      actual = { lote: f.lote, objetivo: f.objetivo, diferencia: f.diferencia, fila: f, vasijas: [] };
      out.push(actual);
    } else if (f.tipo === 'barrica' && actual){
      actual.vasijas.push({ b: f.barrica || {}, dosis: f.dosis || {}, clave: f.clave, manual: !!f.manual });
    }
  }
  return out;
}

/** Cartel de aviso cuando el lote se analizo barril por barril: cuenta las
 *  vasijas con analisis PROPIO, la fecha del analisis y el rango de SO2 entre
 *  vasijas (si lo hay). Vacio si el lote no es por_vasija. */
export function cartelPorVasija(l){
  if (!l || !l.por_vasija) return '';
  const n = (l.barricas || []).filter(b => b.fuente === 'propio').length;
  const f = String(l.fecha_por_vasija || '').split('-');
  const fecha = f.length === 3 ? ' del ' + f[2] + '/' + f[1] : '';
  const rango = l.so2_min != null && l.so2_max != null
    ? ' · SO₂ entre ' + fmt(l.so2_min, 0) + ' y ' + fmt(l.so2_max, 0) + ' ppm' : '';
  return '⚠ Barril por barril: ' + n + (n === 1 ? ' vasija' : ' vasijas') + ' con análisis propio' + fecha +
    rango + ' · cada una lleva su dosis';
}

/* Celda del lote: el numero, en verde si es organico. */
const celdaLote = (lote, org) =>
  '<span class="ocp-lote' + (org ? ' ocp-org' : '') + '"' + (org ? ' title="Orgánico"' : '') + '>' + esc(lote) + '</span>';

export const COLUMNAS_PLANILLA = 11;

/** Columnas con embudo ▾ y orden (clic en el titulo). nivel 'lote' filtra
 *  lotes enteros (el valor es el mismo en todas sus vasijas); nivel 'vasija'
 *  filtra vasijas sueltas (Tipo = Barrica deja solo las barricas). Cant. es la
 *  cantidad de vasijas DEL LOTE: por fila siempre es 1. 'vdosis' toma el
 *  titulo de la unidad vigente. */
export const COLS_PLANILLA = [
  { k: 'lote',     label: 'Lote',     nivel: 'lote' },
  { k: 'anio',     label: 'Año',      nivel: 'lote' },
  { k: 'cant',     label: 'Cant.',    nivel: 'lote',   n: true, tit: 'Vasijas del lote' },
  { k: 'tipo',     label: 'Tipo',     nivel: 'vasija' },
  { k: 'vasija',   label: 'Vasija',   nivel: 'vasija' },
  { k: 'litros',   label: 'Litros',   nivel: 'vasija', n: true },
  { k: 'so2',      label: 'SO₂ act.', nivel: 'lote',   n: true },
  { k: 'objetivo', label: 'Deseado',  nivel: 'lote',   n: true },
  { k: 'dif',      label: 'Dif.',     nivel: 'lote',   n: true },
  { k: 'vdosis',   label: null,       nivel: 'vasija', n: true },
];

/** Valor de una columna de nivel vasija, tal como se ve en la celda (asi el
 *  filtro tilda lo que se lee). f = fila 'barrica' de _ocBuildRows. */
export function valorVasija(k, f, u){
  const b = (f && f.barrica) || {};
  switch (k){
    case 'tipo':   return tipoVasija(b).tipo;
    case 'vasija': return tipoVasija(b).vasija;
    case 'litros': return litrosTxt(b.litros_usados);
    case 'vdosis': return fmt(u.de((f && f.dosis) || {}), u.dec);
    default: return '';
  }
}

/** Las filas sin las vasijas que no pasan `pasa`. Los totales del lote se
 *  rehacen con las que quedan (igual que aplicarManuales: el total es la suma)
 *  y un lote sin vasijas se va entero. No toca la entrada. */
export function filtrarVasijas(filas, pasa){
  const out = [];
  let lote = null;
  for (const f of filas || []){
    if (f.tipo === 'lote'){
      lote = { ...f, mbk_total_g: 0, ml_total: 0, _n: 0 };
      out.push(lote);
      continue;
    }
    if (f.tipo !== 'barrica' || !lote){ out.push(f); continue; }
    if (!pasa(f)) continue;
    lote.mbk_total_g += (f.dosis && f.dosis.mbk_g) || 0;
    lote.ml_total += (f.dosis && f.dosis.ml_solucion) || 0;
    lote._n++;
    out.push(f);
  }
  return out.filter(f => f.tipo !== 'lote' || f._n > 0).map(f => {
    if (f.tipo !== 'lote') return f;
    const { _n, ...resto } = f;
    return resto;
  });
}

/* Mismo criterio que cmpValores de tabla.js: numeros como numeros. */
function cmpTxt(a, b){
  const esNum = v => /^-?[\d.,]+$/.test(v) && !isNaN(parseFloat(v.replace(',', '.')));
  if (esNum(a) && esNum(b)) return parseFloat(a.replace(',', '.')) - parseFloat(b.replace(',', '.'));
  return String(a).localeCompare(String(b), 'es');
}

/** Con una columna de nivel vasija elegida, las vasijas de cada lote salen
 *  en ese orden (los lotes ya vienen ordenados por ordenarLotesOc). Estable;
 *  sin orden de vasija devuelve las filas tal cual. */
export function ordenarVasijas(filas, st, u){
  const col = st && st.key && COLS_PLANILLA.find(c => c.k === st.key);
  if (!col || col.nivel !== 'vasija') return filas || [];
  const out = [];
  let bloque = [];
  const vaciar = () => {
    bloque.sort((a, b) => st.dir * cmpTxt(valorVasija(col.k, a, u), valorVasija(col.k, b, u)));
    out.push(...bloque);
    bloque = [];
  };
  for (const f of filas || []){
    if (f.tipo === 'barrica') bloque.push(f);
    else { vaciar(); out.push(f); }
  }
  vaciar();
  return out;
}

/** HTML de la planilla. opts:
 *   filas      - las de _ocBuildRowsLocal
 *   fuera      - lotes destildados (objetos lote del servidor), en el orden de la pantalla
 *   u          - config de la unidad ({col, suf, dec, de(dosis)})
 *   modoDe     - lote -> 'generica' | 'barril'
 *   organico   - lote (numero) -> bool
 *   avisosDe   - lote -> [texto]
 *   motivoFuera- lote -> texto corto ("excluido", "en objetivo"…)
 *   cab        - {nro, fecha} del encabezado de la orden
 *   encabezado - col -> HTML del titulo (orden y embudo los pone la vista) */
export function pintarPlanilla(opts){
  const o = opts || {};
  const u = o.u;
  const gramos = u.suf === 'g';
  const bloques = bloquesPlanilla(o.filas);
  const organico = o.organico || (() => false);
  const cab = o.cab || {};

  let html = '<div class="ocp-cab">' +
    '<label>N° de orden <input class="txt" data-campo="nro" value="' + escA(cab.nro || '') + '"></label>' +
    '<label>Fecha <input class="txt" type="date" data-campo="fecha" value="' + escA(cab.fecha || '') + '"></label>' +
    '<span class="ocp-ley"><span class="ocp-lote ocp-org">Lote</span> orgánico · sin color = convencional</span>' +
    '</div>';

  html += '<table class="ocp-tabla"><colgroup>' +
    '<col style="width:86px"><col style="width:66px"><col style="width:74px"><col style="width:84px">' +
    '<col style="width:130px"><col style="width:82px"><col style="width:96px"><col style="width:96px">' +
    '<col style="width:70px"><col style="width:110px"><col>' +
    '</colgroup><thead><tr>' +
    COLS_PLANILLA.map(c => {
      const col = c.label ? c : { ...c, label: u.col };
      return '<th' + (c.n ? ' class="n"' : '') + (c.tit ? ' title="' + escA(c.tit) + '"' : '') + '>' +
        (o.encabezado ? o.encabezado(col) : esc(col.label)) + '</th>';
    }).join('') + '<th></th>' +
    '</tr></thead><tbody>';

  if (!bloques.length){
    html += '<tr><td colspan="' + COLUMNAS_PLANILLA + '" class="ocp-vacio">No hay lotes a corregir para los criterios elegidos.</td></tr>';
  }

  let totLitros = 0, totDosis = 0, nVasijas = 0;
  bloques.forEach((bl, i) => {
    const l = bl.lote;
    const L = escA(l.lote);
    const org = organico(l.lote);
    const modo = o.modoDe ? o.modoDe(l) : 'generica';
    const opt = (v, t) => '<option value="' + v + '"' + (modo === v ? ' selected' : '') + '>' + t + '</option>';
    const modoTitulo = l.por_vasija
      ? 'Este lote se analizó barril por barril: cada vasija lleva su dosis, no se puede imprimir genérico.'
      : 'Cómo sale en el papel. Genérica: un renglón por tipo de vasija. Por barril: un renglón por barril. Vale también para la ejecución.';
    const totalLote = bl.vasijas.reduce((s, v) => s + u.de(v.dosis), 0);
    const avisos = o.avisosDe ? o.avisosDe(l) : [];
    const alt = i % 2 ? ' ocp-alt' : '';

    /* Cabecera del lote: los controles de la banda de la hoja, en una linea. */
    html += '<tr class="ocp-lotecab' + alt + '"><td colspan="' + COLUMNAS_PLANILLA + '"><div class="ocp-l1">' +
      '<label class="ocp-incl"><input type="checkbox" checked data-oc-lote="' + L + '" title="Incluir este lote en la orden"> ' +
        celdaLote(l.lote, org) + '</label>' +
      '<span class="ocp-var">' + esc(l.variedad || '') + '</span>' +
      '<span>pH ' + fmt(l.ph, 2) + '</span>' +
      '<label class="ocp-obj">Objetivo <input type="text" inputmode="decimal" data-oc-obj="' + L + '" value="' + escA(fmt(bl.objetivo, 1)) + '" title="SO₂ libre deseado (mg/L) de todo el lote. Editá para recalcular la dosis."></label>' +
      '<select class="oc-modo" data-oc-modo="' + L + '"' + (l.por_vasija ? ' disabled' : '') + ' title="' + escA(modoTitulo) + '">' +
        opt('generica', 'Papel: genérica') + opt('barril', 'Papel: por barril') + '</select>' +
      '<span class="ocp-tot">' + fmt(totalLote, gramos ? 2 : 0) + ' ' + esc(u.suf || '') + '</span>' +
      '</div>' +
      avisos.map(a => '<div class="oc-aviso">' + esc(a) + '</div>').join('') +
      '</td></tr>';

    /* Por_vasija: el objetivo pisado del lote (si lo hay) manda para todas las
     * vasijas; sin pisar, cada vasija usa el suyo. */
    const objetivoPisado = !!(l.por_vasija && bl.fila && bl.fila.pisado);
    for (const v of bl.vasijas){
      const tv = tipoVasija(v.b);
      const dosis = u.de(v.dosis);
      const litros = Number(v.b.litros_usados) || 0;
      totLitros += litros; totDosis += (dosis || 0); nVasijas++;
      /* Vasija sin analisis propio: nada del lote en su renglon (nunca se
       * adivina), las tres celdas en — y rojas. */
      const sinAnal = !!l.por_vasija && v.b.so2_libre == null;
      const so2V = l.por_vasija ? (v.b.so2_libre ?? null) : l.so2_libre;
      const objV = l.por_vasija ? (sinAnal ? null : (objetivoPisado ? bl.objetivo : (v.b.objetivo ?? null))) : bl.objetivo;
      const difV = l.por_vasija ? ((so2V != null && objV != null) ? (objV - so2V) : null) : bl.diferencia;
      const enObjetivo = !!l.por_vasija && difV != null && difV <= 0;
      const sinDosis = dosis == null;
      const cls = sinAnal ? 'n ocp-sin' : 'n';
      /* Con la dosis escrita a mano el aviso ya no hace falta. */
      const avisoVasija = (l.por_vasija && v.b.aviso && !v.manual) ? v.b.aviso : '';
      html += '<tr class="ocp-v' + alt + '">' +
        '<td>' + celdaLote(l.lote, org) + '</td>' +
        '<td>' + esc(anioDeLote(l.lote)) + '</td>' +
        '<td class="n">1</td>' +
        '<td>' + esc(tv.tipo) + '</td>' +
        '<td>' + esc(tv.vasija) + '</td>' +
        '<td class="n">' + esc(litrosTxt(v.b.litros_usados)) + '</td>' +
        '<td class="' + cls + '">' + fmt(so2V, 1) + '</td>' +
        '<td class="' + cls + '">' + fmt(objV, 1) + '</td>' +
        (enObjetivo ? '<td class="n ocp-motivo" style="color:var(--muted)">en objetivo</td>' : '<td class="' + cls + '">' + fmt(difV, 1) + '</td>') +
        '<td class="n' + (v.manual ? ' oh-manual' : '') + (sinDosis ? ' ocp-sin' : '') + '">' +
          '<input type="text" inputmode="decimal" class="ocp-dosis" data-oc-vdosis="' + L + '" data-oc-clave="' + escA(v.clave) + '"' +
          ' value="' + escA(fmt(dosis, u.dec)) + '" title="Dosis de esta vasija. Lo que escribas se guarda con la orden.">' +
          (v.manual ? '<button type="button" class="oh-reset" data-oc-vdosis-reset="' + L + '" data-oc-clave="' + escA(v.clave) + '" title="Volver a la dosis calculada">↺</button>' : '') +
        '</td><td>' + (avisoVasija ? '<span class="oc-aviso">' + esc(avisoVasija) + '</span>' : '') + '</td></tr>';
    }
  });

  if (bloques.length){
    html += '<tr class="ocp-total"><td colspan="5">Total a corregir · ' + bloques.length + ' lotes · ' + nVasijas + ' vasijas</td>' +
      '<td class="n">' + esc(litrosTxt(totLitros)) + '</td><td colspan="3"></td>' +
      '<td class="n">' + fmt(totDosis, gramos ? 2 : 0) + ' ' + esc(u.suf || '') + '</td><td></td></tr>';
  }

  const fuera = o.fuera || [];
  if (fuera.length){
    html += '<tr class="ocp-fuera-tit"><td colspan="' + COLUMNAS_PLANILLA + '">Fuera de esta orden (' + fuera.length + ') · tildá un lote para sumarlo</td></tr>';
    for (const l of fuera){
      const vs = l.barricas || [];
      const litros = vs.reduce((s, b) => s + (Number(b.litros_usados) || 0), 0);
      const tipos = [...new Set(vs.map(b => tipoVasija(b).tipo))];
      html += '<tr class="ocp-fuera">' +
        '<td><label class="ocp-incl"><input type="checkbox" data-oc-lote="' + escA(l.lote) + '" title="Sumar este lote a la orden"> ' +
          celdaLote(l.lote, organico(l.lote)) + '</label></td>' +
        '<td>' + esc(anioDeLote(l.lote)) + '</td>' +
        '<td class="n">' + vs.length + '</td>' +
        '<td>' + esc(tipos.join(', ')) + '</td>' +
        '<td>' + esc(l.variedad || '') + '</td>' +
        '<td class="n">' + esc(litrosTxt(litros)) + '</td>' +
        '<td class="n">' + fmt(l.so2_libre, 1) + '</td>' +
        '<td class="n">' + fmt(l.objetivo_libre, 1) + '</td>' +
        '<td colspan="3" class="ocp-motivo">' + esc(o.motivoFuera ? o.motivoFuera(l) : '') + '</td></tr>';
    }
  }

  return html + '</tbody></table>';
}
