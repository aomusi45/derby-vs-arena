import test from 'node:test';import assert from 'node:assert/strict';
import {getJstWeek,buildWeeklyRaces} from './weekly-race-schedule.mjs';
test('JST Monday boundary',()=>{assert.equal(getJstWeek(new Date('2026-11-08T14:59:59Z')).key,'20261102');assert.equal(getJstWeek(new Date('2026-11-08T15:00:00Z')).key,'20261109');});
test('twelve weekend races with unique deterministic IDs',()=>{const a=buildWeeklyRaces(new Date('2026-11-09T00:00:00Z'));assert.equal(a.length,12);assert.equal(new Set(a.map(x=>x.id)).size,12);assert.deepEqual(a,buildWeeklyRaces(new Date('2026-11-10T00:00:00Z')));});
test('Saturday noon JST and two hour slots',()=>{const a=buildWeeklyRaces(new Date('2026-11-09T00:00:00Z'));assert.equal(a[0].scheduledAt.toISOString(),'2026-11-14T03:00:00.000Z');assert.equal(a[1].scheduledAt.toISOString(),'2026-11-14T05:00:00.000Z');assert.equal(a[6].scheduledAt.toISOString(),'2026-11-15T03:00:00.000Z');});
test('invalid inputs rejected',()=>{assert.throws(()=>getJstWeek(new Date(NaN)));assert.throws(()=>buildWeeklyRaces(new Date(),{program:[]}));});
