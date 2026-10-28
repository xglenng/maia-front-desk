import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {helpArticles,helpCollections,searchHelp,supportDraft,supportEmail} from '../help-center';
test('help collections and articles have unique IDs and working internal destinations',()=>{
 assert.equal(new Set(helpCollections.map(topic=>topic.id)).size,helpCollections.length);
 assert.equal(new Set(helpArticles.map(article=>article.id)).size,helpArticles.length);
 for(const article of helpArticles){
  assert.ok(helpCollections.some(topic=>topic.id===article.collection));
  assert.ok(article.answer.length);
  for(const link of article.links||[]){const path=link.href.split('?')[0];assert.ok(path==='/'||existsSync(`app${path}/page.tsx`),link.href);}
 }
});
test('help search supports case-insensitive multi-term queries and collection filters',()=>{
 assert.ok(searchHelp('SMS consent').some(article=>article.id==='sms-failed'));
 assert.ok(searchHelp('GOOGLE FORMS','forms').some(article=>article.id==='external-forms'));
 assert.ok(searchHelp('  ').length===helpArticles.length);
 assert.ok(searchHelp('','calendar').every(article=>article.collection==='calendar'));
 assert.equal(searchHelp('no-matching-help-text').length,0);
});
test('support drafts encode user text and remain addressed to the configured support mailbox',()=>{
 const draft=supportDraft('Bug report','Testing & symbols?\nA + B');
 assert.ok(draft.startsWith(`mailto:${supportEmail}?`));
 const query=new URLSearchParams(draft.split('?')[1]);
 assert.equal(query.get('subject'),'Maia Bug report');
 assert.ok(query.get('body')?.includes('Testing & symbols?\nA + B'));
 assert.ok(query.get('body')?.includes('never include passwords'));
});
