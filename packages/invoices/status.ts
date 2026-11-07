export function invoiceStatusLabel(status:string,smsStatus:string){
 if(status==='PAID')return 'Paid';
 if(status==='VOID')return 'Void';
 if(status==='UNCOLLECTIBLE')return 'Uncollectible';
 if(status==='ISSUING')return 'Issuing';
 if(status==='DRAFT')return 'Draft';
 if(status==='OPEN')return smsStatus==='SENT'?'Sent':'Link ready';
 return status;
}
export function invoiceDeliveryLabel(smsStatus:string,delivery:string|null){
 if(smsStatus==='SENT'){
  if(delivery==='delivered'||delivery==='read')return 'Delivered';
  if(delivery==='failed'||delivery==='undelivered')return 'Delivery failed; check Inbox before taking further action.';
  return 'Submitted to provider; delivery not yet confirmed.';
 }
 if(smsStatus==='SENDING')return 'Sending; check again before retrying.';
 if(smsStatus==='UNKNOWN')return 'Delivery is uncertain; check Inbox or the provider before retrying.';
 return 'Not sent';
}
