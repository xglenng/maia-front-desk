import {redirect} from 'next/navigation';
export default async function LegacyIntegrations({searchParams}:{searchParams:Promise<{artistId?:string}>}){
 const {artistId}=await searchParams;
 redirect(`/settings/services?import=apps${artistId?`&artistId=${encodeURIComponent(artistId)}`:''}`);
}
