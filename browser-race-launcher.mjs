// Browser-side launch bridge for the unmodified Ver.92 3D race.
// Must run in the SAME window as engine_source.html (not a cross-origin iframe).
import { prepareRaceForExecution } from './race-scheduler.mjs';
import { sendToExistingEngine } from './vs-field-adapter.mjs';

export function launchOfficialVsRace({race, entries, engineWindow, distance=2400, going='良'}) {
  if (!engineWindow?.document) throw Error('3Dエンジンのブラウザ画面がありません');
  const state = engineWindow.DFV30SharedRace?.getStatus?.();
  if (!state || state.active || state.race !== 'idle') throw Error('VSエンジンが未準備または使用中です');
  if (engineWindow.__raceReady3D !== true) throw Error('3D描画の準備ができていません');
  const startButton = engineWindow.document.getElementById('newspaperRaceStart');
  if (!startButton) throw Error('新聞画面のレース開始ボタンがありません');
  const prepared = prepareRaceForExecution(race, entries, {distance, going});
  const response = sendToExistingEngine(engineWindow, prepared);
  if (!response?.ok) throw Error(response?.error || 'VS出走馬の準備に失敗しました');
  if (engineWindow.document.body?.dataset?.gameScreen !== 'newspaper' || startButton.disabled) {
    throw Error('新聞画面が発走可能な状態ではありません');
  }
  // Existing Ver.92 event handler performs its own validations, persistence,
  // gate intro, animation, and race simulation. Do not duplicate race logic.
  startButton.click();
  return {raceId:prepared.raceId, count:prepared.field.length, launchRequested:true,
    engineState:engineWindow.DFV30SharedRace.getStatus()};
}
