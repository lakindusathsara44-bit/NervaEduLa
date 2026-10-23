'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { writeRows } = require('../firebase-store');

function createFakeFirestore(initialRows) {
  const records = new Map(initialRows.map(row => [row.id, { ...row }]));
  return {
    records,
    collection() {
      return {
        async get() {
          return { docs: [...records.keys()].map(id => ({ id })) };
        },
        doc(id) {
          return { id: String(id) };
        },
      };
    },
    batch() {
      const operations = [];
      return {
        set(ref, row) { operations.push(() => records.set(ref.id, { ...row })); },
        delete(ref) { operations.push(() => records.delete(ref.id)); },
        async commit() { operations.forEach(apply => apply()); },
      };
    },
  };
}

test('writeRows removes Firestore documents absent from the saved database', async () => {
  const db = createFakeFirestore([
    { id: 'keep', title: 'Existing title' },
    { id: 'deleted', title: 'Removed in app' },
  ]);

  await writeRows(db, 'resources', [{ id: 'keep', title: 'Updated title' }], row => row.id);

  assert.deepEqual([...db.records.entries()], [
    ['keep', { id: 'keep', title: 'Updated title' }],
  ]);
});
