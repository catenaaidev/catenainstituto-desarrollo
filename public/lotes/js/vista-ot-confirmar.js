/* ===== Lotes CIW — confirmar una OT en dos pasos (spec 2026-10-01) =====
 *
 * Paso 1, "Lo que pasó": por lote, el tanque destino y sus cm (o litros), o las
 * barricas llenas y las mermas. Paso 2, "Así queda cada lote": la propuesta
 * antes -> despues de propuesta-ot.js, comparada con el Mapa de Barriles, con
 * un check por lote. "Aplicar y guardar" confirma la OT (como siempre), aplica
 * los lotes con check y guarda. El Mapa solo se lee. */
'use strict';

import { $, esc, escA, num, DATOS, markDirty, guardar, usuarioActual, invalidarDashMap,
         mostrarOverlay, cerrarOverlay } from './nucleo.js';
import { confirmarOT } from './ot-armado.js';
import { barricasEstimadas } from './ot-plantillas.js';
import { proponer, recalcularItem, compararConMapa, aplicarPropuesta, tipoDestino, ENV_KEYS }
  from './propuesta-ot.js';
import { buscarVasija } from './vasijas-padron.js';
import { litrosPorCm } from './cubicacion.js';
import { resumenEnvases } from './envases.js';

const hoyISO = () => new Date().toISOString().slice(0, 10);
const fmtL = v => v == null ? '—' : Number(v).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' L';

