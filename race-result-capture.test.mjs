import test from 'node:test';
import assert from 'node:assert/strict';
import {captureOfficialVsResult, watchOfficialVsResult} from './race-result-capture.mjs';
function node(s) { return {textContent:s}; }
function fixture({race='finished',active=true,screen='results',rows=2}={}) {
  const names=['サンプルホース','テストホース'];
  const items=Array.from({length:rows},(_,i)=>({querySelector(sel){
    return ({'.result-rank':node(`${i+1}着`),'.result-bib':node(`${i+1}`),'.df28-result-name':{textContent:names[i]||`馬${i+1}`,childNodes:[node(names[i]||`馬${i+1}`)]},'.result-detail':node(i?'1馬身':'2:24.1')})[sel]||null;
  }}));
  let tick;let cleared=false;
  const win={DFV30SharedRace:{getStatus:()=>({active,race})},document:{body:{dataset:{gameScreen:screen}},getElementById:id=>id==='resultrows'?{querySelectorAll:()=>items}:null},setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{cleared=true;}};
  return {win,trigger:()=>tick(),cleared:()=>cleared,items};
}
const args = win => ({raceId:'race1',engineWindow:win,expectedCount:2});
test('captures finish order, winner time and other margins',()=>{
 const f=fixture();const r=captureOfficialVsResult(args(f.win));
 assert.equal(r.count,2);assert.deepEqual(r.results[0],{rank:1,number:1,name:'サンプルホース',winningTime:'2:24.1'});
 assert.equal(r.results[1].marginBehindPrevious,'1馬身');
});
test('does not publish before finish',()=>{assert.equal(captureOfficialVsResult(args(fixture({race:'running'}).win)),null);});
test('does not publish non-VS results',()=>{assert.equal(captureOfficialVsResult(args(fixture({active:false}).win)),null);});
test('does not publish on other screen',()=>{assert.equal(captureOfficialVsResult(args(fixture({screen:'race'}).win)),null);});
test('does not publish incomplete result board',()=>{assert.equal(captureOfficialVsResult(args(fixture({rows:1}).win)),null);});
test('rejects malformed ranks',()=>{const f=fixture();f.items[0].querySelector=sel=>sel==='.result-rank'?node('9着'):({'.result-bib':node('1'),'.df28-result-name':{childNodes:[node('馬')]},'.result-detail':node('2:24')})[sel];assert.throws(()=>captureOfficialVsResult(args(f.win)),/不完全/);});
test('watch emits once then stops',()=>{const f=fixture();let n=0;const watch=watchOfficialVsResult({...args(f.win),onComplete:()=>n++});f.trigger();watch.check();assert.equal(n,1);assert.equal(f.cleared(),true);});
test('watch can be cancelled',()=>{const f=fixture({race:'running'});let n=0;const w=watchOfficialVsResult({...args(f.win),onComplete:()=>n++});w.stop();f.trigger();assert.equal(n,0);});
