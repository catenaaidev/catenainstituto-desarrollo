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

globalThis.decidirSincronizacion = decidirSincronizacion;
globalThis.decidirArranque = decidirArranque;
