/* ===== Lotes CIW — ¿la OT quedo guardada en la carpeta? (puro) =====
 *
 * Al imprimir, la OT anota ot.pdf = { estado, nombre, el }:
 *   carpeta        se escribio y al releer la carpeta el archivo esta
 *   sin-verificar  se escribio pero no aparece al releer
 *   descargado     sin carpeta o error: el PDF se bajo a Descargas
 *   papel          "Solo imprimir": no hay PDF
 * La web ve la carpeta de ESTA PC: si OneDrive ya lo subio a la nube lo dice
 * el icono de OneDrive, no la web. */
'use strict';

import { maximoSerie, formatearNumero } from './numero-ot.js';

const ETIQUETAS = {
  'carpeta':       { txt: '📁 ✓', clase: 'ok', title: 'PDF guardado en la carpeta de OT' },
  'sin-verificar': { txt: '⚠ sin verificar', clase: 'warn', title: 'Se escribió el PDF pero no apareció al releer la carpeta: revisalo' },
  'descargado':    { txt: '⚠ PDF descargado', clase: 'warn', title: 'No había carpeta conectada: el PDF quedó en Descargas, copialo a la carpeta' },
  'papel':         { txt: '⚠ solo papel', clase: 'warn', title: 'Se imprimió sin guardar el PDF en la carpeta' },
  // La OT se edito despues de imprimir (ot-editar.js).
  'viejo':         { txt: '⚠ PDF viejo · reimprimir', clase: 'warn', title: 'La OT se editó después de guardar el PDF: el de la carpeta no tiene los cambios' },
};

export function etiquetaPdf(ot){
  const p = ot && ot.pdf;
  const e = p && ETIQUETAS[p.estado];
  if (!e) return null;
  const extra = [p.nombre, p.el].filter(Boolean).join(' · ');
  return { ...e, title: e.title + (extra ? ': ' + extra : '') };
}

/* La web ya numero mas alto que lo ultimo que ve en la carpeta: casi siempre
 * es OneDrive que todavia no bajo las ordenes nuevas a esta PC. */
export function desfaseCarpeta({ nombres, web }, serie){
  if (!nombres) return null;
  const enCarpeta = (maximoSerie(nombres, serie) || { n: 0 }).n;
  const enWeb = Math.max(0, ...(web || []));
  return enWeb > enCarpeta ? { web: formatearNumero(enWeb, serie), carpeta: formatearNumero(enCarpeta, serie) } : null;
}
