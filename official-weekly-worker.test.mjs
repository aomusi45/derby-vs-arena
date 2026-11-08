import test from 'node:test';
import assert from 'node:assert/strict';
import {runWeeklyPlanner} from './official-weekly-worker.mjs';
test('weekly worker defaults to no writes',async()=>{
 let writes=0;const db={collection:()=>({doc:()=>({create:async()=>{writes++;}})})};
 const result=await runWeeklyPlanner({db,now:new Date('2026-11-09T00:00:00Z'),logger:{log(){}}});
 assert.equal(result.length,12);assert.equal(writes,0);
});
test('weekly worker opt-in creates all twelve only once',async()=>{
 const ids=new Set();const db={collection:()=>({doc:id=>({create:async()=>{if(ids.has(id))throw {code:6};ids.add(id);}})})};
 const args={db,now:new Date('2026-11-09T00:00:00Z'),apply:true,logger:{log(){}}};
 assert.equal((await runWeeklyPlanner(args)).filter(x=>x.outcome==='created').length,12);
 assert.equal((await runWeeklyPlanner(args)).filter(x=>x.outcome==='already-exists').length,12);
});
