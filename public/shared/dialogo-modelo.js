/**
 * Lógica pura del aviso y el diálogo de la plataforma (dialogo.js la usa).
 *
 * Va aparte y sin DOM para poder testearla: los tests corren en el runtime de
 * Workers, donde no hay document. Script clásico que se cuelga de globalThis
 * (como barriles/js/orden-editable.js), porque se carga antes que las apps.
 */
(function (g) {
  'use strict';

  function str(v, def) { return v == null || v === '' ? def : String(v); }

  function normalizarConfirmar(op) {
    if (typeof op === 'string') op = { texto: op };
    op = op || {};
    var si = str(op.si, 'Seguir');
    if (/^(aceptar|ok)$/i.test(si.trim())) si = 'Seguir';
    return {
      titulo: str(op.titulo, 'Confirmar'),
      texto: str(op.texto, ''),
      si: si,
      no: str(op.no, 'Cancelar'),
      peligro: !!op.peligro,
    };
  }

  function normalizarInformar(op) {
    if (typeof op === 'string') op = { texto: op };
    op = op || {};
    var si = str(op.si, 'Entendido');
    if (/^(aceptar|ok)$/i.test(si.trim())) si = 'Entendido';
    return { titulo: str(op.titulo, 'Aviso'), texto: str(op.texto, ''), si: si };
  }

  function normalizarPedir(op) {
    op = op || {};
    var c = op.campo || {};
    var opciones = (c.opciones || []).map(function (o) {
      return typeof o === 'object' && o !== null
        ? { valor: String(o.valor), texto: str(o.texto, String(o.valor)) }
        : { valor: String(o), texto: String(o) };
    });
    var tipo = c.tipo || (opciones.length ? 'select' : 'text');
    return {
      titulo: str(op.titulo, 'Completar'),
      texto: str(op.texto, ''),
      si: str(op.si, 'Guardar'),
      no: str(op.no, 'Cancelar'),
      campo: {
        tipo: tipo,
        valor: c.valor == null ? '' : String(c.valor),
        opciones: opciones,
        inputmode: c.inputmode != null ? String(c.inputmode) : (tipo === 'number' ? 'decimal' : ''),
        requerido: c.requerido !== false,
        placeholder: str(c.placeholder, ''),
      },
    };
  }

  function validarPedido(campo, valor) {
    var v = String(valor == null ? '' : valor).trim();
    if (!v) {
      return campo.requerido
        ? { ok: false, valor: '', error: 'Completá este dato.' }
        : { ok: true, valor: '', error: '' };
    }
    if (campo.tipo === 'select') {
      var esta = campo.opciones.some(function (o) { return o.valor === v; });
      return esta ? { ok: true, valor: v, error: '' } : { ok: false, valor: v, error: 'Elegí una de la lista.' };
    }
    if (campo.tipo === 'number') {
      var n = v.replace(',', '.');
      return /^-?\d+(\.\d+)?$/.test(n)
        ? { ok: true, valor: n, error: '' }
        : { ok: false, valor: v, error: 'Tiene que ser un número.' };
    }
    return { ok: true, valor: v, error: '' };
  }

  function duracionAviso(op) {
    op = op || {};
    if (typeof op.ms === 'number' && op.ms > 0) return op.ms;
    if (typeof op.deshacer === 'function') return 8000;
    if (op.tipo === 'mal') return 5000;
    return 4000;
  }

  g.CIDialogoModelo = {
    normalizarConfirmar: normalizarConfirmar,
    normalizarInformar: normalizarInformar,
    normalizarPedir: normalizarPedir,
    validarPedido: validarPedido,
    duracionAviso: duracionAviso,
  };
})(globalThis);
