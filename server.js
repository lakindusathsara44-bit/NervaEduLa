// NervaEdu LMS server. Local mode uses Node.js built-ins; Firestore mode uses firebase-admin.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EXAM_SUBJECTS, OL_NAMES, AL_NAMES, OL_SUBJECTS, AL_SUBJECTS, SCHOLARSHIP_NAMES, SCHOLARSHIP_SUBJECTS } = require('./subjects');
const persistence = require('./firebase-store');

function loadDotEnv() {
  const envFile = path.join(__dirname, '.env');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || match[1] in process.env) continue;
    const value = match[2].replace(/^(["'])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
}
loadDotEnv();

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'nervaedu.json');
const LEGACY_DB_FILE = path.join(DATA_DIR, 'islandlearn.json');
if (!fs.existsSync(DB_FILE) && fs.existsSync(LEGACY_DB_FILE)) fs.copyFileSync(LEGACY_DB_FILE, DB_FILE);
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const SECURE_COOKIE = process.env.NODE_ENV === 'production' ? '; Secure' : '';
const MAX_FORM = 8 * 1024 * 1024;
const MAX_RESOURCE = 130 * 1024 * 1024;
const imageKitEndpoint = (process.env.IMAGEKIT_URL_ENDPOINT || '').replace(/\/$/, '');
const imageKitReady = Boolean(process.env.IMAGEKIT_PUBLIC_KEY && process.env.IMAGEKIT_PRIVATE_KEY && /^https:\/\/ik\.imagekit\.io\/[A-Za-z0-9_-]+$/.test(imageKitEndpoint));
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : { users: [], resources: [], quizzes: [], choices: {} };
db.users ||= []; db.resources ||= []; db.quizzes ||= []; db.choices ||= {}; db.accessRequests ||= []; db.videoUnlocks ||= []; db.videoPacks ||= []; db.teacherPlanRequests ||= [];
let writeQueue = Promise.resolve();
function save() {
  const snapshot = JSON.stringify(db, null, 2);
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    await persistence.saveDatabase(db);
    await fs.promises.writeFile(DB_FILE + '.tmp', snapshot);
    await fs.promises.rename(DB_FILE + '.tmp', DB_FILE);
  });
  return writeQueue;
}
const videoReservations = new Map();
const authFailures = new Map();
const SESSION_SECRET = process.env.NERVAEDU_SESSION_SECRET || process.env.NERVAEDU_ADMIN_PASSWORD || 'change-this-session-secret-in-production';
const SESSION_TTL = 7 * 24 * 60 * 60;
function sessionCookieValue(userId) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const payload = `${userId}.${exp}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifySessionToken(token) {
  const match = /^([0-9a-f-]{36})\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(String(token || ''));
  if (!match || Number(match[2]) < Math.floor(Date.now() / 1000)) return null;
  const payload = `${match[1]}.${match[2]}`;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (match[3].length !== expected.length || !crypto.timingSafeEqual(Buffer.from(match[3]), Buffer.from(expected))) return null;
  return match[1];
}
function issueSession(res, userId) {
  const token = sessionCookieValue(userId);
  res.setHeader('set-cookie', `il_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}${SECURE_COOKIE}`);
}
function clearSession(res) {
  res.setHeader('set-cookie', `il_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${SECURE_COOKIE}`);
}
function authFailureKey(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim(); }
function checkLoginRateLimit(req) {
  const now = Date.now(), key = authFailureKey(req), item = authFailures.get(key);
  if (item && item.blockedUntil > now) throw fail(429, 'Too many sign-in attempts. Please wait a few minutes and try again.');
  if (item && now - item.firstAt > 10 * 60 * 1000) authFailures.delete(key);
}
function recordLoginFailure(req) {
  const now = Date.now(), key = authFailureKey(req), item = authFailures.get(key);
  if (!item || now - item.firstAt > 10 * 60 * 1000) authFailures.set(key, { firstAt: now, count: 1, blockedUntil: 0 });
  else { item.count += 1; if (item.count >= 8) item.blockedUntil = now + 5 * 60 * 1000; }
}
function clearLoginFailures(req) { authFailures.delete(authFailureKey(req)); }
function checkRegisterRateLimit(req) {
  const now = Date.now(), key = 'register:' + authFailureKey(req), item = authFailures.get(key);
  if (item && item.blockedUntil > now) throw fail(429, 'Too many registration attempts. Please wait a few minutes and try again.');
  if (item && now - item.firstAt > 30 * 60 * 1000) authFailures.delete(key);
}
function recordRegisterAttempt(req) {
  const now = Date.now(), key = 'register:' + authFailureKey(req), item = authFailures.get(key);
  if (!item || now - item.firstAt > 30 * 60 * 1000) authFailures.set(key, { firstAt: now, count: 1, blockedUntil: 0 });
  else { item.count += 1; if (item.count >= 5) item.blockedUntil = now + 15 * 60 * 1000; }
}
const mimeExt = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'application/pdf': '.pdf' };
const json = (res, status, payload) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(payload)); };
const fail = (status, message) => Object.assign(new Error(message), { status });
const clean = (value, max = 300) => String(value || '').trim().slice(0, max);
function validPhone(value) {
  const phone = clean(value, 30);
  const digits = phone.replace(/\D/g, '');
  return /^\+?[0-9()\s-]+$/.test(phone) && digits.length >= 9 && digits.length <= 15;
}
function phoneKey(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('94') && digits.length === 11) digits = '0' + digits.slice(2);
  return digits;
}
function validSubject(value) {
  return typeof value === 'string' && (EXAM_SUBJECTS.includes(value) || /^(?:O\/L|A\/L|Other) — [^\r\n,]{2,80}$/.test(value));
}
const HIDDEN_HTTP_NAMES = new Set(['data', 'private', 'config', 'node_modules', '.git', '.npm-cache', '.test-run', 'logs', 'log', 'backups', 'backup', 'server.js', 'firebase-store.js', 'subjects.js', 'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock']);
function isPrivateHttpPath(rawUrl) {
  const rawPath = String(rawUrl || '/').split(/[?#]/, 1)[0];
  let pathname;
  try { pathname = decodeURIComponent(rawPath); } catch { return true; }
  if (pathname.includes('\\') || /%(?:2f|5c)/i.test(rawPath)) return true;
  const parts = pathname.split('/').filter(Boolean);
  if (parts.some(part => part === '.' || part === '..')) return true;
  return parts.some(part => {
    const name = part.toLowerCase();
    return name.startsWith('.env') || HIDDEN_HTTP_NAMES.has(name) || /\.(?:log|bak|backup|old|sqlite|db)$/i.test(name);
  });
}
const isVerifiedTeacher = user => user?.role === 'teacher' && user.verificationStatus !== 'pending' && user.verificationStatus !== 'rejected';
const publicUser = (u) => ({ id: u.id, role: u.role, name: u.name, age: u.role === 'student' ? u.age : undefined, school: u.role === 'student' ? u.school : undefined, subjects: u.subjects, qualification: u.qualification, otherQualification: u.otherQualification, thumbnail: u.thumbnail, isVerified: u.role === 'teacher' ? isVerifiedTeacher(u) : undefined, verificationStatus: u.role === 'teacher' ? (u.verificationStatus || 'verified') : undefined });
const privateUser = (u) => ({ ...publicUser(u), phone: u.phone, address: u.address, whatsapp: u.whatsapp });
function studentSelectedTeacherId(studentId, subject) { return db.choices[studentId]?.[subject] || null; }
function studentCanSeeTeacherContent(studentId, resource) { return studentSelectedTeacherId(studentId, resource.subject) === resource.teacherId; }
function activeSubscription(teacher) {
  const plan = teacher?.subscription;
  return plan?.status === 'active' && Date.parse(plan.expiresAt) > Date.now() ? plan : null;
}
function addCalendarMonth(value) {
  const result = new Date(value), day = result.getUTCDate();
  result.setUTCDate(1); result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}
function teacherEnrollment(teacherId) {
  return new Set(Object.entries(db.choices).filter(([, choices]) => Object.values(choices || {}).includes(teacherId)).map(([studentId]) => studentId)).size;
}
function studentCountForSubject(teacherId, subject) {
  return Object.values(db.choices).filter(choices => choices?.[subject] === teacherId).length;
}
function teacherPlanInfo(teacher) {
  const subscription = activeSubscription(teacher), tier = subscription?.tier || 'free';
  const limits = { free: 250, premium: 1400, plus: 10000 };
  return { tier, previousTier: teacher.subscription?.tier || 'free', status: subscription ? 'active' : 'free', expiresAt: subscription?.expiresAt || null, studentLimit: limits[tier], studentCount: teacherEnrollment(teacher.id), subjectLimit: tier === 'free' ? 250 : limits[tier] };
}
function requireVerifiedTeacher(user) {
  if (user?.role !== 'teacher') throw fail(403, 'Only teacher accounts can use this feature.');
  if (!isVerifiedTeacher(user)) throw fail(403, 'Your teacher account is waiting for NervaEdu admin verification.');
}
function teacherCanAcceptStudent(teacher, subject, studentId) {
  if (db.choices[studentId]?.[subject] === teacher.id) return true;
  const plan = teacherPlanInfo(teacher);
  if (plan.tier === 'free') return studentCountForSubject(teacher.id, subject) < 250;
  const alreadyEnrolled = Object.values(db.choices[studentId] || {}).includes(teacher.id);
  return alreadyEnrolled || plan.studentCount < plan.studentLimit;
}
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, exceeded = false;
    req.on('data', chunk => { if (exceeded) return; size += chunk.length; if (size > max) { exceeded = true; chunks.length = 0; reject(fail(413, 'Upload is too large.')); } else chunks.push(chunk); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function multipart(buffer, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)?.slice(1).find(Boolean);
  if (!boundary) throw fail(400, 'Invalid form upload.');
  const fields = {}, files = [];
  for (const part of buffer.toString('binary').split('--' + boundary).slice(1)) {
    if (part === '--\r\n' || part === '--' || !part.trim()) continue;
    const closing = part.endsWith('--\r\n');
    let data = part.replace(/^\r\n/, '');
    if (closing) data = data.slice(0, -4);
    data = data.replace(/\r\n$/, '');
    const splitAt = data.indexOf('\r\n\r\n'); if (splitAt < 0) continue;
    const headerText = data.slice(0, splitAt), body = data.slice(splitAt + 4);
    const disposition = /content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i.exec(headerText);
    if (!disposition) continue;
    const [, name, filename] = disposition;
    const type = /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim().toLowerCase() || 'application/octet-stream';
    const bytes = Buffer.from(body, 'binary');
    if (filename !== undefined && filename !== '') files.push({ field: name, name: path.basename(filename).slice(0, 160), type, bytes });
    else fields[name] = bytes.toString('utf8');
  }
  return { fields, files };
}
function sessionUser(req) {
  const token = /(?:^|;\s*)il_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  const id = verifySessionToken(token);
  return id && db.users.find(u => u.id === id);
}
async function storeFile(file, allowed, max) {
  if (!allowed.includes(file.type)) throw fail(400, 'Unsupported file type: ' + file.name);
  if (!file.bytes.length || file.bytes.length > max) throw fail(413, 'File is empty or exceeds the allowed size: ' + file.name);
  const bytes = file.bytes;
  const signatureOK = file.type === 'image/jpeg' ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : file.type === 'image/png' ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : file.type === 'image/webp' ? bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    : file.type === 'application/pdf' ? bytes.subarray(0, 5).toString('ascii') === '%PDF-'
    : file.type === 'video/webm' ? bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    : file.type === 'video/mp4' || file.type === 'video/quicktime' ? bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp'
    : false;
  if (!signatureOK) throw fail(400, 'The file content does not match its declared type: ' + file.name);
  const ext = mimeExt[file.type]; const name = crypto.randomUUID() + ext;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), file.bytes, { flag: 'wx' });
  return '/uploads/' + name;
}
const subjectsFor = u => Array.isArray(u.subjects) ? u.subjects : [];
function videoIsUnlocked(studentId, resource) {
  return db.videoUnlocks.some(item => item.studentId === studentId && item.teacherId === resource.teacherId && item.subject === resource.subject && (item.scope === 'pack' || item.resourceId === resource.id));
}
function videoAccessStatus(studentId, resource) {
  if (videoIsUnlocked(studentId, resource)) return 'unlocked';
  const request = db.accessRequests.find(item => item.studentId === studentId && item.teacherId === resource.teacherId && item.subject === resource.subject && item.status === 'pending' && (item.scope === 'pack' || item.resourceId === resource.id));
  return request ? 'pending' : 'locked';
}
function signedImageKitUrl(filePath) {
  if (!imageKitReady || !filePath || !filePath.startsWith('/') || filePath.includes('?') || filePath.includes('#')) throw fail(503, 'Video storage is not configured.');
  const expire = Math.floor(Date.now() / 1000) + 300;
  const pathForSignature = filePath.slice(1) + expire;
  const signature = crypto.createHmac('sha1', process.env.IMAGEKIT_PRIVATE_KEY).update(pathForSignature).digest('hex');
  return `${imageKitEndpoint}${filePath}?ik-t=${expire}&ik-s=${signature}`;
}
async function imageKitRequest(fileId, method = 'GET') {
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(fileId)) throw fail(400, 'ImageKit returned invalid file details.');
  const credentials = Buffer.from(process.env.IMAGEKIT_PRIVATE_KEY + ':').toString('base64');
  let response;
  try {
    response = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}${method === 'GET' ? '/details' : ''}`, {
      method, headers: { authorization: `Basic ${credentials}` }, signal: AbortSignal.timeout(10000),
    });
  } catch { throw fail(503, 'NervaEdu could not verify the upload with ImageKit. Please try again.'); }
  if (method === 'DELETE') return response.ok;
  if (response.status === 404) throw fail(400, 'ImageKit could not find the uploaded file.');
  if (!response.ok) throw fail(503, 'NervaEdu could not verify the upload with ImageKit. Please try again.');
  try { return await response.json(); } catch { throw fail(503, 'ImageKit returned unreadable file details.'); }
}
async function discardImageKitFile(fileId) {
  try { await imageKitRequest(fileId, 'DELETE'); } catch { /* Never register an upload that failed its privacy check. */ }
}
function whatsappNumber(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '94' + digits.slice(1);
  return digits;
}
function whatsappReceiptUrl(teacher, student, title, subject, priceLkr) {
  const message = `Hello ${teacher.name}, I would like to pay LKR ${priceLkr} for ${title} (${subject}). I will attach my payment receipt in this WhatsApp chat. My name is ${student.name}. Please review it and unlock my access in NervaEdu.`;
  return `https://wa.me/${whatsappNumber(teacher.whatsapp)}?text=${encodeURIComponent(message)}`;
}
function planReceiptUrl(teacher, tier) {
  const price = tier === 'premium' ? 1000 : 2100;
  const range = tier === 'premium' ? '251-1,400 students' : '1,401-10,000 students';
  const admin = db.users.find(user => user.role === 'admin');
  const phone = whatsappNumber(admin?.phone || process.env.NERVAEDU_ADMIN_PHONE || '0776083337');
  const planName = tier === 'plus' ? 'Premium Plus' : 'Premium';
  const message = 'Hello NervaEdu admin, I am ' + teacher.name + ' (teacher ID ' + teacher.id + '). I request ' + planName + ' for ' + range + ', LKR ' + price + ' per month. I will attach my payment receipt in this WhatsApp chat. Please review it and activate my plan.';
  return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message);
}
function validPrice(value) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 1 && amount <= 10000000;
}
async function api(req, res, url) {
  const method = req.method, p = url.pathname;
  if (method === 'POST' && p === '/api/register') {
    checkRegisterRateLimit(req);
    recordRegisterAttempt(req);
    const body = await readBody(req, MAX_FORM); let fields, files;
    if ((req.headers['content-type'] || '').includes('multipart/form-data')) ({ fields, files } = multipart(body, req.headers['content-type']));
    else { fields = JSON.parse(body.toString('utf8')); files = []; }
    const role = clean(fields.role, 20);
    if (!['student', 'teacher'].includes(role)) throw fail(400, 'Choose student or teacher account.');
    const name = clean(fields.name, 90), phone = clean(fields.phone, 30), password = String(fields.password || '');
    if (name.length < 2 || !validPhone(phone) || password.length < 8) throw fail(400, 'Enter your name, a valid phone number, and a password of at least 8 characters.');
    if (db.users.some(u => phoneKey(u.phone) === phoneKey(phone))) throw fail(409, 'An account with that phone number already exists. Please sign in.');
    let user;
    if (role === 'student') {
      const age = Number(fields.age);
      if (!Number.isInteger(age) || age < 5 || age > 100) throw fail(400, 'Enter a valid age.');
      for (const field of ['address', 'school']) if (clean(fields[field], 200).length < 2) throw fail(400, 'Complete your address and school.');
      user = { id: crypto.randomUUID(), role, name, age, phone, address: clean(fields.address, 200), school: clean(fields.school, 120), subjects: [] };
    } else {
      let subs; try { subs = JSON.parse(fields.subjects || '[]'); } catch { throw fail(400, 'Select one or more subjects.'); }
      if (!Array.isArray(subs)) throw fail(400, 'Select at least one subject.');
      subs = [...new Set(subs.map(s => clean(s, 100)))];
      if (!subs.length || subs.some(s => !validSubject(s))) throw fail(400, 'Choose exam subjects from the list or enter valid custom subjects.');
      const qualification = clean(fields.qualification, 90), otherQualification = clean(fields.otherQualification, 180);
      if (!subs.length || !validPhone(fields.whatsapp) || !qualification || (qualification === 'Other' && otherQualification.length < 3)) throw fail(400, 'Complete your subjects, a valid WhatsApp number and qualification details.');
      const avatar = files.find(f => f.field === 'thumbnail');
      let thumbnail = '';
      if (avatar) thumbnail = await storeFile(avatar, ['image/jpeg', 'image/png', 'image/webp'], 4 * 1024 * 1024);
      user = { id: crypto.randomUUID(), role, name, phone, whatsapp: clean(fields.whatsapp, 30), subjects: subs, qualification, otherQualification, thumbnail, verificationStatus: 'pending', subscription: { tier: 'free', status: 'free' }, createdAt: new Date().toISOString() };
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
    db.users.push({ ...user, salt, passwordHash });
    await save();
    issueSession(res, user.id);
    return json(res, 201, { user: privateUser(user) });
  }
  if (method === 'POST' && p === '/api/login') {
    checkLoginRateLimit(req);
    const { phone, password } = JSON.parse((await readBody(req, MAX_FORM)).toString('utf8'));
    if (!validPhone(phone)) throw fail(401, 'Phone number or password is incorrect.');
    const user = db.users.find(u => phoneKey(u.phone) === phoneKey(phone));
    const candidate = user && crypto.scryptSync(String(password || ''), user.salt, 64).toString('hex');
    if (!user || !crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(user.passwordHash, 'hex'))) { recordLoginFailure(req); throw fail(401, 'Phone number or password is incorrect.'); }
    clearLoginFailures(req);
    issueSession(res, user.id);
    return json(res, 200, { user: privateUser(user) });
  }
  if (method === 'POST' && p === '/api/logout') {
    clearSession(res); return json(res, 200, { ok: true });
  }
  if (method === 'GET' && p === '/api/health') return json(res, 200, { ok: true, database: persistence.enabled() ? 'firestore' : 'local' });
  if (method === 'GET' && p === '/api/me') { const u = sessionUser(req); return json(res, 200, { user: u ? privateUser(u) : null }); }
  if (method === 'GET' && p === '/api/teachers') {
    const subject = clean(url.searchParams.get('subject'), 100);
    const teachers = db.users.filter(u => isVerifiedTeacher(u) && (!subject || subjectsFor(u).includes(subject))).map(publicUser);
    return json(res, 200, { teachers });
  }
  if (method === 'GET' && p === '/api/subjects') {
    const custom = db.users.filter(isVerifiedTeacher).flatMap(u => subjectsFor(u));
    return json(res, 200, { subjects: [...new Set([...EXAM_SUBJECTS, ...custom])].sort((a, b) => a.localeCompare(b)) });
  }
  const me = sessionUser(req);
  if (p.startsWith('/api/') && !me) throw fail(401, 'Please sign in to continue.');
  if (method === 'POST' && p === '/api/imagekit-auth') {
    requireVerifiedTeacher(me);
    if (!imageKitReady) throw fail(503, 'ImageKit is not configured on this server yet.');
    const body = JSON.parse((await readBody(req, MAX_FORM)).toString('utf8'));
    const subject = clean(body.subject, 100), type = clean(body.type, 20), priceLkr = Number(body.priceLkr);
    if (!subjectsFor(me).includes(subject) || !['video', 'pdf'].includes(type)) throw fail(400, 'Choose one of your subjects and a supported resource type.');
    if (type === 'video' && !validPrice(priceLkr)) throw fail(400, 'Set a valid video price before uploading.');
    if (type === 'video' && db.resources.filter(item => item.teacherId === me.id && item.subject === subject && item.type === 'video').length >= 5) throw fail(400, `You can upload up to 5 videos for ${subject}.`);
    const token = crypto.randomUUID(), expire = Math.floor(Date.now() / 1000) + 300;
    const signature = crypto.createHmac('sha1', process.env.IMAGEKIT_PRIVATE_KEY).update(token + expire).digest('hex');
    const checks = type === 'video' ? '"file.mime" IN ["video/mp4","video/webm","video/quicktime"] AND "file.size" <= 104857600' : '"file.mime" IN ["application/pdf"] AND "file.size" <= 26214400';
    return json(res, 200, { token, expire, signature, publicKey: process.env.IMAGEKIT_PUBLIC_KEY, folder: `/nervaedu/${me.id}`, checks });
  }
  if (p === '/api/teacher-status' && method === 'GET') {
    if (me.role !== 'teacher') throw fail(403, 'Only teachers can view their plan status.');
    const subjects = subjectsFor(me).map(subject => ({ subject, studentCount: studentCountForSubject(me.id, subject), freeLimit: 250 }));
    const pendingRequest = db.teacherPlanRequests.find(item => item.teacherId === me.id && item.status === 'pending') || null;
    return json(res, 200, { verificationStatus: me.verificationStatus || 'verified', plan: teacherPlanInfo(me), subjects, pendingRequest });
  }
  if (p === '/api/plan-requests' && method === 'POST') {
    requireVerifiedTeacher(me);
    const { tier } = JSON.parse((await readBody(req, MAX_FORM)).toString('utf8'));
    if (!['premium', 'plus'].includes(tier)) throw fail(400, 'Choose Premium or Premium Plus.');
    const count = teacherEnrollment(me.id), subjectLimitReached = subjectsFor(me).some(subject => studentCountForSubject(me.id, subject) >= 250);
    const previousTier = me.subscription?.tier;
    const renewingPremium = tier === 'premium' && ['premium', 'plus'].includes(previousTier);
    const renewingPlus = tier === 'plus' && previousTier === 'plus';
    if (tier === 'premium' && !renewingPremium && count < 250 && !subjectLimitReached) throw fail(409, 'Premium is available after reaching 250 students on the free plan.');
    if (tier === 'plus' && !renewingPlus && count < 1400) throw fail(409, 'Premium Plus is available after reaching 1,400 students.');
    const duplicate = db.teacherPlanRequests.find(item => item.teacherId === me.id && item.status === 'pending');
    if (duplicate) return json(res, 200, { request: duplicate, whatsappUrl: planReceiptUrl(me, duplicate.tier) });
    const prices = { premium: 1000, plus: 2100 }, limits = { premium: 1400, plus: 10000 };
    const request = { id: crypto.randomUUID(), teacherId: me.id, teacherName: me.name, phone: me.phone, tier, priceLkr: prices[tier], studentLimit: limits[tier], status: 'pending', createdAt: new Date().toISOString() };
    db.teacherPlanRequests.unshift(request); await save();
    return json(res, 201, { request, whatsappUrl: planReceiptUrl(me, tier) });
  }
  if (p === '/api/admin/overview' && method === 'GET') {
    if (me.role !== 'admin') throw fail(403, 'Only the NervaEdu account manager can access this panel.');
    return json(res, 200, { teacherCount: db.users.filter(user => user.role === 'teacher').length, pendingTeachers: db.users.filter(user => user.role === 'teacher' && user.verificationStatus === 'pending').length, pendingPlans: db.teacherPlanRequests.filter(item => item.status === 'pending').length, studentCount: db.users.filter(user => user.role === 'student').length });
  }
  if (p === '/api/admin/teachers' && method === 'GET') {
    if (me.role !== 'admin') throw fail(403, 'Only the NervaEdu account manager can verify teachers.');
    const teachers = db.users.filter(user => user.role === 'teacher').map(user => ({ ...publicUser(user), phone: user.phone, whatsapp: user.whatsapp, verificationStatus: user.verificationStatus || 'verified', plan: teacherPlanInfo(user), createdAt: user.createdAt || null }));
    return json(res, 200, { teachers });
  }
  const verifyMatch = /^\/api\/admin\/teachers\/([^/]+)\/verification$/.exec(p);
  if (verifyMatch && method === 'PUT') {
    if (me.role !== 'admin') throw fail(403, 'Only the NervaEdu account manager can verify teachers.');
    const teacher = db.users.find(user => user.id === decodeURIComponent(verifyMatch[1]) && user.role === 'teacher');
    if (!teacher) throw fail(404, 'Teacher account not found.');
    const { approved } = JSON.parse((await readBody(req, MAX_FORM)).toString('utf8'));
    if (typeof approved !== 'boolean') throw fail(400, 'Choose approve or reject.');
    teacher.verificationStatus = approved ? 'verified' : 'rejected'; teacher.verifiedAt = approved ? new Date().toISOString() : null; teacher.verifiedBy = me.id;
    await save(); return json(res, 200, { teacher: publicUser(teacher) });
  }
  if (p === '/api/admin/plan-requests' && method === 'GET') {
    if (me.role !== 'admin') throw fail(403, 'Only the NervaEdu account manager can activate plans.');
    return json(res, 200, { requests: db.teacherPlanRequests });
  }
  const planMatch = /^\/api\/admin\/plan-requests\/([^/]+)\/activate$/.exec(p);
  if (planMatch && method === 'POST') {
    if (me.role !== 'admin') throw fail(403, 'Only the NervaEdu account manager can activate plans.');
    const request = db.teacherPlanRequests.find(item => item.id === decodeURIComponent(planMatch[1]) && item.status === 'pending');
    if (!request) throw fail(404, 'Pending plan request not found.');
    const teacher = db.users.find(user => user.id === request.teacherId && user.role === 'teacher' && isVerifiedTeacher(user));
    if (!teacher) throw fail(409, 'Verify this teacher before activating a plan.');
    const now = new Date(), currentExpiry = Date.parse(teacher.subscription?.expiresAt || '');
    const startedAt = currentExpiry > now.getTime() ? new Date(currentExpiry) : now;
    const expiresAt = addCalendarMonth(startedAt);
    teacher.subscription = { tier: request.tier, status: 'active', startedAt: now.toISOString(), expiresAt: expiresAt.toISOString(), studentLimit: request.studentLimit, priceLkr: request.priceLkr };
    request.status = 'activated'; request.activatedAt = now.toISOString(); request.expiresAt = expiresAt.toISOString(); request.activatedBy = me.id;
    await save(); return json(res, 200, { ok: true, subscription: teacher.subscription });
  }
  if (p === '/api/access-requests' && method === 'GET') {
    if (me.role === 'teacher') {
      const requests = db.accessRequests.filter(item => item.teacherId === me.id && item.status === 'pending');
      return json(res, 200, { requests });
    }
    return json(res, 200, { requests: db.accessRequests.filter(item => item.studentId === me.id) });
  }
  if (p === '/api/access-requests' && method === 'POST') {
    if (me.role !== 'student') throw fail(403, 'Only student accounts can request video access.');
    const body = JSON.parse((await readBody(req, MAX_FORM)).toString('utf8'));
    const scope = body.scope;
    if (!['video', 'pack'].includes(scope)) throw fail(400, 'Choose a video or video pack.');
    let teacher, subject, resource = null;
    if (scope === 'video') {
      resource = db.resources.find(item => item.id === body.resourceId && item.type === 'video');
      if (!resource) throw fail(404, 'That video could not be found.');
      teacher = db.users.find(item => item.id === resource.teacherId && isVerifiedTeacher(item));
      subject = resource.subject;
      if (videoIsUnlocked(me.id, resource)) throw fail(409, 'You already have access to this video.');
      if (!validPrice(resource.priceLkr)) throw fail(409, 'This video is not available for paid access yet. Ask the teacher to set its price.');
    } else {
      teacher = db.users.find(item => item.id === body.teacherId && isVerifiedTeacher(item));
      subject = clean(body.subject, 100);
      if (!teacher || !subjectsFor(teacher).includes(subject) || !db.resources.some(item => item.teacherId === teacher.id && item.subject === subject && item.type === 'video')) throw fail(404, 'That teacher video pack could not be found.');
      if (db.videoUnlocks.some(item => item.studentId === me.id && item.teacherId === teacher.id && item.subject === subject && item.scope === 'pack')) throw fail(409, 'You already have access to this video pack.');
      if (!db.videoPacks.some(item => item.teacherId === teacher.id && item.subject === subject && validPrice(item.priceLkr))) throw fail(409, 'This video pack is not available yet. Ask the teacher to set its price.');
    }
    if (!teacher?.whatsapp || !whatsappNumber(teacher.whatsapp)) throw fail(400, 'This teacher has not provided a WhatsApp number.');
    const packPrice = scope === 'pack' ? db.videoPacks.find(item => item.teacherId === teacher.id && item.subject === subject)?.priceLkr : null;
    const priceLkr = scope === 'pack' ? packPrice : resource.priceLkr;
    const duplicate = db.accessRequests.find(item => item.studentId === me.id && item.teacherId === teacher.id && item.subject === subject && item.status === 'pending' && (scope === 'pack' ? item.scope === 'pack' : item.scope === 'video' && item.resourceId === resource.id));
    if (duplicate) return json(res, 200, { request: duplicate, whatsappUrl: whatsappReceiptUrl(teacher, me, duplicate.resourceTitle, subject, duplicate.priceLkr) });
    const title = scope === 'pack' ? `${subject} video pack` : resource.title;
    const request = {
      id: crypto.randomUUID(), studentId: me.id, studentName: me.name, studentPhone: me.phone,
      teacherId: teacher.id, teacherName: teacher.name, subject, scope,
      resourceId: resource?.id || null, resourceTitle: title, priceLkr, status: 'pending', createdAt: new Date().toISOString(),
    };
    db.accessRequests.unshift(request); await save();
    return json(res, 201, { request, whatsappUrl: whatsappReceiptUrl(teacher, me, title, subject, priceLkr) });
  }
  const unlockRequest = /^\/api\/access-requests\/([^/]+)\/unlock$/.exec(p);
  if (unlockRequest && method === 'POST') {
    requireVerifiedTeacher(me);
    const request = db.accessRequests.find(item => item.id === decodeURIComponent(unlockRequest[1]));
    if (!request || request.teacherId !== me.id) throw fail(404, 'That access request could not be found.');
    if (request.status !== 'pending') throw fail(409, 'This access request has already been handled.');
    db.videoUnlocks.push({
      id: crypto.randomUUID(), studentId: request.studentId, teacherId: me.id,
      subject: request.subject, scope: request.scope, resourceId: request.resourceId,
      requestId: request.id, createdAt: new Date().toISOString(),
    });
    request.status = 'unlocked'; request.resolvedAt = new Date().toISOString();
    await save();
    return json(res, 200, { ok: true });
  }
  if (method === 'PUT' && p === '/api/teacher-choice') {
    if (me.role !== 'student') throw fail(403, 'Only student accounts can choose a teacher.');
    const { subject, teacherId } = JSON.parse((await readBody(req, MAX_FORM)).toString('utf8'));
    const teacher = db.users.find(u => u.id === teacherId && isVerifiedTeacher(u) && subjectsFor(u).includes(subject));
    if (!teacher || !clean(subject, 100)) throw fail(400, 'That verified teacher does not teach this subject.');
    if (!teacherCanAcceptStudent(teacher, subject, me.id)) {
      const tier = teacherPlanInfo(teacher).tier;
      throw fail(403, 'This teacher has reached the ' + (tier === 'free' ? '250-student limit for this subject' : tier + ' plan capacity') + '. The teacher must request a plan upgrade from the NervaEdu admin.');
    }
    db.choices[me.id] ||= {}; db.choices[me.id][subject] = teacher.id; await save(); return json(res, 200, { ok: true });
  }
  if (method === 'GET' && p === '/api/my-choices') return json(res, 200, { choices: db.choices[me.id] || {} });
  if (method === 'PUT' && p === '/api/video-pack-price') {
    requireVerifiedTeacher(me);
    const body = JSON.parse((await readBody(req, MAX_FORM)).toString('utf8'));
    const subject = clean(body.subject, 100), priceLkr = Number(body.priceLkr);
    if (!subjectsFor(me).includes(subject)) throw fail(400, 'Choose a subject from your teacher profile.');
    if (!validPrice(priceLkr)) throw fail(400, 'Enter a whole-number pack price from LKR 1 to LKR 10,000,000.');
    let pack = db.videoPacks.find(item => item.teacherId === me.id && item.subject === subject);
    if (pack) { pack.priceLkr = priceLkr; pack.updatedAt = new Date().toISOString(); }
    else { pack = { id: crypto.randomUUID(), teacherId: me.id, subject, priceLkr, updatedAt: new Date().toISOString() }; db.videoPacks.push(pack); }
    await save(); return json(res, 200, { pack });
  }
  if (method === 'POST' && p === '/api/resources') {
    requireVerifiedTeacher(me);
    if ((req.headers['content-type'] || '').includes('application/json')) {
      if (!imageKitReady) throw fail(503, 'ImageKit is not configured on this server yet.');
      const data = JSON.parse((await readBody(req, MAX_FORM)).toString('utf8'));
      const subject = clean(data.subject, 100), title = clean(data.title, 150) || 'Learning resource';
      const filePath = clean(data.filePath, 500), fileId = clean(data.fileId, 160), type = clean(data.type, 20);
      const name = clean(data.name, 160), size = Number(data.size), priceLkr = Number(data.priceLkr);
      if (!subjectsFor(me).includes(subject) || !['video', 'pdf'].includes(type)) throw fail(400, 'Choose a subject from your profile and a supported resource type.');
      let decodedFilePath = ''; try { decodedFilePath = decodeURIComponent(filePath); } catch { throw fail(400, 'ImageKit returned invalid file details.'); }
      if (!decodedFilePath.startsWith(`/nervaedu/${me.id}/`) || decodedFilePath.includes('\\') || decodedFilePath.includes('?') || decodedFilePath.includes('#') || decodedFilePath.split('/').some(part => part === '..') || !fileId || !name || !Number.isSafeInteger(size)) throw fail(400, 'ImageKit returned invalid file details.');
      let uploadedUrl; try { uploadedUrl = new URL(data.url); } catch { throw fail(400, 'ImageKit returned an invalid file URL.'); }
      let uploadedPath = ''; try { uploadedPath = decodeURIComponent(uploadedUrl.pathname); } catch { throw fail(400, 'ImageKit returned an invalid file URL.'); }
      if (uploadedUrl.origin !== imageKitEndpoint || uploadedPath !== decodedFilePath) throw fail(400, 'The file URL does not match its ImageKit file path.');
      const max = type === 'video' ? 100 * 1024 * 1024 : 25 * 1024 * 1024;
      if (size <= 0 || size > max) throw fail(413, `The ${type === 'video' ? 'video' : 'PDF'} exceeds the ${type === 'video' ? '100 MB' : '25 MB'} limit.`);
      if (type === 'video' && !validPrice(priceLkr)) throw fail(400, 'Set a whole-number video price in LKR.');
      const videos = db.resources.filter(r => r.teacherId === me.id && r.subject === subject && r.type === 'video');
      if (type === 'video' && videos.length >= 5) throw fail(400, `You can upload up to 5 videos for ${subject}.`);
      const details = await imageKitRequest(fileId);
      let detailPath = '', detailUrl;
      try { detailPath = decodeURIComponent(details.filePath || ''); detailUrl = new URL(details.url); } catch { throw fail(400, 'ImageKit returned invalid file details.'); }
      if (details.fileId !== fileId || detailPath !== decodedFilePath || Number(details.size) !== size || detailUrl.origin !== imageKitEndpoint || decodeURIComponent(detailUrl.pathname) !== decodedFilePath) throw fail(400, 'The uploaded file details do not match the registered resource.');
      const allowedMime = type === 'video' ? ['video/mp4', 'video/webm', 'video/quicktime'] : ['application/pdf'];
      if (!allowedMime.includes(details.mime)) throw fail(400, 'The uploaded file is not a supported video or PDF.');
      if ((type === 'video' && details.isPrivateFile !== true) || (type === 'pdf' && details.isPrivateFile === true)) {
        if (detailPath.startsWith(`/nervaedu/${me.id}/`)) await discardImageKitFile(fileId);
        throw fail(400, type === 'video' ? 'ImageKit did not mark this video private, so NervaEdu rejected the upload.' : 'This PDF is private in ImageKit and cannot be shared with students.');
      }
      const row = { id: crypto.randomUUID(), teacherId: me.id, teacherName: me.name, subject, title, name, type, ...(type === 'video' ? { priceLkr, imageKitPrivate: true } : {}), imageKitFileId: fileId, imageKitFilePath: filePath, url: type === 'video' ? '' : clean(data.url, 1200), createdAt: new Date().toISOString() };
      if (type === 'video') row.url = `/media/${row.id}`;
      db.resources.unshift(row); await save(); return json(res, 201, { resources: [row] });
    }
    const form = multipart(await readBody(req, MAX_RESOURCE), req.headers['content-type'] || '');
    const subject = clean(form.fields.subject, 100), title = clean(form.fields.title, 150) || 'Learning resource';
    if (!subjectsFor(me).includes(subject)) throw fail(400, 'Choose a subject from your teacher profile.');
    const selected = form.files;
    if (!selected.length) throw fail(400, 'Choose a video or PDF to upload.');
    const videos = selected.filter(f => f.type.startsWith('video/'));
    const priceLkr = Number(form.fields.priceLkr);
    if (videos.length && !validPrice(priceLkr)) throw fail(400, 'Set a whole-number price in LKR for each video before uploading.');
    if (!videos.length && form.fields.priceLkr) throw fail(400, 'A video price was provided without a video.');
    if (videos.length !== selected.length && selected.some(f => f.type !== 'application/pdf')) throw fail(400, 'Upload videos or PDF files only.');
    const key = me.id + '|' + subject;
    const existing = db.resources.filter(r => r.teacherId === me.id && r.subject === subject && r.type === 'video').length;
    const reserved = videoReservations.get(key) || 0;
    if (existing + reserved + videos.length > 5) throw fail(400, `You can upload up to 5 videos for ${subject}. ${existing + reserved} already uploaded or uploading.`);
    if (videos.length) videoReservations.set(key, reserved + videos.length);
    try {
      const added = [];
      for (const file of selected) {
        const isVideo = file.type.startsWith('video/');
        const urlPath = await storeFile(file, isVideo ? ['video/mp4', 'video/webm', 'video/quicktime'] : ['application/pdf'], isVideo ? 100 * 1024 * 1024 : 25 * 1024 * 1024);
        const row = { id: crypto.randomUUID(), teacherId: me.id, teacherName: me.name, subject, title, name: file.name, type: isVideo ? 'video' : 'pdf', ...(isVideo ? { priceLkr } : {}), url: urlPath, createdAt: new Date().toISOString() };
        db.resources.unshift(row); added.push(row);
      }
      await save(); return json(res, 201, { resources: added });
    } finally {
      if (videos.length) {
        const remaining = (videoReservations.get(key) || videos.length) - videos.length;
        if (remaining) videoReservations.set(key, remaining); else videoReservations.delete(key);
      }
    }
  }
  if (method === 'GET' && p === '/api/resources') {
    const subject = clean(url.searchParams.get('subject'), 100);
    const resources = db.resources.filter(r => (!subject || r.subject === subject) && (me.role === 'teacher' ? r.teacherId === me.id : me.role === 'student' ? studentCanSeeTeacherContent(me.id, r) : true)).map(resource => {
      if (me.role !== 'student' || resource.type !== 'video') return resource;
      const accessStatus = videoAccessStatus(me.id, resource);
      return { ...resource, accessStatus, ...(!videoIsUnlocked(me.id, resource) ? { url: null, imageKitFileId: undefined, imageKitFilePath: undefined } : {}) };
    });
    const videoPacks = db.videoPacks.filter(pack => me.role === 'teacher' ? pack.teacherId === me.id : me.role === 'student' ? studentSelectedTeacherId(me.id, pack.subject) === pack.teacherId : true);
    const accessRequests = me.role === 'student' ? db.accessRequests.filter(item => item.studentId === me.id) : [];
    return json(res, 200, { resources, videoPacks, accessRequests });
  }
  if (method === 'POST' && p === '/api/quizzes') {
    requireVerifiedTeacher(me);
    const data = JSON.parse((await readBody(req, MAX_FORM)).toString('utf8'));
    if (!subjectsFor(me).includes(data.subject) || !Array.isArray(data.questions) || data.questions.length !== 6) throw fail(400, 'Choose one of your subjects and provide exactly 6 questions.');
    const questions = data.questions.map(q => ({ prompt: clean(q.prompt, 300), options: Array.isArray(q.options) ? q.options.map(x => clean(x, 180)) : [], answer: Number(q.answer) }));
    if (questions.some(q => !q.prompt || q.options.length !== 4 || q.options.some(x => !x) || !Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3)) throw fail(400, 'Each question needs a prompt, four choices and a correct answer.');
    const quiz = { id: crypto.randomUUID(), teacherId: me.id, teacherName: me.name, subject: data.subject, title: clean(data.title, 120) || `${data.subject} practice quiz`, questions, createdAt: new Date().toISOString() };
    db.quizzes.unshift(quiz); await save(); return json(res, 201, { quiz: { ...quiz, questions: questions.map(({ answer, ...q }) => q) } });
  }
  if (method === 'GET' && p === '/api/quizzes') {
    const subject = clean(url.searchParams.get('subject'), 100);
    const quizzes = db.quizzes.filter(q => (!subject || q.subject === subject) && (me.role === 'teacher' ? q.teacherId === me.id : me.role === 'student' ? studentSelectedTeacherId(me.id, q.subject) === q.teacherId : true)).map(q => ({ ...q, questions: q.questions.map(({ answer, ...item }) => item) }));
    return json(res, 200, { quizzes });
  }
  const submit = /^\/api\/quizzes\/([^/]+)\/submit$/.exec(p);
  if (method === 'POST' && submit) {
    if (me.role !== 'student') throw fail(403, 'Only student accounts can submit quiz answers.');
    const quiz = db.quizzes.find(q => q.id === submit[1]); if (!quiz) throw fail(404, 'Quiz not found.');
    const { answers } = JSON.parse((await readBody(req, MAX_FORM)).toString('utf8'));
    if (!Array.isArray(answers) || answers.length !== 6) throw fail(400, 'Answer all six questions.');
    const score = quiz.questions.reduce((sum, q, i) => sum + (Number(answers[i]) === q.answer ? 1 : 0), 0);
    return json(res, 200, { score, total: 6, percent: Math.round(score / 6 * 100) });
  }
  throw fail(404, 'That page or action was not found.');
}
function staticFile(req, res, pathname) {
  let decoded; try { decoded = decodeURIComponent(pathname); } catch { return json(res, 400, { error: 'Invalid URL.' }); }
  const media = /^\/media\/([0-9a-f-]{36})$/i.exec(decoded);
  if (media) {
    const viewer = sessionUser(req);
    if (!viewer) return json(res, 401, { error: 'Please sign in to view this video.' });
    const resource = db.resources.find(item => item.id === media[1] && item.type === 'video' && item.imageKitPrivate && item.imageKitFilePath);
    if (!resource) return json(res, 404, { error: 'Video not found.' });
    if (viewer.role !== 'admin' && !(viewer.role === 'teacher' && resource.teacherId === viewer.id) && !(viewer.role === 'student' && videoIsUnlocked(viewer.id, resource))) return json(res, 403, { error: 'This video is locked. Ask the teacher to unlock it after checking your payment receipt.' });
    try { res.writeHead(302, { location: signedImageKitUrl(resource.imageKitFilePath), 'cache-control': 'private, no-store' }); return res.end(); }
    catch (error) { return json(res, error.status || 503, { error: error.message }); }
  }
  if (decoded.startsWith('/uploads/')) {
    const name = decoded.slice('/uploads/'.length);
    if (!/^[0-9a-f-]{36}\.(?:jpg|png|webp|mp4|webm|mov|pdf)$/i.test(name)) return json(res, 404, { error: 'File not found.' });
    const viewer = sessionUser(req);
    if (!viewer) return json(res, 401, { error: 'Please sign in to view this file.' });
    const assetURL = '/uploads/' + name;
    const resource = db.resources.find(item => item.url === assetURL);
    const isTeacherPhoto = db.users.some(user => user.role === 'teacher' && user.thumbnail === assetURL);
    if (!resource && !isTeacherPhoto) return json(res, 404, { error: 'File not found.' });
    if (viewer.role === 'student' && resource?.type === 'video' && !videoIsUnlocked(viewer.id, resource)) return json(res, 403, { error: 'This video is locked. Ask the teacher to unlock it after checking your payment receipt.' });
    if (viewer.role === 'teacher' && resource && resource.teacherId !== viewer.id) return json(res, 403, { error: 'You cannot view another teacher’s resource.' });
    const file = path.resolve(UPLOAD_DIR, name);
    if (!file.startsWith(UPLOAD_DIR + path.sep)) return json(res, 404, { error: 'File not found.' });
    if (!fs.existsSync(file)) return json(res, 404, { error: 'File not found.' });
    const ext = path.extname(name); const type = Object.entries(mimeExt).find(([, e]) => e === ext)?.[0] || 'application/octet-stream';
    const size = fs.statSync(file).size;
    const headers = { 'content-type': type, 'x-content-type-options': 'nosniff', 'accept-ranges': 'bytes', 'cache-control': 'private, no-store' };
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) { res.writeHead(416, { ...headers, 'content-range': `bytes */${size}` }); return res.end(); }
      let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      let end = match[2] && match[1] ? Math.min(size - 1, Number(match[2])) : match[1] ? size - 1 : size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) { res.writeHead(416, { ...headers, 'content-range': `bytes */${size}` }); return res.end(); }
      headers['content-range'] = `bytes ${start}-${end}/${size}`; headers['content-length'] = end - start + 1;
      res.writeHead(206, headers); return fs.createReadStream(file, { start, end }).pipe(res);
    }
    headers['content-length'] = size; res.writeHead(200, headers); return fs.createReadStream(file).pipe(res);
  }
  if (decoded === '/assets/catalog.js') {
    const catalog = { OL_NAMES, AL_NAMES, OL_SUBJECTS, AL_SUBJECTS, SCHOLARSHIP_NAMES, SCHOLARSHIP_SUBJECTS, EXAM_SUBJECTS };
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' });
    return res.end(`window.NERVAEDU_SUBJECTS = ${JSON.stringify(catalog)};`);
  }
  const publicFiles = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/index.html', ['index.html', 'text/html; charset=utf-8']],
    ['/assets/nervaedu-app.js', ['assets/nervaedu-app.js', 'text/javascript; charset=utf-8']],
    ['/assets/nervaedu.css', ['assets/nervaedu.css', 'text/css; charset=utf-8']],
  ]);
  const entry = publicFiles.get(decoded);
  if (!entry || !['GET', 'HEAD'].includes(req.method)) return json(res, 404, { error: 'File not found.' });
  const target = path.resolve(PUBLIC_DIR, entry[0]);
  let publicRootStat, targetStat;
  try { publicRootStat = fs.lstatSync(PUBLIC_DIR); targetStat = fs.lstatSync(target); } catch { return json(res, 404, { error: 'File not found.' }); }
  if (!publicRootStat.isDirectory() || publicRootStat.isSymbolicLink() || !target.startsWith(PUBLIC_DIR + path.sep) || !targetStat.isFile() || targetStat.isSymbolicLink()) return json(res, 404, { error: 'File not found.' });
  const headers = { 'content-type': entry[1], 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' };
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  return fs.createReadStream(target).pipe(res);
}
const server = http.createServer(async (req, res) => {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  try {
    if (isPrivateHttpPath(req.url)) return json(res, 404, { error: 'Not found.' });
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) await api(req, res, url); else staticFile(req, res, url.pathname);
  } catch (err) { if (!res.headersSent) json(res, err.status || 400, { error: err.status ? err.message : 'Something went wrong. Check your details and try again.' }); else res.destroy(); }
});
async function ensureAccountManager() {
  const phone = clean(process.env.NERVAEDU_ADMIN_PHONE, 30), password = String(process.env.NERVAEDU_ADMIN_PASSWORD || '');
  if (!phone && !password) {
    if (db.users.some(user => user.role === 'admin')) return;
    throw new Error('Set NERVAEDU_ADMIN_PHONE and NERVAEDU_ADMIN_PASSWORD (at least 8 characters) in .env to bootstrap the account manager.');
  }
  if (!phone || !validPhone(phone) || password.length < 8) throw new Error('Set a valid NERVAEDU_ADMIN_PHONE and NERVAEDU_ADMIN_PASSWORD (at least 8 characters) in .env.');
  let account = db.users.find(user => phoneKey(user.phone) === phoneKey(phone));
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
  if (account && account.role !== 'admin') {
    account.role = 'admin'; account.name = process.env.NERVAEDU_ADMIN_NAME || 'NervaEdu Account Manager';
    account.subjects = []; account.phone = phone; account.whatsapp = phone;
    account.salt = salt; account.passwordHash = passwordHash;
  } else if (account) {
    account.salt = salt; account.passwordHash = passwordHash; account.phone = phone;
  } else {
    account = { id: crypto.randomUUID(), role: 'admin', name: process.env.NERVAEDU_ADMIN_NAME || 'NervaEdu Account Manager', phone, whatsapp: phone, subjects: [], salt, passwordHash, createdAt: new Date().toISOString() };
    db.users.push(account);
  }
  await save();
}

async function start() {
  try {
    db = await persistence.loadDatabase(db);
    await ensureAccountManager();
    server.listen(PORT, HOST, () => {
      const store = persistence.enabled() ? `Cloud Firestore (${process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT})` : 'local JSON';
      console.log(`NervaEdu is running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT} using ${store} storage.`);
    });
  } catch (error) {
    console.error(`NervaEdu could not connect to its database: ${error.message}`);
    process.exitCode = 1;
  }
}
start();
