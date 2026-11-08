// Pure, deterministic planning for a weekly championship tie-break.
// Never simulates a race or writes to Firestore.
const MINUTE=60_000;
export function planChampionshipDecider({weekKey, entrants, sundayArimaFinishedAt, maxField=18}={}) {
  if (!/^\d{8}$/.test(weekKey||'')) throw Error('大会週キーが不正です');
  if (!Array.isArray(entrants)||entrants.length<2||entrants.some(x=>typeof x!=='string'||!x.trim()||x.length>160)||new Set(entrants).size!==entrants.length) throw Error('決定戦の出走馬が不正です');
  if (!Number.isInteger(maxField)||maxField<2||maxField>18) throw Error('出走上限が不正です');
  const end=new Date(sundayArimaFinishedAt);
  if (!Number.isFinite(end.getTime())) throw Error('有馬記念の終了日時が不正です');
  const sorted=[...entrants].sort();
  const start=new Date(end.getTime()+30*MINUTE);
  const groups=[];
  const groupCount=Math.ceil(sorted.length/maxField);
  const baseSize=Math.floor(sorted.length/groupCount);
  const extra=sorted.length%groupCount;
  let offset=0;
  for(let g=0;g<groupCount;g++){
    const groupNo=g+1;
    const size=baseSize+(g<extra?1:0);
    groups.push({id:`official_${weekKey}_decider_heat_${groupNo}`,raceName:'年度代表馬決定戦',venue:'東京',surface:'芝',distance:2400,going:'良',scheduledAt:new Date(start.getTime()+(groupNo-1)*5*MINUTE),entrantSnapshotIds:sorted.slice(offset,offset+size),status:'planned'});
    offset+=size;
  }
  // If multiple heats are needed, actual finishing times determine when a final can start.
  // No speculative finalist selection or invented finishing times.
  return {weekKey,requiresHeats:groups.length>1,heats:groups,finalNeedsScheduling:groups.length>1};
}
export function resolveDeciderWinner(results, expectedEntrants) {
  if (!Array.isArray(expectedEntrants)||expectedEntrants.length<2||new Set(expectedEntrants).size!==expectedEntrants.length) throw Error('決定戦の登録馬が不正です');
  if (!Array.isArray(results)||results.length!==expectedEntrants.length) throw Error('決定戦結果が未確定です');
  const expected=new Set(expectedEntrants),seen=new Set();
  for (let i=0;i<results.length;i++) {
    const row=results[i];
    if (!row||row.rank!==i+1||!expected.has(row.snapshotId)||seen.has(row.snapshotId)) throw Error('決定戦結果が不正です');
    seen.add(row.snapshotId);
  }
  return results[0].snapshotId;
}
