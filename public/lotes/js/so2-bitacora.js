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

/** Engancha la correccion al analisis del lote en esa fecha; si no hay ninguno,
 *  crea un registro nuevo. MUTA `analisis`.
 *
 *  Devuelve { que, ref, anterior }:
 *    que      - 'creado' o 'actualizado'
 *    ref      - referencia directa al objeto de analisis afectado
 *    anterior - la correccion que tenia antes (puede ser undefined si no habia)
 *
 *  Devolver la referencia y el estado previo evita que los llamadores que
 *  necesitan hacer rollback repitan el mismo find(lote+fecha). La forma
 *  unica garantiza que un campo nuevo en el predicado no cree dos versiones
 *  distintas del lookup.
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
  const existente = (analisis || []).find(a =>
    String(a.lote ?? '') === L && (a.fecha_analisis || '') === fecha);
  if (existente){
    const anterior = existente.correccion;
    existente.correccion = correccion;
    return { que: 'actualizado', ref: existente, anterior };
  }
  analisis.push({ lote: L, fecha_analisis: fecha, correccion });
  return { que: 'creado', ref: analisis[analisis.length - 1], anterior: undefined };
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
  reg.correccion.anulada = {
    fecha: (quien && quien.cuando) || '',
    por:   (quien && quien.por) || '',
  };
  return { ref: reg, anterior };
}

/** Deshace anularCorreccion(). Si antes no estaba anulada, saca el campo en vez
 *  de dejarlo en undefined: la clave presente se serializa distinto a la clave
 *  ausente, y esCorreccionReal la mira. */
export function revertirAnulacion(snap){
  if (!snap || !snap.ref || !snap.ref.correccion) return;
  if (snap.anterior === undefined) delete snap.ref.correccion.anulada;
  else snap.ref.correccion.anulada = snap.anterior;
}
