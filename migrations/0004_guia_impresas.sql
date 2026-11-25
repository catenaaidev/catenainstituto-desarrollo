-- Guía de trabajos: cada impresión numerada (serie principal de la carpeta
-- OneDrive) con la foto de la hoja tal como salió. Va aparte de
-- guia_trabajos: la guía viva se manda entera en cada guardado y no tiene
-- que cargar con el historial.
CREATE TABLE IF NOT EXISTS guia_impresas (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  numero  TEXT NOT NULL,
  fecha   TEXT NOT NULL,
  por     TEXT,
  json    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS guia_impresas_numero ON guia_impresas (numero);
