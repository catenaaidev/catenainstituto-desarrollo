/* ===== Lotes CIW — pestana Cruce con el mapa de barriles (subsistema J) ===== */
'use strict';

import { $, esc, escA, registrarVista, irALote,
         DATOS, markDirty, guardar } from './nucleo.js';
import { resumenEnvases, CAPACIDADES } from './envases.js';
import { litrosDelLote } from './mermas.js';
import { queryAnios } from './selector-anios.js';

const ETIQUETA = {
  coincide:            'Coincide',
  difiere:             'Difiere',
  solo_representacion: 'Solo falta desglosar',
  sin_barriles:        'Declara envases, cero en el mapa',
  sin_envase:          'Sin envase ni presencia',
  ausente_ok:          'Ausencia esperada',
};

let _informe = null;
let _cargando = false;
let _error = '';

/* --- desglose legible, reusando el subsistema H --- */
function fmt(d){
  return resumenEnvases(d) || '—';
}

/* --- aplicar el desglose del mapa a un lote ---
 *
 * Escribe SOLO los cuatro capNNN, recorriendo CAPACIDADES en vez de copiar el
 * objeto entero: asi un campo de mas en el informe no puede colarse al lote.
 *
 * Deliberadamente no toca vasija_grande: el mapa no ve los tanques grandes y
 * pisarla borraria 75.950 L validos.
 *
 * litros_actuales se recalcula por la invariante del subsistema H, igual que
 * hace el overlay de la pestana Lotes. Va en 0 y NUNCA en null cuando el
 * desglose queda vacio, porque motor_etapas compara litros_actuales <= 0.
 */
export function aplicarDesglose(lote, desglose){
  for (const c of CAPACIDADES){
    const n = Number(desglose[c.k]) || 0;
    lote[c.k] = n > 0 ? n : null;   // null en cero, como un lote recien creado
  }
  // I2: las barricas mermas pendientes del lote se siguen descontando.
  lote.litros_actuales = litrosDelLote(lote, DATOS().mermas);
  return lote;
}

function seleccionados(){
  const out = [];
  document.querySelectorAll('#tab-cruce input.cruce-sel:checked')
    .forEach(ch => out.push(ch.dataset.lote));
  return out;
}

async function aplicarSeleccion(){
  const elegidos = new Set(seleccionados());
  if (!elegidos.size){ alert('No hay ningun lote tildado.'); return; }

  const porLote = new Map((DATOS().lotes || []).map(l => [String(l.lote), l]));

  // Calculamos el resumen de cambios sin mutar: solo leemos el estado actual
  // y lo que quedaria, para armar el texto del confirm().
  // Los objetos se mutan SOLO si el usuario confirma.
  const planCambios = [];
  for (const v of (_informe.lotes || [])){
    if (!elegidos.has(v.lote)) continue;
    const l = porLote.get(v.lote);
    if (!l) continue;
    const antes = resumenEnvases(l) || '—';
    // Simular el resultado aplicando a una copia temporal, sin tocar l
    const tmp = Object.assign({}, l);
    aplicarDesglose(tmp, v.mapa);
    const despues = resumenEnvases(tmp) || '—';
    if (antes === despues) continue;
    planCambios.push({ lote: l, desglose: v.mapa,
                       texto: v.lote + ': ' + antes + ' → ' + despues });
  }
  if (!planCambios.length){ alert('No hubo nada que cambiar.'); return; }

  // B5: advertencia para lotes con vasija_grande (pueden inflar litros)
  const mixtos = planCambios.filter(c => {
    const vRaw = c.lote.vasija_grande;
    return vRaw !== null && vRaw !== undefined && Number(vRaw) > 0;
  });

  const ver = (_informe.procedencia || {}).version;
  let msg = 'Se van a corregir ' + planCambios.length + ' lotes con lo que dice '
          + 'el mapa (v' + ver + '):\n\n'
          + planCambios.slice(0, 20).map(c => c.texto).join('\n')
          + (planCambios.length > 20 ? ('\n… y ' + (planCambios.length - 20) + ' mas') : '')
          + '\n\nOJO: cambiar los litros mueve la dosis de SO2.';

  if (mixtos.length){
    const totalMixtos = mixtos.reduce((s, c) => {
      const tmp = Object.assign({}, c.lote);
      aplicarDesglose(tmp, c.desglose);
      return s + (tmp.litros_actuales || 0);
    }, 0);
    msg += '\n\n⚠ ATENCION — ' + mixtos.length + ' lote(s) tildado(s) tienen '
        + 'vasija grande declarada:\n'
        + mixtos.map(c => '  · ' + String(c.lote.lote)
                        + ' (vasija grande: ' + c.lote.vasija_grande + ' L)').join('\n')
        + '\nSi las barricas que ve el mapa son vino que salio del tanque, '
        + 'aplicar infla los litros. Total resultante: ' + totalMixtos + ' L. '
        + 'Verificalos fisicamente antes de aplicar. '
        + 'El tanque grande no se toca desde aca.';
  }

  if (!confirm(msg)) return;  // cancelar ya no deja estado a medias

  // Solo ahora, con confirmacion del usuario, se mutan los objetos reales.
  for (const c of planCambios) aplicarDesglose(c.lote, c.desglose);

  markDirty();
  if (await guardar()) await cargarCruce();
}

