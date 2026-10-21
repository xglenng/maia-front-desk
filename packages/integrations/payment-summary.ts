type Payment = {status:string;amountCents:number;refundedCents:number;tipCents?:number};
/** Pending charges are never included as received money. Refunds do not change price. */
export function paymentSummary(priceCents:number|null, payments:Payment[]) {
 const received=payments.filter(p=>p.status==='PAID'||p.status.startsWith('REFUND')).reduce((sum,p)=>sum+p.amountCents,0);
 const refunded=payments.reduce((sum,p)=>sum+p.refundedCents,0);
 const retained=received-refunded;
 const settled=payments.filter(p=>p.status==='PAID'||p.status.startsWith('REFUND'));
 const tips=settled.reduce((sum,p)=>sum+(p.tipCents||0),0);
 // Partial refunds require review; allocate returned money to tips first.
 const refundedTips=settled.reduce((sum,p)=>sum+Math.min(p.refundedCents,p.tipCents||0),0);
 const retainedTips=tips-refundedTips;
 return {totalCents:priceCents,receivedCents:received,refundedCents:refunded,retainedCents:retained,remainingCents:priceCents==null?null:Math.max(0,priceCents-(retained-retainedTips)),tipReceivedCents:tips,tipRefundedCents:refundedTips,tipRetainedCents:retainedTips,needsReview:payments.some(p=>['REFUND_PENDING','REFUND_REVIEW'].includes(p.status))};
}
