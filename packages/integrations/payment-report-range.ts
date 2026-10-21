export function paymentReportRange(start:string,end:string){
 const valid=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 if(!valid(start)||!valid(end))throw Error('Choose valid start and end dates.');
 const from=new Date(start+'T00:00:00Z'),until=new Date(Date.parse(end+'T00:00:00Z')+86400000);
 if(until<=from||until.getTime()-from.getTime()>366*86400000)throw Error('Choose a date range of up to 366 days.');
 return {from,until};
}
