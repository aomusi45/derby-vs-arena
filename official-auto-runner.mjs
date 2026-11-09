// Trusted GitHub Actions/Node worker: real Ver.92 engine, no substitute physics.
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {extname,dirname,join,sep} from 'node:path';
import {verifyEntryRoster,verifyResultRoster} from './race-integrity.mjs';
import {attachVerifiedSnapshotIds} from './result-identity.mjs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {prepareRaceForExecution,toMillis} from './race-scheduler.mjs';
import {claimOfficialVsRace} from './firestore-race-claim.mjs';
import {validateRaceResult,saveOfficialVsResult} from './firestore-result-save.mjs';
import {inspectAndClose} from './firestore-close-job.mjs';
import {SUPPORTED_VS_DISTANCES} from './vs-field-adapter.mjs';

export function eligibleToStart(race, now=Date.now()) {
  return race?.status==='closed' && Number.isInteger(race.registeredCount) && race.registeredCount>0 && race.registeredCount<=18 && Number.isFinite(toMillis(race.scheduledAt)) && toMillis(race.scheduledAt)<=now && !race.runClaim && !race.result;
}
export function chooseDueRaces(rows,now=Date.now()) {
  return rows.filter(r=>eligibleToStart(r,now)).sort((a,b)=>toMillis(a.scheduledAt)-toMillis(b.scheduledAt));
}
export async function loadRegisteredEntries(db,raceId){
  const snap=await db.collection('races').doc(raceId).collection('entries').get();
  return snap.docs.map(d=>({uid:d.id,...d.data()}));
}

// Serve the original HTML over HTTP, as the working practice page does.
// ES modules and related assets can fail under file:// in headless Chromium.
async function serveEngineHtml(engineHtml){
  const entry=resolve(engineHtml);
  const root=dirname(entry);
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.gltf':'model/gltf+json'};
  const server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/', 'http://127.0.0.1');
      const name=decodeURIComponent(url.pathname);
      const file=name==='/'?entry:resolve(root,'.'+name);
      if(file!==entry && !file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
      const body=await readFile(file);
      res.writeHead(200,{'Content-Type':mime[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
      res.end(body);
    }catch(err){res.writeHead(404);res.end('Not found');}
  });
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
  const address=server.address();
  return {url:`http://127.0.0.1:${address.port}/`,close:()=>new Promise(ok=>server.close(ok))};
}

// A local, isolated Chromium instance runs the ORIGINAL Ver.92 HTML/JS. The DOM
// result board is the sole source of results; no fabricated winner/time values.
export async function executeInChromium({engineHtml,prepared,timeoutMs=240000,chromiumFactory}) {
  if(!engineHtml) throw Error('Ver.92のHTMLがありません');
  const chromium=chromiumFactory || (await import('playwright')).chromium;
  const localServer=await serveEngineHtml(engineHtml);
  let browser;
  try {
  browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-dev-shm-usage']});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];
    const failedRequests=[];
    const consoleErrors=[];
    page.on('pageerror',e=>errors.push(String(e.stack||e.message).slice(0,700)));
    page.on('requestfailed',request=>{
      if(failedRequests.length<12) failedRequests.push({url:request.url().slice(0,220),failure:request.failure()?.errorText||'unknown'});
    });
    page.on('console',message=>{
      if(message.type()==='error' && consoleErrors.length<12) consoleErrors.push(message.text().slice(0,500));
    });
    let stage='load-html';
    try {
    await page.goto(localServer.url,{waitUntil:'domcontentloaded',timeout:90000});
    // Official worker only: bypass the two visual entry screens. Do not
    // change the game's normal opening flow, race rules, or VS unlock checks.
    stage='wait-start-function';
    await page.waitForFunction(
      ()=>typeof window.__df47Start3D==='function',
      null,
      {timeout:120000}
    );
    stage='direct-engine-boot';
    await page.evaluate(()=>{
      // This is the same request flag used by the opening button; it is not
      // a farm-screen or race-ready spoof. main() still performs real setup.
      window.__df46OpeningRequested=true;
      window.__df47Start3D();
    });
    stage='wait-engine-ready';
    await page.waitForFunction(()=>{
      if(window.__df47BootError) throw Error(String(window.__df47BootError).slice(0,800));
      return window.__raceReady3D===true;
    },null,{timeout:120000});
    stage='verify-farm-initialized';
    const farmBoot=await page.evaluate(()=>({
      ready:window.__raceReady3D===true,
      screen:document.body?.dataset?.gameScreen??null,
      engine:typeof window.DFV30SharedRace?.start==='function'
    }));
    if(!farmBoot.ready || !farmBoot.engine || farmBoot.screen!=='farm'){
      throw Error(`牧場の初期化が完了していません: ${JSON.stringify(farmBoot)}`);
    }
    stage='start-race';
    const launched=await page.evaluate(({field,distance,going})=>{
      const engine=window.DFV30SharedRace;
      if(!engine || engine.getStatus()?.active) throw Error('VSエンジンが未準備です');
      const result=engine.start(field,distance,going);
      if(!result?.ok) throw Error(result?.error||'VS準備失敗');
      const button=document.getElementById('newspaperRaceStart');
      if(document.body.dataset.gameScreen!=='newspaper'||!button||button.disabled)throw Error('発走ボタンが利用できません');
      button.click();
      return {ok:true,count:result.count};
    },prepared);
    if(!launched.ok || launched.count!==prepared.field.length) throw Error('発走要求に失敗しました');
    stage='wait-race-results';
    await page.waitForFunction(count=>{
      let status=window.DFV30SharedRace?.getStatus?.();
      if(status?.active && status.race==='runout'){
        const finishButton=document.getElementById('dfNormalFinishButton');
        if(finishButton && !finishButton.hidden && !finishButton.disabled){
          finishButton.click();
          status=window.DFV30SharedRace?.getStatus?.();
        }
      }
      return status?.active && status.race==='finished' && document.body.dataset.gameScreen==='results' && document.querySelectorAll('#resultrows .result-line').length===count;
    },prepared.field.length,{timeout:timeoutMs});
    stage='read-results';
    const results=await page.evaluate(()=>[...document.querySelectorAll('#resultrows .result-line')].map((row,i)=>{
      const txt=selector=>row.querySelector(selector)?.textContent?.trim()||'';
      const nameNode=row.querySelector('.df28-result-name');
      const name=nameNode?.childNodes?.[0]?.textContent?.trim()||txt('.df28-result-name').replace(/単勝\s*\d+番人気/,'').trim();
      const detail=txt('.result-detail');
      return {rank:Number(txt('.result-rank').replace(/着$/,'')),number:Number(txt('.result-bib')),name,...(i===0?{winningTime:detail}:{marginBehindPrevious:detail})};
    }));
    return {results,errors};
    } catch (error) {
      let diagnostic={};
      try {
        diagnostic=await page.evaluate(()=>({
          ready:window.__raceReady3D===true,
          bootStage:window.__df47BootStage??null,
          bootError:window.__df47BootError??null,
          threeSource:window.__df46ThreeSource??null,
          threeLoadFailed:window.__df46ThreeLoadFailed??null,
          threePresent:!!window.DFV28Three,
          enginePresent:!!window.DFV30SharedRace,
          status:window.DFV30SharedRace?.getStatus?.()??null,
          screen:document.body?.dataset?.gameScreen??null,
          resultRows:document.querySelectorAll('#resultrows .result-line').length,
          finishButton:(()=>{const b=document.getElementById('dfNormalFinishButton');return b?{hidden:b.hidden,disabled:b.disabled}:null;})()
        }));
      } catch (inspectionError) {diagnostic={inspectionError:String(inspectionError.message||inspectionError)};}
      throw new Error(`Ver.92 race stage=${stage}; ${String(error.message||error)}; diagnostics=${JSON.stringify(diagnostic).slice(0,1500)}; pageErrors=${JSON.stringify(errors.slice(-3))}; failedRequests=${JSON.stringify(failedRequests.slice(-6))}; consoleErrors=${JSON.stringify(consoleErrors.slice(-6))}`);
    }
  } finally {await browser?.close();}
  } finally {await localServer.close();}
}

