export function isUsTollFreeNumber(phone:string):boolean{
 return /^\+1(?:800|833|844|855|866|877|888)\d{7}$/.test(phone);
}
export function tollFreeApproval(status:unknown):{active:boolean;complianceStatus:string}{
 const normalized=String(status||'NOT_SUBMITTED').toUpperCase();
 return normalized==='TWILIO_APPROVED'?{active:true,complianceStatus:'APPROVED'}:{active:false,complianceStatus:normalized==='TWILIO_REJECTED'?'TOLL_FREE_REJECTED':normalized==='NOT_SUBMITTED'?'TOLL_FREE_NOT_SUBMITTED':'TOLL_FREE_PENDING'};
}
