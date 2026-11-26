-- Vendimia V7: trabajo por lote/vasija con formularios web, revisión técnica,
-- OT con aprobación y ejecución separadas, nutrientes a 24 h programados en el
-- servidor y cola de impresión. Solo agrega tablas: no toca datos existentes.

-- Permisos específicos de Vendimia (además del rol del módulo).
-- admin: todo. tecnico: aprueba criterios y OT. operario: ejecuta OT.
CREATE TABLE IF NOT EXISTS vend_permisos (
  email TEXT PRIMARY KEY,
  tecnico INTEGER NOT NULL DEFAULT 0 CHECK (tecnico IN (0,1)),
  operario INTEGER NOT NULL DEFAULT 0 CHECK (operario IN (0,1)),
  autor TEXT NOT NULL,
  actualizado TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Criterios técnicos versionados. Cada evaluación guarda la versión usada.
CREATE TABLE IF NOT EXISTS vend_criterios (
  version TEXT PRIMARY KEY,
  fuente TEXT NOT NULL,
  json TEXT NOT NULL,
  vigente INTEGER NOT NULL DEFAULT 1 CHECK (vigente IN (0,1)),
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Fuente: "Criterio de corrección Rev 01 2021.xlsx" (REV 01, 13/04/21).
-- Límite máx y Esperado son valores distintos y se guardan por separado.
INSERT OR IGNORE INTO vend_criterios (version, fuente, json) VALUES (
 'ph-rev01-2021', 'Criterio de corrección Rev 01 2021.xlsx · Sheet1',
 '{"parametro":"pH","etapas":{"mosto":"Mostos","post_descube":"Primera corrección post descube","crianza":"Crianza de vinos"},
   "grupos":[
    {"nombre":"Cabernet Sauvignon - Cabernet Franc - Petit Verdot","variedades":["cabernet sauvignon","cabernet franc","petit verdot"],"natural":false,"mosto":[3.65,3.6],"post_descube":[3.75,3.7],"crianza":[3.79,3.75]},
    {"nombre":"Malbec","variedades":["malbec"],"natural":false,"mosto":[3.7,3.65],"post_descube":[3.7,3.65],"crianza":[3.75,3.7]},
    {"nombre":"Pinot Noir - Grenache","variedades":["pinot noir","grenache"],"natural":false,"mosto":[3.45,3.4],"post_descube":[3.55,3.5],"crianza":[3.65,3.6]},
    {"nombre":"Chardonnay - Torrontés","variedades":["chardonnay","torrontes"],"natural":false,"mosto":[3.45,3.4],"post_descube":[3.45,3.4],"crianza":[3.45,3.4]},
    {"nombre":"Sauvignon Blanc","variedades":["sauvignon blanc"],"natural":false,"mosto":[3.45,3.4],"post_descube":[3.35,3.4],"crianza":[3.35,3.3]},
    {"nombre":"Vinos naturales: Malbec - Bonarda","variedades":["malbec","bonarda"],"natural":true,"mosto":[3.65,3.6],"post_descube":[3.65,3.6],"crianza":[3.65,3.6]},
    {"nombre":"Vinos naturales: Criolla - Moscatel","variedades":["criolla","moscatel"],"natural":true,"mosto":[3.45,3.4],"post_descube":[3.45,3.4],"crianza":[3.45,3.4]},
    {"nombre":"Vinos naturales: Chardonnay","variedades":["chardonnay"],"natural":true,"mosto":[3.45,3.4],"post_descube":[3.45,3.4],"crianza":[3.45,3.4]}],
   "fin_fa":{"parametro":"Az. Red.","unidad":"g/L","limite":1.64,"comparacion":"menor_estricto","estado":"provisoria","nota":"Pendiente de confirmar denominación y unidad antes de habilitarla en producción."}}'
);

-- Registros de análisis y control por vasija (formularios web).
-- tipo: analisis_inicial | post_correccion | control | fin_fa
CREATE TABLE IF NOT EXISTS vend_registros (
  id TEXT PRIMARY KEY,
  periodo_id TEXT NOT NULL REFERENCES vend_periodos(id),
  vasija TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('analisis_inicial','post_correccion','control','fin_fa')),
  fecha_muestra TEXT NOT NULL,
  datos TEXT NOT NULL DEFAULT '{}',
  responsable TEXT NOT NULL DEFAULT '',
  observaciones TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  anulado INTEGER NOT NULL DEFAULT 0 CHECK (anulado IN (0,1)),
  op TEXT NOT NULL UNIQUE,
  autor TEXT NOT NULL,
  registrado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS vend_registros_lote ON vend_registros(periodo_id, vasija, fecha_muestra);
-- Toda corrección conserva el valor anterior, autor y fecha.
CREATE TABLE IF NOT EXISTS vend_registros_cambios (
  registro_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  datos_antes TEXT NOT NULL,
  autor TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (registro_id, version)
);

-- Órdenes de trabajo del flujo por lote.
-- estado: borrador | aprobada | programada | emitida | en_ejecucion | ejecutada | parcial | cancelada
CREATE TABLE IF NOT EXISTS vend_ot (
  id TEXT PRIMARY KEY,
  numero TEXT NOT NULL UNIQUE,
  periodo_id TEXT NOT NULL REFERENCES vend_periodos(id),
  vasija TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('th2','siembra','nutrientes','movimiento','descube','desvinado','agregado')),
  estado TEXT NOT NULL,
  datos TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  origen_id TEXT,
  aprobada_por TEXT, aprobada_en TEXT,
  programada_para TEXT,
  emitida_en TEXT,
  ejecucion TEXT,
  autor TEXT NOT NULL,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS vend_ot_lote ON vend_ot(periodo_id, vasija, tipo);
CREATE INDEX IF NOT EXISTS vend_ot_agenda ON vend_ot(estado, programada_para);
-- Una sola OT de nutrientes por siembra, aunque se reintente.
CREATE UNIQUE INDEX IF NOT EXISTS vend_ot_nutrientes_unica ON vend_ot(origen_id) WHERE tipo = 'nutrientes';
CREATE TABLE IF NOT EXISTS vend_ot_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ot_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  evento TEXT NOT NULL,
  datos TEXT NOT NULL DEFAULT '{}',
  autor TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS vend_ot_eventos_ot ON vend_ot_eventos(ot_id, id);
CREATE TABLE IF NOT EXISTS vend_ot_numeros (anio INTEGER PRIMARY KEY, ultimo INTEGER NOT NULL);
-- Idempotencia: una misma operación (doble clic, reintento) se aplica una vez.
CREATE TABLE IF NOT EXISTS vend_operaciones (op TEXT PRIMARY KEY, respuesta TEXT NOT NULL, fecha TEXT NOT NULL DEFAULT (datetime('now')));

-- Decisiones técnicas trazadas: no requiere TH2, confirmación de pH, fin FA.
CREATE TABLE IF NOT EXISTS vend_decisiones (
  id TEXT PRIMARY KEY,
  periodo_id TEXT NOT NULL,
  vasija TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('no_requiere_th2','confirmar_ph','fin_fa')),
  registro_id TEXT,
  criterio_version TEXT,
  resultado TEXT NOT NULL DEFAULT '{}',
  motivo TEXT NOT NULL DEFAULT '',
  autor TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS vend_decisiones_lote ON vend_decisiones(periodo_id, vasija, tipo);

-- Movimientos: solicitado ≠ ejecutado. La ubicación cambia solo al ejecutar.
CREATE TABLE IF NOT EXISTS vend_movs (
  id TEXT PRIMARY KEY,
  periodo_id TEXT NOT NULL,
  ot_id TEXT,
  fecha TEXT NOT NULL,
  origen TEXT NOT NULL,
  destino TEXT NOT NULL,
  tipo TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0 CHECK (total IN (0,1)),
  cantidad REAL,
  unidad TEXT NOT NULL DEFAULT 'L',
  responsable TEXT NOT NULL DEFAULT '',
  observaciones TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'solicitado' CHECK (estado IN ('solicitado','ejecutado','cancelado')),
  ejecutado_por TEXT, ejecutado_en TEXT, cantidad_real REAL,
  autor TEXT NOT NULL,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS vend_movs_lote ON vend_movs(periodo_id, estado);

-- Impresoras de red. Nacen inactivas: no se imprime hasta configurar y probar.
CREATE TABLE IF NOT EXISTS impresoras (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE COLLATE NOCASE,
  ip TEXT NOT NULL,
  protocolo TEXT NOT NULL CHECK (protocolo IN ('raw9100','ipp')),
  puerto INTEGER NOT NULL CHECK (puerto BETWEEN 1 AND 65535),
  papel TEXT NOT NULL DEFAULT 'A4',
  copias INTEGER NOT NULL DEFAULT 1 CHECK (copias BETWEEN 1 AND 10),
  automatico INTEGER NOT NULL DEFAULT 0 CHECK (automatico IN (0,1)),
  activa INTEGER NOT NULL DEFAULT 0 CHECK (activa IN (0,1)),
  autor TEXT NOT NULL,
  actualizado TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Cola persistente. clave = OT + versión + impresión: evita duplicados.
-- estado: en_cola | enviado | confirmado | error | cancelado
-- ('enviado' = el agente lo entregó a la impresora; 'confirmado' = una persona
-- confirmó que salió en papel).
CREATE TABLE IF NOT EXISTS impresion_trabajos (
  id TEXT PRIMARY KEY,
  clave TEXT NOT NULL UNIQUE,
  ot_id TEXT NOT NULL,
  numero TEXT NOT NULL,
  version INTEGER NOT NULL,
  impresora_id TEXT,
  documento TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'en_cola' CHECK (estado IN ('en_cola','tomado','enviado','confirmado','error','cancelado')),
  reimpresion INTEGER NOT NULL DEFAULT 0,
  intentos INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  autor TEXT NOT NULL,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  tomado_hasta TEXT
);
CREATE INDEX IF NOT EXISTS impresion_cola ON impresion_trabajos(estado, creado);
