/* ===== Lotes CIW — numero y PDF de una orden contra la carpeta de OneDrive =====
 *
 * El paso comun de las cinco ordenes (OT de movimientos, muestras,
 * microbiologia, correccion de SO2 y agregados): proponer el numero leyendo la
 * carpeta, y al imprimir guardar el PDF en ella. Ver
 * docs/superpowers/specs/2026-10-13-ot-carpeta-onedrive-design.md. */
'use strict';

import { entornoOT } from './entorno-ot.js';
import { avisar, informar, confirmar } from './dialogos.js';
import { siguienteNumero, maximoSerie, numeroUsado, nombreArchivo, pareceCarpetaOT,
         normalizarNumero, nombreConNumero, numeroDeNombre, unirNumeros } from './numero-ot.js';
import { estado, elegirCarpeta, pedirPermiso, listarSerie, listarRaiz, ultimoVisto, escribirPdf,
         recordarNumero } from './carpeta-ot.js';
import { pdfDeHojas, descargar, ajustarHojasA4, soltarHojasA4 } from './hoja-pdf.js';

const $ = id => document.getElementById(id);
const esc  = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escA = v => String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const mostrarOverlay = html => entornoOT().mostrarOverlay(html);
const cerrarOverlay = () => entornoOT().cerrarOverlay();
/* Lo que ya numero esta web, mas lo que numero el otro modulo (Lotes / Prensas
 * comparten la serie de la carpeta): sin conexion o con error sigue solo con
 * lo local, no frena. */
