import {nativeDefinition,type NativeDefinition,type NativeField} from './forms';

export const consentStarterKinds = ['TATTOO','PIERCING'] as const;
export type ConsentStarterKind = typeof consentStarterKinds[number];
export const consentStarterReferences = [
 {name:'Association of Professional Piercers: consent and documentation',url:'https://safepiercing.org/wp-content/uploads/2020/10/APP_Procedures_2013_A_Web.pdf'},
 {name:'Southwest Utah Public Health: body art requirements',url:'https://swuhealth.gov/body-art/'},
] as const;

// These are editable adult starters, not jurisdiction-specific approved forms.
// Brand and artist names are resolved when the artist loads a draft; saved evidence is immutable.
export function buildConsentStarter(kind:ConsentStarterKind,brandName:string,artistName:string):{name:string;definition:NativeDefinition}{
 const brand=brandName.trim(),artist=artistName.trim();
 if(!brand||!artist||brand.length>160||artist.length>200)throw Error('Choose an artist and enter a brand name of 160 characters or fewer.');
 if(!consentStarterKinds.includes(kind))throw Error('Choose a consent template.');
 const procedure=kind==='TATTOO'?'tattoo':'piercing';
 const extra=kind==='TATTOO'
  ? 'The final appearance can differ from a reference design, and the result may change over time. Removal can be difficult and may not restore the original appearance.'
  : 'Jewelry and placement affect the result. Migration, rejection, and changes to the appearance of the piercing can occur.';
 const body=`${brand}\nArtist: ${artist}\n\nAdult ${procedure} consent\n\nI am requesting a ${procedure} from ${artist} at ${brand}. Before proceeding, I will review the planned procedure, placement, and any design or jewelry details with my artist. I may ask questions and may decline to proceed.\n\nBody art can involve pain, bleeding, bruising, swelling, infection, allergic reactions, scarring, and lasting changes to appearance. ${extra}\n\nI will discuss concerns that could affect the procedure or healing privately with my artist before the procedure. If I have health or medical concerns, I will consult a qualified healthcare professional. This form does not replace a separate health screening or identity check.\n\nI must receive and understand the studio’s aftercare instructions before the procedure and ask about anything that is unclear. Signing this form does not grant permission for marketing messages or photographs.`;
 const ack=(id:string,label:string):NativeField=>({id,type:'ACKNOWLEDGMENT',label,required:true});
 const fields:NativeField[]=[
  {id:'client_information',type:'HEADING',label:'Client information',required:false},
  {id:'client_name',type:'FULL_NAME',label:'Full legal name',required:true},
  {id:'date_of_birth',type:'DATE',label:'Date of birth',required:true},
  {id:'phone',type:'PHONE',label:'Phone number',required:true},
  {id:'email',type:'EMAIL',label:'Email address',required:false},
  {id:'address',type:'ADDRESS',label:'Physical address',required:true},
  {id:'photo_id',type:'PHOTO_ID',label:'Photo ID (if requested by the studio)',required:false},
  {id:'procedure_details',type:'HEADING',label:'Procedure details',required:false},
  {id:'procedure_description',type:'LONG_TEXT',label:kind==='TATTOO'?'Tattoo description / design':'Piercing description / jewelry',required:true},
  {id:'body_location',type:'TEXT',label:'Body location',required:true},
  {id:'appointment_date',type:'DATE',label:'Appointment date',required:true},
  {id:'consent',type:'HEADING',label:'Acknowledgments and consent',required:false},
  ack('adult','I confirm I am 18 or older. I understand the studio must verify my age and identity before the procedure.'),
  ack('voluntary',`I freely request this ${procedure} and consent to the procedure after reviewing the final placement and details with my artist.`),
  ack('questions','I have read this form and can ask questions before, during, and after the procedure. I will not proceed until my questions are answered.'),
  ack('risks','I understand the risks described above, including possible infection, allergic reactions, scarring, and permanent changes to my appearance.'),
  ack('aftercare','I understand that I must receive and understand aftercare instructions before the procedure, and that following them is important for healing.'),
  ack('accuracy','The information I provide is accurate to the best of my knowledge. I will tell my artist about relevant concerns before the procedure.'),
  {id:'apprentice',type:'RADIO',label:`May an apprentice observe ${artist} during your appointment for education?`,required:false,options:['Yes','No']},
  {id:'photo_permission',type:'RADIO',label:`May ${brand} photograph the finished work and use those photographs for education or social media?`,required:false,options:['Yes','No']},
 ];
 return {name:`${kind==='TATTOO'?'Tattoo':'Piercing'} consent — adult`,definition:nativeDefinition.parse({body,fields})};
}
