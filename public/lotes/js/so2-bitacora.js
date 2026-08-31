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
