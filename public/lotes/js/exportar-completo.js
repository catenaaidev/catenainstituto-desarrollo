/* ===== Lotes CIW — exportación íntegra del documento =====
 * La exportación común resume Lotes, Análisis y Movimientos. Esta conserva
 * además todas las secciones que viven en el documento, para poder entregar
 * una copia completa sin cambiar ni guardar ningún dato. */
'use strict';

const NOMBRES = {
  meta: 'Metadatos',
  config: 'Configuración',
  lotes: 'Lotes',
  analisis: 'Análisis',
  movimientos: 'Movimientos',
  estado_lote: 'Estados de lote',
  excepciones_analisis: 'Excepciones de análisis',
  vasijas: 'Vasijas',
  mermas: 'Mermas',
  recorridas: 'Recorridas',
  ordenes_trabajo: 'Órdenes de trabajo',
  agenda: 'Agenda',
};

const ORDEN = Object.keys(NOMBRES);

function valorExcel(valor){
  if (valor == null) return '';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return valor;
}

/* Excel no acepta más de 32767 caracteres por celda: SheetJS tira error y no
 * baja nada (le pasó a una orden de corrección con muchos lotes). El texto
 * largo sigue en columnas de continuación (lotes, lotes_2, …), sin cortar. */
const MAX_CELDA = 32767;
const MAX_HOJA = 31;

function filaPlana(fila){
  const plana = {};
  for (const [clave, original] of Object.entries(fila || {})) {
    const valor = valorExcel(original);
    if (typeof valor !== 'string' || valor.length <= MAX_CELDA) { plana[clave] = valor; continue; }
    for (let i = 0; i * MAX_CELDA < valor.length; i++) {
      plana[i ? `${clave}_${i + 1}` : clave] = valor.slice(i * MAX_CELDA, (i + 1) * MAX_CELDA);
    }
  }
  return plana;
}

function columnasDe(filas){
  const claves = [];
  for (const fila of filas) {
    for (const clave of Object.keys(fila)) if (!claves.includes(clave)) claves.push(clave);
  }
  return claves.map((clave) => [clave, clave]);
}

function filasDeObjeto(objeto, claveId){
  return Object.entries(objeto || {}).map(([clave, valor]) => {
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) return filaPlana({ [claveId]: clave, ...valor });
    return filaPlana({ [claveId]: clave, valor });
  });
}

function filasClaveValor(objeto){
  return Object.entries(objeto || {}).map(([clave, valor]) => filaPlana({ clave, valor }));
}

function tituloDe(clave){
  return NOMBRES[clave] || clave.replaceAll('_', ' ').replace(/\b\w/g, (letra) => letra.toUpperCase());
}

function hoja(nombre, filas){
  return { nombre, columnas: columnasDe(filas), filas };
}

/** Convierte el documento completo en hojas aptas para CIW_EXPORTAR_HOJAS. */
export function hojasDocumentoCompleto(datos){
  const documento = datos || {};
  const hojas = [];
  const usadas = new Set();

  for (const clave of ORDEN) {
    if (!(clave in documento)) continue;
    usadas.add(clave);
    const valor = documento[clave];
    if (clave === 'meta') hojas.push(hoja(tituloDe(clave), [filaPlana(valor)]));
    else if (clave === 'config') hojas.push(hoja(tituloDe(clave), filasClaveValor(valor)));
    else if (clave === 'estado_lote') hojas.push(hoja(tituloDe(clave), filasDeObjeto(valor, 'lote')));
    else if (Array.isArray(valor)) hojas.push(hoja(tituloDe(clave), valor.map(filaPlana)));
    else if (valor && typeof valor === 'object') hojas.push(hoja(tituloDe(clave), filasDeObjeto(valor, 'clave')));
    else hojas.push(hoja(tituloDe(clave), [filaPlana({ valor })]));
  }

  for (const [clave, valor] of Object.entries(documento)) {
    if (usadas.has(clave)) continue;
    if (Array.isArray(valor)) hojas.push(hoja(tituloDe(clave), valor.map(filaPlana)));
    else if (valor && typeof valor === 'object') hojas.push(hoja(tituloDe(clave), filasDeObjeto(valor, 'clave')));
    else hojas.push(hoja(tituloDe(clave), [filaPlana({ valor })]));
  }
  return nombresValidos(hojas);
}

/* Excel tampoco acepta nombres de hoja de más de 31 caracteres ni repetidos. */
function nombresValidos(hojas){
  const usados = new Set();
  for (const h of hojas) {
    let nombre = h.nombre.slice(0, MAX_HOJA);
    for (let n = 2; usados.has(nombre.toLowerCase()); n++) nombre = h.nombre.slice(0, MAX_HOJA - String(n).length - 1) + ' ' + n;
    usados.add(nombre.toLowerCase());
    h.nombre = nombre;
  }
  return hojas;
}

/** Descarga una copia completa, sin modificar el documento cargado. */
export function descargarDocumentoCompleto(datos, fecha = new Date()){
  if (typeof window.CIW_EXPORTAR_HOJAS !== 'function') {
    window.CI?.informar?.({ titulo: 'No se pudo exportar', texto: 'Recargá la página e intentá de nuevo.' });
    return false;
  }
  const dia = fecha.toISOString().slice(0, 10);
  window.CIW_EXPORTAR_HOJAS(`Lotes CIW — documento completo (${dia}).xlsx`, hojasDocumentoCompleto(datos));
  return true;
}
