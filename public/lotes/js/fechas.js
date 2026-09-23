/* ===== Lotes CIW — fechas =====
 *
 * Unica frontera entre como se guarda una fecha y como se ve.
 *
 * El dato viaja SIEMPRE en ISO (YYYY-MM-DD), y eso no es una preferencia: las
 * etapas, el linaje, las alarmas, el motor FML y el orden de las tablas comparan
 * los textos de las fechas entre si, y solo el ISO ordena cronologicamente
 * comparando texto. Guardar dd/mm/aaaa pondria un 01/12 antes que un 02/03.
 *
 * En pantalla, en cambio, la fecha se lee dd/mm/aaaa. Antes cada vista resolvia
 * eso por su cuenta y por eso unas pestanas mostraban 2026-09-10 y otras
 * 10/09/2026. Ahora todas pasan por aca.
 *
 * Modulo puro: no toca el DOM, asi que los tests lo importan directo.
 */

/* \2 es un backreference: obliga a que los dos separadores sean el mismo, asi
 * que un '28/01-2026' pegado a medias del Excel no pasa por fecha. */
const _RE_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const _RE_DMY = /^(\d{1,2})([/-])(\d{1,2})\2(\d{4})$/;

const dos = n => String(n).padStart(2, '0');

/** Texto escrito o pegado -> ISO 'YYYY-MM-DD'.
 *
 *  Acepta las tres formas con las que una fecha llega del Excel: dd/mm/aaaa,
 *  dd-mm-aaaa y el ISO ya hecho.
 *
 *  Devuelve '' si el texto venia vacio y null si no es una fecha. La diferencia
 *  importa: borrar una fecha es una edicion valida, escribir cualquier cosa no,
 *  y el null es lo que hace que la celda se rechace en vez de guardar un texto
 *  que despues nadie puede comparar.
 */
export function aIso(texto){
  const t = String(texto ?? '').trim();
  if (t === '') return '';

  let a, m, d;
  const iso = _RE_ISO.exec(t);
  if (iso){
    a = +iso[1]; m = +iso[2]; d = +iso[3];
  } else {
    const dmy = _RE_DMY.exec(t);
    if (!dmy) return null;
    d = +dmy[1]; m = +dmy[3]; a = +dmy[4];
  }

  /* Tener la forma correcta no la hace una fecha real: el 31 de febrero no
   * existe. Se construye en UTC para que la zona horaria no corra el dia. */
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d)
    return null;

  return `${a}-${dos(m)}-${dos(d)}`;
}

/** ISO 'YYYY-MM-DD' -> 'dd/mm/aaaa', para mostrar.
 *
 *  Vacio da vacio. Lo que no sea un ISO se devuelve tal cual: en el Excel viejo
 *  quedaron fechas que nunca se normalizaron, y es preferible que se vea un dato
 *  raro a que desaparezca de la pantalla sin que nadie se entere.
 *
 *  Tolera un ISO con hora ('2026-09-10T14:30:00') porque algunos registros
 *  guardan el momento completo.
 */
export function fmtFecha(valor){
  const s = String(valor ?? '').trim();
  if (s === '') return '';

  const dia = s.slice(0, 10);
  const iso = _RE_ISO.exec(dia);
  if (!iso) return s;
  /* Solo se recorta si lo que sigue al dia es separador de hora, para no
   * romper un texto largo que arranque pareciendose a una fecha. */
  if (s.length > 10 && !/^[T\s]/.test(s.slice(10))) return s;

  return `${dos(+iso[3])}/${dos(+iso[2])}/${iso[1]}`;
}

/** 'YYYY-MM' (o un ISO completo) -> 'mm/aaaa', para el desplegable de meses.
 *  Igual que fmtFecha: lo que no entiende lo devuelve tal cual. */
export function fmtMes(valor){
  const s = String(valor ?? '').trim();
  if (s === '') return '';

  const m = /^(\d{4})-(\d{1,2})/.exec(s);
  if (!m) return s;
  return `${dos(+m[2])}/${m[1]}`;
}
