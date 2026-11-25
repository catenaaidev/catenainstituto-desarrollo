import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const cwd=fileURLToPath(new URL('../frontend/vendimia/',import.meta.url));
const npm=process.platform==='win32'?'npm.cmd':'npm';
function run(args){const r=spawnSync(npm,args,{cwd,stdio:'inherit',shell:process.platform==='win32'});if(r.status!==0)throw new Error('No se pudo preparar el motor de Vendimia: '+(r.error||r.status));}
run([existsSync(cwd+'/package-lock.json')?'ci':'install','--no-audit','--no-fund']);
run(['run','build']);
