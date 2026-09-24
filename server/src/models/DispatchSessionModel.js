import { db, sql } from '../db/pool.js';

export async function current(user) {
  return (await (await db.getPool()).request().input('uid',sql.NVarChar(100),String(user.userId))
    .query('SELECT * FROM dbo.DispatchAssemblySession WHERE UserId=@uid AND EndedAt IS NULL')).recordset[0] || null;
}
export async function start(user) {
  const p = await db.getPool();
  const tx = new sql.Transaction(p); await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const r = await new sql.Request(tx).input('uid',sql.NVarChar(100),String(user.userId))
      .input('name',sql.NVarChar(200),user.userName || '').query(`
        IF NOT EXISTS(SELECT 1 FROM dbo.DispatchAssemblySession WITH(UPDLOCK,HOLDLOCK) WHERE UserId=@uid AND EndedAt IS NULL)
          INSERT dbo.DispatchAssemblySession(UserId,UserName) VALUES(@uid,@name);
        SELECT * FROM dbo.DispatchAssemblySession WHERE UserId=@uid AND EndedAt IS NULL;`);
    await tx.commit(); return r.recordset[0];
  } catch(e) { await tx.rollback(); throw e; }
}
export async function end(user, id) {
  const r = await (await db.getPool()).request().input('id',sql.UniqueIdentifier,id)
    .input('uid',sql.NVarChar(100),String(user.userId))
    .query(`SET XACT_ABORT ON; BEGIN TRANSACTION;
      UPDATE dbo.DispatchAssemblySession SET EndedAt=GETUTCDATE() OUTPUT inserted.*
      WHERE SessionId=@id AND UserId=@uid AND EndedAt IS NULL;
      DELETE dbo.DispatchOrderClaim WHERE Stage='assembly' AND SessionId=@id AND UserId=@uid; COMMIT;`);
  if (!r.recordset.length) throw new Error('No active session found for this assembler');
  return r.recordset[0];
}
export async function report(user, filters = {}) {
  const all = ['admin','dispatch-supervisor','chiller-attendant'].includes(user.role) && filters.mine !== 'true';
  const p = await db.getPool();
  const req = p.request().input('uid',sql.NVarChar(100),String(user.userId))
    .input('from',sql.Date,filters.dateFrom || null).input('to',sql.Date,filters.dateTo || null);
  return (await req.query(`SELECT s.*,DATEDIFF(SECOND,s.StartedAt,COALESCE(s.EndedAt,GETUTCDATE())) DurationSeconds,
      COUNT(e.EventId) Entries,COUNT(DISTINCT e.LineId) Lines,COUNT(DISTINCT e.DispatchOrderId) Orders,
      SUM(CASE WHEN e.CorrectionReason IS NOT NULL THEN 1 ELSE 0 END) Corrections
    FROM dbo.DispatchAssemblySession s LEFT JOIN dbo.DispatchAssemblyEvent e ON e.SessionId=s.SessionId
    WHERE ${all ? '1=1' : 's.UserId=@uid'}
      AND (@from IS NULL OR DATEADD(HOUR,3,s.StartedAt)>=@from)
      AND (@to IS NULL OR DATEADD(HOUR,3,s.StartedAt)<DATEADD(DAY,1,@to))
    GROUP BY s.SessionId,s.UserId,s.UserName,s.StartedAt,s.EndedAt ORDER BY s.StartedAt DESC`)).recordset;
}
export async function events(user, sessionId) {
  const all = ['admin','dispatch-supervisor','chiller-attendant'].includes(user.role);
  return (await (await db.getPool()).request().input('id',sql.UniqueIdentifier,sessionId)
    .input('uid',sql.NVarChar(100),String(user.userId)).query(`
      SELECT e.*,s.UserName,l.Description FROM dbo.DispatchAssemblyEvent e
      JOIN dbo.DispatchAssemblySession s ON s.SessionId=e.SessionId
      LEFT JOIN dbo.DispatchOrderLine l ON l.LineId=e.LineId
      WHERE e.SessionId=@id ${all ? '' : 'AND s.UserId=@uid'} ORDER BY e.CreatedAt,e.Revision`)).recordset;
}
