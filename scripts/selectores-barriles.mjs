// Selectores de Barriles compartidos entre el test de colores congelados, el
// extractor de la foto del papel y el test que la vigila (Etapa 3 de la
// estética, Task 2). Viven en un solo lugar para no repetir la misma regex en
// varios archivos y que se desincronicen.

/* Selectores "con significado": el color ES el dato (el equipo lo lee de
 * memoria en la nave). Incluye el mapa 2D, la escena 3D, el feedback del
 * escáner, toda la cámara, el modo por lote, inventario/altas/pedidos/
 * historial, rótulos/cifras/cuentas y los avisos de conexión/solo lectura. */
export const CON_SIGNIFICADO = new RegExp([
  String.raw`\.celda\b`, String.raw`\.grilla\b`, String.raw`\.leyenda \.muestra`, '#cont3d', '#vacio3d', '#tooltip3d',
  String.raw`\.fb-libre`, '#escFeedback', String.raw`\.inp-libre\.error`, '#escResumen', String.raw`\.esc-res-`, 'esc-vencida',
  'esc-contador', '#escInstrucciones',
  // toda la cámara
  String.raw`Cam\b`, String.raw`Cam[A-Z.\s]`, 'Camara', String.raw`\.cam-`, 'bar-paso', '#barCandidatos', '#barLoteManual',
  'n-barril', '#barBtn',
  // modo por lote
  'modo-lote', '#chipModoLote',
  // inventario, altas, pedidos, historial
  String.raw`\.p-(lleno|vacio|mermo|tanque|barrica|revisar|revisado)\b`, 'fila-revisar', 'motivo-(revisar|edicion)',
  String.raw`\.ped-tipo`, 'marca-(on|off)', String.raw`Previo\.malo`, String.raw`\.btn\.peligro`, String.raw`\.ped-aviso`,
  // rótulos, cifras, cuentas, velo, solo lectura, cartel de lado
  String.raw`\.rot-(verde|blanca|nose|buscando)`, String.raw`\.tab-(alerta|ok)\b`, '(ini|prog)-cuenta',
  '#veloSinConexion', '#avisoSoloLectura', '#cartelLado',
].join('|'));

/* Selectores de "papel": lo que sale impreso (rótulos A4, hoja del mapa en
 * #areaImpresion, Registro impreso). Las tarjetas .reg-* se imprimen tal cual
 * la pantalla, así que son papel; el buscador, los meses y los botones de
 * acción del Registro NO se imprimen (se excluyen con el lookahead negativo). */
export const PAPEL_BARRILES =
  /ot-rot|rot-hoja|-print\b|imprimiendo-|#areaImpresion|solo-impresion|\.reg-(?!barra\b|buscador\b|como\b|meses\b|mes\b|acciones\b)/;

/* El celular y las pantallas táctiles (hover/coarse) no imprimen: las reglas
 * de esos @media no son papel aunque toquen un selector de PAPEL_BARRILES. */
export function sinCelular(reglas) {
  return reglas.filter((r) => !/^@media \((max-width:760px|pointer:coarse)\)>/.test(r));
}
