// Guard against mismatched entry snapshots and unrelated result boards.
export function verifyEntryRoster(race, entries) {
  if (!Array.isArray(entries) || !Number.isInteger(race?.registeredCount) || entries.length !== race.registeredCount) throw Error('登録頭数と実際の登録データが一致しません');
  const uids=new Set();
  for(const e of entries){
    if(typeof e?.uid!=='string'||!e.uid||uids.has(e.uid))throw Error('登録者UIDが不正または重複しています');
    uids.add(e.uid);
  }
  return true;
}
export function verifyResultRoster(prepared, result) {
  const field=prepared?.field;
  if(!Array.isArray(field)||!Array.isArray(result?.results)||field.length!==result.results.length)throw Error('出走頭数と結果件数が一致しません');
  const names=new Map(field.map(h=>[h.number,h.name]));
  if(names.size!==field.length)throw Error('出走馬番が重複しています');
  for(const row of result.results){
    if(!names.has(row.number)||names.get(row.number)!==row.name)throw Error(`結果の馬番・馬名が出走登録と一致しません: ${row.number}`);
  }
  return true;
}
