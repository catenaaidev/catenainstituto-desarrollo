-- 0002_autenticacion_propia.sql
-- Reemplaza Cloudflare Access como mecanismo de identidad.
-- Los perfiles/roles existentes no se modifican.

CREATE TABLE usuarios (
  email         TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  nombre        TEXT,
  activo        INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado        TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sesiones (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL REFERENCES usuarios(email) ON DELETE CASCADE,
  creado     INTEGER NOT NULL,
  ultimo_uso INTEGER NOT NULL,
  vence      INTEGER NOT NULL
);

CREATE INDEX idx_sesiones_email ON sesiones(email);
CREATE INDEX idx_sesiones_vence ON sesiones(vence);
