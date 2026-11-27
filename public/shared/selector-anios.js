/* ===== CIW — selector de años (estado + botones) =====
 * Botones 2025 | 2026 que se prenden y apagan por separado y mandan en toda la
 * página. La regla del año vive en anios.js; acá solo la selección, su
 * recuerdo en el navegador y el pintado. Cada módulo crea el suyo con su
 * clave de localStorage y su evento (Lotes: 'lotes_anios' /
 * 'lotes:anios-cambiados'; Prensas: 'prensas_anios' / 'prensas:anios-cambiados'). */
'use strict';
import { aniosDisponibles, seleccionInicial, alternarAnio, loteVisible,
         otVisible, claveAnios, claveParaPrefetch, anioBodega } from './anios.js';

export function crearSelectorAnios({ claveLS, idContenedor, evento }){
  // La explícita (claveLS) manda; la _ultima es respaldo para adelantar pedidos.
  const claveUltima = claveLS + '_ultima';
  let _sel = null;          // null = todavía no se montó: no se filtra nada
  let _disponibles = [];
  let _lotes = [];
  let _explicita = null;

  const leer = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch(e) { return null; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} };

  function aniosActivos(){ return _sel; }
  function visible(lote){ return loteVisible(lote, _sel); }
  function otVisibleAhora(ot){ return otVisible(ot, _sel); }
  function queryAnios(){
    if (_sel !== null) return claveAnios(_sel);
    const guardada = leer(claveLS), ultima = leer(claveUltima);
    return claveParaPrefetch(guardada, Array.isArray(ultima) ? ultima.filter(a => a <= anioBodega()) : null);
  }
  function pintar(){
    const cont = document.getElementById(idContenedor);
    if (!cont) return;
    cont.hidden = _disponibles.length < 2;   // con un solo año no hay nada que elegir
    const visibles = _lotes.filter(l => visible(l?.lote)).length;
    const todos = _disponibles.every(a => _sel.includes(a));
    cont.innerHTML = `<button type="button" data-anios-actual title="Volver a la vendimia actual">Actual</button>`
      + `<button type="button" data-anios-todos aria-pressed="${todos}" title="Mostrar todas las vendimias">Todos</button>`
      + _disponibles.map(a =>
        `<button type="button" data-anio="${a}" aria-pressed="${_sel.includes(a)}"`
        + ` title="Mostrar u ocultar los lotes ${a}">${a}</button>`).join('')
      + `<span style="padding:4px 8px;font-size:11px;white-space:nowrap;align-self:center" title="Conteo por año, antes de otros filtros">${visibles}/${_lotes.length} lotes</span>`;
  }
  const avisar = () => document.dispatchEvent(new CustomEvent(evento));

  /* Se llama después de cargar los datos (y otra vez si se recargan). */
  function montar(lotes){
    const antes = queryAnios();
    _lotes = Array.isArray(lotes) ? lotes : [];
    _disponibles = aniosDisponibles(_lotes);
    if (_sel === null) _explicita = leer(claveLS);
    _sel = seleccionInicial(_explicita, _disponibles);
    escribir(claveUltima, _sel);
    pintar();
    const cont = document.getElementById(idContenedor);
    if (cont && !cont._escuchando){
      cont._escuchando = true;
      cont.addEventListener('click', e => {
        const b = e.target.closest('button[data-anio],button[data-anios-todos],button[data-anios-actual]');
        if (!b) return;
        const actual = b.hasAttribute('data-anios-actual');
        const nueva = actual ? seleccionInicial(null, _disponibles)
          : b.hasAttribute('data-anios-todos') ? [..._disponibles] : alternarAnio(_sel, Number(b.dataset.anio));
        const cambio = claveAnios(nueva) !== claveAnios(_sel);
        _sel = nueva; _explicita = actual ? null : [..._sel];
        escribir(claveLS, _explicita); escribir(claveUltima, _sel);
        pintar();
        if (cambio) avisar();
      });
    }
    if (claveAnios(_sel) !== antes) avisar();
  }

  return { aniosActivos, visible, otVisibleAhora, queryAnios, montar };
}
