// Official VS race input adapter. No alternative race physics or winner calculation.
const KEYS = ['sp','sta','kick','early','sustain','grit','stability'];
export const SUPPORTED_VS_DISTANCES = Object.freeze([1200,1600,2000,2400,3000]);
const VALID_GOING = ['良','稍重','重','不良'];
const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
export function prepareOfficialField(entries, {distance=2400,going='良'}={}) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 18) throw Error('出走馬は1～18頭です');
  if (!SUPPORTED_VS_DISTANCES.includes(distance) || !VALID_GOING.includes(going)) throw Error('本体VSエンジン非対応のレース条件です');
  const seen = new Set();
  const field = entries.map((entry,i)=>{
    const data = typeof entry.horseJson === 'string' ? JSON.parse(entry.horseJson) : entry;
    if (!data || typeof data !== 'object' || !data.horse || !data.raceStats || !data.raceContext || !data.snapshotId || !data.sourceHorseId) throw Error(`馬${i+1}: VS登録馬形式が不正です`);
    if (seen.has(data.snapshotId)) throw Error(`馬${i+1}: snapshotIdが重複しています`);
    seen.add(data.snapshotId);
    for(const k of KEYS) if (!Number.isFinite(Number(data.raceStats[k]?.total))) throw Error(`馬${i+1}: ${k}が不正です`);
    const c = data.raceContext;
    const name = String(data.name || data.horse.name || '').trim();
    if (!name) throw Error(`馬${i+1}: 馬名がありません`);
    return {id:String(data.sourceHorseId), name, sex:data.sex || data.horse.sex || '牡',
      age:finite(data.age,4), coatType:data.coatType || data.horse.coatType || '鹿毛',
      growth:data.growth || data.horse.growth || '普通',
      tactic:c.tactic || data.horse.tactic || '先行',
      speed:Number(data.raceStats.sp.total), sta:Number(data.raceStats.sta.total),
      kick:Number(data.raceStats.kick.total), early:Number(data.raceStats.early.total),
      sustain:Number(data.raceStats.sustain.total), grit:Number(data.raceStats.grit.total),
      stability:Number(data.raceStats.stability.total),
      bestDistance:finite(c.bestDistance,distance), aptMin:finite(c.aptMin,1200), aptMax:finite(c.aptMax,3000),
      going:c.goingAptitude || {}, health:finite(c.health,90),temperament:finite(c.temperament,85),
      form:finite(c.form,75),fatigue:finite(c.fatigue,0),
      earnedPrize:finite(c.earnedPrize ?? data.earnedPrize,0),isCom:false,
      number:i+1};
  });
  return {distance,going,field};
}
export function sendToExistingEngine(engineWindow, prepared) {
  const shared = engineWindow?.DFV30SharedRace;
  if (!shared || typeof shared.start !== 'function') throw Error('Ver.92の3D VSレースエンジンが未起動です');
  return shared.start(prepared.field,prepared.distance,prepared.going);
}
