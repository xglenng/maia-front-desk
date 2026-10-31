'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import './app-import-picker.css';
const apps=[
 {name:'Square',description:'Import Square services, merchandise, or both without changing scheduling. Public-page and CSV imports support services only.'},
 {name:'GlossGenius',description:'Import a public service page or a CSV you already have. Direct account connection is not available.'},
 {name:'Vagaro',description:'Import a public service page or a CSV you already have. Direct account connection is not available.'},
 {name:'Other platform',description:'Import a public service list or use Maia’s CSV template.'},
];
export default function AppImportPicker({artistId,artistName,completion,disabled,squareOnly=false,onChoose,onOpen,children}:{artistId:string;artistName:string;completion:number;disabled:boolean;squareOnly?:boolean;children:ReactNode;onOpen:()=>void;onChoose:(mode:'LINK'|'FILE'|'SQUARE')=>void}){
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 useEffect(()=>{if(!artistId)return;const url=new URL(window.location.href);if(url.searchParams.get('import')==='apps'){setOpen(true);if(squareOnly||url.searchParams.has('squareCatalog')){setSelectedApp('Square');onChoose('SQUARE');}url.searchParams.delete('import');window.history.replaceState(window.history.state,'',url.pathname+url.search);}},[artistId]);
 useEffect(()=>{if(open){onOpen();setQuery('');dialog.current?.showModal();}else if(dialog.current?.open){dialog.current.close();trigger.current?.focus();}},[open]);
 useEffect(()=>{if(completion){setOpen(false);setSelectedApp('');}},[completion]);
 const [selectedApp,setSelectedApp]=useState('');
 const filtered=apps.filter(app=>app.name.toLowerCase().includes(query.trim().toLowerCase()));
 function choose(mode:'LINK'|'FILE'|'SQUARE',app:string){setSelectedApp(app);onChoose(mode);}
 return <><button ref={trigger} type="button" disabled={disabled||!artistId} onClick={()=>{if(squareOnly)choose('SQUARE','Square');setOpen(true);}}>{squareOnly?'Import from Square':'Import from an app'}</button><dialog ref={dialog} className="app-import-dialog" aria-labelledby="app-import-title" onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)}><header><h2 id="app-import-title">{selectedApp?`${selectedApp} catalog import`:'Import services from an app'}</h2><button type="button" aria-label="Close app importer" onClick={()=>setOpen(false)}>Close</button></header><p><strong>Importing for: {artistName}</strong>. Your calendar stays unchanged.</p>{selectedApp?<><button type="button" disabled={disabled} onClick={()=>setSelectedApp('')}>← Choose another app</button>{open&&children}</>:<><label>Find an app<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Square, GlossGenius, Vagaro…"/></label><div className="app-import-results">{filtered.map(app=><section key={app.name}><h3>{app.name}</h3><p>{app.description}</p><div>{app.name==='Square'&&<button type="button" onClick={()=>choose('SQUARE',app.name)}>Connect Square account</button>}<button type="button" onClick={()=>choose('LINK',app.name)}>Use public service link</button><button type="button" onClick={()=>choose('FILE',app.name)}>Upload service CSV</button></div></section>)}</div>{!filtered.length&&<p role="status">No matching apps. Search for another platform or use Other platform.</p>}</>}<p className="app-import-note">Public-link imports require a public page. To read private Square services, choose Connect Square account. You’ll review services before saving, and scheduling stays unchanged.</p></dialog></>;
}
