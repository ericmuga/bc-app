import {trackSync} from './DispatchSyncModel.js';
import { refreshUoms } from './DispatchUomModel.js';
import { db, sql } from '../db/pool.js';
import { bcDb } from '../db/bcPool.js';
import { bcTable, extCol, ALL_COMPANIES } from '../services/bcTables.js';

// Refresh company-specific item metadata and the requested JF-SAUSAGE routing rule.
async function syncItemRulesWork(companies = ALL_COMPANIES) {
  const app = await db.getPool(), bc = await bcDb.getPool();
  const result = { items:0, mapped:0, salesLines:0, companies:[] };
  for (const company of companies) {
    const items = (await bc.request().query(`SELECT i.[No_] ItemNo,i.Description,i.[Inventory Posting Group] PostingGroup,
      i.[Base Unit of Measure] BaseUom,i.[Sales Unit of Measure] SalesUom,
      x.${extCol('Bar Code No_')} Barcode,u.[Qty_ per Unit of Measure] QtyPerSalesUnit
      FROM ${bcTable(company,'Item')} i LEFT JOIN ${bcTable(company,'Item',{coreExt:true})} x ON x.[No_]=i.[No_]
      LEFT JOIN ${bcTable(company,'Item Unit of Measure')} u ON u.[Item No_]=i.[No_] AND u.Code=i.[Sales Unit of Measure]`)).recordset;
    const tx = new sql.Transaction(app); await tx.begin();
    try {
      for (let n=0;n<items.length;n+=500) {
        await new sql.Request(tx).input('co',sql.NVarChar(10),company)
          .input('rows',sql.NVarChar(sql.MAX),JSON.stringify(items.slice(n,n+500))).query(`
          MERGE dbo.DispatchItemRule WITH(HOLDLOCK) t USING (
            SELECT @co Company,ItemNo,PostingGroup,BaseUom,SalesUom,Barcode,QtyPerSalesUnit,
              CASE WHEN UPPER(PostingGroup)='JF-SAUSAGE' THEN 'B' END Part,
              CASE WHEN UPPER(PostingGroup)='JF-SAUSAGE' THEN 'CHILLER U' END Chiller
            FROM OPENJSON(@rows) WITH(ItemNo nvarchar(30),PostingGroup nvarchar(30),BaseUom nvarchar(20),SalesUom nvarchar(20),Barcode nvarchar(50),QtyPerSalesUnit decimal(18,6))) s
          ON t.Company=s.Company AND t.ItemNo=s.ItemNo
          WHEN MATCHED THEN UPDATE SET PostingGroup=s.PostingGroup,Part=s.Part,Chiller=s.Chiller,Barcode=s.Barcode,
            BaseUom=s.BaseUom,SalesUom=s.SalesUom,QtyPerSalesUnit=s.QtyPerSalesUnit
          WHEN NOT MATCHED THEN INSERT(Company,ItemNo,PostingGroup,Part,Chiller,Barcode,BaseUom,SalesUom,QtyPerSalesUnit)
            VALUES(s.Company,s.ItemNo,s.PostingGroup,s.Part,s.Chiller,s.Barcode,s.BaseUom,s.SalesUom,s.QtyPerSalesUnit);
          MERGE dbo.DispatchItemChiller WITH(HOLDLOCK) t USING (
            SELECT ItemNo,Description FROM OPENJSON(@rows) WITH(ItemNo nvarchar(30),Description nvarchar(250),PostingGroup nvarchar(30)) WHERE UPPER(PostingGroup)='JF-SAUSAGE') s
          ON t.ItemNo=s.ItemNo WHEN MATCHED THEN UPDATE SET Chiller='CHILLER U',Description=s.Description
          WHEN NOT MATCHED THEN INSERT(ItemNo,Description,Chiller) VALUES(s.ItemNo,s.Description,'CHILLER U');`);
      }
      // Preserve progressed/packed history; reroute only lines with no assembly record.
      await new sql.Request(tx).input('co',sql.NVarChar(10),company).query(`
        UPDATE p SET Barcode=r.Barcode FROM dbo.PosItem p
          JOIN dbo.DispatchItemRule r ON r.Company=p.SourceCompany AND r.ItemNo=p.ItemNo WHERE r.Company=@co;
        UPDATE l SET Barcode=r.Barcode FROM dbo.DispatchOrderLine l
          JOIN dbo.DispatchOrder o ON o.DispatchOrderId=l.DispatchOrderId
          LEFT JOIN dbo.PosItem p ON p.ItemNo=l.ItemNo
          JOIN dbo.DispatchItemRule r ON r.Company=COALESCE(NULLIF(o.Company,''),NULLIF(p.SourceCompany,''),'FCL') AND r.ItemNo=l.ItemNo
          WHERE r.Company=@co AND o.Status<>'loaded';
        DECLARE @changed TABLE(Id uniqueidentifier PRIMARY KEY);
        INSERT @changed SELECT DISTINCT o.DispatchOrderId FROM dbo.DispatchOrder o
          JOIN dbo.DispatchOrderLine l ON l.DispatchOrderId=o.DispatchOrderId
          JOIN dbo.DispatchItemRule r ON r.Company=COALESCE(NULLIF(o.Company,''),'FCL') AND r.ItemNo=l.ItemNo
          WHERE r.Company=@co AND r.Part='B' AND ISNULL(l.Part,'')<>'B' AND o.Status IN ('pending','confirmed','assigned','assembling')
          AND NOT EXISTS(SELECT 1 FROM dbo.DispatchAssemblyLine a WHERE a.LineId=l.LineId);
        UPDATE l SET Part=r.Part,Barcode=COALESCE(NULLIF(r.Barcode,''),l.Barcode),BaseUom=r.BaseUom
          FROM dbo.DispatchOrderLine l JOIN dbo.DispatchOrder o ON o.DispatchOrderId=l.DispatchOrderId
          JOIN dbo.DispatchItemRule r ON r.Company=COALESCE(NULLIF(o.Company,''),'FCL') AND r.ItemNo=l.ItemNo
          WHERE r.Company=@co AND r.Part='B' AND o.Status IN ('pending','confirmed','assigned','assembling')
          AND NOT EXISTS(SELECT 1 FROM dbo.DispatchAssemblyLine a WHERE a.LineId=l.LineId);
        UPDATE p SET Active=CASE WHEN EXISTS(SELECT 1 FROM dbo.DispatchOrderLine l WHERE l.DispatchOrderId=p.DispatchOrderId AND l.Part=p.Part) THEN 1 ELSE 0 END
          FROM dbo.DispatchOrderPart p JOIN @changed c ON c.Id=p.DispatchOrderId;
        UPDATE p SET Confirmed=0,ConfirmedByUserId=NULL,ConfirmedByName=NULL,ConfirmedAt=NULL,Assembled=0,
          AssembledByUserId=NULL,AssembledByName=NULL,AssembledAt=NULL,AssignedToUserId=NULL,AssignedToName=NULL,AssignedAt=NULL
          FROM dbo.DispatchOrderPart p JOIN @changed c ON c.Id=p.DispatchOrderId WHERE p.Part='B';
        UPDATE o SET Confirmed=0,Assembled=0,Status='pending',UpdatedAt=GETUTCDATE()
          FROM dbo.DispatchOrder o JOIN @changed c ON c.Id=o.DispatchOrderId;
        UPDATE l SET Barcode=COALESCE(NULLIF(r.Barcode,''),l.Barcode),BaseUom=r.BaseUom,
          Uom=CASE WHEN l.Uom='U' AND NULLIF(r.SalesUom,'') IS NOT NULL THEN r.SalesUom ELSE l.Uom END
          FROM dbo.DispatchOrderLine l JOIN dbo.DispatchOrder o ON o.DispatchOrderId=l.DispatchOrderId
          JOIN dbo.DispatchItemRule r ON r.Company=COALESCE(NULLIF(o.Company,''),'FCL') AND r.ItemNo=l.ItemNo
          WHERE r.Company=@co AND o.Status IN ('pending','confirmed','assigned','assembling')
            AND NOT EXISTS(SELECT 1 FROM dbo.DispatchAssemblyLine a WHERE a.LineId=l.LineId);`);
      await tx.commit();
    } catch(e) { await tx.rollback(); throw e; }
    result.items += items.length; result.mapped += items.filter(i=>i.PostingGroup?.trim().toUpperCase()==='JF-SAUSAGE').length;
    // Only unshipped sales orders, never quotes, invoices or posted history.
    const updated = await bc.request().query(`UPDATE e SET e.${extCol('Part No_')}='B'
      FROM ${bcTable(company,'Sales Line',{coreExt:true})} e
      JOIN ${bcTable(company,'Sales Line')} l ON e.[Document Type]=l.[Document Type] AND e.[Document No_]=l.[Document No_] AND e.[Line No_]=l.[Line No_]
      JOIN ${bcTable(company,'Item')} i ON i.[No_]=l.[No_]
      WHERE l.[Document Type]=1 AND l.[Type]=2 AND l.[Quantity Shipped]=0 AND UPPER(i.[Inventory Posting Group])='JF-SAUSAGE'
        AND ISNULL(e.${extCol('Part No_')},'')<>'B'`);
    result.salesLines += updated.rowsAffected[0]; result.companies.push(company);
  }
  result.units = (await refreshUoms(companies)).count;
  return result;
}

export async function syncItemRules(companies = ALL_COMPANIES){return trackSync('BC item rules and barcodes',()=>syncItemRulesWork(companies));}
