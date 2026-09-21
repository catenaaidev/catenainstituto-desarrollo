/**
 * Las dos decisiones de las que depende que el trabajo de un operario sobreviva.
 *
 * El 16/09 se perdieron dos órdenes de vaciado porque la app preguntaba "¿tengo
 * algo sin subir?" mirando SOLO las celdas del mapa y los palets. Una orden del
 * escáner no toca ninguna celda, así que la respuesta era "no" y el estado local
 * se reemplazaba por el del servidor.
 *
 * La lección: no se infiere del contenido si hay trabajo sin confirmar, se marca
 * el hecho. `pendienteLocal` lo prende cada guardado y solo lo apaga un 200 del
 * servidor.
 *
 * Ojo con el alcance, que no es el mismo para las dos mitades del problema:
 * DETECTAR que hay trabajo sin confirmar sí cubre cualquier colección, incluidas
 * las que se agreguen después, porque el marcador se prende en `guardar()`, que
 * es por donde pasa toda escritura. RESOLVERLO no: la fusión de `sincronizar()`
 * recorre colección por colección una lista escrita a mano, y lo que no figura
 * ahí viene tal cual del servidor y pisa lo local. Ver el comentario de `serv`
 * en `sincronizar()` para la enumeración de lo que queda afuera.
 *
 * Se testea en test/barriles-pendientes.test.mjs.
 */

/**
 * ¿El estado local se fusiona con el del servidor, o se puede pisar?
 * Ante cualquier señal de trabajo sin confirmar: fusionar. Pisar es irreversible.
 */
function decidirSincronizacion({ pendienteLocal, cambiosBoxes, cambiosPalets }) {
  const hayTrabajo = !!pendienteLocal || cambiosBoxes > 0 || cambiosPalets > 0;
  return hayTrabajo ? 'fusionar' : 'adoptar';
}

/**
 * Qué hacer al abrir la página, según lo que haya de cada lado.
 *
 * - 'subir-local'      : hay trabajo sin confirmar; fusionar y subirlo YA.
 * - 'fusionar'         : hay copia local y foto de la última sincronización.
 * - 'adoptar-servidor' : no hay nada local que proteger.
 * - 'vacio'            : no hay nada en ningún lado.
 *
 * El marcador pesa más que todo lo demás: sin foto base no se puede calcular qué
 * cambió, pero eso jamás puede terminar en descartar lo que el operario cargó.
 */
function decidirArranque({ hayLocal, pendienteLocal, hayFotoBase, hayEstadoServidor }) {
  if (hayLocal && pendienteLocal) return 'subir-local';
  if (hayLocal && hayFotoBase) return 'fusionar';
  if (hayEstadoServidor) return 'adoptar-servidor';
  if (hayLocal) return 'subir-local';
  return 'vacio';
}

/**
 * Llegó el 200 del servidor. ¿Puedo apagar el marcador y adoptar lo que mandé?
 *
 * Solo si NADIE escribió mientras el POST viajaba. Un POST tarda cientos de
 * milisegundos y nada frena a `guardar()` en el medio: `sincronizando` frena a
 * `sincronizar()` y a `push()`, no a la interfaz. Si el operario escanea justo
 * ahí, esa orden NO viaja en el cuerpo que se posteó, y el código viejo igual
 * apagaba el marcador y pisaba `estado` con lo enviado: la orden desaparecía sin
 * dejar rastro (se reescribía localStorage y el arranque siguiente veía todo
 * limpio). Es la misma pérdida del 16/09 por otra puerta.
 *
 * El sello se incrementa con cada marcado. Se captura justo antes del POST y se
 * compara al recibir el 200:
 *  - 'adoptar-envio' : lo que mandé es todo lo que había; confirmado, apagar.
 *  - 'reintentar'    : el servidor confirmó lo anterior, pero lo nuevo sigue sin
 *                      confirmar. NO apagar el marcador, NO pisar `estado`, y
 *                      volver a mandar para que lo nuevo suba.
 *
 * Ante la duda (sellos no numéricos) se devuelve 'reintentar': reintentar de más
 * cuesta un POST; apagar de más cuesta el trabajo del operario.
 */
function decidirConfirmacion({ selloEnviado, selloActual }) {
  if (typeof selloEnviado !== 'number' || typeof selloActual !== 'number') return 'reintentar';
  return selloEnviado === selloActual ? 'adoptar-envio' : 'reintentar';
}

/**
 * Volvió el GET de `/estado` y estoy por pisar lo local con lo del servidor.
 * ¿Sigue siendo seguro pisar?
 *
 * Es la misma carrera de `decidirConfirmacion` por la tercera puerta. En
 * `sondear()`, la pregunta "¿tengo algo sin subir?" se hacía ANTES de pedir el
 * estado, y el GET tarda cientos de milisegundos: si el operario escanea en ese
 * hueco, `adoptar()` pisaba `estado`, apagaba el marcador que cubría la orden
 * nueva y reescribía localStorage. La orden desaparecía sin dejar rastro.
 *
 * Por eso la decisión se vuelve a tomar con la respuesta ya en la mano, y con
 * las dos señales que ya existen:
 *  - `hayPendientes`: el marcador más los diffs de celdas, recalculado recién.
 *  - el sello, que delata un guardado ocurrido durante el vuelo del GET aunque
 *    el marcador se haya apagado y vuelto a prender en el medio.
 *
 * Devuelve 'adoptar' (no había nada local que proteger) o 'fusionar' (apareció
 * trabajo sin confirmar: que lo resuelva `sincronizar()`, que no descarta nada).
 * Ante sellos que no son números, fusionar: fusionar de más cuesta un POST.
 *
 * No hay bucle: fusionar sube lo local y avanza la versión, así que la vuelta
 * siguiente ya no ve al servidor adelantado.
 */
function decidirAdopcion({ selloAntes, selloActual, hayPendientes }) {
  if (hayPendientes) return 'fusionar';
  return decidirConfirmacion({ selloEnviado: selloAntes, selloActual }) === 'adoptar-envio'
    ? 'adoptar'
    : 'fusionar';
}

globalThis.decidirSincronizacion = decidirSincronizacion;
globalThis.decidirArranque = decidirArranque;
globalThis.decidirConfirmacion = decidirConfirmacion;
globalThis.decidirAdopcion = decidirAdopcion;
