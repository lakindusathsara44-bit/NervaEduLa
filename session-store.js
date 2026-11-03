'use strict';

const crypto = require('node:crypto');
const persistence = require('./firebase-store');

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

function buildSession(userId, ttlSeconds, now = Date.now()) {
  if (!userId) throw new Error('A user ID is required to create a session.');
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 60) throw new Error('Session lifetime must be at least 60 seconds.');
  const createdAt = Math.floor(now / 1000);
  return {
    id: crypto.randomUUID(),
    userId,
    createdAt,
    expiresAt: createdAt + ttlSeconds,
  };
}

function tokenFor(session, secret) {
  const payload = `${session.userId}.${session.id}.${session.expiresAt}`;
  return `${payload}.${sign(payload, secret)}`;
}

async function createSession(user, secret, ttlSeconds = 7 * 24 * 60 * 60, now = Date.now()) {
  if (!user || !user.id || typeof secret !== 'string' || secret.length < 1) throw new Error('A user and session signing secret are required.');
  const session = buildSession(user.id, ttlSeconds, now);
  if (persistence.enabled()) {
    await persistence.createSessionRecord(session);
  } else {
    const nowSeconds = Math.floor(now / 1000);
    user.sessions = (Array.isArray(user.sessions) ? user.sessions : [])
      .filter(item => Number.isSafeInteger(item.expiresAt) && item.expiresAt > nowSeconds);
    user.sessions.push({ id: session.id, createdAt: session.createdAt, expiresAt: session.expiresAt });
    user.sessions.sort((a, b) => a.createdAt - b.createdAt);
    if (user.sessions.length > MAX_ACTIVE_SESSIONS) user.sessions.splice(0, user.sessions.length - MAX_ACTIVE_SESSIONS);
  }
  return tokenFor(session, secret);
}

async function findSession(token, users, secret, now = Date.now()) {
  const parsed = parseSessionToken(token, secret, now);
  if (!parsed) return null;
  const user = users.find(item => item.id === parsed.userId);
  if (!user) return null;

  if (persistence.enabled()) {
    const record = await persistence.getSessionRecord(parsed.sessionId);
    if (!record || record.userId !== parsed.userId || record.expiresAt !== parsed.expiresAt) return null;
    return { user, session: { id: parsed.sessionId, createdAt: record.createdAt, expiresAt: record.expiresAt } };
  }

  if (!Array.isArray(user.sessions)) return null;
  const session = user.sessions.find(item => item.id === parsed.sessionId && item.expiresAt === parsed.expiresAt);
  return session ? { user, session } : null;
}

async function revokeSession(user, sessionId) {
  if (!user) return false;
  if (persistence.enabled()) return persistence.revokeSessionRecord(sessionId, user.id);
  if (!Array.isArray(user.sessions)) return false;
  const before = user.sessions.length;
  user.sessions = user.sessions.filter(session => session.id !== sessionId);
  return user.sessions.length !== before;
}

async function revokeAllSessions(user) {
  if (!user) return 0;
  if (persistence.enabled()) return persistence.revokeAllSessionRecords(user.id);
  const count = Array.isArray(user.sessions) ? user.sessions.length : 0;
  user.sessions = [];
  return count;
}

async function rotateSession(user, currentSessionId, secret, ttlSeconds = 7 * 24 * 60 * 60, now = Date.now()) {
  if (!user || !user.id || typeof secret !== 'string' || secret.length < 1) throw new Error('A user and session signing secret are required.');
  const session = buildSession(user.id, ttlSeconds, now);
  if (persistence.enabled()) {
    await persistence.rotateSessionRecord(currentSessionId, user.id, session);
  } else {
    if (!await revokeSession(user, currentSessionId)) throw new Error('The current session is no longer active. Please sign in again.');
    await createSession(user, secret, ttlSeconds, now);
    const stored = user.sessions[user.sessions.length - 1];
    session.id = stored.id;
    session.createdAt = stored.createdAt;
    session.expiresAt = stored.expiresAt;
  }
  return tokenFor(session, secret);
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
