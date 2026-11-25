// IndexedDB: borradores locales separados por cuenta y libro, no localStorage
// (los libros pueden superar la cuota de localStorage). Se espera al commit.
let abrir;
function base(){if(!abrir)abrir=new Promise((resolve,reject)=>{const r=indexedDB.open('ciw-vendimia-libros',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('borradores'))r.result.createObjectStore('borradores',{keyPath:'key'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Base local ocupada.'));});return abrir;}
export async function leerBorrador(key){const db=await base();return new Promise((resolve,reject)=>{const t=db.transaction('borradores','readonly'),r=t.objectStore('borradores').get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}
async function cambiar(fn){const db=await base();return new Promise((resolve,reject)=>{const t=db.transaction('borradores','readwrite');t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('Guardado local cancelado'));fn(t.objectStore('borradores'));});}
export const guardarBorrador=d=>cambiar(s=>s.put(d));
export const borrarBorrador=key=>cambiar(s=>s.delete(key));
