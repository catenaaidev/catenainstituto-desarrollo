/* ===== Lotes CIW — asistente de la OT de Corte =====
 *
 * El Corte junta varios lotes en un tanque y forma un lote NUEVO, que se crea
 * junto con la orden. Por eso no usa el formulario de Emitir OT: pregunta de a
 * un paso, primero la orden (número, lotes de origen, tanque) y después el lote
 * nuevo, que puede arrancar en blanco o como "⎘ Hijo" de uno de los lotes de
 * origen, igual que en la pestaña Lotes.
 *
 * Los lotes de origen, sus barriles del Mapa y el guardado son los mismos del
 * formulario (vista-ot-emitir.js): solo cambia el orden en que se preguntan.
 * Cerrar el asistente antes del final no crea nada: el lote y la OT entran
 * juntos en el mismo guardado. */
'use strict';

import { $, esc, escA, DATOS, usuarioActual, mostrarOverlay, cerrarOverlay } from './nucleo.js';
import { opcionesValores } from './tabla.js';
import { proximoNumeroOT } from './ot-movimientos.js';
import { PLANTILLAS_OT } from './ot-plantillas.js';
import { armarHijo } from './lote-nuevo.js';
import { PASOS_LOTE_CORTE, validarLoteDelCorte, valoresIniciales, armarLoteDelCorte } from './ot-corte.js';
import { loteEnBlanco, fijar, refrescarOpcionesFiltros } from './vista-lotes.js';
import { pintarLotes, conectarLotes, asegurarLotes, lotesDeSesion, validarCabecera,
         validarLotesOrigen, confirmarNumeroRepetido, armarOTDeSesion, registrarOT,
         iniciarSesionLotes } from './vista-ot-emitir.js';

const PLANTILLA_CORTE = PLANTILLAS_OT.find(p => p.creaLote).id;

// Pasos fijos; después del lote vienen los de PASOS_LOTE_CORTE y el resumen.
const P_ORDEN = 0, P_ORIGEN = 1, P_DESTINO = 2, P_LOTE = 3, P_DATOS = 4;
const P_RESUMEN = P_DATOS + PASOS_LOTE_CORTE.length;
const TOTAL = P_RESUMEN + 1;

const _ficha = lote => (DATOS().lotes || []).find(l => String(l.lote) === String(lote)) || null;

/* `previo` = lo que ya estaba escrito en el formulario de Emitir OT cuando se
 * eligió Corte (y sus lotes de origen, que siguen en la sesión). Sin `previo`
 * arranca de cero. */
