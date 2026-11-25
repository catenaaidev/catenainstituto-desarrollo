/* ===== Lotes CIW — hojas de papel a PDF =====
 *
 * Convierte las hojas A4 (.orden-hoja) de una orden en un PDF, igual a como
 * salen impresas. El truco: html2canvas clona la pagina, y en el clon se pone
 * la clase printing-* en el body y se copian como reglas de pantalla todas
 * las de @media print. Asi se reusa el CSS de impresion que ya existe en vez
 * de mantener uno aparte.
 *
 * El PDF es imagen (sin texto seleccionable): alcanza para archivo.
 * Las librerias (js/vendor) se cargan recien al primer uso: no suman peso a
 * la carga de Lotes. */
'use strict';

const MARGEN_MM = 14;                 // el @page de index.html
const ANCHO_MM = 210 - 2 * MARGEN_MM; // 182
const ALTO_MM = 297 - 2 * MARGEN_MM;  // 269
const PX_POR_MM = 96 / 25.4;

/* ---------- cada hoja de la OT en UNA A4 ----------
 * Una hoja mas alta que el area util (182 x 269 mm) se achica lo justo para
 * entrar, con un 2% de aire. Se hace con zoom en la hoja (inline, justo antes
 * de imprimir y se quita despues) y no con reglas @media print: esas son una
 * foto fija (test/lotes-papel-intacto).
 * Piso: la mitad. Mas chico no se lee; una hoja que ni asi entra (un corte de
 * muchos lotes) sale en dos paginas. */
export const ESCALA_MIN = 0.5;
export function escalaA4(altoPx, anchoPx){
  const max = anchoPx * ALTO_MM / ANCHO_MM;
  if (!(altoPx > max) || !(anchoPx > 0)) return 1;
  return Math.max(ESCALA_MIN, Math.floor(max / altoPx * 0.98 * 100) / 100);
}

/* Mide cada .orden-hoja fuera de pantalla, al ancho util y sin lo que la
 * impresion le saca (sombra, margen, ancho maximo), y le pone el zoom que
 * necesita. Devuelve las escalas aplicadas (1 = no hizo falta).
 *
 * claseImpresion (opcional, ej. 'printing-ordencorr'): mide con las reglas de
 * @media print puestas, como pdfDeHojas. Hace falta cuando la hoja de pantalla
 * es bastante mas alta que la impresa (la Orden de correccion: campos con
 * borde y relleno, bandas de cada lote). Se ponen y se sacan sin soltar el
 * hilo, asi que el navegador no llega a pintar nada distinto. */
export function ajustarHojasA4(contenedor, claseImpresion){
  const hojas = contenedor ? [...contenedor.querySelectorAll('.orden-hoja')] : [];
  if (!hojas.length) return [];
  const caja = document.createElement('div');
  caja.style.cssText = `position:absolute;left:-10000px;top:0;width:${ANCHO_MM}mm;visibility:hidden`;
  document.body.appendChild(caja);
  let st = null;
  const teniaClase = claseImpresion && document.body.classList.contains(claseImpresion);
  const idCont = claseImpresion ? contenedor.id : '';
  if (claseImpresion){
    st = document.createElement('style');
    st.textContent = reglasDeImpresion(document);
    document.head.appendChild(st);
    document.body.classList.add(claseImpresion);
    /* La caja toma el id del contenedor mientras se mide: las reglas del
     * papel van atadas a el (#ocPaginas .orden-hoja td{padding}) y sin eso
     * la copia mide renglones mas altos que los impresos. */
    if (idCont){ contenedor.removeAttribute('id'); caja.id = idCont; }
  }
  try {
    return hojas.map(h => {
      h.style.zoom = '';
      const c = h.cloneNode(true);
      c.style.boxShadow = 'none'; c.style.borderRadius = '0'; c.style.maxWidth = 'none';
      c.style.padding = '0'; c.style.margin = '0'; c.style.minHeight = '0';
      /* Lo que se ve en pantalla pero no sale impreso (la banda de cada lote
       * de la Orden de correccion) no cuenta: se mide el papel. */
      c.querySelectorAll('.solo-pantalla').forEach(e => e.remove());
      caja.appendChild(c);
      const s = escalaA4(c.scrollHeight, caja.clientWidth);
      c.remove();
      if (s < 1) h.style.zoom = String(s);
      return s;
    });
  } finally {
    caja.remove();
    if (idCont) contenedor.id = idCont;
    if (st) st.remove();
    if (claseImpresion && !teniaClase) document.body.classList.remove(claseImpresion);
  }
}

