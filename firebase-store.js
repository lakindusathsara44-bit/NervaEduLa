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
const STATE_COLLECTION = '_nervaedu_system';
const STATE_DOCUMENT = 'databaseState';
// Firestore transactions are limited to 500 writes. Keep a safety margin.
const MAX_TRANSACTION_WRITES = 450;

let firestore;
let loadedRevision = null;

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

function stateReference(db) {
  return db.collection(STATE_COLLECTION).doc(STATE_DOCUMENT);
}

function revisionFrom(snapshot) {
  if (!snapshot.exists) return 0;
  const revision = snapshot.data()?.revision;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('Firestore NervaEdu database revision metadata is invalid. Stop writes and investigate before continuing.');
  }
  return revision;
}

async function ensureStateDocument(db) {
  const ref = stateReference(db);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      transaction.create(ref, { revision: 0, createdAt: new Date().toISOString() });
    }
  });
}

async function readCollection(db, name) {
  const snapshot = await db.collection(name).get();
  return snapshot.docs.map(doc => doc.data());
}

async function loadDatabase(localDatabase) {
  if (!enabled()) return localDatabase;
  const db = getFirestore();
  await ensureStateDocument(db);
  const stateSnapshot = await stateReference(db).get();
  loadedRevision = revisionFrom(stateSnapshot);

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

function prepareRows(database) {
  return [
    { name: COLLECTIONS.users, rows: database.users, id: row => row.id },
    { name: COLLECTIONS.resources, rows: database.resources, id: row => row.id },
    { name: COLLECTIONS.quizzes, rows: database.quizzes, id: row => row.id },
    { name: COLLECTIONS.choices, rows: Object.entries(database.choices).map(([id, choices]) => ({ id, choices })), id: row => row.id },
    { name: COLLECTIONS.accessRequests, rows: database.accessRequests, id: row => row.id },
    { name: COLLECTIONS.videoUnlocks, rows: database.videoUnlocks, id: row => row.id },
    { name: COLLECTIONS.videoPacks, rows: database.videoPacks, id: row => row.id },
    { name: COLLECTIONS.teacherPlanRequests, rows: database.teacherPlanRequests, id: row => row.id },
  ].map(group => {
    const seen = new Set();
    const rows = group.rows.map(row => {
      const id = group.id(row);
      if (id === undefined || id === null || String(id).length === 0) {
        throw new Error(`A ${group.name} record is missing its document ID.`);
      }
      const key = String(id);
      if (seen.has(key)) throw new Error(`Duplicate document ID "${key}" in ${group.name}; no data was written.`);
      seen.add(key);
      return { id: key, row };
    });
    return { name: group.name, rows, ids: seen };
  });
}

function firestoreConflict(expected, actual) {
  const error = new Error('This NervaEdu instance has stale Firestore data. No changes were written. Restart or refresh this service instance before retrying.');
  error.status = 503;
  error.code = 'NERVAEDU_FIRESTORE_REVISION_CONFLICT';
  error.expectedRevision = expected;
  error.actualRevision = actual;
  return error;
}

// Commit the complete in-memory snapshot atomically. A revision document serializes
// writers across instances; stale instances fail closed instead of deleting newer data.
async function commitDatabase(db, database, expectedRevision) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error('Firestore database must be loaded before it can be saved.');
  }
  const groups = prepareRows(database);
  const stateRef = stateReference(db);

  return db.runTransaction(async transaction => {
    const stateSnapshot = await transaction.get(stateRef);
    const actualRevision = revisionFrom(stateSnapshot);
    if (actualRevision !== expectedRevision) throw firestoreConflict(expectedRevision, actualRevision);

    // Complete every transaction read before issuing any writes.
    const snapshots = await Promise.all(groups.map(async group => ({
      group,
      snapshot: await transaction.get(db.collection(group.name)),
    })));

    let writeCount = 1; // revision metadata document
    for (const { group, snapshot } of snapshots) {
      const staleCount = snapshot.docs.filter(doc => !group.ids.has(doc.id)).length;
      writeCount += staleCount + group.rows.length;
    }
    if (writeCount > MAX_TRANSACTION_WRITES) {
      throw new Error(`Firestore snapshot requires ${writeCount} writes; the safe transaction limit is ${MAX_TRANSACTION_WRITES}. Migrate to per-record persistence before growing this dataset.`);
    }

    for (const { group, snapshot } of snapshots) {
      for (const doc of snapshot.docs) {
        if (!group.ids.has(doc.id)) transaction.delete(doc.ref);
      }
      const collection = db.collection(group.name);
      for (const item of group.rows) transaction.set(collection.doc(item.id), item.row);
    }

    const nextRevision = expectedRevision + 1;
    transaction.set(stateRef, { revision: nextRevision, updatedAt: new Date().toISOString() });
    return nextRevision;
  });
}

async function saveDatabase(database) {
  if (!enabled()) return;
  if (loadedRevision === null) throw new Error('Firestore database must be loaded before it can be saved.');
  const nextRevision = await commitDatabase(getFirestore(), database, loadedRevision);
  loadedRevision = nextRevision;
}

module.exports = { enabled, loadDatabase, saveDatabase, commitDatabase };