export function abrirCorteOT(onListo, previo){
  const hoy = new Date().toISOString().slice(0, 10);
  if (!previo) iniciarSesionLotes(PLANTILLA_CORTE);
  const base = loteEnBlanco();
  const st = {
    numero: (previo && previo.numero) ||
      proximoNumeroOT(DATOS().movimientos || [], Number(hoy.slice(0, 4)), DATOS().ordenes_trabajo || []),
    fecha: (previo && previo.fecha) || hoy,
    emitio: (previo && previo.emitio) || usuarioActual(),
    destino: (previo && previo.destino) || '',
    lote: '',
    padre: null,         // número del lote de origen elegido como padre, o null
    base,                // loteEnBlanco() o armarHijo(padre)
    vals: valoresIniciales(base),
  };
  let paso = P_ORDEN;

  const encabezado = () => `
<button class="overlay-cerrar" id="ocCerrar" title="Cerrar sin emitir ni crear el lote" aria-label="Cerrar">✕</button>
<h3 style="margin:0 0 4px">✂ OT de Corte</h3>
<div style="color:var(--muted);font-size:12px;margin-bottom:14px">Paso ${paso + 1} de ${TOTAL}</div>`;

  const botones = () => `
<div class="msg err" id="ocError" style="display:none;margin-top:10px;text-align:left"></div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:space-between">
  <button class="btn" id="ocAtras" ${paso === 0 ? 'disabled' : ''}>← Atrás</button>
  <button class="btn primary" id="ocSig">${paso === P_RESUMEN ? '✓ Emitir OT y crear lote' : 'Siguiente →'}</button>
</div>`;

  function cuerpo(){
    if (paso === P_ORDEN) return `
<div style="display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center;text-align:left">
  <label for="ocNumero">N° de OT</label><input class="txt" id="ocNumero" value="${escA(st.numero)}">
  <label for="ocFecha">Fecha</label><input class="txt" type="date" id="ocFecha" value="${escA(st.fecha)}">
  <label for="ocEmitio">Emitió</label><input class="txt" id="ocEmitio" value="${escA(st.emitio)}">
</div>`;
    if (paso === P_ORIGEN) return `
<div style="text-align:left">
  <label for="oteLote" style="display:block;margin-bottom:6px;font-weight:600">Lotes de origen: los que van al tanque</label>
  <input class="txt" id="oteLote" placeholder="Número de lote y Enter" style="width:100%;box-sizing:border-box">
  <div id="otePorLote" style="margin-top:12px;max-height:45vh;overflow:auto"></div>
</div>`;
    if (paso === P_DESTINO) return campoTexto('ocCampo', 'Tanque destino', st.destino,
                                              "vacío = 'Tanque: ____' en la hoja");
    if (paso === P_LOTE) return pasoLote();
    if (paso === P_RESUMEN) return resumen();
    return pasoDato(PASOS_LOTE_CORTE[paso - P_DATOS]);
  }

  function campoTexto(id, label, valor, placeholder, extra){
    return `
<div style="text-align:left">
  <label for="${id}" style="display:block;margin-bottom:6px;font-weight:600">${esc(label)}</label>
  <input class="txt" id="${id}" autocomplete="off" value="${escA(valor)}"
         placeholder="${escA(placeholder || '')}" style="width:100%;box-sizing:border-box"${extra || ''}>
</div>`;
  }

  /* El número del lote nuevo, y de qué lote de origen copiar los datos. */
  function pasoLote(){
    const conFicha = lotesDeSesion().filter(l => _ficha(l.lote));
    const btn = (valor, texto, titulo) =>
      `<button class="btn${String(st.padre ?? '') === valor ? ' primary' : ''}" data-padre="${escA(valor)}" ` +
      `title="${escA(titulo)}">${esc(texto)}</button>`;
    const hijos = conFicha.map(l =>
      btn(String(l.lote), `⎘ Hijo de ${l.lote}`, `Copiar los datos del lote ${l.lote}, sin litros ni envases`)).join(' ');
    return campoTexto('ocCampo', 'Número del lote nuevo (el que se forma en el tanque)', st.lote,
                      'p. ej. 26300', ' inputmode="numeric"') + `
<div style="text-align:left;margin-top:14px">
  <div style="margin-bottom:6px;font-weight:600">¿De dónde salen sus datos?</div>
  <div style="display:flex;flex-wrap:wrap;gap:6px">${btn('', 'En blanco', 'Arrancar sin datos')} ${hijos}</div>
  <div style="color:var(--muted);font-size:12px;margin-top:6px">${st.padre
    ? `Se copian los datos del lote ${esc(st.padre)}; en los pasos siguientes los podés cambiar.`
    : 'Los datos se completan en los pasos siguientes.'}</div>
</div>`;
  }

  function pasoDato(p){
    const valor = st.vals[p.k];
    if (p.opciones){
      return `
<div style="text-align:left">
  <label for="ocCampo" style="display:block;margin-bottom:6px;font-weight:600">${esc(p.label)}</label>
  <select class="txt" id="ocCampo" style="width:100%">` +
        p.opciones.map(o => `<option value="${escA(o)}" ${o === valor ? 'selected' : ''}>${esc(o || '—')}</option>`).join('') +
        `</select>
  <div style="color:var(--muted);font-size:12px;margin-top:6px">Se puede dejar en blanco.</div>
</div>`;
    }
    const sug = p.sugerir
      ? opcionesValores(DATOS().lotes || [], l => l[p.k]).map(o => o.val).filter(v => v !== '') : [];
    return campoTexto('ocCampo', p.label, valor, '', sug.length ? ' list="ocSug"' : '') +
      (sug.length ? `<datalist id="ocSug">${sug.map(v => `<option value="${escA(v)}">`).join('')}</datalist>` : '') +
      '<div style="color:var(--muted);font-size:12px;margin-top:6px;text-align:left">Se puede dejar en blanco.</div>';
  }

  function resumen(){
    const fila = (k, v) => `<tr><td style="color:var(--muted);padding:2px 10px 2px 0">${esc(k)}</td><td>${v}</td></tr>`;
    const origenes = lotesDeSesion().map(l =>
      `${esc(l.lote)}${l.litros != null ? ` · ${esc(Number(l.litros).toLocaleString('es-AR'))} L` : ''}`).join('<br>');
    const datos = PASOS_LOTE_CORTE.map(p => fila(p.label.replace(/ \(.*$/, '').replace(/:.*$/, ''),
                                                 esc(st.vals[p.k] || '—'))).join('');
    return `
<div style="text-align:left">
  <div style="font-weight:600;margin-bottom:4px">Orden</div>
  <table style="border-collapse:collapse;margin-bottom:12px">
    ${fila('N° de OT', esc(st.numero))}${fila('Fecha', esc(st.fecha))}
    ${fila('Tanque destino', esc(st.destino || '—'))}${fila('Lotes de origen', origenes)}
  </table>
  <div style="font-weight:600;margin-bottom:4px">Lote nuevo ${esc(st.lote)}${st.padre ? ` (hijo de ${esc(st.padre)})` : ''}</div>
  <table style="border-collapse:collapse">${datos}</table>
</div>`;
  }

  function pintar(){
    mostrarOverlay(encabezado() + cuerpo() + botones());
    $('ocCerrar').addEventListener('click', () => cerrarOverlay());
    $('ocAtras').addEventListener('click', () => { leer(); paso--; pintar(); });
    $('ocSig').addEventListener('click', avanzar);
    for (const b of document.querySelectorAll('[data-padre]')) b.addEventListener('click', () => elegirPadre(b.dataset.padre));
    if (paso === P_ORIGEN){ conectarLotes(); pintarLotes(); }
    // Enter pasa de paso, salvo en "Agregar lote", donde Enter agrega el lote.
    for (const inp of document.querySelectorAll('#overlayBox input, #overlayBox select')){
      if (inp.id === 'oteLote' || inp.closest('#otePorLote')) continue;
      inp.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); avanzar(); } });
    }
    const foco = $('ocCampo') || $('oteLote') || $('ocNumero') || $('ocSig');
    if (foco){ foco.focus(); if (foco.select && foco.tagName === 'INPUT') foco.select(); }
  }

  function leer(){
    if (paso === P_ORDEN){
      st.numero = $('ocNumero').value.trim(); st.fecha = $('ocFecha').value; st.emitio = $('ocEmitio').value.trim();
    } else if (paso === P_DESTINO) st.destino = $('ocCampo').value.trim();
    else if (paso === P_LOTE) st.lote = $('ocCampo').value.trim();
    else if (paso >= P_DATOS && paso < P_RESUMEN) st.vals[PASOS_LOTE_CORTE[paso - P_DATOS].k] = $('ocCampo').value.trim();
  }

  /* Elegir el padre reemplaza los datos del lote nuevo por los suyos, como el
   * ⎘ Hijo de la pestaña Lotes; "En blanco" los vacía. El número no se toca. */
  function elegirPadre(valor){
    leer();
    const ficha = valor ? _ficha(valor) : null;
    st.padre = ficha ? valor : null;
    st.base = ficha ? armarHijo(ficha) : loteEnBlanco();
    st.vals = valoresIniciales(st.base);
    pintar();
  }

  function error(msg){
    const e = $('ocError');
    e.textContent = msg;
    e.style.display = '';
  }

  const origenes = () => lotesDeSesion().map(l => l.lote);

  async function avanzar(){
    leer();
    if (paso === P_ORDEN){
      const e = validarCabecera(st.numero, st.fecha);
      if (e) return error(e);
    } else if (paso === P_ORIGEN){
      $('ocSig').disabled = true;
      await asegurarLotes();
      $('ocSig').disabled = false;
      const e = validarLotesOrigen();
      if (e){ pintarLotes(); return error(e); }
      // Si el padre elegido se quitó de los lotes de origen, deja de ser padre.
      if (st.padre && !origenes().some(o => String(o) === String(st.padre))) st.padre = null;
    } else if (paso === P_LOTE){
      const v = validarLoteDelCorte(st.lote, DATOS().lotes || [], origenes());
      if (!v.ok) return error(v.error);
    } else if (paso === P_RESUMEN){
      return emitir();
    }
    paso++;
    pintar();
  }

  async function emitir(){
    /* Se vuelve a validar todo: entre el primer paso y el último pudo llegar
     * una versión nueva de los datos con ese mismo número de lote o de OT. */
    const e = validarCabecera(st.numero, st.fecha) || validarLotesOrigen();
    if (e) return error(e);
    const v = validarLoteDelCorte(st.lote, DATOS().lotes || [], origenes());
    if (!v.ok){ paso = P_LOTE; pintar(); return error(v.error); }
    if (!confirmarNumeroRepetido(st.numero)) return;

    const lote = armarLoteDelCorte(st.base, st.vals, v.valor);
    const ot = armarOTDeSesion({
      numero: st.numero, fecha: st.fecha, plantilla: PLANTILLA_CORTE,
      destino: st.destino, emitio: st.emitio,
      loteCorte: { lote: String(v.valor), id_texto: st.vals.id_texto || '' },
    });
    // Los traspasos de la OT (origen → lote nuevo) ya arman el linaje: no hace
    // falta el movimiento de "lote hijo" de la pestaña Lotes.
    await registrarOT(ot, onListo, d => {
      if (!Array.isArray(d.lotes)) d.lotes = [];
      d.lotes.unshift(lote);
      fijar(lote);
      refrescarOpcionesFiltros();
    });
  }

  pintar();
}