export function soltarHojasA4(contenedor){
  if (contenedor) for (const h of contenedor.querySelectorAll('.orden-hoja')) h.style.zoom = '';
}

const _cargados = {};
function _script(src){
  if (!_cargados[src]) _cargados[src] = new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
  return _cargados[src];
}

async function _librerias(){
  await Promise.all([_script('/lotes/js/vendor/html2canvas.min.js'), _script('/lotes/js/vendor/jspdf.umd.min.js')]);
  return { html2canvas: window.html2canvas, jsPDF: window.jspdf.jsPDF };
}

/* Las reglas de dentro de @media print, como texto. Las hojas de otro origen
 * (fuentes de Google) tiran al leer cssRules: se saltean. */
export function reglasDeImpresion(doc){
  let css = '';
  for (const hoja of doc.styleSheets){
    let reglas;
    try { reglas = hoja.cssRules; } catch { continue; }
    for (const r of reglas){
      if (r.media && /\bprint\b/.test(r.media.mediaText))
        for (const sub of r.cssRules) css += sub.cssText + '\n';
    }
  }
  return css;
}

/* `unaPorPagina`: cada hoja entra entera en una pagina (se achica si hace
 * falta), como en la impresion de la OT. Si no, una hoja larga se corta en
 * varias paginas. */
export async function pdfDeHojas(contenedor, claseBody, { unaPorPagina = false } = {}){
  const { html2canvas, jsPDF } = await _librerias();
  const css = reglasDeImpresion(document);
  const anchoPx = Math.round(ANCHO_MM * PX_POR_MM);
  const hojas = [...contenedor.querySelectorAll('.orden-hoja')];
  if (!hojas.length) throw new Error('No hay hojas para guardar.');
  hojas.forEach((h, i) => { h.dataset.pdfHoja = String(i); });

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  try {
    for (let i = 0; i < hojas.length; i++){
      const canvas = await html2canvas(hojas[i], {
        scale: 2, backgroundColor: '#ffffff', windowWidth: anchoPx, logging: false,
        onclone: doc => {
          doc.body.classList.add(claseBody);
          const st = doc.createElement('style');
          st.textContent = css;
          doc.head.appendChild(st);
        },
      });
      const altoHojaMm = canvas.height * ANCHO_MM / canvas.width;
      if (unaPorPagina){
        // Entera en una pagina: si es mas alta que el area util, se achica
        // (no menos que ESCALA_MIN; mas larga que eso, se corta como siempre).
        const f = Math.min(1, ALTO_MM / altoHojaMm);
        if (f >= ESCALA_MIN){
          if (i) pdf.addPage();
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', MARGEN_MM + ANCHO_MM * (1 - f) / 2, MARGEN_MM,
                       ANCHO_MM * f, altoHojaMm * f);
          continue;
        }
      }
      // Una hoja mas alta que el area util se corta en varias paginas.
      const cortes = Math.max(1, Math.ceil(altoHojaMm / ALTO_MM - 0.02));
      const altoCortePx = Math.ceil(canvas.height / cortes);
      for (let c = 0; c < cortes; c++){
        const trozo = document.createElement('canvas');
        trozo.width = canvas.width;
        trozo.height = Math.min(altoCortePx, canvas.height - c * altoCortePx);
        trozo.getContext('2d').drawImage(canvas, 0, -c * altoCortePx);
        if (i || c) pdf.addPage();
        pdf.addImage(trozo.toDataURL('image/jpeg', 0.92), 'JPEG', MARGEN_MM, MARGEN_MM,
                     ANCHO_MM, trozo.height * ANCHO_MM / trozo.width);
      }
    }
  } finally {
    hojas.forEach(h => { delete h.dataset.pdfHoja; });
  }
  return pdf.output('blob');
}

export function descargar(blob, nombre){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
