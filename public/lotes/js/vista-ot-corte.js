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

import { $, esc, escA, DATOS, usuarioActual, mostrarOverlay, cerrarOverlay, protegerOverlay,
         minimizarOverlay } from './nucleo.js';
import { confirmar, informar } from './dialogos.js';
import { opcionesValores } from './tabla.js';
import { proximoNumeroOT } from './ot-movimientos.js';
import { PLANTILLAS_OT, plantillaPorId } from './ot-plantillas.js';
import { asignarLotes, validarDestinos, nombreDestinoLargo, litrosChicas, armarLotesHijos,
         clasesDeTanque, claseAlEscribirNum, mismaClase, nombreClase } from './ot-achique.js';
import { armarHijo, siguienteLote, anioDeLote } from './lote-nuevo.js';
import { PASOS_LOTE_CORTE, validarLoteDelCorte, validarLoteExistente, valoresIniciales,
         armarLoteDelCorte, loteCorteDeEdicion } from './ot-corte.js';
import { asignarLotesExtra, validarExtras, armarHijosExtra, nombreExtra, esChicas } from './ot-destinos.js';
import { loteEnBlanco, fijar, refrescarOpcionesFiltros } from './vista-lotes.js';
import { pintarLotes, conectarLotes, asegurarLotes, lotesDeSesion, validarCabecera,
         validarLotesOrigen, confirmarNumeroRepetido, armarOTDeSesion, registrarOT,
         iniciarSesionLotes, numeroOcupadoEnCarpeta, guardarBorrador, borrarBorrador, fotoDeSesion,
         restaurarLotes, fijarAlCambiarSesion, cargarSesionDeOT, guardarEdicionOT,
         aceptarNumeroNuevo } from './vista-ot-emitir.js';
import { proponerNumero, chipCarpeta, cablearChipsCarpeta } from './guardar-ot.js';
import { normalizarNumero } from './numero-ot.js';
import { fmtFecha, hoyLocalISO } from './fechas.js';
import { fechaOHoy } from './ot-lista.js';

const PLANTILLA_CORTE = PLANTILLAS_OT.find(p => p.creaLote).id;

// Pasos fijos; despues del lote vienen los de PASOS_LOTE_CORTE, en el
// Corte + achique el de las vasijas definitivas, y el resumen.
const P_ORDEN = 0, P_ORIGEN = 1, P_DESTINO = 2, P_LOTE = 3, P_DATOS = 4;
const P_FIN_DATOS = P_DATOS + PASOS_LOTE_CORTE.length;

const _ficha = lote => (DATOS().lotes || []).find(l => String(l.lote) === String(lote)) || null;

/* `previo` = lo que ya estaba escrito en el formulario de Emitir OT cuando se
 * eligió Corte (y sus lotes de origen, que siguen en la sesión). Sin `previo`
 * arranca de cero. `previo.restaurar` = un borrador guardado (ot-borrador.js):
 * el asistente vuelve al paso y los datos en que quedó. `previo.editar` = una
 * OT de Corte pendiente: el asistente la corrige (arranca en los lotes de
 * origen, con el lote del corte como "Lote existente"; el N° se cambia en el
 * primer paso) y guarda los cambios. */
