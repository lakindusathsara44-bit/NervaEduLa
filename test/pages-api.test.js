'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const pagesOrigin = 'https://lakindusathsara44-bit.github.io';

async function unusedPort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = listener.address();
  await new Promise(resolve => listener.close(resolve));
  return port;
}

test('GitHub Pages can register a teacher and use the Cloud Run bearer session', async t => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nervaedu-pages-api-'));
  for (const file of ['server.js', 'firebase-store.js', 'subjects.js']) {
    fs.copyFileSync(path.join(projectRoot, file), path.join(workDir, file));
  }
  const port = await unusedPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: workDir,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      NODE_ENV: 'test',
      NERVAEDU_ADMIN_PHONE: '0776000000',
      NERVAEDU_ADMIN_PASSWORD: 'test-manager-password',
      NERVAEDU_SESSION_SECRET: 'test-session-secret-that-is-long-enough-32-chars',
      NERVAEDU_CORS_ORIGINS: pagesOrigin,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  t.after(async () => {
    if (child.exitCode === null) {
      const stopped = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      await stopped;
    }
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) { ready = true; break; }
    } catch { /* Server is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, `server did not start: ${stderr}`);

  const preflight = await fetch(`${baseUrl}/api/register`, {
    method: 'OPTIONS',
    headers: {
      Origin: pagesOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), pagesOrigin);
  assert.match(preflight.headers.get('access-control-allow-headers') || '', /authorization/i);

  const form = new FormData();
  form.set('role', 'teacher');
  form.set('name', 'Test Teacher');
  form.set('phone', '0776123456');
  form.set('whatsapp', '0776123456');
  form.set('password', 'teacher-test-password');
  form.set('subjects', JSON.stringify(['O/L — Mathematics']));
  form.set('qualification', 'HND');
  form.set('thumbnail', new File([
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/H6sAAAAASUVORK5CYII=', 'base64'),
  ], 'teacher.png', { type: 'image/png' }));
  const registration = await fetch(`${baseUrl}/api/register`, {
    method: 'POST',
    headers: { Origin: pagesOrigin },
    body: form,
  });
  const registered = await registration.json();
  assert.equal(registration.status, 201, JSON.stringify(registered));
  assert.equal(registration.headers.get('access-control-allow-origin'), pagesOrigin);
  assert.equal(registered.user.role, 'teacher');
  assert.equal(typeof registered.sessionToken, 'string');

  const photo = await fetch(`${baseUrl}${registered.user.thumbnail}`, { headers: { Origin: pagesOrigin } });
  assert.equal(photo.status, 200, await photo.clone().text());
  assert.match(photo.headers.get('content-type') || '', /^image\/png/);

  const session = await fetch(`${baseUrl}/api/me`, {
    headers: { Origin: pagesOrigin, Authorization: `Bearer ${registered.sessionToken}` },
  });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.phone, '0776123456');

  const login = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { Origin: pagesOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '0776123456', password: 'teacher-test-password' }),
  });
  assert.equal(login.status, 200);
  assert.equal(typeof (await login.json()).sessionToken, 'string');
  const adminLogin = await fetch(`${baseUrl}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '0776000000', password: 'test-manager-password' }),
  });
  const admin = await adminLogin.json();
  assert.equal(adminLogin.status, 200, JSON.stringify(admin));
  const verification = await fetch(`${baseUrl}/api/admin/teachers/${registered.user.id}/verification`, {
    method: 'PUT', headers: { Authorization: `Bearer ${admin.sessionToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ approved: true }),
  });
  assert.equal(verification.status, 200, await verification.clone().text());
  const teacherResources = await fetch(`${baseUrl}/api/resources`, {
    method: 'POST', headers: { Authorization: `Bearer ${registered.sessionToken}` },
    body: (() => { const resourceForm = new FormData(); resourceForm.set('subject', 'O/L — Mathematics'); resourceForm.set('title', 'Sample paper'); resourceForm.set('papers', new File(['%PDF-1.4\nTest PDF'], 'paper.pdf', { type: 'application/pdf' })); return resourceForm; })(),
  });
  assert.equal(teacherResources.status, 201, await teacherResources.clone().text());
  const studentRegistration = await fetch(`${baseUrl}/api/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'student', name: 'Test Student', phone: '0776123457', password: 'student-test-password', age: 16, address: 'Colombo', school: 'Test School' }),
  });
  const student = await studentRegistration.json();
  assert.equal(studentRegistration.status, 201, JSON.stringify(student));
  const chooseTeacher = await fetch(`${baseUrl}/api/teacher-choice`, {
    method: 'PUT', headers: { Authorization: `Bearer ${student.sessionToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject: 'O/L — Mathematics', teacherId: registered.user.id }),
  });
  assert.equal(chooseTeacher.status, 200, await chooseTeacher.clone().text());
  const studentResources = await fetch(`${baseUrl}/api/resources`, { headers: { Authorization: `Bearer ${student.sessionToken}` } });
  const { resources } = await studentResources.json();
  assert.equal(studentResources.status, 200);
  assert.equal(resources.length, 1);
  assert.match(resources[0].url, /^\/uploads\/.+\?user=/);
  const paper = await fetch(`${baseUrl}${resources[0].url}`);
  assert.equal(paper.status, 200);
  assert.match(await paper.text(), /^%PDF-1\.4/);
  const publicFile = await fetch(`${baseUrl}${resources[0].url.split('?')[0]}`);
  assert.equal(publicFile.status, 401, 'learning files must require a session or short-lived signed URL');
});

