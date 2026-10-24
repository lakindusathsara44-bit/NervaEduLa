'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'nervaedu-app.js'), 'utf8');

test('multi-element welcome and role controls use the collection selector', () => {
  for (const selector of ['[data-rating]', '.welcome-socials a', '.role-option']) {
    const quoted = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(app, new RegExp(`\\$\\$\\('${quoted}'\\)\\.forEach\\(`), `expected ${selector} to use $$()`);
    assert.doesNotMatch(app, new RegExp(`(^|[^$])\\$\\('${quoted}'\\)\\.forEach\\(`), `unexpected single-element selector for ${selector}`);
  }
});

