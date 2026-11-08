// Trusted-server race registration closer. Default: read-only dry-run.
// Requires firebase-admin and Application Default Credentials only when executed.
import { evaluateRace } from './race-scheduler.mjs';

export async function inspectAndClose(db, {nowMs=Date.now(), apply=false, raceId=null}={}) {
  const collection = db.collection('races');
  const docs = raceId ? [await collection.doc(raceId).get()] : (await collection.get()).docs;
  const report=[];
  for (const snap of docs) {
    if (!snap.exists) { report.push({raceId:snap.id, outcome:'missing'}); continue; }
    const decision=evaluateRace({id:snap.id,...snap.data()},nowMs);
    if(decision.action !== 'close') {report.push({raceId:snap.id,outcome:decision.action,reason:decision.reason});continue;}
    if(!apply){report.push({raceId:snap.id,outcome:'would-close'});continue;}
    // Re-read in a transaction to prevent double processing or overriding admin changes.
    const outcome=await db.runTransaction(async tx=>{
      const current=await tx.get(snap.ref);
      if(!current.exists) return 'missing';
      const currentDecision=evaluateRace({id:current.id,...current.data()},Date.now());
      if(currentDecision.action!=='close') return 'skipped-changed';
      tx.update(snap.ref,{status:'closed'});
      return 'closed';
    });
    report.push({raceId:snap.id,outcome});
  }
  return report;
}

async function main(){
  const apply=process.argv.includes('--apply');
  const idArg=process.argv.find(a=>a.startsWith('--race-id='));
  const raceId=idArg?.slice('--race-id='.length)||null;
  const {initializeApp,applicationDefault,getApps}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  if(!getApps().length) initializeApp({credential:applicationDefault()});
  const report=await inspectAndClose(getFirestore(),{apply,raceId});
  for(const item of report) console.log(JSON.stringify(item));
  console.log(apply?'WRITE MODE: closing eligible races only':'DRY RUN: no Firestore changes');
}
if(process.argv[1] && import.meta.url===new URL(`file://${process.argv[1]}`).href){
  main().catch(e=>{console.error(e);process.exitCode=1;});
}