/* --- clase CSS de la fila segun que tan urgente sea --- */
export function filaClase(veredicto, severidad){
  if (veredicto === 'coincide') return '';
  if (veredicto === 'ausente_ok' || veredicto === 'solo_representacion') return 'cruce-ok';
  if (severidad === 'alta')  return 'cruce-alta';
  if (severidad === 'media') return 'cruce-media';
  return 'cruce-baja';
}

export async function cargarCruce(archivo){
  if (_cargando) return;
  _cargando = true; _error = '';
  render();
  /* Capturado ANTES del fetch: si el usuario cambia de año mientras esto esta
   * en vuelo, lo que llegue fue calculado para el año VIEJO. El listener de
   * 'lotes:anios-cambiados' ya puso _informe en null al tocar el boton, pero
   * sin esta guarda el 'else { _informe = j; }' de mas abajo lo pisaria con la
   * respuesta vieja igual, violando esa misma invariante. */
  const anios = queryAnios();
  try {
    const qs = new URLSearchParams();
    if (archivo) qs.set('archivo', archivo);
    if (anios) qs.set('anios', anios);
    const url = API+'/cruce' + (qs.toString() ? '?' + qs.toString() : '');
    const r = await fetch(url);
    const j = await r.json();
    if (queryAnios() !== anios){
      // El año cambio mientras esto estaba en vuelo: esta respuesta ya no
      // vale para la seleccion actual. Se descarta sin reintentar solo: la
      // pantalla vuelve al boton "Cruzar", igual que al cambiar de año.
      _informe = null; _error = '';
    } else if (!r.ok){ _error = j.error || ('HTTP ' + r.status); _informe = null; }
    else { _informe = j; }
  } catch(e){
    if (queryAnios() === anios){
      _error = String(e && e.message || e);
      _informe = null;
    }
    // Si el año ya cambio, un error de la peticion vieja tampoco vale: se
    // deja _informe/_error como los dejo el listener de anios-cambiados.
  } finally {
    _cargando = false;
    render();
  }
}

function procedencia(){
  const p = (_informe && _informe.procedencia) || {};
  if (!p.version) return '';
  return 'Cruzado contra el mapa v' + esc(p.version) + ' (' + esc(p.actualizado || '') + ')'
       + ' · archivo ' + esc(p.archivo || '');
}

function casilla(v){
  // Solo se puede corregir lo que el mapa vio Y donde los conteos difieren.
  // 'solo_representacion' queda EXCLUIDO aunque el mapa tenga datos: en ese
  // veredicto el total del mapa ya incluye lo que Lotes anota como vasija_grande,
  // y aplicar escribiria cap* con lo que dice el mapa mientras vasija_grande
  // permanece intacta. El resultado es que litros_actuales = litros_mapa +
  // vasija_grande, el doble del volumen real. Con datos reales:
  //   26126: 2250 L -> 4500 L
  //   26140: 3050 L -> 5750 L
  // Y como vista-so2 autocompleta la dosis de SO2 desde litros_actuales, eso
  // seria el doble de metabisulfito sobre vino real. Esos lotes se corrigen a
  // mano en la pestana Lotes (desglosando las barricas y poniendo vasija_grande
  // en 0), que es algo que este subsistema no puede hacer solo.
  const corregible = (v.veredicto === 'difiere');
  if (!corregible) return '<td></td>';
  return '<td><input type="checkbox" class="cruce-sel" data-lote="'
       + escA(v.lote) + '"></td>';
}

