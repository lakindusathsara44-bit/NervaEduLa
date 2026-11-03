'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sessions = require('../session-store');

const SECRET = 'test-only-session-secret';
const USER_ID = 'a8f5f167-f44f-4c6b-a5c4-2f6f7e8d9a10';
const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);

function user() { return { id: USER_ID, role: 'student' }; }

test('a newly issued session is signed and resolves only for its owning user', () => {
  const account = user();
  const token = sessions.createSession(account, SECRET, 3600, NOW);
  const result = sessions.findSession(token, [account], SECRET, NOW);
  assert.equal(result.user, account);
  assert.equal(result.session.expiresAt, Math.floor(NOW / 1000) + 3600);
  assert.equal(account.sessions.length, 1);
});

test('logout revokes the server-side session even when the token signature is valid', () => {
  const account = user();
  const token = sessions.createSession(account, SECRET, 3600, NOW);
  const parsed = sessions.parseSessionToken(token, SECRET, NOW);
  assert.equal(sessions.revokeSession(account, parsed.sessionId), true);
  assert.equal(sessions.findSession(token, [account], SECRET, NOW), null);
});

test('rotation invalidates the old token and returns a new active token', () => {
  const account = user();
  const oldToken = sessions.createSession(account, SECRET, 3600, NOW);
  const oldSession = sessions.parseSessionToken(oldToken, SECRET, NOW);
  const newToken = sessions.rotateSession(account, oldSession.sessionId, SECRET, 3600, NOW + 1000);
  assert.equal(sessions.findSession(oldToken, [account], SECRET, NOW + 1000), null);
  assert.ok(sessions.findSession(newToken, [account], SECRET, NOW + 1000));
});

test('logout-all invalidates every active session for the account', () => {
  const account = user();
  const first = sessions.createSession(account, SECRET, 3600, NOW);
  const second = sessions.createSession(account, SECRET, 3600, NOW + 1000);
  sessions.revokeAllSessions(account);
  assert.equal(sessions.findSession(first, [account], SECRET, NOW + 1000), null);
  assert.equal(sessions.findSession(second, [account], SECRET, NOW + 1000), null);
});

test('expired, tampered and wrong-secret tokens are rejected', () => {
  const account = user();
  const token = sessions.createSession(account, SECRET, 60, NOW);
  assert.equal(sessions.findSession(token, [account], SECRET, NOW + 60_000), null);
  assert.equal(sessions.findSession(token + 'x', [account], SECRET, NOW), null);
  assert.equal(sessions.findSession(token, [account], 'another-secret', NOW), null);
});

test('active sessions are bounded and oldest sessions are evicted', () => {
  const account = user();
  const tokens = [];
  for (let index = 0; index < sessions.MAX_ACTIVE_SESSIONS + 1; index += 1) {
    tokens.push(sessions.createSession(account, SECRET, 3600, NOW + index * 1000));
  }
  assert.equal(account.sessions.length, sessions.MAX_ACTIVE_SESSIONS);
  assert.equal(sessions.findSession(tokens[0], [account], SECRET, NOW + 10_000), null);
  assert.ok(sessions.findSession(tokens[1], [account], SECRET, NOW + 10_000));
});
