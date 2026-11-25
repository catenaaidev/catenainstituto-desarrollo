#!/usr/bin/env python3
"""Convierte copias de lectura de los XLSX originales al formato FortuneSheet.
No modifica ningún XLSX. Requiere openpyxl 3.1+. Uso: python ... 'Seccion vendimia.zip'."""
import base64, colorsys, datetime as dt, hashlib, io, json, re, sys, zipfile, posixpath
from pathlib import Path
from xml.etree import ElementTree as ET
from openpyxl import load_workbook
from openpyxl.styles.colors import COLOR_INDEX
from openpyxl.utils import get_column_letter
from openpyxl.utils.datetime import to_excel
from openpyxl.styles.numbers import is_date_format

ROOT=Path(__file__).resolve().parents[1]
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
THEME=['lt1','dk1','lt2','dk2','accent1','accent2','accent3','accent4','accent5','accent6','hlink','folHlink']
BORDER={n:i for i,n in enumerate(['','thin','hair','dotted','dashed','dashDot','dashDotDot','double','medium','mediumDashed','mediumDashDot','mediumDashDotDot','slantDashDot','thick']) if i}
CATALOG=[('molienda-ch-v1','Ingreso / molienda','A036 molienda'),('molienda-cs-v1','Ingreso / molienda','A072 molienda'),('agregados-v1','Agregados','B005 OT'),('tintos-v1','Seguimiento de FA','Planilla de Fermentación Tintos'),('blancos-v1','Seguimiento de FA','Planilla Fermentación blancos'),('brix-v1','Seguimiento de FA','RCI Control de Brix'),('movimientos-v1','Movimientos de vasijas','Planilla movimientos'),('checklist-v1','Actividades técnicas','Check list de actividades'),('criterios-v1','Corrección pH / referencias','Criterio de corrección'),('degustacion-v1','Controles complementarios','Degustación')]

def theme_colors(w):
    root=ET.fromstring(w.loaded_theme); scheme=root.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}clrScheme'); out={}
    if scheme is not None:
        for el in scheme:
            if len(el): out[el.tag.split('}')[-1]]=el[0].get('lastClr') or el[0].get('val')
    return out

def color(c,theme,default=None):
    if c is None:return default
    val=None
    if c.type=='rgb' and isinstance(c.rgb,str):val=c.rgb[-6:]
    elif c.type=='indexed' and 0<=c.indexed<len(COLOR_INDEX):val=COLOR_INDEX[c.indexed][-6:]
    elif c.type=='theme' and 0<=c.theme<len(THEME):val=theme.get(THEME[c.theme])
    if not isinstance(val,str) or not re.fullmatch('[0-9a-fA-F]{6}',val):return default
    rgb=[int(val[i:i+2],16)/255 for i in (0,2,4)]
    if c.tint:
        h,l,s=colorsys.rgb_to_hls(*rgb);l=l*(1+c.tint) if c.tint<0 else l*(1-c.tint)+c.tint;rgb=colorsys.hls_to_rgb(h,max(0,min(1,l)),s)
    return '#'+''.join(f'{round(v*255):02X}' for v in rgb)

def fmt_value(v,w):
    if isinstance(v,(dt.datetime,dt.date,dt.time,dt.timedelta)):return to_excel(v,w.epoch)
    if v is None or isinstance(v,(str,int,float,bool)):return v
    return str(v)

def raw_paths(b):
    z=zipfile.ZipFile(io.BytesIO(b)); rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    targets={el.get('Id'):el.get('Target') for el in rels}; root=ET.fromstring(z.read('xl/workbook.xml'))
    paths=[]
    for sh in root.findall('m:sheets/m:sheet',NS):
        t=targets[sh.get('{'+NS['r']+'}id')];paths.append(t.lstrip('/') if t.startswith('/') else posixpath.normpath(posixpath.join('xl',t)))
    return z,paths

