// Orchestrates the already-existing Ver.92 bridges. No race physics and no Firebase credentials.
import { launchOfficialVsRace } from './browser-race-launcher.mjs';
import { watchOfficialVsResult } from './race-result-capture.mjs';
import { saveOfficialVsResult } from './firestore-result-save.mjs';

// The trusted server must first atomically claim a closed race and mark it running.
// This module intentionally does NOT implement that server-side claim.
export function coordinateOfficialVsRace({
  race, entries, engineWindow, db, apply = false, completedAt,
  distance = 2400, going = '良',
  launch = launchOfficialVsRace,
  watch = watchOfficialVsResult,
  save = saveOfficialVsResult,
  onEvent = () => {},
} = {}) {
  if (!race || race.status !== 'closed') throw Error('受付終了したレースのみ発走できます');
  if (!db) throw Error('管理者Firestore接続がありません');
  if (apply && typeof completedAt !== 'function') throw Error('保存時刻の取得関数がありません');
  if (!Array.isArray(entries) || entries.length !== race.registeredCount || entries.length < 1 || entries.length > 18)
    throw Error('登録頭数が不正です');

  // Launch before subscribing: the existing engine starts asynchronously.
  const started = launch({race, entries, engineWindow, distance, going});
  if (!started?.launchRequested || started.raceId !== race.id || started.count !== entries.length)
    throw Error('発走要求の確認に失敗しました');

  let state = 'watching';
  let settled = false;
  let stopWatch = () => {};
  let cancelReject;
  const completion = new Promise((resolve, reject) => {
    cancelReject = reject;
    const succeed = value => { if (settled) return; settled = true; state = 'done'; resolve(value); };
    const fail = error => { if (settled) return; settled = true; state = 'failed'; reject(error); };
    try {
      const handle = watch({
        raceId: race.id, engineWindow, expectedCount: entries.length,
        onComplete: async result => {
          if (settled) return;
          state = 'saving';
          try {
            onEvent({type:'result-captured',raceId:race.id});
            const saved = await save(db, result, {
              apply, completedAt: apply ? completedAt() : null,
            });
            onEvent({type:'save-complete',raceId:race.id,outcome:saved.outcome});
            succeed({result, saved});
          } catch (error) { fail(error); }
        },
        onError: fail,
      });
      stopWatch = () => handle?.stop?.();
      if (settled) stopWatch();
    } catch (error) { fail(error); }
  });
  return {
    started,
    completion,
    get state() { return state; },
    stop() {
      if (settled) return;
      stopWatch();
      settled = true;
      state = 'cancelled';
      // Cancellation does not stop the Ver.92 engine; only the result observer.
      // No fake success: reject the outstanding promise.
      // (Handled by the deferred reject below.)
      cancelReject?.(Error('結果監視を中止しました'));
    },
  };
}
