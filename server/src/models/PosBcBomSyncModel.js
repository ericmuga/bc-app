/**
 * models/PosBcBomSyncModel.js
 * BC → POS sync of (a) which Inventory Posting Groups belong in shops, and
 * (b) BC Production BOMs (+ their related items) into PosBom/PosBomLine, so BC is
 * the single source of truth. Synced items land in PosItem and therefore ride the
 * existing inventory-refresh (ledger pull / harmonize) jobs automatically.
 */
import { db as appDb, sql } from '../db/pool.js';
import { bcDb } from '../db/bcPool.js';
import { bcTable } from '../services/bcTables.js';
import logger from '../services/logger.js';

const appPool = () => appDb.getPool();
const up = (v) => String(v ?? '').trim();

// ── Inventory Posting Groups: BC list + which ones sync to shops ──────────────
export async function listBcInventoryPostingGroups(company = 'FCL') {
  const table = bcTable(company, 'Inventory Posting Group');
  const pool = await bcDb.getPool();
  const r = await pool.request().query(`SELECT [Code], [Description] FROM ${table} ORDER BY [Code]`);
  return r.recordset.map((x) => ({ code: up(x.Code), description: up(x.Description) }));
}

/** Merge the BC group list with the saved sync flags. */
export async function getInvPostingGroups(company = 'FCL') {
  const [bc, saved] = await Promise.all([
    listBcInventoryPostingGroups(company).catch(() => []),
    (async () => {
      const pool = await appPool();
      const r = await pool.request().query(`SELECT [Code],[Description],[SyncToShops] FROM [dbo].[PosSyncInvPostingGroup]`);
      return new Map(r.recordset.map((x) => [up(x.Code).toUpperCase(), { syncToShops: !!x.SyncToShops }]));
    })(),
  ]);
  return bc.map((g) => ({ ...g, syncToShops: saved.get(g.code.toUpperCase())?.syncToShops === true }));
}

/** Save the set of posting-group codes that should sync to shops. */
export async function saveInvPostingGroups(rows = []) {
  const pool = await appPool();
  for (const r of rows) {
    const code = up(r.code); if (!code) continue;
    await pool.request()
      .input('code', sql.NVarChar(50), code)
      .input('desc', sql.NVarChar(200), up(r.description) || null)
      .input('sync', sql.Bit, r.syncToShops === true ? 1 : 0)
      .query(`MERGE [dbo].[PosSyncInvPostingGroup] AS t USING (SELECT @code AS C) AS s ON t.[Code]=s.C
        WHEN MATCHED THEN UPDATE SET [Description]=@desc,[SyncToShops]=@sync,[UpdatedAt]=GETUTCDATE()
        WHEN NOT MATCHED THEN INSERT([Code],[Description],[SyncToShops]) VALUES(@code,@desc,@sync);`);
  }
  return getInvPostingGroups();
}

/** Codes flagged to sync (uppercase). */
async function enabledGroupCodes() {
  const pool = await appPool();
  const r = await pool.request().query(`SELECT [Code] FROM [dbo].[PosSyncInvPostingGroup] WHERE [SyncToShops]=1`);
  return r.recordset.map((x) => up(x.Code).toUpperCase());
}

