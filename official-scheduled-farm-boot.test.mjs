import test from 'node:test';
import assert from 'node:assert/strict';
import {parseScheduledAt,injectDirectFarmBoot,waitUntilScheduled} from './official-scheduled-farm-boot.mjs';
test('accept JST timestamp',()=>assert.equal(parseScheduledAt('2026-11-09T10:47:00+09:00'),Date.parse('2026-11-09T01:47:00Z')));
test('reject invalid dates',()=>{for(const value of ['2026-11-09T10:47:00Z','2026-02-30T10:47:00+09:00','2026-11-09 10:47:00+09:00'])assert.throws(()=>parseScheduledAt(value));});
test('inject only known game hook',()=>{const h=injectDirectFarmBoot('x  window.__derbyMaybeEnterFarm=showFarmIfReady;y');assert.match(h,/__vsBootFarmDirect/);assert.match(h,/__derbyMaybeEnterFarm/);assert.throws(()=>injectDirectFarmBoot('x'));});
test('wait until scheduled',async()=>{let t=1000;await waitUntilScheduled(3000,{now:()=>t,sleep:async d=>{t+=d;}});assert.equal(t,3000);});
test('reject distant schedule',async()=>await assert.rejects(waitUntilScheduled(Date.now()+6*3600000)));
