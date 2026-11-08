import test from 'node:test';
import assert from 'node:assert/strict';
import { claimOfficialVsRace } from './firestore-race-claim.mjs';

function mockDb(initial) {
  let data = initial && structuredClone(initial);
  const ref = { id: 'race1', async get() { return { exists: !!data, data: () => structuredClone(data) }; } };
  const db = {
    collection(name) { assert.equal(name, 'races'); return { doc(id) { assert.equal(id, 'race1'); return ref; } }; },
    async runTransaction(fn) {
      // Serialized mock of Firestore transaction retries; real Firestore handles conflicts.
      const tx = {
        get: () => ref.get(),
        update(_ref, update) { data = { ...data, ...update }; },
      };
      return fn(tx);
    },
    get data() { return data; },
  };
  return db;
}

test('dry-run does not change race', async () => {
  const db = mockDb({ status: 'closed', registeredCount: 2 });
  assert.equal((await claimOfficialVsRace(db, 'race1')).outcome, 'would-claim');
  assert.equal(db.data.status, 'closed');
});
test('one worker claims, another cannot claim again', async () => {
  const db = mockDb({ status: 'closed', registeredCount: 1 });
  const a = await claimOfficialVsRace(db, 'race1', { apply: true, workerId: 'workerA' });
  const b = await claimOfficialVsRace(db, 'race1', { apply: true, workerId: 'workerB' });
  assert.equal(a.outcome, 'claimed');
  assert.equal(b.outcome, 'not-eligible');
  assert.equal(db.data.runClaim.workerId, 'workerA');
  assert.equal(db.data.status, 'running');
});
test('cannot claim empty race', async () => {
  const db = mockDb({ status: 'closed', registeredCount: 0 });
  assert.equal((await claimOfficialVsRace(db, 'race1', { apply: true })).outcome, 'invalid-count');
});
test('cannot claim already-claimed race', async () => {
  const db = mockDb({ status: 'closed', registeredCount: 1, runClaim: { workerId: 'other' } });
  assert.equal((await claimOfficialVsRace(db, 'race1', { apply: true })).outcome, 'already-claimed');
});
test('cannot claim finished race', async () => {
  const db = mockDb({ status: 'finished', registeredCount: 1 });
  assert.equal((await claimOfficialVsRace(db, 'race1', { apply: true })).outcome, 'not-eligible');
});
test('rejects invalid identifiers', async () => {
  const db = mockDb({ status: 'closed', registeredCount: 1 });
  await assert.rejects(claimOfficialVsRace(db, '../bad'), /レースID/);
  await assert.rejects(claimOfficialVsRace(db, 'race1', { workerId: 'bad space' }), /ワーカーID/);
});
test('rejects missing race', async () => {
  const db = mockDb(null);
  assert.equal((await claimOfficialVsRace(db, 'race1', { apply: true })).outcome, 'missing');
});
