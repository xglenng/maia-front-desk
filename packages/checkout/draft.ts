import {cartSchema,type CartInput} from './cart';
export function restoreSaleDraft(raw:string,artistId:string):CartInput|null{
 try{const parsed=cartSchema.safeParse(JSON.parse(raw));return parsed.success&&parsed.data.artistId===artistId?parsed.data:null;}catch{return null;}
}
