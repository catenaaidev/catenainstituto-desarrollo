/**
 * Comprueba que el panel del celular en modo web arma lo que tiene que armar.
 *
 * No hay navegador headless en esta maquina, asi que se extrae la funcion real
 * del index.html servido y se la corre contra un doble del DOM. Verifica lo que
 * ve el operario: la direccion publica, el QR y ningun rastro de las
 * instrucciones de red local que dejaban la pantalla en un callejon sin salida.
 *
 * ARCHIVO TEMPORAL de verificacion: no se commitea.
 */

import { readFileSync } from 'node:fs';

const html = readFileSync('public/barriles/index.html', 'utf8');

// Recorta la funcion tal cual esta en la pagina, sin copiarla a mano.
const desde = html.indexOf('function pintarQR(u) {');
const hasta = html.indexOf('async function dibujarQR()');
if (desde < 0 || hasta < 0 || hasta < desde) throw new Error('no encontre las funciones del QR');
const fuente = html.slice(desde, hasta);

const qrPedidos = [];
const elementos = { urlSel: { textContent: '' }, qrDibujo: { innerHTML: '' } };

const sandbox = {
  location: { origin: 'https://catenainstitute.besa-junin.workers.dev' },
  $: (id) => elementos[id],
  QRCode: function (nodo, opciones) { qrPedidos.push(opciones.text); },
};

const crear = new Function(
  'location', '$', 'QRCode',
  fuente + '\nreturn dibujarQRWeb;',
);
const dibujarQRWeb = crear(sandbox.location, sandbox.$, sandbox.QRCode);

const cont = { innerHTML: '' };
dibujarQRWeb(cont);

const salida = cont.innerHTML;
const fallos = [];
const exigir = (ok, que) => { if (!ok) fallos.push(que); else console.log('  ok  ' + que); };

exigir(
  qrPedidos.length === 1 &&
    qrPedidos[0] === 'https://catenainstitute.besa-junin.workers.dev/barriles/',
  'el QR codifica la direccion publica del modulo, no una IP de red local',
);
exigir(
  elementos.urlSel.textContent === 'https://catenainstitute.besa-junin.workers.dev/barriles/',
  'la direccion tambien se muestra en texto, para tipearla',
);
exigir(/mail de la bodega/.test(salida), 'avisa que la primera vez pide el mail y el codigo');
exigir(
  !/mismo WiFi|Iniciar servidor\.bat|localhost:8766|No detecte la direccion de red|No detecté la dirección de red/.test(salida),
  'no queda rastro de las instrucciones de red local',
);

if (fallos.length) {
  console.error('\nFALLA:');
  for (const f of fallos) console.error('  x   ' + f);
  process.exit(1);
}
console.log('\nel panel en modo web queda bien');