export async function runAutoRaces({db,engineHtml,apply=false,now=Date.now(),execute=executeInChromium,logger=console}={}) {
  if(!db)throw Error('Firestore管理者接続がありません');
  const closing=await inspectAndClose(db,{nowMs:now,apply});
  const snap=await db.collection('races').get();
  const due=chooseDueRaces(snap.docs.map(d=>({id:d.id,...d.data()})),now);
  const reports=[];
  for(const race of due){
    let claimed=false;
    try{
      if(!SUPPORTED_VS_DISTANCES.includes(race.distance||2400)) {reports.push({raceId:race.id,outcome:'unsupported-distance',distance:race.distance});continue;}
      const entries=await loadRegisteredEntries(db,race.id);
      verifyEntryRoster(race,entries);
      const prepared=prepareRaceForExecution(race,entries,{distance:race.distance||2400,going:race.going||'良'});
      if(!apply){reports.push({raceId:race.id,outcome:'would-run',count:entries.length});continue;}
      if(!engineHtml)throw Error('Ver.92 HTMLの場所が未設定です');
      const claim=await claimOfficialVsRace(db,race.id,{apply:true});
      if(claim.outcome!=='claimed'){reports.push({raceId:race.id,outcome:claim.outcome});continue;}
      claimed=true;
      const output=await execute({engineHtml,prepared});
      const rawResult={raceId:race.id,source:'DBF-Ver92-result-board',count:entries.length,results:output.results};
      verifyResultRoster(prepared,rawResult);
      const result=validateRaceResult(attachVerifiedSnapshotIds(prepared,rawResult,entries));
      const saved=await saveOfficialVsResult(db,result,{apply:true,completedAt:new Date(),workerId:claim.workerId});
      reports.push({raceId:race.id,outcome:saved.outcome,count:entries.length});
    }catch(e){
      // Never auto-reclaim a possibly started race: the existing 'running'
      // claim remains for manual investigation instead of risking a rerun.
      const record={raceId:race.id,outcome:claimed?'claimed-but-failed':'failed-before-claim',error:String(e.message||e)};
      reports.push(record);logger.error(JSON.stringify(record));
    }
  }
  return {closing,reports};
}

async function main(){
  const apply=process.env.VS_AUTO_RUN_ENABLED==='true';
  if(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON){console.log('Firebase認証情報がないため実行しません');return;}
  const {initializeApp,cert,getApps}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const credentials=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const projectId=process.env.FIREBASE_PROJECT_ID||'derby-vs-arena';
  if(credentials.project_id!==projectId)throw Error('Firebaseプロジェクトが一致しません');
  if(!getApps().length)initializeApp({credential:cert(credentials),projectId});
  const engineHtml=process.env.VS_ENGINE_HTML||'./engine_source.html';
  if(apply)await readFile(engineHtml); // Fail before making any write.
  const result=await runAutoRaces({db:getFirestore(),engineHtml,apply});
  console.log(JSON.stringify({apply,...result},null,2));
  if(result.reports.some(x=>x.outcome==='claimed-but-failed'||x.outcome==='failed-before-claim'))process.exitCode=1;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e);process.exitCode=1;});
