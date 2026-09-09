/**
 * Verifica de punta a punta el OCR del rótulo (Mapa de Barriles) contra un
 * `wrangler dev` ya levantado.
 *
 * Por qué existe: el 404 de /barriles/ocr/tesseract.min.js se puede "arreglar"
 * dejando los archivos en su lugar y quedarse igual de roto, porque el worker de
 * tesseract.js resuelve workerPath/corePath/langPath por su cuenta. Este script
 * abre la pantalla real en Chrome headless, llama a las funciones de la app
 * (ocrObtener + barExtraerLotes, las mismas que usa el botón "📸 Leer rótulo") y
 * lee un número dibujado en un canvas. Si el diccionario, el core wasm o el
 * worker no se descargan, esto falla.
 *
 * Uso:  node scripts/verificar-ocr.mjs [url-de-la-pantalla]
 *   web:     node scripts/verificar-ocr.mjs http://127.0.0.1:8788/barriles/
 *   bodega:  node scripts/verificar-ocr.mjs http://127.0.0.1:8799/
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DESTINO = process.argv[2] ?? 'http://127.0.0.1:8788/barriles/';
const LOTE = '34521'; // 5 cifras, el formato típico de los rótulos
const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/** Espera a que el endpoint de CDP conteste, sin dormir de más. */
async function esperarCDP(intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9222/json/version');
      if (r.ok) return await r.json();
    } catch {
      /* todavía no arrancó */
    }
    await new Promise((ok) => setTimeout(ok, 250));
  }
  throw new Error('Chrome no abrió el puerto 9222');
}

/** Cliente CDP mínimo sobre el WebSocket que ya trae Node. */
function conectar(url) {
  const ws = new WebSocket(url);
  const pendientes = new Map();
  let n = 0;
  const listo = new Promise((ok, mal) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', () => mal(new Error('no pude abrir el WebSocket de CDP')), {
      once: true,
    });
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    const p = pendientes.get(msg.id);
    if (!p) return;
    pendientes.delete(msg.id);
    msg.error ? p.mal(new Error(JSON.stringify(msg.error))) : p.ok(msg.result);
  });
  return {
    listo,
    cerrar: () => ws.close(),
    enviar(method, params = {}) {
      const id = ++n;
      return new Promise((ok, mal) => {
        pendientes.set(id, { ok, mal });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

const perfil = await mkdtemp(join(tmpdir(), 'ocr-chrome-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${perfil}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let codigo = 1;
try {
  await esperarCDP();
  // Abre una pestaña nueva ya en la pantalla de barriles.
  const destino = DESTINO;
  const nueva = await fetch(
    `http://127.0.0.1:9222/json/new?${encodeURIComponent(destino)}`,
    { method: 'PUT' },
  ).then((r) => r.json());

  const cdp = conectar(nueva.webSocketDebuggerUrl);
  await cdp.listo;
  await cdp.enviar('Runtime.enable');
  await cdp.enviar('Page.enable');

  // Esperar a que la app termine de cargar sus scripts.
  for (let i = 0; i < 80; i++) {
    const r = await cdp.enviar('Runtime.evaluate', {
      expression: "document.readyState === 'complete' && typeof ocrObtener === 'function'",
      returnByValue: true,
    });
    if (r.result.value === true) break;
    await new Promise((ok) => setTimeout(ok, 250));
  }

  const tesseractCargo = await cdp.enviar('Runtime.evaluate', {
    expression: "typeof Tesseract",
    returnByValue: true,
  });
  console.log(`typeof Tesseract  -> ${tesseractCargo.result.value}`);
  if (tesseractCargo.result.value === 'undefined') {
    throw new Error('el <script> de ocr/tesseract.min.js no cargó (¿sigue el 404?)');
  }

  const baseOcr = await cdp.enviar('Runtime.evaluate', {
    expression: "new URL('ocr', document.baseURI).href",
    returnByValue: true,
  });
  console.log(`base del OCR      -> ${baseOcr.result.value}`);

  // El pipeline real: mismo ocrObtener() y mismo barExtraerLotes() que el botón.
  const prueba = `(async () => {
    const w = await ocrObtener();
    const c = document.createElement('canvas');
    c.width = 420; c.height = 140;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#000'; x.font = 'bold 86px Arial';
    x.fillText('${LOTE}', 24, 104);
    const { data } = await w.recognize(c);
    return JSON.stringify({ texto: (data.text || '').trim(), candidatos: barExtraerLotes(data.text) });
  })()`;

  const res = await cdp.enviar('Runtime.evaluate', {
    expression: prueba,
    awaitPromise: true,
    returnByValue: true,
    timeout: 180000,
  });
  if (res.exceptionDetails) {
    throw new Error(
      'el OCR tiró error: ' +
        (res.exceptionDetails.exception?.description ?? res.exceptionDetails.text),
    );
  }

  const { texto, candidatos } = JSON.parse(res.result.value);
  console.log(`texto leído       -> ${JSON.stringify(texto)}`);
  console.log(`candidatos        -> ${JSON.stringify(candidatos)}`);

  if (!candidatos.includes(LOTE)) {
    throw new Error(`esperaba leer ${LOTE} y no apareció entre los candidatos`);
  }
  console.log(`\n✅ OCR funcionando: leyó ${LOTE} desde ${destino}`);
  codigo = 0;
  cdp.cerrar();
} catch (e) {
  console.error(`\n❌ ${e.message}`);
} finally {
  chrome.kill();
  await rm(perfil, { recursive: true, force: true }).catch(() => {});
  process.exit(codigo);
}
