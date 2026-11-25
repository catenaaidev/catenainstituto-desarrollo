/* Suma una vendimia convertida (convertir-prensas.mjs) al documento de
 * Prensas. Puro: sin archivos ni red. Solo AGREGA lotes y análisis; si el
 * documento ya tiene algún lote o análisis del año se frena (importar dos
 * veces duplicaría todo). Degustaciones y agregados no se tocan. */
import { anioDeLote } from '../public/shared/anios.js';

export function fusionarAnioPrensas(doc, convertido, anio){
  const lotes = convertido.lotes || [], analisis = convertido.analisis || [];
  const ajenos = lotes.filter(l => anioDeLote(l.lote) !== anio).map(l => l.lote);
  if (ajenos.length) throw new Error(`el Excel trae lotes que no son de ${anio}: ${ajenos.slice(0, 10).join(', ')}`);
  const anAjenos = [...new Set(analisis.filter(a => anioDeLote(a.lote) !== anio).map(a => a.lote))];
  if (anAjenos.length) throw new Error(`el Excel trae análisis que no son de ${anio}: ${anAjenos.slice(0, 10).join(', ')}`);
  const yaEstan = (doc.lotes || []).filter(l => anioDeLote(l.lote) === anio);
  if (yaEstan.length) throw new Error(`el documento ya tiene ${yaEstan.length} lotes de ${anio}: no se importa dos veces`);
  // Un análisis huérfano del año (su lote se borró) también delata una importación previa.
  const anYa = (doc.analisis || []).filter(a => anioDeLote(a && a.lote) === anio);
  if (anYa.length) throw new Error(`el documento ya tiene ${anYa.length} análisis de ${anio}: no se importa dos veces`);

  const maestro = new Set(lotes.map(l => l.lote));
  const huerfanos = [...new Set(analisis.map(a => a.lote).filter(l => !maestro.has(l)))].sort((x, y) => x - y);
  return {
    doc: { ...doc, meta: { ...(doc.meta || {}), version: Number((doc.meta || {}).version || 0) + 1 },
           lotes: [...(doc.lotes || []), ...lotes], analisis: [...(doc.analisis || []), ...analisis] },
    reporte: { lotes: lotes.length, analisis: analisis.length, huerfanos },
  };
}
