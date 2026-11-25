-- Vendimia V2: espacios de trabajo y libros independientes por periodo.
-- No modifica las tablas de trazabilidad V1 ni los modulos anteriores.
CREATE TABLE IF NOT EXISTS vend_periodos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL COLLATE NOCASE,
  anio INTEGER NOT NULL CHECK(anio BETWEEN 1900 AND 2200),
  desde TEXT NOT NULL,
  hasta TEXT,
  autor TEXT NOT NULL,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(anio,nombre),
  CHECK(hasta IS NULL OR hasta >= desde)
);
CREATE TABLE IF NOT EXISTS vend_libros (
  id TEXT PRIMARY KEY,
  periodo_id TEXT NOT NULL REFERENCES vend_periodos(id),
  plantilla_id TEXT NOT NULL,
  nombre TEXT NOT NULL COLLATE NOCASE,
  version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
  objeto TEXT,
  autor TEXT NOT NULL,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(periodo_id,nombre),
  CHECK((version=0 AND objeto IS NULL) OR (version>0 AND objeto IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS vend_libro_versiones (
  libro_id TEXT NOT NULL REFERENCES vend_libros(id),
  version INTEGER NOT NULL CHECK(version >= 0),
  objeto TEXT,
  autor TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (datetime('now')),
  operacion TEXT NOT NULL,
  PRIMARY KEY(libro_id,version),
  UNIQUE(libro_id,operacion),
  CHECK((version=0 AND objeto IS NULL) OR (version>0 AND objeto IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS vend_libros_periodo ON vend_libros(periodo_id,plantilla_id);
