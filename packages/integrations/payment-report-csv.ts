type Totals={paymentCount:number;serviceCents:number;tipCents:number;refundCents:number;netCents:number;needsReview:number};
type Row=Totals&{artistName:string};
function cell(value:string|number){
 let text=String(value);
 if(/^[\t\r\n]|^[\s\uFEFF]*[=+\-@]/.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}
/** One owner-scoped report, no client or card details. Refunds follow payment cohorts. */
export function paymentReportCsv(start:string,end:string,rows:Row[],totals:Totals){
 const header=['Row type','Artist','Payment date from (UTC)','Payment date through (UTC)','Currency','Settled payments','Service received','Tips received','Refunded to date','Net collected before fees','Refunds needing review'];
 const values=(kind:string,name:string,row:Totals)=>[kind,name,start,end,'USD',row.paymentCount,(row.serviceCents/100).toFixed(2),(row.tipCents/100).toFixed(2),(row.refundCents/100).toFixed(2),(row.netCents/100).toFixed(2),row.needsReview];
 return '\uFEFF'+[header,...rows.map(row=>values('Artist',row.artistName,row)),values('Total','Selected artists',totals)].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
