// Server-side binding of immutable registration identity to the verified Ver.92 board.
// Never trust a snapshotId supplied by browser result rows.
export function attachVerifiedSnapshotIds(prepared, result, entries) {
  const field=prepared?.field;
  if (!Array.isArray(field) || !Array.isArray(result?.results) || !Array.isArray(entries) || field.length!==entries.length || result.results.length!==field.length) throw Error('結果と登録馬の頭数が一致しません');
  const byNumber=new Map();
  const ids=new Set();
  for(let i=0;i<field.length;i++) {
    const horse=field[i];
    const raw=entries[i]?.horseJson;
    let data;
    try { data=typeof raw==='string'?JSON.parse(raw):raw??entries[i]; } catch {throw Error('登録馬JSONが不正です');}
    const id=data?.snapshotId;
    if(!Number.isInteger(horse?.number)||horse.number<1||horse.number>18||byNumber.has(horse.number)||typeof id!=='string'||!id.trim()||id.length>160||ids.has(id)) throw Error('登録馬の識別情報が不正です');
    ids.add(id);
    byNumber.set(horse.number,{name:horse.name,snapshotId:id});
  }
  const seen=new Set();
  const results=result.results.map(row=>{
    const registered=byNumber.get(row?.number);
    if(!registered||registered.name!==row.name||seen.has(row.number))throw Error('結果の馬番・馬名が登録情報と一致しません');
    seen.add(row.number);
    // Reject untrusted identity rather than accepting or overwriting it.
    if(row.snapshotId!==undefined && row.snapshotId!==registered.snapshotId)throw Error('結果に不正な識別子が含まれます');
    return {...row,snapshotId:registered.snapshotId};
  });
  return {...result,results};
}