// ── BC item reader (by No_, no PDA/price filter) + PosItem upsert ─────────────
async function bcItemsByNos(company, itemNos) {
  const uniq = [...new Set(itemNos.map((n) => up(n).toUpperCase()).filter(Boolean))];
  if (!uniq.length) return [];
  const itemTable = bcTable(company, 'Item');
  const iumTable  = bcTable(company, 'Item Unit of Measure');
  const pool = await bcDb.getPool();
  const req = pool.request();
  uniq.forEach((n, i) => req.input(`i${i}`, sql.NVarChar(30), n));
  const r = await req.query(`
    SELECT b.[No_] AS ItemNo, b.[Description] AS Description, b.[Inventory Posting Group] AS InvPostingGroup,
           b.[VAT Prod_ Posting Group] AS VatPostingGroup, ISNULL(b.[Price Includes VAT],0) AS PriceIncludesVat,
           b.[Unit Price] AS UnitPrice,
           COALESCE(NULLIF(LTRIM(RTRIM(b.[Sales Unit of Measure])),''), b.[Base Unit of Measure]) AS UnitOfMeasure,
           b.[Base Unit of Measure] AS BaseUnitOfMeasure, b.[Sales Unit of Measure] AS SalesUnitOfMeasure,
           ISNULL(NULLIF(ium.[Qty_ per Unit of Measure],0),1) AS QtyPerSalesUnit
    FROM ${itemTable} b
    LEFT JOIN ${iumTable} ium ON ium.[Item No_]=b.[No_]
         AND LTRIM(RTRIM(ium.[Code]))=LTRIM(RTRIM(COALESCE(NULLIF(LTRIM(RTRIM(b.[Sales Unit of Measure])),''),b.[Base Unit of Measure])))
    WHERE UPPER(b.[No_]) IN (${uniq.map((_, i) => `@i${i}`).join(',')})`);
  return r.recordset;
}

/** Upsert BC item rows into PosItem (base/sales UoM + factor, posting group, VAT). */
async function upsertPosItems(company, rows) {
  const pool = await appPool();
  let count = 0;
  for (const it of rows) {
    const itemNo = up(it.ItemNo).toUpperCase(); if (!itemNo) continue;
    const vpg = up(it.VatPostingGroup).toUpperCase();
    const ratePct = vpg === 'VAT16' ? 16 : 0;
    const taxType = vpg === 'VAT16' ? 'B' : 'A';
    const price = Number(it.UnitPrice || 0);
    const finalPrice = it.PriceIncludesVat ? price : Math.round(price * (1 + ratePct / 100) * 10000) / 10000;
    await pool.request()
      .input('itemNo', sql.NVarChar(30), itemNo)
      .input('description', sql.NVarChar(200), up(it.Description))
      .input('categoryCode', sql.NVarChar(50), up(it.InvPostingGroup).toUpperCase() || null)
      .input('unitPrice', sql.Decimal(18, 4), finalPrice)
      .input('unitOfMeasure', sql.NVarChar(20), up(it.UnitOfMeasure) || null)
      .input('baseUom', sql.NVarChar(20), up(it.BaseUnitOfMeasure) || null)
      .input('salesUom', sql.NVarChar(20), up(it.SalesUnitOfMeasure) || null)
      .input('qtyPer', sql.Decimal(18, 6), Number(it.QtyPerSalesUnit) || 1)
      .input('vpg', sql.NVarChar(50), vpg || null)
      .input('vatPct', sql.Decimal(8, 4), ratePct)
      .input('taxType', sql.NVarChar(10), taxType)
      .input('company', sql.NVarChar(20), String(company).toUpperCase())
      .query(`
        MERGE [dbo].[PosItem] AS t USING (SELECT @itemNo AS ItemNo) AS s ON t.[ItemNo]=s.ItemNo
        WHEN MATCHED THEN UPDATE SET
          [Description]=@description, [CategoryCode]=COALESCE(@categoryCode,[CategoryCode]),
          [UnitPrice]=CASE WHEN @unitPrice>0 THEN @unitPrice ELSE [UnitPrice] END,
          [UnitOfMeasure]=COALESCE(@unitOfMeasure,[UnitOfMeasure]),
          [BaseUnitOfMeasure]=@baseUom, [SalesUnitOfMeasure]=@salesUom, [QtyPerSalesUnit]=@qtyPer,
          [VatPostingGroup]=@vpg, [PriceIncludesVat]=1, [VatPercent]=@vatPct, [TaxType]=@taxType,
          [SourceCompany]=@company, [UpdatedAt]=GETUTCDATE()
        WHEN NOT MATCHED THEN INSERT
          ([ItemNo],[Description],[CategoryCode],[UnitPrice],[UnitOfMeasure],[BaseUnitOfMeasure],[SalesUnitOfMeasure],[QtyPerSalesUnit],
           [VatPostingGroup],[PriceIncludesVat],[VatPercent],[TaxType],[SourceCompany],[IsActive])
          VALUES (@itemNo,@description,@categoryCode,@unitPrice,@unitOfMeasure,@baseUom,@salesUom,@qtyPer,
                  @vpg,1,@vatPct,@taxType,@company,1);`);
    count++;
  }
  return count;
}

