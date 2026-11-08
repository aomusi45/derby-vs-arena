// Trusted-admin-only race claim. Never expose credentials or claim tokens to browsers.
// The claim is a single Firestore transaction: only one worker can transition closed -> running.
import { randomUUID } from 'node:crypto';

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export async function claimOfficialVsRace(db, raceId, {
  apply = false,
  workerId = randomUUID(),
  claimedAt = new Date(),
} = {}) {
  if (!db || typeof db.collection !== 'function' || typeof db.runTransaction !== 'function')
    throw Error('Firestore管理者接続が必要です');
  if (typeof raceId !== 'string' || !ID_RE.test(raceId)) throw Error('レースIDが不正です');
  if (typeof workerId !== 'string' || !ID_RE.test(workerId)) throw Error('ワーカーIDが不正です');
  if (!(claimedAt instanceof Date) || !Number.isFinite(claimedAt.getTime())) throw Error('開始時刻が不正です');

  const ref = db.collection('races').doc(raceId);
  if (!apply) {
    const snap = await ref.get();
    if (!snap.exists) return { raceId, outcome: 'missing' };
    const data = snap.data();
    return { raceId, outcome: data.status === 'closed' && Number.isInteger(data.registeredCount) && data.registeredCount > 0 && data.registeredCount <= 18
      ? 'would-claim' : 'not-eligible' };
  }

  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { raceId, outcome: 'missing' };
    const race = snap.data();
    if (race.status !== 'closed') return { raceId, outcome: 'not-eligible', status: race.status };
    if (!Number.isInteger(race.registeredCount) || race.registeredCount < 1 || race.registeredCount > 18)
      return { raceId, outcome: 'invalid-count' };
    if (race.runClaim || race.result || race.resultSavedAt) return { raceId, outcome: 'already-claimed' };
    tx.update(ref, {
      status: 'running',
      runClaim: { workerId, claimedAt },
      startedAt: claimedAt,
    });
    return { raceId, outcome: 'claimed', workerId };
  });
}
