export type InvoiceChannelResult={status:'SUBMITTED'|'FAILED';message:string};
/** Each delivery is independent: one channel failing must not suppress the other. */
export async function sendInvoiceChannels(email:()=>Promise<{message:string}>,sms:()=>Promise<{message:string}>){
 const attempts=await Promise.allSettled([Promise.resolve().then(email),Promise.resolve().then(sms)]);
 const result=(attempt:PromiseSettledResult<{message:string}>):InvoiceChannelResult=>attempt.status==='fulfilled'?{status:'SUBMITTED',message:attempt.value.message}:{status:'FAILED',message:attempt.reason instanceof Error?attempt.reason.message:'Delivery could not be completed.'};
 return {email:result(attempts[0]),sms:result(attempts[1])};
}
