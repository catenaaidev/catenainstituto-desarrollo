-- Vendimia V6: precarga por Información ID, numeración en el servidor,
-- conexión entre planillas, etapas del circuito y cola de impresión de OT.
-- Solo agrega tablas e índices: no borra ni reescribe filas existentes.

-- Números de lote reservados por Vendimia. La PRIMARY KEY es el freno de
-- concurrencia: dos precargas simultáneas no pueden tomar el mismo número.
CREATE TABLE IF NOT EXISTS vend_numeros (
  lote       TEXT PRIMARY KEY CHECK (length(lote) = 5 AND lote GLOB '[0-9][0-9][0-9][0-9][0-9]'),
  periodo_id TEXT NOT NULL REFERENCES vend_periodos(id),
  autor      TEXT NOT NULL,
  creado     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Datos que una planilla comparte con las demás (mediciones de Brix y
-- temperatura, agregados, nutrientes, SO2). Se derivan de cada guardado del
-- libro; la planilla sigue siendo la fuente. Cada fila guarda de qué libro,
-- versión y hoja salió.
CREATE TABLE IF NOT EXISTS vend_hechos (
  id            TEXT PRIMARY KEY,
  periodo_id    TEXT NOT NULL,
  libro_id      TEXT NOT NULL,
  libro_version INTEGER NOT NULL,
  plantilla_id  TEXT NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('medicion','agregado','nutriente','so2')),
  lote          TEXT NOT NULL DEFAULT '',
  vasija        TEXT NOT NULL DEFAULT '',
  fecha         TEXT NOT NULL,
  fecha_origen  TEXT NOT NULL CHECK (fecha_origen IN ('celda','guardado')),
  hoja          TEXT NOT NULL,
  brix          REAL,
  temperatura   REAL,
  producto      TEXT,
  cantidad      TEXT,
  detalle       TEXT NOT NULL DEFAULT '{}',
  autor         TEXT NOT NULL,
  registrado    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS vend_hechos_lote ON vend_hechos(lote, vasija, fecha);
CREATE INDEX IF NOT EXISTS vend_hechos_libro ON vend_hechos(libro_id, fecha_origen, fecha);

-- Avance de cada lote por el circuito técnico. Manual: nada se marca solo.
CREATE TABLE IF NOT EXISTS vend_etapas (
  periodo_id TEXT NOT NULL REFERENCES vend_periodos(id),
  etapa      TEXT NOT NULL,
  estado     TEXT NOT NULL CHECK (estado IN ('pendiente','en_curso','hecha','no_aplica')),
  resultado  TEXT NOT NULL DEFAULT '',
  nota       TEXT NOT NULL DEFAULT '',
  autor      TEXT NOT NULL,
  fecha      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (periodo_id, etapa)
);
