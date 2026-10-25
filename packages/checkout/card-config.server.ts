import {cardMode} from './card-policy';
export function counterCardConfiguration(){
 const livemode=cardMode(process.env);
 const origin=new URL(process.env.NEXT_PUBLIC_APP_URL||'');
 if(!process.env.STRIPE_COUNTER_WEBHOOK_SECRET?.startsWith('whsec_'))throw Error('Card payment confirmations are not configured.');
 if(livemode&&origin.protocol!=='https:')throw Error('Live card checkout requires HTTPS.');
 return {livemode,origin:origin.origin};
}
