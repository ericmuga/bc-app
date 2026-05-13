/**
 * models/PosTargetModel.js
 * Per-shop per-day per-item sales targets with copy-from-previous and bulk import.
 *
 * Achievement view joins to PosOrderLine + PosManualSale within the target date for actuals.
 */
import { db as appDb, sql } from '../db/pool.js';

function str(v, max = 200) { return String(v ?? '').trim().slice(0, max); }
function num(v) { return isNaN(Number(v)) ? 0 : Number(v); }
async function appPool() { return appDb.getPool(); }

/** Idempotent table create — invoked by ensurePosItemColumns at boot. */
export async function ensureTargetTable(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosTarget' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosTarget] (
      [TargetId]    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [ShopCode]    NVARCHAR(50)     NOT NULL,
      [TargetDate]  DATE             NOT NULL,
      [ItemNo]      NVARCHAR(30)     NOT NULL,
      [Description] NVARCHAR(200)    NULL,
      [TargetQty]   DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [TargetValue] DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [Notes]       NVARCHAR(500)    NULL,
      [CreatedBy]   NVARCHAR(200)    NULL,
      [ModifiedBy]  NVARCHAR(200)    NULL,
      [CreatedAt]   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [UQ_PosTarget_Shop_Date_Item] UNIQUE ([ShopCode],[TargetDate],[ItemNo])
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PosTarget_Shop_Date'
                   AND object_id=OBJECT_ID('[dbo].[PosTarget]'))
      CREATE INDEX [IX_PosTarget_Shop_Date] ON [dbo].[PosTarget]([ShopCode],[TargetDate])
  `);
}

export async function listTargets({ shopCode, dateFrom, dateTo, itemNo = null }) {
  if (!shopCode) throw new Error('shopCode required');
  const pool = await appPool();
  const r = pool.request().input('shop', sql.NVarChar(50), shopCode.toUpperCase())
                          .input('df',   sql.Date, dateFrom)
                          .input('dt',   sql.Date, dateTo);
  let where = '[ShopCode]=@shop AND [TargetDate] BETWEEN @df AND @dt';
  if (itemNo) { r.input('item', sql.NVarChar(30), itemNo.toUpperCase()); where += ' AND [ItemNo]=@item'; }
  const res = await r.query(`
    SELECT t.*, pi.[UnitPrice]
    FROM [dbo].[PosTarget] t
    LEFT JOIN [dbo].[PosItem] pi ON pi.[ItemNo] = t.[ItemNo]
    WHERE ${where}
    ORDER BY [TargetDate] DESC, [ItemNo]
  `);
  return res.recordset;
}

export async function saveTarget({ targetId, shopCode, targetDate, itemNo, description, targetQty,
                                   targetValue, notes, modifiedBy }) {
  if (!shopCode || !targetDate || !itemNo) throw new Error('shopCode, targetDate, itemNo required');
  const pool = await appPool();
  const req = pool.request()
    .input('shopCode',    sql.NVarChar(50),  shopCode.toUpperCase())
    .input('targetDate',  sql.Date,          targetDate)
    .input('itemNo',      sql.NVarChar(30),  itemNo.toUpperCase())
    .input('description', sql.NVarChar(200), str(description))
    .input('targetQty',   sql.Decimal(18,4), num(targetQty))
    .input('targetValue', sql.Decimal(18,4), num(targetValue))
    .input('notes',       sql.NVarChar(500), str(notes, 500) || null)
    .input('modifiedBy',  sql.NVarChar(200), str(modifiedBy, 200) || null);
  if (targetId) {
    req.input('id', sql.UniqueIdentifier, targetId);
    await req.query(`
      UPDATE [dbo].[PosTarget]
      SET [Description]=@description,[TargetQty]=@targetQty,[TargetValue]=@targetValue,
          [Notes]=@notes,[ModifiedBy]=@modifiedBy,[UpdatedAt]=GETUTCDATE()
      WHERE [TargetId]=@id
    `);
    return targetId;
  }
  // UPSERT on (ShopCode, TargetDate, ItemNo)
  const r = await req.query(`
    MERGE [dbo].[PosTarget] AS t
    USING (SELECT @shopCode AS ShopCode, @targetDate AS TargetDate, @itemNo AS ItemNo) AS s
      ON  t.[ShopCode] = s.ShopCode AND t.[TargetDate] = s.TargetDate AND t.[ItemNo] = s.ItemNo
    WHEN MATCHED THEN UPDATE SET
      [Description]=@description,[TargetQty]=@targetQty,[TargetValue]=@targetValue,
      [Notes]=@notes,[ModifiedBy]=@modifiedBy,[UpdatedAt]=GETUTCDATE()
    WHEN NOT MATCHED THEN INSERT
      ([ShopCode],[TargetDate],[ItemNo],[Description],[TargetQty],[TargetValue],[Notes],[CreatedBy])
      VALUES (@shopCode,@targetDate,@itemNo,@description,@targetQty,@targetValue,@notes,@modifiedBy)
    OUTPUT inserted.[TargetId];
  `);
  return r.recordset[0]?.TargetId;
}

export async function deleteTarget(targetId) {
  const pool = await appPool();
  await pool.request().input('id', sql.UniqueIdentifier, targetId)
    .query(`DELETE FROM [dbo].[PosTarget] WHERE [TargetId]=@id`);
}

/**
 * Bulk upsert. Returns { posted, failed, errors[] }.
 * Each line: { itemNo, description?, targetQty, targetValue?, notes? }
 * targetValue defaults to PosItem.UnitPrice × targetQty if missing.
 */
export async function saveTargetsBatch({ shopCode, targetDate, lines, createdBy }) {
  if (!shopCode || !targetDate) throw new Error('shopCode, targetDate required');
  if (!Array.isArray(lines) || !lines.length) throw new Error('lines required');
  const pool = await appPool();

  // Pre-fetch unit prices for any line missing targetValue.
  const itemNos = [...new Set(lines.map(l => String(l.itemNo || '').toUpperCase()).filter(Boolean))];
  const priceMap = new Map();
  if (itemNos.length) {
    const r = pool.request();
    itemNos.forEach((no, i) => r.input(`i${i}`, sql.NVarChar(30), no));
    const inList = itemNos.map((_, i) => `@i${i}`).join(',');
    const res = await r.query(`SELECT [ItemNo],[UnitPrice],[Description] FROM [dbo].[PosItem] WHERE [ItemNo] IN (${inList})`);
    for (const row of res.recordset) priceMap.set(row.ItemNo, row);
  }

  const out = { posted: 0, failed: 0, errors: [] };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    try {
      const itemNo = String(ln.itemNo || '').trim().toUpperCase();
      if (!itemNo) throw new Error('itemNo required');
      const meta = priceMap.get(itemNo);
      const qty  = num(ln.targetQty);
      const val  = ln.targetValue != null && ln.targetValue !== ''
        ? num(ln.targetValue)
        : Math.round(qty * num(meta?.UnitPrice ?? 0) * 100) / 100;
      await saveTarget({
        targetId:    null,
        shopCode, targetDate,
        itemNo,
        description: ln.description || meta?.Description || itemNo,
        targetQty:   qty,
        targetValue: val,
        notes:       ln.notes || null,
        modifiedBy:  createdBy,
      });
      out.posted += 1;
    } catch (e) {
      out.failed += 1;
      out.errors.push({ row: i + 1, itemNo: ln.itemNo || '', error: e.message });
    }
  }
  return out;
}

/** Copy targets from one date to another (replaces existing rows on the destination date). */
export async function copyTargets({ shopCode, fromDate, toDate, createdBy }) {
  if (!shopCode || !fromDate || !toDate) throw new Error('shopCode, fromDate, toDate required');
  const pool = await appPool();
  const src = await pool.request()
    .input('shop', sql.NVarChar(50), shopCode.toUpperCase())
    .input('from', sql.Date, fromDate)
    .query(`SELECT [ItemNo],[Description],[TargetQty],[TargetValue],[Notes]
            FROM [dbo].[PosTarget] WHERE [ShopCode]=@shop AND [TargetDate]=@from`);
  if (!src.recordset.length) return { copied: 0 };

  for (const row of src.recordset) {
    await saveTarget({
      targetId: null, shopCode, targetDate: toDate,
      itemNo: row.ItemNo, description: row.Description,
      targetQty: Number(row.TargetQty), targetValue: Number(row.TargetValue),
      notes: row.Notes, modifiedBy: createdBy,
    });
  }
  return { copied: src.recordset.length };
}

/** Achievement vs sales — compares each target row against actual POS + manual sales for the date. */
export async function achievementReport({ shopCode, dateFrom, dateTo }) {
  if (!shopCode || !dateFrom || !dateTo) throw new Error('shopCode, dateFrom, dateTo required');
  const pool = await appPool();
  const r = await pool.request()
    .input('shop', sql.NVarChar(50), shopCode.toUpperCase())
    .input('df',   sql.Date, dateFrom)
    .input('dt',   sql.Date, dateTo)
    .query(`
      WITH SalesAgg AS (
        SELECT CAST(o.[CreatedAt] AS DATE) AS [Date], ol.[ItemNo],
               SUM(ol.[Quantity])   AS Qty,
               SUM(ol.[LineAmount]) AS Value
        FROM [dbo].[PosOrderLine] ol
        JOIN [dbo].[PosOrder]    o ON o.[OrderId] = ol.[OrderId]
        WHERE o.[Status] = 'paid' AND o.[ShopCode]=@shop
          AND CAST(o.[CreatedAt] AS DATE) BETWEEN @df AND @dt
        GROUP BY CAST(o.[CreatedAt] AS DATE), ol.[ItemNo]
        UNION ALL
        SELECT ms.[SaleDate] AS [Date], ms.[ItemNo],
               SUM(ms.[Quantity])    AS Qty,
               SUM(ms.[TotalAmount]) AS Value
        FROM [dbo].[PosManualSale] ms
        WHERE ms.[ShopCode]=@shop AND ms.[SaleDate] BETWEEN @df AND @dt
        GROUP BY ms.[SaleDate], ms.[ItemNo]
      ),
      Combined AS (
        SELECT [Date],[ItemNo], SUM(Qty) AS Qty, SUM(Value) AS Value FROM SalesAgg GROUP BY [Date],[ItemNo]
      )
      SELECT t.[TargetDate],t.[ShopCode],t.[ItemNo],
             COALESCE(t.[Description], pi.[Description]) AS Description,
             t.[TargetQty], t.[TargetValue],
             ISNULL(c.Qty,   0) AS ActualQty,
             ISNULL(c.Value, 0) AS ActualValue
      FROM [dbo].[PosTarget] t
      LEFT JOIN Combined c ON c.[Date] = t.[TargetDate] AND c.[ItemNo] = t.[ItemNo]
      LEFT JOIN [dbo].[PosItem] pi ON pi.[ItemNo] = t.[ItemNo]
      WHERE t.[ShopCode]=@shop AND t.[TargetDate] BETWEEN @df AND @dt
      ORDER BY t.[TargetDate] DESC, COALESCE(t.[Description], pi.[Description], t.[ItemNo])
    `);
  return r.recordset.map(row => ({
    targetDate:  row.TargetDate,
    shopCode:    row.ShopCode,
    itemNo:      row.ItemNo,
    description: row.Description || row.ItemNo,
    targetQty:   Number(row.TargetQty || 0),
    targetValue: Number(row.TargetValue || 0),
    actualQty:   Number(row.ActualQty || 0),
    actualValue: Number(row.ActualValue || 0),
    achievementQty:   row.TargetQty   > 0 ? Math.round((row.ActualQty   / row.TargetQty)   * 10000) / 100 : 0,
    achievementValue: row.TargetValue > 0 ? Math.round((row.ActualValue / row.TargetValue) * 10000) / 100 : 0,
  }));
}
