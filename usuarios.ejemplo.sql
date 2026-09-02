-- Plantilla para dar de alta a las personas de la plataforma.
--
-- CÓMO USARLA
--   1. Copiá este archivo como  usuarios.sql
--   2. Reemplazá los ejemplos por los emails reales de Office 365
--   3. Corré:
--        npx wrangler d1 execute catenainstitute --remote --file=usuarios.sql
--
-- ⚠️ NO renombres este archivo: copialo. `usuarios.sql` está en .gitignore
--    justamente para que los emails del personal no terminen en el
--    repositorio, que hoy es público.
--
-- LOS ROLES
--   admin   → todo, incluidos los respaldos
--   editor  → carga y edita datos
--   lector  → solo mira
--
-- El rol es POR MÓDULO: la misma persona puede ser editor en Prensas y solo
-- lector en Lotes. Hay que poner una línea por persona y por módulo.
--
-- El email tiene que ser EXACTAMENTE el de Office 365 con el que entra por
-- Cloudflare Access, en minúsculas. Si no coincide, la persona entra al sitio
-- pero el portal le dice que no tiene permisos en ningún módulo.

INSERT OR REPLACE INTO perfiles (email, modulo, rol, nombre) VALUES

  -- Quien administra la plataforma: los tres módulos.
  ('tu.usuario@catenawines.com', 'prensas',  'admin', 'Tu Nombre'),
  ('tu.usuario@catenawines.com', 'barriles', 'admin', 'Tu Nombre'),
  ('tu.usuario@catenawines.com', 'lotes',    'admin', 'Tu Nombre'),

  -- Laboratorio: carga análisis en Prensas y Lotes, mira el mapa.
  ('laboratorio@catenawines.com', 'prensas',  'editor', 'Laboratorio'),
  ('laboratorio@catenawines.com', 'lotes',    'editor', 'Laboratorio'),
  ('laboratorio@catenawines.com', 'barriles', 'lector', 'Laboratorio'),

  -- Bodega: mueve barriles, mira el resto.
  ('bodega@catenawines.com', 'barriles', 'editor', 'Bodega'),
  ('bodega@catenawines.com', 'prensas',  'lector', 'Bodega'),
  ('bodega@catenawines.com', 'lotes',    'lector', 'Bodega'),

  -- Gerencia: solo consulta.
  ('gerencia@catenawines.com', 'prensas',  'lector', 'Gerencia'),
  ('gerencia@catenawines.com', 'lotes',    'lector', 'Gerencia'),
  ('gerencia@catenawines.com', 'barriles', 'lector', 'Gerencia');

-- Para ver quién quedó cargado:
--   npx wrangler d1 execute catenainstitute --remote --command "SELECT email, modulo, rol FROM perfiles ORDER BY email, modulo"
--
-- Para dar de baja a alguien de un módulo:
--   npx wrangler d1 execute catenainstitute --remote --command "DELETE FROM perfiles WHERE email='quien@catenawines.com' AND modulo='lotes'"
--
-- Para sacarle el acceso a TODO (además de quitarlo en Office 365):
--   npx wrangler d1 execute catenainstitute --remote --command "DELETE FROM perfiles WHERE email='quien@catenawines.com'"
