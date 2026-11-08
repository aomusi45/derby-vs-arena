// Official VS scheduler preflight. Pure functions; never writes to Firestore.
import { prepareOfficialField } from './vs-field-adapter.mjs';

export function toMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value.seconds === 'number') return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }
  return NaN;
}

export function evaluateRace(race, nowMs = Date.now()) {
  if (!race || typeof race !== 'object' || !race.id) throw Error('レースIDがありません');
  const startMs = toMillis(race.scheduledAt);
  if (!Number.isFinite(startMs)) return {raceId: race.id, action: 'invalid', reason: '開催時刻が不正'};
  if (race.status !== 'open') return {raceId: race.id, action: 'none', reason: '受付中ではない'};
  if (nowMs < startMs - 60000) return {raceId: race.id, action: 'none', reason: '受付中'};
  return {raceId: race.id, action: 'close', reason: nowMs >= startMs ? '開催時刻到達' : '開始1分前の締切'};
}

export function prepareRaceForExecution(race, entries, opts = {}) {
  if (!race || race.status !== 'closed') throw Error('受付終了済みレースのみ準備できます');
  if (!Array.isArray(entries)) throw Error('出走馬一覧がありません');
  if (!Number.isInteger(race.registeredCount) || race.registeredCount !== entries.length)
    throw Error('登録頭数と実データ件数が一致しません');
  const seenUsers = new Set();
  for (const entry of entries) {
    if (!entry.uid || seenUsers.has(entry.uid)) throw Error('登録ユーザーが重複または不明です');
    seenUsers.add(entry.uid);
  }
  const sorted = [...entries].sort((a,b) => String(a.uid).localeCompare(String(b.uid)));
  const prepared = prepareOfficialField(sorted, opts);
  return {raceId:race.id, ...prepared, sourceUids:sorted.map(e=>e.uid)};
}
