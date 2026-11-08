import test from 'node:test';import assert from 'node:assert/strict';
import {eligibleToStart,chooseDueRaces,runAutoRaces} from './official-auto-runner.mjs';
const date=new Date('2026-11-08T04:00:00Z');
test('due closed race can start',()=>assert.equal(eligibleToStart({status:'closed',registeredCount:1,scheduledAt:date},date.getTime()),true));
test('not before scheduled time',()=>assert.equal(eligibleToStart({status:'closed',registeredCount:1,scheduledAt:date},date.getTime()-1),false));
test('no rerun claimed race',()=>assert.equal(eligibleToStart({status:'closed',registeredCount:1,scheduledAt:date,runClaim:{workerId:'x'}},date.getTime()),false));
test('no zero-horse race',()=>assert.equal(eligibleToStart({status:'closed',registeredCount:0,scheduledAt:date},date.getTime()),false));
test('due sorted by time',()=>{const a={id:'a',status:'closed',registeredCount:1,scheduledAt:new Date(date.getTime()-1000)};const b={id:'b',status:'closed',registeredCount:1,scheduledAt:date};assert.deepEqual(chooseDueRaces([b,a],date.getTime()).map(x=>x.id),['a','b']);});
test('dry-run never claims or launches',async()=>{
 const race={id:'abc',status:'closed',registeredCount:1,scheduledAt:date};
 const db={collection:()=>({get:async()=>({docs:[{id:'abc',data:()=>race}]}),doc:()=>({collection:()=>({get:async()=>({docs:[{id:'uid',data:()=>({horseJson:JSON.stringify({snapshotId:'s',sourceHorseId:'h',horse:{name:'馬'},raceStats:Object.fromEntries(['sp','sta','kick','early','sustain','grit','stability'].map(k=>[k,{total:80}])),raceContext:{}})})}]})})})})};
 const r=await runAutoRaces({db,now:date.getTime(),apply:false,execute:()=>{throw Error('must not execute')}});
 assert.equal(r.reports[0].outcome,'would-run');
});