def page_meta(s):
    # Excel permite áreas discontinuas; se guardan por separado y en orden.
    areas=re.findall(r'\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?',str(s.print_area or '').split('!')[-1]) if False else [x.replace('$','') for x in re.findall(r'!\s*(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)',str(s.print_area or ''))]
    setup={k:getattr(s.page_setup,k) for k in ['orientation','paperSize','scale','fitToWidth','fitToHeight','firstPageNumber','pageOrder','blackAndWhite','draft','horizontalDpi','verticalDpi'] if getattr(s.page_setup,k,None) is not None}
    for k in ['horizontalCentered','verticalCentered','headings','gridLines']:
        v=getattr(s.print_options,k,None)
        if v is not None:setup[k]=v
    setup['fitToPage']=bool(s.sheet_properties.pageSetUpPr and s.sheet_properties.pageSetUpPr.fitToPage)
    margins={k:getattr(s.page_margins,k) for k in ['left','right','top','bottom','header','footer']}
    return {'areas':areas,'setup':setup,'margins':margins,'titleRows':s.print_title_rows,'titleCols':s.print_title_cols,'rowBreaks':[br.id for br in s.row_breaks.brk],'colBreaks':[br.id for br in s.col_breaks.brk],'showGridLines':s.sheet_view.showGridLines is not False,'originalRows':s.max_row,'originalCols':s.max_column}

def convert(b,tid):
    w=load_workbook(io.BytesIO(b)); cached=load_workbook(io.BytesIO(b),data_only=True); theme=theme_colors(w); z,paths=raw_paths(b)
    sheets=[]; metas={}; stats=[]
    for i,s in enumerate(w):
        sid=f'{tid}-s{i+1}'; root=ET.fromstring(z.read(paths[i])); data={}; borderinfo=[]; chain=[]
        original_cells={c.get('r'):c for c in root.findall('.//m:sheetData/m:row/m:c',NS)}
        # openpyxl materializa también las celdas cubiertas por combinaciones.
        for (r,c),cell in sorted(s._cells.items()):
            rc=(r-1,c-1); raw=original_cells.get(cell.coordinate); stid=int(raw.get('s','0')) if raw is not None else cell.style_id
            style=w._cell_styles[stid]; font=w._fonts[style.fontId]; fill=w._fills[style.fillId]; border=w._borders[style.borderId]; al=w._alignments[style.alignmentId]; numfmt=cell.number_format
            v={}; val=cell.value; formula=val if cell.data_type=='f' and isinstance(val,str) else None
            if formula:
                v['f']=formula; val=cached[s.title][cell.coordinate].value; chain.append({'r':r-1,'c':c-1,'id':sid})
            if raw is not None and raw.get('t','n')=='n':
                vv=raw.find('m:v',NS)
                if vv is not None and vv.text is not None:
                    try: val=float(vv.text);val=int(val) if val.is_integer() else val
                    except ValueError:pass
            val=fmt_value(val,w)
            if val is not None:
                v['v']=val;v['m']=str(val) if not isinstance(val,bool) else ('TRUE' if val else 'FALSE')
            v['ct']={'fa':numfmt or 'General','t':'d' if is_date_format(numfmt or '') else 's' if numfmt=='@' or isinstance(val,str) and not formula else 'g' if numfmt=='General' else 'n'}
            if font.name:v['ff']=font.name
            if font.sz:v['fs']=float(font.sz)
            if font.bold:v['bl']=1
            if font.italic:v['it']=1
            if font.strike:v['cl']=1
            if font.underline:v['un']=1
            fc=color(font.color,theme)
            if fc:v['fc']=fc
            if fill.patternType=='solid':
                bg=color(fill.fgColor,theme)
                if bg:v['bg']=bg
            if al.horizontal in ('center','centerContinuous','left','right'):v['ht']={'center':0,'centerContinuous':0,'left':1,'right':2}[al.horizontal]
            if al.vertical in ('center','top','bottom'):v['vt']={'center':0,'top':1,'bottom':2}[al.vertical]
            if al.wrap_text:v['tb']=2
            if al.textRotation:v['tr']={45:1,135:2,255:3,90:4,180:5}.get(al.textRotation,0)
            if cell.comment:v['ps']={'value':cell.comment.text,'isshow':False}
            if cell.has_style or val is not None or formula or raw is not None:data[rc]=v
            bd={}
            for edge,side in [('l',border.left),('r',border.right),('t',border.top),('b',border.bottom)]:
                if side and side.style in BORDER:bd[edge]={'style':BORDER[side.style],'color':color(side.color,theme,'#000000')}
            if bd:borderinfo.append({'rangeType':'cell','value':{'row_index':r-1,'col_index':c-1,**bd}})
        merge={}
        for rng in s.merged_cells.ranges:
            r,c=rng.min_row-1,rng.min_col-1; main={'r':r,'c':c,'rs':rng.max_row-rng.min_row+1,'cs':rng.max_col-rng.min_col+1};merge[f'{r}_{c}']=main
            for rr in range(r,r+main['rs']):
                for cc in range(c,c+main['cs']):data.setdefault((rr,cc),{})['mc']=main if (rr,cc)==(r,c) else {'r':r,'c':c}
        rowlen={str(r-1):round(d.height*96/72,2) for r,d in s.row_dimensions.items() if d.height is not None}
        rowhidden={str(r-1):0 for r,d in s.row_dimensions.items() if d.hidden}
        collen={};colhidden={}
        for key,d in s.column_dimensions.items():
            for c in range(d.min or 1,(d.max or d.min or 1)+1):
                if d.width is not None:collen[str(c-1)]=round(d.width*7+5,2)
                if d.hidden:colhidden[str(c-1)]=0
        page=page_meta(s); metas[sid]=page
        maxr=max(s.max_row,max((int(k)+1 for k in rowlen),default=1));maxc=max(s.max_column,max((int(k)+1 for k in collen),default=1))
        sheets.append({'name':s.title,'id':sid,'status':1 if i==w.index(w.active) else 0,'order':i,'hide':0 if s.sheet_state=='visible' else 1,'row':max(40,maxr+10),'column':max(20,maxc+5),'defaultRowHeight':round((s.sheet_format.defaultRowHeight or 15)*96/72,2),'defaultColWidth':round((s.sheet_format.defaultColWidth or 8.43)*7+5,2),'showGridLines':1 if page['showGridLines'] else 0,'celldata':[{'r':r,'c':c,'v':v} for (r,c),v in sorted(data.items())],'config':{'merge':merge,'rowlen':rowlen,'columnlen':collen,'rowhidden':rowhidden,'colhidden':colhidden,'borderInfo':borderinfo},'calcChain':chain})
        stats.append({'name':s.title,'rows':s.max_row,'cols':s.max_column,'formulas':len(chain),'merges':len(merge),'validations':len(s.data_validations.dataValidation) if s.data_validations else 0,'printAreas':page['areas']})
    controls=len([n for n in z.namelist() if re.fullmatch(r'xl/ctrlProps/ctrlProp\d+\.xml',n)])
    flags=[]
    if controls:flags.append(f'{controls} controles de formulario heredados (casillas) y dibujos: el motor web no los reproduce; conservar y consultar el original.')
    if any('printerSettings' in n for n in z.namelist()):flags.append('Configuración binaria de impresora: conservada en el original; impresión web aproximada.')
    return {'sheets':sheets,'print':metas},stats,flags

