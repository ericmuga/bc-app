import { db, sql } from '../db/pool.js';
import { ALL_COMPANIES } from '../services/bcTables.js';

export async function configuration() {
  const p = await db.getPool();
  const config = (await p.request().query('SELECT BypassAssignment,StockCompany,StockLocation FROM dbo.DispatchChillerConfig WHERE Id=1')).recordset[0];
  const mappings = (await p.request().query(`SELECT m.*,
    (SELECT r.Company,r.Barcode FROM dbo.DispatchItemRule r
      WHERE r.ItemNo=m.ItemNo AND NULLIF(LTRIM(RTRIM(r.Barcode)),'') IS NOT NULL
      ORDER BY r.Company FOR JSON PATH) BarcodeEntries,
    (SELECT u.Company,u.Uom,u.KgPerUom FROM dbo.DispatchItemUom u WHERE u.ItemNo=m.ItemNo
      AND u.KgPerUom>0 ORDER BY u.Company,u.Uom FOR JSON PATH) UnitEntries
    FROM dbo.DispatchItemChiller m ORDER BY m.Chiller,m.ItemNo`)).recordset
    .map(({BarcodeEntries,UnitEntries,...row})=>({...row,Barcodes:JSON.parse(BarcodeEntries||'[]'),UnitConversions:JSON.parse(UnitEntries||'[]')}));
  return { ...config, mappings, chillers: [...new Set(mappings.map(r => r.Chiller))] };
}

export async function saveConfiguration(body) {
  if (typeof body.BypassAssignment !== 'boolean' || !ALL_COMPANIES.includes(body.StockCompany) ||
      !String(body.StockLocation || '').trim() || String(body.StockLocation).length > 20) throw new Error('Valid bypass setting, stock company and location are required');
  const p = await db.getPool();
  await p.request().input('b', sql.Bit, body.BypassAssignment).input('c', sql.NVarChar(10), body.StockCompany)
    .input('l', sql.NVarChar(20), body.StockLocation.trim())
    .query('UPDATE dbo.DispatchChillerConfig SET BypassAssignment=@b,StockCompany=@c,StockLocation=@l WHERE Id=1');
  return { ok: true };
}

export async function saveMapping(body) {
  const item = String(body.ItemNo || '').trim().toUpperCase(), chiller = String(body.Chiller || '').trim().toUpperCase();
  if (!item || item.length > 30 || !chiller || chiller.length > 50) throw new Error('Item (max 30 characters) and chiller (max 50) are required');
  const p = await db.getPool();
  const rule = (await p.request().input('i',sql.NVarChar(30),item)
    .query("SELECT TOP 1 ItemNo FROM dbo.DispatchItemRule WHERE ItemNo=@i AND PostingGroup='JF-SAUSAGE'")).recordset[0];
  if (rule && chiller !== 'CHILLER U') throw new Error('JF-SAUSAGE items must remain in CHILLER U');
  await p.request().input('i', sql.NVarChar(30), item).input('c', sql.NVarChar(50), chiller)
    .input('d', sql.NVarChar(250), String(body.Description || '').slice(0, 250))
    .query(`MERGE dbo.DispatchItemChiller WITH (HOLDLOCK) AS t USING (SELECT @i ItemNo) s ON t.ItemNo=s.ItemNo
      WHEN MATCHED THEN UPDATE SET Chiller=@c,Description=@d
      WHEN NOT MATCHED THEN INSERT (ItemNo,Description,Chiller) VALUES (@i,@d,@c);`);
  return { ok: true };
}

export async function deleteMapping(item) {
  const p = await db.getPool();
  const rule = (await p.request().input('i',sql.NVarChar(30),item)
    .query("SELECT TOP 1 ItemNo FROM dbo.DispatchItemRule WHERE ItemNo=@i AND PostingGroup='JF-SAUSAGE'")).recordset[0];
  if (rule) throw new Error('JF-SAUSAGE items require the CHILLER U mapping');
  await p.request().input('i', sql.NVarChar(30), item).query('DELETE dbo.DispatchItemChiller WHERE ItemNo=@i');
  return { ok: true };
}

