// Deterministic Japan-local weekly race planning. No Firestore writes here.
// The weekly registration window is Monday 00:00 through Friday 23:59 JST.
export const RACE_PROGRAM = Object.freeze([
  {name:'大阪杯',distance:2000,going:'良',category:'古馬'},
  {name:'天皇賞（春）',distance:3200,going:'良',category:'古馬'},
  {name:'宝塚記念',distance:2200,going:'良',category:'古馬'},
  {name:'天皇賞（秋）',distance:2000,going:'良',category:'古馬'},
  {name:'ジャパンカップ',distance:2400,going:'良',category:'混合'},
  {name:'有馬記念',distance:2500,going:'良',category:'混合'},
]);
const DAY=86400000;
function dateAtJst(y,m,d,h=0){return new Date(Date.UTC(y,m-1,d,h-9));}
export function getJstWeek(now=new Date()){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('日付が不正です');
  const jst=new Date(now.getTime()+9*3600000);
  const day=jst.getUTCDay();
  const monday=new Date(Date.UTC(jst.getUTCFullYear(),jst.getUTCMonth(),jst.getUTCDate() - ((day+6)%7)));
  const y=monday.getUTCFullYear(),m=monday.getUTCMonth()+1,d=monday.getUTCDate();
  return {key:`${y}${String(m).padStart(2,'0')}${String(d).padStart(2,'0')}`,mondayJst:dateAtJst(y,m,d),saturdayJst:new Date(dateAtJst(y,m,d).getTime()+5*DAY),sundayJst:new Date(dateAtJst(y,m,d).getTime()+6*DAY)};
}
export function buildWeeklyRaces(now=new Date(),{program=RACE_PROGRAM}={}){
  const week=getJstWeek(now);
  if(!Array.isArray(program)||!program.length||program.length>6)throw Error('レース番組が不正です');
  const rows=[];
  for(const [dayIndex,day] of [week.saturdayJst,week.sundayJst].entries()){
    for(const [slot,entry] of program.entries()){
      if(!entry?.name||!Number.isInteger(entry.distance)||entry.distance<1000)throw Error('レース条件が不正です');
      const scheduledAt=new Date(day.getTime()+(12+slot*2)*3600000);
      rows.push({id:`official_${week.key}_${dayIndex===0?'sat':'sun'}_${slot+1}`,weekKey:week.key,day:dayIndex===0?'sat':'sun',raceName:entry.name,distance:entry.distance,going:entry.going||'良',category:entry.category,scheduledAt,status:'open',registeredCount:0,official:true});
    }
  }
  return rows;
}
