#!/usr/bin/env node
// Agente local de impresión de OT de Vendimia.
// Corre en una PC de la bodega con acceso a la impresora de red. Le pide
// trabajos al Worker (salida HTTPS, sin abrir puertos ni exponer la impresora
// a Internet), convierte la OT a PDF con Edge/Chrome sin ventana y la envía
// por RAW 9100. Informa "enviado" o "error": eso NO confirma la salida en
// papel; la confirmación física la hace una persona desde la OT.
//
// Uso (cmd):
//   set CIW_URL=https://catenainstituto-desarrollo.besa-junin.workers.dev
//   set IMPRESION_TOKEN=el-mismo-secreto-del-worker
//   node scripts\agente-impresion.mjs
import { writeFileSync, readFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import net from 'node:net';

const URL_BASE = process.env.CIW_URL, TOKEN = process.env.IMPRESION_TOKEN;
const ESPERA = Number(process.env.CIW_INTERVALO || 15) * 1000;
if (!URL_BASE || !TOKEN) { console.error('Faltan CIW_URL e IMPRESION_TOKEN.'); process.exit(1); }
const NAVEGADORES = [process.env.CIW_NAVEGADOR, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean);
const navegador = NAVEGADORES.find(p => existsSync(p));

async function api(path, body) {
  const r = await fetch(URL_BASE + '/api/impresion/agente' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
function aPdf(html) {
  if (!navegador) throw new Error('No se encontró Edge ni Chrome para generar el PDF (definí CIW_NAVEGADOR).');
  const dir = mkdtempSync(join(tmpdir(), 'ciw-ot-')), ent = join(dir, 'ot.html'), sal = join(dir, 'ot.pdf');
  try {
    writeFileSync(ent, html);
    execFileSync(navegador, ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${sal}`, 'file:///' + ent.replace(/\\/g, '/')], { timeout: 60000, stdio: 'ignore' });
    return readFileSync(sal);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
function raw9100(ip, puerto, datos) {
  return new Promise((ok, mal) => {
    const s = net.createConnection({ host: ip, port: puerto, timeout: 20000 }, () => s.end(datos));
    s.on('close', e => (e ? mal(new Error('conexión cerrada con error')) : ok()));
    s.on('timeout', () => { s.destroy(); mal(new Error('la impresora no respondió (timeout)')); });
    s.on('error', mal);
  });
}
async function ciclo() {
  const { trabajo } = await api('/tomar');
  if (!trabajo) return false;
  try {
    const { impresora: i } = trabajo;
    if (i.protocolo !== 'raw9100') throw new Error(`Protocolo ${i.protocolo} todavía no soportado por el agente: configurá la impresora como RAW 9100.`);
    const pdf = aPdf(trabajo.documento);
    for (let c = 0; c < (i.copias || 1); c++) await raw9100(i.ip, i.puerto, pdf);
    await api(`/${trabajo.id}/resultado`, { ok: true });
    console.log(new Date().toISOString(), `OT ${trabajo.numero} v${trabajo.version} enviada a ${i.ip}:${i.puerto}`);
  } catch (e) {
    await api(`/${trabajo.id}/resultado`, { ok: false, error: String(e.message || e) }).catch(() => {});
    console.error(new Date().toISOString(), `OT ${trabajo.numero}: ${e.message}`);
  }
  return true;
}
console.log('Agente de impresión CIW iniciado.', navegador ? `PDF con ${navegador}` : 'SIN navegador para PDF');
for (;;) {
  try { while (await ciclo()); } catch (e) { console.error(new Date().toISOString(), 'Sin conexión con CIW:', e.message); }
  await new Promise(r => setTimeout(r, ESPERA));
}
