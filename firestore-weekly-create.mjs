// Explicit opt-in weekly race creation; create() is atomic and never overwrites existing races.
import {buildWeeklyRaces} from './weekly-race-schedule.mjs';
export async function createWeeklyRaces(db,{now=new Date(),apply=false,program}={}){
 if(!db?.collection)throw Error('Firestore管理者接続が必要です');
 const races=buildWeeklyRaces(now,{program});
 const report=[];
 for(const race of races){
  const {id,...fields}=race;
  const ref=db.collection('races').doc(id);
  if(!apply){report.push({id,outcome:'would-create',scheduledAt:fields.scheduledAt.toISOString()});continue;}
  try{await ref.create(fields);report.push({id,outcome:'created'});}
  catch(e){if(e?.code===6||e?.code==='already-exists'){report.push({id,outcome:'already-exists'});continue;}throw e;}
 }
 return report;
}
