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
 * servidor. Así queda cubierta cualquier colección, incluidas las que se agreguen
 * después, sin depender de que alguien se acuerde de sumarla a una lista.
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

globalThis.decidirSincronizacion = decidirSincronizacion;
globalThis.decidirArranque = decidirArranque;
globalThis.decidirConfirmacion = decidirConfirmacion;
