-- 0001_plataforma.sql — Base de la plataforma CIW
--
-- Fase 1: cada módulo guarda su documento completo (igual que su datos.json de
-- hoy). Las tablas normalizadas de Prensas llegan en la Fase 3 y las de
-- Barriles/Lotes en sus propias fases; la auditoría y los perfiles ya son
-- definitivos y los comparten los tres módulos.

-- ============ Perfiles y roles ============
-- El rol es POR MÓDULO: alguien puede cargar datos en Prensas y solo
-- consultar en Lotes.
CREATE TABLE perfiles (
  email   TEXT NOT NULL,
  modulo  TEXT NOT NULL CHECK (modulo IN ('prensas','barriles','lotes')),
  rol     TEXT NOT NULL CHECK (rol IN ('admin','editor','lector')),
  nombre  TEXT,
  creado  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, modulo)
);

-- ============ Documento por módulo (Fase 1) ============
CREATE TABLE documento (
  modulo    TEXT PRIMARY KEY CHECK (modulo IN ('prensas','barriles','lotes')),
  version   INTEGER NOT NULL DEFAULT 0,
  json      TEXT    NOT NULL,
  autor     TEXT,
  guardado  TEXT
);

-- ============ Historial de guardados ============
-- Reemplaza a backups/historial.jsonl. Lo lee el botón "🕘 Historial".
CREATE TABLE historial (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  modulo   TEXT NOT NULL,
  version  INTEGER NOT NULL,
  ts       TEXT NOT NULL,
  autor    TEXT,
  email    TEXT,              -- identidad verificada por Office 365
  resumen  TEXT,
  detalle  TEXT,              -- JSON
  forzado  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_historial_modulo ON historial(modulo, id DESC);

-- ============ Auditoría ============
-- Cada cambio queda registrado con quién, cuándo y los valores antes/después.
-- En la Fase 3, cuando existan tablas por fila, se llena por trigger.
CREATE TABLE auditoria (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  modulo    TEXT NOT NULL,
  tabla     TEXT NOT NULL,
  operacion TEXT NOT NULL,
  fila_id   TEXT,
  antes     TEXT,
  despues   TEXT,
  email     TEXT,
  fecha     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_auditoria_modulo_fecha ON auditoria(modulo, fecha DESC);

-- Identidad del usuario de la operación en curso. El Worker la escribe al
-- empezar cada escritura, dentro del mismo batch, para que los triggers de la
-- Fase 3 puedan registrar quién hizo el cambio (SQLite no tiene auth.uid()).
CREATE TABLE sesion_actual (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  email TEXT
);
INSERT INTO sesion_actual (id, email) VALUES (1, NULL);

-- ============ Configuración compartida ============
CREATE TABLE config (
  clave    TEXT PRIMARY KEY,
  valor    TEXT NOT NULL,
  updated  TEXT NOT NULL DEFAULT (datetime('now'))
);
