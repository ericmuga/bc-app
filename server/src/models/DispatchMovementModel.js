import { db, sql } from '../db/pool.js';

// Out-tray only. BC is read for unit conversion, never for an opening balance.
export { cachedUom as resolveStockUnit } from './DispatchUomModel.js';
export async function movements(filters = {}) {
  return (await (await db.getPool()).request().input('ch',sql.NVarChar(50),filters.chiller || null)
    .input('from',sql.Date,filters.dateFrom || null).input('to',sql.Date,filters.dateTo || null)
    .query(`SELECT m.*,e.OrderNo,e.Part,e.SessionId FROM dbo.DispatchChillerMovement m
      LEFT JOIN dbo.DispatchAssemblyEvent e ON e.EventId=m.EventId
      WHERE (@ch IS NULL OR m.Chiller=@ch) AND (@from IS NULL OR DATEADD(HOUR,3,m.CreatedAt)>=@from)
        AND (@to IS NULL OR DATEADD(HOUR,3,m.CreatedAt)<DATEADD(DAY,1,@to)) ORDER BY m.MovementId DESC`)).recordset;
}
export async function recordMovement(tx, {eventId=null, company,location,chiller,itemNo,baseUom,quantity,kind,batch=null,user,reason=null}) {
  await new sql.Request(tx).input('event',sql.UniqueIdentifier,eventId).input('co',sql.NVarChar(10),company)
    .input('loc',sql.NVarChar(20),location).input('ch',sql.NVarChar(50),chiller).input('item',sql.NVarChar(30),itemNo)
    .input('uom',sql.NVarChar(20),baseUom).input('qty',sql.Decimal(18,4),quantity).input('kind',sql.NVarChar(20),kind)
    .input('batch',sql.NVarChar(5),batch).input('uid',sql.NVarChar(100),String(user.userId))
    .input('name',sql.NVarChar(200),user.userName || '').input('reason',sql.NVarChar(250),reason)
    .query(`INSERT dbo.DispatchChillerMovement(EventId,Company,LocationCode,Chiller,ItemNo,BaseUom,Quantity,Kind,BatchNo,UserId,UserName,Reason)
      VALUES(@event,@co,@loc,@ch,@item,@uom,@qty,@kind,@batch,@uid,@name,@reason)`);
}
