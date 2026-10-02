/* ===== Lotes CIW — selector de años (estado + botones) =====
 * Los botones 2025 | 2026 de la barra de pestañas. Se prenden y apagan por
 * separado y mandan en toda la web. La regla del año vive en anios.js; aca solo
 * la seleccion, su recuerdo en el navegador y el pintado.
 *
 * No importa nucleo.js: nucleo lo importa a el (cargarDashboard necesita la
 * clave) y un import de vuelta cerraria el ciclo. Avisa los cambios con el
 * evento 'lotes:anios-cambiados' y app.js hace el resto. */
'use strict';
import { aniosDisponibles, seleccionInicial, alternarAnio, loteVisible,
         otVisible, claveAnios } from './anios.js';

const CLAVE_LS = 'lotes_anios';
let _sel = null;          // null = todavia no se monto: no se filtra nada
let _disponibles = [];

function _leerGuardada(){
  try { return JSON.parse(localStorage.getItem(CLAVE_LS) || 'null'); } catch(e) { return null; }
}
function _guardar(){
  try { localStorage.setItem(CLAVE_LS, JSON.stringify(_sel)); } catch(e) {}
}
function _esArrayDeAnios(v){ return Array.isArray(v) && v.every(Number.isInteger); }

export function aniosActivos(){ return _sel; }
export function visible(lote){ return loteVisible(lote, _sel); }
export function otVisibleAhora(ot){ return otVisible(ot, _sel); }

/* Antes de montar (_sel===null) no hay filtro client-side (aniosActivos()
 * sigue devolviendo null, visible() sigue devolviendo true): pero para no
 * pedir el dashboard entero en el arranque y volver a pedirlo filtrado apenas
 * se monta, esta funcion sí adelanta la clave guardada en localStorage, si es
 * una seleccion valida. */
export function queryAnios(){
  if (_sel !== null) return claveAnios(_sel);
  const g = _leerGuardada();
  return _esArrayDeAnios(g) ? claveAnios(g) : '';
}

function _pintar(){
  const cont = document.getElementById('selAnios');
  if (!cont) return;
  /* Con un solo año no hay nada que elegir: no se muestra. */
  cont.hidden = _disponibles.length < 2;
  cont.innerHTML = _disponibles.map(a =>
    `<button type="button" data-anio="${a}" aria-pressed="${_sel.includes(a)}"`
    + ` title="Mostrar u ocultar los lotes ${a}">${a}</button>`).join('');
}

function _avisar(){ document.dispatchEvent(new CustomEvent('lotes:anios-cambiados')); }

/* Se llama despues de cargar DATOS (y otra vez si se recargan): un lote 27xxx
 * nuevo agrega su boton solo. */
export function montarSelectorAnios(lotes){
  const antes = claveAnios(_sel);
  _disponibles = aniosDisponibles(lotes);
  _sel = seleccionInicial(_sel || _leerGuardada(), _disponibles);
  _pintar();
  const cont = document.getElementById('selAnios');
  if (cont && !cont._escuchando){
    cont._escuchando = true;
    cont.addEventListener('click', e => {
      const b = e.target.closest('button[data-anio]');
      if (!b) return;
      const nueva = alternarAnio(_sel, Number(b.dataset.anio));
      if (claveAnios(nueva) === claveAnios(_sel)) return;   // era el ultimo prendido
      _sel = nueva;
      _guardar();
      _pintar();
      _avisar();
    });
  }
  if (claveAnios(_sel) !== antes) _avisar();
}
