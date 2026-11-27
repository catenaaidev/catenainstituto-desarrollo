/* ===== Mapa de Barriles — barra: menú Más, pestaña activa y alto =====
 * Mismo comportamiento que la barra de Prensas (prensas/app.js setupTabs) y la
 * de Lotes (js/barra-lotes.js): los cuatro grupos están dos veces (en la barra
 * y, en pantallas angostas, dentro de Más), así que se marcan todas las copias.
 * Administrar vive en Más: si la pantalla es una de esas, el botón Más se
 * marca y toma su nombre.
 * Script clásico (Barriles no usa módulos): funciones globales con prefijo
 * barra*. Ojo: en Vista3D hay una función local barra(); no se pisa. */
'use strict';

function barraCerrarMas() {
  const menu = document.getElementById('masMenu'), btn = document.getElementById('masBtn');
  if (!menu || !btn) return;
  menu.classList.remove('open');
  btn.setAttribute('aria-expanded', 'false');
}

function barraMontarMas() {
  const menu = document.getElementById('masMenu'), btn = document.getElementById('masBtn');
  if (!menu || !btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const abrir = !menu.classList.contains('open');
    menu.classList.toggle('open', abrir);
    btn.setAttribute('aria-expanded', String(abrir));
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#masWrap')) barraCerrarMas(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('open')) { barraCerrarMas(); btn.focus(); }
  });
  // Elegir algo del menú lo cierra (las pantallas las cablea el script principal).
  menu.addEventListener('click', (e) => { if (e.target.closest('button')) barraCerrarMas(); });
}

/** Marca el grupo y la pantalla. grupo: 'inicio' | 'barriles' | 'mapa' | 'imprimir' | 'admin'. */
function barraMarcar(grupo, sub) {
  document.querySelectorAll('#navProgramador button[data-grupo]').forEach((b) => b.classList.toggle('activo', b.dataset.grupo === grupo));
  document.querySelectorAll('#masMenu button[data-sub]').forEach((b) => b.classList.toggle('activo', b.dataset.sub === sub));
  const btn = document.getElementById('masBtn');
  if (!btn) return;
  const enLaBarra = document.querySelector('#navProgramador > button[data-grupo="' + grupo + '"]');
  const enMas = grupo !== 'admin' && !enLaBarra && document.querySelector('#masMenu > button[data-sub="' + sub + '"]');
  btn.classList.toggle('activo', !!enMas);
  btn.textContent = enMas ? enMas.textContent : 'Más';
}

/** Publica el alto de la barra en --barriles-h (lo usan las barras sticky del modo libre). */
function barraPublicarAlto() {
  const h = document.getElementById('barraBarriles');
  if (!h) return;
  const poner = () => document.documentElement.style.setProperty('--barriles-h', h.offsetHeight + 'px');
  poner();
  if (window.ResizeObserver) new ResizeObserver(poner).observe(h);
}
