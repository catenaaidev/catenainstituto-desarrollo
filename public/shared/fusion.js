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

  // Secciones del documento con clave natural (un campo o varios). Las demás no
  // la tienen: cada fila se identifica por su contenido entero.
  //  - lotes: el número de lote (como en validacion.ts del servidor).
  //  - degustaciones: hay una por lote y mes; la pantalla edita "la" de ese mes.
  var CLAVES_DE_SECCION = { lotes: ['lote'], degustaciones: ['lote', 'mes'] };

  /** La clave de un elemento con esos campos, o null si le falta alguno. */
  function claveDe(x, campos) {
    if (!esObjeto(x)) return null;
    var partes = [];
    for (var i = 0; i < campos.length; i++) {
      var v = x[campos[i]];
      if (v === undefined || v === null || String(v).trim() === '') return null;
      partes.push(String(v).trim());
    }
    return partes.join('\u0001');
  }

  /**
   * Las claves que sirven para identificar: presentes y sin repetirse dentro de
   * cada lista. Un lote en blanco o duplicado no tiene identidad; esos elementos
   * se combinan por contenido, sin arrastrar a los demás.
   */
  function clavesValidas(listas, campos) {
    var malas = new Set();
    var todas = new Set();
    listas.forEach(function (lista) {
      var vistos = new Set();
      lista.forEach(function (x) {
        var k = claveDe(x, campos);
        if (k === null) return;
        if (vistos.has(k)) malas.add(k);
        vistos.add(k);
        todas.add(k);
      });
    });
    var ok = new Set();
    todas.forEach(function (k) { if (!malas.has(k)) ok.add(k); });
    return ok;
  }

  /** Para listas sin clave declarada: id/uid solo si TODOS lo tienen y no se repite. */
  function claveAutomatica(listas) {
    for (var c = 0; c < CLAVES.length; c++) {
      var campos = [CLAVES[c]];
      var validas = clavesValidas(listas, campos);
      var hay = false;
      var todosTienen = listas.every(function (lista) {
        return lista.every(function (x) { var k = claveDe(x, campos); if (k !== null) hay = true; return k !== null && validas.has(k); });
      });
      if (todosTienen && hay) return campos;
    }
    return null;
  }

  /** Un id libre para un elemento nuevo que chocó con otro nuevo del servidor. */
  function idLibre(campo, original, usados) {
    var numericos = true, max = 0;
    usados.forEach(function (k) { var n = Number(k); if (!isFinite(n) || String(k).trim() === '') numericos = false; else if (n > max) max = n; });
    if (numericos && isFinite(Number(original))) {
      var nuevo = max + 1;
      return typeof original === 'number' ? nuevo : String(nuevo);
    }
    var i = 2, cand;
    do { cand = String(original) + '-' + i++; } while (usados.has(cand));
    return cand;
  }

  /**
   * Listas con clave: elemento por elemento, y dentro de cada uno, campo por
   * campo. Los elementos sin clave válida se combinan por contenido.
   */
  function fusionarPorClave(b, l, s, campos, renumerar) {
    var validas = clavesValidas([b, l, s], campos);
    var clave = function (x) { var k = claveDe(x, campos); return k !== null && validas.has(k) ? k : null; };
    var idx = function (arr) { var m = new Map(); arr.forEach(function (x) { var k = clave(x); if (k !== null) m.set(k, x); }); return m; };
    var sueltos = function (arr) { return arr.filter(function (x) { return clave(x) === null; }); };
    var mb = idx(b), ml = idx(l), ms = idx(s);
    var usados = new Set();
    ml.forEach(function (x) { usados.add(String(x[campos[0]])); });
    ms.forEach(function (x) { usados.add(String(x[campos[0]])); });
    var out = [];
    var hechos = new Set();
    // Orden: el del servidor, y al final lo nuevo de esta pantalla.
    s.concat(l).forEach(function (x) {
      var k = clave(x);
      if (k === null || hechos.has(k)) return;
      hechos.add(k);
      var eb = mb.get(k), el = ml.get(k), es = ms.get(k);
      // Los dos agregaron, cada uno por su lado, un elemento nuevo con el mismo
      // id (pasa con ids "el mayor + 1", como los agregados de Prensas): son dos
      // cosas distintas. Quedan las dos; la de esta pantalla, con un id libre.
      // Solo con ids técnicos (id/uid): un número de lote es real, y dos
      // personas cargando el mismo lote hablan del mismo lote.
      if (renumerar && eb === undefined && el !== undefined && es !== undefined && !igual(el, es)) {
        out.push(clonar(es));
        var mio = clonar(el);
        mio[campos[0]] = idLibre(campos[0], el[campos[0]], usados);
        usados.add(String(mio[campos[0]]));
        out.push(mio);
        return;
      }
      var v = fusionar(eb, el, es);
      if (v !== undefined) out.push(v);
    });
    return out.concat(fusionarPorContenido(sueltos(b), sueltos(l), sueltos(s)));
  }

  /**
   * Listas sin clave (filas de análisis, movimientos…): cada fila es un todo y
   * se cuenta como en un multiconjunto. Lo que esta pantalla agregó se suma; lo
   * que borró, se resta del servidor. Editar una fila es borrar la vieja y
   * agregar la nueva: si dos personas editan la MISMA fila a la vez quedan las
   * dos versiones, que es preferible a perder una.
   *
   * De lo agregado acá se suma solo lo que el servidor no tenga ya: si un
   * guardado llegó pero su respuesta se perdió (corte de señal), al reintentar
   * esas filas ya están en el servidor y no se duplican.
   */
  function fusionarPorContenido(b, l, s) {
    var contar = function (arr) {
      var m = new Map();
      arr.forEach(function (x) { var k = estable(x); m.set(k, (m.get(k) || 0) + 1); });
      return m;
    };
    var cb = contar(b), cl = contar(l), cs = contar(s);
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
    cl.forEach(function (n, k) { var a = n - Math.max(cb.get(k) || 0, cs.get(k) || 0); if (a > 0) agregar.set(k, a); });
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
      if (claveLista) return fusionarPorClave(ba, l, s, claveLista, false);
      var auto = claveAutomatica([ba, l, s]);
      return auto ? fusionarPorClave(ba, l, s, auto, true) : fusionarPorContenido(ba, l, s);
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

  // Un borrador por módulo, usuario y PESTAÑA: en una PC compartida lo de una
  // persona no se le ofrece a otra, y con dos pestañas abiertas el guardado de
  // una no le borra el borrador a la otra. El id de pestaña vive en
  // sessionStorage, así que sobrevive a recargar esa misma pestaña.
  var PESTANA = (function () {
    var id = null;
    try { id = g.sessionStorage.getItem('ciw-pestana'); } catch (e) {}
    if (!id) {
      id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      try { g.sessionStorage.setItem('ciw-pestana', id); } catch (e) {}
    }
    return id;
  })();

  function prefijoBorrador(modulo) {
    var quien = (g.CIW && g.CIW.email) || '';
    return modulo + '|' + quien + '|';
  }
  function claveBorrador(modulo) { return prefijoBorrador(modulo) + PESTANA; }

  // Mientras esta pestaña está abierta, retiene un "lock" con el nombre de su
  // borrador: así otra pestaña sabe que ese borrador tiene dueño vivo y no se
  // lo ofrece para recuperar.
  var locksTomados = {};
  function retenerBorrador(modulo) {
    var nombre = 'ciw-borrador:' + claveBorrador(modulo);
    if (locksTomados[nombre] || !g.navigator || !g.navigator.locks) return;
    locksTomados[nombre] = true;
    g.navigator.locks.request(nombre, function () { return new Promise(function () {}); }).catch(function () {});
  }
  function locksVivos() {
    if (!g.navigator || !g.navigator.locks || !g.navigator.locks.query) return Promise.resolve(new Set());
    return g.navigator.locks.query()
      .then(function (q) { return new Set((q.held || []).map(function (l) { return l.name; })); })
      .catch(function () { return new Set(); });
  }

  var pendientes = {};
  /* Cuenta los programar()/borrar() de cada modulo: un guardado que quedo
   * esperando el ocio y para cuando le toca ya hubo otro pedido (o se guardo en
   * el servidor y se borro el borrador), no escribe nada. */
  var turno = {};

  /* El borrador se guarda como TEXTO ({v:2, base:'{...}', local:'{...}'}) y no
   * como objeto: IndexedDB copia lo que se le da, y copiar objeto por objeto dos
   * documentos de 4 MB (Lotes con dos años) trababa la pantalla ~150 ms en cada
   * pausa al tipear. Un string se copia de una. Lo que se guarda es lo mismo que
   * antes (clonar() ya era un ida y vuelta por JSON). Los borradores viejos, en
   * objeto, se siguen leyendo. */
  function desempacar(v) {
    if (!v || v.v !== 2) return v;
    try { return { base: JSON.parse(v.base), local: JSON.parse(v.local), ts: v.ts }; }
    catch (e) { return undefined; }
  }

  /* Corre fn cuando el navegador esta ocioso (o a lo sumo en 2 s): el borrador
   * no apura, y asi no le compite a la persona que esta tipeando o scrolleando. */
  function enOcio(fn) {
    if (g.requestIdleCallback) g.requestIdleCallback(fn, { timeout: 2000 });
    else fn();
  }

  var borrador = {
    /** Guarda ya. obtener() devuelve {base, local}. */
    guardar: function (modulo, obtener) {
      // Un lector no puede guardar en el servidor: guardarle borradores solo
      // hacía que se le ofreciera "recuperar" en cada recarga.
      if (g.CIW && g.CIW.rol === 'lector') return Promise.resolve();
      var datos;
      try { datos = obtener(); } catch (e) { return Promise.resolve(); }
      if (!datos || !datos.local) return Promise.resolve();
      var registro;
      try {
        registro = { v: 2, base: JSON.stringify(datos.base), local: JSON.stringify(datos.local), ts: Date.now() };
      } catch (e) { return Promise.resolve(); }
      retenerBorrador(modulo);
      return tx('readwrite', function (st) { return st.put(registro, claveBorrador(modulo)); })
        .catch(function (e) { console.warn('No se pudo guardar el borrador:', e); });
    },
    /** Guarda en un momento, juntando varios cambios seguidos en una sola escritura. */
    programar: function (modulo, obtener) {
      clearTimeout(pendientes[modulo]);
      var mio = turno[modulo] = (turno[modulo] || 0) + 1;
      pendientes[modulo] = setTimeout(function () {
        enOcio(function () { if (turno[modulo] === mio) borrador.guardar(modulo, obtener); });
      }, 800);
    },
    leer: function (modulo) {
      return tx('readonly', function (st) { return st.get(claveBorrador(modulo)); })
        .then(desempacar)
        .catch(function () { return undefined; });
    },
    /** Los borradores de este módulo y usuario, de cualquier pestaña: [{clave, valor}]. */
    leerTodos: function (modulo) {
      var pref = prefijoBorrador(modulo);
      return abrir().then(function (db) {
        return new Promise(function (ok) {
          var out = [];
          var t = db.transaction(TIENDA, 'readonly');
          var cur = t.objectStore(TIENDA).openCursor();
          cur.onsuccess = function () {
            var c = cur.result;
            if (!c) return;
            if (String(c.key).indexOf(pref) === 0) out.push({ clave: String(c.key), valor: desempacar(c.value) });
            c.continue();
          };
          t.oncomplete = function () { db.close(); ok(out); };
          t.onerror = function () { db.close(); ok(out); };
        });
      }).catch(function () { return []; });
    },
    borrar: function (modulo) {
      clearTimeout(pendientes[modulo]);
      turno[modulo] = (turno[modulo] || 0) + 1;
      return tx('readwrite', function (st) { return st.delete(claveBorrador(modulo)); })
        .catch(function () {});
    },
    borrarClaves: function (claves) {
      if (!claves.length) return Promise.resolve();
      return tx('readwrite', function (st) { claves.forEach(function (k) { st.delete(k); }); })
        .catch(function () {});
    },
  };

  /**
   * Al abrir el módulo: si quedaron borradores con cambios (de esta pestaña o de
   * otras ya cerradas), ofrece recuperarlos. Devuelve el documento combinado
   * (los borradores, del más viejo al más nuevo, encima de lo que hay hoy en el
   * servidor) o null si no hay nada o la persona no los quiere.
   */
  function recuperar(modulo, servidor) {
    retenerBorrador(modulo);
    return Promise.all([borrador.leerTodos(modulo), locksVivos()]).then(function (res) {
      var todos = res[0], vivos = res[1];
      var propia = claveBorrador(modulo);
      var candidatos = todos.filter(function (b) {
        if (!b.valor || !b.valor.local || igual(b.valor.local, b.valor.base)) return false;
        // El de otra pestaña que sigue abierta es de ella: no se toca.
        return b.clave === propia || !vivos.has('ciw-borrador:' + b.clave);
      }).sort(function (a, b) { return (a.valor.ts || 0) - (b.valor.ts || 0); });
      // Los vacíos (sin cambios) se limpian sin preguntar.
      var vacios = todos.filter(function (b) { return !b.valor || !b.valor.local || igual(b.valor.local, b.valor.base); })
        .map(function (b) { return b.clave; });
      borrador.borrarClaves(vacios);
      if (!candidatos.length) return null;

      var ultimo = candidatos[candidatos.length - 1].valor.ts;
      var cuando = new Date(ultimo).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
      var cuantas = candidatos.length > 1 ? ' (de ' + candidatos.length + ' pestañas)' : '';
      var texto = 'En este equipo quedaron cambios sin guardar' + cuantas + ', el último del ' + cuando + (/\.$/.test(cuando) ? '' : '.') + '\n' +
        'Si los recuperás, se combinan con lo que cargaron los demás.';
      // CI.confirmar lo pone dialogo.js (lo inyecta el servidor antes que este
      // archivo). Sin él (tests, página suelta) se usa el confirm de siempre.
      var preguntar = g.CI && g.CI.confirmar
        ? g.CI.confirmar({ titulo: 'Cambios sin guardar', texto: texto, si: 'Recuperar cambios', no: 'Descartarlos' })
        : Promise.resolve(g.confirm(texto + '\n\nAceptar = recuperarlos · Cancelar = descartarlos.'));
      var claves = candidatos.map(function (b) { return b.clave; });
      return preguntar.then(function (si) {
        if (!si) { borrador.borrarClaves(claves); return null; }
        var doc = servidor;
        candidatos.forEach(function (b) { doc = fusionarDocumento(b.valor.base, b.valor.local, doc); });
        // Los de pestañas cerradas pasan a ser de esta: el de esta pestaña se
        // reescribe con todo junto en cuanto la app marque los cambios.
        borrador.borrarClaves(claves.filter(function (k) { return k !== propia; }));
        return doc;
      });
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
    // Barriles sincroniza solo: no tiene botón Guardar y lo pendiente se sube
    // en cuanto vuelve la sesión.
    var esBarriles = g.CIW && g.CIW.modulo === 'barriles';
    var esLotes = g.CIW && g.CIW.modulo === 'lotes';
    caja.innerHTML = '<button title="Cerrar" aria-label="Cerrar">&times;</button>' +
      '<b>Tu sesión se cerró.</b> Lo que cargaste sigue en esta pantalla: no se perdió.<br>' +
      (esBarriles
        ? 'Iniciá sesión en la otra pestaña y volvé acá: lo pendiente se sube solo.<br>'
        : esLotes
        ? 'Iniciá sesión en la otra pestaña y volvé acá: apretá <b>Ctrl+S</b> o seguí editando, y lo pendiente se guarda solo.<br>'
        : 'Iniciá sesión en la otra pestaña, volvé acá y tocá <b>Guardar</b> de nuevo.<br>') +
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
