'use strict';

const crypto = require('node:crypto');

const MAX_ACTIVE_SESSIONS = 5;

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function parseSessionToken(token, secret, now = Date.now()) {
  const match = /^([0-9a-f-]{36})\.([0-9a-f-]{36})\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(String(token || ''));
  if (!match) return null;
  const expiresAt = Number(match[3]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return null;
  const payload = `${match[1]}.${match[2]}.${match[3]}`;
  const expected = sign(payload, secret);
  const actualBytes = Buffer.from(match[4]);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(actualBytes, expectedBytes)) return null;
  return { userId: match[1], sessionId: match[2], expiresAt };
}

function createSession(user, secret, ttlSeconds = 7 * 24 * 60 * 60, now = Date.now()) {
  if (!user || !user.id || typeof secret !== 'string' || secret.length < 1) throw new Error('A user and session signing secret are required.');
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 60) throw new Error('Session lifetime must be at least 60 seconds.');
  const nowSeconds = Math.floor(now / 1000);
  const expiresAt = nowSeconds + ttlSeconds;
  user.sessions = (Array.isArray(user.sessions) ? user.sessions : [])
    .filter(session => Number.isSafeInteger(session.expiresAt) && session.expiresAt > nowSeconds);
  const sessionId = crypto.randomUUID();
  user.sessions.push({ id: sessionId, createdAt: nowSeconds, expiresAt });
  user.sessions.sort((a, b) => a.createdAt - b.createdAt);
  if (user.sessions.length > MAX_ACTIVE_SESSIONS) user.sessions.splice(0, user.sessions.length - MAX_ACTIVE_SESSIONS);
  const payload = `${user.id}.${sessionId}.${expiresAt}`;
  return `${payload}.${sign(payload, secret)}`;
}

function findSession(token, users, secret, now = Date.now()) {
  const parsed = parseSessionToken(token, secret, now);
  if (!parsed) return null;
  const user = users.find(item => item.id === parsed.userId);
  if (!user || !Array.isArray(user.sessions)) return null;
  const session = user.sessions.find(item => item.id === parsed.sessionId && item.expiresAt === parsed.expiresAt);
  return session ? { user, session } : null;
}

function revokeSession(user, sessionId) {
  if (!user || !Array.isArray(user.sessions)) return false;
  const before = user.sessions.length;
  user.sessions = user.sessions.filter(session => session.id !== sessionId);
  return user.sessions.length !== before;
}

function revokeAllSessions(user) {
  if (!user) return;
  user.sessions = [];
}

function rotateSession(user, currentSessionId, secret, ttlSeconds = 7 * 24 * 60 * 60, now = Date.now()) {
  if (!revokeSession(user, currentSessionId)) throw new Error('The current session is no longer active. Please sign in again.');
  return createSession(user, secret, ttlSeconds, now);
}

module.exports = {
  MAX_ACTIVE_SESSIONS,
  createSession,
  findSession,
  parseSessionToken,
  revokeSession,
  revokeAllSessions,
  rotateSession,
};
