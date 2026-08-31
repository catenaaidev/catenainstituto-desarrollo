/**
 * Exportación a Excel en el navegador — reemplaza a `openpyxl` del servidor.
 *
 * Las columnas y sus títulos son los mismos que armaba `exportar_xlsx()` en
 * Python, en el mismo orden, para que el archivo que baja sea el de siempre.
 *
 * Se hace del lado del navegador porque la nube no ejecuta Python. De paso el
 * servidor no tiene que armar un binario ni mantenerlo en memoria.
 */
(function () {
  'use strict';

  /** Columnas de Prensas: [clave en los datos, título de la columna]. */
  var COLUMNAS = {
    prensas: {
      LOTES: [
        ['lote', 'Lote'], ['variedad', 'Variedad'], ['origen', 'Lote de Origen'],
        ['ig', 'IG'], ['id_origen', 'ID Lote de Origen'], ['ot_prensado', 'OT de prensado'],
        ['litros', 'Litros Actuales'], ['dia_prensado', 'Día prensado'],
        ['prensa', 'Prensa'], ['so2_agregado', 'SO2 agregado'],
        ['comentario', 'Comentario'], ['accion', 'Acción'],
        ['comentario2', 'Comentario 2'], ['accion2', 'Acción 2'],
      ],
      ANALISIS: [
        ['lote', 'Lote'], ['mes', 'Mes'], ['fecha', 'Fecha de análisis'],
        ['etanol', 'Etanol [%]'], ['ph', 'PH'], ['av', 'Acidez Volátil [g/L]'],
        ['gluc', 'Gluc/Fruc'], ['malico', 'Ácido Málico [g/L]'],
        ['lactico', 'Ácido Láctico [g/ml]'], ['at', 'Acidez Total [g/L]'],
        ['azucar', 'Azúcar Reductor [g/L]'], ['so2l', 'SO2 L [mg/L]'],
        ['so2t', 'SO2 T [mg/L]'], ['ot', 'OT'],
      ],
    },
    lotes: {
      LOTES: [
        ['lote', 'Lote'], ['variedad', 'Variedad'], ['distrito', 'Distrito'],
        ['proyecto', 'Proyecto'], ['vinedo', 'Viñedo'], ['fecha_ingreso', 'Fecha de ingreso'],
        ['kilos', 'Kilos'], ['vasija_fa', 'Vasija FA'], ['vasija_actual', 'Vasija actual'],
        ['litros_actuales', 'Litros Actuales'], ['etapa', 'Etapa'],
        ['descube_fa', 'Descube FA'], ['mermo', 'Mermo'], ['hace_fml', 'Hace FML'],
      ],
      ANALISIS: [
        ['lote', 'Lote'], ['fecha_analisis', 'Fecha de análisis'], ['ph', 'PH'],
        ['av', 'Acidez Volátil [g/L]'], ['gluc_fruc', 'Gluc/Fruc'],
        ['malico', 'Ácido Málico [g/L]'], ['azucar_reductor', 'Azúcar Reductor [g/L]'],
        ['so2_libre', 'SO2 Libre [mg/L]'], ['so2_total', 'SO2 Total [mg/L]'],
      ],
      MOVIMIENTOS: [
        ['lote', 'Lote'], ['tipo', 'Tipo'], ['fecha', 'Fecha'],
        ['vasija_origen', 'Vasija origen'], ['vasija_destino', 'Vasija destino'],
        ['lote_destino', 'Lote destino'], ['litros', 'Litros'], ['estado', 'Estado'],
      ],
    },
  };

  /** Secciones de los datos que alimentan cada hoja. */
  var SECCIONES = {
    prensas: { LOTES: 'lotes', ANALISIS: 'analisis' },
    lotes: { LOTES: 'lotes', ANALISIS: 'analisis', MOVIMIENTOS: 'movimientos' },
  };

  function hoja(filas, columnas) {
    var datos = [columnas.map(function (c) { return c[1]; })];
    (filas || []).forEach(function (f) {
      datos.push(columnas.map(function (c) {
        var v = (f || {})[c[0]];
        return v === undefined || v === null ? '' : v;
      }));
    });
    return XLSX.utils.aoa_to_sheet(datos);
  }

  /**
   * Arma y baja el .xlsx del módulo. `datos` es el documento completo, tal como
   * lo tiene la app en memoria.
   */
  function exportar(modulo, datos) {
    if (typeof XLSX === 'undefined') {
      alert('No se pudo cargar la librería de Excel. Recargá la página e intentá de nuevo.');
      return;
    }
    var cols = COLUMNAS[modulo];
    var secs = SECCIONES[modulo];
    if (!cols) { alert('No sé exportar el módulo ' + modulo + '.'); return; }

    var wb = XLSX.utils.book_new();
    Object.keys(cols).forEach(function (nombreHoja) {
      var filas = (datos || {})[secs[nombreHoja]] || [];
      XLSX.utils.book_append_sheet(wb, hoja(filas, cols[nombreHoja]), nombreHoja);
    });

    var hoy = new Date().toISOString().slice(0, 10);
    var titulo = modulo === 'prensas' ? 'Lotes prensas' : 'Lotes CIW';
    XLSX.writeFile(wb, titulo + ' (export ' + hoy + ').xlsx');
  }

  window.CIW_EXPORTAR = exportar;
})();
