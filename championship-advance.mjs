// Deterministic championship advancement: confirmed heats -> final -> winner.
// No Firestore writes, fabricated results, or substitute race engine.
import {resolveDeciderWinner} from './championship-decider.mjs';
const MINUTE=60_000;
function dateValue(value){
  if(value===undefined||value===null||value==='') throw Error('終了日時が必要です');
  const ms=new Date(value).getTime();
  if(!Number.isFinite(ms))throw Error('終了日時が不正です');
  return ms;
}
export function planDeciderFinal({weekKey,heats,completedHeats,delayMinutes=5}={}){
  if(!/^\d{8}$/.test(weekKey||''))throw Error('大会週キーが不正です');
  if(!Array.isArray(heats)||heats.length<2)throw Error('複数の予選が必要です');
  if(!Array.isArray(completedHeats)||completedHeats.length!==heats.length)throw Error('予選がすべて終了していません');
  if(!Number.isInteger(delayMinutes)||delayMinutes<1||delayMinutes>120)throw Error('決勝までの間隔が不正です');
  const completed=new Map();
  for(const c of completedHeats){
    if(!c||typeof c.id!=='string'||completed.has(c.id))throw Error('予選結果が重複または不正です');
    completed.set(c.id,c);
  }
  const winners=[];let lastFinish=-Infinity;
  for(const heat of heats){
    if(!heat||typeof heat.id!=='string'||!Array.isArray(heat.entrantSnapshotIds))throw Error('予選データが不正です');
    const c=completed.get(heat.id);
    if(!c||c.status!=='finished'||!Array.isArray(c.results))throw Error('予選がすべて終了していません');
    const winner=resolveDeciderWinner(c.results,heat.entrantSnapshotIds);
    winners.push(winner);
    const finished=dateValue(c.finishedAt);
    if(heat.scheduledAt!==undefined&&finished<dateValue(heat.scheduledAt))throw Error('予選終了日時が開始前です');
    lastFinish=Math.max(lastFinish,finished);
  }
  if(new Set(winners).size!==winners.length)throw Error('予選勝者が重複しています');
  return {id:`official_${weekKey}_decider_final`,weekKey,raceName:'年度代表馬決定戦・決勝',venue:'東京',surface:'芝',distance:2400,going:'良',scheduledAt:new Date(lastFinish+delayMinutes*MINUTE),entrantSnapshotIds:winners,status:'planned',sourceHeatIds:heats.map(h=>h.id)};
}
export function resolveChampionshipFinal(finalPlan,completedFinal){
  if(!finalPlan||!completedFinal||completedFinal.id!==finalPlan.id||completedFinal.status!=='finished')throw Error('決勝が未確定です');
  if(!Array.isArray(finalPlan.entrantSnapshotIds)||!Array.isArray(completedFinal.results))throw Error('決勝データが不正です');
  dateValue(completedFinal.finishedAt);
  return {weekKey:finalPlan.weekKey,championSnapshotId:resolveDeciderWinner(completedFinal.results,finalPlan.entrantSnapshotIds),finalRaceId:finalPlan.id};
}
