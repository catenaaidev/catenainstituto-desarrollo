/* ===================== SALTO DE ACIDEZ VOLÁTIL =====================
   Regla: si el AV sube >= 0.3 g/L entre el análisis anterior y el actual de un
   mismo lote, se lanza alerta. Detecta subidas rápidas de volátil durante la
   crianza aunque el valor todavía esté por debajo del NO OK (AV >= 1).

   Tratamiento del -999 (medición inválida): NO rompe la cadena y NO entra como
   número. Se puentea hasta el último AV válido, de modo que 1.06 -> -999 -> 1.18
   compara 1.06 contra 1.18. Un delta contra -999 daría ~1000 g/L, sin sentido.
   El -999 sigue marcando NO OK por su propia regla (REGLAS.AV_INVALIDA).

   Alcance: solo el último par válido. La alerta refleja el estado ACTUAL del
   lote y se apaga sola cuando entra un análisis que no sube.

   Vive en shared/ para poder testearse con `node --test` fuera del browser:
   la lógica de Alto riesgo es solo frontend y de otro modo quedaría sin cobertura. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const AV_SALTO = 0.3;

  /* AV utilizable para comparar: descarta vacíos, no numéricos y el centinela -999. */
  function avComparable(v) {
    if (v === '' || v == null) return null;
    const n = parseFloat(String(v).replace(',', '.'));
    if (isNaN(n) || n === -999) return null;
    return n;
  }

  /* El AV se registra con 2 decimales; sin redondear, 0.7 - 0.4 da
     0.29999999999999993 y un salto legítimo de 0.30 no dispararía. */
  const red2 = n => Math.round(n * 100) / 100;

  /* rows: análisis de UN lote, ya ordenados cronológicamente y sin separadores
     (tal como los deja evaluarRiesgo en app.js).
     Devuelve null, o {delta, ant, act, avAnt, avAct} si el salto llega al umbral. */
  function saltoAV(rows, umbral) {
    const u = umbral == null ? AV_SALTO : umbral;
    if (!Array.isArray(rows) || rows.length < 2) return null;

    const act = rows[rows.length - 1];
    const avAct = avComparable(act && act.av);
    if (avAct === null) return null;           // sin valor actual utilizable no hay delta

    for (let i = rows.length - 2; i >= 0; i--) {
      const avAnt = avComparable(rows[i].av);
      if (avAnt === null) continue;            // puentea -999 y vacíos
      const delta = red2(avAct - avAnt);
      return delta >= u ? { delta, ant: rows[i], act, avAnt, avAct } : null;
    }
    return null;                               // ningún anterior válido
  }

  return { saltoAV, avComparable, AV_SALTO };
});
