/* ===== Lotes CIW - la entrada de la bitacora de correcciones de SO2 =====
 *
 * Una sola implementacion de la forma que tiene una correccion registrada y de
 * como se engancha a datos.analisis. La escriben dos lugares: la calculadora de
 * la pestana Correcciones SO2 (de a un lote) y el overlay de ejecucion de la
 * Orden de correccion (de a muchos). Dos copias de esta forma se
 * desincronizarian en el primer campo que se agregue.
 *
 * Modulo puro: no toca el DOM y no llama a markDirty. Quien lo usa decide
 * cuando avisar que hay cambios sin guardar. Tampoco aplica la formula de la
 * dosis: recibe los numeros ya calculados. */
'use strict';

/** Arma el objeto `correccion` que va adentro de un registro de analisis.
 *
 *  `diferencia` se deriva y no se recibe: es la resta de los otros dos y tener
 *  que pasarla habilitaria que llegue un valor que no cierra. */
export function armarCorreccion({ so2Actual, so2Deseado, mbk, ml, ot, fecha }){
  const hayAmbos = (so2Actual != null && so2Deseado != null);
  return {
    so2_libre_actual: so2Actual,
    so2_deseado:      so2Deseado,
    diferencia:       hayAmbos ? (so2Deseado - so2Actual) : null,
    mbk_a_agregar:    mbk,
    ml_exactos:       ml,
    ot_n:             (String(ot ?? '').trim() || null),
    fecha:            fecha,
  };
}

const _otDe = c => String((c && c.ot_n) ?? '').trim();
const _tieneDosis = c => !!c && c.mbk_a_agregar != null && c.mbk_a_agregar !== '';

/** ¿Se puede escribir `nueva` encima de la correccion que ya tiene `a`?
 *
 *  Solo si no se pierde nada que la bitacora muestre:
 *    - no tiene correccion, o es una cascara de la migracion (sin OT y sin
 *      dosis: la bitacora ni la lista);
 *    - o es la MISMA OT: volver a registrar la misma orden es corregir el dato.
 *  Nunca una anulada: es el rastro de auditoria de que hubo un error y se
 *  cancelo, y pisarla lo borraria en silencio.
 *
 *  Antes se pisaba siempre la primera de ese lote y fecha: registrar la OT B
 *  el mismo dia que la OT A borraba A sin aviso, y con ella la supresion que
 *  la regla de la orden calcula a partir de A. */
function _pisable(a, nueva){
  const c = a.correccion;
  if (!c || typeof c !== 'object') return true;
  if (esAnulada(c)) return false;
  const ot = _otDe(c);
  if (ot === _otDe(nueva)) return true;
  return ot === '' && !_tieneDosis(c);
}

/** Engancha la correccion al analisis del lote en esa fecha; si no hay ninguno
 *  que se pueda usar, crea un registro nuevo. MUTA `analisis`.
 *
 *  Devuelve { que, ref, anterior, lote, fecha, escrita, convive }:
 *    que      - 'creado' o 'actualizado'
 *    ref      - referencia directa al objeto de analisis afectado
 *    anterior - la correccion que tenia antes (puede ser undefined si no habia)
 *    lote, fecha, escrita - la clave y el objeto escrito, para poder encontrar
 *               el registro aunque `ref` haya quedado huerfano (ver
 *               revertirCorrecciones)
 *    convive  - si ya habia ese dia una correccion de OTRA OT (o anulada) y por
 *               eso se creo un registro aparte: su N de OT ('' si no tenia).
 *               null en los demas casos.
 *
 *  Dos correcciones del mismo lote y fecha conviven en dos registros: el
 *  modelo ya lo admite (hay 16 claves asi en los datos reales), la bitacora
 *  lista un renglon por registro y motor_correccion toma la ultima NO anulada.
 *  Entre los registros de ese lote y fecha se prefiere el de la misma OT, y
 *  despues cualquiera que se pueda pisar sin perder nada (_pisable).
 *
 *  El lote se compara como texto: en datos.json convive numerico y string.
 *
 *  Ojo con el registro nuevo: no lleva mediciones, pero motor_fml._so2_libre()
 *  lee correccion.so2_libre_actual cuando el registro no trae medicion propia
 *  (motor_fml.py:134). O sea que para el tablero ESTE registro es una medicion
 *  de SO2 con el valor previo a la correccion, fechada el dia de la correccion.
 *  Es el comportamiento que ya tenia la calculadora; queda anotado porque la
 *  orden lo multiplica por la cantidad de lotes de cada ejecucion. */
