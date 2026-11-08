import test from 'node:test';
import assert from 'node:assert/strict';
import {launchOfficialVsRace} from './browser-race-launcher.mjs';
const horse = {snapshotId:'s1',sourceHorseId:'h1',name:'テスト',horse:{name:'テスト'},raceStats:Object.fromEntries(['sp','sta','kick','early','sustain','grit','stability'].map(k=>[k,{total:80}])),raceContext:{tactic:'先行'}};
function fixture(){
 let clicks=0,starts=0;
 const button={disabled:false,click(){clicks++;}};
 const win={__raceReady3D:true,document:{body:{dataset:{gameScreen:'newspaper'}},getElementById(id){return id==='newspaperRaceStart'?button:null;}},DFV30SharedRace:{getStatus(){return {active:false,race:'idle'}},start(field,distance,going){starts++;return {ok:true,count:field.length};}}};
 return {win,counts:()=>({clicks,starts})};
}
const race={id:'race1',status:'closed',registeredCount:1};
const entries=[{uid:'u1',horseJson:JSON.stringify(horse)}];
test('prepares field and requests existing newspaper start',()=>{const f=fixture();const r=launchOfficialVsRace({race,entries,engineWindow:f.win});assert.equal(r.launchRequested,true);assert.deepEqual(f.counts(),{clicks:1,starts:1});});
test('blocks when 3D not ready',()=>{const f=fixture();f.win.__raceReady3D=false;assert.throws(()=>launchOfficialVsRace({race,entries,engineWindow:f.win}),/3D/);assert.deepEqual(f.counts(),{clicks:0,starts:0});});
test('blocks when engine busy',()=>{const f=fixture();f.win.DFV30SharedRace.getStatus=()=>({active:true,race:'running'});assert.throws(()=>launchOfficialVsRace({race,entries,engineWindow:f.win}),/未準備/);});
test('blocks on engine rejection',()=>{const f=fixture();f.win.DFV30SharedRace.start=()=>({ok:false,error:'拒否'});assert.throws(()=>launchOfficialVsRace({race,entries,engineWindow:f.win}),/拒否/);assert.equal(f.counts().clicks,0);});
test('blocks on incorrect entry count',()=>{const f=fixture();assert.throws(()=>launchOfficialVsRace({race:{...race,registeredCount:2},entries,engineWindow:f.win}),/一致しません/);assert.deepEqual(f.counts(),{clicks:0,starts:0});});
