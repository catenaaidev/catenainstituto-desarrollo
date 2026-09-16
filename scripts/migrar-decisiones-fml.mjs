/**
 * Traduce las decisiones de FML de la hoja ESTADO_LOTE del Excel a la columna
 * `hace_fml` de la fila del lote en D1.
 *
 * Hasta el corte a web-only la decision de "este lote hace FML" vivia en una
 * hoja aparte del Excel y nunca se migro: en D1 esta cargada en 1 de 249 lotes.
 * Sin ella, la condicion `datos_operativos_incompletos` del tablero dispara en
 * 179 de 249 lotes en vez de los 40 que aprobaron los supervisores.
 *
 * Es idempotente y NO pisa: solo completa el lote que no tiene decision propia.
 * Correrla dos veces no propone nada la segunda.
 */

import { BLANCAS } from './sembrar-criterios-fml.mjs';

const blancas = new Set(BLANCAS);

/** El numero de lote llega como texto en la hoja y como texto o numero en D1. */
const clave = (v) => String(v ?? '').trim();

const texto = (v) => String(v ?? '').trim().toLowerCase();

const decidido = (v) => texto(v) === 'si' || texto(v) === 'no';

/**
 * @param lotes        las filas de `$.lotes` del documento, en su orden original
 * @param estadoLote   { numero de lote: valor de la columna fml_excluida }
 *
 * Devuelve los cambios con el **indice de la fila en el documento**, porque es
 * el que arma el `json_set('$.lotes[N].hace_fml')` del SQL.
 */
export function migrarDecisionesFml(lotes, estadoLote) {
  const hoja = new Map(Object.entries(estadoLote ?? {}).map(([k, v]) => [clave(k), texto(v)]));

  const cambios = [];
  const sinDecision = [];
  const salteados = { inactivos: 0, blancas: 0, ya_decididos: 0 };

  lotes.forEach((fila, indice) => {
    const numero = clave(fila.lote);
    const variedad = String(fila.variedad ?? '').trim();

    // La decision solo importa mientras el lote tenga vino.
    if (!(Number(fila.litros_actuales) > 0)) { salteados.inactivos += 1; return; }

    if (decidido(fila.hace_fml) || decidido(fila.fml_excluida)) { salteados.ya_decididos += 1; return; }

    /* Las blancas no se migran, y no es una simplificacion: el tablero le da
     * precedencia a la variedad por sobre ESTADO_LOTE, asi que un Chardonnay
     * con fml_excluida='no' igual queda excluido. Escribirle hace_fml='si'
     * al lote lo daria vuelta, porque en el motor web la fila le gana a la
     * config. La variedad define el caso general; el dato que no se escribe es
     * el que no puede contradecirla. */
    if (blancas.has(variedad)) { salteados.blancas += 1; return; }

    const enHoja = hoja.get(numero);
    if (!decidido(enHoja)) {
      sinDecision.push({ lote: numero, variedad, motivo: enHoja === undefined ? 'sin_fila' : enHoja });
      return;
    }

    // La hoja dice si esta EXCLUIDA; la columna del lote dice si HACE FML.
    cambios.push({ indice, lote: numero, variedad, valor: enHoja === 'si' ? 'no' : 'si' });
  });

  return { cambios, sinDecision, salteados };
}
