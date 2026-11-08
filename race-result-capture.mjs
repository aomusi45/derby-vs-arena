// Read-only bridge: extracts the completed Ver.92 result board.
// This module does not run a race, modify the engine, or write to Firebase.
function textOf(node) { return String(node?.textContent ?? '').trim(); }

export function captureOfficialVsResult({raceId, engineWindow, expectedCount}) {
  if (!raceId || typeof raceId !== 'string') throw Error('レースIDがありません');
  if (!Number.isInteger(expectedCount) || expectedCount < 1 || expectedCount > 18)
    throw Error('出走頭数が不正です');
  const doc = engineWindow?.document;
  const status = engineWindow?.DFV30SharedRace?.getStatus?.();
  if (!doc || !status) throw Error('VSレース画面がありません');
  if (!status.active || status.race !== 'finished') return null;
  if (doc.body?.dataset?.gameScreen !== 'results') return null;
  const board = doc.getElementById('resultrows');
  if (!board) throw Error('Ver.92の結果欄がありません');
  const rows = [...board.querySelectorAll('.result-line')];
  if (rows.length !== expectedCount) return null; // Don't publish partial/incomplete boards.
  const results = rows.map((row, index) => {
    const rankText = textOf(row.querySelector('.result-rank'));
    const rank = Number(rankText.replace(/着$/, ''));
    const number = Number(textOf(row.querySelector('.result-bib')));
    const nameNode = row.querySelector('.df28-result-name');
    const name = textOf(nameNode?.childNodes?.[0]) || textOf(nameNode).replace(/単勝\s*\d+番人気/, '').trim();
    const detail = textOf(row.querySelector('.result-detail'));
    if (rank !== index + 1 || !Number.isInteger(number) || number < 1 || !name || !detail)
      throw Error('結果欄のデータが不完全です');
    return {rank, number, name, ...(index === 0 ? {winningTime: detail} : {marginBehindPrevious: detail})};
  });
  if (new Set(results.map(x => x.number)).size !== expectedCount) throw Error('馬番が重複しています');
  return {raceId, source:'DBF-Ver92-result-board', count:expectedCount, results};
}

export function watchOfficialVsResult({raceId, engineWindow, expectedCount, onComplete, onError = () => {}, intervalMs = 500}) {
  if (typeof onComplete !== 'function') throw Error('結果通知先がありません');
  const timerHost = engineWindow;
  if (typeof timerHost?.setInterval !== 'function' || typeof timerHost?.clearInterval !== 'function')
    throw Error('ブラウザの監視機能がありません');
  let stopped = false;
  let timer;
  const stop = () => { stopped = true; if (timer !== undefined) timerHost.clearInterval(timer); };
  const check = () => {
    if (stopped) return;
    try {
      const result = captureOfficialVsResult({raceId, engineWindow, expectedCount});
      if (result) { stop(); onComplete(result); }
    } catch (error) { stop(); onError(error); }
  };
  timer = timerHost.setInterval(check, intervalMs);
  check();
  return {stop, check};
}
