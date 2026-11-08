// GitHub Actions entrypoint. Does not execute 3D racing or publish results.
import { inspectAndClose } from './firestore-close-job.mjs';

export function readConfiguration(env) {
  const apply = env.VS_AUTO_CLOSE_ENABLED === 'true';
  if (apply && !env.FIREBASE_SERVICE_ACCOUNT_JSON) throw Error('自動締切が有効ですがFirebase認証情報がありません');
  return {apply, projectId: env.FIREBASE_PROJECT_ID || 'derby-vs-arena'};
}

export async function run({env=process.env, logger=console}={}) {
  const config = readConfiguration(env);
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    logger.log('Firebase認証情報が未設定です。安全のため処理をスキップします。');
    return {skipped:true, applied:false, report:[]};
  }
  const {initializeApp, cert, getApps} = await import('firebase-admin/app');
  const {getFirestore} = await import('firebase-admin/firestore');
  let credentials;
  try { credentials=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON); }
  catch { throw Error('Firebase認証情報のJSON形式が不正です'); }
  if (credentials.project_id !== config.projectId) throw Error('FirebaseプロジェクトIDが一致しません');
  if (!getApps().length) initializeApp({credential:cert(credentials),projectId:config.projectId});
  const report=await inspectAndClose(getFirestore(),{apply:config.apply});
  for(const item of report) logger.log(JSON.stringify(item));
  logger.log(config.apply ? '自動締切：書込有効' : '自動締切：確認のみ（書込なし）');
  return {skipped:false, applied:config.apply, report};
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  run().catch(e=>{console.error(e.message);process.exitCode=1;});
}
