'use client';
import {useState} from 'react';
import NativeFields from '../waiver/native-fields';
import SignaturePad from '../waiver/signature-pad';
import type {NativeField} from '@/packages/waivers/forms';
const elements:{type:NativeField['type'];name:string;icon:string;description:string}[]=[
 {type:'HEADING',name:'Heading',icon:'H',description:'Introduce a section'},
 {type:'PARAGRAPH',name:'Text block',icon:'¶',description:'Instructions or consent wording'},
 {type:'FULL_NAME',name:'Full name',icon:'Aa',description:'A client or guardian name'},
 {type:'EMAIL',name:'Email',icon:'@',description:'An email address'},
 {type:'PHONE',name:'Phone',icon:'☎',description:'A phone number'},
 {type:'ADDRESS',name:'Address',icon:'⌂',description:'A mailing or street address'},
 {type:'DATE',name:'Date',icon:'▦',description:'A date picker'},
 {type:'NUMBER',name:'Number',icon:'#',description:'A numeric answer'},
 {type:'TEXT',name:'Short text',icon:'T',description:'A single-line answer'},
 {type:'LONG_TEXT',name:'Long text',icon:'≡',description:'A paragraph answer'},
 {type:'CHOICE',name:'Dropdown',icon:'⌄',description:'Choose one from a list'},
 {type:'RADIO',name:'Single choice',icon:'◉',description:'Choose one visible option'},
 {type:'MULTI_CHOICE',name:'Multiple choice',icon:'☑',description:'Choose several options'},
 {type:'ACKNOWLEDGMENT',name:'Acknowledgment',icon:'✓',description:'Agree to a statement'},
 {type:'DIVIDER',name:'Divider',icon:'—',description:'Separate form sections'},
];
function makeField(type:NativeField['type'],id=crypto.randomUUID()):NativeField{
 const label=elements.find(element=>element.type===type)?.name||'Question';
 const base={id,label,required:!['HEADING','PARAGRAPH','DIVIDER'].includes(type)};
 return type==='CHOICE'||type==='RADIO'||type==='MULTI_CHOICE'?{...base,type,options:['Yes','No']}:{...base,type};
}
export default function QuestionBuilder({fields,onChange,name,onNameChange,body,onBodyChange}:{fields:NativeField[];onChange:(fields:NativeField[])=>void;name:string;onNameChange:(value:string)=>void;body:string;onBodyChange:(value:string)=>void}){
 const [search,setSearch]=useState(''),[selectedId,setSelectedId]=useState<string|null>(null);
 const index=fields.findIndex(field=>field.id===selectedId),selected=fields[index];
 const display=selected&&['HEADING','PARAGRAPH','DIVIDER'].includes(selected.type);
 function update(field:NativeField){onChange(fields.map(current=>current.id===field.id?field:current));}
 function move(direction:number){const next=[...fields];[next[index],next[index+direction]]=[next[index+direction],next[index]];onChange(next);}
 function add(type:NativeField['type']){const field=makeField(type);onChange([...fields,field]);setSelectedId(field.id);}
 return <section className="question-builder live-builder"><div className="section-heading"><div><h3>Build your form</h3><p>Add elements to the live form. Select any element to edit its settings.</p></div><span>{fields.length}/40 elements</span></div><div className="live-workspace">
 <aside className="element-palette" aria-label="Form elements"><h4>Add element</h4><input aria-label="Search form elements" placeholder="Search elements" value={search} onChange={event=>setSearch(event.target.value)}/><div className="element-options">{elements.filter(element=>`${element.name} ${element.description}`.toLowerCase().includes(search.toLowerCase())).map(element=><button type="button" key={element.type} disabled={fields.length>=40} onClick={()=>add(element.type)}><span className="element-icon" aria-hidden="true">{element.icon}</span><span><strong>{element.name}</strong><small>{element.description}</small></span><span aria-hidden="true">+</span></button>)}</div><p>Signature and agreement are included at the bottom.</p></aside>
 <div className="live-form native-preview"><div className="live-form-label">Live form · Click an element to edit</div><input className="live-form-name" aria-label="Form name" placeholder="Name your form" required maxLength={160} value={name} onChange={event=>onNameChange(event.target.value)}/><textarea className="live-consent-text" aria-label="Consent text" placeholder="Write or paste your studio-approved consent text…" required maxLength={30000} rows={6} value={body} onChange={event=>onBodyChange(event.target.value)}/>
 {!fields.length&&<div className="element-empty">Your form starts here. Add an element from the list.</div>}
 {fields.map((field,i)=><div key={field.id} className={`live-element ${selectedId===field.id?'selected':''}`} role="button" tabIndex={0} aria-label={`Edit element ${i+1}: ${field.label}`} aria-pressed={selectedId===field.id} onClick={()=>setSelectedId(field.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelectedId(field.id);}}}><span className="live-element-edit">Edit</span><div className="live-element-content"><NativeFields fields={[field]} answers={{}} onChange={()=>{}} disabled/></div></div>)}
 <div className="live-signature"><span className="live-fixed-label">Included on every form</span><label>Full legal name<input disabled placeholder="Client’s full legal name"/></label><SignaturePad value={null} onChange={()=>{}} disabled/><label className="live-agreement"><input type="checkbox" disabled/> I have read this form and agree that the drawing above is my electronic signature.</label><span className="live-submit">Sign form</span></div></div>
 <aside className="element-inspector" aria-label="Element settings"><h4>{selected?'Element settings':'Select an element'}</h4>{selected?<><div className="question-toolbar"><span>Element {index+1}</span><div><button type="button" disabled={index===0} onClick={()=>move(-1)} aria-label="Move selected element up">↑</button><button type="button" disabled={index===fields.length-1} onClick={()=>move(1)} aria-label="Move selected element down">↓</button></div></div><label>Element type<select value={selected.type} onChange={event=>{const next=makeField(event.target.value as NativeField['type'],selected.id);update({...next,label:selected.label});}}>{elements.map(element=><option key={element.type} value={element.type}>{element.name}</option>)}</select></label>
 {selected.type!=='DIVIDER'&&<label>{display?'Display text':'Question or label'}<textarea required maxLength={300} rows={3} value={selected.label} onChange={event=>update({...selected,label:event.target.value})}/></label>}
 {(selected.type==='CHOICE'||selected.type==='RADIO'||selected.type==='MULTI_CHOICE')&&<label>Choices (one per line)<textarea required rows={5} value={selected.options.join('\n')} onChange={event=>update({...selected,options:event.target.value.split('\n')})}/></label>}
 {!display&&<label className="question-required"><input type="checkbox" checked={selected.required} onChange={event=>update({...selected,required:event.target.checked})}/> Required</label>}
 <button type="button" className="remove-element" onClick={()=>{onChange(fields.filter(field=>field.id!==selected.id));setSelectedId(null);}}>Remove element</button></>:<p>Choose an element on the form to change its wording, choices, or required setting.</p>}</aside>
 </div></section>;
}
