export function sessionMetrics(session, entries) {
  const known=entries.filter(e=>e.WeightKg!=null && Number.isFinite(Number(e.WeightKg)));
  const WeightKg=known.reduce((sum,e)=>sum+Number(e.WeightKg),0);
  const minutes=Number(session.DurationSeconds)/60;
  return {...session,WeightKg,Tonnes:WeightKg/1000,MissingKg:entries.length-known.length,
    KgPerMinute:minutes>0 && (!entries.length || known.length) ? WeightKg/minutes : null};
}
export function sessionAverage(sessions) {
  const valid=sessions.filter(s=>s.KgPerMinute!=null&&Number(s.DurationSeconds)>0);
  const seconds=valid.reduce((n,s)=>n+Number(s.DurationSeconds),0);
  return {kg:valid.reduce((n,s)=>n+Number(s.WeightKg),0),minutes:seconds/60,
    weighted:seconds>0?valid.reduce((n,s)=>n+Number(s.WeightKg),0)/(seconds/60):null,
    mean:valid.length?valid.reduce((n,s)=>n+s.KgPerMinute,0)/valid.length:null};
}
