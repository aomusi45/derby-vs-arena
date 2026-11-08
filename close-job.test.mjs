import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAndClose} from './firestore-close-job.mjs';
const now=Date.parse('2026-11-08T08:00:00Z');
function fakeDb(races){
 const records=new Map(races.map(x=>[x.id,{...x}]));
 const writes=[];
 const snap=id=>({id,exists:records.has(id),data:()=>({...records.get(id)}),ref:{id}});
 const db={collection:()=>({get:async()=>({docs:[...records.keys()].map(snap)}),doc:id=>({get:async()=>snap(id)})}),
 runTransaction:async cb=>cb({get:async ref=>snap(ref.id),update:(ref,patch)=>{writes.push({id:ref.id,patch});Object.assign(records.get(ref.id),patch);}})};
 return {db,writes,records};
}
test('dry-run reports eligible but never writes',async()=>{
 const f=fakeDb([{id:'r1',status:'open',scheduledAt:new Date(now+30000)}]);
 assert.equal((await inspectAndClose(f.db,{nowMs:now}))[0].outcome,'would-close');
 assert.equal(f.writes.length,0);
});
test('not-yet-due race remains open',async()=>{
 const f=fakeDb([{id:'r1',status:'open',scheduledAt:new Date(now+120000)}]);
 assert.equal((await inspectAndClose(f.db,{nowMs:now}))[0].outcome,'none');
 assert.equal(f.writes.length,0);
});
test('already closed race never written',async()=>{
 const f=fakeDb([{id:'r1',status:'closed',scheduledAt:new Date(now-120000)}]);
 assert.equal((await inspectAndClose(f.db,{nowMs:now,apply:true}))[0].outcome,'none');
 assert.equal(f.writes.length,0);
});
test('unknown race reports missing',async()=>{
 const f=fakeDb([]);
 assert.equal((await inspectAndClose(f.db,{nowMs:now,raceId:'missing'}))[0].outcome,'missing');
});
test('invalid timestamp is never written',async()=>{
 const f=fakeDb([{id:'r1',status:'open',scheduledAt:null}]);
 assert.equal((await inspectAndClose(f.db,{nowMs:now,apply:true}))[0].outcome,'invalid');
 assert.equal(f.writes.length,0);
});