// ── BC Production BOMs ───────────────────────────────────────────────────────
/** The finished item a BOM produces (Item.[Production BOM No_] = bomNo, else No_=bomNo). */
async function resolveFinishedItem(company, bomNo) {
  const itemTable = bcTable(company, 'Item');
  const pool = await bcDb.getPool();
  const r = await pool.request().input('bom', sql.NVarChar(30), bomNo)
    .query(`SELECT TOP 1 [No_] AS ItemNo, [Description] AS Description, [Base Unit of Measure] AS BaseUom, [Inventory Posting Group] AS Ipg
            FROM ${itemTable} WHERE [Production BOM No_]=@bom
            UNION ALL
            SELECT [No_], [Description], [Base Unit of Measure], [Inventory Posting Group] FROM ${itemTable} WHERE [No_]=@bom`);
  return r.recordset[0] || null;
}

export async function getBcProductionBom(company, bomNo) {
  const H = bcTable(company, 'Production BOM Header');
  const L = bcTable(company, 'Production BOM Line');
  const pool = await bcDb.getPool();
  const h = (await pool.request().input('b', sql.NVarChar(30), bomNo)
    .query(`SELECT [No_] AS BomNo, [Description] AS BomDesc, [Unit of Measure Code] AS BomUom, [Status] AS BomStatus FROM ${H} WHERE [No_]=@b`)).recordset[0];
  if (!h) return null;
  const lines = (await pool.request().input('b', sql.NVarChar(30), bomNo)
    .query(`SELECT [Line No_] AS LnNo, [No_] AS CompNo, [Description] AS CompDesc,
                   [Quantity per] AS QtyPer, [Unit of Measure Code] AS LnUom
            FROM ${L} WHERE [Production BOM No_]=@b AND [Type]=1 AND [No_]<>'' ORDER BY [Line No_]`)).recordset;
  return { no: up(h.BomNo), description: up(h.BomDesc), uom: up(h.BomUom), status: Number(h.BomStatus),
    lines: lines.map((l) => ({ lineNo: l.LnNo, itemNo: up(l.CompNo).toUpperCase(), description: up(l.CompDesc), qtyPer: Number(l.QtyPer || 0), uom: up(l.LnUom) })) };
}

/** BC Production BOMs whose finished item is in an enabled posting group. */
export async function listBcProductionBoms(company = 'FCL') {
  const groups = await enabledGroupCodes();
  const H = bcTable(company, 'Production BOM Header');
  const I = bcTable(company, 'Item');
  const L = bcTable(company, 'Production BOM Line');
  const pool = await bcDb.getPool();
  const req = pool.request();
  let groupFilter = '';
  if (groups.length) { groups.forEach((g, i) => req.input(`g${i}`, sql.NVarChar(50), g)); groupFilter = `AND UPPER(i.[Inventory Posting Group]) IN (${groups.map((_, i) => `@g${i}`).join(',')})`; }
  const r = await req.query(`
    SELECT i.[Production BOM No_] AS BomNo, h.[Description] AS BomDesc, h.[Unit of Measure Code] AS BomUom, h.[Status] AS BomStatus,
           i.[No_] AS FinishedItemNo, i.[Description] AS FinishedDesc, i.[Inventory Posting Group] AS Ipg,
           (SELECT COUNT(*) FROM ${L} l WHERE l.[Production BOM No_]=i.[Production BOM No_] AND l.[Type]=1) AS LineCount
    FROM ${I} i JOIN ${H} h ON h.[No_]=i.[Production BOM No_]
    WHERE i.[Production BOM No_]<>'' ${groupFilter}
    ORDER BY i.[Inventory Posting Group], i.[No_]`);
  return r.recordset.map((x) => ({
    bomNo: up(x.BomNo), bomDesc: up(x.BomDesc), uom: up(x.BomUom), status: Number(x.BomStatus),
    finishedItemNo: up(x.FinishedItemNo), finishedDesc: up(x.FinishedDesc), ipg: up(x.Ipg), lineCount: Number(x.LineCount || 0),
  }));
}

