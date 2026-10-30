'use client';
import {useEffect,useRef,useState} from 'react';
import './app-import-picker.css';
const apps=[
 {name:'Square',description:'Import services from a public Square booking page or service CSV.'},
 {name:'GlossGenius',description:'Import a public service page or a CSV you already have. Direct account connection is not available.'},
 {name:'Vagaro',description:'Import a public service page or a CSV you already have. Direct account connection is not available.'},
 {name:'Other platform',description:'Import a public service list or use Maia’s CSV template.'},
];
export default function AppImportPicker({artistId,disabled,onChoose}:{artistId:string;disabled:boolean;onChoose:(mode:'LINK'|'FILE')=>void}){
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 useEffect(()=>{if(!artistId)return;const url=new URL(window.location.href);if(url.searchParams.get('import')==='apps'){setOpen(true);url.searchParams.delete('import');window.history.replaceState(window.history.state,'',url.pathname+url.search);}},[artistId]);
 useEffect(()=>{if(open){setQuery('');dialog.current?.showModal();}else if(dialog.current?.open){dialog.current.close();trigger.current?.focus();}},[open]);
 const filtered=apps.filter(app=>app.name.toLowerCase().includes(query.trim().toLowerCase()));
 function choose(mode:'LINK'|'FILE'){setOpen(false);onChoose(mode);}
 return <><button ref={trigger} type="button" disabled={disabled||!artistId} onClick={()=>setOpen(true)}>Import from an app</button><dialog ref={dialog} className="app-import-dialog" aria-labelledby="app-import-title" onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)}><header><h2 id="app-import-title">Import services from an app</h2><button type="button" aria-label="Close app importer" onClick={()=>setOpen(false)}>Close</button></header><p>Services will be assigned to the artist selected on Services &amp; Pricing. Your calendar stays unchanged.</p><label>Find an app<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Square, GlossGenius, Vagaro…"/></label><div className="app-import-results">{filtered.map(app=><section key={app.name}><h3>{app.name}</h3><p>{app.description}</p><div><button type="button" onClick={()=>choose('LINK')}>Use public service link</button><button type="button" onClick={()=>choose('FILE')}>Upload service CSV</button></div></section>)}</div>{!filtered.length&&<p role="status">No matching apps. Search for another platform or use Other platform.</p>}<p className="app-import-note">Login-only dashboard links cannot be imported. You’ll review services before saving. Square’s scheduling connection is managed separately in Scheduling settings.</p></dialog></>;
}
