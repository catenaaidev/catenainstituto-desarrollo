"""Incorpora las 4 plantillas oficiales de V8 sin modificar sus bytes ni V7."""
import base64,hashlib,importlib.util,json,sys,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('generador',root/'scripts/generar-plantillas-vendimia.py'); m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
items=[('flujo-blanco-v1','Ingreso / molienda','1 Blanco.xlsx'),('flujo-tinto-v1','Ingreso / molienda','1 Tinto.xlsx'),('flujo-desvin-roll-v1','Fin FA / descube','11 OT DESVIN ROLL.xlsx'),('flujo-desvin-v1','Fin FA / descube','11 OT Desvin.xlsx')]
entries=[]
with zipfile.ZipFile(sys.argv[1]) as z:
 for tid,stage,name in items:
  raw=z.read(next(n for n in z.namelist() if Path(n).name==name)); snapshot,stats,warnings=m.convert(raw,tid)
  # Celdas de respuesta vacías no materializadas en el XML original.
  if 'desvin' in tid:
   sheet=snapshot['sheets'][1]; present={(c['r'],c['c']) for c in sheet['celldata']}
   for row,col in [(5,9),*((r,c) for r in (19,40,61) for c in (2,8))]:
    if (row-1,col-1) not in present: sheet['celldata'].append({'r':row-1,'c':col-1,'v':{}})
   sheet['celldata'].sort(key=lambda c:(c['r'],c['c']))
  entries.append(dict(id=tid,stage=stage,name=name,sha256=hashlib.sha256(raw).hexdigest(),sheets=stats,warnings=warnings,originalBase64=base64.b64encode(raw).decode(),snapshot=snapshot))
p=root/'src/vendimia/plantillas-flujo-data.ts';p.write_text("// Generado por scripts/generar-formularios-flujo.py.\nimport type {Plantilla} from './plantillas-data';\nexport const PLANTILLAS_FLUJO: Plantilla[] = "+json.dumps(entries,ensure_ascii=False,separators=(',',':'))+';\n')
(root/'docs/vendimia-flujo-catalogo.json').write_text(json.dumps([{k:v for k,v in e.items() if k not in ('originalBase64','snapshot')} for e in entries],ensure_ascii=False,indent=2)+'\n')
print('Cuatro originales incorporados byte por byte')
