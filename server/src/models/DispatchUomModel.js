import {trackSync} from './DispatchSyncModel.js';
import {db,sql} from '../db/pool.js';
import {bcDb} from '../db/bcPool.js';
import {bcTable,ALL_COMPANIES} from '../services/bcTables.js';

async function refreshUomsWork(companies=ALL_COMPANIES) {
  const app=await db.getPool(),bc=await bcDb.getPool();let count=0;
  for(const company of companies){
    const rows=(await bc.request().query(`SELECT i.[No_] ItemNo,u.Code Uom,i.[Base Unit of Measure] BaseUom,
      u.[Qty_ per Unit of Measure] QtyPerUom,
      CASE WHEN UPPER(i.[Base Unit of Measure]) IN ('KG','KGS') THEN u.[Qty_ per Unit of Measure]
        WHEN kg.[Qty_ per Unit of Measure]>0 THEN u.[Qty_ per Unit of Measure]/kg.[Qty_ per Unit of Measure] END KgPerUom
      FROM ${bcTable(company,'Item')} i JOIN ${bcTable(company,'Item Unit of Measure')} u ON u.[Item No_]=i.[No_]
      LEFT JOIN ${bcTable(company,'Item Unit of Measure')} kg ON kg.[Item No_]=i.[No_] AND kg.Code='KG'
      WHERE u.[Qty_ per Unit of Measure]>0`)).recordset;
    const tx=new sql.Transaction(app);await tx.begin();
    try{await new sql.Request(tx).input('co',sql.NVarChar(10),company).query('DELETE dbo.DispatchItemUom WHERE Company=@co');
      for(let n=0;n<rows.length;n+=500)await new sql.Request(tx).input('co',sql.NVarChar(10),company).input('rows',sql.NVarChar(sql.MAX),JSON.stringify(rows.slice(n,n+500))).query(`
        INSERT dbo.DispatchItemUom(Company,ItemNo,Uom,BaseUom,QtyPerUom,KgPerUom)
        SELECT @co,ItemNo,Uom,BaseUom,QtyPerUom,KgPerUom FROM OPENJSON(@rows)
        WITH(ItemNo nvarchar(30),Uom nvarchar(20),BaseUom nvarchar(20),QtyPerUom decimal(18,6),KgPerUom decimal(18,8));`);
      await tx.commit();count+=rows.length;
    }catch(e){await tx.rollback();throw e;}
  }return {count};
}
export async function cachedUom(company,itemNo,uom){
  const row=(await (await db.getPool()).request().input('co',sql.NVarChar(10),company).input('item',sql.NVarChar(30),itemNo)
    .input('uom',sql.NVarChar(20),uom).query('SELECT * FROM dbo.DispatchItemUom WHERE Company=@co AND ItemNo=@item AND Uom=@uom')).recordset[0];
  if(!row)throw new Error('Item UOM is not cached. Refresh BC units in Dispatch Admin setup.');
  return row;
}

export async function refreshUoms(companies=ALL_COMPANIES){return trackSync('BC item units',()=>refreshUomsWork(companies));}

// One application-cache query per order; never query BC for each scanned line.
export async function withUnitConversions(lines){
 if(!lines.length)return lines;
 const keys=lines.map(l=>({Company:l.BarcodeCompany,ItemNo:l.ItemNo}));
 const units=(await (await db.getPool()).request().input('keys',sql.NVarChar(sql.MAX),JSON.stringify(keys)).query(`
 SELECT u.* FROM dbo.DispatchItemUom u WHERE EXISTS(SELECT 1 FROM OPENJSON(@keys)
 WITH(Company nvarchar(10),ItemNo nvarchar(30)) k WHERE k.Company=u.Company AND k.ItemNo=u.ItemNo)`)).recordset;
 return lines.map(l=>({...l,UnitConversions:units.filter(u=>u.Company===l.BarcodeCompany&&u.ItemNo===l.ItemNo)}));
}
