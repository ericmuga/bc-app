import {db, sql} from '../db/pool.js';
import {ALL_COMPANIES} from '../services/bcTables.js';
import {validateCount, assertCanCount} from '../services/dispatchStocktake.js';

export async function catalog(company) {
  if (!ALL_COMPANIES.includes(company)) throw new Error('Select a company');
  return (await (await db.getPool()).request().input('company', sql.NVarChar(10), company).query(`
    SELECT r.ItemNo,COALESCE(m.Description,p.Description,r.ItemNo) Description,r.Barcode,r.BaseUom,r.SalesUom,
      COALESCE(r.Chiller,m.Chiller) Chiller,
      (SELECT u.Uom,u.KgPerUom FROM dbo.DispatchItemUom u WHERE u.Company=r.Company AND u.ItemNo=r.ItemNo FOR JSON PATH) Units
    FROM dbo.DispatchItemRule r LEFT JOIN dbo.DispatchItemChiller m ON m.ItemNo=r.ItemNo
    LEFT JOIN dbo.PosItem p ON p.ItemNo=r.ItemNo AND COALESCE(NULLIF(p.SourceCompany,''),'FCL')=r.Company
    WHERE r.Company=@company ORDER BY r.ItemNo`)).recordset.map(r => ({...r, Units:JSON.parse(r.Units || '[]')}));
}

export async function list(filters = {}) {
  return (await (await db.getPool()).request()
    .input('company',sql.NVarChar(10),filters.company || null).input('chiller',sql.NVarChar(50),filters.chiller || null)
    .input('from',sql.Date,filters.dateFrom || null).input('to',sql.Date,filters.dateTo || null).query(`
    SELECT s.*,COALESCE(c.Lines,0) Lines,c.WeightKg,c.UntranslatedLines FROM dbo.DispatchStocktake s
    OUTER APPLY(SELECT COUNT(*) Lines,SUM(l.WeightKg) WeightKg,SUM(CASE WHEN l.WeightKg IS NULL THEN 1 ELSE 0 END) UntranslatedLines
      FROM dbo.DispatchStocktakeLine l WHERE l.StocktakeId=s.StocktakeId)c
    WHERE (@company IS NULL OR s.Company=@company) AND (@chiller IS NULL OR s.Chiller=@chiller)
      AND (@from IS NULL OR DATEADD(HOUR,3,s.StartedAt)>=@from)
      AND (@to IS NULL OR DATEADD(HOUR,3,s.StartedAt)<DATEADD(DAY,1,@to)) ORDER BY s.StartedAt DESC`)).recordset;
}

export async function detail(id) {
  const result = await (await db.getPool()).request().input('id',sql.UniqueIdentifier,id).query(`
    SELECT * FROM dbo.DispatchStocktake WHERE StocktakeId=@id;
    SELECT * FROM dbo.DispatchStocktakeLine WHERE StocktakeId=@id ORDER BY ItemNo,Uom,BatchNo;`);
  if (!result.recordsets[0][0]) throw new Error('Stock take not found');
  return {...result.recordsets[0][0], lines:result.recordsets[1]};
}

export async function start(body, user) {
  const company = String(body.company || '').toUpperCase(), chiller = String(body.chiller || '').trim();
  const location = String(body.location || '').trim();
  if (!ALL_COMPANIES.includes(company) || !chiller || chiller.length > 50 || !location || location.length > 20) throw new Error('Select company, location and chiller');
  try {
    const result = await (await db.getPool()).request().input('co',sql.NVarChar(10),company)
      .input('loc',sql.NVarChar(20),location).input('ch',sql.NVarChar(50),chiller)
      .input('uid',sql.NVarChar(100),String(user.userId)).input('name',sql.NVarChar(200),user.userName || user.username || '').query(`
      IF NOT EXISTS(SELECT 1 FROM dbo.DispatchItemChiller WHERE Chiller=@ch) THROW 50000,'Select a configured chiller',1;
      INSERT dbo.DispatchStocktake(Company,LocationCode,Chiller,UserId,UserName)
      OUTPUT inserted.* VALUES(@co,@loc,@ch,@uid,@name);`);
    return result.recordset[0];
  } catch (e) {
    if ([2601,2627].includes(e.number)) throw new Error('An open stock take already exists for this company, location and chiller. Open it from the session list');
    throw e;
  }
}