export function aplicarCorreccion(analisis, lote, fecha, correccion){
  const L = String(lote ?? '');
  const mismos = (analisis || []).filter(a =>
    String(a.lote ?? '') === L && (a.fecha_analisis || '') === fecha);
  const otNueva = _otDe(correccion);
  const existente =
    mismos.find(a => otNueva !== '' && a.correccion && !esAnulada(a.correccion) && _otDe(a.correccion) === otNueva)
    || mismos.find(a => _pisable(a, correccion));
  const base = { lote: L, fecha, escrita: correccion };
  if (existente){
    const anterior = existente.correccion;
    existente.correccion = correccion;
    return { ...base, que: 'actualizado', ref: existente, anterior, convive: null };
  }
  /* Si habia registros ese dia y ninguno se podia pisar, se avisa cual queda
   * al lado: quien registra tiene que saber que ese lote ya tenia otra
   * correccion ese dia (puede ser un error de tipeo en la OT). */
  const otra = mismos.find(a => a.correccion && typeof a.correccion === 'object');
  analisis.push({ lote: L, fecha_analisis: fecha, correccion });
  return { ...base, que: 'creado', ref: analisis[analisis.length - 1], anterior: undefined,
           convive: otra ? _otDe(otra.correccion) : null };
}

/* Forma canonica de un valor para compararlo por contenido: claves ordenadas y
 * las undefined afuera, que es como queda despues de pasar por JSON (la fusion
 * del 409 arma el documento nuevo a partir del JSON del servidor). */
