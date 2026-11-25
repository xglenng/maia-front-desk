import {setupReturnHref,setupScreens,setupStages} from './wizard';
export type SetupPosition={stage:string;item:string};
export function setupPositionKey(user:{id:string;organization_id:string}){return `maia:setup-position:v1:${user.organization_id}:${user.id}`;}
export function parseSetupPosition(value:unknown):SetupPosition|null{
 if(!value||typeof value!=='object')return null;
 const {stage,item}=value as Record<string,unknown>;
 return typeof stage==='string'&&typeof item==='string'&&setupScreens.some(screen=>screen.id===item&&screen.stage===stage)?{stage,item}:null;
}
export function readSetupPosition(user:{id:string;organization_id:string}):SetupPosition|null{
 try{return parseSetupPosition(JSON.parse(window.localStorage.getItem(setupPositionKey(user))||'null'));}catch{return null;}
}
export function saveSetupPosition(user:{id:string;organization_id:string},position:SetupPosition){
 const valid=parseSetupPosition(position);if(!valid)return;
 try{window.localStorage.setItem(setupPositionKey(user),JSON.stringify(valid));}catch{/* Setup still works when browser storage is unavailable. */}
}
export function resumeSetupHref(position:SetupPosition|null,fallback:string){
 return position?setupReturnHref(position.stage,'studio',position.item):setupReturnHref(setupStages.some(s=>s.id===fallback)?fallback:'studio');
}