function filaLote(v){
  const cls = filaClase(v.veredicto, v.severidad);
  const delta = v.delta > 0 ? ('+' + v.delta) : String(v.delta);
  const pos = (v.posiciones || []).slice(0, 6).join(', ')
            + ((v.posiciones || []).length > 6 ? ' …' : '');
  return '<tr class="' + cls + '">'
    + casilla(v)
    + '<td><a href="#" data-lote="' + escA(v.lote) + '">' + esc(v.lote) + '</a></td>'
    + '<td>' + esc(v.etapa) + '</td>'
    + '<td>' + esc(ETIQUETA[v.veredicto] || v.veredicto) + '</td>'
    + '<td>' + esc(v.severidad || '') + '</td>'
    + '<td>' + fmt(v.declarado) + '</td>'
    + '<td>' + fmt(v.mapa) + '</td>'
    + '<td class="num">' + esc(v.litros_declarados) + '</td>'
    + '<td class="num">' + esc(v.litros_mapa) + '</td>'
    + '<td class="num">' + esc(delta) + '</td>'
    + '<td>' + (v.vasija_grande ? esc(v.vasija_grande) + ' L' : '') + '</td>'
    + '<td>' + (v.mezcla_distinta ? 'medida distinta' : '')
            + (v.aproximadas ? (' ' + esc(v.aproximadas) + '×228→225') : '')
            + ((v.conflictos || []).length
                ? (' ⚠ conteo dudoso: ' + esc(v.conflictos.join(', '))) : '') + '</td>'
    + '<td class="pos">' + esc(pos) + '</td>'
    + '</tr>';
}

function tabla(lotes, titulo){
  if (!lotes.length) return '';
  return '<h3>' + esc(titulo) + ' <span class="cuenta">(' + lotes.length + ')</span></h3>'
    + '<table class="tabla cruce"><thead><tr>'
    + '<th></th><th>Lote</th><th>Etapa</th><th>Veredicto</th><th>Sev.</th>'
    + '<th>Declarado</th><th>Mapa</th><th>L decl.</th><th>L mapa</th><th>Δ</th>'
    + '<th>Vasija grande</th><th>Notas</th><th>Ubicaciones</th>'
    + '</tr></thead><tbody>'
    + lotes.map(filaLote).join('')
    + '</tbody></table>';
}

function resumen(){
  const r = (_informe && _informe.resumen) || {};
  const p = (_informe && _informe.serie_prensa) || {};
  const filas = [
    ['Coincide',                       r.coincide || 0],
    ['Difiere — alta',                 r.difiere_alta || 0],
    ['Difiere — media',                r.difiere_media || 0],
    ['Difiere — baja (informativo)',   r.difiere_baja || 0],
    ['Solo falta desglosar',           r.solo_representacion || 0],
    ['Declara envases, cero en mapa',  r.sin_barriles || 0],
    ['Sin envase ni presencia',        r.sin_envase || 0],
    ['Ausencia esperada',              r.ausente_ok || 0],
  ];
  return '<table class="tabla resumen"><tbody>'
    + filas.map(f => '<tr><td>' + esc(f[0]) + '</td><td class="num">'
                   + esc(f[1]) + '</td></tr>').join('')
    + '</tbody></table>'
    + '<p class="nota">Series prensa excluidas (267xx/268xx/269xx): '
    + esc(p.unidades || 0) + ' unidades, ' + esc(p.litros || 0) + ' L. '
    + 'Pertenecen a otra aplicacion.</p>'
    // B8: mostrar lotes propios que cayeron en el filtro de prensa para que
    // nunca desaparezca un lote sin dejar rastro visible.
    + ((_informe && (_informe.salteados_por_prensa || []).length)
        ? '<p class="nota aviso-prensa">⚠ Lotes propios salteados por prefijo '
          + 'prensa (' + esc((_informe.salteados_por_prensa || []).length) + '): '
          + esc((_informe.salteados_por_prensa || []).join(', '))
          + '. Verificar que no son lotes vivos de la bodega.</p>'
        : '');
}

