'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');

function createBuildFixture() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nervaedu-pages-build-'));
  fs.copyFileSync(path.join(projectRoot, 'subjects.js'), path.join(workDir, 'subjects.js'));
  fs.cpSync(path.join(projectRoot, 'scripts'), path.join(workDir, 'scripts'), { recursive: true });
  fs.cpSync(path.join(projectRoot, 'public'), path.join(workDir, 'public'), { recursive: true });
  return workDir;
}

test('Pages build publishes the frontend, generated subjects, and configured API origin', t => {
  const workDir = createBuildFixture();
  t.after(() => fs.rmSync(workDir, { recursive: true, force: true }));
  const apiUrl = 'https://nervaedu-test.asia-south1.run.app';
  const result = spawnSync(process.execPath, ['scripts/build-pages.js'], {
    cwd: workDir,
    env: { ...process.env, NERVAEDU_API_URL: apiUrl },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);

  const output = path.join(workDir, '_site');
  const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  const catalogPath = path.join(output, 'assets', 'catalog.js');
  assert.ok(html.includes(`window.NERVAEDU_API_BASE = "${apiUrl}";`));
  assert.match(html, /src="\.\/assets\/nervaedu-app\.js"/);
  assert.equal(fs.existsSync(catalogPath), true);
  assert.match(fs.readFileSync(catalogPath, 'utf8'), /window\.NERVAEDU_SUBJECTS/);
  assert.equal(spawnSync(process.execPath, ['--check', catalogPath], { encoding: 'utf8' }).status, 0);
});

test('Pages build refuses an API URL with an unsafe path', t => {
  const workDir = createBuildFixture();
  t.after(() => fs.rmSync(workDir, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, ['scripts/build-pages.js'], {
    cwd: workDir,
    env: { ...process.env, NERVAEDU_API_URL: 'https://nervaedu-test.asia-south1.run.app/api' },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /NERVAEDU_API_URL must be an HTTPS service origin/);
});