function _canon(v){
  if (Array.isArray(v)) return '[' + v.map(_canon).join(',') + ']';
  if (v && typeof v === 'object'){
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort()
      .map(k => JSON.stringify(k) + ':' + _canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v ?? null);
}

/** Deshace lo que escribieron varias llamadas a aplicarCorreccion, en orden
 *  inverso. `snaps` son sus resultados ({que|tipo, ref, anterior|corrAnterior,
 *  lote, fecha, escrita}). MUTA `analisis`. Devuelve cuantas pudo deshacer.
 *
 *  Si el guardado que fallo paso por un 409, nucleo.guardar() ya fusiono y
 *  REEMPLAZO todos los objetos de DATOS(): `ref` quedo huerfano y revertir a
 *  traves de el no tocaba nada, mientras la pantalla decia "no se registro
 *  nada". Por eso, si `ref` ya no esta en el array, se busca el registro por
 *  lote + fecha + el contenido exacto de la correccion escrita. */
export function revertirCorrecciones(analisis, snaps){
  const usados = new Set();
  let n = 0;
  for (let i = snaps.length - 1; i >= 0; i--){
    const s = snaps[i];
    const tipo = s.tipo || s.que;
    const anterior = 'corrAnterior' in s ? s.corrAnterior : s.anterior;
    let reg = analisis.includes(s.ref) ? s.ref : null;
    if (!reg && s.escrita){
      const L = String(s.lote ?? ''), clave = _canon(s.escrita);
      reg = analisis.find(a => !usados.has(a) && String(a.lote ?? '') === L
        && (a.fecha_analisis || '') === s.fecha && a.correccion && _canon(a.correccion) === clave) || null;
    }
    if (!reg) continue;   // ya no esta: no hay nada que revertir
    usados.add(reg);
    if (tipo === 'creado'){
      /* El registro lo creo aplicarCorreccion solo para la correccion. Si
       * mientras tanto alguien le cargo otra cosa (quimica), se saca la
       * correccion y el registro queda. */
      const soloCorreccion = Object.keys(reg).every(k => k === 'lote' || k === 'fecha_analisis' || k === 'correccion');
      if (soloCorreccion) analisis.splice(analisis.indexOf(reg), 1);
      else delete reg.correccion;
    } else if (anterior === undefined){
      delete reg.correccion;
    } else {
      reg.correccion = anterior;
    }
    n++;
  }
  return n;
}

/** Una correccion anulada es la que se registro por error y despues se cancelo.
 *
 *  La presencia del campo ES la anulacion: cualquier valor truthy cuenta, para
 *  que un `anulada: true` escrito a mano valga igual que el objeto completo.
 *  Y al reves: null, false, '' o {} son una correccion VIGENTE. El borde
 *  importa porque tratarlos como anulados haria desaparecer la correccion de la
 *  regla en silencio, y el lote se volveria a dosificar. */
export function esAnulada(correccion){
  return _veraz(correccion && correccion.anulada);
}

/* Veracidad al estilo Python, porque el otro lado de esta decision es
 * motor_correccion (`if c.get('anulada')`) y las dos capas tienen que coincidir
 * en TODOS los bordes. JS y Python no opinan igual: `{}` y `[]` son truthy en
 * JS y falsy en Python. Sin esto, un `anulada: {}` quedaria anulado para la
 * bitacora (tachado, con sello) y vigente para la regla, o sea que el lote
 * seguiria suprimido mientras la pantalla dice que se cancelo. */
function _veraz(v){
  if (!v) return false;                                   // null, false, '', 0, undefined, NaN
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

/** Marca como anulada la correccion del lote en esa fecha. MUTA el registro.
 *  Devuelve el objeto anterior de `anulada` (normalmente undefined) para poder
 *  revertir si el guardado falla, o null si no habia nada que anular.
 *
 *  NO se borra nada: la entrada queda en la bitacora con quien y cuando la
 *  anulo. Un registro de calidad no pierde informacion en silencio; que hubo un
 *  error y se corrigio es justamente lo que una auditoria quiere poder ver.
 *  Quien la lee para decidir si el lote se repropone es motor_correccion, que
 *  saltea las anuladas. */
export function anularCorreccion(analisis, lote, fecha, ot, quien){
  const L = String(lote ?? '');
  const OT = String(ot ?? '').trim();
  /* ESTE PREDICADO ES UN ESPEJO de motor_correccion._ultima_correccion y tiene
   * que seguir siendolo. Las cuatro condiciones estan porque las tiene Python:
   *
   *   1. `anulada` falsy  - saltear las ya anuladas. Ademas de correccion, es
   *      lo que hace que clicks sucesivos AVANCEN sobre los duplicados en vez
   *      de re-marcar siempre el mismo registro.
   *   2. `ot_n` no vacio  - los 1972 analisis de datos.json traen un objeto
   *      correccion y la mayoria son cascaras de la migracion del Excel. En 3
   *      claves reales la cascara va PRIMERA en el array: sin esta condicion se
   *      escribiria `anulada` sobre la cascara, que la bitacora ni siquiera
   *      muestra, y la correccion real quedaria intacta. Corrupcion sin rastro.
   *   3. la fecha se normaliza a 10 caracteres, como hace _fecha() en Python.
   *   4. el N de OT tiene que coincidir.
   *
   * El motivo de fondo: **(lote, fecha) NO identifica una correccion**. Sobre
   * datos.json hay 69 claves (lote, fecha_archivada) duplicadas, 16 de ellas
   * con dos o mas correcciones reales. Sin el resto de las condiciones, esto
   * anulaba una entrada distinta a la que la regla estaba mirando: la pantalla
   * decia "cancelado" y el lote seguia sin proponerse, para siempre.
   *
   * LO QUE EL ESPEJO TODAVIA NO CUBRE: Python no recorre datos['analisis']
   * crudo sino motor_fml._analisis_por_lote(), que descarta los registros
   * listados en `excepciones_analisis` con usar_registro == 'no'. Aca se
   * recorre el array entero. Hoy no diverge porque excepciones_analisis esta
   * vacio en datos.json; el dia que se use, un registro excluido con ot_n real
   * y la misma fecha archivada podria anularse en lugar del bueno. La
   * verificacion post-recarga de _ocAnularCorrecciones lo gritaria en rojo en
   * vez de tragarselo, pero conviene cerrarlo antes de empezar a usar las
   * excepciones. */
  const dia = s => String(s ?? '').slice(0, 10);
  const F = dia(fecha);
  const reg = (analisis || []).find(a => {
    if (String(a.lote ?? '') !== L) return false;
    const c = a.correccion;
    if (!c || typeof c !== 'object') return false;
    if (esAnulada(c)) return false;
    if (String(c.ot_n ?? '').trim() === '') return false;
    if (OT && String(c.ot_n ?? '').trim() !== OT) return false;
    return dia(c.fecha || a.fecha_analisis) === F;
  });
  if (!reg || !reg.correccion) return null;
  const anterior = reg.correccion.anulada;
  const marca = {
    fecha: (quien && quien.cuando) || '',
    por:   (quien && quien.por) || '',
  };
  reg.correccion.anulada = marca;
  /* Ademas de la referencia va la clave (lote, OT, dia) y la marca escrita:
   * con eso revertirAnulaciones encuentra el registro aunque `ref` haya
   * quedado huerfano por una fusion. */
  return { ref: reg, anterior, lote: L, ot: _otDe(reg.correccion), dia: F, marca: { ...marca } };
}

/** Deshace anularCorreccion(). Si antes no estaba anulada, saca el campo en vez
 *  de dejarlo en undefined: la clave presente se serializa distinto a la clave
 *  ausente, y esCorreccionReal la mira. */
export function revertirAnulacion(snap){
  if (!snap || !snap.ref || !snap.ref.correccion) return;
  if (snap.anterior === undefined) delete snap.ref.correccion.anulada;
  else snap.ref.correccion.anulada = snap.anterior;
}

/** Deshace varias anularCorreccion() sobre el array ACTUAL. Devuelve cuantas
 *  pudo deshacer.
 *
 *  Por que no alcanza con revertirAnulacion(snap): si el guardado fallo despues
 *  de un 409, nucleo.guardar() ya fusiono y reemplazo todos los objetos de
 *  DATOS(), asi que snap.ref es un huerfano. Revertir ahi no toca nada, la
 *  pantalla dice "no se cancelo nada" y la anulacion sigue en memoria: el
 *  proximo guardado la persiste, y reintentar anula OTRA correccion real (la
 *  siguiente no anulada de esa clave). Por eso, si ref ya no esta, se busca
 *  por lote + OT + dia y por la marca de anulacion que escribio esta llamada. */
export function revertirAnulaciones(analisis, snaps){
  const dia = s => String(s ?? '').slice(0, 10);
  const usados = new Set();
  let n = 0;
  for (let i = (snaps || []).length - 1; i >= 0; i--){
    const s = snaps[i];
    if (!s) continue;
    let reg = (analisis || []).includes(s.ref) ? s.ref : null;
    if (!reg && s.marca){
      const marca = _canon(s.marca);
      reg = (analisis || []).find(a => {
        if (usados.has(a) || String(a.lote ?? '') !== s.lote) return false;
        const c = a.correccion;
        if (!c || typeof c !== 'object') return false;
        return _otDe(c) === s.ot && dia(c.fecha || a.fecha_analisis) === s.dia && _canon(c.anulada) === marca;
      }) || null;
    }
    if (!reg || !reg.correccion) continue;
    usados.add(reg);
    revertirAnulacion({ ref: reg, anterior: s.anterior });
    n++;
  }
  return n;
}
