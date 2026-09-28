import {sql} from '../db/pool.js';

// Allocate inside the same transaction that inserts the order. The lock is shared
// by BC imports and POS ingestion, including other API instances.
export async function nextDispatchNumber(transaction, date = new Date()) {
  const ymd = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  const stem = `DSP-${ymd}-`;
  const result = await new sql.Request(transaction)
    .input('stem',sql.NVarChar(30),stem)
    .input('lock',sql.NVarChar(100),'dispatch-number-'+ymd)
    .query(`
      DECLARE @lockResult int;
      EXEC @lockResult=sys.sp_getapplock @Resource=@lock,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=30000;
      IF @lockResult<0 THROW 50000,'Dispatch numbering is busy. Retry the import',1;
      SELECT COALESCE(MAX(TRY_CONVERT(bigint,SUBSTRING(DispatchNo,LEN(@stem)+1,30))),0)+1 NextNumber
      FROM dbo.DispatchOrder WHERE DispatchNo LIKE @stem+'%';`);
  const sequence = String(result.recordset[0].NextNumber);
  if (!/^\d+$/.test(sequence) || stem.length + sequence.length > 30) throw new Error('Dispatch number sequence exceeds the supported range');
  return stem + sequence.padStart(3,'0');
}
