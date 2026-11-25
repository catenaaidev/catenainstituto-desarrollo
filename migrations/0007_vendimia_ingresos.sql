CREATE TABLE IF NOT EXISTS vend_ingresos (
 periodo_id TEXT PRIMARY KEY REFERENCES vend_periodos(id),
 lote TEXT NOT NULL, nombre_lote TEXT NOT NULL, variedad TEXT NOT NULL DEFAULT '', vasija TEXT NOT NULL,
 recepcion TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0,
 estado TEXT NOT NULL DEFAULT 'borrador' CHECK(estado IN ('borrador','en_proceso','finalizado')),
 autor TEXT NOT NULL, actualizado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS vend_ingresos_lote ON vend_ingresos(lote,vasija);
