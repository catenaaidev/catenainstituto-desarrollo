/* ===== Lotes CIW — barra: menú Más y pestaña activa =====
 * Mismo comportamiento que la barra de Prensas (prensas/app.js setupTabs):
 * las cinco pantallas principales están dos veces (en la barra y, en
 * pantallas angostas, dentro de Más), así que se marcan todas las de la misma
 * pantalla. Si la pantalla vive en Más, el botón Más toma su nombre.
 * Sin imports: nucleo.js lo importa y no puede haber ciclo. */
'use strict';

const $ = id => document.getElementById(id);

export function cerrarMas(){
  const menu = $('masMenu'), btn = $('masBtn');
  if (!menu || !btn) return;
  menu.classList.remove('open');
  btn.setAttribute('aria-expanded', 'false');
}

export function montarMas(){
  const menu = $('masMenu'), btn = $('masBtn');
  if (!menu || !btn) return;
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const abrir = !menu.classList.contains('open');
    menu.classList.toggle('open', abrir);
    btn.setAttribute('aria-expanded', String(abrir));
  });
  document.addEventListener('click', e => { if (!e.target.closest('#masWrap')) cerrarMas(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menu.classList.contains('open')){ cerrarMas(); btn.focus(); }
  });
  // Elegir algo del menú lo cierra (las pantallas las cablea app.js).
  menu.addEventListener('click', e => { if (e.target.closest('button')) cerrarMas(); });
}

/** Marca la pestaña de `boton` (el data-v; Correcciones es 'so2'). */
export function marcarPestana(boton){
  document.querySelectorAll('.tabs button[data-v]').forEach(b => b.classList.toggle('active', b.dataset.v === boton));
  const btn = $('masBtn');
  if (!btn) return;
  const enLaBarra = document.querySelector('.tabs > button[data-v="' + boton + '"]');
  const enMas = boton !== 'config' && !enLaBarra && document.querySelector('#masMenu > button[data-v="' + boton + '"]');
  btn.classList.toggle('active', !!enMas);
  btn.textContent = enMas ? enMas.textContent : 'Más';
}
