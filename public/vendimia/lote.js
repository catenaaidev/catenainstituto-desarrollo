// Vendimia V7: panel de trabajo por lote y vasija (formularios web para tablet).
// Todas las reglas las valida el servidor; acá se muestran y se cargan.
import {graficoSVG,normVasija} from './v6.js?v=8';

const $ = id => document.getElementById(id);
function h(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of hijos.flat()) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : String(c));
  return e;
}
const fechaHora = s => s ? new Date(/^d{4}-d{2}-d{2} d/.test(s) ? s.replace(' ', 'T') + 'Z' : s).toLocaleString('es-AR', {timeZone: 'America/Argentina/Mendoza', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : '—';
const ahoraLocal = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 16); // Mendoza (UTC-3)
const uuid = () => crypto.randomUUID();
const ESTADO_OT = {borrador: 'Borrador · falta aprobar', aprobada: 'Aprobada', programada: 'Programada', emitida: 'Emitida · pendiente', en_ejecucion: 'En ejecución', ejecutada: 'Ejecutada', parcial: 'Ejecución parcial', cancelada: 'Cancelada'};
const ESTADO_IMP = {en_cola: 'En cola de impresión', tomado: 'Enviando a la impresora', enviado: 'Enviado a la impresora (no confirmado en papel)', confirmado: 'Impresión confirmada', error: 'Error de impresión', cancelado: 'Impresión cancelada'};
const TIPO_OT = {th2: 'Corrección de acidez (TH2)', siembra: 'Siembra', nutrientes: 'Nutrientes', movimiento: 'Movimiento', descube: 'Descube', desvinado: 'Desvinado', agregado: 'Agregado'};
const OPERACIONES = ['P · Punch-down energético', 'PS · Punch-down suave', 'J · Mojar el sombrero', 'C · CO₂ y cerrar', 'DE · Delestage', 'RC · Remontaje cerrado', 'RA · Remontaje abierto', 'Rcm · Remontaje cerrado manual', 'C-C · Clapé a clapé'];
const restante = iso => { const ms = Date.parse(iso) - Date.now(); if (ms <= 0) return 'vencida'; const hh = Math.floor(ms / 3600000), mm = Math.round(ms % 3600000 / 60000); return `faltan ${hh} h ${mm} min`; };
const chip = (estado, texto) => h('span', {class: 'v7-chip', 'data-c': estado}, texto);

// ---------- cola local de acciones pendientes (tablet sin señal) ----------
const COLA = 'ciw-v7-pendientes';
const leerCola = () => { try { return JSON.parse(localStorage.getItem(COLA) || '[]'); } catch { return []; } };
const guardarCola = q => { try { localStorage.setItem(COLA, JSON.stringify(q)); } catch {} };

export function crearPanel({api, ciw, abrirDocumentos, ocultarDocumentos, avisar, editarId}) {
  let L = null, vasija = '', pestana = 'resumen', P = {};
  const raiz = $('dashboard');

  async function enviar(path, body, {encolable = false} = {}) {
    try { return await api(path, body); }
    catch (e) {
      if (encolable && !navigator.onLine) { guardarCola([...leerCola(), {path, body}]); avisar('Sin conexión: quedó PENDIENTE de sincronizar en esta tablet. No está confirmado todavía.', true); render(); return {pendiente: true}; }
      if (e.data?.falta) throw new Error(e.message + ' ' + e.data.falta.join(' '));
      throw e;
    }
  }
  async function sincronizar() {
    const q = leerCola(); if (!q.length || !navigator.onLine) return;
    const resto = [];
    for (const x of q) { try { await api(x.path, x.body); } catch (e) { if (!navigator.onLine) resto.push(x); else avisar('Una acción pendiente no se pudo aplicar: ' + e.message, true); } }
    guardarCola(resto); if (L) await abrir(L.ing.periodo_id);
  }
  addEventListener('online', sincronizar);

  async function abrir(pid, tab) {
    const d = await api('/lote/' + pid);
    L = d; P = d.permisos;
    if (!d.vasijas.some(v => v.vasija === vasija)) vasija = d.vasijas[0]?.vasija || '';
    if (tab) pestana = tab;
    raiz.hidden = false; render();
  }
  const V = () => L.vasijas.find(v => v.vasija === vasija);
  const deV = arr => arr.filter(x => normVasija(x.vasija) === normVasija(vasija));
  const recargar = async () => { await abrir(L.ing.periodo_id); };
  const accion = (fn, ok) => async e => { e?.preventDefault?.(); const b = e?.submitter || e?.target; if (b) b.disabled = true; try { await fn(); if (ok) avisar(ok); await recargar(); } catch (err) { avisar(err.message, true); } finally { if (b) b.disabled = false; } };
  const valores = form => Object.fromEntries(new FormData(form));
  const campo = (label, name, attrs = {}) => h('label', {class: 'v7-campo'}, label, attrs.tipo === 'select' ? h('select', {name}, ...attrs.opciones.map(o => h('option', {value: o}, o))) : attrs.tipo === 'textarea' ? h('textarea', {name, rows: 2}) : h('input', {name, type: attrs.type || 'text', inputmode: attrs.num ? 'decimal' : null, step: attrs.num ? 'any' : null, value: attrs.value ?? '', required: attrs.required, placeholder: attrs.ph}));

  function render() {
    if (!L) return;
    const info = L.info, v = V(), pend = leerCola().filter(x => x.body?.periodo_id === L.ing.periodo_id || x.path.includes('/ot/'));
    raiz.replaceChildren(...[
      h('div', {class: 'v7-cab'},
        h('div', {}, h('div', {class: 'v7-lote'}, 'Lote ', h('b', {}, L.ing.lote), info.demo ? chip('rojo', 'DEMOSTRACIÓN') : null),
          h('div', {class: 'v7-vino'}, [info.variedad || L.ing.variedad || 'Variedad sin indicar', info.id_texto].filter(Boolean).join(' · ')),
          h('div', {class: 'muted'}, `Recepción ${L.ing.recepcion ? L.ing.recepcion.split('-').reverse().join('/') : 'sin fecha'} · Estado: ${({borrador: 'Borrador', en_proceso: 'En proceso', finalizado: 'Finalizado'})[L.ing.estado]}`)),
        v ? h('div', {class: 'v7-proxima', 'data-bloq': v.proxima.bloqueo ? '1' : ''}, h('small', {}, `Próxima acción · vasija ${vasija} · ${v.proxima.quien}`), h('strong', {}, v.proxima.texto), v.proxima.bloqueo ? h('span', {}, '⚠ ' + v.proxima.bloqueo) : null)
          : h('div', {class: 'v7-proxima'}, h('small', {}, 'Próxima acción'), h('strong', {}, 'Cargar el análisis inicial e indicar la vasija'))),
      L.faltan.length ? h('div', {class: 'v7-falta'}, `Faltan datos de identificación: ${L.faltan.join(', ').replace(/_/g, ' ')}. `, editarId ? h('button', {class: 'ci-btn chico', type: 'button', onclick: editarId}, 'Completar') : null) : null,
      pend.length ? h('div', {class: 'v7-falta'}, `${pend.length} acción(es) PENDIENTE(S) de sincronizar en esta tablet: todavía no están confirmadas.`) : null,
      h('div', {class: 'v7-vasijas'}, h('span', {class: 'muted'}, 'Vasija:'), ...L.vasijas.map(x => h('button', {type: 'button', class: 'v7-vas', 'aria-pressed': String(x.vasija === vasija), onclick: () => { vasija = x.vasija; render(); }}, x.vasija)), !L.vasijas.length ? h('span', {class: 'muted'}, 'todavía no hay vasijas: cargala en el análisis inicial') : null),
      h('nav', {class: 'v7-tabs'}, ...[['resumen', 'Resumen'], ['analisis', 'Análisis inicial'], ['ordenes', 'Órdenes de trabajo'], ['control', 'Control'], ['movimientos', 'Movimientos'], ['finfa', 'Fin FA y descube'], ['documentos', 'Documentos e historial']]
        .map(([k, t]) => h('button', {type: 'button', 'aria-pressed': String(pestana === k), onclick: () => { pestana = k; render(); }}, t))),
      h('section', {class: 'v7-cuerpo'}, ...vista())].filter(Boolean));
    if (pestana === 'documentos') abrirDocumentos(); else ocultarDocumentos();
  }

  function vista() {
    switch (pestana) {
      case 'analisis': return vistaAnalisis();
      case 'ordenes': return [listaOT(deV(L.ots))];
      case 'control': return vistaControl();
      case 'movimientos': return vistaMovs();
      case 'finfa': return vistaFinFA();
      case 'documentos': return [h('p', {class: 'muted'}, 'Planillas originales, copias de trabajo, exportación a Excel e historial de versiones. Los datos del trabajo diario se cargan en las otras pestañas.')];
      default: return vistaResumen();
    }
  }

  function vistaResumen() {
    if (!L.vasijas.length) return [h('p', {}, 'Empezá por la pestaña “Análisis inicial”: indicá la vasija, los kilos, la merma y los análisis.')];
    return [h('div', {class: 'v7-grid'}, ...L.vasijas.map(x => {
      const ots = L.ots.filter(o => normVasija(o.vasija) === normVasija(x.vasija));
      return h('article', {class: 'v7-card'}, h('h3', {}, 'Vasija ' + x.vasija), h('p', {}, h('b', {}, x.proxima.texto)), x.proxima.bloqueo ? h('p', {class: 'v7-bloq'}, x.proxima.bloqueo) : null,
        h('p', {}, chip(x.ph.estado, x.ph.texto)), h('p', {}, chip(x.fin_fa.estado, 'Fin FA: ' + x.fin_fa.texto)),
        h('ul', {class: 'v7-mini'}, ...ots.map(o => h('li', {}, `${o.numero} · ${TIPO_OT[o.tipo]} · ${ESTADO_OT[o.estado]}`))),
        h('button', {class: 'ci-btn', type: 'button', onclick: () => { vasija = x.vasija; pestana = 'analisis'; render(); }}, 'Trabajar en esta vasija'));
    }))];
  }

  // ---------- análisis inicial + revisión técnica + confirmación de pH ----------
  function vistaAnalisis() {
    const regs = deV(L.registros).filter(x => !x.anulado), ini = regs.find(x => x.tipo === 'analisis_inicial'), v = V(), out = [];
    if (!ini) {
      const f = h('form', {class: 'v7-form', onsubmit: accion(async () => {
        const x = valores(f), num = ['kg_recibidos', 'kg_procesados', 'merma', 'brix', 'ph', 'at', 'nfa', 'so2t', 'acido_malico', 'temperatura', 'bins'];
        const datos = Object.fromEntries(Object.entries(x).filter(([k, val]) => val !== '' && !['vasija', 'fecha', 'responsable', 'observaciones'].includes(k)).map(([k, val]) => [k, num.includes(k) ? Number(String(val).replace(',', '.')) : val]));
        await enviar('/registros', {op: uuid(), periodo_id: L.ing.periodo_id, vasija: x.vasija, tipo: 'analisis_inicial', fecha_muestra: x.fecha, datos, responsable: x.responsable, observaciones: x.observaciones}, {encolable: true});
        vasija = x.vasija;
      }, 'Análisis inicial guardado.')},
        h('h3', {}, 'Análisis inicial'), h('p', {class: 'muted'}, 'Campos de las planillas de Fermentación (tintos y blancos). Lo que falte se puede completar después.'),
        h('div', {class: 'v7-campos'}, campo('Vasija *', 'vasija', {value: vasija, required: true, ph: 'Ej. T 12'}), campo('Fecha y hora de muestreo *', 'fecha', {type: 'datetime-local', value: ahoraLocal(), required: true}),
          campo('Kg recibidos', 'kg_recibidos', {num: 1}), campo('Kg procesados', 'kg_procesados', {num: 1}), campo('Bins', 'bins', {num: 1}), campo('Merma de llenado', 'merma', {num: 1}), campo('Unidad de merma', 'merma_unidad', {tipo: 'select', opciones: ['kg', 'L', 'cm']}),
          campo('Tipo de vasija', 'tipo_vasija', {ph: 'Ej. Tanque 24 hL'}), campo('Brix', 'brix', {num: 1}), campo('pH', 'ph', {num: 1}), campo('Acidez total (g/L)', 'at', {num: 1}), campo('NFA (mg/L)', 'nfa', {num: 1}), campo('SO₂ total (mg/L)', 'so2t', {num: 1}), campo('Ácido málico (g/L)', 'acido_malico', {num: 1}), campo('Temperatura (°C)', 'temperatura', {num: 1}), campo('Responsable', 'responsable', {value: ciw.nombre || ''})),
        campo('Observaciones', 'observaciones', {tipo: 'textarea'}), h('button', {class: 'ci-btn primario grande'}, 'Guardar análisis inicial'));
      return [f];
    }
    out.push(fichaRegistro(ini, 'Análisis inicial'), v ? h('p', {}, chip(v.ph.estado, v.ph.texto + (v.ph.criterio_version ? ` · criterio ${v.ph.criterio_version}` : ''))) : null);
    for (const x of regs.filter(x => x.tipo === 'post_correccion')) out.push(fichaRegistro(x, 'Análisis posterior a la corrección'));
    const clave = v?.proxima.clave;
    if (clave === 'revision_tecnica') out.push(P.tecnico ? formRevision() : h('p', {class: 'v7-bloq'}, 'Esperando la revisión técnica (TH2 o “No requiere corrección”).'));
    if (['analisis_post', 'confirmar_ph'].includes(clave) || clave === 'ejecutar_th2') out.push(formPost());
    if (clave === 'confirmar_ph') out.push(P.tecnico ? formConfirmarPh(regs) : h('p', {class: 'v7-bloq'}, 'Esperando que el técnico confirme el pH para siembra.'));
    const dec = deV(L.decisiones);
    if (dec.length) out.push(h('div', {class: 'v7-card'}, h('h4', {}, 'Decisiones técnicas'), h('ul', {}, ...dec.map(d => h('li', {}, `${fechaHora(d.fecha)} · ${({no_requiere_th2: 'No requiere corrección', confirmar_ph: 'pH confirmado para siembra', fin_fa: 'Fin de FA confirmado'})[d.tipo]} · ${d.autor}${d.motivo ? ' · ' + d.motivo : ''} · criterio ${d.criterio_version || '—'}`)))));
    return out;
  }
  function fichaRegistro(x, titulo) {
    const d = typeof x.datos === 'string' ? JSON.parse(x.datos) : x.datos;
    return h('div', {class: 'v7-card'}, h('h4', {}, titulo), h('p', {class: 'muted'}, `Muestra: ${fechaHora(x.fecha_muestra)} · cargado ${fechaHora(x.registrado)} por ${x.autor}${x.version > 1 ? ` · corregido (v${x.version})` : ''}`),
      h('dl', {class: 'v7-dl'}, ...Object.entries(d).flatMap(([k, val]) => [h('dt', {}, k.replace(/_/g, ' ')), h('dd', {}, String(val))])),
      x.observaciones ? h('p', {}, x.observaciones) : null,
      h('button', {class: 'ci-btn chico', type: 'button', onclick: () => corregir(x, d)}, 'Corregir'));
  }
  function corregir(x, d) {
    const k = prompt('¿Qué dato querés corregir? (' + Object.keys(d).join(', ') + ')'); if (!k) return;
    const val = prompt(`Nuevo valor de ${k} (antes: ${d[k] ?? 'vacío'})`); if (val === null) return;
    const motivo = prompt('Motivo de la corrección (queda registrado)') || '';
    accion(() => enviar(`/registros/${x.id}/corregir`, {version: x.version, datos: {[k]: val}, motivo}), 'Corrección guardada. El valor anterior quedó en el historial.')();
  }
  function formRevision() {
    let modo = 'th2';
    const f = h('form', {class: 'v7-form', onsubmit: accion(async () => {
      const x = valores(f);
      if (modo === 'no') await enviar('/tecnico/no-requiere', {op: uuid(), periodo_id: L.ing.periodo_id, vasija, revisado: x.revisado === 'on', motivo: x.motivo});
      else await enviar('/tecnico/th2', {op: uuid(), periodo_id: L.ing.periodo_id, vasija, revisado: x.revisado === 'on', datos: x});
    }, 'Revisión técnica registrada.')});
    const th2 = h('div', {class: 'v7-campos'}, campo('Producto', 'producto', {value: 'Ácido tartárico (TH2)'}), campo('Dosis aprobada', 'dosis', {num: 1}), campo('Unidad de dosis', 'unidad_dosis', {tipo: 'select', opciones: ['g/L', 'g/hL', 'kg/m³']}), campo('Cantidad total', 'cantidad', {num: 1}), campo('Unidad', 'unidad', {tipo: 'select', opciones: ['g', 'kg']}), campo('Base de cálculo (fórmula o ensayo aprobado) *', 'base_calculo'), campo('Responsable', 'responsable'), campo('Instrucciones', 'instrucciones', {tipo: 'textarea'}));
    const no = h('div', {hidden: true}, campo('Motivo *', 'motivo', {tipo: 'textarea'}));
    f.append(h('h3', {}, 'Revisión técnica'), h('p', {class: 'muted'}, 'La cantidad de ácido sale de la fórmula o el ensayo aprobado: la app no la calcula desde el pH.'),
      h('label', {class: 'v7-check'}, h('input', {type: 'checkbox', name: 'revisado', required: true}), ' Revisé kilos, mermas y análisis'),
      h('div', {class: 'v7-seg'}, h('button', {type: 'button', 'aria-pressed': 'true', onclick: e => { modo = 'th2'; th2.hidden = false; no.hidden = true; e.target.setAttribute('aria-pressed', 'true'); e.target.nextSibling.setAttribute('aria-pressed', 'false'); }}, 'Aprobar OT de TH2'),
        h('button', {type: 'button', 'aria-pressed': 'false', onclick: e => { modo = 'no'; th2.hidden = true; no.hidden = false; e.target.setAttribute('aria-pressed', 'true'); e.target.previousSibling.setAttribute('aria-pressed', 'false'); }}, 'No requiere corrección')),
      th2, no, h('button', {class: 'ci-btn primario grande'}, 'Registrar decisión'));
    return f;
  }
  function formPost() {
    const f = h('form', {class: 'v7-form', onsubmit: accion(() => { const x = valores(f); return enviar('/registros', {op: uuid(), periodo_id: L.ing.periodo_id, vasija, tipo: 'post_correccion', fecha_muestra: x.fecha, datos: {ph: Number(x.ph), at: x.at ? Number(x.at) : undefined}, responsable: x.responsable}, {encolable: true}); }, 'Análisis guardado.')},
      h('h3', {}, 'Análisis de pH'), (() => { const t = deV(L.ots).find(o => o.tipo === 'th2' && o.ejecucion?.fecha_real); return h('p', {class: t ? 'v7-bloq' : 'muted'}, t ? `La muestra tiene que ser POSTERIOR a la ejecución del TH2 (${fechaHora(t.ejecucion.fecha_real)}).` : 'Después de una corrección, tomá la muestra una vez ejecutada la OT.'); })(),
      h('div', {class: 'v7-campos'}, campo('Fecha y hora de muestreo', 'fecha', {type: 'datetime-local', value: ahoraLocal(), required: true}), campo('pH', 'ph', {num: 1, required: true}), campo('Acidez total (g/L)', 'at', {num: 1}), campo('Responsable', 'responsable', {value: ciw.nombre || ''})),
      h('button', {class: 'ci-btn primario'}, 'Guardar análisis'));
    return f;
  }
  function receta(prefijo, titulo, opcional) {
    return h('fieldset', {class: 'v7-receta'}, h('legend', {}, titulo + (opcional ? ' (si falta, la OT queda bloqueada hasta aprobarla)' : '')),
      h('div', {class: 'v7-campos'}, campo('Producto', prefijo + 'producto'), campo('Dosis', prefijo + 'dosis', {num: 1}), campo('Unidad de dosis', prefijo + 'unidad_dosis', {tipo: 'select', opciones: ['g/hL', 'g/L', 'mL/hL']}), campo('Cantidad total', prefijo + 'cantidad', {num: 1}), campo('Unidad', prefijo + 'unidad', {tipo: 'select', opciones: ['g', 'kg', 'mL', 'L']}), campo('Responsable', prefijo + 'responsable'), campo('Instrucciones', prefijo + 'instrucciones', {tipo: 'textarea'})));
  }
  const sacar = (x, p) => Object.fromEntries(Object.entries(x).filter(([k]) => k.startsWith(p)).map(([k, v]) => [k.slice(p.length), v]));
  function formConfirmarPh(regs) {
    const conPh = regs.filter(x => (typeof x.datos === 'string' ? JSON.parse(x.datos) : x.datos).ph !== undefined);
    const f = h('form', {class: 'v7-form', onsubmit: accion(async () => { const x = valores(f); await enviar('/tecnico/confirmar-ph', {op: uuid(), periodo_id: L.ing.periodo_id, vasija, registro_id: x.registro_id, receta: sacar(x, 's_'), receta_nutrientes: sacar(x, 'n_')}); }, 'pH confirmado. La OT de siembra se emitió y se envió a la cola de impresión.')},
      h('h3', {}, 'Confirmar pH para siembra'),
      h('label', {class: 'v7-campo'}, 'Medición de pH', h('select', {name: 'registro_id', required: true}, ...conPh.reverse().map(x => { const d = typeof x.datos === 'string' ? JSON.parse(x.datos) : x.datos; return h('option', {value: x.id}, `pH ${d.ph} · ${fechaHora(x.fecha_muestra)} · ${x.tipo.replace('_', ' ')}`); }))),
      receta('s_', 'Receta de siembra (levadura)'), receta('n_', 'Receta de nutrientes', true),
      h('button', {class: 'ci-btn primario grande'}, 'Confirmar pH y emitir OT de siembra'));
    return f;
  }

  // ---------- órdenes ----------
  function listaOT(ots) {
    if (!ots.length) return h('p', {class: 'muted'}, 'Esta vasija todavía no tiene órdenes de trabajo.');
    return h('div', {class: 'v7-grid'}, ...ots.map(o => tarjetaOT(o)));
  }
  function tarjetaOT(o) {
    const tr = (L?.trabajos || []).filter(t => t.ot_id === o.id), ult = tr[tr.length - 1];
    return h('article', {class: 'v7-card v7-ot', 'data-estado': o.estado},
      h('div', {class: 'v7-ot-top'}, h('b', {}, `OT ${o.numero}`), chip(o.estado === 'ejecutada' ? 'verde' : o.estado === 'cancelada' ? 'gris' : o.estado === 'parcial' || o.estado === 'borrador' ? 'rojo' : 'azul', ESTADO_OT[o.estado])),
      h('div', {}, `${TIPO_OT[o.tipo]} · vasija ${o.vasija} · v${o.version}`),
      o.programada_para && ['programada', 'borrador'].includes(o.estado) ? h('div', {class: 'v7-bloq'}, `Programada para ${fechaHora(o.programada_para)} (${restante(o.programada_para)})${o.estado === 'borrador' ? ' · BLOQUEADA: falta aprobar la receta' : ''}`) : null,
      ult ? h('div', {class: 'muted'}, ESTADO_IMP[ult.estado] + (ult.impresora_id ? '' : ' · sin impresora configurada: usá “Imprimir”')) : null,
      h('button', {class: 'ci-btn', type: 'button', onclick: () => abrirOT(o.id)}, 'Abrir'));
  }
  async function abrirOT(id) {
    const d = await api('/ot/' + id), o = d.ot, dlg = $('dialog-ot'), cuerpo = $('ot-cuerpo');
    const recarga = async () => { dlg.close(); if (L) await recargar(); if (window.vendimiaMisOrdenes) window.vendimiaMisOrdenes(); };
    const act = (fn, ok) => async e => { e.preventDefault(); try { await fn(); avisar(ok); await recarga(); } catch (err) { avisar(err.message, true); } };
    const datos = Object.entries(o.datos || {}).filter(([k, v]) => v !== '' && v !== null && typeof v !== 'object');
    const partes = [h('h2', {}, `OT ${o.numero} · ${TIPO_OT[o.tipo]}`), h('p', {}, chip('azul', ESTADO_OT[o.estado]), ` · vasija ${o.vasija} · versión ${o.version}`),
      h('dl', {class: 'v7-dl'}, ...datos.flatMap(([k, v]) => [h('dt', {}, k.replace(/_/g, ' ')), h('dd', {}, String(v))])),
      o.programada_para ? h('p', {}, `Programada para ${fechaHora(o.programada_para)} · ${restante(o.programada_para)}`) : null,
      o.ejecucion ? h('p', {class: 'v7-ok'}, `Ejecutó ${o.ejecucion.ejecutor} · real ${fechaHora(o.ejecucion.fecha_real)} · registrado ${fechaHora(o.ejecucion.registrado)} · ${o.ejecucion.producto || ''} ${o.ejecucion.cantidad ?? ''} ${o.ejecucion.unidad || ''} ${o.ejecucion.lote_insumo ? '· lote ' + o.ejecucion.lote_insumo : ''} ${o.ejecucion.completa ? '' : '· PARCIAL'}`) : null,
      h('div', {class: 'v7-acc'}, h('a', {class: 'ci-btn', href: `/vendimia/api/ot/${o.id}/documento`, target: '_blank', rel: 'noopener'}, 'Imprimir / ver documento'),
        !['borrador', 'programada', 'cancelada'].includes(o.estado) ? h('button', {class: 'ci-btn', type: 'button', onclick: act(() => api(`/ot/${o.id}/reimprimir`, {op: uuid()}), 'Reimpresión enviada a la cola con el mismo número de OT.')}, 'Reimprimir (cola)') : null)];
    if (d.trabajos.length) partes.push(h('h4', {}, 'Impresión'), h('ul', {}, ...d.trabajos.map(t => h('li', {}, `${fechaHora(t.creado)} · v${t.version}${t.reimpresion ? ' · reimpresión' : ''} · ${ESTADO_IMP[t.estado]}${t.error ? ' · ' + t.error : ''} `, ['enviado', 'en_cola', 'tomado'].includes(t.estado) ? h('button', {class: 'ci-btn chico', type: 'button', onclick: act(() => api(`/impresion/${t.id}/confirmar`, {}), 'Impresión confirmada.')}, 'Salió en papel') : null))));
    if (P.operario && ['emitida', 'en_ejecucion', 'parcial'].includes(o.estado)) {
      const f = h('form', {class: 'v7-form', onsubmit: act(async () => { const x = valores(f); const r = await enviar(`/ot/${o.id}/ejecutar`, {op: f.dataset.op, completa: x.completa === 'si', fecha_real: x.fecha_real, producto: x.producto, cantidad: x.cantidad, unidad: x.unidad, lote_insumo: x.lote_insumo, vasija: x.vasija, observaciones: x.observaciones}, {encolable: true}); if (r.pendiente) throw new Error('Quedó pendiente de sincronizar.'); }, 'Ejecución registrada.')},
        h('h3', {}, 'Confirmar ejecución'), h('div', {class: 'v7-campos'}, campo('Fecha y hora real de ejecución', 'fecha_real', {type: 'datetime-local', value: ahoraLocal(), required: true}), campo('Producto utilizado', 'producto', {value: o.datos.producto || ''}), campo('Cantidad utilizada', 'cantidad', {num: 1, value: o.datos.cantidad || ''}), campo('Unidad', 'unidad', {value: o.datos.unidad || 'L'}), campo('Lote de insumo', 'lote_insumo'), campo('Vasija', 'vasija', {value: o.vasija}), campo('¿Quedó completa?', 'completa', {tipo: 'select', opciones: ['si', 'parcial']})),
        campo('Observaciones', 'observaciones', {tipo: 'textarea'}), h('button', {class: 'ci-btn primario grande'}, 'Confirmar ejecución'));
      f.dataset.op = uuid();
      partes.push(o.estado === 'emitida' ? h('button', {class: 'ci-btn', type: 'button', onclick: act(() => api(`/ot/${o.id}/iniciar`, {op: uuid()}), 'Orden iniciada.')}, 'Indicar inicio') : null, f,
        h('button', {class: 'ci-btn', type: 'button', onclick: act(async () => { const t = prompt('Describí la incidencia'); if (!t) throw new Error('Sin texto: no se registró.'); await api(`/ot/${o.id}/incidencia`, {op: uuid(), texto: t}); }, 'Incidencia registrada.')}, 'Registrar incidencia'));
    }
    if (P.tecnico && ['borrador', 'aprobada', 'programada', 'emitida', 'en_ejecucion', 'parcial'].includes(o.estado)) {
      const f = h('form', {class: 'v7-form', onsubmit: act(async () => { const x = valores(f); await api(`/ot/${o.id}/${o.estado === 'borrador' ? 'aprobar' : 'editar'}`, {version: o.version, datos: x, motivo: x.motivo}); }, o.estado === 'borrador' ? 'Receta aprobada.' : 'OT modificada: quedó registrada la versión anterior.')},
        h('h3', {}, o.estado === 'borrador' ? 'Aprobar receta' : 'Modificar datos aprobados'), h('div', {class: 'v7-campos'}, ...['producto', 'dosis', 'unidad_dosis', 'cantidad', 'unidad', 'responsable'].map(k => campo(k.replace('_', ' '), k, {value: o.datos[k] || ''})), campo('Instrucciones', 'instrucciones', {value: o.datos.instrucciones || ''})),
        o.estado !== 'borrador' ? campo('Motivo del cambio *', 'motivo', {required: true}) : null, h('button', {class: 'ci-btn primario'}, o.estado === 'borrador' ? 'Aprobar' : 'Guardar nueva versión'));
      partes.push(f, h('button', {class: 'ci-btn peligro', type: 'button', onclick: act(async () => { const m = prompt('Motivo de la cancelación'); if (!m) throw new Error('Sin motivo: no se canceló.'); await api(`/ot/${o.id}/cancelar`, {motivo: m}); }, 'OT cancelada.')}, 'Cancelar OT'));
    }
    if (P.tecnico && o.estado === 'ejecutada' && o.tipo === 'siembra') partes.push(h('button', {class: 'ci-btn', type: 'button', onclick: act(async () => { const f = prompt('Nueva fecha y hora real (AAAA-MM-DDTHH:MM)'); const m = f && prompt('Motivo'); if (!f || !m) throw new Error('Sin cambios.'); await api(`/ot/${o.id}/corregir-ejecucion`, {fecha_real: f, motivo: m}); }, 'Ejecución corregida; los nutrientes se reprogramaron si correspondía.')}, 'Corregir hora de ejecución'));
    partes.push(h('h4', {}, 'Trazabilidad'), h('ul', {class: 'v7-mini'}, ...d.eventos.map(e => h('li', {}, `${fechaHora(e.fecha)} · v${e.version} · ${e.evento.replace(/_/g, ' ')} · ${e.autor}`))));
    cuerpo.replaceChildren(...partes.filter(Boolean)); dlg.showModal();
  }

  // ---------- control ----------
  function vistaControl() {
    const regs = deV(L.registros).filter(x => !x.anulado);
    const f = h('form', {class: 'v7-form', onsubmit: accion(() => { const x = valores(f), datos = {}; for (const k of ['brix', 'temperatura', 'az_gl', 'ph', 'az_red', 'av']) if (x[k] !== '') datos[k] = Number(String(x[k]).replace(',', '.')); if (x.operacion) { datos.operacion = x.operacion; datos.tiempo = x.tiempo; } return enviar('/registros', {op: uuid(), periodo_id: L.ing.periodo_id, vasija: x.vasija || vasija, tipo: 'control', fecha_muestra: x.fecha, datos, responsable: x.responsable, observaciones: x.observaciones}, {encolable: true}); }, 'Control guardado.')},
      h('h3', {}, 'Carga de control'), h('div', {class: 'v7-campos'}, campo('Fecha y hora de medición', 'fecha', {type: 'datetime-local', value: ahoraLocal(), required: true}), campo('Vasija', 'vasija', {value: vasija, required: true}), campo('Brix', 'brix', {num: 1}), campo('Temperatura (°C)', 'temperatura', {num: 1}), campo('Azúcar (g/L)', 'az_gl', {num: 1}), campo('pH', 'ph', {num: 1}), campo('Az. red.', 'az_red', {num: 1}), campo('AV', 'av', {num: 1}),
        h('label', {class: 'v7-campo'}, 'Operación', h('select', {name: 'operacion'}, h('option', {value: ''}, '—'), ...OPERACIONES.map(o => h('option', {}, o)))), campo('Tiempo (min)', 'tiempo', {num: 1}), campo('Responsable', 'responsable', {value: ciw.nombre || ''})),
      campo('Observaciones', 'observaciones', {tipo: 'textarea'}), h('button', {class: 'ci-btn primario grande'}, 'Guardar control'));
    const desde = h('input', {type: 'date'}), graf = h('div', {}), tabla = h('div', {class: 'v6-tabla-w'});
    const pintar = () => {
      const pts = regs.filter(x => !desde.value || x.fecha_muestra.slice(0, 10) >= desde.value).map(x => { const d = typeof x.datos === 'string' ? JSON.parse(x.datos) : x.datos; return {fecha: x.fecha_muestra.slice(0, 10), brix: d.brix ?? null, temperatura: d.temperatura ?? null, x, d}; });
      graf.innerHTML = graficoSVG(pts);
      const t = h('table', {class: 'v6-tabla'}, h('tr', {}, ...['Medición', 'Carga', 'Tipo', 'Brix', '°C', 'Otros', 'Autor'].map(c => h('th', {}, c))),
        ...pts.map(p => h('tr', {}, h('td', {}, fechaHora(p.x.fecha_muestra)), h('td', {}, fechaHora(p.x.registrado)), h('td', {}, p.x.tipo.replace('_', ' ')), h('td', {}, p.d.brix ?? ''), h('td', {}, p.d.temperatura ?? ''), h('td', {}, Object.entries(p.d).filter(([k]) => !['brix', 'temperatura'].includes(k)).map(([k, v]) => k + ': ' + v).join(' · ')), h('td', {}, p.x.autor + (p.x.version > 1 ? ` (v${p.x.version})` : '')))));
      tabla.replaceChildren(t);
    };
    desde.oninput = pintar; pintar();
    const ag = deV(L.ots).filter(o => ['th2', 'siembra', 'nutrientes', 'agregado'].includes(o.tipo));
    return [f, h('h3', {}, `Historial y gráfico · vasija ${vasija}`), h('label', {class: 'v7-campo'}, 'Desde', desde), graf, tabla,
      h('h3', {}, 'Agregados'), h('div', {class: 'v7-dos'},
        h('div', {}, h('h4', {}, 'Ejecutados'), h('ul', {}, ...ag.filter(o => o.estado === 'ejecutada').map(o => h('li', {}, `${fechaHora(o.ejecucion?.fecha_real)} · ${o.ejecucion?.producto} ${o.ejecucion?.cantidad ?? ''} ${o.ejecucion?.unidad || ''} · OT ${o.numero}`)))),
        h('div', {}, h('h4', {}, 'Solo planificados'), h('ul', {}, ...ag.filter(o => o.estado !== 'ejecutada' && o.estado !== 'cancelada').map(o => h('li', {}, `${o.datos.producto || TIPO_OT[o.tipo]} ${o.datos.cantidad || ''} ${o.datos.unidad || ''} · OT ${o.numero} · ${ESTADO_OT[o.estado]}`))))),
      P.tecnico ? formOT('agregado', 'Planificar agregado (OT)') : null];
  }

  // ---------- movimientos ----------
  function formOT(tipo, titulo) {
    const mov = tipo !== 'agregado';
    const f = h('form', {class: 'v7-form', onsubmit: accion(() => { const x = valores(f); return enviar('/tecnico/ot', {op: uuid(), periodo_id: L.ing.periodo_id, vasija, tipo: x.tipo || tipo, datos: {...x, total: x.total === 'on'}}); }, 'OT emitida y enviada a la cola de impresión.')},
      h('h3', {}, titulo), h('div', {class: 'v7-campos'},
        tipo === 'descube' ? campo('Tipo', 'tipo', {tipo: 'select', opciones: ['descube', 'desvinado']}) : null,
        tipo === 'descube' ? campo('Tipo de vinificación', 'tipo_vinificacion', {ph: 'Ej. tinto, rosado'}) : null,
        mov ? campo('Origen', 'origen', {value: vasija}) : null, mov ? campo('Destino *', 'destino', {required: true}) : null,
        tipo === 'movimiento' ? campo('Tipo de movimiento', 'tipo_mov', {tipo: 'select', opciones: ['trasiego', 'división', 'unión', 'corte', 'bajada a barricas']}) : null,
        mov ? campo('Fecha y hora prevista', 'fecha', {type: 'datetime-local', value: ahoraLocal()}) : campo('Producto', 'producto'),
        !mov ? campo('Dosis', 'dosis', {num: 1}) : null, !mov ? campo('Unidad de dosis', 'unidad_dosis', {tipo: 'select', opciones: ['g/hL', 'g/L', 'mL/hL']}) : null,
        campo(mov ? 'Litros' : 'Cantidad total', 'cantidad', {num: 1}), campo('Unidad', 'unidad', {tipo: 'select', opciones: mov ? ['L', 'kg'] : ['g', 'kg', 'mL', 'L']}),
        !mov ? campo('Lote de insumo', 'lote_insumo') : null, campo('Responsable *', 'responsable', {required: true}), campo('Instrucciones *', 'instrucciones', {tipo: 'textarea'})),
      mov ? h('label', {class: 'v7-check'}, h('input', {type: 'checkbox', name: 'total'}), ' Se vacía la vasija de origen') : null,
      h('button', {class: 'ci-btn primario'}, 'Emitir OT'));
    return f;
  }
  function vistaMovs() {
    const fila = m => h('tr', {}, h('td', {}, fechaHora(m.fecha)), h('td', {}, m.tipo), h('td', {}, m.origen), h('td', {}, m.destino), h('td', {}, `${m.cantidad_real ?? m.cantidad ?? ''} ${m.unidad}`), h('td', {}, m.estado === 'ejecutado' ? `Ejecutado ${fechaHora(m.ejecutado_en)} · ${m.ejecutado_por}` : m.estado), h('td', {}, L.ots.find(o => o.id === m.ot_id)?.numero || ''));
    return [P.tecnico ? formOT('movimiento', 'Solicitar movimiento') : h('p', {class: 'muted'}, 'Los movimientos los solicita el técnico; el operario los ejecuta desde la OT.'),
      h('h3', {}, 'Movimientos del lote'), h('p', {class: 'muted'}, 'La ubicación del lote cambia solo cuando el movimiento se confirma como ejecutado.'),
      h('div', {class: 'v6-tabla-w'}, h('table', {class: 'v6-tabla'}, h('tr', {}, ...['Fecha', 'Tipo', 'Origen', 'Destino', 'Cantidad', 'Estado', 'OT'].map(c => h('th', {}, c))), ...L.movs.map(fila)))];
  }

  // ---------- fin FA ----------
  function vistaFinFA() {
    const v = V(); if (!v) return [h('p', {}, 'Primero cargá el análisis inicial.')];
    const regs = deV(L.registros).filter(x => !x.anulado && (typeof x.datos === 'string' ? JSON.parse(x.datos) : x.datos).az_red !== undefined);
    const confirmado = deV(L.decisiones).some(d => d.tipo === 'fin_fa'), ev = v.fin_fa;
    const sel = h('select', {name: 'registro_id'}, ...regs.reverse().map(x => { const d = typeof x.datos === 'string' ? JSON.parse(x.datos) : x.datos; return h('option', {value: x.id}, `Az. Red. ${d.az_red} · ${fechaHora(x.fecha_muestra)}`); }));
    const carga = h('form', {class: 'v7-form', onsubmit: accion(() => { const x = valores(carga); return enviar('/registros', {op: uuid(), periodo_id: L.ing.periodo_id, vasija, tipo: 'fin_fa', fecha_muestra: x.fecha, datos: {az_red: Number(String(x.az_red).replace(',', '.'))}, responsable: x.responsable}, {encolable: true}); }, 'Análisis guardado.')},
      h('h4', {}, 'Cargar análisis de azúcares reductores'), h('div', {class: 'v7-campos'}, campo('Fecha y hora de muestreo', 'fecha', {type: 'datetime-local', value: ahoraLocal(), required: true}), campo(`Az. Red. (${L.criterio?.fin_fa?.unidad || ''})`, 'az_red', {num: 1, required: true}), campo('Responsable', 'responsable', {value: ciw.nombre || ''})), h('button', {class: 'ci-btn'}, 'Guardar análisis'));
    const tarjeta = h('article', {class: 'v7-card'}, h('h3', {}, 'Evaluación fin de fermentación alcohólica'), h('p', {}, chip(ev.estado, ev.texto)),
      h('p', {class: 'muted'}, `Regla: ${ev.parametro} < ${ev.limite} ${ev.unidad} (estricto: ${ev.limite} no cumple) · ${ev.regla === 'provisoria' ? 'REGLA PROVISORIA: falta confirmar denominación y unidad antes de usarla en producción' : ''} · criterio ${ev.criterio_version || '—'}`),
      confirmado ? h('p', {class: 'v7-ok'}, 'Fin de FA confirmado por el técnico.') : P.tecnico && regs.length ? h('form', {onsubmit: accion(() => api('/tecnico/fin-fa', {op: uuid(), periodo_id: L.ing.periodo_id, vasija, registro_id: sel.value}), 'Fin de FA confirmado.')}, h('label', {class: 'v7-campo'}, 'Análisis a evaluar', sel), h('button', {class: 'ci-btn primario'}, 'Confirmar fin de FA')) : null,
      ev.estado === 'rojo' ? h('p', {class: 'v7-bloq'}, 'No cumple: seguir con el seguimiento de fermentación.') : null);
    return [tarjeta, carga, confirmado && P.tecnico ? formOT('descube', 'OT de descube o desvinado') : null, confirmado ? h('p', {}, 'FML y crianza: seguí el lote en el módulo ', h('a', {href: '/lotes/'}, 'Lotes'), ' (Tablero FML).') : null];
  }

  return {abrir, cerrar() { L = null; raiz.hidden = true; raiz.replaceChildren(); }, abrirOT, irA(tab) { pestana = tab; render(); }};
}

/** Vista "Mis órdenes": OT pendientes para operarios (tablet). */
export async function misOrdenes({api, panel, avisar}) {
  const cont = $('mis-ordenes'), d = await api('/mis-ordenes');
  const grupos = [['Para hacer ahora', o => ['emitida', 'en_ejecucion', 'parcial'].includes(o.estado)], ['Programadas', o => o.estado === 'programada'], ['Bloqueadas (falta aprobación)', o => o.estado === 'borrador']];
  cont.replaceChildren(...[h('h2', {class: 'v6-h2'}, 'Órdenes pendientes'), h('p', {class: 'muted'}, d.permisos.operario ? 'Tocá una orden para ver instrucciones, indicar inicio, registrar incidencias o confirmar la ejecución.' : 'Podés consultar las órdenes. Para ejecutarlas necesitás permiso de operario.'),
    ...grupos.map(([t, f]) => { const xs = d.ordenes.filter(f); return xs.length ? h('section', {}, h('h3', {}, `${t} (${xs.length})`), h('div', {class: 'v7-grid'}, ...xs.map(o => h('button', {class: 'v3-card v7-ot', type: 'button', 'data-estado': o.estado, onclick: () => panel.abrirOT(o.id).catch(e => avisar(e.message, true))},
      h('strong', {}, `OT ${o.numero} · ${TIPO_OT[o.tipo]}`), h('small', {}, `Lote ${o.lote} · ${o.variedad} · vasija ${o.vasija}${o.demo ? ' · DEMOSTRACIÓN' : ''}`), h('small', {}, ESTADO_OT[o.estado] + (o.programada_para ? ` · ${fechaHora(o.programada_para)} (${restante(o.programada_para)})` : '')))))) : null; }),
    d.ordenes.length ? null : h('p', {class: 'v6-vacio'}, 'No hay órdenes pendientes.')].filter(Boolean));
}

/** Panel de administración: permisos de técnico/operario e impresoras. */
export async function administrar({api, avisar}) {
  const cont = $('admin-vendimia'), [p, imp, cola] = await Promise.all([api('/permisos'), api('/impresoras'), api('/impresion')]);
  const fila = u => h('tr', {}, h('td', {}, u.nombre || u.email), h('td', {}, u.rol || '—'), ...['tecnico', 'operario'].map(k => h('td', {}, h('input', {type: 'checkbox', checked: u[k] === 1 || u.rol === 'admin', disabled: u.rol === 'admin', onchange: async e => { try { await api('/permisos', {email: u.email, tecnico: k === 'tecnico' ? e.target.checked : u.tecnico === 1, operario: k === 'operario' ? e.target.checked : u.operario === 1}); u[k] = e.target.checked ? 1 : 0; avisar('Permiso guardado.'); } catch (err) { avisar(err.message, true); } }}))));
  const f = h('form', {class: 'v7-form', onsubmit: async e => { e.preventDefault(); const x = Object.fromEntries(new FormData(f)); try { await api('/impresoras', {...x, activa: x.activa === 'on', automatico: x.automatico === 'on'}); avisar('Impresora guardada.'); administrar({api, avisar}); } catch (err) { avisar(err.message, true); } }},
    h('h3', {}, 'Agregar impresora de red'), h('div', {class: 'v7-campos'}, ...[['Nombre', 'nombre'], ['IP', 'ip'], ['Puerto', 'puerto'], ['Papel', 'papel'], ['Copias', 'copias']].map(([l, n]) => h('label', {class: 'v7-campo'}, l, h('input', {name: n}))), h('label', {class: 'v7-campo'}, 'Protocolo', h('select', {name: 'protocolo'}, h('option', {value: 'raw9100'}, 'RAW 9100'), h('option', {value: 'ipp'}, 'IPP')))),
    h('label', {class: 'v7-check'}, h('input', {type: 'checkbox', name: 'activa'}), ' Activa'), h('label', {class: 'v7-check'}, h('input', {type: 'checkbox', name: 'automatico'}), ' Impresión automática'), h('button', {class: 'ci-btn primario'}, 'Guardar'));
  cont.replaceChildren(h('h2', {class: 'v6-h2'}, 'Permisos e impresión'),
    h('div', {class: 'v6-tabla-w'}, h('table', {class: 'v6-tabla'}, h('tr', {}, ...['Usuario', 'Rol en Vendimia', 'Técnico', 'Operario'].map(c => h('th', {}, c))), ...p.usuarios.map(fila))),
    h('p', {class: 'muted'}, 'Técnico: aprueba criterios, OT y fin de FA. Operario: ejecuta órdenes. Un operario no puede aprobar. Los editores ejecutan órdenes por defecto.'),
    h('h3', {}, 'Impresoras'), h('p', {class: imp.agente ? 'v7-ok' : 'v7-bloq'}, imp.agente ? 'Agente de impresión habilitado (token configurado).' : 'Falta configurar el agente local de impresión (secreto IMPRESION_TOKEN). Mientras tanto las OT quedan en cola y se imprimen con “Imprimir”.'),
    h('ul', {}, ...imp.impresoras.map(i => h('li', {}, `${i.nombre} · ${i.ip}:${i.puerto} · ${i.protocolo} · ${i.activa ? 'activa' : 'INACTIVA'} · ${i.automatico ? 'automática' : 'manual'}`))), f,
    h('h3', {}, 'Cola de impresión'), h('ul', {class: 'v7-mini'}, ...cola.trabajos.map(t => h('li', {}, `${fechaHora(t.creado)} · OT ${t.numero} v${t.version}${t.reimpresion ? ' (reimpresión)' : ''} · ${ESTADO_IMP[t.estado]}${t.error ? ' · ' + t.error : ''}`))));
}