function avisoConflictos(){
  const c = (_informe && _informe.conflictos) || [];
  if (!c.length) return '';
  const sinFichar = c.filter(x => !x.en_revisiones).length;
  return '<div class="aviso">'
    + '<b>' + c.length + ' unidades con lote contradictorio dentro del mapa</b> '
    + '(inventario vs. tanques). Se resuelven en el mapa de barriles, no aca: '
    + (c.length - sinFichar) + ' ya estan en sus revisiones'
    + (sinFichar ? (', ' + sinFichar + ' todavia no') : '') + '.'
    + '<ul>' + c.slice(0, 10).map(x =>
        '<li>' + esc(x.num) + ': inventario dice ' + esc(x.lote_inventario)
      + ', tanques dice ' + esc(x.lote_tanques)
      + (x.en_revisiones ? '' : ' <b>(sin fichar)</b>') + '</li>').join('')
    + '</ul></div>';
}

function render(){
  const sec = $('tab-cruce');
  if (!sec) return;

  if (_cargando){ sec.innerHTML = '<div class="card">Leyendo el mapa de barriles…</div>'; return; }
  if (_error){
    sec.innerHTML = '<div class="card"><p class="error">No se pudo leer el mapa: '
      + esc(_error) + '</p><p class="nota">El resto de la app sigue funcionando. '
      + 'El mapa corre en la PC de bodega y llega hasta aca por OneDrive.</p>'
      + '<button id="cruceRecargar">Reintentar</button></div>';
    const b = $('cruceRecargar');
    if (b) b.onclick = () => cargarCruce();
    return;
  }
  if (!_informe){
    sec.innerHTML = '<div class="card"><button id="cruceCargar">Cruzar con el mapa de barriles</button></div>';
    const b = $('cruceCargar');
    if (b) b.onclick = () => cargarCruce();
    return;
  }

  const L = _informe.lotes || [];
  const aVerificar = _informe.a_verificar || [];
  const baja = L.filter(v => v.veredicto === 'difiere' && v.severidad === 'baja');
  const ok = L.filter(v => v.veredicto === 'coincide'
                        || v.veredicto === 'ausente_ok'
                        || v.veredicto === 'solo_representacion');

  sec.innerHTML =
      '<div class="card"><p class="proc">' + procedencia() + '</p>'
    + '<button id="cruceRecargar">Volver a cruzar</button></div>'
    + '<div class="card">' + resumen() + '</div>'
    + avisoConflictos()
    + '<div class="card">'
    + '<button id="cruceAplicar">Aplicar los tildados</button> '
    + '<button id="cruceTildarAlta">Tildar severidad alta</button> '
    + '<button id="cruceDestildar">Destildar todo</button> '
    + '<button id="cruceImprimir">Imprimir listado de chequeo</button>'
    + tabla(aVerificar, 'A verificar en bodega')
    + '</div>'
    // cruceHoja es hermano directo de #tab-cruce (fuera de la .card) para que
    // la regla de impresion "display:block!important" lo haga visible.
    // Si estuviera dentro de la .card, la regla "not(#cruceHoja){display:none}"
    // ocultaria la card-padre y display:none en el ancestro gana sobre
    // display:block en el hijo -> la hoja salia en blanco.
    // style="display:none" oculta la hoja en pantalla hasta que se imprime.
    + '<div id="cruceHoja" style="display:none"></div>'
    + '<div class="card">' + tabla(baja, 'Diferencia menor (informativo)') + '</div>'
    + '<div class="card">' + tabla(ok, 'Sin accion') + '</div>';

  const b = $('cruceRecargar');
  if (b) b.onclick = () => cargarCruce();
  const ap = $('cruceAplicar');
  if (ap) ap.onclick = () => aplicarSeleccion();
  const ta = $('cruceTildarAlta');
  if (ta) ta.onclick = () => {
    sec.querySelectorAll('tr.cruce-alta input.cruce-sel')
       .forEach(ch => { ch.checked = true; });
  };
  const dt = $('cruceDestildar');
  if (dt) dt.onclick = () => {
    sec.querySelectorAll('input.cruce-sel').forEach(ch => { ch.checked = false; });
  };
  const im = $('cruceImprimir');
  if (im) im.onclick = () => imprimirChequeo();
  sec.querySelectorAll('a[data-lote]').forEach(a => {
    a.onclick = ev => { ev.preventDefault(); irALote(a.dataset.lote); };
  });
}

