-- 0002_autenticacion_propia.sql
-- Reemplaza Cloudflare Access como mecanismo de identidad.
-- Los perfiles/roles existentes no se modifican.
--
-- `email` guarda el nombre de usuario (puede ser un email o no); se llama así
-- porque perfiles e historial ya usaban esa columna para la identidad.
--
-- El Worker crea estas mismas tablas al primer login si faltan
-- (prepararAutenticacion en src/auth.ts), con la cuenta admin / 1234. Por eso
-- todo es IF NOT EXISTS: da igual si corre antes o después.

CREATE TABLE IF NOT EXISTS usuarios (
  email         TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  nombre        TEXT,
  activo        INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  -- Puede crear, editar y eliminar usuarios.
  es_admin      INTEGER NOT NULL DEFAULT 0 CHECK (es_admin IN (0,1)),
  -- Tiene la contraseña inicial (1234): al entrar se le pide cambiarla.
  debe_cambiar  INTEGER NOT NULL DEFAULT 0 CHECK (debe_cambiar IN (0,1)),
  creado        TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL REFERENCES usuarios(email) ON DELETE CASCADE,
  creado     INTEGER NOT NULL,
  ultimo_uso INTEGER NOT NULL,
  vence      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sesiones_email ON sesiones(email);
CREATE INDEX IF NOT EXISTS idx_sesiones_vence ON sesiones(vence);
