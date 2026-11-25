/* ===== Lotes CIW — avisos y diálogos =====
 * Puerta única a CI.avisar / CI.informar / CI.confirmar / CI.pedir
 * (public/shared/dialogo.js, lo inyecta el servidor antes que la app). Si por
 * algo no cargó, cae a las ventanitas del navegador: mejor fea que muda.
 * Es el ÚNICO archivo de Lotes que puede llamar a alert/confirm/prompt
 * (test/lotes-sin-ventanas-nativas.test.ts).
 *
 * Cuándo usar cada una:
 *  - avisar: algo que se ve y se va solo (falta un dato, no hubo nada que hacer).
 *  - informar: una noticia que hay que leer sí o sí (no se guardó, el PDF se descargó).
 *  - confirmar: una decisión. `si` dice la acción ("Eliminar lote"); lo
 *    destructivo con `peligro: true` (el foco arranca en Cancelar).
 *  - pedir: un dato; con `campo.opciones` muestra una lista. */
'use strict';

const ci = () => (window.CI && window.CI.confirmar) ? window.CI : null;
const plano = op => typeof op === 'string' ? op : [op.titulo, op.texto].filter(Boolean).join('\n\n');

/** tipo: 'ok' | 'mal' | 'info'. No frena nada. */
export function avisar(texto, op = {}){
  const c = ci();
  if (c) return c.avisar(texto, op);
  window.alert(texto);
  return { cerrar(){} };
}

export async function informar(op){
  const c = ci();
  if (c) return c.informar(op);
  window.alert(plano(op));
}

export async function confirmar(op){
  const c = ci();
  if (c) return c.confirmar(op);
  return window.confirm(plano(op));
}

export async function pedir(op){
  const c = ci();
  if (c) return c.pedir(op);
  const r = window.prompt(plano(op), (op.campo && op.campo.valor) || '');
  return r == null ? null : r.trim();
}