async function change(id, user, work) {
  const tx = new sql.Transaction(await db.getPool()); await tx.begin();
  try {
    const session = (await new sql.Request(tx).input('id',sql.UniqueIdentifier,id)
      .query('SELECT * FROM dbo.DispatchStocktake WITH(UPDLOCK,HOLDLOCK) WHERE StocktakeId=@id')).recordset[0];
    assertCanCount(session,user);
    await work(tx,session);
    await tx.commit();
  } catch(e) { await tx.rollback(); throw e; }
  return detail(id);
}

export async function saveCount(id, body, user) {
  const count = validateCount(body);
  return change(id,user,async(tx,session) => {
    const unit = (await new sql.Request(tx).input('co',sql.NVarChar(10),session.Company)
      .input('item',sql.NVarChar(30),count.itemNo).input('uom',sql.NVarChar(20),count.uom).query(`
      SELECT u.KgPerUom,COALESCE(m.Description,p.Description,r.ItemNo) Description
      FROM dbo.DispatchItemRule r JOIN dbo.DispatchItemUom u ON u.Company=r.Company AND u.ItemNo=r.ItemNo
      LEFT JOIN dbo.DispatchItemChiller m ON m.ItemNo=r.ItemNo
      LEFT JOIN dbo.PosItem p ON p.ItemNo=r.ItemNo AND COALESCE(NULLIF(p.SourceCompany,''),'FCL')=r.Company
      WHERE r.Company=@co AND r.ItemNo=@item AND u.Uom=@uom`)).recordset[0];
    if (!unit) throw new Error('Item/UOM is not cached for this company. Refresh items and units in Dispatch Admin');
    const weight = unit.KgPerUom > 0 ? count.quantity * Number(unit.KgPerUom) : null;
    if (weight !== null && weight > 99999999999999) throw new Error('Converted weight exceeds the supported range');
    await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('item',sql.NVarChar(30),count.itemNo)
      .input('uom',sql.NVarChar(20),count.uom).input('batch',sql.NVarChar(5),count.batchNo)
      .input('qty',sql.Decimal(18,4),count.quantity).input('pieces',sql.Int,count.pieces)
      .input('kg',sql.Decimal(18,4),weight).input('factor',sql.Decimal(18,8),unit.KgPerUom)
      .input('description',sql.NVarChar(250),unit.Description).input('revision',sql.Int,count.revision)
      .input('uid',sql.NVarChar(100),String(user.userId)).input('details',sql.NVarChar(sql.MAX),JSON.stringify(count)).query(`
      DECLARE @existing int=(SELECT Revision FROM dbo.DispatchStocktakeLine WHERE StocktakeId=@id AND ItemNo=@item AND Uom=@uom AND BatchNo=@batch);
      IF COALESCE(@existing,0)<>@revision THROW 50000,'This count changed. Refresh and reopen the line before saving',1;
      IF @existing IS NULL
        INSERT dbo.DispatchStocktakeLine(StocktakeId,ItemNo,Description,Uom,BatchNo,Quantity,Pieces,KgPerUom,WeightKg,CountedBy)
        VALUES(@id,@item,@description,@uom,@batch,@qty,@pieces,@factor,@kg,@uid);
      ELSE UPDATE dbo.DispatchStocktakeLine SET Quantity=@qty,Pieces=@pieces,KgPerUom=@factor,WeightKg=@kg,
        Revision=Revision+1,CountedAt=SYSUTCDATETIME(),CountedBy=@uid
        WHERE StocktakeId=@id AND ItemNo=@item AND Uom=@uom AND BatchNo=@batch;
      INSERT dbo.DispatchStocktakeEvent(StocktakeId,UserId,Action,Details) VALUES(@id,@uid,'count',@details);`);
  });
}

export async function complete(id,user) {
  return change(id,user,async tx => {
    await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('uid',sql.NVarChar(100),String(user.userId)).query(`
      IF NOT EXISTS(SELECT 1 FROM dbo.DispatchStocktakeLine WHERE StocktakeId=@id) THROW 50000,'Count at least one item before completing',1;
      UPDATE dbo.DispatchStocktake SET CompletedAt=SYSUTCDATETIME() WHERE StocktakeId=@id;
      INSERT dbo.DispatchStocktakeEvent(StocktakeId,UserId,Action,Details) VALUES(@id,@uid,'complete','{}');`);
  });
}
