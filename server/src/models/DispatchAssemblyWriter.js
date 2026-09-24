import { db, sql } from '../db/pool.js';
import { validateAssemblyWrite } from '../services/dispatchAssemblyRules.js';

export async function writeAssembly({ dispatchOrderId, lineId, part, body = {}, user }) {
  const tx = new sql.Transaction(await db.getPool());
  await tx.begin();
  try {
    const req = () => new sql.Request(tx);
    // Serialize writes and completion per order, even when multiple chillers work on a part.
    const header = (await req().input('id', sql.UniqueIdentifier, dispatchOrderId)
      .query('SELECT Status,Confirmed FROM dbo.DispatchOrder WITH (UPDLOCK,HOLDLOCK) WHERE DispatchOrderId=@id')).recordset[0];
    const config = (await req().query('SELECT BypassAssignment FROM dbo.DispatchChillerConfig WITH (HOLDLOCK) WHERE Id=1')).recordset[0];
    const bypass = !!config.BypassAssignment;
    if (part && bypass) throw new Error('Complete individual chiller items in bypass mode');
    const lines = (await req().input('id', sql.UniqueIdentifier, dispatchOrderId)
      .input('lid', sql.UniqueIdentifier, lineId || null).input('part', sql.Char(1), part || null)
      .query(`SELECT l.*,p.Active,p.Assembled,p.AssignedToUserId,a.Completed,a.AssembledQty,a.AssembledWeight,a.ReturnReasonCode,
          COALESCE(a.Chiller,m.Chiller) Chiller
        FROM dbo.DispatchOrderLine l
        JOIN dbo.DispatchOrderPart p ON p.DispatchOrderId=l.DispatchOrderId AND p.Part=l.Part
        LEFT JOIN dbo.DispatchAssemblyLine a ON a.LineId=l.LineId
        LEFT JOIN dbo.DispatchItemChiller m WITH (HOLDLOCK) ON m.ItemNo=l.ItemNo
        WHERE l.DispatchOrderId=@id AND ((@lid IS NOT NULL AND l.LineId=@lid) OR (@part IS NOT NULL AND l.Part=@part))`)).recordset;
    if (!lines.length) throw new Error('No assembly lines found');
    for (const line of lines) {
      const values = part ? { assembledQty: line.AssembledQty, assembledWeight: line.AssembledWeight, returnReasonCode: line.ReturnReasonCode } : body;
      // Completed bypass lines can be included when finishing a part after changing modes.
      validateAssemblyWrite({ ...line, ...header, Completed: part ? false : line.Completed }, values, user, bypass);
    }
    const complete = bypass && body.complete === true;
    if (lineId) {
      await req().input('lid', sql.UniqueIdentifier, lineId).input('id', sql.UniqueIdentifier, dispatchOrderId)
        .input('qty', sql.Decimal(18,4), Number(body.assembledQty)).input('wt', sql.Decimal(18,4), Number(body.assembledWeight || 0))
        .input('rc', sql.NVarChar(20), String(body.returnReasonCode || '').slice(0,20))
        .input('rn', sql.NVarChar(200), String(body.returnReasonName || '').slice(0,200))
        .input('uid', sql.NVarChar(100), String(user.userId)).input('un', sql.NVarChar(200), user.userName || '')
        .input('ch', sql.NVarChar(50), lines[0].Chiller || null).input('done', sql.Bit, complete)
        .query(`MERGE dbo.DispatchAssemblyLine WITH (HOLDLOCK) AS t USING (SELECT @lid LineId) s ON t.LineId=s.LineId
          WHEN MATCHED THEN UPDATE SET AssembledQty=@qty,AssembledWeight=@wt,ReturnReasonCode=@rc,ReturnReasonName=@rn,
            AssembledByUserId=@uid,AssembledByName=@un,AssembledAt=GETUTCDATE(),Chiller=@ch,Completed=@done
          WHEN NOT MATCHED THEN INSERT (DispatchOrderId,LineId,AssembledQty,AssembledWeight,ReturnReasonCode,ReturnReasonName,AssembledByUserId,AssembledByName,Chiller,Completed)
            VALUES (@id,@lid,@qty,@wt,@rc,@rn,@uid,@un,@ch,@done);`);
    }
    await req().input('id', sql.UniqueIdentifier, dispatchOrderId)
      .query("UPDATE dbo.DispatchOrder SET Status='assembling',UpdatedAt=GETUTCDATE() WHERE DispatchOrderId=@id");
    if (part || complete) {
      await req().input('id', sql.UniqueIdentifier, dispatchOrderId).input('part', sql.Char(1), part || lines[0].Part)
        .input('manual', sql.Bit, !!part).input('uid', sql.NVarChar(100), String(user.userId)).input('un', sql.NVarChar(200), user.userName || '')
        .query(`UPDATE p SET Assembled=1,AssembledByUserId=@uid,AssembledByName=@un,AssembledAt=GETUTCDATE(),UpdatedAt=GETUTCDATE()
          FROM dbo.DispatchOrderPart p WHERE p.DispatchOrderId=@id AND p.Part=@part AND p.Active=1 AND p.Assembled=0
          AND (@manual=1 OR NOT EXISTS (SELECT 1 FROM dbo.DispatchOrderLine l LEFT JOIN dbo.DispatchAssemblyLine a ON a.LineId=l.LineId
            WHERE l.DispatchOrderId=@id AND l.Part=@part AND ISNULL(a.Completed,0)=0));
          IF @manual=1 UPDATE a SET Completed=1 FROM dbo.DispatchAssemblyLine a JOIN dbo.DispatchOrderLine l ON l.LineId=a.LineId
            WHERE l.DispatchOrderId=@id AND l.Part=@part;`);
    }
    const result = await req().input('id', sql.UniqueIdentifier, dispatchOrderId).query(`
      UPDATE dbo.DispatchOrder SET Assembled=1,Status='assembled',UpdatedAt=GETUTCDATE()
      WHERE DispatchOrderId=@id
      AND EXISTS (SELECT 1 FROM dbo.DispatchOrderPart WHERE DispatchOrderId=@id AND Active=1)
      AND NOT EXISTS (SELECT 1 FROM dbo.DispatchOrderPart WHERE DispatchOrderId=@id AND Active=1 AND Assembled=0)
      AND NOT EXISTS (SELECT 1 FROM dbo.DispatchOrderLine l LEFT JOIN dbo.DispatchOrderPart p
        ON p.DispatchOrderId=l.DispatchOrderId AND p.Part=l.Part WHERE l.DispatchOrderId=@id AND (p.Part IS NULL OR p.Active=0));`);
    await tx.commit();
    return { ok: true, fullyAssembled: !!result.rowsAffected[0] };
  } catch (e) { try { await tx.rollback(); } catch { /* already rolled back */ } throw e; }
}
