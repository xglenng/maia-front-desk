import test from 'node:test';
import assert from 'node:assert/strict';
import {isMissingStudioLogoTable} from '../studio-logo-schema';

test('only the missing studio logo table is treated as an unavailable logo migration',()=>{
 const missing=Object.assign(new Error('relation "studio_logo_assets" does not exist'),{code:'42P01'});
 assert.equal(isMissingStudioLogoTable(new Error('Query failed',{cause:missing})),true);
 assert.equal(isMissingStudioLogoTable(Object.assign(new Error('relation "other_table" does not exist'),{code:'42P01'})),false);
 assert.equal(isMissingStudioLogoTable(Object.assign(new Error('permission denied for studio_logo_assets'),{code:'42501'})),false);
 assert.equal(isMissingStudioLogoTable(new Error('connection failed')),false);
});
