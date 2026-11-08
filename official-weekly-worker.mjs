// Separate opt-in weekly planner; never publishes to Firestore without explicit flag.
import {createWeeklyRaces} from './firestore-weekly-create.mjs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export async function runWeeklyPlanner({db,now=new Date(),apply=false,logger=console}={}){
  if(!db)throw Error('Firestore接続が必要です');
  const results=await createWeeklyRaces(db,{now,apply});
  logger.log(JSON.stringify({apply,created:results.filter(x=>x.outcome==='created').length,results}));
  return results;
}
async function main(){
  const apply=process.env.VS_WEEKLY_CREATE_ENABLED==='true';
  if(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON){console.log('Firebase認証情報なし：週次作成をスキップ');return;}
  const {initializeApp,cert,getApps}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const credentials=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const projectId=process.env.FIREBASE_PROJECT_ID||'derby-vs-arena';
  if(credentials.project_id!==projectId)throw Error('Firebaseプロジェクト不一致');
  if(!getApps().length)initializeApp({credential:cert(credentials),projectId});
  await runWeeklyPlanner({db:getFirestore(),apply});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e);process.exitCode=1;});
