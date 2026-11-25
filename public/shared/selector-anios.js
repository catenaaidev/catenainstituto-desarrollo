/* ===== CIW — selector de años (estado + botones) =====
 * Botones 2025 | 2026 que se prenden y apagan por separado y mandan en toda la
 * página. La regla del año vive en anios.js; acá solo la selección, su
 * recuerdo en el navegador y el pintado. Cada módulo crea el suyo con su
 * clave de localStorage y su evento (Lotes: 'lotes_anios' /
 * 'lotes:anios-cambiados'; Prensas: 'prensas_anios' / 'prensas:anios-cambiados'). */
'use strict';
import { aniosDisponibles, seleccionInicial, alternarAnio, loteVisible,
         otVisible, claveAnios, claveParaPrefetch } from './anios.js';

export function crearSelectorAnios({ claveLS, idContenedor, evento }){
  // La explícita (claveLS) manda; la _ultima es respaldo para adelantar pedidos.
  const claveUltima = claveLS + '_ultima';
  let _sel = null;          // null = todavía no se montó: no se filtra nada
  let _disponibles = [];

  const leer = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch(e) { return null; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} };

  function aniosActivos(){ return _sel; }
  function visible(lote){ return loteVisible(lote, _sel); }
  function otVisibleAhora(ot){ return otVisible(ot, _sel); }
  function queryAnios(){
    if (_sel !== null) return claveAnios(_sel);
    return claveParaPrefetch(leer(claveLS), leer(claveUltima));
  }
  function pintar(){
    const cont = document.getElementById(idContenedor);
    if (!cont) return;
    cont.hidden = _disponibles.length < 2;   // con un solo año no hay nada que elegir
    cont.innerHTML = _disponibles.map(a =>
      `<button type="button" data-anio="${a}" aria-pressed="${_sel.includes(a)}"`
      + ` title="Mostrar u ocultar los lotes ${a}">${a}</button>`).join('');
  }
  const avisar = () => document.dispatchEvent(new CustomEvent(evento));

  /* Se llama después de cargar los datos (y otra vez si se recargan). */
  function montar(lotes){
    const antes = queryAnios();
    _disponibles = aniosDisponibles(lotes);
    _sel = seleccionInicial(_sel || leer(claveLS), _disponibles);
    escribir(claveUltima, _sel);
    pintar();
    const cont = document.getElementById(idContenedor);
    if (cont && !cont._escuchando){
      cont._escuchando = true;
      cont.addEventListener('click', e => {
        const b = e.target.closest('button[data-anio]');
        if (!b) return;
        const nueva = alternarAnio(_sel, Number(b.dataset.anio));
        if (claveAnios(nueva) === claveAnios(_sel)) return;   // era el último prendido
        _sel = nueva;
        escribir(claveLS, _sel); escribir(claveUltima, _sel);
        pintar();
        avisar();
      });
    }
    if (claveAnios(_sel) !== antes) avisar();
  }

  return { aniosActivos, visible, otVisibleAhora, queryAnios, montar };
}
