export type TipChoice=0|15|20|25|'custom';
export function checkoutTip(balanceCents:number,choice:TipChoice,custom:string){
 const validBalance=Number.isSafeInteger(balanceCents)&&balanceCents>=0;
 const customValid=/^\d+(?:\.\d{1,2})?$/.test(custom);
 const tipCents=choice==='custom'?Math.round(Number(custom)*100):Math.round(balanceCents*choice/100);
 const valid=validBalance&&(choice!=='custom'||customValid)&&Number.isSafeInteger(tipCents)&&tipCents>=0&&tipCents<=100000&&Number.isSafeInteger(balanceCents+tipCents);
 return {tipCents,valid,totalCents:valid?balanceCents+tipCents:null};
}
