/* ===== Mapa de Barriles — avisos y diálogos (Etapa 3 de la estética) =====
 * Puerta única a CI.avisar / CI.informar / CI.confirmar / CI.pedir
 * (public/shared/dialogo.js, lo inyecta el servidor antes que la página). Si
 * por algo no cargó, cae a las ventanitas del navegador: mejor fea que muda.
 * Es el ÚNICO archivo de Barriles que puede llamar a alert/confirm/prompt
 * (test/barriles-sin-ventanas-nativas.test.ts).
 *
 * Script clásico: funciones globales con prefijo dlg (el script principal ya
 * tiene variables locales llamadas `confirmar`).
 *
 * Cuándo usar cada una:
 *  - dlgAvisar: algo que se ve y se va solo (falta un dato, salió bien). NO
 *    toma el foco: la pistola sigue escribiendo en el escáner.
 *  - dlgInformar: una noticia que hay que leer sí o sí (no se guardó, sin cámara).
 *  - dlgConfirmar: una decisión. `si` dice la acción ("Borrar orden"); lo
 *    destructivo con `peligro: true` (el foco arranca en "no": un Enter de la
 *    pistola no confirma).
 *  - dlgPedir: un dato. */
'use strict';

function dlgCI() { return (window.CI && window.CI.confirmar) ? window.CI : null; }
function dlgPlano(op) { return typeof op === 'string' ? op : [op.titulo, op.texto].filter(Boolean).join('\n\n'); }

/** op.tipo: 'ok' | 'mal' | 'info'; op.deshacer: función (agrega el botón Deshacer). */
function dlgAvisar(texto, op) {
  const c = dlgCI();
  if (c) return c.avisar(texto, op || {});
  window.alert(texto);
  return { cerrar() {} };
}

async function dlgInformar(op) {
  const c = dlgCI();
  if (c) return c.informar(op);
  window.alert(dlgPlano(op));
}

async function dlgConfirmar(op) {
  const c = dlgCI();
  if (c) return c.confirmar(op);
  return window.confirm(dlgPlano(op));
}

async function dlgPedir(op) {
  const c = dlgCI();
  if (c) return c.pedir(op);
  const r = window.prompt(dlgPlano(op), (op.campo && op.campo.valor) || '');
  return r == null ? null : r.trim();
}
