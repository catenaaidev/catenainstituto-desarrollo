"""Lee "Lotes prensas <año>.xlsx" y escribe las filas crudas de LOTES y ANÁLISIS
en JSON, para que las convierta scripts/convertir-prensas.mjs.

    python scripts/leer-excel-prensas.py "<xlsx>" datos-origen/prensas-2025-crudo.json
"""
import datetime, json, sys
import openpyxl

def celda(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime('%Y-%m-%d')
    return v

def filas(ws, ancho):
    out = []
    for r in ws.iter_rows(min_row=3, values_only=True):
        r = list(r[:ancho]) + [None] * max(0, ancho - len(r))
        if r[0] is None or str(r[0]).strip() == '':
            continue
        out.append([celda(v) for v in r])
    return out

def main(xlsx, salida):
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    hoja_an = next(n for n in wb.sheetnames if 'LISIS' in n.upper())
    crudo = {'lotes': filas(wb['LOTES'], 17), 'analisis': filas(wb[hoja_an], 25)}
    with open(salida, 'w', encoding='utf-8') as f:
        json.dump(crudo, f, ensure_ascii=False)
    print(f"{len(crudo['lotes'])} lotes, {len(crudo['analisis'])} renglones de análisis -> {salida}")

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
