import {assertPublicHttpsUrl} from '@/packages/consent';
import {z} from 'zod';
const text=z.string().trim().min(1).max(500);
const publicUrl=z.string().url().max(2048).refine(value=>{try{assertPublicHttpsUrl(value,'Verification URL');return true;}catch{return false;}},'Use a public HTTPS URL.');
export const tollFreeInput=z.object({
 BusinessName:text,BusinessWebsite:publicUrl,NotificationEmail:z.string().email().max(254),
 BusinessStreetAddress:text,BusinessCity:text,BusinessStateProvinceRegion:text,BusinessPostalCode:text,BusinessCountry:z.literal('US'),
 BusinessContactFirstName:text,BusinessContactLastName:text,BusinessContactEmail:z.string().email().max(254),BusinessContactPhone:z.string().regex(/^\+[1-9]\d{7,14}$/),
 BusinessRegistrationNumber:z.string().trim().regex(/^\d{2}-?\d{7}$/),BusinessRegistrationAuthority:z.literal('EIN'),BusinessRegistrationCountry:z.literal('US'),
 BusinessType:z.enum(['PRIVATE_PROFIT','PUBLIC_PROFIT','NON_PROFIT','GOVERNMENT']),
 UseCaseCategories:z.array(z.enum(['ACCOUNT_NOTIFICATIONS','CUSTOMER_CARE','MARKETING'])).min(1).max(3),
 UseCaseSummary:z.string().trim().min(40).max(4096),ProductionMessageSample:z.string().trim().min(20).max(1024),
 OptInImageUrls:z.array(publicUrl).min(1).max(5),OptInType:z.literal('WEB_FORM'),MessageVolume:z.enum(['10','100','1000','10000','100000','250000','500000','750000','1000000','5000000','10000000']),
 PrivacyPolicyUrl:publicUrl,TermsAndConditionsUrl:publicUrl,
}).strict();