/* --- hoja de chequeo para caminar la bodega ---
 *
 * Pura: recibe el informe y devuelve HTML. Respeta el orden de a_verificar, que
 * ya viene por severidad y despues por litros en juego, para que lo primero de
 * la hoja sea lo que mas vino mueve.
 */
export function hojaChequeo(informe){
  const p = (informe && informe.procedencia) || {};
  const lotes = (informe && informe.a_verificar) || [];
  const filas = lotes.map((v, i) => {
    // Unificar el escapado: se juntan los pedazos crudos y se escapa una sola vez al emitir
    const nums = (v.unidades || []).map(u => u.num).join(', ');
    const notas = [];
    if (v.motivo) notas.push(v.motivo);
    if (v.mezcla_distinta) notas.push('verificar la MEDIDA de la vasija, no si falta');
    if (v.aproximadas) notas.push(v.aproximadas + ' unidad(es) de 228 L contadas como 225');
    if ((v.conflictos || []).length){
      notas.push('conteo dudoso: el mapa se contradice en ' + v.conflictos.join(', '));
    }
    return '<tr>'
      + '<td>' + (i + 1) + '</td>'
      + '<td><b>' + esc(v.lote) + '</b><br><span class="chico">'
              + esc(v.etapa || '') + '</span></td>'
      + '<td>' + esc(v.severidad || '') + '</td>'
      + '<td>' + esc(resumenEnvases(v.declarado) || '—') + '<br>'
              + '<span class="chico">' + esc(v.litros_declarados) + ' L</span></td>'
      + '<td>' + esc(resumenEnvases(v.mapa) || '—') + '<br>'
              + '<span class="chico">' + esc(v.litros_mapa) + ' L</span></td>'
      + '<td>' + esc(v.delta > 0 ? ('+' + v.delta) : String(v.delta)) + ' L</td>'
      + '<td class="chico">' + esc((v.posiciones || []).join(', ')) + '</td>'
      + '<td class="chico">' + esc(nums) + '</td>'
      + '<td class="chico">' + esc(notas.join('. ')) + '</td>'
      + '<td class="casillero"></td>'
      + '</tr>';
  }).join('');

  return '<h2>Chequeo fisico de envases</h2>'
    + '<p class="chico">Cruzado contra el mapa de barriles v' + esc(p.version || '?')
    + ' (' + esc(p.actualizado || '') + '). ' + lotes.length + ' lotes a verificar, '
    + 'ordenados por litros en juego. Las ubicaciones son orientativas: el mapa '
    + 'espacial esta cargado al 45%.</p>'
    + '<table class="hoja"><thead><tr>'
    + '<th>#</th><th>Lote</th><th>Sev.</th><th>Declarado</th><th>Mapa</th>'
    + '<th>&#916;</th><th>Ubicaciones</th><th>Barricas del mapa</th>'
    + '<th>Notas</th><th>Verificado / observacion</th>'
    + '</tr></thead><tbody>'
    + (filas || '<tr><td colspan="10">Nada a verificar.</td></tr>')
    + '</tbody></table>';
}

function imprimirChequeo(){
  const hoja = $('cruceHoja');
  if (!hoja) return;
  hoja.innerHTML = hojaChequeo(_informe);
  document.body.classList.add('printing-cruce');
  const limpiar = () => {
    document.body.classList.remove('printing-cruce');
    window.removeEventListener('afterprint', limpiar);
  };
  window.addEventListener('afterprint', limpiar);
  window.print();
}

/* Un informe cruzado con otros años ya no vale: se descarta y la pantalla
 * vuelve al boton "Cruzar". */
document.addEventListener('lotes:anios-cambiados', () => { _informe = null; _error = ''; });

registrarVista('cruce', () => render());
