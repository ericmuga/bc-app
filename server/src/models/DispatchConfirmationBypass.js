import {sql} from '../db/pool.js';

// Called inside the configuration/import transaction. Released orders retain a
// separate bypass marker; this never fabricates a human confirmation.
export async function applyConfirmationBypass(transaction, orderId=null) {
  const result=await new sql.Request(transaction).input('id',sql.UniqueIdentifier,orderId).query(`
    DECLARE @released TABLE(Id uniqueidentifier PRIMARY KEY);
    IF EXISTS(SELECT 1 FROM dbo.DispatchChillerConfig WHERE Id=1 AND BypassConfirmation=1)
    BEGIN
      UPDATE o WITH(UPDLOCK) SET Confirmed=1,ConfirmationBypassed=1,Status='confirmed',UpdatedAt=GETUTCDATE()
      OUTPUT inserted.DispatchOrderId INTO @released
      FROM dbo.DispatchOrder o
      WHERE (@id IS NULL OR o.DispatchOrderId=@id) AND o.Confirmed=0 AND o.Status='pending'
        AND EXISTS(SELECT 1 FROM dbo.DispatchOrderPart p WHERE p.DispatchOrderId=o.DispatchOrderId AND p.Active=1)
        AND NOT EXISTS(SELECT 1 FROM dbo.DispatchOrderLine l WHERE l.DispatchOrderId=o.DispatchOrderId
          AND NOT EXISTS(SELECT 1 FROM dbo.DispatchOrderPart p WHERE p.DispatchOrderId=l.DispatchOrderId AND p.Part=l.Part AND p.Active=1));
      UPDATE p SET Confirmed=1,ConfirmationBypassed=1,UpdatedAt=GETUTCDATE()
        FROM dbo.DispatchOrderPart p JOIN @released r ON r.Id=p.DispatchOrderId WHERE p.Active=1 AND p.Confirmed=0;
    END;
    SELECT COUNT(*) Released FROM @released;`);
  return result.recordset[0].Released;
}
