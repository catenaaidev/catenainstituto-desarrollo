// Lectura exclusivamente: reintenta red/502/503/504; no reintenta POST ni permisos.
export async function pedirDocumento(url, {fetcher = (...args) => fetch(...args), espera = ms => new Promise(r=>setTimeout(r,ms)), plazo=20000, intentos=3} = {}){
  let ultimo;
  for(let i=0;i<intentos;i++){
    const ctl = new AbortController(); const timer=setTimeout(()=>ctl.abort(),plazo);
    try{
      const r=await fetcher(url,{cache:'no-store',credentials:'same-origin',signal:ctl.signal});
      if([502,503,504].includes(r.status) && i+1<intentos) { ultimo=new Error('Servidor no disponible ('+r.status+')'); }
      else if(!r.ok) return {respuesta:r, datos:null};
      else {
        const datos=await r.json();
        if(!datos || typeof datos!=='object' || !Array.isArray(datos.lotes) || !Array.isArray(datos.analisis)) throw new Error('Respuesta de datos incompleta o inválida');
        return {respuesta:r,datos};
      }
    }catch(e){ultimo=e;}
    finally{clearTimeout(timer);}
    if(i+1<intentos) await espera(400*(i+1));
  }
  throw ultimo || new Error('No se pudieron cargar los datos');
}
// Visible aunque los contadores de la vista estén vacíos. No borra borradores.
export function mostrarErrorCarga(texto){
  let aviso=document.getElementById('ciwErrorCarga');
  if(!aviso){aviso=document.createElement('div');aviso.id='ciwErrorCarga';aviso.setAttribute('role','alert');aviso.style.cssText='padding:12px;margin:10px;border:1px solid #b42318;background:#fff2f0;color:#862518;border-radius:6px;display:flex;gap:12px;align-items:center;flex-wrap:wrap';document.body.insertBefore(aviso,document.body.firstChild);}
  const mensaje=document.createElement('span');mensaje.textContent=texto+' No se confirmó la carga; los contadores vacíos no representan existencias reales.';
  const boton=document.createElement('button');boton.type='button';boton.textContent='Reintentar carga';boton.onclick=()=>location.reload();aviso.replaceChildren(mensaje,boton);
}
export function quitarErrorCarga(){document.getElementById('ciwErrorCarga')?.remove();}
