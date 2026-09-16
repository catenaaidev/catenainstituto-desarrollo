/**
 * Arma el SQL de la migracion de FML.
 *
 * Esta separado del script que lo corre para poder probarlo: los tests de este
 * repo corren dentro del runtime real de Workers, asi que estas sentencias se
 * ejecutan contra el mismo motor que la nube en vez de revisarse a ojo.
 *
 * Dos cosas que parecen detalles y no lo son:
 *
 * - **Se parten los `json_set`.** SQLite admite 127 argumentos por funcion y
 *   cada campo son dos (ruta y valor), asi que 139 lotes en una sentencia la
 *   rompen.
 * - **Todas las sentencias llevan candado de version.** El equipo edita la web
 *   todos los dias; si alguien guardo entre la lectura y la escritura, la
 *   migracion no toca ninguna fila en vez de pisar lo que cargo.
 */

const MODULO = 'lotes';
const PARES_POR_SENTENCIA = 60;
const AUTOR = 'migracion-fml';

const esc = (s) => String(s ?? '').replace(/'/g, "''");

/**
 * @param version     la version que se leyo; es la del candado
 * @param cambios     los de migrarDecisionesFml: { indice, valor }
 * @param criterios   los de sembrarCriterios: { config, agregadas }
 * @param tieneConfig si el documento ya trae `$.config`
 *
 * Devuelve las sentencias sueltas (una por linea, para wrangler y para los
 * tests) y el archivo .sql completo con sus comentarios.
 */
export function construirSqlMigracion({ version, cambios, criterios, tieneConfig }) {
  const candado = `WHERE modulo = '${MODULO}' AND version = ${version}`;
  const sentencias = [];

  for (let i = 0; i < cambios.length; i += PARES_POR_SENTENCIA) {
    const pares = cambios
      .slice(i, i + PARES_POR_SENTENCIA)
      .map((c) => `'$.lotes[${c.indice}].hace_fml', '${esc(c.valor)}'`)
      .join(', ');
    sentencias.push(`UPDATE documento SET json = json_set(json, ${pares}) ${candado};`);
  }

  if (criterios.agregadas.length) {
    /* json_set no crea el padre y el hijo de un saque: si el documento no trae
     * `config`, hay que escribir el objeto entero. */
    const destino = tieneConfig
      ? `'$.config.criterios_fml', json('${esc(JSON.stringify(criterios.config))}')`
      : `'$.config', json('${esc(JSON.stringify({ criterios_fml: criterios.config }))}')`;
    sentencias.push(`UPDATE documento SET json = json_set(json, ${destino}) ${candado};`);
  }

  const resumen =
    `Migracion FML: ${cambios.length} decisiones de ESTADO_LOTE, ` +
    `${criterios.agregadas.length} claves de criterios`;

  /* El historial va ANTES del bump y con el mismo candado que el resto.
   *
   * Condicionarlo a que la version ya sea la nueva parece mas natural y es una
   * trampa: si otro guardo entre la lectura y la escritura, la base queda
   * justo en version+1 por su culpa, la condicion da verdadero igual y el
   * boton Historial anuncia una migracion que nunca se aplico. Con el candado
   * de siempre, o entran todas las sentencias o no entra ninguna. */
  sentencias.push(
    `INSERT INTO historial (modulo, version, ts, autor, email, resumen, detalle, forzado) ` +
      `SELECT '${MODULO}', ${version + 1}, datetime('now'), '${AUTOR}', 'migracion', '${esc(resumen)}', '[]', 0 ` +
      `WHERE (SELECT version FROM documento WHERE modulo = '${MODULO}') = ${version};`,
  );

  // La version sube al final: todas las sentencias de arriba dependen de la vieja.
  sentencias.push(
    `UPDATE documento SET json = json_set(json, '$.meta.version', ${version + 1}, ` +
      `'$.meta.autor', '${AUTOR}', '$.meta.actualizado', datetime('now')), ` +
      `version = ${version + 1}, autor = '${AUTOR}', guardado = datetime('now') ${candado};`,
  );

  const sql = [
    `-- ${resumen}`,
    `-- generado por scripts/aplicar-datos-fml.mjs sobre la version ${version}`,
    `-- Todas las sentencias exigen version = ${version}: si alguien guardo en el`,
    '-- medio, no tocan ninguna fila y el documento queda intacto.',
    '',
    ...sentencias,
    '',
  ].join('\n');

  return { sentencias, sql, resumen };
}
