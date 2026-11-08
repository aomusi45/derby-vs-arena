// Pure weekly championship tally. No Firestore writes or synthetic race results.
// Award schedule must be supplied from the official published prize table.
const RANK_KEYS = ['wins','seconds','thirds','fourths','fifths'];
export function tallyWeeklyChampionship(races, {prizes} = {}) {
  if (!Array.isArray(races)) throw Error('レース一覧が不正です');
  if (!Array.isArray(prizes) || prizes.length !== 5 || prizes.some(x => !Number.isSafeInteger(x) || x < 0)) throw Error('公式賞金表（1〜5着）が必要です');
  const horses = new Map();
  const seenRaces = new Set();
  for (const race of races) {
    if (!race || typeof race.id !== 'string' || !race.id || seenRaces.has(race.id)) throw Error('レースIDが不正または重複しています');
    seenRaces.add(race.id);
    if (race.status !== 'finished' || !race.result || !Array.isArray(race.result.results)) throw Error('未確定のレースを集計できません');
    const rows = race.result.results;
    const numbers = new Set();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.rank !== i+1 || !Number.isInteger(r.number) || numbers.has(r.number)) throw Error('着順または馬番が不正です');
      numbers.add(r.number);
      // Use immutable registration identity, not horse name (names can collide).
      const id = r.snapshotId;
      if (typeof id !== 'string' || !id.trim() || id.length > 160) throw Error('出走馬のsnapshotIdが必要です');
      if (typeof r.name !== 'string' || !r.name.trim()) throw Error('馬名が不正です');
      if (!horses.has(id)) horses.set(id,{snapshotId:id,name:r.name,prizeMoney:0,wins:0,seconds:0,thirds:0,fourths:0,fifths:0,starts:0});
      const horse=horses.get(id);
      if (horse.name !== r.name) throw Error('同一snapshotIdの馬名が一致しません');
      horse.starts++;
      if (i < 5) {
        horse.prizeMoney += prizes[i];
        if (!Number.isSafeInteger(horse.prizeMoney)) throw Error('賞金の合計が上限を超えました');
        horse[RANK_KEYS[i]]++;
      }
    }
  }
  const standings=[...horses.values()].sort((a,b)=> b.prizeMoney-a.prizeMoney || RANK_KEYS.reduce((v,k)=>v || b[k]-a[k],0) || a.snapshotId.localeCompare(b.snapshotId));
  const top=standings[0];
  const tied=top ? standings.filter(x=>x.prizeMoney===top.prizeMoney && RANK_KEYS.every(k=>x[k]===top[k])) : [];
  return {standings,champion:tied.length===1?top:null,requiresDecider:tied.length>1,deciderEntrants:tied.map(x=>x.snapshotId)};
}
