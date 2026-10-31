'use client';
import ServiceImport from '../settings/services/service-import';
import {useEffect,useState} from 'react';
import {settingsArtistId} from '@/packages/studio/artist-selection';
import {useSession} from '@/components/session-gate';
import {field,labelStyle,panel,primaryButton,secondaryButton,formGrid,toggleRow,serviceRow,statusLabel,alert,noticeStyle} from '@/components/catalog-styles';
type Item={id:string;name:string;category:string|null;sku:string|null;priceCents:number|null;taxBasisPoints:number;active:boolean};
const empty={name:'',category:'',sku:'',price:'',tax:'0',active:true};
export default function Items(){const user=useSession();const [artists,setArtists]=useState<Array<{id:string;displayName:string}>>([]),[artistId,setArtistId]=useState('');const [items,setItems]=useState<Item[]>([]),[draft,setDraft]=useState(empty),[editing,setEditing]=useState<string|null>(null),[open,setOpen]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[importBusy,setImportBusy]=useState(false),[notice,setNotice]=useState('');
 async function load(active=()=>true){const r=await fetch(`/api/items?artistId=${artistId}`);const b=await r.json();if(!r.ok)throw Error(b.error||'Unable to load items.');if(active())setItems(b.items);}
 useEffect(()=>{if(!user)return;fetch(`/api/ai/settings?organizationId=${user.organization_id}`).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error);setArtists(b.artists);if(!b.artists.length)setError('No artist profile is linked to this login. Ask the studio owner to link your team profile.');setArtistId(settingsArtistId(b.artists,b.defaultArtistId,null));}).catch(e=>setError(e.message));},[user]);
 useEffect(()=>{setItems([]);setOpen(false);setEditing(null);setError('');if(artistId){const url=new URL(window.location.href);url.searchParams.set('artistId',artistId);window.history.replaceState(null,'',url.pathname+url.search);}let active=true;if(artistId)void load(()=>active).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[artistId]);
 async function save(e:React.FormEvent){e.preventDefault();setError('');setNotice('');if((draft.price&&!/^\d+(\.\d{1,2})?$/.test(draft.price))||!/^\d+(\.\d{1,2})?$/.test(draft.tax)){setError('Use dollar prices and tax percentages with at most two decimal places.');return;}setBusy(true);try{const r=await fetch('/api/items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({artistId,...(editing?{id:editing}:{}),name:draft.name,category:draft.category||null,sku:draft.sku||null,priceCents:draft.price?Math.round(Number(draft.price)*100):null,taxBasisPoints:Math.round(Number(draft.tax)*100),active:draft.active})});const b=await r.json();if(!r.ok)throw Error(b.error);setNotice(editing?'Item changes saved.':'Item created.');setOpen(false);setEditing(null);setDraft(empty);await load();}catch(e){setError(e instanceof Error?e.message:'Unable to save item.');}finally{setBusy(false);}}

 function startNew(){setEditing(null);setDraft(empty);setNotice('');setOpen(true);}
 const visible=items.filter(item=>`${item.name} ${item.category||''} ${item.sku||''}`.toLowerCase().includes(search.toLowerCase()));
 const groups=new Map<string,Item[]>();for(const item of visible){const category=item.category||'Uncategorized';groups.set(category,[...(groups.get(category)||[]),item]);}
 return <main style={{maxWidth:1060,margin:'0 auto',padding:'36px 20px 80px',color:'#181716'}}>
   <a href="/settings">← Settings</a>
   <header style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap',margin:'14px 0 22px'}}>
     <div><h1 style={{margin:0}}>Items &amp; services</h1><p style={{color:'#706b66',margin:'7px 0 0'}}>Manage each artist’s merchandise and prices for checkout.</p></div>
     <button type="button" style={primaryButton} disabled={!artistId||busy||importBusy} onClick={startNew}>+ Add item</button>
   </header>
   <nav aria-label="Catalog navigation" style={{display:'flex',gap:16,flexWrap:'wrap',marginBottom:20}}><a href={`/settings/services?artistId=${artistId}`}>All services →</a><a href={`/items?artistId=${artistId}`} aria-current="page">All items</a><a href={`/checkout?artistId=${artistId}`}>Checkout</a></nav>
   <section style={panel}><label style={labelStyle}>Artist / provider<select style={field} value={artistId} disabled={busy||importBusy} onChange={event=>setArtistId(event.target.value)}><option value="">Select a provider</option>{artists.map(artist=><option key={artist.id} value={artist.id}>{artist.displayName}</option>)}</select></label></section>
   <section className="service-library" aria-label="Item library builder"><header><h2>Bring your items into Maia</h2><p>Import merchandise from Square and review before saving to the artist selected above. You can include services in the same import.</p></header>
     <ServiceImport key={artistId} onBusyChange={setImportBusy} compact organizationId={user?.organization_id||''} artistId={artistId} artistName={artists.find(artist=>artist.id===artistId)?.displayName||''} onManual={startNew} onImported={()=>void load().catch(reason=>setError(reason.message))}/>
   </section>
   {error&&<p role="alert" style={alert}>{error}</p>}{notice&&<p role="status" style={noticeStyle}>{notice}</p>}
   {open&&<form onSubmit={save} style={{...panel,marginTop:16}}><h2 style={{margin:'0 0 16px',fontSize:18}}>{editing?'Edit item':'New item'}</h2><div style={formGrid}>
     <label style={labelStyle}>Item name<input autoFocus style={field} required maxLength={120} value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})}/></label>
     <label style={labelStyle}>Category<input style={field} maxLength={80} value={draft.category} placeholder="Optional" onChange={event=>setDraft({...draft,category:event.target.value})}/></label>
     <label style={labelStyle}>SKU<input style={field} maxLength={80} value={draft.sku} placeholder="Optional" onChange={event=>setDraft({...draft,sku:event.target.value})}/></label>
     <label style={labelStyle}>Price (USD)<input style={field} inputMode="decimal" placeholder="Leave blank for variable price" value={draft.price} onChange={event=>setDraft({...draft,price:event.target.value})}/></label>
     <label style={labelStyle}>Item tax rate (%)<input style={field} required inputMode="decimal" value={draft.tax} onChange={event=>setDraft({...draft,tax:event.target.value})}/></label>
   </div><p style={{color:'#706b66',fontSize:13}}>Enter the tax rate your studio uses. Maia does not determine tax rates automatically.</p>
     <div style={toggleRow}><label><input type="checkbox" checked={draft.active} onChange={event=>setDraft({...draft,active:event.target.checked})}/> Active</label></div>
     <div style={{display:'flex',gap:10,marginTop:18}}><button type="submit" style={primaryButton} disabled={busy}>{busy?'Saving…':editing?'Save changes':'Create item'}</button><button type="button" style={secondaryButton} disabled={busy} onClick={()=>setOpen(false)}>Cancel</button></div>
   </form>}
   <section style={{marginTop:20}}><div style={{display:'flex',justifyContent:'space-between',gap:12,marginBottom:12}}><h2 style={{margin:0,fontSize:18}}>Configured items</h2><span style={{color:'#706b66',fontSize:13}}>{items.filter(item=>item.active).length} active · {items.length} total</span></div>
     <label style={{...labelStyle,marginBottom:16}}>Search items<input style={field} type="search" placeholder="Search by name, category, or SKU" value={search} onChange={event=>setSearch(event.target.value)}/></label>
     {!artistId?<section style={panel}>Select an artist/provider to manage their items.</section>:!visible.length?<section style={panel}>{items.length?'No items match your search.':'No items are configured for this provider yet.'}</section>:[...groups.entries()].map(([category,group])=><section key={category} style={{...panel,marginBottom:12}}><h3 style={{margin:'0 0 10px',fontSize:14}}>{category}</h3><div style={{display:'grid',gap:8}}>{group.map(item=><article key={item.id} style={serviceRow}><div style={{minWidth:0}}><strong>{item.name}</strong><div style={{color:'#706b66',fontSize:13,marginTop:4}}>{item.priceCents===null?'Variable price':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(item.priceCents/100)}{item.sku?` · SKU ${item.sku}`:''} · {item.taxBasisPoints/100}% tax</div></div><span style={{...statusLabel,background:item.active?'#e6f2ea':'#eee',color:item.active?'#2f7651':'#68635e'}}>{item.active?'Active':'Inactive'}</span><button type="button" style={secondaryButton} disabled={busy||importBusy} onClick={()=>{setEditing(item.id);setDraft({name:item.name,category:item.category||'',sku:item.sku||'',price:item.priceCents===null?'':(item.priceCents/100).toFixed(2),tax:(item.taxBasisPoints/100).toString(),active:item.active});setOpen(true);}}>Edit</button></article>)}</div></section>)}
     <p style={{color:'#706b66',fontSize:13}}>Sell aftercare, jewelry, and other tangible products. Stock quantities are not tracked in this version.</p>
   </section>
 </main>;
}
