/**
 * Aviso y diálogo de la plataforma: CI.avisar, CI.confirmar y CI.pedir, en
 * lugar de alert/confirm/prompt (que frenan la pantalla, no se pueden diseñar
 * y en el celular se leen mal).
 *
 * Trae su propio CSS acotado a .ci-avisos / .ci-dialogo con los colores de
 * Prensas escritos acá: así se ve igual en los tres módulos aunque alguno no
 * cargue todavía shared/estilo.css. La lógica pura está en dialogo-modelo.js.
 */
(function (g) {
  'use strict';
  var M = g.CIDialogoModelo;
  if (!g.document || !M) return;
  var d = g.document;

  var CSS =
    '.ci-avisos{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:1100;display:flex;flex-direction:column;gap:8px;width:min(520px,calc(100% - 32px));pointer-events:none}' +
    '.ci-aviso{pointer-events:auto;display:flex;align-items:center;gap:14px;background:#1C1B19;color:#ECE8E1;border-left:3px solid #ECE8E1;padding:11px 14px;font:13.5px/1.45 "IBM Plex Sans",system-ui,"Segoe UI",sans-serif;box-shadow:0 10px 30px -14px rgba(28,27,25,.55)}' +
    '.ci-aviso.ok{border-left-color:#9DB08F}.ci-aviso.mal{border-left-color:#D9727E}' +
    '.ci-aviso span{flex:1;white-space:pre-line}' +
    '.ci-aviso button{background:none;border:1px solid rgba(236,232,225,.5);color:#ECE8E1;padding:5px 11px;font:500 12.5px "IBM Plex Sans",system-ui,sans-serif;cursor:pointer;border-radius:2px}' +
    '.ci-aviso button:hover{border-color:#ECE8E1}' +
    '.ci-aviso button:focus-visible{outline:2px solid #ECE8E1;outline-offset:2px}' +
    '.ci-dialogo{border:1px solid #1C1B19;border-top:3px solid #1C1B19;border-radius:2px;padding:0;width:min(480px,calc(100% - 32px));background:#F4F1EB;color:#1C1B19;font:14px/1.45 "IBM Plex Sans",system-ui,"Segoe UI",sans-serif;box-shadow:8px 8px 0 rgba(28,27,25,.08)}' +
    '.ci-dialogo::backdrop{background:rgba(28,27,25,.38)}' +
    '.ci-dialogo form{padding:20px 22px 18px;margin:0}' +
    '.ci-dialogo h2{margin:0 0 10px;font:500 24px/1.1 "Cormorant Garamond",Georgia,serif}' +
    '.ci-dialogo p{margin:0 0 14px;color:#68625A;white-space:pre-line}' +
    '.ci-dialogo label{display:block;font:500 10px "IBM Plex Sans",sans-serif;text-transform:uppercase;letter-spacing:1.6px;color:#68625A;margin-bottom:6px}' +
    '.ci-dialogo input,.ci-dialogo select{width:100%;box-sizing:border-box;background:#fff;color:#1C1B19;border:1px solid #D6D0C5;border-radius:2px;padding:9px 10px;font:14px "IBM Plex Sans",sans-serif}' +
    '.ci-dialogo input:focus,.ci-dialogo select:focus{outline:none;border-color:#1C1B19;box-shadow:inset 3px 0 0 #5A1724}' +
    '.ci-dialogo .ci-err{color:#8E2330;font-size:12.5px;margin:6px 0 0;min-height:1em}' +
    '.ci-dialogo .ci-pie{display:flex;justify-content:flex-end;gap:8px;margin-top:18px;flex-wrap:wrap}' +
    '.ci-dialogo .ci-pie button{background:transparent;color:#1C1B19;border:1px solid #1C1B19;border-radius:2px;padding:8px 15px;font:500 13px "IBM Plex Sans",sans-serif;cursor:pointer}' +
    '.ci-dialogo .ci-pie button:hover{border-color:#5A1724;color:#5A1724;background:rgba(90,23,36,.07)}' +
    '.ci-dialogo .ci-pie button.si{background:#5A1724;border-color:#5A1724;color:#F3EEE6}' +
    '.ci-dialogo .ci-pie button.si:hover{background:#43101A;border-color:#43101A;color:#fff}' +
    '.ci-dialogo .ci-pie button.si.peligro{background:#8E2330;border-color:#8E2330}' +
    '.ci-dialogo button:focus-visible{outline:2px solid #5A1724;outline-offset:2px}' +
    '@media (max-width:760px){.ci-dialogo{width:calc(100% - 20px);max-width:none}' +
    '.ci-dialogo .ci-pie button{min-height:44px;flex:1}.ci-dialogo input,.ci-dialogo select{font-size:16px;min-height:44px}' +
    '.ci-aviso button{min-height:40px}}' +
    '@media print{.ci-avisos,.ci-dialogo{display:none!important}}';

  function asegurarEstilo() {
    if (d.getElementById('ci-dialogo-css')) return;
    var s = d.createElement('style');
    s.id = 'ci-dialogo-css';
    s.textContent = CSS;
    (d.head || d.documentElement).appendChild(s);
  }

  function el(tag, cls, texto) {
    var e = d.createElement(tag);
    if (cls) e.className = cls;
    if (texto != null) e.textContent = texto;
    return e;
  }

  // ---------- aviso ----------
  var caja = null;
  // Con un <dialog> modal abierto, todo lo de afuera queda debajo de su fondo
  // (la capa superior): el aviso se cuelga del diálogo modal de más arriba.
  function anfitrion() {
    var abiertos = d.querySelectorAll('dialog[open]');
    for (var i = abiertos.length - 1; i >= 0; i--) {
      try { if (abiertos[i].matches(':modal')) return abiertos[i]; } catch (e) { /* navegador sin :modal */ }
    }
    return d.body;
  }
  function contenedor() {
    if (!caja) {
      caja = el('div', 'ci-avisos');
      caja.setAttribute('role', 'status');
      caja.setAttribute('aria-live', 'polite');
    }
    var h = anfitrion();
    if (caja.parentNode !== h) h.appendChild(caja);
    return caja;
  }

  function avisar(texto, op) {
    op = op || {};
    asegurarEstilo();
    var a = el('div', 'ci-aviso' + (op.tipo ? ' ' + op.tipo : ''));
    a.appendChild(el('span', '', texto));
    var t = null;
    function cerrar() { if (t) clearTimeout(t); if (a.parentNode) a.parentNode.removeChild(a); }
    if (typeof op.deshacer === 'function') {
      var b = el('button', '', 'Deshacer');
      b.type = 'button';
      b.addEventListener('click', function () { cerrar(); op.deshacer(); });
      a.appendChild(b);
    }
    if (typeof op.accion === 'function' && op.etiquetaAccion) {
      var accion = el('button', '', String(op.etiquetaAccion));
      accion.type = 'button';
      accion.addEventListener('click', function () { cerrar(); op.accion(); });
      a.appendChild(accion);
    }
    contenedor().appendChild(a);
    t = setTimeout(cerrar, M.duracionAviso(op));
    return { cerrar: cerrar };
  }

  // ---------- diálogo ----------
  // Arma un <dialog>, lo abre con showModal (Escape cierra, el foco queda
  // adentro) y al cerrar devuelve el foco a donde estaba.
  function abrir(armar) {
    asegurarEstilo();
    return new Promise(function (resolver) {
      var previo = d.activeElement;
      var dlg = el('dialog', 'ci-dialogo');
      var form = el('form');
      form.method = 'dialog';
      dlg.appendChild(form);
      var hecho = false;
      function terminar(valor) {
        if (hecho) return;
        hecho = true;
        if (dlg.open) dlg.close();
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        if (previo && typeof previo.focus === 'function' && previo.isConnected) previo.focus();
        resolver(valor);
      }
      var foco = armar(form, terminar);
      dlg.addEventListener('cancel', function (e) { e.preventDefault(); terminar(null); });
      d.body.appendChild(dlg);
      dlg.showModal();
      if (foco) foco.focus();
    });
  }

  function pie(form, c, alSi, alNo) {
    var p = el('div', 'ci-pie');
    var no = el('button', 'no', c.no);
    no.type = 'button';
    no.addEventListener('click', alNo);
    var si = el('button', 'si' + (c.peligro ? ' peligro' : ''), c.si);
    si.type = 'submit';
    p.appendChild(no);
    p.appendChild(si);
    form.appendChild(p);
    form.addEventListener('submit', function (e) { e.preventDefault(); alSi(); });
    return { si: si, no: no };
  }

  function confirmar(op) {
    var c = M.normalizarConfirmar(op);
    return abrir(function (form, terminar) {
      form.appendChild(el('h2', '', c.titulo));
      if (c.texto) form.appendChild(el('p', '', c.texto));
      var b = pie(form, c, function () { terminar(true); }, function () { terminar(false); });
      // En lo peligroso el foco arranca en Cancelar: un Enter apurado no borra.
      return c.peligro ? b.no : b.si;
    }).then(function (v) { return v === true; });
  }

  // Una noticia que hay que leer: un solo botón. Escape también la cierra.
  function informar(op) {
    var c = M.normalizarInformar(op);
    return abrir(function (form, terminar) {
      form.appendChild(el('h2', '', c.titulo));
      if (c.texto) form.appendChild(el('p', '', c.texto));
      var p = el('div', 'ci-pie');
      var si = el('button', 'si', c.si);
      si.type = 'submit';
      p.appendChild(si);
      form.appendChild(p);
      form.addEventListener('submit', function (e) { e.preventDefault(); terminar(true); });
      return si;
    }).then(function () {});
  }

  var nId = 0;
  function pedir(op) {
    var c = M.normalizarPedir(op);
    return abrir(function (form, terminar) {
      form.appendChild(el('h2', '', c.titulo));
      if (c.texto) form.appendChild(el('p', '', c.texto));
      var id = 'ci-pedir-' + (++nId);
      var lab = el('label', '', c.titulo);
      lab.htmlFor = id;
      form.appendChild(lab);
      var campo;
      if (c.campo.tipo === 'select') {
        campo = el('select');
        if (!c.campo.valor) campo.appendChild(el('option', '', 'Elegí…')).value = '';
        c.campo.opciones.forEach(function (o) {
          var opt = el('option', '', o.texto);
          opt.value = o.valor;
          campo.appendChild(opt);
        });
        campo.value = c.campo.valor;
      } else {
        campo = el('input');
        campo.type = 'text';
        campo.value = c.campo.valor;
        campo.autocomplete = 'off';
        if (c.campo.inputmode) campo.setAttribute('inputmode', c.campo.inputmode);
        if (c.campo.placeholder) campo.placeholder = c.campo.placeholder;
      }
      campo.id = id;
      form.appendChild(campo);
      var err = el('p', 'ci-err');
      err.id = id + '-err';
      err.setAttribute('aria-live', 'polite');
      campo.setAttribute('aria-describedby', err.id);
      form.appendChild(err);
      pie(form, c, function () {
        var r = M.validarPedido(c.campo, campo.value);
        if (!r.ok) { err.textContent = r.error; campo.focus(); return; }
        terminar(r.valor);
      }, function () { terminar(null); });
      return campo;
    });
  }

  g.CI = g.CI || {};
  g.CI.avisar = avisar;
  g.CI.confirmar = confirmar;
  g.CI.informar = informar;
  g.CI.pedir = pedir;
})(globalThis);
