// Trusted-admin-only result persistence. No browser credentials or public client writes.
// Saves the Ver.92 result board once, atomically with race status transition.
export function validateRaceResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error('結果データがありません');
  if (typeof result.raceId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(result.raceId)) throw Error('レースIDが不正です');
  if (result.source !== 'DBF-Ver92-result-board') throw Error('Ver.92の結果ではありません');
  if (!Number.isInteger(result.count) || result.count < 1 || result.count > 18 || !Array.isArray(result.results) || result.results.length !== result.count) throw Error('着順件数が不正です');
  const numbers = new Set();
  const rows = result.results.map((r, i) => {
    if (!r || r.rank !== i + 1 || !Number.isInteger(r.number) || r.number < 1 || r.number > 18 || numbers.has(r.number)) throw Error('着順・馬番が不正です');
    numbers.add(r.number);
    if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 40) throw Error('馬名が不正です');
    const detailKey = i === 0 ? 'winningTime' : 'marginBehindPrevious';
    if (typeof r[detailKey] !== 'string' || !r[detailKey].trim() || r[detailKey].length > 100) throw Error('時計・着差が不正です');
    if (r.snapshotId !== undefined && (typeof r.snapshotId !== 'string' || !r.snapshotId.trim() || r.snapshotId.length > 160)) throw Error('登録馬識別子が不正です');
    return {rank:r.rank,number:r.number,name:r.name,...(r.snapshotId === undefined ? {} : {snapshotId:r.snapshotId}),[detailKey]:r[detailKey]};
  });
  return {raceId:result.raceId,source:result.source,count:result.count,results:rows};
}

export async function saveOfficialVsResult(db, result, {apply=false, completedAt=null, workerId=null}={}) {
  const clean=validateRaceResult(result);
  if (!db || typeof db.collection !== 'function' || typeof db.runTransaction !== 'function') throw Error('Firestore管理者接続が必要です');
  const raceRef=db.collection('races').doc(clean.raceId);
  // Admin job must explicitly opt into writes; no timestamp is written on a dry run.
  if (!apply) return {raceId:clean.raceId,outcome:'would-save',count:clean.count};
  if (!completedAt) throw Error('管理者側の完了時刻が必要です');
  if (workerId !== null && (typeof workerId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(workerId))) throw Error('実行者IDが不正です');
  return db.runTransaction(async tx=>{
    const raceSnap=await tx.get(raceRef);
    if (!raceSnap.exists) throw Error('対象レースが存在しません');
    const race=raceSnap.data();
    if (race.status === 'finished' || race.status === 'completed' || race.result || race.resultSavedAt) return {raceId:clean.raceId,outcome:'already-finished'};
    if (race.status !== 'running') throw Error('レースが走行中ではありません');
    if (workerId !== null && race.runClaim?.workerId !== workerId) throw Error('発走権を取得した実行者と一致しません');
    if (!Number.isInteger(race.registeredCount) || race.registeredCount !== clean.count) throw Error('出走頭数が一致しません');
    // Keep results under the same race document so status and results are atomic.
    tx.update(raceRef,{status:'finished',result:clean,resultSavedAt:completedAt,finishedAt:completedAt});
    return {raceId:clean.raceId,outcome:'saved',count:clean.count};
  });
}