async function _remotos(serie){
  try {
    const r = await fetch('/ordenes/api/numeros?serie=' + encodeURIComponent(serie), { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.numeros) ? j.numeros : [];
  } catch (_) { return []; }
}
const _web = async serie => { const e = entornoOT(); return unirNumeros(e.numerosWeb(e.datos(), serie), await _remotos(serie)); };

export async function proponerNumero(serie){
  const nombres = await listarSerie(serie);
  const max = nombres ? maximoSerie(nombres, serie) : null;
  return {
    numero: siguienteNumero({ nombres, web: await _web(serie), ultimoVisto: ultimoVisto(serie) }, serie),
    ultimo: max ? max.nombre : null,
    conCarpeta: !!nombres,
  };
}

export function chipCarpeta(serie){
  return `<span class="ot-carpeta" data-serie="${escA(serie)}" style="font-size:12px;color:var(--muted)">📁 …</span>`;
}

async function _textoChip(serie){
  const e = await estado();
  if (e.tipo === 'no-soportado') return { txt: '⚠ Este navegador no guarda en la carpeta (usá Chrome o Edge): revisá el número a mano', accion: null };
  if (e.tipo === 'sin') return { txt: '⚠ Sin carpeta: revisá el número a mano · 📁 Conectar carpeta de OT', accion: 'elegir' };
  if (e.tipo === 'permiso') return { txt: '📁 ' + e.nombre + ' · Dar permiso', accion: 'permiso', cambiar: true };
  const p = await proponerNumero(serie);
  return { txt: '📁 ' + e.nombre + (p.ultimo ? ' · última: ' + p.ultimo : ' · sin órdenes todavía'), accion: null, cambiar: true };
}

export function cablearChipsCarpeta(raiz, alCambiar){
  for (const chip of raiz.querySelectorAll('.ot-carpeta')){
    const serie = chip.dataset.serie;
    const pintar = async () => {
      const t = await _textoChip(serie);
      chip.innerHTML = (t.accion ? `<a href="#" data-accion="${t.accion}">${esc(t.txt)}</a>` : esc(t.txt))
        + (t.cambiar ? ' · <a href="#" data-accion="elegir">cambiar</a>' : '');
    };
    chip.addEventListener('click', async ev => {
      const a = ev.target.closest('[data-accion]');
      if (!a) return;
      ev.preventDefault();
      const ok = a.dataset.accion === 'elegir' ? await elegirCarpeta() : await pedirPermiso();
      if (ok && a.dataset.accion === 'elegir'){
        const raizNombres = await listarRaiz();
        if (raizNombres && !pareceCarpetaOT(raizNombres))
          await informar({ titulo: 'Esa carpeta no parece la de OT', texto: 'No tiene «B Ordenes de agregados». ¿Es «Ordenes de Trabajo 2026»? Si no, volvé a elegirla.' });
      }
      await pintar();
      if (ok && alCambiar) alCambiar();
    });
    pintar();
  }
}

// La OT de movimientos y la Orden de correccion salen con cada hoja en UNA A4
// (hoja-pdf.js): si una hoja no entra, se achica lo justo.
const UNA_A4 = new Set(['printing-ot-mov', 'printing-ordencorr']);
// La hoja de la Orden de correccion en pantalla es mas alta que la impresa
// (bandas de cada lote, campos con borde): se mide con las reglas de impresion.
const MEDIR_IMPRESA = new Set(['printing-ordencorr']);

function _imprimir(claseBody, contenedor){
  const ajustar = UNA_A4.has(claseBody) && contenedor;
  if (ajustar) ajustarHojasA4(contenedor, MEDIR_IMPRESA.has(claseBody) ? claseBody : null);
  document.body.classList.add(claseBody);
  window.print();
  document.body.classList.remove(claseBody);
  if (ajustar) soltarHojasA4(contenedor);
}

/* Devuelve { ok, numero, guardado, nombre } con el numero normalizado ("939"
 * -> "0939") para que la vista lo escriba en su campo; o { ok: false,
 * numeroLibre }. guardado: 'carpeta' (escrito y visto al releer la carpeta),
 * 'sin-verificar' (escrito pero no aparece al releer), 'descargado' o 'papel'
 * (Solo imprimir).
 *
 * `renumerar(libre)`: solo con numeroFijo (una OT ya emitida). Si el numero ya
 * esta en la carpeta, ofrece pasar la orden al siguiente libre; la vista la
 * renumera y guarda, y devuelve true para seguir imprimiendo con ese. */
export async function imprimirYGuardar({ claseBody, contenedor, serie, numero, titulo, numeroFijo = false, antes, renumerar }){
  numero = normalizarNumero(numero || '', serie);
  if (!numero){ avisar('Falta el N° de orden.', { tipo: 'mal' }); return { ok: false }; }

  // Re-chequeo contra la carpeta justo antes de imprimir.
  const nombres = await listarSerie(serie);
  const usado = nombres ? numeroUsado(nombres, numero, serie) : null;
  let nombre0 = nombreArchivo(numero, titulo);
  if (usado && usado !== nombre0 && numeroFijo && renumerar){
    const libre = siguienteNumero({ nombres, web: await _web(serie), ultimoVisto: ultimoVisto(serie) }, serie);
    const pasar = await confirmar({ titulo: 'Ese número ya está en la carpeta',
      texto: 'El N° ' + numero + ' ya lo usa «' + usado + '» (seguramente OneDrive no lo había bajado cuando se emitió esta orden). ¿Pasar esta orden a la ' + libre + '? Cambia el número en la orden, sus movimientos y el papel.',
      si: 'Pasar a la ' + libre, no: 'No' });
    if (pasar && await renumerar(libre)) return imprimirYGuardar({ claseBody, contenedor, serie, numero: libre, titulo, numeroFijo, antes, renumerar });
  }
  if (usado && usado !== nombre0){
    if (!numeroFijo){
      const libre = siguienteNumero({ nombres, web: await _web(serie), ultimoVisto: ultimoVisto(serie) }, serie);
      await informar({ titulo: 'Ese número ya está en la carpeta', texto: 'El N° ' + numero + ' ya está: «' + usado + '».\nTe propongo el ' + libre + '. Revisalo y volvé a imprimir.' });
      return { ok: false, numeroLibre: libre };
    }
    if (!await confirmar({ titulo: 'Número repetido en la carpeta', texto: 'Ya hay otro archivo con el N° ' + numero + ': «' + usado + '».', si: 'Guardar igual', no: 'Cancelar' }))
      return { ok: false };
  }

  return new Promise(fin => {
    mostrarOverlay(`
<h3 style="margin:0 0 14px">Imprimir y guardar ${esc(numero)}</h3>
<div style="margin-bottom:8px">${chipCarpeta(serie)}</div>
<label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px">Nombre del PDF</label>
<input class="txt" id="ogNombre" style="width:100%" value="${escA(nombre0)}">
<div id="ogMsg" style="margin-top:8px"></div>
<div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end">
  <button class="btn" id="ogCancelar">Cancelar</button>
  <button class="btn" id="ogSolo">Solo imprimir</button>
  <button class="btn primary" id="ogGuardar">🖨 Imprimir y guardar PDF</button>
</div>`);
    cablearChipsCarpeta(document.getElementById('ogMsg').parentElement);
    $('ogCancelar').addEventListener('click', () => { cerrarOverlay(); fin({ ok: false }); });
    $('ogSolo').addEventListener('click', () => {
      cerrarOverlay(); if (antes) antes(); _imprimir(claseBody, contenedor); fin({ ok: true, numero, guardado: 'papel', nombre: '' });
    });
    $('ogGuardar').addEventListener('click', async () => {
      // El nombre siempre empieza con el numero: si no, la carpeta no lo reserva.
      const n = numeroDeNombre(numero, serie);
      const nombre = n != null ? nombreConNumero($('ogNombre').value, numero, serie)
                               : (nombreArchivo('', $('ogNombre').value).replace(/^\s*/, '') || nombre0);
      $('ogMsg').innerHTML = '<div class="msg">Armando el PDF…</div>';
      let guardado = 'descargado';
      try {
        if (antes) antes();
        const blob = await pdfDeHojas(contenedor, claseBody, { unaPorPagina: UNA_A4.has(claseBody) });
        const r = await escribirPdf(serie, nombre, blob);
        if (r === 'existe'){
          $('ogMsg').innerHTML = '<div class="msg err">Ya hay un archivo «' + esc(nombre) + '» en la carpeta: no se pisa. Cambiá el nombre o usá «Solo imprimir».</div>';
          return;
        }
        if (r === 'ok'){
          // Releer la carpeta: que el archivo este de verdad (check de la OT).
          const despues = await listarSerie(serie);
          guardado = despues && despues.includes(nombre) ? 'carpeta' : 'sin-verificar';
        } else if (r === 'sin-carpeta'){
          descargar(blob, nombre);
          await informar({ titulo: 'El PDF se descargó', texto: 'No hay carpeta de OT elegida. Copiá el PDF a la carpeta y revisá el número a mano.' });
        } else if (r === 'error'){
          descargar(blob, nombre);
          await informar({ titulo: 'No se pudo escribir en la carpeta', texto: '¿Falta permiso? El PDF se descargó: copialo a mano.' });
        }
        // Sin carpeta el numero no queda en ningun lado: que el proximo no lo repita.
        if (n != null) recordarNumero(serie, n);
      } catch (e){
        $('ogMsg').innerHTML = '<div class="msg err">No se pudo armar el PDF: ' + esc(e.message) + '. Podés usar «Solo imprimir».</div>';
        return;
      }
      cerrarOverlay();
      _imprimir(claseBody, contenedor);
      if (guardado === 'sin-verificar')
        await informar({ titulo: 'Revisá la carpeta', texto: 'Se escribió «' + nombre + '» pero al releer la carpeta no aparece. Fijate que esté antes de dar la orden por guardada.' });
      fin({ ok: true, numero, guardado, nombre });
    });
  });
}
