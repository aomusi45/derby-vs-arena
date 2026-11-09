// Standalone, read-only DBF farm boot diagnostic. Does not run races or use Firebase.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';

export function parseScheduledAt(input){
 if(typeof input!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\+09:00$/.test(input))throw Error('scheduled_at must be YYYY-MM-DDTHH:mm:ss+09:00');
 const ms=Date.parse(input);
 if(!Number.isFinite(ms)||new Date(ms).toISOString()!==new Date(input).toISOString())throw Error('Invalid date');
 const [date,time]=input.split('T');
 const [y,m,d]=date.split('-').map(Number),[h,min,s]=time.slice(0,8).split(':').map(Number);
 const jst=new Date(ms+9*3600000);
 if(jst.getUTCFullYear()!==y||jst.getUTCMonth()+1!==m||jst.getUTCDate()!==d||jst.getUTCHours()!==h||jst.getUTCMinutes()!==min||jst.getUTCSeconds()!==s)throw Error('Invalid calendar date');
 return ms;
}
export function injectDirectFarmBoot(html){
 const needle='  window.__derbyMaybeEnterFarm=showFarmIfReady;';
 if(!html.includes(needle))throw Error('Ver.92 farm opening hook not found; refusing to patch a different engine');
 return html.replace(needle,`  // Automation-only direct farm entry, without pressing the title button.
  window.__vsBootFarmDirect=function(){
    if(requested)return;
    requested=true;
    attachFarmLoadListener();
    document.body.classList.add('barn-mode');
    document.body.classList.remove('stable-mode','boot-farm');
    document.body.dataset.gameScreen='farm';
    if(welcome){welcome.hidden=true;welcome.remove();}
    const opener=screen();if(opener){opener.hidden=true;opener.style.pointerEvents='none';}
    showFarmIfReady();
  };
${needle}`);
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
export async function bootFarm({htmlPath='./engine_source.html',output='farm-boot-evidence',timeoutMs=150000,chromiumFactory}={}){
 const htmlFile=resolve(htmlPath),root=dirname(htmlFile),html=injectDirectFarmBoot(await readFile(htmlFile,'utf8'));
 await mkdir(output,{recursive:true});
 const server=createServer(async(req,res)=>{
  try{
   const path=decodeURIComponent(new URL(req.url||'/','http://localhost').pathname);
   const file=path==='/'?htmlFile:resolve(root,'.'+path);
   if(file!==htmlFile&&!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
   const data=file===htmlFile?Buffer.from(html):await readFile(file);
   res.writeHead(200,{'Content-Type':mime[extname(file).toLowerCase()]||'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
 });
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
 const diagnostics={startedAt:new Date().toISOString(),steps:[],errors:[],httpErrors:[]};
 let browser,page;
 try{
  const chromium=chromiumFactory|| (await import('playwright')).chromium;
  browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-dev-shm-usage','--no-sandbox']});
  page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});
  page.on('pageerror',e=>{if(diagnostics.errors.length<30)diagnostics.errors.push(String(e.stack||e).slice(0,1200));});
  page.on('response',r=>{if(r.status()>=400&&diagnostics.httpErrors.length<30)diagnostics.httpErrors.push(`${r.status()} ${r.url()}`);});
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded',timeout:90000});
  diagnostics.steps.push('HTML loaded');
  await page.waitForFunction(()=>typeof window.__vsBootFarmDirect==='function',null,{timeout:30000});
  await page.evaluate(()=>{window.__df46OpeningRequested=true;window.__vsBootFarmDirect();window.__df47Start3D?.();});
  diagnostics.steps.push('Direct farm startup requested');
  await page.waitForFunction(()=>{
   const frame=document.getElementById('standaloneFarmV62Frame');
   const image=frame?.contentDocument?.getElementById('exactSceneImage');
   return document.body.dataset.gameScreen==='farm'&&document.body.classList.contains('barn-mode')&&
    image?.complete&&image.naturalWidth>0&&frame?.contentWindow?.FarmHomeBridge;
  },null,{timeout:timeoutMs});
  // Ensure the real farm is visible, not merely loaded behind the opening.
  await page.waitForFunction(()=>{
   const f=document.getElementById('standaloneFarmV62Frame'),o=document.getElementById('derbyOpening');
   return f&&f.getBoundingClientRect().width>100&&f.getBoundingClientRect().height>100&&
    getComputedStyle(f).display!=='none'&&(!o||o.hidden)&&!document.getElementById('dfV42Welcome');
  },null,{timeout:30000});
  // The first visible farm frame can still be covered by DBF's 1850ms
  // View Transition / star overlay. Wait until that visual effect has ended.
  await page.waitForFunction(()=>{
   const stars=document.getElementById('dfV2Sparkles');
   return !stars?.classList.contains('df-v2-active') &&
    !document.body.classList.contains('df-v2-opening-fade') &&
    !document.body.classList.contains('df-v2-fade-out') &&
    !document.body.classList.contains('df-v2-fade-in');
  },null,{timeout:15000});
  await page.waitForTimeout(2500);
  diagnostics.steps.push('Opening fade and star transition finished');
  diagnostics.farm=await page.evaluate(()=>{
   const f=document.getElementById('standaloneFarmV62Frame'),img=f.contentDocument.getElementById('exactSceneImage');
   return {screen:document.body.dataset.gameScreen,frameVisible:!!f.getBoundingClientRect().width,
    imageLoaded:img.complete&&img.naturalWidth>0,bridge:!!f.contentWindow.FarmHomeBridge,
    raceEngineReady:window.__raceReady3D===true,bootError:window.__df47BootError||null};
  });
  diagnostics.steps.push('Actual farm image visible');
  await page.screenshot({path:resolve(output,'farm-visible.png'),fullPage:false});
  diagnostics.success=true;
  console.log('FARM_VISIBLE_SUCCESS',JSON.stringify(diagnostics.farm));
 }catch(error){
  diagnostics.success=false;diagnostics.failure=String(error.stack||error);
  if(page)await page.screenshot({path:resolve(output,'farm-failure.png'),timeout:15000}).catch(()=>{});
  console.error('FARM_BOOT_FAILED',diagnostics.failure);
 }finally{
  diagnostics.finishedAt=new Date().toISOString();
  await writeFile(resolve(output,'diagnostics.json'),JSON.stringify(diagnostics,null,2));
  await browser?.close();await new Promise(ok=>server.close(ok));
 }
 if(!diagnostics.success)throw Error(`Farm boot failed; see ${output}/diagnostics.json and farm-failure.png`);
 return diagnostics;
}
export async function waitUntilScheduled(ms,{maxWaitMs=5*3600000,now=()=>Date.now(),sleep=t=>new Promise(r=>setTimeout(r,t))}={}){
 const diff=ms-now();
 if(diff>maxWaitMs)throw Error('Scheduled time is more than 5 hours away; run the workflow closer to the target time');
 if(diff< -5*60000)throw Error('Scheduled time is over 5 minutes in the past; choose a future time');
 while(now()<ms)await sleep(Math.min(10000,ms-now()));
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 try{
  const target=parseScheduledAt(process.env.VS_FARM_BOOT_AT||'');
  console.log('Waiting for JST target:',process.env.VS_FARM_BOOT_AT);
  await waitUntilScheduled(target);
  await bootFarm({htmlPath:process.env.VS_ENGINE_HTML||'./engine_source.html'});
 }catch(error){console.error(error);process.exitCode=1;}
}
