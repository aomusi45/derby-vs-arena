import {buildWeeklyRaces} from './weekly-race-schedule.mjs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export function buildOneOfficialRace({id,at,now=new Date()}={}) {
  if(!/^official_manual_[A-Za-z0-9_-]{1,90}$/.test(id||'')) throw Error('レースIDは official_manual_ で始めてください');
  if(typeof at!=='string'|| !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\+09:00|Z)$/.test(at))throw Error('日時は 2026-11-09T00:00:00+09:00 の形式で指定してください');
  const scheduledAt=new Date(at);
  if(!Number.isFinite(scheduledAt.getTime()))throw Error('日時が不正です');
  if(scheduledAt.getTime()<=now.getTime())throw Error('発走日時が過去です。未来の日時を指定してください');
  const template=buildWeeklyRaces(scheduledAt).find(r=>r.raceName==='大阪杯');
  if(!template)throw Error('公式大阪杯のテンプレートが見つかりません');
  return {...template,id,scheduledAt,status:'open',registeredCount:0};
}
export async function createOneOfficialRace(db,{apply=false,...options}={}){
  const race=buildOneOfficialRace(options);
  if(!apply)return {id:race.id,outcome:'would-create',scheduledAt:race.scheduledAt.toISOString()};
  if(!db?.collection)throw Error('Firestore管理者接続が必要です');
  const {id,...fields}=race;
  try{await db.collection('races').doc(id).create(fields);return {id,outcome:'created',scheduledAt:race.scheduledAt.toISOString()};}
  catch(e){if(e?.code===6||e?.code==='already-exists')return {id,outcome:'already-exists'};throw e;}
}
async function main(){
  const args=process.argv.slice(2);const value=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1]};
  const options={id:value('--id'),at:value('--at'),apply:args.includes('--apply')};
  if(!options.apply){console.log(JSON.stringify(await createOneOfficialRace(null,options),null,2));return;}
  if(process.env.VS_ONE_OFFICIAL_RACE_ENABLED!=='true')throw Error('本番作成が許可されていません');
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;if(!raw)throw Error('Firebase認証情報がありません');
  const credentials=JSON.parse(raw),projectId=process.env.FIREBASE_PROJECT_ID||'derby-vs-arena';
  if(credentials.project_id!==projectId)throw Error('Firebaseプロジェクト不一致');
  const {initializeApp,cert}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({credential:cert(credentials),projectId},'one-official-race');
  console.log(JSON.stringify(await createOneOfficialRace(getFirestore(app),options),null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e);process.exitCode=1});
