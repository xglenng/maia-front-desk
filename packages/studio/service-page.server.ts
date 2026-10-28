import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {isIP} from 'node:net';
export function publicServiceUrl(value:string){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||url.hostname.endsWith('.')||isIP(url.hostname)||!url.hostname.includes('.')||/\.(localhost|local|internal|test|invalid)$/i.test(url.hostname))throw Error('Use a public HTTPS service page without login details.');
 url.hash='';return url;
}
export function publicIPv4(address:string){
 if(isIP(address)!==4)return false;
 const [a,b,c]=address.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===88&&c===99)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
export function servicePageText(html:string){
 const lower=html.toLowerCase();let text='',index=0;
 while(index<html.length&&text.length<50000){
  if(html[index]!=='<'){text+=html[index++];continue;}
  if(html.startsWith('<!--',index)){const end=html.indexOf('-->',index+4);index=end<0?html.length:end+3;continue;}
  const end=html.indexOf('>',index+1);if(end<0)break;
  const tag=lower.slice(index+1,end).match(/^\s*(script|style|noscript|svg)\b/);
  if(tag){const close=lower.indexOf(`</${tag[1]}`,end+1);index=close<0?html.length:close;}
  else index=end+1;
  text+=' ';
 }
 return text.replace(/&(nbsp|amp|quot|apos|lt|gt);/g,(_,key)=>({nbsp:' ',amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'}[key as string]||' ')).replace(/\s+/g,' ').trim();
}
export async function readPublicServicePage(value:string){
 let url=publicServiceUrl(value);const deadline=Date.now()+20000;
 for(let redirect=0;redirect<=3;redirect++){
  const addresses=await Promise.race([lookup(url.hostname,{all:true}),new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(Error('Website lookup timed out.')),3000);timer.unref();})]);
  // Reject mixed public/private results, then pin the connection to a validated IPv4 address.
  if(!addresses.length||addresses.some(result=>result.family===4&&!publicIPv4(result.address))||addresses.some(result=>result.family===6&&/^(::|f[cd]|fe[89ab])/i.test(result.address)))throw Error('This website address is not supported.');
  const address=addresses.find(result=>publicIPv4(result.address))?.address;
  if(!address)throw Error('This website needs a CSV export instead.');
  const timeout=Math.min(8000,deadline-Date.now());if(timeout<=0)throw Error('Website request timed out.');
  const result=await new Promise<{status:number;location?:string;type:string;text:string}>((resolve,reject)=>{
   const req=request({hostname:address,servername:url.hostname,port:443,method:'GET',path:url.pathname+url.search,headers:{Host:url.hostname,Accept:'text/html,text/plain', 'Accept-Encoding':'identity','User-Agent':'Maia-Service-Import/1.0'}},response=>{
    const status=response.statusCode||0;
    if([301,302,303,307,308].includes(status)){response.resume();resolve({status,location:response.headers.location,type:'',text:''});return;}
    const type=response.headers['content-type']||'';
    if(status!==200||!/^text\/(html|plain)\b/i.test(type)){response.resume();reject(Error('Could not read this public service page. Use a CSV export instead.'));return;}
    let bytes=0;const chunks:Buffer[]=[];
    response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>1000000){response.destroy();req.destroy(Error('Website is too large. Use a direct link to your service list.'));}else chunks.push(chunk);});
    response.on('error',reject);response.on('end',()=>resolve({status,type,text:Buffer.concat(chunks).toString('utf8')}));
   });
   const timer=setTimeout(()=>req.destroy(Error('Website request timed out.')),timeout);timer.unref();req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end();
  });
  if(result.location){if(redirect===3)throw Error('Too many website redirects.');url=publicServiceUrl(new URL(result.location,url).toString());continue;}
  const text=result.type.toLowerCase().startsWith('text/html')?servicePageText(result.text):result.text.slice(0,50000);
  if(text.length<20)throw Error('No readable service information found. Use a CSV export instead.');
  return text;
 }
 throw Error('Could not read this service page.');
}
