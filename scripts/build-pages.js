'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const outputDir = path.join(root, '_site');
fs.mkdirSync(outputDir, { recursive: true });
fs.cpSync(publicDir, outputDir, { recursive: true });

const subjects = require(path.join(root, 'subjects.js'));
const catalog = {};
for (const key of ['OL_NAMES', 'AL_NAMES', 'OL_SUBJECTS', 'AL_SUBJECTS', 'SCHOLARSHIP_NAMES', 'SCHOLARSHIP_SUBJECTS', 'EXAM_SUBJECTS']) {
  catalog[key] = subjects[key];
}

let apiUrl = String(process.env.NERVAEDU_API_URL || '').trim().replace(/\/+$/, '');
if (apiUrl) {
  const parsed = new URL(apiUrl);
  if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error('NERVAEDU_API_URL must be an HTTPS service origin with no path, query, or credentials.');
  }
}

const indexPath = path.join(outputDir, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
const marker = 'window.NERVAEDU_API_BASE = "";';
if (!html.includes(marker)) throw new Error('Could not find the NervaEdu API URL marker in public/index.html.');
html = html.replace(marker, `window.NERVAEDU_API_BASE = ${JSON.stringify(apiUrl)};`);
fs.writeFileSync(indexPath, html);
fs.writeFileSync(path.join(outputDir, 'assets', 'catalog.js'), 'window.NERVAEDU_SUBJECTS = ' + JSON.stringify(catalog) + ';\n');
fs.writeFileSync(path.join(outputDir, '.nojekyll'), '');

for (const asset of ['assets/nervaedu-app.js', 'assets/nervaedu.css', 'assets/catalog.js']) {
  if (!fs.statSync(path.join(outputDir, asset)).isFile()) throw new Error(`Pages build is missing ${asset}.`);
}
new (require('node:vm').Script)(fs.readFileSync(path.join(outputDir, 'assets', 'catalog.js'), 'utf8'));
console.log(`GitHub Pages site built in ${outputDir}; API ${apiUrl ? 'configured' : 'not configured'}.`);

