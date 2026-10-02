/**
 * Que no se pierda ningún dato cargado, aunque varias personas trabajen a la
 * vez desde distintos dispositivos.
 *
 * Tres piezas, para Prensas y Lotes (Barriles ya tiene las suyas):
 *
 *  1. fusionar(base, local, servidor): cuando otro guardó mientras esta
 *     pantalla editaba, en vez de "recargá y perdé tus cambios" se combinan
 *     los dos: lo que esta pantalla cambió respecto de la base se aplica
 *     encima de lo que hay en el servidor.
 *
 *  2. Borrador en el equipo (IndexedDB): lo que no se guardó sobrevive a una
 *     recarga, a cerrar la pestaña, a un corte de señal o a una sesión vencida.
 *     Al volver a abrir el módulo se ofrece recuperarlo.
 *
 *  3. Aviso de sesión cerrada: si el servidor responde 401, se explica qué
 *     pasa y se abre el login en otra pestaña, sin tocar lo que hay en pantalla.
 *
 * Clásico (no módulo) y colgado de globalThis, como js/inventario.js, para que
 * los tests lo importen sin navegador.
 */
(function (g) {
  'use strict';

  // ---------------- comparación ----------------

  /** JSON con las claves ordenadas: dos objetos iguales dan el mismo texto. */
  function estable(v) {
    if (v === undefined) return 'undefined';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(estable).join(',') + ']';
    return '{' + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort()
      .map(function (k) { return JSON.stringify(k) + ':' + estable(v[k]); }).join(',') + '}';
  }

  function igual(a, b) { return a === b || estable(a) === estable(b); }

  function esObjeto(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  function clonar(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  // ---------------- fusión de tres vías ----------------

  // Identificadores que se reconocen solos, en cualquier lista: son únicos por
  // diseño. Se usan solo si están en TODOS los elementos y no se repiten.
  //
  // "lote" NO va acá: los análisis tienen "lote" y, en una lista corta, puede
  // no repetirse de casualidad; tomarlo como clave fundía dos análisis distintos
  // del mismo lote en uno. Las claves naturales se declaran por sección
  // (CLAVES_DE_SECCION), como hace validacion.ts del servidor.
  var CLAVES = ['id', 'uid'];

  // Secciones del documento con clave natural. Las demás no la tienen: cada
  // fila se identifica por su contenido entero.
  var CLAVES_DE_SECCION = { lotes: 'lote' };

  function claveDeLista(listas, forzada) {
    var candidatos = forzada ? [forzada] : CLAVES;
    for (var c = 0; c < candidatos.length; c++) {
      var campo = candidatos[c];
      var sirve = true;
      var hayAlguno = false;
      for (var i = 0; i < listas.length && sirve; i++) {
        var vistos = new Set();
        var lista = listas[i];
        for (var j = 0; j < lista.length; j++) {
          var x = lista[j];
          if (!esObjeto(x) || x[campo] === undefined || x[campo] === null || x[campo] === '') { sirve = false; break; }
          var k = String(x[campo]);
          if (vistos.has(k)) { sirve = false; break; }
          vistos.add(k);
          hayAlguno = true;
        }
      }
      if (sirve && hayAlguno) return campo;
    }
    return null;
  }

  /** Listas cuyos elementos tienen una clave: elemento por elemento, y dentro de cada uno, campo por campo. */
  function fusionarPorClave(b, l, s, campo) {
    var idx = function (arr) { var m = new Map(); arr.forEach(function (x) { m.set(String(x[campo]), x); }); return m; };
    var mb = idx(b), ml = idx(l), ms = idx(s);
    var out = [];
    var hechos = new Set();
    // Orden: el del servidor, y al final lo nuevo de esta pantalla.
    s.concat(l).forEach(function (x) {
      var k = String(x[campo]);
      if (hechos.has(k)) return;
      hechos.add(k);
      var v = fusionar(mb.get(k), ml.get(k), ms.get(k));
      if (v !== undefined) out.push(v);
    });
    return out;
  }

  /**
   * Listas sin clave (filas de análisis, movimientos…): cada fila es un todo y
   * se cuenta como en un multiconjunto. Lo que esta pantalla agregó se suma; lo
   * que borró, se resta del servidor. Editar una fila es borrar la vieja y
   * agregar la nueva: si dos personas editan la MISMA fila a la vez quedan las
   * dos versiones, que es preferible a perder una.
   */
  function fusionarPorContenido(b, l, s) {
    var contar = function (arr) {
      var m = new Map();
      arr.forEach(function (x) { var k = estable(x); m.set(k, (m.get(k) || 0) + 1); });
      return m;
    };
    var cb = contar(b), cl = contar(l);
    var quitar = new Map();
    cb.forEach(function (n, k) { var q = n - (cl.get(k) || 0); if (q > 0) quitar.set(k, q); });
    var out = [];
    s.forEach(function (x) {
      var k = estable(x);
      var q = quitar.get(k) || 0;
      if (q > 0) { quitar.set(k, q - 1); return; }
      out.push(x);
    });
    var agregar = new Map();
    cl.forEach(function (n, k) { var a = n - (cb.get(k) || 0); if (a > 0) agregar.set(k, a); });
    l.forEach(function (x) {
      var k = estable(x);
      var a = agregar.get(k) || 0;
      if (a > 0) { agregar.set(k, a - 1); out.push(x); }
    });
    return out;
  }

  /**
   * base: el documento tal como lo trajo esta pantalla (o como quedó en su
   * último guardado). local: como está ahora en pantalla. serv: lo que hay hoy
   * en el servidor. Devuelve un documento nuevo; no muta los argumentos.
   *
   * Reglas, de arriba hacia abajo:
   *  - lo que esta pantalla no tocó, viene del servidor;
   *  - lo que el servidor no tocó, viene de esta pantalla;
   *  - si uno borró y el otro editó, gana la edición;
   *  - objetos: campo por campo; listas: ver arriba;
   *  - si los dos cambiaron el mismo dato a valores distintos, gana esta pantalla
   *    (es la que está guardando ahora, con el dato a la vista).
   */
  function fusionar(b, l, s, claveLista) {
    if (igual(l, b)) return clonar(s);
    if (igual(s, b)) return clonar(l);
    if (igual(l, s)) return clonar(l);
    if (l === undefined) return clonar(s);   // borré yo, pero el otro lo editó
    if (s === undefined) return clonar(l);   // lo borró el otro, pero yo lo edité
    if (esObjeto(l) && esObjeto(s)) {
      var bo = esObjeto(b) ? b : {};
      var out = {};
      var claves = new Set(Object.keys(bo).concat(Object.keys(l), Object.keys(s)));
      claves.forEach(function (k) {
        var v = fusionar(bo[k], l[k], s[k]);
        if (v !== undefined) out[k] = v;
      });
      return out;
    }
    if (Array.isArray(l) && Array.isArray(s)) {
      var ba = Array.isArray(b) ? b : [];
      var campo = claveDeLista([ba, l, s], claveLista);
      return campo ? fusionarPorClave(ba, l, s, campo) : fusionarPorContenido(ba, l, s);
    }
    return clonar(l);
  }

  /**
   * Fusiona un documento de módulo completo (sección por sección, con la clave
   * natural de cada una) y deja la versión del servidor en meta.version, que es
   * contra la que se va a reintentar el guardado.
   */
  function fusionarDocumento(base, local, serv) {
    var bo = esObjeto(base) ? base : {}, lo = esObjeto(local) ? local : {}, so = esObjeto(serv) ? serv : {};
    var d = {};
    new Set(Object.keys(bo).concat(Object.keys(lo), Object.keys(so))).forEach(function (k) {
      var v = fusionar(bo[k], lo[k], so[k], CLAVES_DE_SECCION[k]);
      if (v !== undefined) d[k] = v;
    });
    d.meta = Object.assign({}, d.meta || {}, { version: (serv && serv.meta && serv.meta.version) || 0 });
    if (local && local.meta && local.meta.autor) d.meta.autor = local.meta.autor;
    return d;
  }

  // ---------------- borrador en el equipo ----------------

  var DB = 'ciw-borradores';
  var TIENDA = 'borradores';

  function abrir() {
    return new Promise(function (ok, mal) {
      if (!g.indexedDB) { mal(new Error('sin IndexedDB')); return; }
      var r = g.indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(TIENDA); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { mal(r.error); };
    });
  }

  function tx(modo, fn) {
    return abrir().then(function (db) {
      return new Promise(function (ok, mal) {
        var t = db.transaction(TIENDA, modo);
        var res = fn(t.objectStore(TIENDA));
        t.oncomplete = function () { db.close(); ok(res && res.result); };
        t.onerror = function () { db.close(); mal(t.error); };
      });
    });
  }

  // Un borrador por módulo y por usuario: en una PC compartida, lo de una
  // persona no se le ofrece a otra.
  function claveBorrador(modulo) {
    var quien = (g.CIW && g.CIW.email) || '';
    return modulo + '|' + quien;
  }

  var pendientes = {};

  var borrador = {
    /** Guarda ya. obtener() devuelve {base, local}. */
    guardar: function (modulo, obtener) {
      var datos;
      try { datos = obtener(); } catch (e) { return Promise.resolve(); }
      if (!datos || !datos.local) return Promise.resolve();
      var registro = { base: clonar(datos.base), local: clonar(datos.local), ts: Date.now() };
      return tx('readwrite', function (st) { return st.put(registro, claveBorrador(modulo)); })
        .catch(function (e) { console.warn('No se pudo guardar el borrador:', e); });
    },
    /** Guarda en un momento, juntando varios cambios seguidos en una sola escritura. */
    programar: function (modulo, obtener) {
      clearTimeout(pendientes[modulo]);
      pendientes[modulo] = setTimeout(function () { borrador.guardar(modulo, obtener); }, 800);
    },
    leer: function (modulo) {
      return tx('readonly', function (st) { return st.get(claveBorrador(modulo)); })
        .catch(function () { return undefined; });
    },
    borrar: function (modulo) {
      clearTimeout(pendientes[modulo]);
      return tx('readwrite', function (st) { return st.delete(claveBorrador(modulo)); })
        .catch(function () {});
    },
  };

  /**
   * Al abrir el módulo: si quedó un borrador con cambios, ofrece recuperarlo.
   * Devuelve el documento combinado (borrador encima de lo que hay hoy en el
   * servidor) o null si no hay nada o la persona no lo quiere.
   */
  function recuperar(modulo, servidor) {
    return borrador.leer(modulo).then(function (r) {
      if (!r || !r.local || igual(r.local, r.base)) return null;
      var cuando = new Date(r.ts).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
      var si = g.confirm(
        'En este equipo quedaron cambios SIN GUARDAR del ' + cuando + '.\n\n' +
        'Aceptar = recuperarlos (se combinan con lo que cargaron los demás; después tocá Guardar).\n' +
        'Cancelar = descartarlos.');
      if (!si) { borrador.borrar(modulo); return null; }
      return fusionarDocumento(r.base, r.local, servidor);
    });
  }

  // ---------------- sesión cerrada ----------------

  var avisando = false;

  function avisarSesionCerrada() {
    if (avisando || !g.document) return;
    avisando = true;
    var css = '#ciw-sesion{position:fixed;left:50%;transform:translateX(-50%);top:12px;z-index:100000;' +
      'max-width:560px;width:calc(100% - 32px);background:#fdf3f2;border:1px solid #e9c9c5;border-left:4px solid #8a3340;' +
      'border-radius:8px;padding:14px 16px;font:13px/1.5 system-ui,Segoe UI,sans-serif;color:#5a2a2a;' +
      'box-shadow:0 10px 34px -14px rgba(0,0,0,.4)}#ciw-sesion b{color:#8a3340}' +
      '#ciw-sesion a{display:inline-block;margin-top:8px;background:#8a3340;color:#fff;padding:6px 12px;border-radius:6px;text-decoration:none}' +
      '#ciw-sesion button{position:absolute;top:8px;right:10px;border:0;background:none;font-size:17px;cursor:pointer;color:#8a3340}';
    var est = g.document.createElement('style');
    est.textContent = css;
    g.document.head.appendChild(est);
    var caja = g.document.createElement('div');
    caja.id = 'ciw-sesion';
    caja.setAttribute('role', 'alert');
    caja.innerHTML = '<button title="Cerrar" aria-label="Cerrar">&times;</button>' +
      '<b>Tu sesión se cerró.</b> Lo que cargaste sigue en esta pantalla y guardado en este equipo: no se perdió.<br>' +
      'Iniciá sesión en la otra pestaña, volvé acá y tocá <b>Guardar</b> de nuevo.<br>' +
      '<a href="/login.html" target="_blank" rel="noopener">Iniciar sesión</a>';
    caja.querySelector('button').onclick = function () { caja.remove(); avisando = false; };
    g.document.body.appendChild(caja);
  }

  if (g.fetch && g.document) {
    var original = g.fetch;
    g.fetch = function () {
      return original.apply(this, arguments).then(function (res) {
        if (res.status === 401) avisarSesionCerrada();
        return res;
      });
    };
  }

  g.CIWFusion = {
    fusionar: fusionar,
    fusionarDocumento: fusionarDocumento,
    igual: igual,
    clonar: clonar,
    borrador: borrador,
    recuperar: recuperar,
    avisarSesionCerrada: avisarSesionCerrada,
  };
})(typeof window !== 'undefined' ? window : globalThis);
