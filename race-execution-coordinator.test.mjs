import test from 'node:test';
import assert from 'node:assert/strict';
import {coordinateOfficialVsRace} from './race-execution-coordinator.mjs';
const race={id:'race1',status:'closed',registeredCount:1};
const entries=[{uid:'u1'}];
const result={raceId:'race1',source:'DBF-Ver92-result-board',count:1,results:[{rank:1,number:1,name:'馬',winningTime:'1:23'}]};
const base={race,entries,engineWindow:{},db:{},launch:()=>({launchRequested:true,raceId:'race1',count:1})};
test('connects launch to result capture and dry-run save',async()=>{
 let callbacks, writes=0;
 const c=coordinateOfficialVsRace({...base,watch:o=>{callbacks=o;return {stop(){}}},save:async(db,r,opts)=>{assert.equal(r,result);assert.equal(opts.apply,false);writes++;return {outcome:'would-save'};}});
 assert.equal(c.state,'watching');callbacks.onComplete(result);
 const finished=await c.completion;
 assert.equal(finished.saved.outcome,'would-save');assert.equal(c.state,'done');assert.equal(writes,1);
});
test('apply mode requires a server clock',()=>assert.throws(()=>coordinateOfficialVsRace({...base,apply:true}),/保存時刻/));
test('rejects unclosed race',()=>assert.throws(()=>coordinateOfficialVsRace({...base,race:{...race,status:'open'}}),/受付終了/));
test('rejects wrong count',()=>assert.throws(()=>coordinateOfficialVsRace({...base,entries:[]}),/登録頭数/));
test('rejects unsuccessful launch',()=>assert.throws(()=>coordinateOfficialVsRace({...base,launch:()=>({launchRequested:false})}),/発走要求/));
test('save errors are propagated',async()=>{
 let callbacks;
 const c=coordinateOfficialVsRace({...base,watch:o=>{callbacks=o;return {stop(){}}},save:async()=>{throw Error('Firestore offline')}});
 callbacks.onComplete(result);
 await assert.rejects(c.completion,/Firestore offline/);
 assert.equal(c.state,'failed');
});
test('watch errors are propagated',async()=>{
 let callbacks;
 const c=coordinateOfficialVsRace({...base,watch:o=>{callbacks=o;return {stop(){}}}});
 callbacks.onError(Error('engine stopped'));
 await assert.rejects(c.completion,/engine stopped/);
});
test('cancel stops watcher and rejects completion',async()=>{
 let stopped=0;
 const c=coordinateOfficialVsRace({...base,watch:()=>({stop(){stopped++}})});
 c.stop();
 await assert.rejects(c.completion,/中止/);
 assert.equal(stopped,1);assert.equal(c.state,'cancelled');
});
