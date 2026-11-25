export const esquema: Record<string, {label: string; fields: {key:string;label:string;type:string;required:boolean}[]}> = {
  "recepciones": {
    "label": "Recepciones",
    "fields": [
      {
        "key": "proveedor",
        "label": "Proveedor",
        "type": "text",
        "required": false
      },
      {
        "key": "vinedo",
        "label": "Viñedo",
        "type": "text",
        "required": false
      },
      {
        "key": "parcela",
        "label": "Parcela",
        "type": "text",
        "required": false
      },
      {
        "key": "cuartel",
        "label": "Cuartel",
        "type": "text",
        "required": false
      },
      {
        "key": "cosecha",
        "label": "Tipo de cosecha",
        "type": "text",
        "required": false
      },
      {
        "key": "transporte",
        "label": "Transporte",
        "type": "text",
        "required": false
      },
      {
        "key": "recipiente",
        "label": "Tipo recipiente",
        "type": "text",
        "required": false
      },
      {
        "key": "bins",
        "label": "Cantidad recipientes",
        "type": "number",
        "required": false
      },
      {
        "key": "ot",
        "label": "Número OT",
        "type": "text",
        "required": false
      }
    ]
  },
  "pesajes": {
    "label": "Pesajes",
    "fields": [
      {
        "key": "recepcion_id",
        "label": "ID recepción",
        "type": "text",
        "required": true
      },
      {
        "key": "bruto",
        "label": "Peso bruto kg",
        "type": "number",
        "required": true
      },
      {
        "key": "tara",
        "label": "Tara kg",
        "type": "number",
        "required": true
      },
      {
        "key": "comprobante",
        "label": "Comprobante",
        "type": "text",
        "required": false
      }
    ]
  },
  "moliendas": {
    "label": "Molienda",
    "fields": [
      {
        "key": "ot",
        "label": "Orden de trabajo",
        "type": "text",
        "required": true
      },
      {
        "key": "turno",
        "label": "Turno",
        "type": "text",
        "required": false
      },
      {
        "key": "tipo",
        "label": "Tipo molienda",
        "type": "text",
        "required": false
      },
      {
        "key": "manejo",
        "label": "Convencional u orgánico",
        "type": "text",
        "required": false
      },
      {
        "key": "prensado",
        "label": "Prensado",
        "type": "text",
        "required": false
      },
      {
        "key": "hielo",
        "label": "Hielo seco",
        "type": "text",
        "required": false
      },
      {
        "key": "bins",
        "label": "Bins",
        "type": "number",
        "required": false
      },
      {
        "key": "racimos",
        "label": "Racimo entero bins",
        "type": "number",
        "required": false
      },
      {
        "key": "descobajado",
        "label": "Descobajado bins",
        "type": "number",
        "required": false
      },
      {
        "key": "estrujado",
        "label": "Estrujado",
        "type": "text",
        "required": false
      },
      {
        "key": "so2",
        "label": "SO₂",
        "type": "text",
        "required": false
      },
      {
        "key": "merma",
        "label": "Merma",
        "type": "text",
        "required": false
      },
      {
        "key": "emitio",
        "label": "Emitió",
        "type": "text",
        "required": false
      },
      {
        "key": "recibio",
        "label": "Recibió",
        "type": "text",
        "required": false
      }
    ]
  },
  "distribuciones": {
    "label": "Distribución",
    "fields": [
      {
        "key": "molienda_id",
        "label": "ID molienda",
        "type": "text",
        "required": true
      },
      {
        "key": "vasija",
        "label": "Vasija destino",
        "type": "text",
        "required": true
      },
      {
        "key": "parcela",
        "label": "Parcela",
        "type": "text",
        "required": false
      },
      {
        "key": "cantidad",
        "label": "Cantidad",
        "type": "number",
        "required": true
      },
      {
        "key": "unidad",
        "label": "Unidad (kg o L)",
        "type": "unit",
        "required": true
      },
      {
        "key": "bins",
        "label": "Bins",
        "type": "number",
        "required": false
      },
      {
        "key": "racimos",
        "label": "Racimo entero",
        "type": "text",
        "required": false
      },
      {
        "key": "descobajado",
        "label": "Descobajado",
        "type": "text",
        "required": false
      },
      {
        "key": "estrujado",
        "label": "Estrujado",
        "type": "text",
        "required": false
      },
      {
        "key": "so2",
        "label": "SO₂",
        "type": "text",
        "required": false
      },
      {
        "key": "merma",
        "label": "Merma",
        "type": "text",
        "required": false
      }
    ]
  },
  "analisis": {
    "label": "Análisis",
    "fields": [
      {
        "key": "vasija",
        "label": "Vasija",
        "type": "text",
        "required": false
      },
      {
        "key": "parametro",
        "label": "Parámetro",
        "type": "text",
        "required": true
      },
      {
        "key": "resultado",
        "label": "Resultado",
        "type": "number",
        "required": true
      },
      {
        "key": "unidad",
        "label": "Unidad",
        "type": "text",
        "required": false
      },
      {
        "key": "etapa",
        "label": "Etapa (inicial / objetivo / chequeo)",
        "type": "text",
        "required": false
      }
    ]
  },
  "agregados": {
    "label": "Agregados",
    "fields": [
      {
        "key": "ot",
        "label": "Orden de trabajo",
        "type": "text",
        "required": false
      },
      {
        "key": "vasija",
        "label": "Vasija",
        "type": "text",
        "required": false
      },
      {
        "key": "producto",
        "label": "Agregado",
        "type": "text",
        "required": true
      },
      {
        "key": "cantidad",
        "label": "Cantidad",
        "type": "number",
        "required": true
      },
      {
        "key": "unidad",
        "label": "Unidad",
        "type": "text",
        "required": true
      },
      {
        "key": "dosis",
        "label": "Dosis indicada",
        "type": "text",
        "required": false
      },
      {
        "key": "lote_insumo",
        "label": "Lote del insumo",
        "type": "text",
        "required": false
      },
      {
        "key": "estado",
        "label": "Estado",
        "type": "text",
        "required": false
      },
      {
        "key": "emitio",
        "label": "Emitió",
        "type": "text",
        "required": false
      },
      {
        "key": "recibio",
        "label": "Recibió",
        "type": "text",
        "required": false
      }
    ]
  },
  "tintos": {
    "label": "Fermentación tintos",
    "fields": [
      {
        "key": "vasija",
        "label": "Vasija",
        "type": "text",
        "required": true
      },
      {
        "key": "recepcion",
        "label": "Fecha recepción",
        "type": "date",
        "required": false
      },
      {
        "key": "bins",
        "label": "Bins",
        "type": "number",
        "required": false
      },
      {
        "key": "kg",
        "label": "Kg estimados",
        "type": "number",
        "required": false
      },
      {
        "key": "tipo_vasija",
        "label": "Tipo vasija",
        "type": "text",
        "required": false
      },
      {
        "key": "manejo",
        "label": "Manejo",
        "type": "text",
        "required": false
      },
      {
        "key": "sangria",
        "label": "Sangría %",
        "type": "number",
        "required": false
      },
      {
        "key": "litros_retirados",
        "label": "Litros retirados",
        "type": "number",
        "required": false
      },
      {
        "key": "vv",
        "label": "Relación V/V",
        "type": "text",
        "required": false
      },
      {
        "key": "so2",
        "label": "Dosis SO₂ g/qq",
        "type": "text",
        "required": false
      },
      {
        "key": "mbk",
        "label": "MBK g",
        "type": "text",
        "required": false
      },
      {
        "key": "solucion",
        "label": "Solución 1030 mL",
        "type": "text",
        "required": false
      },
      {
        "key": "levadura",
        "label": "Levadura",
        "type": "text",
        "required": false
      },
      {
        "key": "dosis",
        "label": "Dosis indicada",
        "type": "text",
        "required": false
      },
      {
        "key": "cantidad",
        "label": "Cantidad indicada",
        "type": "text",
        "required": false
      },
      {
        "key": "ot",
        "label": "OT",
        "type": "text",
        "required": false
      },
      {
        "key": "descube",
        "label": "Fecha descube",
        "type": "date",
        "required": false
      },
      {
        "key": "destino",
        "label": "Vasija destino",
        "type": "text",
        "required": false
      },
      {
        "key": "lote_destino",
        "label": "Lote destino",
        "type": "text",
        "required": false
      },
      {
        "key": "estado",
        "label": "Estado",
        "type": "text",
        "required": false
      }
    ]
  },
  "blancos": {
    "label": "Fermentación blancos",
    "fields": [
      {
        "key": "vasija",
        "label": "Vasija",
        "type": "text",
        "required": true
      },
      {
        "key": "recepcion",
        "label": "Fecha recepción",
        "type": "date",
        "required": false
      },
      {
        "key": "bins",
        "label": "Bins",
        "type": "number",
        "required": false
      },
      {
        "key": "kg",
        "label": "Kg estimados",
        "type": "number",
        "required": false
      },
      {
        "key": "tipo_vasija",
        "label": "Tipo vasija",
        "type": "text",
        "required": false
      },
      {
        "key": "manejo",
        "label": "Manejo",
        "type": "text",
        "required": false
      },
      {
        "key": "prensado",
        "label": "Prensado protectivo u oxidativo",
        "type": "text",
        "required": false
      },
      {
        "key": "desborre",
        "label": "Tanque de desborre",
        "type": "text",
        "required": false
      },
      {
        "key": "litros_desborre",
        "label": "Litros desborre",
        "type": "number",
        "required": false
      },
      {
        "key": "inicio_desborre",
        "label": "Inicio desborre",
        "type": "date",
        "required": false
      },
      {
        "key": "fin_desborre",
        "label": "Fin desborre",
        "type": "date",
        "required": false
      },
      {
        "key": "ntu",
        "label": "Turbidez NTU inicial",
        "type": "number",
        "required": false
      },
      {
        "key": "ntu_final",
        "label": "Turbidez NTU final",
        "type": "number",
        "required": false
      },
      {
        "key": "mbk",
        "label": "MBK g",
        "type": "text",
        "required": false
      },
      {
        "key": "solucion",
        "label": "Solución 1030 mL",
        "type": "text",
        "required": false
      },
      {
        "key": "fin_fermentacion",
        "label": "Fin fermentación",
        "type": "date",
        "required": false
      },
      {
        "key": "lote_destino",
        "label": "Lote destino",
        "type": "text",
        "required": false
      },
      {
        "key": "destino",
        "label": "Vasija destino",
        "type": "text",
        "required": false
      },
      {
        "key": "lugar",
        "label": "Bodega o CIW",
        "type": "text",
        "required": false
      },
      {
        "key": "temperatura",
        "label": "Temperatura mosto",
        "type": "number",
        "required": false
      },
      {
        "key": "so2",
        "label": "SO₂",
        "type": "text",
        "required": false
      },
      {
        "key": "levadura",
        "label": "Levadura",
        "type": "text",
        "required": false
      },
      {
        "key": "dosis",
        "label": "Dosis indicada",
        "type": "text",
        "required": false
      },
      {
        "key": "cantidad",
        "label": "Cantidad indicada",
        "type": "text",
        "required": false
      },
      {
        "key": "ot",
        "label": "OT",
        "type": "text",
        "required": false
      },
      {
        "key": "estado",
        "label": "Estado",
        "type": "text",
        "required": false
      }
    ]
  },
  "mediciones": {
    "label": "Brix y temperatura",
    "fields": [
      {
        "key": "vasija",
        "label": "Vasija",
        "type": "text",
        "required": true
      },
      {
        "key": "brix",
        "label": "Brix",
        "type": "number",
        "required": true
      },
      {
        "key": "temperatura",
        "label": "Temperatura °C",
        "type": "number",
        "required": true
      },
      {
        "key": "muestra",
        "label": "Muestra",
        "type": "text",
        "required": false
      },
      {
        "key": "azucar",
        "label": "Azúcar g/L",
        "type": "number",
        "required": false
      },
      {
        "key": "ph",
        "label": "pH",
        "type": "number",
        "required": false
      },
      {
        "key": "az_red",
        "label": "Az Red",
        "type": "number",
        "required": false
      },
      {
        "key": "av",
        "label": "AV",
        "type": "number",
        "required": false
      },
      {
        "key": "mov06",
        "label": "Movimiento 06 h",
        "type": "text",
        "required": false
      },
      {
        "key": "mov14",
        "label": "Movimiento 14 h",
        "type": "text",
        "required": false
      },
      {
        "key": "mov18",
        "label": "Movimiento 18 h",
        "type": "text",
        "required": false
      },
      {
        "key": "mov22",
        "label": "Movimiento 22 h",
        "type": "text",
        "required": false
      }
    ]
  },
  "movimientos": {
    "label": "Movimientos",
    "fields": [
      {
        "key": "origen",
        "label": "Vasija origen",
        "type": "text",
        "required": true
      },
      {
        "key": "destino",
        "label": "Vasija destino",
        "type": "text",
        "required": true
      },
      {
        "key": "tipo",
        "label": "Operación",
        "type": "text",
        "required": true
      },
      {
        "key": "cantidad",
        "label": "Cantidad trasladada",
        "type": "number",
        "required": true
      },
      {
        "key": "unidad",
        "label": "Unidad (kg o L)",
        "type": "unit",
        "required": true
      },
      {
        "key": "ot",
        "label": "OT",
        "type": "text",
        "required": false
      }
    ]
  },
  "checklist": {
    "label": "Actividades técnicas",
    "fields": [
      {
        "key": "actividad",
        "label": "Actividad",
        "type": "text",
        "required": true
      },
      {
        "key": "horario",
        "label": "Horario",
        "type": "text",
        "required": false
      },
      {
        "key": "frecuencia",
        "label": "Frecuencia",
        "type": "text",
        "required": false
      },
      {
        "key": "estado",
        "label": "Estado",
        "type": "status",
        "required": true
      },
      {
        "key": "responsable_asignado",
        "label": "Responsable asignado",
        "type": "text",
        "required": false
      }
    ]
  },
  "degustaciones": {
    "label": "Degustaciones",
    "fields": [
      {
        "key": "vasija",
        "label": "Vasija",
        "type": "text",
        "required": false
      },
      {
        "key": "brix",
        "label": "Brix",
        "type": "number",
        "required": false
      },
      {
        "key": "temperatura",
        "label": "Temperatura °C",
        "type": "number",
        "required": false
      },
      {
        "key": "evaluacion",
        "label": "Evaluación",
        "type": "text",
        "required": false
      },
      {
        "key": "criterio",
        "label": "Referencia de corrección",
        "type": "text",
        "required": false
      }
    ]
  },
  "lavados": {
    "label": "Lavado y sanitizado",
    "fields": [
      {
        "key": "ot",
        "label": "OT asociada",
        "type": "text",
        "required": false
      },
      {
        "key": "equipo",
        "label": "Equipo / sector",
        "type": "text",
        "required": true
      },
      {
        "key": "producto",
        "label": "Producto",
        "type": "text",
        "required": false
      },
      {
        "key": "ejecuto",
        "label": "Ejecutó",
        "type": "text",
        "required": false
      },
      {
        "key": "controlo",
        "label": "Controló",
        "type": "text",
        "required": false
      },
      {
        "key": "estado",
        "label": "Estado",
        "type": "status",
        "required": true
      }
    ]
  }
};
