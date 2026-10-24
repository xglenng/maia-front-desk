'use client';
import {useSession} from '@/components/session-gate';
import '../checkout/checkout.css';
export default function More(){const user=useSession();return <main className="checkout-page"><h1>More</h1><section className="checkout-cart"><h2>My studio</h2><p><a href="/items">Items & services →</a></p><p><a href="/settings/services">My services & pricing →</a></p><p><a href="/checkout">Checkout →</a></p>{user?.role==='OWNER'&&<><p><a href="/settings">Studio settings →</a></p><p><a href="/settings/team">Team & invitations →</a></p></>}<p>Signed in as {user?.name} · {user?.role==='OWNER'?'Studio owner':'Artist'}</p></section></main>}