async function leerMapa(lotes, nums){
  const qs = [];
  if (lotes.length) qs.push('lotes=' + encodeURIComponent(lotes.join(',')));
  if (nums.length) qs.push('nums=' + encodeURIComponent(nums.join(',')));
  try {
    const r = await fetch(API + '/barriles?' + qs.join('&'));
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

export function abrirConfirmarOT(ot, onListo){
  const st = { ot, onListo, tipo: tipoDestino(ot.plantilla), corte: !!(ot.lote_corte && ot.lote_corte.lote),
               entradas: null, mapa: null, propuesta: null, paso: 1,
               operario: '', pasos: false, comentario: '', aplicada: false, faltan: [] };
  st.entradas = {
    por_lote: ot.lotes.map(l => st.tipo === 'tanque'
      ? { vasija: l.destino_real || ot.destino || '', cm: '', litros_manual: l.litros_reales ?? '' }
      : { barricas_llenas: l.barricas_previstas ?? barricasEstimadas(l.litros_previstos) ?? '', mermas: [] }),
    corte: st.corte ? { vasija: ot.destino || '', cm: '', litros_manual: '' } : null,
  };
  _paso1(st);
  // El Mapa se lee de entrada para ofrecer barriles en las mermas. Solo se
  // refrescan las listas: repintar el paso 1 le sacaria el foco a quien tipea,
  // y si ya paso al 2 lo devolveria para atras.
  leerMapa(ot.lotes.map(l => l.lote), []).then(m => {
    if (st.mapa) return;   // el paso 2 ya leyo uno mas nuevo
    st.mapa = m;
    if (st.paso !== 1) return;
    // M4: cerrarOverlay() solo saca la clase 'show' (#otcRaiz sigue en el DOM):
    // si cancelaron/cerraron mientras se leia el Mapa, no hay que tocar nada.
    if (!$('overlay').classList.contains('show') || !$('otcRaiz')) return;
    ot.lotes.forEach((_, i) => { const dl = $('otcBarr' + i); if (dl) dl.outerHTML = _dlBarriles(st, i); });
  });
}

/* ---------- paso 1 ---------- */

function _dlVasijas(){
  return '<datalist id="otcVasijas">' + (DATOS().vasijas || []).filter(v => v.activa !== false)
    .map(v => `<option value="T ${escA(v.num)}">${esc(v.tipo)} · ${esc(v.cap_real)} L${v.tabla ? '' : ' · sin tabla'}</option>`)
    .join('') + '</datalist>';
}

function _dlBarriles(st, i){
  const ol = st.ot.lotes[i];
  const enFoto = new Set((ol.barriles || []).map(b => String(b.num)));
  const delMapa = ((st.mapa && st.mapa.por_lote) || {})[ol.lote] || [];
  return `<datalist id="otcBarr${i}">` + delMapa
    .filter(b => (b.estado === 'LLENO' || b.estado === 'MERMO') && !enFoto.has(String(b.num)))
    .map(b => `<option value="${escA(b.num)}">${esc(b.estado)} · ${esc(b.cap ?? '')} L</option>`).join('') + '</datalist>';
}

function _bloqueTanque(id, e){
  return `<input class="txt otc-vas" list="otcVasijas" data-id="${id}" data-f="vasija" value="${escA(e.vasija)}" placeholder="T 201">
    <input class="txt otc-num" type="number" step="any" min="0" data-id="${id}" data-f="cm" value="${escA(e.cm)}" placeholder="cm">
    <input class="txt otc-num" type="number" step="any" min="0" data-id="${id}" data-f="litros_manual" value="${escA(e.litros_manual)}" placeholder="litros">
    <span class="otc-calc" id="otcCalc${id}"></span>`;
}

function _bloqueBarricas(st, i, e){
  const mermas = e.mermas.map((m, j) => `<div class="otc-merma">
      <input class="txt" list="otcBarr${i}" data-i="${i}" data-j="${j}" data-f="barril" value="${escA(m.barril)}" placeholder="N° barril">
      <input class="txt otc-num" type="number" step="any" min="0" data-i="${i}" data-j="${j}" data-f="litros" value="${escA(m.litros)}" placeholder="litros">
      <button class="btn" data-quitar="${i}:${j}" title="Quitar">✕</button></div>`).join('');
  return `<label>Barricas llenas <input class="txt otc-num" type="number" min="0" step="1" data-i="${i}" data-f="barricas_llenas" value="${escA(e.barricas_llenas)}"></label>
    <div class="otc-mermas">${mermas}<button class="btn" data-agregar="${i}">+ Barrica merma</button></div>${_dlBarriles(st, i)}`;
}

function _paso1(st){
  // Critico: una vez aplicada la propuesta (st.aplicada), la OT ya quedo
  // confirmada en memoria; "Volver" queda deshabilitado para siempre (ver
  // _aplicar) y esto es el freno defensivo si algo lo llamara igual.
  if (st.aplicada) return;
  const { ot } = st;
  const filas = ot.lotes.map((l, i) => {
    const e = st.entradas.por_lote[i];
    const destino = st.corte ? '<span style="color:var(--muted)">va al tanque del corte</span>'
      : st.tipo === 'tanque' ? _bloqueTanque(String(i), e) : _bloqueBarricas(st, i, e);
    return `<tr><td><b>${esc(l.lote)}</b><br><span style="color:var(--muted)">${esc(l.id_texto)}</span></td>
      <td>${esc(fmtL(l.litros_previstos))}</td><td class="otc-dest">${destino}</td></tr>`;
  }).join('');
  const corte = st.corte ? `<div class="otc-corte"><b>Tanque del corte · lote ${esc(ot.lote_corte.lote)}</b>
      ${_bloqueTanque('c', st.entradas.corte)}</div>` : '';

  st.paso = 1;
  mostrarOverlay(`<div id="otcRaiz">
<h3 style="margin:0 0 4px">✓ Confirmar ${esc(ot.ot)} · 1 de 2: lo que pasó</h3>
<p style="margin:0 0 12px;color:var(--muted);font-size:13px">${st.tipo === 'tanque'
    ? 'Elegí el tanque y cargá los <b>cm de merma</b> medidos; si el tanque no tiene tabla, cargá los litros.'
    : 'Cargá cuántas barricas quedaron llenas y agregá las que quedaron mermas con sus litros.'}</p>
${_dlVasijas()}${corte}
<div class="otc-scroll"><table class="otc-tabla"><thead><tr><th>Lote</th><th>Previstos</th><th>Destino</th></tr></thead>
<tbody>${filas}</tbody></table></div>
<div style="display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center;margin-top:12px">
  <label>Operario</label><input class="txt" id="otcOperario" value="${escA(st.operario)}" placeholder="Quién lo hizo…">
  <label>Pasos</label><label><input type="checkbox" id="otcPasos"${st.pasos ? ' checked' : ''}> Todos los pasos de la hoja están cumplidos</label>
  <label>Comentario</label><input class="txt" id="otcComentario" value="${escA(st.comentario)}">
</div>
<div class="msg err" id="otcErr" style="display:none;margin-top:10px"></div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="otcCancelar">Cancelar</button>
  <button class="btn primary" id="otcSig">Siguiente →</button>
</div></div>`);

  // Los listeners van en #otcRaiz y no en #overlayBox: el box sobrevive entre
  // overlays y cada repintado le sumaria otro listener.
  const box = $('otcRaiz');
  box.addEventListener('input', ev => _leerCampo(st, ev.target));
  box.addEventListener('click', ev => {
    const ag = ev.target.closest('[data-agregar]'), qu = ev.target.closest('[data-quitar]');
    if (ag){ _guardarCabecera(st); st.entradas.por_lote[+ag.dataset.agregar].mermas.push({ barril: '', litros: '' }); _paso1(st); }
    if (qu){ _guardarCabecera(st); const [i, j] = qu.dataset.quitar.split(':').map(Number);
      st.entradas.por_lote[i].mermas.splice(j, 1); _paso1(st); }
  });
  $('otcCancelar').addEventListener('click', () => cerrarOverlay());
  $('otcSig').addEventListener('click', () => _irAPaso2(st));
  ot.lotes.forEach((_, i) => _pintarCalc(st, String(i)));
  if (st.corte) _pintarCalc(st, 'c');
}

function _entradaDe(st, id){ return id === 'c' ? st.entradas.corte : st.entradas.por_lote[+id]; }

function _leerCampo(st, el){
  const f = el.dataset.f;
  if (!f) return;
  if (el.dataset.id != null){ _entradaDe(st, el.dataset.id)[f] = el.value; _pintarCalc(st, el.dataset.id); return; }
  const e = st.entradas.por_lote[+el.dataset.i];
  if (el.dataset.j != null) e.mermas[+el.dataset.j][f] = el.value; else e[f] = el.value;
}

/* Litros en vivo al lado del tanque: "4.075 L de 4.200". */
function _pintarCalc(st, id){
  const out = $('otcCalc' + id);
  if (!out) return;
  const e = _entradaDe(st, id);
  const v = buscarVasija(DATOS().vasijas, e.vasija);
  if (!v){ out.textContent = e.vasija ? 'no está en el padrón: cargá los litros' : ''; return; }
  if (!v.tabla){ out.textContent = `${v.tipo} · sin tabla: cargá los litros`; return; }
  if (e.cm === '' || e.cm == null){ out.textContent = `${v.tipo} · ${v.cap_real} L: cargá los cm`; return; }
  const r = litrosPorCm(v, e.cm);
  out.textContent = r.error === 'fuera-de-rango' ? `fuera de la tabla (máx. ${r.max} cm)`
    : r.error ? 'cm inválido' : `${fmtL(r.litros)} de ${fmtL(v.cap_real)}`;
}

function _guardarCabecera(st){
  if (!$('otcOperario')) return;
  st.operario = $('otcOperario').value.trim();
  st.pasos = $('otcPasos').checked;
  st.comentario = $('otcComentario').value;
}

async function _irAPaso2(st){
  _guardarCabecera(st);
  const err = m => { $('otcErr').textContent = m; $('otcErr').style.display = ''; };
  if (!st.operario) return err('Falta el operario: la confirmación registra quién hizo el trabajo.');
  // M1: sin tanque destino (y sin ot.destino de respaldo) el lote/movimiento
  // queda sin vasija actual. Se valida antes de tocar la red.
  if (st.tipo === 'tanque'){
    if (st.corte){
      if (!String(st.entradas.corte.vasija || '').trim()) return err('Falta el tanque destino del corte.');
    } else {
      const i = st.entradas.por_lote.findIndex(e => !String(e.vasija || '').trim());
      if (i !== -1) return err('Falta el tanque destino del lote ' + st.ot.lotes[i].lote + '.');
    }
  }
  $('otcSig').disabled = true;

  const lotes = st.ot.lotes.map(l => l.lote).concat(st.corte ? [st.ot.lote_corte.lote] : []);
  const nums = st.entradas.por_lote.flatMap(e => (e.mermas || []).map(m => String(m.barril || '').trim())).filter(Boolean);
  st.mapa = await leerMapa(lotes, nums);
  // M4: cerrarOverlay() solo saca la clase 'show' (#otcRaiz sigue en el DOM):
  // si cancelaron (Cancelar/Escape/click afuera) mientras se leia el Mapa, no
  // hay que resucitar el paso 2.
  if (!$('overlay').classList.contains('show') || !$('otcRaiz')) return;

  // Una barrica merma tiene que existir en el Mapa (mismo criterio que el escáner).
  if (nums.length){
    if (!st.mapa || !st.mapa.por_num){ $('otcSig').disabled = false; return err('No se pudo consultar el Mapa para validar las barricas mermas. Probá de nuevo.'); }
    const faltan = nums.filter(n => !st.mapa.por_num[n]);
    if (faltan.length){ $('otcSig').disabled = false; return err('Estos barriles no existen en el Mapa: ' + faltan.join(', ')); }
    for (const e of st.entradas.por_lote) for (const m of e.mermas || []){
      const b = st.mapa.por_num[String(m.barril).trim()];
      if (b) m.cap = b.cap;
    }
  }

  try {
    st.propuesta = proponer({ ot: st.ot, lotes: DATOS().lotes, mermas: DATOS().mermas, padron: DATOS().vasijas,
      entradas: st.entradas, hoy: hoyISO() });
  } catch (e) {
    console.error(e);
    $('otcSig').disabled = false;
    return err('No se pudo armar la propuesta: ' + e.message);
  }
  _paso2(st);
}

/* ---------- paso 2 ---------- */

const ETIQ = { cap500: '500', cap225: '225', cap200: '200', cap50: '50', vasija_grande: 'Tanque L' };

function _paso2(st){
  const porLote = (st.mapa && st.mapa.por_lote) || null;
  // Un corte es todo-o-nada: aplicar los origenes sin el lote del corte (o al
  // reves) hace contar el vino dos veces. Si algun item del corte esta
  // bloqueado, se frenan los checks de toda la OT (el caso contrario ya lo
  // frena aplicarPropuesta).
  const corteBloqueado = st.corte && st.propuesta.items.some(it => it.bloqueado);
  const avisoCorte = corteBloqueado
    ? '<div class="msg err">Hay un lote bloqueado: el corte no se puede aplicar hasta corregirlo.</div>' : '';
  // I1: un corte se aplica entero o nada. Si CUALQUIER lote del corte es
  // "revisar" (sin foto de barriles), arrancar con unos marcados y otros no
  // terminaria aplicando solo una parte: todos arrancan sin marcar.
  const corteRevisar = st.corte && st.propuesta.items.some(it => it.revisar);

  const filas = st.propuesta.items.map((it, k) => {
    const ol = it.indice == null ? null : st.ot.lotes[it.indice];
    const avisos = it.avisos.map(a => `<div class="otc-aviso">⚠ ${esc(a)}</div>`).join('');
    if (!it.despues) return `<tr><td><b>${esc(it.lote)}</b></td><td colspan="5">${avisos}</td><td></td></tr>`;
    const cmp = compararConMapa(it, ol, porLote ? (porLote[it.lote] ?? null) : null, st.ot.fecha || '');
    const envs = ENV_KEYS.map(kk => `<label class="otc-env">${ETIQ[kk]}
        <input class="txt otc-num" type="number" step="any" min="0" data-k="${k}" data-env="${kk}" value="${escA(it.despues[kk] || '')}"></label>`).join('');
    // Bloqueado: disabled + sin check. Revisar (lote sin foto de barriles, no
    // bloqueado): habilitado pero SIN check por defecto, para que alguien lo
    // mire antes de aplicarlo. El resto: con check. Un corte con algun origen
    // bloqueado frena (disabled) todos los checks de la OT, y un corte con
    // algun origen revisar arranca con TODOS sin marcar (I1).
    const disabled = it.bloqueado || corteBloqueado;
    const checked = !disabled && !it.revisar && !corteRevisar;
    const claseFila = it.bloqueado ? ' class="otc-bloq"' : (it.revisar ? ' class="otc-revisar"' : '');
    return `<tr${claseFila}>
      <td><b>${esc(it.lote)}</b>${it.indice == null ? '<br><span style="color:var(--muted)">lote del corte</span>' : ''}</td>
      <td>${esc(resumenEnvases(it.antes) || '—')}<br>${esc(fmtL(it.antes.litros_actuales))}<br><span style="color:var(--muted)">${esc(it.antes.vasija_actual)}</span></td>
      <td><div class="otc-envs">${envs}</div>
          <input class="txt" data-k="${k}" data-env="vasija_actual" value="${escA(it.despues.vasija_actual)}" placeholder="Vasija actual"></td>
      <td><b id="otcLitros${k}">${esc(fmtL(it.litros_despues))}</b></td>
      <td>${esc(fmtL(it.merma_litros))}</td>
      <td class="otc-mapa otc-${cmp.estado}">${esc(cmp.texto)}${avisos}</td>
      <td><input type="checkbox" class="otc-check" data-k="${k}"${disabled ? ' disabled' : ''}${checked ? ' checked' : ''}></td></tr>`;
  }).join('');

  st.paso = 2;
  mostrarOverlay(`<div id="otcRaiz">
<h3 style="margin:0 0 4px">✓ Confirmar ${esc(st.ot.ot)} · 2 de 2: así queda cada lote</h3>
<p style="margin:0 0 12px;color:var(--muted);font-size:13px">Revisá cada lote y corregí lo que haga falta. Solo se aplican los lotes con ☑;
los demás quedan como estaban (la OT se confirma igual).</p>
${avisoCorte}
<div class="otc-scroll"><table class="otc-tabla"><thead><tr><th>Lote</th><th>Antes</th><th>Después</th><th>Litros</th><th>Merma</th><th>Mapa</th><th>Aplicar</th></tr></thead>
<tbody>${filas}</tbody></table></div>
<div class="msg err" id="otcErr2" style="display:none;margin-top:10px"></div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="otcVolver">← Volver</button>
  <button class="btn primary" id="otcAplicar">Aplicar y guardar</button>
</div></div>`);

  const box = $('otcRaiz');
  box.addEventListener('input', ev => {
    const el = ev.target; if (el.dataset.env == null) return;
    const it = st.propuesta.items[+el.dataset.k];
    it.despues[el.dataset.env] = el.dataset.env === 'vasija_actual' ? el.value : (num(el.value) ?? 0);
    recalcularItem(it, DATOS().mermas);
    $('otcLitros' + el.dataset.k).textContent = fmtL(it.litros_despues);
  });
  // Un corte se aplica entero o nada: tildar/destildar cualquier check mueve
  // todos los demas checks habilitados de la OT al mismo valor.
  if (st.corte){
    box.addEventListener('change', ev => {
      const el = ev.target;
      if (!el.classList.contains('otc-check')) return;
      const v = el.checked;
      box.querySelectorAll('.otc-check:not(:disabled)').forEach(c => { c.checked = v; });
    });
  }
  $('otcVolver').addEventListener('click', () => _paso1(st));
  $('otcAplicar').addEventListener('click', () => _aplicar(st));
}

/* M3/Critico: si guardar() falla (sin llegar a un 409, que ya muestra su
 * propio overlay), el cambio ya esta aplicado en memoria y marcado dirty: un
 * segundo clic en "Aplicar y guardar" NO debe volver a aplicar la propuesta
 * (duplicaria mermas nuevas, etc.), solo reintentar el guardado. st.aplicada
 * distingue los dos casos. Y una vez aplicada, "Volver" queda deshabilitado
 * PARA SIEMPRE: la OT ya esta confirmada en memoria, volver al paso 1 y
 * re-confirmar armaria una propuesta nueva que aplicarPropuesta ignoraria
 * (su freno de idempotencia), dejando el reintento silenciosamente sin
 * efecto. Solo "Aplicar y guardar" se reactiva, renombrado, para reintentar
 * el guardado. */
async function _aplicar(st){
  $('otcAplicar').disabled = true; $('otcVolver').disabled = true;
  const err2 = m => { const el = $('otcErr2'); if (el){ el.textContent = m; el.style.display = ''; } };
  const reactivar = () => { $('otcAplicar').disabled = false; $('otcVolver').disabled = false; };

  if (!st.aplicada){
    const habilitados = [...document.querySelectorAll('#otcRaiz .otc-check:not(:disabled)')];
    const marcados = habilitados.filter(c => c.checked);
    // I1: un corte no puede quedar aplicado a medias (el vino se contaria dos
    // veces entre origen y destino). O se aplican todos los habilitados o
    // ninguno.
    if (st.corte && habilitados.length && marcados.length !== 0 && marcados.length !== habilitados.length){
      reactivar();
      return err2('En un corte se aplican todos los lotes o ninguno.');
    }

    const aplicar = new Set(marcados.map(c => st.propuesta.items[+c.dataset.k].lote));

    // M2: confirmar a sabiendas si algun lote que se va a aplicar quedo sin
    // litros medidos (no se toca: ver aplicarPropuesta/recalcularItem).
    const corteItem = st.corte ? st.propuesta.items.find(x => x.indice == null) : null;
    const sinLitros = st.corte
      ? (corteItem && corteItem.litros_llegados == null)
      : st.propuesta.items.some(it => it.indice != null && it.litros_llegados == null);
    if (sinLitros && !confirm('Hay lotes sin litros medidos: la OT se confirma igual y esos lotes no se tocan. ¿Seguir?')){
      reactivar();
      return;
    }

    const porIndice = new Map(st.propuesta.items.filter(x => x.indice != null).map(x => [x.indice, x]));
    const hoy = hoyISO(), usuario = usuarioActual();
    const por_lote = st.ot.lotes.map((l, i) => {
      const it = porIndice.get(i);
      const e = st.entradas.por_lote[i];
      // I2: en un corte, proponer() deja litros_llegados en null para los
      // origenes (solo vacian, no reciben nada); lo que de verdad llego a
      // alguna parte es litros_origen menos la merma repartida.
      const litros_reales = st.corte && it
        ? (it.litros_origen != null && it.merma_litros != null
            ? Math.round((it.litros_origen - it.merma_litros) * 10) / 10 : it.litros_origen)
        : (it ? it.litros_llegados : null);
      return {
        destino_real: st.corte ? (st.entradas.corte.vasija || st.ot.destino) : st.tipo === 'tanque' ? e.vasija : (it && it.despues ? it.despues.vasija_actual : ''),
        litros_reales,
        merma_litros: it ? it.merma_litros : null,
      };
    });
    st.faltan = confirmarOT(st.ot, DATOS().movimientos || [], {
      operario: st.operario, pasos_cumplidos: st.pasos, comentario: st.comentario, por_lote,
    }, usuario, hoy);
    aplicarPropuesta(DATOS(), st.ot, st.propuesta, aplicar, usuario, hoy);
    markDirty();
    invalidarDashMap();
    st.onListo();
    st.aplicada = true;
  }

  const ok = await guardar();
  if (!ok){
    // guardar() ya mostro su propio error o el overlay de conflicto (409); si
    // lo segundo, #otcRaiz ya no esta: no hay botones que reactivar. Si sigue
    // ahi, la OT ya quedo aplicada en memoria: "Volver" queda deshabilitado
    // para siempre y solo se reactiva (renombrado) "Aplicar y guardar".
    if ($('otcRaiz')){
      $('otcAplicar').disabled = false;
      $('otcAplicar').textContent = 'Reintentar guardar';
      err2('No se guardó. La OT ya quedó confirmada en pantalla: probá Reintentar guardar, o cerrá y usá 💾 Guardar.');
    }
    return;
  }
  if (st.faltan.length){
    mostrarOverlay(`<h3 style="margin:0 0 14px">✓ ${esc(st.ot.ot)} confirmada</h3>
<div class="msg err">Algunos movimientos de esta OT ya no están en la tabla (¿los borraron?). La OT quedó confirmada igual.</div>
<div style="margin-top:18px;text-align:right"><button class="btn primary" id="otcCerrar">Entendido</button></div>`);
    $('otcCerrar').addEventListener('click', () => cerrarOverlay());
    return;
  }
  cerrarOverlay();
}
