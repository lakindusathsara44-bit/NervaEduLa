// Firestore persistence for the trusted NervaEdu Node.js server.
// Client requests never receive Admin SDK credentials or direct database access.
const COLLECTIONS = {
  users: 'users',
  resources: 'resources',
  quizzes: 'quizzes',
  choices: 'studentChoices',
  accessRequests: 'videoAccessRequests',
  videoUnlocks: 'videoUnlocks',
  videoPacks: 'videoPacks',
  teacherPlanRequests: 'teacherPlanRequests',
};

let firestore;

function enabled() {
  return String(process.env.NERVAEDU_DATABASE || 'local').toLowerCase() === 'firestore';
}

function getFirestore() {
  if (firestore) return firestore;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) throw new Error('Set FIREBASE_PROJECT_ID in .env before using Firestore.');

  // Load Firebase only when Firestore mode is selected, preserving zero-config local mode.
  const { applicationDefault, getApps, initializeApp } = require('firebase-admin/app');
  const { getFirestore: createFirestore } = require('firebase-admin/firestore');
  const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId });
  firestore = createFirestore(app);
  return firestore;
}

async function readCollection(db, name) {
  const snapshot = await db.collection(name).get();
  return snapshot.docs.map(doc => doc.data());
}

async function loadDatabase(localDatabase) {
  if (!enabled()) return localDatabase;
  const db = getFirestore();
  const [users, resources, quizzes, choices, accessRequests, videoUnlocks, videoPacks, teacherPlanRequests] = await Promise.all([
    readCollection(db, COLLECTIONS.users),
    readCollection(db, COLLECTIONS.resources),
    readCollection(db, COLLECTIONS.quizzes),
    readCollection(db, COLLECTIONS.choices),
    readCollection(db, COLLECTIONS.accessRequests),
    readCollection(db, COLLECTIONS.videoUnlocks),
    readCollection(db, COLLECTIONS.videoPacks),
    readCollection(db, COLLECTIONS.teacherPlanRequests),
  ]);
  const remoteDatabase = {
    users,
    resources,
    quizzes,
    choices: Object.fromEntries(choices.map(item => [item.id, item.choices || {}])),
    accessRequests,
    videoUnlocks,
    videoPacks,
    teacherPlanRequests,
  };

  const remoteIsEmpty = !users.length && !resources.length && !quizzes.length && !choices.length && !accessRequests.length && !videoUnlocks.length && !videoPacks.length && !teacherPlanRequests.length;
  const localHasData = localDatabase.users.length || localDatabase.resources.length || localDatabase.quizzes.length || Object.keys(localDatabase.choices).length || localDatabase.accessRequests.length || localDatabase.videoUnlocks.length || localDatabase.videoPacks.length || localDatabase.teacherPlanRequests.length;
  if (remoteIsEmpty && localHasData && process.env.FIREBASE_IMPORT_LOCAL === 'true') {
    await saveDatabase(localDatabase);
    return localDatabase;
  }
  return remoteDatabase;
}

async function writeRows(db, collectionName, rows, documentId) {
  // Firestore batches are capped at 500 operations. Leave headroom for portability.
  for (let offset = 0; offset < rows.length; offset += 400) {
    const batch = db.batch();
    for (const row of rows.slice(offset, offset + 400)) {
      const id = documentId(row);
      if (!id) throw new Error(`A ${collectionName} record is missing its document ID.`);
      batch.set(db.collection(collectionName).doc(String(id)), row);
    }
    await batch.commit();
  }
}

async function saveDatabase(database) {
  if (!enabled()) return;
  const db = getFirestore();
  const choices = Object.entries(database.choices).map(([id, value]) => ({ id, choices: value }));
  await Promise.all([
    writeRows(db, COLLECTIONS.users, database.users, row => row.id),
    writeRows(db, COLLECTIONS.resources, database.resources, row => row.id),
    writeRows(db, COLLECTIONS.quizzes, database.quizzes, row => row.id),
    writeRows(db, COLLECTIONS.choices, choices, row => row.id),
    writeRows(db, COLLECTIONS.accessRequests, database.accessRequests, row => row.id),
    writeRows(db, COLLECTIONS.videoUnlocks, database.videoUnlocks, row => row.id),
    writeRows(db, COLLECTIONS.videoPacks, database.videoPacks, row => row.id),
    writeRows(db, COLLECTIONS.teacherPlanRequests, database.teacherPlanRequests, row => row.id),
  ]);
}

module.exports = { enabled, loadDatabase, saveDatabase };