/** Sync one BC BOM + its related items into PosItem/PosBom (BC overwrites). */
export async function syncBcBom(company, bomNo) {
  const bom = await getBcProductionBom(company, bomNo);
  if (!bom) throw new Error(`BC Production BOM ${bomNo} not found`);
  const finished = await resolveFinishedItem(company, bomNo);
  if (!finished) throw new Error(`No finished item linked to BOM ${bomNo} (set Production BOM No_ on the item in BC)`);
  const finishedNo = up(finished.ItemNo).toUpperCase();

  // 1) Bring in the related items (finished + components) so they exist in POS
  //    and ride the inventory-refresh jobs.
  const relatedNos = [finishedNo, ...bom.lines.map((l) => l.itemNo)];
  const bcItems = await bcItemsByNos(company, relatedNos);
  const itemsUpserted = await upsertPosItems(company, bcItems);

  // 2) Upsert the recipe (BC is the source of truth — replace lines).
  const outputUom = bom.uom || up(finished.BaseUom);
  const pool = await appPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const up1 = await new sql.Request(tx)
      .input('itemNo', sql.NVarChar(30), finishedNo)
      .input('outputUom', sql.NVarChar(20), outputUom || null)
      .input('desc', sql.NVarChar(200), up(bom.description) || null)
      .input('notes', sql.NVarChar(255), `BC Production BOM ${bomNo}`)
      .query(`MERGE [dbo].[PosBom] AS t USING (SELECT @itemNo AS ItemNo) AS s ON t.[ItemNo]=s.ItemNo
        WHEN MATCHED THEN UPDATE SET [IsActive]=1,[Description]=@desc,[Notes]=@notes,[OutputUom]=@outputUom,[UpdatedAt]=GETUTCDATE()
        WHEN NOT MATCHED THEN INSERT([ItemNo],[IsActive],[Description],[Notes],[OutputUom]) VALUES(@itemNo,1,@desc,@notes,@outputUom)
        OUTPUT INSERTED.[BomId];`);
    const bomId = up1.recordset[0].BomId;
    await new sql.Request(tx).input('bomId', sql.UniqueIdentifier, bomId)
      .query(`DELETE FROM [dbo].[PosBomLine] WHERE [BomId]=@bomId`);
    let seq = 0;
    for (const l of bom.lines) {
      await new sql.Request(tx)
        .input('bomId', sql.UniqueIdentifier, bomId)
        .input('comp', sql.NVarChar(30), l.itemNo)
        .input('desc', sql.NVarChar(200), l.description || null)
        .input('qty', sql.Decimal(18, 4), l.qtyPer)
        .input('uom', sql.NVarChar(20), l.uom || null)
        .input('sort', sql.Int, seq++)
        .query(`INSERT INTO [dbo].[PosBomLine] ([BomId],[ComponentItemNo],[Description],[QtyPer],[Uom],[SortOrder])
          VALUES (@bomId,@comp,@desc,@qty,@uom,@sort)`);
    }
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }

  logger.info('syncBcBom', { company, bomNo, finishedItemNo: finishedNo, itemsUpserted, lines: bom.lines.length });
  return { bomNo, finishedItemNo: finishedNo, itemsUpserted, lines: bom.lines.length };
}

/** Sync every BC BOM whose finished item is in an enabled posting group. */
export async function syncBcBomsByGroups(company = 'FCL') {
  const boms = await listBcProductionBoms(company);
  let synced = 0, items = 0; const results = [];
  for (const b of boms) {
    try { const r = await syncBcBom(company, b.bomNo); synced++; items += r.itemsUpserted; results.push({ bomNo: b.bomNo, finishedItemNo: r.finishedItemNo, lines: r.lines }); }
    catch (e) { results.push({ bomNo: b.bomNo, error: e.message }); }
  }
  logger.info('syncBcBomsByGroups', { company, boms: boms.length, synced, items });
  return { boms: boms.length, synced, itemsUpserted: items, results };
}
