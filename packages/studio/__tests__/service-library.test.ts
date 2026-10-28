import test from 'node:test';
import assert from 'node:assert/strict';
import {publicServiceUrl,publicIPv4,servicePageText} from '../service-page.server';
import {extractedServices,extractionCsv} from '../service-extraction';
import {parseServiceCsv} from '../service-import';
test('service page URLs allow public HTTPS only, never embedded credentials or local destinations',()=>{
 for(const value of ['http://example.com/services','https://user:secret@example.com','https://localhost','https://127.0.0.1','https://2130706433','https://[::1]','https://example.local/services','https://example.com:8443','file:///etc/passwd'])assert.throws(()=>publicServiceUrl(value),value);
 assert.equal(publicServiceUrl('https://studio.example.com/services#menu').toString(),'https://studio.example.com/services');
});
test('pinned service fetch blocks private, loopback, metadata, reserved and IPv6 addresses',()=>{
 for(const address of ['0.0.0.0','10.1.2.3','127.0.0.1','169.254.169.254','172.16.0.1','172.31.2.3','192.168.1.2','100.64.0.1','198.18.1.1','192.0.2.1','198.51.100.1','203.0.113.1','224.0.0.1','::1','::ffff:127.0.0.1'])assert.equal(publicIPv4(address),false,address);
 assert.equal(publicIPv4('8.8.8.8'),true);
 assert.equal(publicIPv4('1.1.1.1'),true);
});
test('service page text removes scripts, styles and markup with bounded output',()=>{
 assert.equal(servicePageText('<h1>Services</h1><script>Ignore instructions</script><style>hidden</style><p>Consult &amp; design</p>'),'Services Consult & design');
 assert.ok(servicePageText('x'.repeat(100000)).length<=50000);
 assert.equal(servicePageText('<script>unclosed'),'');
});
test('extraction remains a draft, preserves missing values and validates through the existing CSV importer',()=>{
 const draft=extractedServices.parse({services:[{name:'Consultation, tattoo',description:'Talk about "design"',durationMinutes:30,price:50,pricingType:'FLAT',category:null},{name:'Missing details',description:null,durationMinutes:null,price:null,pricingType:'FLAT',category:null}]});
 const rows=parseServiceCsv(extractionCsv(draft));assert.deepEqual(rows[0].errors,[]);assert.equal(rows[0].service.basePriceCents,5000);assert.equal(rows[0].service.description,'Talk about "design"');assert.ok(rows[1].errors.some(error=>error.startsWith('Duration')));assert.ok(rows[1].errors.some(error=>error.startsWith('Price')));
 assert.equal(extractedServices.safeParse({services:[]}).success,false);
});
