import React from "react";
type Props = { artistName: string; phoneNumber: string; complianceStatus: string };
function displayPhone(value: string) {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(value);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : value;
}
/** Derived from saved phone status so confirmation survives refresh and navigation. */
export function NumberConfirmation({artistName,phoneNumber,complianceStatus}:Props) {
  const mock = complianceStatus.startsWith('MOCK_') || !/^\+[1-9]\d{7,14}$/.test(phoneNumber);
  const approved = complianceStatus === 'APPROVED' && !mock;
  return <section aria-label="Phone number confirmation" role="status" style={{marginTop:18,padding:22,borderRadius:12,border:`1px solid ${mock?'#d8bd80':'#b9d9c4'}`,background:mock?'#fff9ec':'#f0f8f3',overflowWrap:'anywhere'}}>
    <h2 style={{margin:'0 0 10px',fontSize:22,color:mock?'#75531b':'#236343'}}>{mock ? 'Test number only' : `${artistName}’s business number is set up`}</h2>
    <p style={{fontSize:28,fontWeight:750,margin:'8px 0'}}>{displayPhone(phoneNumber)}</p>
    <p style={{lineHeight:1.6,margin:'12px 0 18px'}}>{mock
      ? 'This is a test number. It cannot send or receive real messages. Complete live business setup to get a real number.'
      : approved
        ? 'Messaging registration is approved. Review your client SMS consent settings before sending messages.'
        : 'Your number is saved, but texting is not active yet. Complete your business information and submit messaging registration. Texting becomes available after approval.'}</p>
    <a href={mock?'/settings/sms?tab=business':approved?'/settings/sms?tab=consent':'/compliance'} style={{display:'inline-flex',justifyContent:'center',alignItems:'center',boxSizing:'border-box',maxWidth:'100%',padding:'14px 18px',borderRadius:8,background:'#181716',color:'#fff',fontWeight:700,textDecoration:'none',lineHeight:1.4}}>{mock?'Continue live business setup →':approved?'Next: review SMS consent →':'Next: complete SMS registration →'}</a>
  </section>;
}
