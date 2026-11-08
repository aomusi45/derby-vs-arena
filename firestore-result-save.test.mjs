import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRaceResult,saveOfficialVsResult} from './firestore-result-save.mjs';
const result={raceId:'race123',source:'DBF-Ver92-result-board',count:2,results:[{rank:1,number:2,name:'馬A',winningTime:'1:34.2'},{rank:2,number:1,name:'馬B',marginBehindPrevious:'1/2'}]};
function mockDb(data={status:'running',registeredCount:2}) {
  const state={data:{...data},writes:0};
  const ref={id:'race123'};
  const db={collection(name){assert.equal(name,'races');return {doc(id){assert.equal(id,'race123');return ref;}}},async runTransaction(fn){return fn({async get(r){assert.equal(r,ref);return {exists:true,data:()=>({...state.data})};},update(r,patch){assert.equal(r,ref);state.writes++;Object.assign(state.data,patch);}})}};
  return {db,state};
}
test('accepts completed Ver.92 results',()=>assert.equal(validateRaceResult(result).count,2));
test('rejects duplicate bib',()=>assert.throws(()=>validateRaceResult({...result,results:[result.results[0],{...result.results[1],number:2}]}),/馬番/));
test('rejects missing winning time',()=>assert.throws(()=>validateRaceResult({...result,results:[{...result.results[0],winningTime:''},result.results[1]]}),/時計/));
test('rejects mismatched count',()=>assert.throws(()=>validateRaceResult({...result,count:3}),/件数/));
test('rejects unknown source',()=>assert.throws(()=>validateRaceResult({...result,source:'other'}),/Ver.92/));
test('dry-run never writes',async()=>{const {db,state}=mockDb();assert.equal((await saveOfficialVsResult(db,result)).outcome,'would-save');assert.equal(state.writes,0);});
test('saves result and finish status atomically',async()=>{const {db,state}=mockDb();assert.equal((await saveOfficialVsResult(db,result,{apply:true,completedAt:'test-time'})).outcome,'saved');assert.equal(state.data.status,'finished');assert.equal(state.data.result.results[0].name,'馬A');assert.equal(state.writes,1);});
test('second attempt does not overwrite',async()=>{const {db,state}=mockDb();await saveOfficialVsResult(db,result,{apply:true,completedAt:'test-time'});assert.equal((await saveOfficialVsResult(db,result,{apply:true,completedAt:'later'})).outcome,'already-finished');assert.equal(state.writes,1);});
test('rejects wrong state',async()=>{const {db,state}=mockDb({status:'closed',registeredCount:2});await assert.rejects(saveOfficialVsResult(db,result,{apply:true,completedAt:'t'}),/走行中/);assert.equal(state.writes,0);});
test('rejects mismatched registered count',async()=>{const {db,state}=mockDb({status:'running',registeredCount:1});await assert.rejects(saveOfficialVsResult(db,result,{apply:true,completedAt:'t'}),/一致/);assert.equal(state.writes,0);});
test('requires timestamp for writes',async()=>{const {db}=mockDb();await assert.rejects(saveOfficialVsResult(db,result,{apply:true}),/完了時刻/);});
test('rejects another worker result write',async()=>{const {db,state}=mockDb({status:'running',registeredCount:2,runClaim:{workerId:'workerA'}});await assert.rejects(saveOfficialVsResult(db,result,{apply:true,completedAt:'t',workerId:'workerB'}),/実行者/);assert.equal(state.writes,0);});
test('allows owner worker result write',async()=>{const {db,state}=mockDb({status:'running',registeredCount:2,runClaim:{workerId:'workerA'}});assert.equal((await saveOfficialVsResult(db,result,{apply:true,completedAt:'t',workerId:'workerA'})).outcome,'saved');assert.equal(state.writes,1);});
