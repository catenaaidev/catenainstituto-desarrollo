"""Genera public/lotes/js/vasijas-padron.js desde la hoja "Inventario vasijas"
del Excel "Inventario de vasijas de CIW 2026.xlsx" (columnas B = N° de vasija,
C = Cap REAL, E = Vasija). La tabla de cubicacion se asigna por (tipo, Cap REAL).

Uso: python scripts/generar-padron-vasijas.py "<ruta al .xlsx>"
"""
import json
import sys

import openpyxl

TABLA = {
    ('ESFERA HORMIGON', 1500): 'esfera-1500',
    ('PILETA DE HORMIGON', 3000): 'pileta-30hl',
    ('TANQUE AC.INOX.', 4200): 'tanque-40hl',
    ('TANQUE AC.INOX.', 7500): 'tanque-75hl',
    ('TANQUE HORMIGON OVOIDE', 3300): 'huevo-33hl',
    ('TANQUE OVOIDE AC.INOX.', 2600): 'huevo-24hl',
}

wb = openpyxl.load_workbook(sys.argv[1], data_only=True, read_only=True)
ws = wb['Inventario vasijas']
filas = []
for r in ws.iter_rows(min_row=5, values_only=True):
    num, cap, tipo = r[1], r[2], r[4]
    if num is None:
        continue
    num = str(int(num)) if isinstance(num, (int, float)) else str(num).strip()
    tipo = str(tipo).strip()
    cap = int(cap)
    filas.append({'num': num, 'tipo': tipo, 'cap_real': cap,
                  'tabla': TABLA.get((tipo, cap)), 'activa': True})

CABECERA = '''/* ===== Lotes CIW — padron de vasijas fijas =====
 *
 * PADRON_INICIAL es GENERADO por scripts/generar-padron-vasijas.py desde
 * "Registro de Lotes CIW 2026/Inventario de vasijas de CIW 2026.xlsx" (Cap REAL).
 * Solo se usa para el boton "Cargar padron inicial": el padron vivo esta en
 * DATOS().vasijas y se edita en Configuracion. */
'use strict';

'''
FUNCIONES = '''
/* "T 201", "201", "tq201" -> "201". Sin digitos: el texto en mayusculas. */
export function normalizarNumVasija(x){
  const s = String(x ?? '').trim();
  const d = s.replace(/\\D/g, '');
  return d || s.toUpperCase().replace(/\\s+/g, '');
}

/* Fila activa del padron con ese numero, o null. */
export function buscarVasija(padron, texto){
  const n = normalizarNumVasija(texto);
  if (!n) return null;
  return (padron || []).find(v => v && v.activa !== false && normalizarNumVasija(v.num) === n) || null;
}
'''
with open('public/lotes/js/vasijas-padron.js', 'w', encoding='utf-8', newline='\n') as f:
    f.write(CABECERA)
    f.write('export const PADRON_INICIAL = ' + json.dumps(filas, ensure_ascii=False) + ';\n')
    f.write(FUNCIONES)
print(len(filas), 'vasijas;', sum(1 for x in filas if x['tabla']), 'con tabla')
