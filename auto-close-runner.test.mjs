import test from 'node:test';
import assert from 'node:assert/strict';
import {readConfiguration,run} from './auto-close-runner.mjs';
test('default is read-only',()=>assert.equal(readConfiguration({}).apply,false));
test('explicit enable requires credentials',()=>assert.throws(()=>readConfiguration({VS_AUTO_CLOSE_ENABLED:'true'}),/認証情報/));
test('other flag values do not enable writes',()=>assert.equal(readConfiguration({VS_AUTO_CLOSE_ENABLED:'TRUE'}).apply,false));
test('missing credentials skips safely without firebase dependency',async()=>{
  const lines=[];
  const result=await run({env:{},logger:{log:s=>lines.push(s)}});
  assert.equal(result.skipped,true);
  assert.equal(result.applied,false);
  assert.equal(lines.length,1);
});
