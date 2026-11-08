'use strict';
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();
const STAT_KEYS = ['sp','sta','kick','early','sustain','grit','stability'];
const bad = message => { throw new HttpsError('invalid-argument',message); };
function validateEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) bad('JSON形式が不正です。');
  if (JSON.stringify(entry).length > 150000) bad('登録データが大きすぎます。');
  for (const k of ['snapshotId','sourceHorseId']) if (typeof entry[k] !== 'string' && typeof entry[k] !== 'number') bad('登録馬IDが不正です。');
  if (!entry.horse || typeof entry.horse !== 'object' || !entry.raceContext || !entry.raceStats) bad('VS登録馬データが不足しています。');
  for (const k of STAT_KEYS) {
    const n=entry.raceStats[k]?.total;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 10000) bad('能力データが不正です。');
  }
  return entry;
}
exports.registerHorse = onCall({region:'asia-northeast1',maxInstances:10, enforceAppCheck:true}, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated','ログインが必要です。');
  const entry=validateEntry(request.data?.entry);
  const now=Date.now();
  // Race start times: every five minutes, JST aligned (UTC also has five-minute boundaries).
  // Registration closes one minute before start. If the current slot is closed, use the next slot.
  let start=Math.ceil((now+60000)/300000)*300000;
  if (start-now <= 60000) start+=300000;
  const raceId=new Date(start).toISOString().replace(/[-:.]/g,'').slice(0,13)+'Z';
  const raceRef=db.collection('races').doc(raceId);
  const registrationRef=raceRef.collection('entries').doc(request.auth.uid);
  const countRef=raceRef.collection('meta').doc('counter');
  await db.runTransaction(async tx => {
    const [race, counter, existing]=await Promise.all([tx.get(raceRef),tx.get(countRef),tx.get(registrationRef)]);
    if (Date.now() >= start-60000) throw new HttpsError('failed-precondition','このレースの受付は終了しました。');
    if (existing.exists) throw new HttpsError('already-exists','このレースにはすでに登録済みです。');
    const n=counter.exists ? Number(counter.data().count||0) : 0;
    if (n>=18) throw new HttpsError('resource-exhausted','定員18頭に達しました。');
    if (race.exists && !['open','waiting'].includes(race.data().status)) throw new HttpsError('failed-precondition','受付中のレースではありません。');
    if (!race.exists) tx.create(raceRef,{status:'open',scheduledAt:admin.firestore.Timestamp.fromMillis(start),createdAt:admin.firestore.FieldValue.serverTimestamp()});
    tx.set(registrationRef,{uid:request.auth.uid,entry,registeredAt:admin.firestore.FieldValue.serverTimestamp()});
    tx.set(countRef,{count:n+1},{merge:true});
  });
  return {raceId,scheduledAt:new Date(start).toISOString()};
});