export function abrirCorteOT(onListo, previo){
  const hoy = hoyLocalISO();
  const editar = previo && previo.editar;
  if (editar) previo = { numero: editar.ot, numeroTocado: true, fecha: editar.fecha, emitio: editar.emitio, destino: editar.destino };
  const borrador = previo && previo.restaurar;
  const plantilla = (editar && editar.plantilla) || (previo && previo.plantilla)
    || (borrador && borrador.st && borrador.st.plantilla) || PLANTILLA_CORTE;
  const achique = !!(plantillaPorId(plantilla) || {}).achique;
  // Con achique hay un paso mas antes del resumen: las vasijas definitivas.
  const P_VASIJAS = achique ? P_FIN_DATOS : -1;
  const P_RESUMEN = P_FIN_DATOS + (achique ? 1 : 0);
  const TOTAL = P_RESUMEN + 1;
  // Con lote existente no se preguntan los datos: lote -> (vasijas) -> resumen.
  const TOTAL_EXISTENTE = P_LOTE + 2 + (achique ? 1 : 0);
  if (!previo || borrador) iniciarSesionLotes(plantilla);
  if (borrador){ restaurarLotes(borrador.lotes); previo = null; }
  const base = loteEnBlanco();
  const st = {
    numero: (previo && previo.numero) ||
      proximoNumeroOT(DATOS().movimientos || [], Number(hoy.slice(0, 4)), DATOS().ordenes_trabajo || []),
    fecha: (previo && previo.fecha) || hoy,
    emitio: (previo && previo.emitio) || usuarioActual(),
    destino: (previo && previo.destino) || '',
    lote: '',
    modo: 'nuevo',       // 'nuevo' (se crea con la OT) o 'existente' (el vino va a un lote que ya está)
    existente: '',       // número del lote existente
    padre: null,         // número del lote de origen elegido como padre, o null
    base,                // loteEnBlanco() o armarHijo(padre)
    vals: valoresIniciales(base),
    plantilla,
    // Corte + achique: las vasijas definitivas (ot-achique.js); al editar, las guardadas.
    destinos: editar && editar.achique ? editar.achique.destinos.map(d => ({ ...d })) : [],
    // Corte sin achique: tanques destino extra, cada uno un lote hijo del corte (ot-destinos.js).
    extras: editar ? (editar.destinos_extra || []).map(d => esChicas(d)
      ? { tipo: 'chicas', barricas: d.barricas, t50: d.t50, litros: d.litros, lote: d.lote, mov_id: d.mov_id }
      : { num: d.num, litros: d.litros, lote: d.lote, mov_id: d.mov_id }) : [],
    // Si el usuario escribio el numero, el de la carpeta ya no lo pisa.
    numeroTocado: previo && previo.numeroTocado !== undefined ? !!previo.numeroTocado : !!(previo && previo.numero),
  };
  let paso = P_ORDEN;
  let focoNuevoExtra = false;   // tras "＋ Tanque", el foco va a la fila nueva
  if (editar){
    st.modo = 'existente';
    st.existente = (editar.lote_corte && editar.lote_corte.lote) || '';
    paso = P_ORIGEN;
  }
  if (borrador && borrador.st){
    Object.assign(st, borrador.st);
    paso = Math.min(Math.max(0, Number(borrador.paso) || 0), P_RESUMEN);
  }

  // Con algo cargado, clic afuera / Escape minimizan (nucleo.js) y cada cambio
  // queda en el borrador por si se recarga la página.
  // Editando no se guarda borrador de recarga: no pisa el de una OT nueva.
  const hayDatos = () => !!editar || paso > P_ORDEN || lotesDeSesion().length > 0;
  const borradorAhora = () => {
    if (editar || !hayDatos()) return;
    guardarBorrador({ tipo: 'corte', cab: { numero: st.numero }, st, paso, lotes: fotoDeSesion() });
  };
  fijarAlCambiarSesion(editar ? null : borradorAhora);

  /* El numero de la carpeta llega despues: se guarda en st y, si el paso de la
   * orden esta a la vista, se escribe en el campo. No se repinta todo (se
   * perderia lo tipeado en otro paso, o se reabriria un asistente cerrado). */
  const proponer = () => proponerNumero('principal').then(p => {
    if (st.numeroTocado) return;
    st.numero = p.numero;
    if ($('ocNumero')) $('ocNumero').value = p.numero;
  });
  if (!st.numeroTocado) proponer();

  const encabezado = () => `
<button class="overlay-cerrar overlay-min" id="ocMin" title="Minimizar: seguir usando la web y retomar después (también con clic afuera o Escape)" aria-label="Minimizar">—</button>
<button class="overlay-cerrar" id="ocCerrar" title="${editar ? 'Cerrar sin guardar los cambios' : 'Cerrar sin emitir ni crear el lote'}" aria-label="Cerrar">✕</button>
<h3 style="margin:0 0 4px">${editar ? (achique ? '✎ Editar el Corte + achique ' : '✎ Editar el Corte ') + esc(editar.ot)
                                    : (achique ? '✂ OT de Corte + achique' : '✂ OT de Corte')}</h3>
<div style="color:var(--muted);font-size:12px;margin-bottom:14px">Paso ${numPaso()} de ${st.modo === 'existente' ? TOTAL_EXISTENTE : TOTAL}</div>`;

  // En modo existente los pasos de datos no se ven: lo que viene despues del
  // lote se numera seguido.
  const numPaso = () => st.modo === 'existente' && paso >= P_FIN_DATOS ? P_LOTE + 2 + (paso - P_FIN_DATOS) : paso + 1;

  function textoEmitir(){
    const nuevos = (st.modo === 'existente' ? 0 : 1) + (achique ? st.destinos.filter(d => d.nuevo && !_ficha(d.lote)).length
                                                                : st.extras.filter(d => !_ficha(d.lote)).length);
    const crear = nuevos ? (nuevos > 1 ? ` y crear ${nuevos} lotes` : ' y crear lote') : '';
    return (editar ? '✓ Guardar cambios' : '✓ Emitir OT') + crear;
  }

  const botones = () => `
<div class="msg err" id="ocError" style="display:none;margin-top:10px;text-align:left"></div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:space-between">
  <button class="btn" id="ocAtras" ${paso === 0 ? 'disabled' : ''}>← Atrás</button>
  <button class="btn primary" id="ocSig">${paso === P_RESUMEN ? textoEmitir() : 'Siguiente →'}</button>
</div>`;

  function cuerpo(){
    if (paso === P_ORDEN) return `
<div style="display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center;text-align:left">
  <label for="ocNumero">N° de OT</label><div><input class="txt" id="ocNumero" value="${escA(st.numero)}"> ${chipCarpeta('principal')}</div>
  <label for="ocFecha">Fecha programada</label><input class="txt" type="date" id="ocFecha" value="${escA(st.fecha)}" title="Vacío = hoy">
  <label for="ocEmitio">Emitió</label><input class="txt" id="ocEmitio" value="${escA(st.emitio)}">
</div>`;
    if (paso === P_ORIGEN) return `
<div style="text-align:left">
  <label for="oteLote" style="display:block;margin-bottom:6px;font-weight:600">Lotes de origen: los que van al tanque</label>
  <input class="txt" id="oteLote" placeholder="Número de lote y Enter" style="width:100%;box-sizing:border-box">
  <div id="otePorLote" style="margin-top:12px;max-height:45vh;overflow:auto"></div>
</div>`;
    if (paso === P_DESTINO) return campoTexto('ocCampo', achique ? 'Tanque pulmón' : 'Tanque destino', st.destino,
                                              achique ? 'p. ej. TQ pulmón bodega' : "vacío = 'Tanque: ____' en la hoja") +
                                   (achique ? '' : pasoExtras());
    if (paso === P_LOTE) return pasoLote();
    if (paso === P_VASIJAS) return pasoVasijas();
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

  /* Tanques destino extra del Corte (sin achique): si el vino no entra en el
   * tanque destino, cada tanque mas es un lote nuevo, hijo del lote del corte.
   * Mismas filas que el bloque "Destinos" de Emitir OT, sin la linea de suma. */
  function pasoExtras(){
    const vs = (DATOS().vasijas || []).filter(v => v && v.activa !== false);
    const mismoPosible = st.modo === 'existente' && !!corteNum();
    const lista = vs.length ? '<datalist id="ocPadron">' + vs.map(v =>
      `<option value="${escA(v.num)}">${esc(nombreExtra(v) + ' · ' + (v.tipo || '') + (v.cap_real ? ' · ' + v.cap_real + ' L' : ''))}</option>`).join('') + '</datalist>' : '';
    const filas = st.extras.map((d, k) => `<div class="ote-dest-fila">
    ${esChicas(d) ? `<span class="ote-chicas">
      <input class="txt" type="number" min="0" step="1" data-cexb="${k}" value="${escA(d.barricas || '')}" placeholder="—" aria-label="Cantidad de barricas"><span>barricas</span>
      <input class="txt" type="number" min="0" step="1" data-cext50="${k}" value="${escA(d.t50 || '')}" placeholder="—" aria-label="Cantidad de T50"><span>T50</span></span>`
    : `<input class="txt" list="ocPadron" data-cexn="${k}" value="${escA(d.num)}" placeholder="Tanque (n°)" aria-label="Tanque destino extra">`}
    <input class="txt" type="number" step="any" min="0" data-cexl="${k}" value="${escA(d.litros ?? '')}" placeholder="litros" aria-label="Litros previstos">
    <input class="txt" data-cexlote="${k}" value="${escA(d.lote)}"${mismoPosible ? ' list="ocLoteCorte"' : ''} aria-label="Lote del destino extra">
    <button class="rowbtn" data-cexx="${k}" title="${esChicas(d) ? 'Quitar barricas' : 'Quitar tanque'}">✕</button></div>`).join('');
    const tit = st.extras.length ? '<div class="ote-dest-fila ote-dest-tit"><span>Otros destinos</span><span>Litros</span><span>Lote</span><span></span></div>' : '';
    // Corte a un lote existente: un extra puede seguir siendo ese mismo lote.
    const dlCorte = mismoPosible ? `<datalist id="ocLoteCorte"><option value="${escA(corteNum())}">mismo lote del corte</option></datalist>` : '';
    return `
<div class="ote-destinos" style="text-align:left;margin-top:14px">
  <div style="color:var(--muted);font-size:12px;margin-bottom:6px">Si el vino no entra en un tanque, agregá otro tanque o barricas/T50: cada destino más es un lote nuevo, hijo del lote del corte.${mismoPosible
    ? ` Si siguen siendo el lote ${esc(corteNum())}, escribí ese número en Lote.` : ''}</div>
  ${tit}${filas}${dlCorte}<div class="ote-agregar"><button class="btn" type="button" data-cexmas>＋ Tanque</button>
  ${st.extras.some(esChicas) ? '' : '<button class="btn" type="button" data-cexmasb>＋ Barricas / T50</button>'}</div>${lista}
</div>`;
  }

  function leerExtras(){
    for (const el of document.querySelectorAll('#overlayBox [data-cexn],#overlayBox [data-cexl],#overlayBox [data-cexlote],#overlayBox [data-cexb],#overlayBox [data-cext50]')){
      const k = +(el.dataset.cexn ?? el.dataset.cexl ?? el.dataset.cexlote ?? el.dataset.cexb ?? el.dataset.cext50);
      const d = st.extras[k];
      if (!d) continue;
      if (el.dataset.cexn !== undefined) d.num = el.value.trim();
      else if (el.dataset.cexb !== undefined) d.barricas = el.value.trim();
      else if (el.dataset.cext50 !== undefined) d.t50 = el.value.trim();
      else if (el.dataset.cexl !== undefined) d.litros = el.value.trim();
      else d.lote = el.value.trim();
    }
  }

  /* Pone numero a los extra que no tienen. Con lote del corte NUEVO, un extra
   * con su mismo numero vuelve a proponerse; con lote EXISTENTE se respeta
   * (las barricas siguen siendo ese lote, pedido 2026-11-16). */
  function proponerExtras(){
    const corte = corteNum();
    const existente = st.modo === 'existente';
    // Lote nuevo todavia sin numero: se reserva el que va a proponer P_LOTE
    // (misma cuenta), asi el primer extra no lo toma y despues se renumera.
    const reservado = corte || (!existente ? String(siguienteLote(DATOS().lotes, anioOrigenes())) : '');
    st.extras = asignarLotesExtra(
      st.extras.map(d => corte && !existente && String(d.lote ?? '').trim() === corte ? { ...d, lote: '' } : d),
      { lotes: DATOS().lotes || [], anio: anioVino(), reservados: [reservado].filter(Boolean) });
  }

  // Valida los extra del Corte; '' si esta todo bien (con achique no hay extra).
  function errorExtras(){
    if (achique) return '';
    const ve = validarExtras(st.extras, { lotes: DATOS().lotes || [], padron: DATOS().vasijas || [],
      origenes: origenes(), loteCorte: st.modo === 'existente' ? st.existente : st.lote, destino1: st.destino,
      mismoLoteCorte: st.modo === 'existente',
      propios: new Set(editar ? (editar.destinos_extra || []).map(d => String(d.lote)) : []) });
    return ve.ok ? '' : ve.error;
  }

  /* El lote que recibe el vino: uno nuevo (que se crea con la OT) o uno que
   * ya existe. */
  function pasoLote(){
    const modo = (valor, texto, titulo) =>
      `<button class="btn${st.modo === valor ? ' primary' : ''}" data-modo="${valor}" title="${escA(titulo)}">${esc(texto)}</button>`;
    const selector = `
<div style="text-align:left;margin-bottom:14px">
  <div style="margin-bottom:6px;font-weight:600">¿A qué lote va el vino del tanque?</div>
  <div style="display:flex;flex-wrap:wrap;gap:6px">${modo('nuevo', '＋ Lote nuevo', 'Se crea un lote nuevo junto con la OT')} ${modo('existente', 'Lote existente', 'El vino se suma a un lote que ya está en la lista')}</div>
</div>`;
    return selector + (st.modo === 'existente' ? pasoLoteExistente() : pasoLoteNuevo());
  }

  function pasoLoteExistente(){
    const lotes = DATOS().lotes || [];
    const ficha = _ficha(st.existente);
    const opciones = lotes.map(l => `<option value="${escA(l.lote)}">${esc(l.id_texto || '')}</option>`).join('');
    return campoTexto('ocCampo', 'Número del lote existente (el que recibe el vino)', st.existente,
                      'p. ej. 26217', ' list="ocLotes" inputmode="numeric"') +
      `<datalist id="ocLotes">${opciones}</datalist>
<div id="ocExistenteInfo" style="color:var(--muted);font-size:12px;margin-top:6px;text-align:left">${ficha
    ? esc(ficha.id_texto || 'Sin descripción') + (ficha.vasija_actual ? ' · hoy en ' + esc(ficha.vasija_actual) : '')
    : 'No se crea ningún lote: los lotes de origen se traspasan a este.'}</div>`;
  }

  /* El número del lote nuevo, y de qué lote de origen copiar los datos. */
  function pasoLoteNuevo(){
    // Propuesto: el siguiente lote del año de la OT; se puede cambiar.
    if (!st.lote) st.lote = siguienteLote(DATOS().lotes, anioOrigenes());
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

  // El lote que recibe el vino del pulmon en la vasija base.
  const corteNum = () => String(st.modo === 'existente' ? st.existente : st.lote).trim();
  const anioOT = () => Number(String(st.fecha).slice(0, 4)) || new Date().getFullYear();
  /* El año de los numeros propuestos es el del vino, no el de la OT (pedido
   * 2026-11-16): un corte de lotes 2025 propone 25xxx. Si los origenes son de
   * años distintos (o no hay), el de la OT. */
  function anioOrigenes(){
    const anios = [...new Set(origenes().map(o => anioDeLote(o, null)).filter(Boolean))];
    return anios.length === 1 ? anios[0] : anioOT();
  }
  const anioVino = () => anioDeLote(corteNum(), anioOrigenes());
  const litrosOrigen = () => lotesDeSesion().reduce((s, l) => s + (Number(l.litros) || 0), 0);
  // Los litros de las vasijas son opcionales: la suma cuenta solo los escritos.
  const conLitros = () => st.destinos.filter(d => String(d.litros ?? '').trim() !== '' && Number.isFinite(Number(d.litros)));
  const sumaDestinos = () => conLitros().reduce((s, d) => s + Number(d.litros), 0);
  const fmtNum = v => Number(v || 0).toLocaleString('es-AR');
  function refrescarLotes(){
    st.destinos = asignarLotes(st.destinos, { corte: corteNum(), lotes: DATOS().lotes || [], anio: anioVino() });
  }
  // Al editar, los hijos que esta OT ya creo existen en Lotes: no son repetidos.
  const hijosPropios = () => new Set(((editar && editar.achique && editar.achique.destinos) || [])
    .filter(d => d.nuevo).map(d => String(d.lote)));
  const ctxDestinos = () => ({ lotes: DATOS().lotes || [], origenes: origenes(), corte: corteNum(),
                               propios: hijosPropios(), padron: DATOS().vasijas || [] });
  // Solo informa: sin litros escritos no se muestra.
  function textoSuma(){
    if (!conLitros().length) return '';
    const s = sumaDestinos(), o = litrosOrigen();
    return Math.abs(s - o) < 0.5
      ? `Suma ${fmtNum(s)} L de ${fmtNum(o)} L del corte ✓`
      : `Suma ${fmtNum(s)} L de ${fmtNum(o)} L del corte · ⚠ no cierra (se puede emitir igual: son litros previstos)`;
  }
  function pintarSuma(){
    const el = $('ocdSuma');
    if (!el) return;
    const t = textoSuma();
    el.textContent = t;
    el.style.display = t ? '' : 'none';
  }

  /* Tipos de tanque del padron (tipo + capacidad), para elegir sin saber
   * todavia cual va a estar libre. */
  const claveClase = c => c ? `${c.tipo}|${Number(c.cap)}` : '';
  const clasesPadron = () => clasesDeTanque(DATOS().vasijas || []);
  function opcionesNum(clase){
    return (DATOS().vasijas || []).filter(v => v && v.activa !== false)
      .filter(v => !clase || mismaClase({ tipo: v.tipo, cap: v.cap_real }, clase))
      .map(v => `<option value="T ${escA(v.num)}">${esc(v.tipo)} · ${esc(v.cap_real)} L</option>`).join('');
  }
  function selectClase(i, d){
    const cs = clasesPadron();
    // Una clase guardada que ya no esta en el padron sigue como opcion.
    if (d.clase && !cs.some(c => claveClase(c) === claveClase(d.clase)))
      cs.push({ ...d.clase, nombre: nombreClase(d.clase) });
    return `<select class="txt" data-d="${i}" data-f="clase" aria-label="Tipo de tanque" style="max-width:260px">` +
      `<option value="">Tipo de tanque…</option>` +
      cs.map(c => `<option value="${escA(claveClase(c))}"${claveClase(c) === claveClase(d.clase) ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('') +
      '</select>';
  }

  /* Las vasijas donde termina el vino. Cada fila muestra su lote: la base, el
   * del corte; las demas, un lote nuevo con numero editable. El tanque se pide
   * por tipo; el numero, las cantidades y los litros se pueden dejar para
   * despues (✎ Editar o al confirmar). */
  function pasoVasijas(){
    refrescarLotes();
    // OT viejas (solo numero): el tipo sale del padron, como automatico (sigue
    // al numero si lo cambian).
    for (const d of st.destinos)
      if (d.tipo === 'tanque' && !d.clase && String(d.num ?? '').trim()) Object.assign(d, claseAlEscribirNum(d, DATOS().vasijas || []));
    const filas = st.destinos.map((d, i) => {
      const lote = d.nuevo
        ? `lote nuevo <input class="txt" data-d="${i}" data-f="lote" value="${escA(d.lote)}" inputmode="numeric" style="width:80px" aria-label="Número del lote nuevo">`
        : `lote del corte <b>${esc(d.lote || '—')}</b>`;
      const campos = d.tipo === 'tanque'
        ? `${selectClase(i, d)}
           <input class="txt" list="ocVasijas${i}" data-d="${i}" data-f="num" value="${escA(d.num ? 'T ' + d.num : '')}" placeholder="T (opcional)" style="width:100px" aria-label="Número de tanque (opcional)">
           <datalist id="ocVasijas${i}">${opcionesNum(d.claseAuto ? null : d.clase)}</datalist>`
        : `<input class="txt" type="number" min="0" step="1" data-d="${i}" data-f="barricas" value="${escA(d.barricas || '')}" placeholder="?" style="width:60px" aria-label="Barricas (opcional)"> barricas +
           <input class="txt" type="number" min="0" step="1" data-d="${i}" data-f="t50" value="${escA(d.t50 || '')}" placeholder="?" style="width:60px" aria-label="T50 (opcional)"> T50`;
      return `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">${campos}
  <input class="txt" type="number" min="0" step="any" data-d="${i}" data-f="litros" value="${escA(d.litros ?? '')}" placeholder="litros (opc.)" style="width:100px" aria-label="Litros (opcional)"> L · ${lote}
  <button class="rowbtn" data-dquitar="${i}" title="Quitar esta vasija" aria-label="Quitar esta vasija">✕</button></div>`;
    }).join('');
    const hayChicas = st.destinos.some(d => d.tipo === 'chicas');
    const suma = textoSuma();
    return `
<div style="text-align:left">
  <div style="font-weight:600;margin-bottom:4px">Vasijas definitivas: adónde va el vino del pulmón</div>
  <div style="color:var(--muted);font-size:12px;margin-bottom:10px">El primer tanque se queda con el lote del corte; cada tanque más es un lote nuevo con los mismos datos. Las barricas y T50 van juntas en un solo lote. El pulmón queda vacío.<br>Del tanque alcanza con el tipo: el número, las cantidades y los litros se pueden dejar en blanco y completarlos después (✎ Editar o al confirmar).</div>
  ${filas || '<div style="color:var(--muted);margin-bottom:8px">Todavía no hay vasijas.</div>'}
  <div style="display:flex;gap:6px;margin-top:8px">
    <button class="btn" data-dmas="tanque">＋ Tanque</button>
    <button class="btn" data-dmas="chicas"${hayChicas ? ' disabled title="Las barricas y T50 van en una sola fila"' : ''}>＋ Barricas / T50</button>
  </div>
  <div id="ocdSuma" style="margin-top:10px;font-size:13px${suma ? '' : ';display:none'}">${esc(suma)}</div>
</div>`;
  }

  function leerVasijas(){
    const cs = clasesPadron();
    for (const el of document.querySelectorAll('#overlayBox [data-d][data-f]')){
      const d = st.destinos[+el.dataset.d];
      if (!d) continue;
      const f = el.dataset.f;
      if (f === 'clase'){
        // Elegido a mano: deja de seguir al numero.
        if (el.value !== claveClase(d.clase)){ d.clase = cs.find(c => claveClase(c) === el.value) || null; d.claseAuto = false; }
        if (d.clase) d.clase = { tipo: d.clase.tipo, cap: Number(d.clase.cap) };
      } else d[f] = f === 'num' ? el.value.trim().replace(/^t\s*/i, '') : el.value.trim();
    }
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
    ${fila('N° de OT', esc(st.numero))}${fila('Fecha programada', esc(fmtFecha(st.fecha)))}
    ${fila(achique ? 'Tanque pulmón' : 'Tanque destino', esc(st.destino || '—'))}${fila('Lotes de origen', origenes)}
  </table>
  ${!achique && st.extras.length ? `<div style="margin-bottom:12px">Destinos extra: ${esc(st.extras.map(d => nombreExtra(d) + ' → lote ' + d.lote
    + (st.modo === 'existente' && String(d.lote ?? '').trim() === corteNum() ? ' (mismo lote del corte)' : '')).join(', '))}</div>` : ''}
  ${achique ? `<div style="font-weight:600;margin-bottom:4px">Vasijas definitivas</div>
  <table style="border-collapse:collapse;margin-bottom:12px">${st.destinos.map(d => {
    const falta = d.tipo === 'tanque' ? (String(d.num ?? '').trim() ? '' : ' (n° a definir)')
                                      : (Number(d.barricas) > 0 || Number(d.t50) > 0 ? '' : ' (cantidad a definir)');
    const litros = String(d.litros ?? '').trim() === '' ? 'litros a definir' : `${fmtNum(d.litros)} L`;
    return fila(nombreDestinoLargo(d) + falta, `${esc(litros)} · ${d.nuevo ? 'lote nuevo' : 'lote del corte'} ${esc(d.lote)}`);
  }).join('')}</table>` : ''}
  ${st.modo === 'existente' ? `<div style="font-weight:600;margin-bottom:4px">Va al lote existente ${esc(st.existente)}</div>
  <div>${esc((_ficha(st.existente) || {}).id_texto || '')}</div>${lotesDeSesion().some(l => String(l.lote) === String(st.existente))
    ? `<div class="msg warn" style="margin-top:8px">⚠ El lote ${esc(st.existente)} también es lote de origen: el vino de los demás se suma a él.</div>` : ''}` : `<div style="font-weight:600;margin-bottom:4px">Lote nuevo ${esc(st.lote)}${st.padre ? ` (hijo de ${esc(st.padre)})` : ''}</div>
  <table style="border-collapse:collapse">${datos}</table>`}
</div>`;
  }

  function pintar(){
    mostrarOverlay(encabezado() + cuerpo() + botones());
    protegerOverlay({
      titulo: () => (editar ? 'Edición Corte ' : 'Corte ') + (st.numero || ''),
      hayDatos,
      alRetomar: () => { if (paso === P_ORIGEN) pintarLotes(); },
      alDescartar: () => { if (!editar) borrarBorrador(); fijarAlCambiarSesion(null); },
    });
    borradorAhora();
    $('ocMin').addEventListener('click', () => { leer(); borradorAhora(); minimizarOverlay(); });
    $('ocCerrar').addEventListener('click', async () => {
      if (hayDatos() && !await confirmar(editar
        ? { titulo: 'Descartar los cambios', texto: 'El Corte ' + editar.ot + ' queda como estaba.', si: 'Descartar', no: 'Seguir editando', peligro: true }
        : { titulo: 'Descartar el Corte', texto: 'Se pierde lo cargado en esta OT sin emitir.', si: 'Descartar', no: 'Seguir armándola', peligro: true })) return;
      if (!editar) borrarBorrador();
      fijarAlCambiarSesion(null);
      cerrarOverlay();
    });
    $('ocAtras').addEventListener('click', () => {
      leer();
      paso = st.modo === 'existente' && paso === P_FIN_DATOS ? P_LOTE : paso - 1;
      pintar();
    });
    for (const b of document.querySelectorAll('[data-modo]')) b.addEventListener('click', () => { leer(); st.modo = b.dataset.modo; pintar(); });
    if (paso === P_LOTE && st.modo === 'existente') $('ocCampo').addEventListener('input', () => {
      const f = _ficha($('ocCampo').value.trim());
      $('ocExistenteInfo').textContent = f ? (f.id_texto || 'Sin descripción') + (f.vasija_actual ? ' · hoy en ' + f.vasija_actual : '')
                                           : 'No se crea ningún lote: los lotes de origen se traspasan a este.';
    });
    $('ocSig').addEventListener('click', avanzar);
    for (const b of document.querySelectorAll('[data-padre]')) b.addEventListener('click', () => elegirPadre(b.dataset.padre));
    if (paso === P_ORIGEN){ conectarLotes(); pintarLotes(); }
    if (paso === P_ORDEN){
      $('ocNumero').addEventListener('input', () => { st.numeroTocado = true; });
      cablearChipsCarpeta($('ocNumero').parentElement, proponer);
    }
    if (paso === P_VASIJAS){
      for (const el of document.querySelectorAll('#overlayBox [data-d][data-f]')) el.addEventListener('input', () => {
        const i = +el.dataset.d, d = st.destinos[i], f = el.dataset.f;
        leerVasijas();
        if (f === 'litros') d.litrosTocado = true;
        // Las chicas proponen sus litros (225 por barrica, 50 por T50) hasta que
        // alguien los escriba; sin cantidades, sin litros.
        if (d.tipo === 'chicas' && (f === 'barricas' || f === 't50') && !d.litrosTocado){
          const l = litrosChicas(d.barricas, d.t50);
          d.litros = l ? String(l) : '';
          const li = document.querySelector(`#overlayBox [data-d="${i}"][data-f="litros"]`);
          if (li) li.value = d.litros;
        }
        if (d.tipo === 'tanque' && (f === 'num' || f === 'clase')){
          // Sin tipo elegido a mano, el tipo sale del padron con cada tecla
          // (claseAuto): "2" -> "20" -> "209" no deja trabado el tipo del T 2.
          if (f === 'num'){
            const antes = claveClase(d.clase);
            Object.assign(d, claseAlEscribirNum(d, DATOS().vasijas || []));
            const sel = document.querySelector(`#overlayBox [data-d="${i}"][data-f="clase"]`);
            if (sel && claveClase(d.clase) !== antes) sel.value = claveClase(d.clase);
          }
          // La lista de numeros muestra solo los tanques del tipo elegido a mano.
          const dl = $('ocVasijas' + i);
          if (dl) dl.innerHTML = opcionesNum(d.claseAuto ? null : d.clase);
        }
        pintarSuma();
        borradorAhora();
      });
      for (const b of document.querySelectorAll('[data-dmas]')) b.addEventListener('click', () => {
        leer();
        // Un tanque nuevo propone lo que falta para cerrar los litros del corte
        // (solo si los origenes tienen litros y lo escrito no llega); si no, vacio.
        const falta = Math.round(Math.max(0, litrosOrigen() - sumaDestinos()) * 10) / 10;
        st.destinos.push(b.dataset.dmas === 'tanque'
          ? { tipo: 'tanque', num: '', clase: null, litros: falta > 0 ? String(falta) : '' }
          : { tipo: 'chicas', barricas: '', t50: '', litros: '' });
        pintar();
      });
      for (const b of document.querySelectorAll('[data-dquitar]')) b.addEventListener('click', () => {
        leer(); st.destinos.splice(+b.dataset.dquitar, 1); pintar();
      });
    }
    let focoExtra = null;
    if (paso === P_DESTINO && !achique){
      for (const el of document.querySelectorAll('#overlayBox [data-cexn],#overlayBox [data-cexl],#overlayBox [data-cexlote],#overlayBox [data-cexb],#overlayBox [data-cext50]'))
        el.addEventListener('input', () => { leerExtras(); borradorAhora(); });
      const mas = document.querySelector('#overlayBox [data-cexmas]');
      if (mas) mas.addEventListener('click', () => {
        leer();
        st.extras.push({ num: '', litros: '', lote: '' });
        proponerExtras();
        focoNuevoExtra = true;
        pintar();
      });
      const masB = document.querySelector('#overlayBox [data-cexmasb]');
      if (masB) masB.addEventListener('click', () => {
        leer();
        st.extras.push({ tipo: 'chicas', barricas: '', t50: '', litros: '', lote: '' });
        proponerExtras();
        focoNuevoExtra = true;
        pintar();
      });
      for (const b of document.querySelectorAll('#overlayBox [data-cexx]')) b.addEventListener('click', () => {
        leer(); st.extras.splice(+b.dataset.cexx, 1); pintar();
      });
      // Recien agregado: el foco va al tanque de la fila nueva.
      if (focoNuevoExtra){ focoNuevoExtra = false; const k = st.extras.length - 1;
        focoExtra = document.querySelector(`#overlayBox [data-cexn="${k}"],#overlayBox [data-cexb="${k}"]`); }
    }
    // Enter pasa de paso, salvo en "Agregar lote", donde Enter agrega el lote.
    for (const inp of document.querySelectorAll('#overlayBox input, #overlayBox select')){
      if (inp.id === 'oteLote' || inp.closest('#otePorLote')) continue;
      inp.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); avanzar(); } });
    }
    const foco = focoExtra || $('ocCampo') || $('oteLote') || $('ocNumero') || document.querySelector('#overlayBox [data-d]') || $('ocSig');
    if (foco){ foco.focus(); if (foco.select && foco.tagName === 'INPUT') foco.select(); }
  }

  function leer(){
    if (paso === P_ORDEN){
      st.numero = $('ocNumero').value.trim(); st.fecha = fechaOHoy($('ocFecha').value, hoyLocalISO()); st.emitio = $('ocEmitio').value.trim();
    } else if (paso === P_DESTINO){
      st.destino = $('ocCampo').value.trim();
      if (!achique) leerExtras();
    } else if (paso === P_LOTE){
      if (st.modo === 'existente') st.existente = $('ocCampo').value.trim();
      else st.lote = $('ocCampo').value.trim();
    }
    else if (paso === P_VASIJAS) leerVasijas();
    else if (paso >= P_DATOS && paso < P_FIN_DATOS) st.vals[PASOS_LOTE_CORTE[paso - P_DATOS].k] = $('ocCampo').value.trim();
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
    e.classList.add('err'); e.classList.remove('warn');
    e.textContent = msg;
    e.style.display = '';
  }

  function advertir(msg){
    const e = $('ocError');
    e.classList.add('warn'); e.classList.remove('err');
    e.textContent = '⚠ ' + msg + ' Tocá «Siguiente» para seguir igual.';
    e.style.display = '';
  }

  const origenes = () => lotesDeSesion().map(l => l.lote);

  async function avanzar(){
    leer();
    if (paso === P_ORDEN){
      const e = validarCabecera(st.numero);
      if (e) return error(e);
    } else if (paso === P_ORIGEN){
      $('ocSig').disabled = true;
      await asegurarLotes();
      $('ocSig').disabled = false;
      const e = validarLotesOrigen();
      if (e){ pintarLotes(); return error(e); }
      // Si el padre elegido se quitó de los lotes de origen, deja de ser padre.
      if (st.padre && !origenes().some(o => String(o) === String(st.padre))) st.padre = null;
    } else if (paso === P_DESTINO && !achique){
      // Los que quedaron sin numero se proponen antes de validar.
      proponerExtras();
      const ee = errorExtras();
      if (ee){ pintar(); return error(ee); }
    } else if (paso === P_LOTE){
      if (st.modo === 'existente'){
        const v = validarLoteExistente(st.existente, DATOS().lotes || [], origenes());
        if (!v.ok) return error(v.error);
        // Advertencia que no frena: el segundo "Siguiente" sigue de largo.
        if (v.aviso && st.avisoVisto !== v.valor){ st.avisoVisto = v.valor; return advertir(v.aviso); }
        // Ya se sabe el lote del corte: un extra con su numero se vuelve a proponer.
        if (!achique) proponerExtras();
        // Sin achique P_FIN_DATOS es el resumen; con achique, el paso de vasijas.
        paso = P_FIN_DATOS;
        return pintar();
      }
      const v = validarLoteDelCorte(st.lote, DATOS().lotes || [], origenes());
      if (!v.ok) return error(v.error);
      if (!achique) proponerExtras();
    } else if (paso === P_VASIJAS){
      refrescarLotes();
      const v = validarDestinos(st.destinos, ctxDestinos());
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
    st.numero = normalizarNumero(st.numero, 'principal'); // "939" -> "0939"
    const e = validarCabecera(st.numero) || validarLotesOrigen();
    if (e) return error(e);
    const existente = st.modo === 'existente';
    const v = existente ? validarLoteExistente(st.existente, DATOS().lotes || [], origenes())
                        : validarLoteDelCorte(st.lote, DATOS().lotes || [], origenes());
    if (!v.ok){ paso = P_LOTE; pintar(); return error(v.error); }
    let destinos = null;
    if (achique){
      refrescarLotes();
      const vd = validarDestinos(st.destinos, ctxDestinos());
      if (!vd.ok){ paso = P_VASIJAS; pintar(); return error(vd.error); }
      destinos = st.destinos;
    }
    const ee = errorExtras();
    if (ee){ paso = P_DESTINO; pintar(); return error(ee); }
    if (editar) return guardarEdicion(existente, v);
    if (!await confirmarNumeroRepetido(st.numero)) return;
    // Si el numero ya esta en la carpeta, se vuelve al paso de la orden con el
    // siguiente libre ya puesto, sin guardar nada.
    const otro = await numeroOcupadoEnCarpeta(st.numero);
    if (otro){ st.numero = otro; paso = P_ORDEN; pintar(); return; }

    if (existente){
      // No se crea ningún lote: los traspasos van al lote que ya existe.
      const ot = armarOTDeSesion({
        numero: st.numero, fecha: st.fecha, plantilla,
        destino: st.destino, emitio: st.emitio,
        loteCorte: { lote: v.valor, id_texto: v.ficha.id_texto || '', existente: true },
        achique: destinos ? { destinos } : null,
        destinosExtra: achique ? null : st.extras,
      });
      const hijos = [...(destinos ? armarLotesHijos(destinos, v.ficha, DATOS().lotes || []) : []),
                     ...hijosExtraDe(ot, v.valor, v.ficha)];
      await registrarOT(ot, onListo, hijos.length ? d => crearLotes(d, [...hijos].reverse()) : undefined);
      return;
    }
    const lote = armarLoteDelCorte(st.base, st.vals, v.valor);
    const ot = armarOTDeSesion({
      numero: st.numero, fecha: st.fecha, plantilla,
      destino: st.destino, emitio: st.emitio,
      loteCorte: { lote: String(v.valor), id_texto: st.vals.id_texto || '' },
      achique: destinos ? { destinos } : null,
      destinosExtra: achique ? null : st.extras,
    });
    // Los traspasos de la OT (origen → lote nuevo, y del corte a cada hijo) ya
    // arman el linaje: no hace falta el movimiento de "lote hijo" de la pestaña Lotes.
    const hijos = [...(destinos ? armarLotesHijos(destinos, lote, DATOS().lotes || []) : []),
                   ...hijosExtraDe(ot, v.valor, lote)];
    await registrarOT(ot, onListo, d => crearLotes(d, [...[...hijos].reverse(), lote]));
  }

  /* Los lotes hijos de los tanques extra: copian la ficha del lote del corte. */
  function hijosExtraDe(ot, loteCorte, fichaCorte){
    if (achique) return [];
    return armarHijosExtra(ot, l => String(l) === String(loteCorte) ? fichaCorte : null, DATOS().lotes || []);
  }

  /* Suma a Lotes los lotes que crea la OT (el del corte y/o los hijos), fijados arriba. */
  function crearLotes(d, nuevos){
    if (!nuevos.length) return;
    if (!Array.isArray(d.lotes)) d.lotes = [];
    for (const l of nuevos){ d.lotes.unshift(l); fijar(l); }
    refrescarOpcionesFiltros();
  }

  /* Editando: la OT conserva su numero; si el lote destino es nuevo se crea
   * en el mismo guardado. El lote que la OT habia creado no se borra solo. */
  async function guardarEdicion(existente, v){
    const o = (DATOS().ordenes_trabajo || []).find(x => x.id === editar.id);
    if (!o){ error('La OT ya no está en los datos (¿la borraron desde otra PC?).'); return; }
    const numero = await aceptarNumeroNuevo(st.numero, o);
    if (!numero){ paso = P_ORDEN; pintar(); return; }
    st.numero = numero;
    const previo = o.lote_corte;
    const loteCorte = loteCorteDeEdicion(existente, v, previo, st.vals.id_texto);
    const nuevo = armarOTDeSesion({ numero: o.ot, fecha: st.fecha, plantilla: o.plantilla,
      destino: st.destino, emitio: st.emitio, loteCorte, destinosExtra: achique ? null : st.extras });
    const loteNuevo = existente ? null : armarLoteDelCorte(st.base, st.vals, v.valor);
    let destinos;
    if (achique){
      refrescarLotes();
      const vd = validarDestinos(st.destinos, ctxDestinos());
      if (!vd.ok){ paso = P_VASIJAS; pintar(); return error(vd.error); }
      destinos = st.destinos;
    }
    const ee = errorExtras();
    if (ee){ paso = P_DESTINO; pintar(); return error(ee); }
    // Los hijos copian la ficha del corte: la del lote nuevo, o la del existente.
    const fichaCorte = loteNuevo || v.ficha;
    const hijos = [...(destinos ? armarLotesHijos(destinos, fichaCorte, DATOS().lotes || []) : []),
                   ...hijosExtraDe(nuevo, loteCorte.lote, fichaCorte)];
    const nuevos = [...[...hijos].reverse(), ...(loteNuevo ? [loteNuevo] : [])];
    const r = await guardarEdicionOT(o, { numero, lotes: nuevo.lotes, destino: nuevo.destino, fecha: nuevo.fecha, emitio: nuevo.emitio,
                                lote_corte: nuevo.lote_corte, ...(achique ? { achique: { destinos } } : {}),
                                destinos_extra: achique ? undefined : st.extras },
                                onListo, nuevos.length ? d => crearLotes(d, nuevos) : null);
    if (previo && !previo.existente && String(previo.lote) !== String(loteCorte.lote))
      await informar({ titulo: 'El lote ' + previo.lote + ' sigue en la lista',
        texto: 'Esta OT lo había creado y ahora el corte va al ' + loteCorte.lote + '. No se borra solo: si no se usa, borralo desde la pestaña Lotes.' });
    if (r && r.hijosQuitados && r.hijosQuitados.length)
      await informar({ titulo: 'Lotes que siguen en la lista',
        texto: 'Esta OT había creado ' + r.hijosQuitados.join(', ') + ' y ya no los usa. No se borran solos: si no se usan, borralos desde la pestaña Lotes.' });
  }

  if (editar) cargarSesionDeOT(editar).then(ok => { if (ok) pintar(); });
  else pintar();
}
