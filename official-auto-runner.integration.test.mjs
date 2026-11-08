import test from 'node:test';
import assert from 'node:assert/strict';
import {runAutoRaces} from './official-auto-runner.mjs';

const when=new Date('2026-11-08T04:00:00Z');
const stats=Object.fromEntries(['sp','sta','kick','early','sustain','grit','stability'].map(k=>[k,{total:80}]));
const entry={uid:'user1',horseJson:JSON.stringify({snapshotId:'snap1',sourceHorseId:'horse1',horse:{name:'試験馬'},raceStats:stats,raceContext:{}})};
function fakeDb(){
  const race={id:'race1',status:'closed',registeredCount:1,scheduledAt:when};
  const ref={id:'race1'};
  const snap=()=>({id:'race1',ref,exists:true,data:()=>({...race})});
  const db={
    collection(name){assert.equal(name,'races');return {
      get:async()=>({docs:[snap()]}),
      doc(id){assert.equal(id,'race1');return {...ref,get:async()=>snap(),collection(sub){assert.equal(sub,'entries');return {get:async()=>({docs:[{id:'user1',data:()=>entry}]})};}};}
    };},
    async runTransaction(fn){return fn({get:async()=>snap(),update(_ref,patch){Object.assign(race,patch);}});}
  };
  return {db,race};
}
test('complete one official race and persist result using the claim owner',async()=>{
 const {db,race}=fakeDb();
 const output=await runAutoRaces({db,engineHtml:'dummy.html',now:when.getTime(),apply:true,execute:async({prepared})=>({results:[{rank:1,number:prepared.field[0].number,name:prepared.field[0].name,winningTime:'1:34.5'}]})});
 assert.equal(output.reports[0].outcome,'saved');
 assert.equal(race.status,'finished');
 assert.equal(race.result.results[0].name,'試験馬');
 assert.equal(typeof race.runClaim.workerId,'string');
});
test('reject result with a different horse name, keep race claimed for investigation',async()=>{
 const {db,race}=fakeDb();
 const output=await runAutoRaces({db,engineHtml:'dummy.html',now:when.getTime(),apply:true,logger:{error(){}},execute:async()=>({results:[{rank:1,number:1,name:'別の馬',winningTime:'1:34.5'}]})});
 assert.equal(output.reports[0].outcome,'claimed-but-failed');
 assert.equal(race.status,'running');
 assert.equal(race.result,undefined);
});
