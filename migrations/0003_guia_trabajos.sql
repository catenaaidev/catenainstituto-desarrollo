-- Guía de trabajos (sección Órdenes de trabajo): UNA sola guía viva, de
-- Lotes y Prensas a la vez. Va aparte de `documento` (su CHECK solo admite
-- un módulo) para que guardarla nunca choque con un guardado de Lotes.
CREATE TABLE IF NOT EXISTS guia_trabajos (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  version  INTEGER NOT NULL DEFAULT 0,
  json     TEXT    NOT NULL,
  autor    TEXT,
  guardado TEXT
);