def main():
    z=zipfile.ZipFile(sys.argv[1]); originals={}
    for n in z.namelist():
        if n.lower().endswith('.zip'):
            k=zipfile.ZipFile(io.BytesIO(z.read(n)))
            for f in k.namelist():
                if f.lower().endswith('.xlsx') and not Path(f).name.startswith('~$'):originals[Path(f).name]=k.read(f)
    assert len(originals)==len(CATALOG)==10
    entries=[];report=[]
    for tid,stage,pattern in CATALOG:
        name,raw=next((n,b) for n,b in originals.items() if pattern in n)
        seed,stats,flags=convert(raw,tid); sha=hashlib.sha256(raw).hexdigest(); entry={'id':tid,'stage':stage,'name':name,'sha256':sha,'sheets':stats,'warnings':flags,'originalBase64':base64.b64encode(raw).decode(),'snapshot':seed};entries.append(entry)
        report.append({k:entry[k] for k in ['id','stage','name','sha256','sheets','warnings']})
    # Las fuentes quedan fuera del directorio público. No exponer datos por CDN.
    out=ROOT/'src/vendimia/plantillas-data.ts'
    out.write_text('// Generado por scripts/generar-plantillas-vendimia.py. No editar.\nexport interface Plantilla { id:string; stage:string; name:string; sha256:string; sheets:{name:string;rows:number;cols:number;formulas:number;merges:number;validations:number;printAreas:string[]}[]; warnings:string[]; originalBase64:string; snapshot:unknown }\nexport const PLANTILLAS: Plantilla[] = '+json.dumps(entries,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
    (ROOT/'docs/vendimia-catalogo.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'{len(entries)} libros, {sum(len(e["sheets"]) for e in entries)} hojas, {sum(s["formulas"] for e in entries for s in e["sheets"])} fórmulas. {out.stat().st_size} bytes')
if __name__=='__main__':main()