// One row per order line; unmapped lines remain visible instead of silently disappearing.
export async function worklist(user, { monitor = false, userId, status = 'pending' } = {}) {
  const p = await db.getPool();
  const config = await configuration();
  const elevated = ['admin', 'dispatch-supervisor'].includes(user.role);
  const r = p.request().input('uid', sql.NVarChar(100), String(elevated && userId ? userId : user.userId));
  const scope = status !== 'assembled' && !monitor && !config.BypassAssignment && (!elevated || userId) ? 'AND p.AssignedToUserId=@uid' : '';
  return (await r.query(`SELECT o.DispatchOrderId,o.DispatchNo,o.OrderNo,o.Company,o.CustomerNo,o.CustomerName,o.Status,
      CONVERT(char(10),o.ShipmentDate,23) ShipmentDate,
      l.LineId,l.ItemNo,l.Description,l.Part,l.OrderQty,l.Uom,l.IsWeighted,
      COALESCE(a.Chiller,r.Chiller,m.Chiller,'UNMAPPED') Chiller,a.AssembledQty,a.AssembledWeight,
      a.AssembledByName,a.AssembledAt,a.Pieces,a.BatchNo,CASE WHEN p.Assembled=1 OR a.Completed=1 THEN 1 ELSE 0 END Completed
    FROM dbo.DispatchOrder o JOIN dbo.DispatchOrderLine l ON l.DispatchOrderId=o.DispatchOrderId
    JOIN dbo.DispatchOrderPart p ON p.DispatchOrderId=l.DispatchOrderId AND p.Part=l.Part AND p.Active=1
    LEFT JOIN dbo.DispatchAssemblyLine a ON a.LineId=l.LineId
    LEFT JOIN dbo.DispatchItemRule r ON r.ItemNo=l.ItemNo AND r.Company=COALESCE(NULLIF(o.Company,''),'FCL')
    LEFT JOIN dbo.DispatchItemChiller m ON m.ItemNo=l.ItemNo
    WHERE o.Confirmed=1 AND o.Status IN ('confirmed','assigned','assembling','assembled','packing','packed','loaded') ${scope}
    ${monitor ? '' : status === 'assembled' ? `AND (p.Assembled=1 OR a.Completed=1) ${elevated && !userId ? '' : 'AND a.AssembledByUserId=@uid'}` : "AND o.Status IN ('confirmed','assigned','assembling') AND p.Assembled=0 AND ISNULL(a.Completed,0)=0"}
    ${monitor ? '' : "AND NOT EXISTS(SELECT 1 FROM dbo.DispatchOrderClaim claim WHERE claim.DispatchOrderId=o.DispatchOrderId AND (claim.UserId<>@uid OR claim.Stage<>'assembly'))"}
    ORDER BY Chiller,o.CreatedAt,o.DispatchNo,l.SortOrder`)).recordset;
}

export async function stockPosition(filters={}) {
  const p = await db.getPool();
  const rows = (await p.request().input('from',sql.Date,filters.dateFrom||null).input('to',sql.Date,filters.dateTo||null).query(`SELECT m.Company,m.LocationCode,m.Chiller,m.ItemNo,
    MAX(i.Description) Description,m.BaseUom Uom,-SUM(m.Quantity) OutQty,
    SUM(CASE WHEN m.Quantity<0 THEN -m.Quantity ELSE 0 END) IssuedQty,
    SUM(CASE WHEN m.Quantity>0 THEN m.Quantity ELSE 0 END) ReversedQty
    FROM dbo.DispatchChillerMovement m LEFT JOIN dbo.DispatchItemChiller i ON i.ItemNo=m.ItemNo
    WHERE m.Kind IN ('assembly','reassembly','reversal') AND (@from IS NULL OR DATEADD(HOUR,3,m.CreatedAt)>=@from) AND (@to IS NULL OR DATEADD(HOUR,3,m.CreatedAt)<DATEADD(DAY,1,@to))
    GROUP BY m.Company,m.LocationCode,m.Chiller,m.ItemNo,m.BaseUom ORDER BY m.Chiller,m.ItemNo`)).recordset;
  return {mode:'out-tray',asOf:new Date().toISOString(),rows};
}
