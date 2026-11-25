/* ===================== CRITERIOS DE ALERTA DE PRENSAS =====================
   Fuente única de los umbrales que deciden las alertas de Prensas: NO OK,
   atención, alto riesgo, salto de AV, vencidos y la dosis de la Acción Rápida.

   Los valores viven en el documento, en config.alertas, y se editan desde la
   pestaña ⚙️ Configuración. Un documento sin esa clave (o con un campo vacío o
   inválido) usa los valores por defecto, que son los que la app tuvo siempre.

   Lo leen dos páginas: la app (app.js) y el reporte que arma el servidor
   (src/prensas/reporte-plantilla.ts). Por eso es un script clásico que publica
   globales, igual que reglas-av.js, y además exporta para los tests.

   El −999 del AV NO es un criterio: es el centinela de "medición inválida" y
   queda fijo. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const ALERTAS_DEFAULT = {
    ph_max: 4,
    av_max: 1,
    gluc_max: 3,
    malico_max: 0.5,
    av_atencion: 0.85,
    av_salto: 0.3,
    vencido_dias: 30,
    proximo_dias: 21,
    accion_ml: 250,
  };

  /* Un recuadro por criterio en la pestaña Configuración, en este orden.
     `regla` arma la frase que explica cuándo salta la alerta con el valor dado. */
  const CAMPOS_ALERTAS = [
    { k: 'ph_max', grupo: 'NO OK', titulo: 'pH alto', unidad: '',
      regla: v => `El lote es NO OK si el pH es mayor a ${v}.` },
    { k: 'av_max', grupo: 'NO OK', titulo: 'Acidez volátil alta', unidad: 'g/L',
      regla: v => `El lote es NO OK si la AV es mayor o igual a ${v} g/L (una AV de −999 también es NO OK).` },
    { k: 'gluc_max', grupo: 'NO OK', titulo: 'Glucosa/Fructosa alta', unidad: 'g/L',
      regla: v => `El lote es NO OK si Gluc/Fruc es mayor a ${v} g/L. También lo manda a Alto riesgo.` },
    { k: 'malico_max', grupo: 'NO OK', titulo: 'Ácido málico alto', unidad: 'g/L',
      regla: v => `El lote es NO OK si el málico es mayor a ${v} g/L. Junto con la AV de atención, lo manda a Alto riesgo.` },
    { k: 'av_atencion', grupo: 'Atención y riesgo', titulo: 'AV de atención', unidad: 'g/L',
      regla: v => `Un lote OK con AV mayor a ${v} g/L queda "en atención". Con málico alto, pasa a Alto riesgo.` },
    { k: 'av_salto', grupo: 'Atención y riesgo', titulo: 'Salto de AV', unidad: 'g/L',
      regla: v => `Va a Alto riesgo si la AV sube ${v} g/L o más respecto del análisis anterior.` },
    { k: 'vencido_dias', grupo: 'Frecuencia de análisis', titulo: 'Análisis vencido', unidad: 'días', int: true,
      regla: v => `El lote está vencido si pasaron más de ${v} días desde su último análisis.` },
    { k: 'proximo_dias', grupo: 'Frecuencia de análisis', titulo: 'Próximo a vencer', unidad: 'días', int: true,
      regla: (v, r) => `Está próximo a vencer entre los ${v} y los ${r.vencido_dias} días sin análisis.` },
    { k: 'accion_ml', grupo: 'Acción Rápida (SO₂)', titulo: 'Dosis por vasija', unidad: 'mL',
      regla: v => `La Acción Rápida propone ${v} mL de Solución 1.030 por barril o vasija.` },
  ];

  /* Un valor utilizable: número finito y no negativo. Acepta coma decimal. */
  function valorValido(v) {
    if (v === '' || v == null) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  /* Los criterios vigentes: config.alertas sobre los valores por defecto,
     campo por campo. Lo que falte o no sea válido cae al valor por defecto. */
  function reglasAlertas(config) {
    const guardado = (config && config.alertas) || {};
    const r = {};
    for (const k of Object.keys(ALERTAS_DEFAULT)) {
      const v = valorValido(guardado[k]);
      r[k] = v == null ? ALERTAS_DEFAULT[k] : v;
    }
    return r;
  }

  /* Avisos sobre combinaciones que no tienen sentido (no bloquean el guardado). */
  function avisosAlertas(r) {
    const avisos = [];
    if (r.proximo_dias > r.vencido_dias)
      avisos.push('"Próximo a vencer" es mayor que "Análisis vencido": ningún lote va a quedar como próximo a vencer.');
    if (r.av_atencion >= r.av_max)
      avisos.push('La AV de atención es igual o mayor que la AV de NO OK: ningún lote va a quedar "en atención".');
    return avisos;
  }

  return { ALERTAS_DEFAULT, CAMPOS_ALERTAS, reglasAlertas, avisosAlertas, valorValido };
});
