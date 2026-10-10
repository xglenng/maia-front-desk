import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRequire } from 'node:module';
import { LegalDocument } from '../../../components/legal-document';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server') as {
  renderToStaticMarkup(element: React.ReactElement): string;
};

test('published legal pages preserve disclosure paragraphs adjacent to headings and escape text', () => {
  const html = renderToStaticMarkup(React.createElement(LegalDocument, {
    title: 'Privacy Policy', effectiveDate: '2026-10-10',
    content: '# Privacy Policy\n\n## SMS Consent\nMobile information will not be shared for marketing.\nSecond disclosure line.\n\n## Contact\n<script>unsafe</script>\n\nReply STOP to opt out.',
  }));
  assert.match(html, /<h2[^>]*>SMS Consent<\/h2>/);
  assert.match(html, /Mobile information will not be shared for marketing\./);
  assert.match(html, /Second disclosure line\./);
  assert.match(html, /Reply STOP to opt out\./);
  assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
