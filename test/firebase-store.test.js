'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { commitDatabase } = require('../firebase-store');

const STATE_COLLECTION = '_nervaedu_system';
const STATE_DOCUMENT = 'databaseState';

function createFakeFirestore(seed = {}) {
  const collections = new Map(Object.entries(seed).map(([name, rows]) => [
    name,
    new Map(rows.map(row => [row.id, structuredClone(row)])),
  ]));
  const getCollection = name => {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  };
  return {
    collections,
    collection(name) {
      return {
        collectionName: name,
        doc(id) { return { collectionName: name, id: String(id) }; },
      };
    },
    async runTransaction(callback) {
      const operations = [];
      const transaction = {
        async get(target) {
          if (target.id !== undefined) {
            const row = getCollection(target.collectionName).get(target.id);
            return { exists: Boolean(row), data: () => structuredClone(row) };
          }
          const rows = [...getCollection(target.collectionName).entries()];
          return {
            docs: rows.map(([id, row]) => ({
              id,
              ref: { collectionName: target.collectionName, id },
              data: () => structuredClone(row),
            })),
          };
        },
        set(ref, row) { operations.push(() => getCollection(ref.collectionName).set(ref.id, structuredClone(row))); },
        delete(ref) { operations.push(() => getCollection(ref.collectionName).delete(ref.id)); },
      };
      const result = await callback(transaction);
      operations.forEach(apply => apply());
      return result;
    },
  };
}

function emptyDatabase(overrides = {}) {
  return {
    users: [],
    resources: [],
    quizzes: [],
    choices: {},
    accessRequests: [],
    videoUnlocks: [],
    videoPacks: [],
    teacherPlanRequests: [],
    ...overrides,
  };
}

function revisionOf(db) {
  return db.collections.get(STATE_COLLECTION)?.get(STATE_DOCUMENT)?.revision;
}

test('commitDatabase atomically replaces the snapshot and advances its revision', async () => {
  const db = createFakeFirestore({
    resources: [
      { id: 'keep', title: 'Old title' },
      { id: 'stale', title: 'Must be deleted' },
    ],
    [STATE_COLLECTION]: [{ id: STATE_DOCUMENT, revision: 0 }],
  });

  const nextRevision = await commitDatabase(db, emptyDatabase({
    users: [{ id: 'user-1', role: 'student' }],
    resources: [{ id: 'keep', title: 'Updated title' }],
    choices: { 'user-1': { subject: 'Math' } },
  }), 0);

  assert.equal(nextRevision, 1);
  assert.equal(revisionOf(db), 1);
  assert.deepEqual([...db.collections.get('resources').entries()], [
    ['keep', { id: 'keep', title: 'Updated title' }],
  ]);
  assert.deepEqual(db.collections.get('users').get('user-1'), { id: 'user-1', role: 'student' });
  assert.deepEqual(db.collections.get('studentChoices').get('user-1'), { id: 'user-1', choices: { subject: 'Math' } });
});

test('a stale instance is rejected without overwriting newer Firestore data', async () => {
  const db = createFakeFirestore({
    resources: [{ id: 'existing', title: 'Original' }],
    [STATE_COLLECTION]: [{ id: STATE_DOCUMENT, revision: 0 }],
  });

  await commitDatabase(db, emptyDatabase({
    resources: [{ id: 'existing', title: 'Writer A update' }, { id: 'new-a', title: 'Writer A insert' }],
  }), 0);

  await assert.rejects(
    commitDatabase(db, emptyDatabase({
      resources: [{ id: 'existing', title: 'Stale writer B update' }],
    }), 0),
    error => error.code === 'NERVAEDU_FIRESTORE_REVISION_CONFLICT' && error.status === 503,
  );

  assert.equal(revisionOf(db), 1);
  assert.deepEqual([...db.collections.get('resources').entries()], [
    ['existing', { id: 'existing', title: 'Writer A update' }],
    ['new-a', { id: 'new-a', title: 'Writer A insert' }],
  ]);
});

test('duplicate document IDs are rejected before any Firestore writes', async () => {
  const db = createFakeFirestore({
    resources: [{ id: 'keep', title: 'Existing' }],
    [STATE_COLLECTION]: [{ id: STATE_DOCUMENT, revision: 0 }],
  });

  await assert.rejects(
    commitDatabase(db, emptyDatabase({
      resources: [{ id: 'duplicate', title: 'First' }, { id: 'duplicate', title: 'Second' }],
    }), 0),
    /Duplicate document ID/,
  );

  assert.equal(revisionOf(db), 0);
  assert.deepEqual([...db.collections.get('resources').entries()], [
    ['keep', { id: 'keep', title: 'Existing' }],
  ]);
});

test('snapshots exceeding the safe Firestore transaction write limit fail closed', async () => {
  const db = createFakeFirestore({
    [STATE_COLLECTION]: [{ id: STATE_DOCUMENT, revision: 0 }],
  });
  const resources = Array.from({ length: 450 }, (_, index) => ({ id: `resource-${index}` }));

  await assert.rejects(
    commitDatabase(db, emptyDatabase({ resources }), 0),
    /safe transaction limit is 450/,
  );

  assert.equal(revisionOf(db), 0);
  assert.equal(db.collections.get('resources'), undefined);
});

test('records without document IDs are rejected before any Firestore writes', async () => {
  const db = createFakeFirestore({
    resources: [{ id: 'keep', title: 'Existing' }],
    [STATE_COLLECTION]: [{ id: STATE_DOCUMENT, revision: 0 }],
  });

  await assert.rejects(
    commitDatabase(db, emptyDatabase({ resources: [{ title: 'Missing ID' }] }), 0),
    /resources record is missing its document ID/,
  );

  assert.equal(revisionOf(db), 0);
  assert.deepEqual([...db.collections.get('resources').entries()], [
    ['keep', { id: 'keep', title: 'Existing' }],
  ]);
});
