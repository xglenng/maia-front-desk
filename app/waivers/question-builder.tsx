'use client';
import type {NativeField} from '@/packages/waivers/forms';
export default function QuestionBuilder({fields,onChange}:{fields:NativeField[];onChange:(fields:NativeField[])=>void}){
 function update(index:number,field:NativeField){onChange(fields.map((current,i)=>i===index?field:current));}
 function move(index:number,direction:number){const next=[...fields];[next[index],next[index+direction]]=[next[index+direction],next[index]];onChange(next);}
 return <section className="question-builder"><div className="section-heading"><div><h3>Custom questions</h3><p>Add questions and acknowledgments before the client’s signature.</p></div><span>{fields.length}/40</span></div>
 {fields.map((field,index)=><article className="question-editor" key={field.id}><div className="question-toolbar"><strong>Question {index+1}</strong><div><button type="button" disabled={index===0} onClick={()=>move(index,-1)} aria-label={`Move question ${index+1} up`}>↑</button><button type="button" disabled={index===fields.length-1} onClick={()=>move(index,1)} aria-label={`Move question ${index+1} down`}>↓</button><button type="button" onClick={()=>onChange(fields.filter((_,i)=>i!==index))}>Remove</button></div></div>
 <div className="two-fields"><label>Question type<select value={field.type} onChange={event=>{const type=event.target.value as NativeField['type'];update(index,type==='CHOICE'?{id:field.id,label:field.label,required:field.required,type,options:['Option 1','Option 2']}:{id:field.id,label:field.label,required:field.required,type});}}><option value="TEXT">Short answer</option><option value="LONG_TEXT">Paragraph</option><option value="CHOICE">Single choice</option><option value="ACKNOWLEDGMENT">Acknowledgment checkbox</option></select></label><label>Question or acknowledgment<input required maxLength={300} value={field.label} onChange={event=>update(index,{...field,label:event.target.value})}/></label></div>
 {field.type==='CHOICE'&&<label>Choices (one per line)<textarea required rows={4} value={field.options.join('\n')} onChange={event=>update(index,{...field,options:event.target.value.split('\n')})}/></label>}
 <label className="question-required"><input type="checkbox" checked={field.required} onChange={event=>update(index,{...field,required:event.target.checked})}/> Required</label></article>)}
 <button type="button" className="secondary" disabled={fields.length>=40} onClick={()=>onChange([...fields,{id:crypto.randomUUID(),type:'TEXT',label:'',required:true}])}>+ Add question</button>
 </section>;
}
