/* ===== Órdenes de trabajo — guardar la Guía de trabajos =====
 * Cada cambio se aplica en pantalla al instante y queda en `_pend` hasta que
 * el servidor lo acepta. Si otro guardó antes (409), se toma su guía, se
 * vuelven a aplicar encima los cambios no aceptados y se reintenta: los
 * cambios son chicos (agregar, mover, tildar…), no hace falta preguntar.
 * fetch y ahora se inyectan para poder probarlo sin navegador. */
'use strict';
import { unirGuia, aplicar, podarHechas } from './guia.js';

const URL_GUIA = '/ordenes/api/guia';
const MAX_CONFLICTOS = 3;

export function crearSync({ fetch, ahora, alCambiar = () => {}, alEstado = () => {} }){
  let _guia = null, _ordenes = [], _version = 0, _puede = false, _modulos = {};
  let _pend = [];          // operaciones aplicadas en pantalla y no aceptadas todavía
  let _timer = null, _enVuelo = null;

  async function cargar(){
    try {
      const r = await fetch(URL_GUIA);
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      _ordenes = j.ordenes || []; _version = j.version || 0; _puede = !!j.puedeEditar; _modulos = j.modulos || {};
      _guia = unirGuia(j.guia, _ordenes, Object.keys(_modulos));
      alEstado('cargado');
    } catch (_) {
      alEstado('error-carga');
    }
    alCambiar();
  }

  function ejecutar(op, { demora = 0 } = {}){
    if (!_guia || !_puede) return;
    _guia = aplicar(_guia, op, Object.keys(_modulos));
    _pend.push(op);
    alCambiar();
    clearTimeout(_timer);
    _timer = setTimeout(() => { guardarYa(); }, demora);
  }

  async function enviar(){
    let conflictos = 0;
    while (_pend.length){
      const enviadas = _pend.length;
      const guia = podarHechas(_guia, ahora());
      alEstado('guardando');
      let r;
      try {
        r = await fetch(URL_GUIA, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: _version, guia }) });
      } catch (_) { alEstado('error'); return; }
      const j = await r.json().catch(() => ({}));
      // Un 409 válido (con versión) SIEMPRE es "otro guardó antes", no un
      // rechazo: el cambio en pantalla sigue siendo bueno, solo hay que
      // reacomodarlo sobre la guía nueva. Si se agotan los reintentos no se
      // descarta `_pend` (eso perdería una edición legítima en silencio):
      // queda tal cual, re-aplicado sobre lo último del servidor, para que
      // Reintentar lo mande de nuevo.
      if (r.status === 409 && typeof j.version === 'number'){
        _version = j.version;
        if (j.ordenes) _ordenes = j.ordenes;
        if (j.modulos) _modulos = j.modulos;
        const modulosVisibles = Object.keys(_modulos);
        _guia = _pend.reduce((gg, op) => aplicar(gg, op, modulosVisibles), unirGuia(j.guia, _ordenes, modulosVisibles));
        alCambiar();
        if (conflictos++ < MAX_CONFLICTOS) continue;
        alEstado('error');
        return;
      }
      // 400 (guía inválida), 403 (perdió permiso) o un 409 sin versión
      // (garabateado): acá sí el cambio en pantalla no sirve, se descarta y se
      // recarga de cero en vez de reintentar para siempre con el mismo op inválido.
      if (r.status === 400 || r.status === 403 || r.status === 409){
        _pend = [];
        if (r.status === 403) _puede = false;
        await cargar();        // cargar() avisa 'cargado': 'rechazado' va después para quedar visible
        alEstado('rechazado');
        return;
      }
      if (!r.ok){ alEstado('error'); return; }
      _version = j.version;
      if (_guia !== guia && _pend.length === enviadas) { _guia = guia; alCambiar(); }   // la poda también queda en pantalla
      _pend = _pend.slice(enviadas);
    }
    alEstado('guardado');
  }

  async function guardarYa(){
    clearTimeout(_timer);
    while (_enVuelo) await _enVuelo;     // uno por vez: el siguiente sale con la versión nueva
    if (!_pend.length) return;
    _enVuelo = enviar();
    try { await _enVuelo; } finally { _enVuelo = null; }
  }

  return {
    cargar, ejecutar, guardarYa,
    reintentar: guardarYa,
    estado: () => ({ guia: _guia, ordenes: _ordenes, version: _version, puedeEditar: _puede, modulos: _modulos }),
  };
}
