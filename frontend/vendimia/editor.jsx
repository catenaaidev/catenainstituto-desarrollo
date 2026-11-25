import React from 'react';
import {createRoot} from 'react-dom/client';
import {Workbook} from '@fortune-sheet/react';
import '@fortune-sheet/react/dist/index.css';
import {snapshotDe,firma} from './model.mjs';
export {exportarExcel} from './exportar.mjs';
export {imprimirLibro} from './imprimir.mjs';
export {snapshotDe,validar,firma,parseRange} from './model.mjs';

class ErrorEditor extends React.Component {
 constructor(props){super(props);this.state={error:null};}
 static getDerivedStateFromError(error){return {error};}
 componentDidCatch(error){this.props.onError(error);}
 render(){return this.state.error?React.createElement('p',{role:'alert'},'No se pudo abrir este libro con el motor web. El original y las versiones guardadas siguen disponibles.'):this.props.children;}
}
export function montarEditor(host,snapshot,{editable,onChange,onError}){
 const root=createRoot(host),ref=React.createRef();let disposed=false,latest=null,last=firma(snapshot),timer;
 function publish(sheets){if(disposed||!editable||!sheets)return;try{const next=snapshotDe(sheets,snapshot.print),key=firma(next);if(key!==last){last=key;onChange(next);}}catch(e){onError(e);}}
 root.render(<ErrorEditor onError={onError}><Workbook ref={ref} data={structuredClone(snapshot.sheets)} lang="es" allowEdit={editable} showToolbar={editable} showFormulaBar={true} showSheetTabs={true} onChange={data=>{latest=data;publish(data);}} onOp={ops=>{if(editable&&ops?.length){clearTimeout(timer);timer=setTimeout(()=>publish(ref.current?.getAllSheets?.()||latest),80);}}}/></ErrorEditor>);
 return {close(){disposed=true;clearTimeout(timer);root.unmount();},capture(){const sheets=ref.current?.getAllSheets?.()||latest;return sheets?snapshotDe(sheets,snapshot.print):snapshot;},api(){return ref.current;},metadata(){return snapshot.print;}};
}
