// Read-only official VS diagnostic: farm boot -> registered horse field -> newspaper.
// Never starts a race, claims a race, or writes to Firestore.
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {prepareOfficialField} from './vs-field-adapter.mjs';

const raceId=process.env.VS_PREVIEW_RACE_ID?.trim();
if(!raceId || !/^official_manual_[a-zA-Z0-9_-]+$/.test(raceId)) throw Error('VS_PREVIEW_RACE_IDに公式レースIDを指定してください');
const credential=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'null');
if(!credential?.project_id)throw Error('FIREBASE_SERVICE_ACCOUNT_JSONがありません');
const projectId=process.env.FIREBASE_PROJECT_ID||'derby-vs-arena';
if(credential.project_id!==projectId)throw Error('FirebaseプロジェクトIDが一致しません');
const {initializeApp,cert}=await import('firebase-admin/app');
const {getFirestore}=await import('firebase-admin/firestore');
const {chromium}=await import('playwright');
initializeApp({credential:cert(credential),projectId});
const db=getFirestore();
const raceDoc=await db.collection('races').doc(raceId).get();
if(!raceDoc.exists)throw Error(`公式レースが見つかりません: ${raceId}`);
const race={id:raceDoc.id,...raceDoc.data()};
const snap=await db.collection('races').doc(raceId).collection('entries').get();
const entries=snap.docs.map(d=>({uid:d.id,...d.data()}));
if(entries.length<1)throw Error(`登録馬が0頭です: ${raceId}`);
if(entries.length>18)throw Error('登録馬が18頭を超えています');
if(Number.isInteger(race.registeredCount)&&race.registeredCount!==entries.length)throw Error(`登録頭数不一致: document=${race.registeredCount}, entries=${entries.length}`);
const sorted=[...entries].sort((a,b)=>a.uid.localeCompare(b.uid));
const prepared=prepareOfficialField(sorted,{distance:race.distance||2400,going:race.going||'良'});
const output=resolve('newspaper-preview');
await mkdir(output,{recursive:true});
const html=resolve(process.env.VS_ENGINE_HTML||'./engine_source.html');
const root=dirname(html);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url||'/','http://localhost').pathname;
  const file=pathname==='/'?html:resolve(root,'.'+decodeURIComponent(pathname));
  if(file!==html&&!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  const bytes=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[extname(file).toLowerCase()]||'application/octet-stream'});res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
let browser;
const diagnostic={raceId,status:race.status,registeredCount:entries.length,horseNames:prepared.field.map(h=>h.name),stages:[],errors:[],missingAssets:[]};
try{
 browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on('pageerror',e=>diagnostic.errors.push(String(e.message).slice(0,400)));
 page.on('response',r=>{if(r.status()>=400&&diagnostic.missingAssets.length<15)diagnostic.missingAssets.push({status:r.status(),url:r.url().slice(0,180)});});
 const url=`http://127.0.0.1:${server.address().port}/`;
 diagnostic.stages.push('load-html');
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
 await page.screenshot({path:resolve(output,'01-opening.png')});
 diagnostic.stages.push('boot-farm');
 // Actual engine initializer. Do not forge __raceReady3D or the game screen.
 await page.waitForFunction(()=>typeof window.__df47Start3D==='function',null,{timeout:90000});
 await page.evaluate(()=>{window.__df46OpeningRequested=true;window.__df47Start3D();});
 await page.waitForFunction(()=>window.__raceReady3D===true||Boolean(window.__df47BootError),null,{timeout:120000});
 const boot=await page.evaluate(()=>({ready:window.__raceReady3D===true,error:window.__df47BootError||null,screen:document.body.dataset.gameScreen,engine:typeof window.DFV30SharedRace?.start==='function'}));
 diagnostic.boot=boot;
 await page.screenshot({path:resolve(output,'02-after-farm-boot.png')});
 if(!boot.ready||!boot.engine)throw Error(`牧場3Dエンジン初期化失敗: ${JSON.stringify(boot)}`);
 diagnostic.stages.push('registered-horses-to-newspaper');
 const newspaper=await page.evaluate(p=>{
  const status=window.DFV30SharedRace?.getStatus?.();
  if(status?.active)throw Error('VSエンジンがすでに使用中です');
  const result=window.DFV30SharedRace.start(p.field,p.distance,p.going);
  const button=document.getElementById('newspaperRaceStart');
  return {result,screen:document.body.dataset.gameScreen,buttonPresent:!!button,buttonEnabled:!!button&&!button.disabled,bodyText:document.body.innerText.slice(0,200)};
 },prepared);
 diagnostic.newspaper=newspaper;
 await page.screenshot({path:resolve(output,'03-newspaper.png'),fullPage:true});
 if(!newspaper.result?.ok||newspaper.screen!=='newspaper'||!newspaper.buttonEnabled)throw Error(`新聞表示失敗: ${JSON.stringify(newspaper)}`);
 diagnostic.stages.push('newspaper-visible-no-race-start');
 console.log(`新聞表示成功: ${raceId}, ${entries.length}頭。発走はしていません。`);
}catch(e){diagnostic.failure=String(e.stack||e);console.error(diagnostic.failure);process.exitCode=1;}
finally{
 await writeFile(resolve(output,'diagnostic.json'),JSON.stringify(diagnostic,null,2));
 await browser?.close();
 await new Promise(ok=>server.close(ok));
 console.log(JSON.stringify({raceId,stages:diagnostic.stages,failure:diagnostic.failure||null}));
}
