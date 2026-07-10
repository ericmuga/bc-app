/**
 * models/PosModel.js
 * POS module — app-DB CRUD for categories, items, payment types, orders, payments.
 * BC queries for listing PDA items available to add to the POS catalogue.
 */
import { db as appDb, sql } from '../db/pool.js';
import { bcDb } from '../db/bcPool.js';
import { bcTable, extCol, resolveCompanies, ALL_COMPANIES } from '../services/bcTables.js';
import logger from '../services/logger.js';
import bcrypt from 'bcryptjs';

// ── Helpers ───────────────────────────────────────────────────────────────────

function str(v, max = 200) { return String(v ?? '').trim().slice(0, max); }
function num(v) { return isNaN(Number(v)) ? 0 : Number(v); }
function bool(v) { return v === true || v === 1 || v === '1' || v === 'true'; }

async function appPool() { return appDb.getPool(); }

async function columnExists(pool, tableName, columnName) {
  const r = await pool.request()
    .input('tableName', sql.NVarChar(128), tableName)
    .input('columnName', sql.NVarChar(128), columnName)
    .query(`
      SELECT 1 AS ok
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.' + @tableName)
        AND name = @columnName
    `);
  return r.recordset.length > 0;
}

// ── PosCategory ───────────────────────────────────────────────────────────────

export async function listCategories({ withItemsOnly = false } = {}) {
  const pool = await appPool();
  const where = withItemsOnly
    ? `WHERE EXISTS (
         SELECT 1 FROM [dbo].[PosItem] pi
         WHERE pi.[CategoryCode] = c.[Code] AND pi.[IsActive] = 1
       )`
    : '';
  const r = await pool.request().query(`
    SELECT c.[CategoryId],c.[Code],c.[Name],c.[SortOrder],c.[IsActive],c.[CreatedAt],c.[UpdatedAt]
    FROM   [dbo].[PosCategory] c
    ${where}
    ORDER BY c.[SortOrder], c.[Name]
  `);
  return r.recordset;
}

export async function saveCategory({ categoryId, code, name, sortOrder = 0, isActive = true }) {
  const pool = await appPool();
  const req = pool.request()
    .input('code',      sql.NVarChar(50),  str(code, 50).toUpperCase())
    .input('name',      sql.NVarChar(200), str(name))
    .input('sortOrder', sql.Int,           num(sortOrder))
    .input('isActive',  sql.Bit,           bool(isActive) ? 1 : 0);

  if (categoryId) {
    req.input('categoryId', sql.UniqueIdentifier, categoryId);
    await req.query(`
      UPDATE [dbo].[PosCategory]
      SET [Code]=@code,[Name]=@name,[SortOrder]=@sortOrder,[IsActive]=@isActive,[UpdatedAt]=GETUTCDATE()
      WHERE [CategoryId]=@categoryId
    `);
    return categoryId;
  }
  const result = await req.query(`
    INSERT INTO [dbo].[PosCategory]([Code],[Name],[SortOrder],[IsActive])
    OUTPUT INSERTED.[CategoryId]
    VALUES(@code,@name,@sortOrder,@isActive)
  `);
  return result.recordset[0].CategoryId;
}

export async function deleteCategory(categoryId) {
  const pool = await appPool();
  await pool.request()
    .input('categoryId', sql.UniqueIdentifier, categoryId)
    .query(`DELETE FROM [dbo].[PosCategory] WHERE [CategoryId]=@categoryId`);
}

// ── PosItem ───────────────────────────────────────────────────────────────────

// Pagination helper: returns sanitised page/pageSize/offset.
// pageSize is clamped to [1,500]; pass pageSize falsy to disable paging.
function pageArgs({ page, pageSize } = {}) {
  if (!pageSize) return null;
  const ps = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 500);
  const p  = Math.max(parseInt(page, 10) || 1, 1);
  return { page: p, pageSize: ps, offset: (p - 1) * ps };
}

/**
 * List PosItem rows. When { pageSize } is given returns
 * { rows, total, page, pageSize }; otherwise returns the full array (back-compat).
 * @param {Object} [opts] { page, pageSize, q }
 */
export async function listPosItems(opts = {}) {
  const pool = await appPool();
  const cols = `[ItemId],[ItemNo],[Description],[CategoryCode],[UnitPrice],[Barcode],
           [ImageUrl],[IsActive],[SortOrder],[CreatedAt],[UpdatedAt],
           [EtimsItemCode],[EtimsItemClassCode],[TaxType],[UnitOfMeasure],
           [VatPostingGroup],[VatPercent],[PackagingUnit],[QuantityUnit]`;
  const req = pool.request();
  let where = '';
  if (opts.q) {
    req.input('q', sql.NVarChar(200), `%${opts.q}%`);
    where = `WHERE [ItemNo] LIKE @q OR [Description] LIKE @q OR [Barcode] LIKE @q`;
  }
  const pg = pageArgs(opts);
  if (!pg) {
    const r = await req.query(`SELECT ${cols} FROM [dbo].[PosItem] ${where} ORDER BY [SortOrder],[Description]`);
    return r.recordset;
  }
  const cnt = await req.query(`SELECT COUNT(*) AS n FROM [dbo].[PosItem] ${where}`);
  req.input('off', sql.Int, pg.offset).input('lim', sql.Int, pg.pageSize);
  const r = await req.query(`
    SELECT ${cols} FROM [dbo].[PosItem] ${where}
    ORDER BY [SortOrder],[Description]
    OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY`);
  return { rows: r.recordset, total: cnt.recordset[0].n, page: pg.page, pageSize: pg.pageSize };
}

export async function listPosItemsGrouped({ shopCode = null, userId = null } = {}) {
  const pool = await appPool();

  // Resolve the shop's LocationCode (we keep stock at the location, not the shop).
  let locationCode = null;
  if (shopCode) {
    const locR = await pool.request()
      .input('code', sql.NVarChar(50), shopCode.toUpperCase())
      .query(`SELECT [LocationCode] FROM [dbo].[PosShop] WHERE [Code]=@code`);
    locationCode = locR.recordset[0]?.LocationCode?.trim() || null;
  }

  // Read the inventory display config (hide out-of-stock items)
  const cfg = await getInventoryConfig();
  const hideOutOfStock = !!cfg.hideOutOfStock;

  const req  = pool.request();
  if (shopCode)     req.input('shopCode', sql.NVarChar(50), shopCode.toUpperCase());
  if (locationCode) req.input('loc',      sql.NVarChar(20), locationCode.toUpperCase());
  if (userId)       req.input('userId',   sql.UniqueIdentifier, userId);

  // Active special price subquery: matches by item, optionally by shop, within date range.
  // Picks the most specific match (shop-specific beats global).
  const r = await req.query(`
    WITH ActivePrice AS (
      SELECT sp.[ItemNo],
             sp.[UnitPrice],
             sp.[Description],
             ROW_NUMBER() OVER (
               PARTITION BY sp.[ItemNo]
               ORDER BY CASE WHEN sp.[ShopCode] IS NULL THEN 1 ELSE 0 END,
                        sp.[StartingDate] DESC
             ) AS rn
      FROM [dbo].[PosSpecialPrice] sp
      WHERE sp.[IsActive] = 1
        AND sp.[StartingDate] <= CAST(GETDATE() AS DATE)
        AND (sp.[EndingDate] IS NULL OR sp.[EndingDate] >= CAST(GETDATE() AS DATE))
        ${shopCode ? "AND (sp.[ShopCode] IS NULL OR sp.[ShopCode] = @shopCode)" : "AND sp.[ShopCode] IS NULL"}
    )
    ${
      locationCode
        ? `, OnHandLoc AS (
             SELECT m.[ItemNo], SUM(m.[Quantity]) AS Qty
             FROM   [dbo].[PosStockMovement] m
             JOIN   [dbo].[PosShop] s ON s.[Code] = m.[ShopCode]
             WHERE  s.[LocationCode] = @loc
             GROUP BY m.[ItemNo]
           )`
        : (shopCode
            ? `, OnHandLoc AS (
                 SELECT m.[ItemNo], SUM(m.[Quantity]) AS Qty
                 FROM   [dbo].[PosStockMovement] m
                 WHERE  m.[ShopCode] = @shopCode
                 GROUP BY m.[ItemNo]
               )`
            : `, OnHandLoc AS (SELECT CAST(NULL AS NVARCHAR(30)) AS [ItemNo], CAST(0 AS DECIMAL(18,4)) AS Qty WHERE 1=0)`)
    }
    SELECT i.[ItemId],i.[ItemNo],i.[Description],i.[CategoryCode],
           c.[Name] AS CategoryName, i.[UnitPrice] AS BasePrice,
           ap.[UnitPrice] AS OfferPrice,
           ap.[Description] AS OfferDescription,
           i.[Barcode],i.[ImageUrl],
           i.[SortOrder],
           i.[EtimsItemCode],i.[EtimsItemClassCode],i.[TaxType],i.[UnitOfMeasure],
           ISNULL(oh.[Qty], 0) AS OnHand
           ${userId ? `, CASE WHEN f.[FavouriteId] IS NULL THEN 0 ELSE 1 END AS IsFavourite` : ', 0 AS IsFavourite'}
    FROM [dbo].[PosItem] i
    LEFT JOIN [dbo].[PosCategory] c  ON c.[Code]   = i.[CategoryCode]
    LEFT JOIN ActivePrice ap         ON ap.[ItemNo] = i.[ItemNo] AND ap.rn = 1
    LEFT JOIN OnHandLoc oh           ON oh.[ItemNo] = i.[ItemNo]
    ${userId ? 'LEFT JOIN [dbo].[PosFavourite] f ON f.[ItemNo] = i.[ItemNo] AND f.[UserId] = @userId' : ''}
    WHERE i.[IsActive]=1
      ${hideOutOfStock && (locationCode || shopCode) ? 'AND ISNULL(oh.[Qty], 0) > 0' : ''}
    ORDER BY i.[SortOrder],i.[Description]
  `);
  const items = r.recordset;

  const catMap = new Map();
  const favItems = [];
  catMap.set('__uncategorised__', { code: '', name: 'Uncategorised', items: [] });
  for (const item of items) {
    const offer    = item.OfferPrice != null ? Number(item.OfferPrice) : null;
    const base     = Number(item.BasePrice);
    const effective = offer != null ? offer : base;
    const mapped = {
      itemId:             item.ItemId,
      itemNo:             item.ItemNo,
      description:        item.Description,
      unitPrice:          effective,
      basePrice:          base,
      offerPrice:         offer,
      offerDescription:   item.OfferDescription || '',
      barcode:            item.Barcode || '',
      imageUrl:           item.ImageUrl || '',
      etimsItemCode:      item.EtimsItemCode || '',
      etimsItemClassCode: item.EtimsItemClassCode || '',
      taxType:            item.TaxType || '',
      unitOfMeasure:      item.UnitOfMeasure || '',
      remaining:          Number(item.OnHand || 0),
      isFavourite:        Boolean(item.IsFavourite),
    };
    const key = item.CategoryCode || '__uncategorised__';
    if (!catMap.has(key)) {
      catMap.set(key, { code: item.CategoryCode, name: item.CategoryName || item.CategoryCode, items: [] });
    }
    catMap.get(key).items.push(mapped);
    if (mapped.isFavourite) favItems.push(mapped);
  }

  const result = [...catMap.values()].filter(c => c.items.length > 0);
  // Prepend favourites virtual category if the user has any
  if (favItems.length) {
    result.unshift({ code: '__favourites__', name: '★ Favourites', items: favItems });
  }
  return result;
}

export async function savePosItem({ itemId, itemNo, description, categoryCode, unitPrice, barcode, imageUrl, isActive = true, sortOrder = 0,
                                    etimsItemCode = null, etimsItemClassCode = null, taxType = null, unitOfMeasure = null }) {
  const pool = await appPool();
  const req = pool.request()
    .input('itemNo',             sql.NVarChar(30),   str(itemNo, 30).toUpperCase())
    .input('description',        sql.NVarChar(200),  str(description))
    .input('categoryCode',       sql.NVarChar(50),   str(categoryCode, 50).toUpperCase() || null)
    .input('unitPrice',          sql.Decimal(18, 4), num(unitPrice))
    .input('barcode',            sql.NVarChar(100),  str(barcode, 100) || null)
    .input('imageUrl',           sql.NVarChar(500),  str(imageUrl, 500) || null)
    .input('isActive',           sql.Bit,            bool(isActive) ? 1 : 0)
    .input('sortOrder',          sql.Int,            num(sortOrder))
    .input('etimsItemCode',      sql.NVarChar(50),   str(etimsItemCode, 50) || null)
    .input('etimsItemClassCode', sql.NVarChar(50),   str(etimsItemClassCode, 50) || null)
    .input('taxType',            sql.NVarChar(10),   str(taxType, 10) || null)
    .input('unitOfMeasure',      sql.NVarChar(20),   str(unitOfMeasure, 20) || null);

  if (itemId) {
    req.input('itemId', sql.UniqueIdentifier, itemId);
    await req.query(`
      UPDATE [dbo].[PosItem]
      SET [ItemNo]=@itemNo,[Description]=@description,[CategoryCode]=@categoryCode,
          [UnitPrice]=@unitPrice,[Barcode]=@barcode,[ImageUrl]=@imageUrl,
          [IsActive]=@isActive,[SortOrder]=@sortOrder,
          [EtimsItemCode]=@etimsItemCode,[EtimsItemClassCode]=@etimsItemClassCode,
          [TaxType]=@taxType,[UnitOfMeasure]=@unitOfMeasure,
          [UpdatedAt]=GETUTCDATE()
      WHERE [ItemId]=@itemId
    `);
    return itemId;
  }
  const result = await req.query(`
    INSERT INTO [dbo].[PosItem]([ItemNo],[Description],[CategoryCode],[UnitPrice],[Barcode],[ImageUrl],[IsActive],[SortOrder],
                                [EtimsItemCode],[EtimsItemClassCode],[TaxType],[UnitOfMeasure])
    OUTPUT INSERTED.[ItemId]
    VALUES(@itemNo,@description,@categoryCode,@unitPrice,@barcode,@imageUrl,@isActive,@sortOrder,
           @etimsItemCode,@etimsItemClassCode,@taxType,@unitOfMeasure)
  `);
  return result.recordset[0].ItemId;
}

export async function deletePosItem(itemId) {
  const pool = await appPool();
  await pool.request()
    .input('itemId', sql.UniqueIdentifier, itemId)
    .query(`DELETE FROM [dbo].[PosItem] WHERE [ItemId]=@itemId`);
}

// ── BC Shop Payment Types ─────────────────────────────────────────────────────
// Custom extension table at [dbo].[{prefix}$Shop Payment Types$<EXT_GUID>]
// Payment Type enum: 0=Cash, 1=Card, 2=Bank Transfer, 3=Mobile Money, 4=Cheque, 5=Credit

const BC_PAY_TYPE_TO_CLASS = ['Cash', 'Card', 'BankTransfer', 'Mobile', 'Credit', 'Credit'];

export async function listBcShopPaymentTypes(companyId = 'FCL') {
  const resolved = resolveCompanies([companyId]);
  const c = resolved[0] || 'FCL';
  const sptTable = bcTable(c, 'Shop Payment Types', { ext: true });
  const pool = await bcDb.getPool();
  const querySql = `
    SELECT
      [No_]                  AS Code,
      [Shop Customer No_]    AS ShopCustomerNo,
      [Payment Type]         AS PaymentTypeIdx,
      [Payment Method Code]  AS PaymentMethodCode,
      [Use API Endpoint]     AS UseApiEndpoint,
      [API Endpoint]         AS ApiEndpoint,
      [Balance Account Type] AS BalanceAcctType,
      [Balance Account No_]  AS BalanceAcctNo,
      [Default]              AS IsDefault
    FROM ${sptTable}
    ORDER BY [Shop Customer No_], [No_]
  `;
  logger.info('pos/listBcShopPaymentTypes', { company: c });
  const result = await pool.request().query(querySql);
  return result.recordset.map(r => ({
    code:              r.Code?.trim() ?? '',
    shopCustomerNo:    r.ShopCustomerNo?.trim() ?? '',
    paymentClass:      BC_PAY_TYPE_TO_CLASS[Number(r.PaymentTypeIdx)] || 'Cash',
    paymentMethodCode: r.PaymentMethodCode?.trim() ?? '',
    useApiEndpoint:    Boolean(r.UseApiEndpoint),
    apiEndpoint:       r.ApiEndpoint?.trim() ?? '',
    balanceAcctType:   ['G/L Account', 'Bank Account'][Number(r.BalanceAcctType)] || '',
    balanceAcctNo:     r.BalanceAcctNo?.trim() ?? '',
    isDefault:         Boolean(r.IsDefault),
  }));
}

// ── BC shop salespersons ──────────────────────────────────────────────────────
// A "shop" = a Salesperson_Purchaser whose Name contains 'SHOP' and is not blocked.
// The ext table CustomerNo field is the walk-in customer for that shop.

export async function listBcShopSalespersons(companyId = 'FCL') {
  // The source of truth for shops is now the BC Customer table — every customer
  // in the 'FCL SHOPS' price group is one POS shop. We expose the same shape as
  // before (code/name/walkInCustomerNo/defaultLocation/...) so downstream
  // iterators (walk-ins, contacts) keep working without changes.
  //
  // Mapping:
  //   PosShop.Code            ← Customer.[Salesperson Code]  (or fallback to No_)
  //   PosShop.Name            ← Customer.[Name]
  //   PosShop.WalkInCustomerNo← Customer.[No_]
  //   PosShop.LocationCode    ← Customer.[Location Code]
  //   PosShop.SalespersonCode ← Customer.[Salesperson Code]
  //   PosShop.VatBusPostingGroup ← Customer.[VAT Bus_ Posting Group]
  //   PosShop.Email           ← Customer.[E-Mail]
  const resolved = resolveCompanies([companyId]);
  const c = resolved[0] || 'FCL';
  const custTable  = bcTable(c, 'Customer');
  const spExtTable = bcTable(c, 'Salesperson_Purchaser', { coreExt: true });

  // Per-company filter rule. BC tenants use different fields to tag a
  // customer as a "shop":
  //    FCL  → [Customer Price Group]   = 'FCL SHOPS'
  //    CM   → [Customer Posting Group] = 'FCL SHOPS'
  // Any other company returns an empty list unless an env override is set:
  //    BC_SHOP_FILTER_<COMPANY>="<column>=<value>"
  // e.g.  BC_SHOP_FILTER_RMK="Customer Posting Group=RMK SHOPS"
  const defaults = {
    FCL: { column: 'Customer Price Group',   value: 'FCL SHOPS' },
    CM:  { column: 'Customer Posting Group', value: 'FCL SHOPS' },
  };
  const envKey  = `BC_SHOP_FILTER_${(companyId || c).toUpperCase()}`;
  const envVal  = process.env[envKey] || '';
  let rule = defaults[c.toUpperCase()] || null;
  if (envVal && envVal.includes('=')) {
    const [col, ...rest] = envVal.split('=');
    rule = { column: col.trim(), value: rest.join('=').trim() };
  }
  if (!rule) {
    logger.info('pos/listBcShopSalespersons: no filter rule for company, skipping', { company: c });
    return [];
  }
  const filterCol = rule.column.replace(/[^A-Za-z0-9 _%]/g, '');
  const filterVal = rule.value.replace(/'/g, "''");

  const pool = await bcDb.getPool();
  const querySql = `
    SELECT
      cu.[No_]                       AS WalkInCustomerNo,
      cu.[Name]                      AS Name,
      cu.[Salesperson Code]          AS SalespersonCode,
      cu.[Location Code]             AS LocationCode,
      cu.[VAT Bus_ Posting Group]    AS VatBusPostingGroup,
      cu.[E-Mail]                    AS Email,
      sx.${extCol('Default Location')}  AS SpDefaultLocation,
      sx.${extCol('Current Route')}     AS CurrentRoute,
      sx.${extCol('TPT Location Code')} AS TptLocationCode
    FROM   ${custTable} cu
    LEFT JOIN ${spExtTable} sx ON sx.[Code] = cu.[Salesperson Code]
    WHERE  cu.[${filterCol}] = '${filterVal}'
      AND  ISNULL(cu.[Blocked], 0) = 0
    ORDER BY cu.[Name]
  `;
  logger.info('pos/listBcShopSalespersons', { company: c, filterCol, filterVal });
  const result = await pool.request().query(querySql);
  logger.info('pos/listBcShopSalespersons: rows', { company: c, count: result.recordset.length });
  return result.recordset.map(r => {
    const sp   = r.SalespersonCode?.trim() ?? '';
    const cust = r.WalkInCustomerNo?.trim() ?? '';
    // Use the salesperson code as our PosShop.Code when present; otherwise the
    // customer No. (keeps backward-compat with shops imported via the old query)
    const code = sp || cust;
    return {
      code,
      name:               r.Name?.trim() ?? '',
      email:               r.Email?.trim() ?? '',
      phone:               '',
      walkInCustomerNo:    cust,
      salespersonCode:     sp,
      // Prefer the salesperson's Default Location; fall back to the customer's Location Code.
      defaultLocation:     r.SpDefaultLocation?.trim() || r.LocationCode?.trim() || '',
      vatBusPostingGroup:  r.VatBusPostingGroup?.trim() ?? '',
      currentRoute:        r.CurrentRoute?.trim() ?? '',
      tptLocationCode:     r.TptLocationCode?.trim() ?? '',
    };
  });
}

// ── BC salespersons (full Salesperson_Purchaser table, for terminals reference) ─
// Returns every salesperson with all core + extension fields, including the
// custom CustomerNo / Default Location / Current Route / TPT Location Code that
// live on the Salesperson_Purchaser $ext table.
export async function listBcSalespersons(companyId = 'FCL') {
  const resolved = resolveCompanies([companyId]);
  const c = resolved[0] || 'FCL';
  const spTable    = bcTable(c, 'Salesperson_Purchaser');
  const spExtTable = bcTable(c, 'Salesperson_Purchaser', { coreExt: true });
  const pool = await bcDb.getPool();
  const querySql = `
    SELECT
      a.[Code]                       AS Code,
      a.[Name]                       AS Name,
      a.[Commission _]               AS CommissionPct,
      a.[E-Mail]                     AS Email,
      a.[Phone No_]                  AS PhoneNo,
      a.[Job Title]                  AS JobTitle,
      a.[E-Mail 2]                   AS Email2,
      a.[Global Dimension 1 Code]    AS GlobalDim1,
      a.[Global Dimension 2 Code]    AS GlobalDim2,
      ISNULL(a.[Blocked], 0)         AS Blocked,
      ISNULL(a.[Privacy Blocked], 0) AS PrivacyBlocked,
      x.${extCol('CustomerNo')}             AS CustomerNo,
      x.${extCol('Default Location')}       AS DefaultLocation,
      x.${extCol('Current Route')}          AS CurrentRoute,
      x.${extCol('TPT Location Code')}      AS TptLocationCode,
      x.${extCol('RCTAmt')}                 AS RctAmt,
      ISNULL(x.${extCol('Enforce Full Allocation')}, 0) AS EnforceFullAllocation,
      ISNULL(x.${extCol('Location Locked')}, 0)         AS LocationLocked,
      -- Dept Signature is an image blob; expose only whether one exists here.
      -- Fetch the actual image via getSalespersonSignature().
      CASE WHEN DATALENGTH(x.${extCol('Dept Signature')}) > 0 THEN 1 ELSE 0 END AS HasDeptSignature
    FROM ${spTable} a
    LEFT JOIN ${spExtTable} x ON x.[Code] = a.[Code]
    ORDER BY a.[Code]
  `;
  logger.info('pos/listBcSalespersons', { company: c });
  const result = await pool.request().query(querySql);
  return result.recordset.map(r => ({
    code:                  r.Code?.trim() ?? '',
    name:                  r.Name?.trim() ?? '',
    commissionPct:         Number(r.CommissionPct ?? 0),
    email:                 r.Email?.trim() ?? '',
    phoneNo:               r.PhoneNo?.trim() ?? '',
    jobTitle:              r.JobTitle?.trim() ?? '',
    email2:                r.Email2?.trim() ?? '',
    globalDim1:            r.GlobalDim1?.trim() ?? '',
    globalDim2:            r.GlobalDim2?.trim() ?? '',
    blocked:               Boolean(r.Blocked),
    privacyBlocked:        Boolean(r.PrivacyBlocked),
    customerNo:            r.CustomerNo?.trim() ?? '',
    defaultLocation:       r.DefaultLocation?.trim() ?? '',
    currentRoute:          r.CurrentRoute?.trim() ?? '',
    tptLocationCode:       r.TptLocationCode?.trim() ?? '',
    rctAmt:                Number(r.RctAmt ?? 0),
    enforceFullAllocation: Boolean(r.EnforceFullAllocation),
    locationLocked:        Boolean(r.LocationLocked),
    hasDeptSignature:      Boolean(r.HasDeptSignature),
  }));
}

/**
 * Fetch the Dept Signature image for a single salesperson.
 * Returns { code, mime, base64, dataUrl } or null when no signature is stored.
 * (Dept Signature is an `image` blob on the Salesperson_Purchaser $ext table.)
 */
export async function getSalespersonSignature(companyId = 'FCL', code) {
  if (!code) return null;
  const resolved = resolveCompanies([companyId]);
  const c = resolved[0] || 'FCL';
  const spExtTable = bcTable(c, 'Salesperson_Purchaser', { coreExt: true });
  const pool = await bcDb.getPool();
  const result = await pool.request()
    .input('code', sql.NVarChar(20), code.trim())
    .query(`
      SELECT x.${extCol('Dept Signature')} AS Signature
      FROM ${spExtTable} x
      WHERE x.[Code] = @code
    `);
  let buf = result.recordset[0]?.Signature;
  if (!buf || !buf.length) return null;
  buf = Buffer.from(buf);

  // BC/NAV often prefixes BLOB pictures with a few bytes before the real image
  // header. Locate the actual image signature in the first 64 bytes and trim.
  const sigs = [
    { mime: 'image/png',  magic: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    { mime: 'image/jpeg', magic: Buffer.from([0xff, 0xd8, 0xff]) },
    { mime: 'image/gif',  magic: Buffer.from([0x47, 0x49, 0x46, 0x38]) },
    { mime: 'image/bmp',  magic: Buffer.from([0x42, 0x4d]) },
  ];
  let mime = 'application/octet-stream';
  const scan = buf.subarray(0, 64);
  for (const s of sigs) {
    const at = scan.indexOf(s.magic);
    if (at !== -1) { mime = s.mime; buf = buf.subarray(at); break; }
  }
  const base64 = buf.toString('base64');
  return {
    code: code.trim(),
    mime,
    base64,
    // dataUrl only when we recognised an image format; otherwise raw base64 only.
    dataUrl: mime === 'application/octet-stream' ? null : `data:${mime};base64,${base64}`,
  };
}

// ── BC customers (walk-in customer for each shop) ─────────────────────────────
export async function listBcCustomersByNo(companyId, customerNos) {
  if (!customerNos?.length) return [];
  const resolved = resolveCompanies([companyId]);
  const c = resolved[0] || 'FCL';
  const custTable    = bcTable(c, 'Customer');
  const custExtTable = bcTable(c, 'Customer', { coreExt: true });
  const customerTypeCol = extCol('Customer Type');   // [Customer Type$<EXT_GUID>]
  const pool = await bcDb.getPool();
  const req = pool.request();
  const params = customerNos.map((no, i) => {
    req.input(`cn${i}`, sql.NVarChar(20), no);
    return `@cn${i}`;
  }).join(',');
  const querySql = `
    SELECT
      c.[No_]                                AS No,
      c.[Name]                               AS Name,
      c.[Salesperson Code]                   AS SalespersonCode,
      c.[Customer Price Group]               AS CustomerPriceGroup,
      c.[Mobile Phone No_]                   AS MobileNo,
      c.[Phone No_]                          AS PhoneNo,
      c.[E-Mail]                             AS Email,
      COALESCE(NULLIF(LTRIM(RTRIM(c.[Telex Answer Back])), ''),
               NULLIF(LTRIM(RTRIM(c.[VAT Registration No_])), ''))
                                             AS KraPin,
      cx.${customerTypeCol}                  AS CustomerTypeIdx
    FROM ${custTable} c
    LEFT JOIN ${custExtTable} cx ON cx.[No_] = c.[No_]
    WHERE c.[No_] IN (${params})
      AND ISNULL(c.[Privacy Blocked], 0) = 0
  `;
  const result = await req.query(querySql);
  return result.recordset.map(r => ({
    no:                 r.No?.trim() ?? '',
    name:               r.Name?.trim() ?? '',
    salespersonCode:    r.SalespersonCode?.trim() ?? '',
    customerPriceGroup: r.CustomerPriceGroup?.trim() ?? '',
    mobileNo:           r.MobileNo?.trim() ?? '',
    phoneNo:            r.PhoneNo?.trim() ?? '',
    email:              r.Email?.trim() ?? '',
    kraPin:             r.KraPin?.trim() ?? '',
    customerType:       r.CustomerTypeIdx == null ? '' : String(r.CustomerTypeIdx),
  }));
}

// ── BC contacts (for shop walk-in customer import) ────────────────────────────

export async function listBcShopContacts(companyId = 'FCL', salespersonCode) {
  if (!salespersonCode) return [];
  const resolved = resolveCompanies([companyId]);
  const c = resolved[0] || 'FCL';
  const contactTable    = bcTable(c, 'Contact');
  const contactExtTable = bcTable(c, 'Contact', { coreExt: true });
  const routeCodeCol    = extCol('Route Code');     // [Route Code$<EXT_GUID>] — used by Shop Invoice AL
  const pool = await bcDb.getPool();
  const req  = pool.request().input('spCode', sql.NVarChar(20), salespersonCode.trim().toUpperCase());
  const querySql = `
    SELECT TOP 2000
      c.[No_]                  AS ContactNo,
      c.[Name]                 AS Name,
      c.[Phone No_]            AS PhoneNo,
      c.[Mobile Phone No_]     AS MobileNo,
      c.[E-Mail]               AS Email,
      c.[Salesperson Code]     AS SalespersonCode,
      COALESCE(NULLIF(LTRIM(RTRIM(c.[Telex Answer Back])), ''),
               NULLIF(LTRIM(RTRIM(c.[VAT Registration No_])), ''))
                               AS KraPin,
      c.[Type]                 AS ContactTypeIdx,
      c.[Company Name]         AS CompanyName,
      cx.${routeCodeCol}       AS RouteCode
    FROM ${contactTable} c
    LEFT JOIN ${contactExtTable} cx ON cx.[No_] = c.[No_]
    WHERE c.[Salesperson Code] = @spCode
      AND ISNULL(c.[Privacy Blocked], 0) = 0
    ORDER BY c.[Name]
  `;
  logger.info('pos/listBcShopContacts', { company: c, salespersonCode });
  const result = await req.query(querySql);
  return result.recordset.map(r => ({
    contactNo:       r.ContactNo?.trim() ?? '',
    name:            r.Name?.trim() ?? '',
    phoneNo:         r.PhoneNo?.trim() ?? '',
    mobileNo:        r.MobileNo?.trim() ?? '',
    email:           r.Email?.trim() ?? '',
    kraPin:          r.KraPin?.trim() ?? '',
    salespersonCode: r.SalespersonCode?.trim() ?? '',
    contactType:     r.ContactTypeIdx == null ? '' : (Number(r.ContactTypeIdx) === 1 ? 'Person' : 'Company'),
    companyName:     r.CompanyName?.trim() ?? '',
    routeCode:       r.RouteCode?.trim() ?? '',
  }));
}

// ── BC PDA items (for admin item picker) ─────────────────────────────────────
// PDA Item flag, Bar Code, eTIMS codes all live in the Item $ext table.
// Categories come from [Inventory Posting Group] on the core Item table.

export async function listBcPdaItems(companyId = 'FCL', shopCode = null) {
  const resolved = resolveCompanies([companyId]);
  const c = resolved[0] || 'FCL';
  const itemTable    = bcTable(c, 'Item');
  const itemExtTable = bcTable(c, 'Item', { coreExt: true });
  const pdaCol         = extCol('PDA Item');           // [PDA Item$<EXT>]
  const barcodeCol     = extCol('Bar Code No_');       // ext, not core
  const etimsCodeCol   = extCol('E-Tims Item Code');
  const etimsClassCol  = extCol('Item Class code');    // lowercase 'c' — BC field quirk
  const priceTable     = bcTable(c, 'Sales Price');
  const vatSetupTable  = bcTable(c, 'VAT Posting Setup');
  const vatBus         = (process.env.POS_VAT_BUS_POSTING_GROUP || 'DOMESTIC').toUpperCase();

  // Probe the VAT Posting Setup for the % column. Across BC tenants the column
  // ships as either [VAT %] or [VAT Pct] — fall back to no JOIN if neither exists.
  const bcPool = await bcDb.getPool();
  let vatPctColumn = null;
  try {
    const pq = await bcPool.request().query(`
      SELECT TOP 1 c.[name] AS Name
      FROM   sys.columns c
      WHERE  c.[object_id] = OBJECT_ID('${vatSetupTable.replace(/'/g, "''")}')
        AND  c.[name] IN (N'VAT %', N'VAT Pct', N'VAT Pct_', N'VAT Percent')
      ORDER BY CASE c.[name]
                 WHEN N'VAT %'        THEN 1
                 WHEN N'VAT Pct'      THEN 2
                 WHEN N'VAT Pct_'     THEN 3
                 WHEN N'VAT Percent'  THEN 4
               END
    `);
    vatPctColumn = pq.recordset[0]?.Name || null;
  } catch { /* table may not exist on this tenant */ }

  // ── New canonical query ────────────────────────────────────────────────────
  // Source of truth is the EXT table (a) joined to the core Item table (b).
  // Fields like Unit Price (Sales Unit), Production Category, Packaging Unit,
  // Quantity Unit, Item Class, E-Tims Item Code, Is Byproduct all live on the
  // ext table; Description + Inventory Posting Group on core.
  // Filters mirror BC's own POS/eTIMS gate:
  //    PDA Item = 1
  //    E-Tims Item Code <> ''
  //    Unit Price (Sales Unit) <> 0
  //    Blocked/Sales Blocked = 0
  //    Description <> 'Discontiued' (note: BC's typo, kept verbatim)
  // Across companies (FCL, CM, RMK, FLM) the prefix changes — that's already
  // baked into bcTable(c, 'Item') / bcTable(c, 'Item', {coreExt:true}).
  const salesPriceCol     = extCol('Unit Price (Sales Unit)');
  const prodCategoryCol   = extCol('Production Category');
  const packagingUnitCol  = extCol('Packaging Unit code');
  const quantityUnitCol   = extCol('Quantity Unit Code');
  const isByproductCol    = extCol('Is Byproduct');

  const pool = await bcDb.getPool();
  const req  = pool.request();

  const querySql = `
    SELECT
      a.[No_]                       AS ItemNo,
      b.[Description]               AS Description,
      b.[Inventory Posting Group]   AS InvPostingGroup,
      a.${pdaCol}                   AS PDAItem,
      a.${salesPriceCol}            AS UnitPrice,
      a.${prodCategoryCol}          AS ProductionCategory,
      a.${packagingUnitCol}         AS PackagingUnit,
      a.${quantityUnitCol}          AS QuantityUnit,
      a.${etimsClassCol}            AS EtimsItemClassCode,
      a.${etimsCodeCol}             AS EtimsItemCode,
      a.${isByproductCol}           AS IsByproduct,
      a.${barcodeCol}               AS Barcode,
      b.[VAT Prod_ Posting Group]   AS VatPostingGroup,
      ISNULL(b.[Price Includes VAT], 0) AS PriceIncludesVat,
      COALESCE(NULLIF(LTRIM(RTRIM(b.[Sales Unit of Measure])), ''), b.[Base Unit of Measure]) AS UnitOfMeasure,
      ${vatPctColumn ? `ISNULL(vps.[${vatPctColumn}], 0)` : '0'} AS VatPercent
    FROM ${itemExtTable} a
    INNER JOIN ${itemTable} b ON a.[No_] = b.[No_]
    ${vatPctColumn ? `
    LEFT JOIN ${vatSetupTable} vps
           ON UPPER(LTRIM(RTRIM(vps.[VAT Bus_ Posting Group])))  = '${vatBus.replace(/'/g, "''")}'
          AND UPPER(LTRIM(RTRIM(vps.[VAT Prod_ Posting Group]))) = UPPER(LTRIM(RTRIM(b.[VAT Prod_ Posting Group])))` : ''}
    WHERE  a.${etimsCodeCol} <> ''
      AND  a.${pdaCol} = 1
      AND  a.${salesPriceCol} <> 0
      AND  ISNULL(b.[Blocked], 0) = 0
      AND  ISNULL(b.[Sales Blocked], 0) = 0
      AND  b.[Description] <> 'Discontiued'
    ORDER BY b.[Inventory Posting Group], b.[Description]
  `;
  logger.info('pos/listBcPdaItems', { company: c });
  const result = await req.query(querySql);
  return result.recordset.map(r => ({
    itemNo:             r.ItemNo?.trim() ?? '',
    description:        r.Description?.trim() ?? '',
    unitPrice:          Number(r.UnitPrice ?? 0),
    categoryCode:       r.InvPostingGroup?.trim() ?? '',
    categoryName:       r.InvPostingGroup?.trim() ?? '',
    barcode:            r.Barcode?.trim() ?? '',
    productionCategory: r.ProductionCategory?.trim() ?? '',
    packagingUnit:      r.PackagingUnit?.trim() ?? '',
    quantityUnit:       r.QuantityUnit?.trim() ?? '',
    isByproduct:        Boolean(r.IsByproduct),
    unitOfMeasure:      r.UnitOfMeasure?.trim() ?? '',
    vatPostingGroup:    r.VatPostingGroup?.trim() ?? '',
    priceIncludesVat:   Boolean(r.PriceIncludesVat),
    vatPercent:         Number(r.VatPercent ?? 0),
    etimsItemCode:      r.EtimsItemCode?.trim() ?? '',
    etimsItemClassCode: r.EtimsItemClassCode?.trim() ?? '',
  }));
}

// ── BC inventory posting groups (used as POS categories) ──────────────────────
export async function listBcInventoryPostingGroups(companyId = 'FCL') {
  const resolved = resolveCompanies([companyId]);
  const c = resolved[0] || 'FCL';
  const itemTable     = bcTable(c, 'Item');
  const itemExtTable  = bcTable(c, 'Item', { coreExt: true });
  const pdaCol        = extCol('PDA Item');
  const etimsCodeCol  = extCol('E-Tims Item Code');
  const salesPriceCol = extCol('Unit Price (Sales Unit)');
  const pool = await bcDb.getPool();
  // Match the same filters listBcPdaItems uses, so categories without any
  // eligible items don't show up empty in the POS terminal.
  const result = await pool.request().query(`
    SELECT DISTINCT b.[Inventory Posting Group] AS Code
    FROM   ${itemExtTable} a
    JOIN   ${itemTable}    b ON a.[No_] = b.[No_]
    WHERE  a.${etimsCodeCol} <> ''
      AND  a.${pdaCol} = 1
      AND  a.${salesPriceCol} <> 0
      AND  b.[Description] <> 'Discontiued'
      AND  NULLIF(LTRIM(RTRIM(b.[Inventory Posting Group])), '') IS NOT NULL
    ORDER BY 1
  `);
  return result.recordset.map(r => ({ code: r.Code.trim(), name: r.Code.trim() }));
}

// ── PosPaymentType ────────────────────────────────────────────────────────────

export async function listPaymentTypes({ activeOnly = false, shopCode = null } = {}) {
  const pool = await appPool();
  const req = pool.request();
  const conditions = [];
  if (activeOnly) conditions.push('[IsActive]=1');
  if (shopCode) {
    // return types for this shop OR types with no shop assigned (global)
    req.input('shopCode', sql.NVarChar(50), shopCode);
    conditions.push('([ShopCode]=@shopCode OR [ShopCode] IS NULL)');
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const cols = `[TypeId],[Code],[ShopCode],[Name],[PaymentClass],[IsActive],[SortOrder],
           [ApiEndpoint],[UseApiEndpoint],[BalanceAcctType],[BalanceAcctNo],[BcSourceNo],
           [Description],
           [ConsumerKey],[ConsumerSecret],[ShortCode],[Passkey],
           [TransactionType],[CallbackUrl],[AccountReference],
           [PaymentFetchUrl],[ApiKey],
           [CreatedAt],[UpdatedAt]`;

  // For a specific terminal, collapse to one row per Code — the shop-specific row
  // wins over the global (ShopCode IS NULL) one, so the checkout list is unique.
  if (shopCode) {
    const r = await req.query(`
      WITH Ranked AS (
        SELECT ${cols},
               ROW_NUMBER() OVER (
                 PARTITION BY [Code]
                 ORDER BY CASE WHEN [ShopCode]=@shopCode THEN 0 ELSE 1 END, [SortOrder], [Name]
               ) AS rn
        FROM [dbo].[PosPaymentType]
        ${where}
      )
      SELECT ${cols} FROM Ranked WHERE rn=1
      ORDER BY [SortOrder],[Name]
    `);
    return r.recordset;
  }

  const r = await req.query(`
    SELECT ${cols}
    FROM [dbo].[PosPaymentType]
    ${where}
    ORDER BY [SortOrder],[Name]
  `);
  return r.recordset;
}

export async function savePaymentType({ typeId, code, shopCode = null, name, paymentClass = 'Cash', isActive = true, sortOrder = 0,
                                        apiEndpoint = null, useApiEndpoint = false,
                                        balanceAcctType = null, balanceAcctNo = null, bcSourceNo = null,
                                        description = null,
                                        consumerKey = null, consumerSecret = null, shortCode = null, passkey = null,
                                        transactionType = null, callbackUrl = null, accountReference = null,
                                        paymentFetchUrl = null, apiKey = null }) {
  const VALID_CLASSES = ['Cash', 'Card', 'Mobile', 'Credit', 'BankTransfer'];
  const cls = VALID_CLASSES.includes(paymentClass) ? paymentClass : 'Cash';
  const pool = await appPool();
  const req = pool.request()
    .input('code',             sql.NVarChar(50),  str(code, 50).toUpperCase())
    .input('shopCode',         sql.NVarChar(50),  str(shopCode, 50).toUpperCase() || null)
    .input('name',             sql.NVarChar(200), str(name))
    .input('paymentClass',     sql.NVarChar(20),  cls)
    .input('isActive',         sql.Bit,           bool(isActive) ? 1 : 0)
    .input('sortOrder',        sql.Int,           num(sortOrder))
    .input('apiEndpoint',      sql.NVarChar(250), str(apiEndpoint, 250) || null)
    .input('useApiEndpoint',   sql.Bit,           bool(useApiEndpoint) ? 1 : 0)
    .input('balanceAcctType',  sql.NVarChar(20),  str(balanceAcctType, 20) || null)
    .input('balanceAcctNo',    sql.NVarChar(20),  str(balanceAcctNo, 20) || null)
    .input('bcSourceNo',       sql.NVarChar(20),  str(bcSourceNo, 20) || null)
    .input('description',      sql.NVarChar(500), str(description, 500) || null)
    .input('consumerKey',      sql.NVarChar(200), str(consumerKey, 200) || null)
    .input('consumerSecret',   sql.NVarChar(500), str(consumerSecret, 500) || null)
    .input('shortCode',        sql.NVarChar(20),  str(shortCode, 20) || null)
    .input('passkey',          sql.NVarChar(500), str(passkey, 500) || null)
    .input('transactionType',  sql.NVarChar(50),  str(transactionType, 50) || null)
    .input('callbackUrl',      sql.NVarChar(500), str(callbackUrl, 500) || null)
    .input('accountReference', sql.NVarChar(50),  str(accountReference, 50) || null)
    .input('paymentFetchUrl',  sql.NVarChar(500), str(paymentFetchUrl, 500) || null)
    .input('apiKey',           sql.NVarChar(500), str(apiKey, 500) || null);

  if (typeId) {
    req.input('typeId', sql.UniqueIdentifier, typeId);
    await req.query(`
      UPDATE [dbo].[PosPaymentType]
      SET [Code]=@code,[ShopCode]=@shopCode,[Name]=@name,[PaymentClass]=@paymentClass,
          [IsActive]=@isActive,[SortOrder]=@sortOrder,
          [ApiEndpoint]=@apiEndpoint,[UseApiEndpoint]=@useApiEndpoint,
          [BalanceAcctType]=@balanceAcctType,[BalanceAcctNo]=@balanceAcctNo,
          [BcSourceNo]=@bcSourceNo,[Description]=@description,
          [ConsumerKey]=@consumerKey,[ConsumerSecret]=@consumerSecret,
          [ShortCode]=@shortCode,[Passkey]=@passkey,
          [TransactionType]=@transactionType,[CallbackUrl]=@callbackUrl,
          [AccountReference]=@accountReference,
          [PaymentFetchUrl]=@paymentFetchUrl,[ApiKey]=@apiKey,
          [UpdatedAt]=GETUTCDATE()
      WHERE [TypeId]=@typeId
    `);
    return typeId;
  }
  const result = await req.query(`
    INSERT INTO [dbo].[PosPaymentType]([Code],[ShopCode],[Name],[PaymentClass],[IsActive],[SortOrder],
                                       [ApiEndpoint],[UseApiEndpoint],[BalanceAcctType],[BalanceAcctNo],
                                       [BcSourceNo],[Description],
                                       [ConsumerKey],[ConsumerSecret],[ShortCode],[Passkey],
                                       [TransactionType],[CallbackUrl],[AccountReference],
                                       [PaymentFetchUrl],[ApiKey])
    OUTPUT INSERTED.[TypeId]
    VALUES(@code,@shopCode,@name,@paymentClass,@isActive,@sortOrder,
           @apiEndpoint,@useApiEndpoint,@balanceAcctType,@balanceAcctNo,@bcSourceNo,@description,
           @consumerKey,@consumerSecret,@shortCode,@passkey,
           @transactionType,@callbackUrl,@accountReference,
           @paymentFetchUrl,@apiKey)
  `);
  return result.recordset[0].TypeId;
}

export async function deletePaymentType(typeId) {
  const pool = await appPool();
  await pool.request()
    .input('typeId', sql.UniqueIdentifier, typeId)
    .query(`DELETE FROM [dbo].[PosPaymentType] WHERE [TypeId]=@typeId`);
}

// ── eTIMS / integration configuration (per shop, stored in AppSettings) ────
// Key format: pos.etims.<SHOP_CODE>.<field>
// SHOP_CODE = '_GLOBAL_' is the shop-less fallback (used when an admin operates without a shop)

const ETIMS_FIELDS = [
  'invoiceUrl', 'invoiceNumUrl', 'creditNoteUrl', 'apiKey',
  'branchId', 'companyPin', 'qrServiceUrl', 'paymentService',
];

function etimsKey(shopCode, field) {
  return `pos.etims.${(shopCode || '_GLOBAL_').toUpperCase()}.${field}`;
}

export async function getEtimsConfig(shopCode = null) {
  const pool = await appPool();
  const prefix = `pos.etims.${(shopCode || '_GLOBAL_').toUpperCase()}.`;
  const r = await pool.request()
    .input('prefix', sql.NVarChar(100), `${prefix}%`)
    .query(`SELECT [SettingKey],[SettingValue] FROM [dbo].[AppSettings] WHERE [SettingKey] LIKE @prefix`);
  const map = Object.fromEntries(r.recordset.map(row => [row.SettingKey, row.SettingValue]));
  const out = { shopCode: shopCode ? String(shopCode).toUpperCase() : null };
  for (const f of ETIMS_FIELDS) out[f] = map[`${prefix}${f}`] || '';
  if (!out.branchId) out.branchId = '00';
  return out;
}

// ── Inventory display config (terminal item cards) ─────────────────────────
const INVENTORY_KEY = 'pos.inventory.hideOutOfStock';

export async function getInventoryConfig() {
  const pool = await appPool();
  const r = await pool.request()
    .input('k', sql.NVarChar(100), INVENTORY_KEY)
    .query(`SELECT [SettingValue] FROM [dbo].[AppSettings] WHERE [SettingKey]=@k`);
  const raw = r.recordset[0]?.SettingValue ?? '';
  const truthy = ['1','true','yes','on'].includes(String(raw).toLowerCase());
  return { hideOutOfStock: truthy };
}

export async function saveInventoryConfig({ hideOutOfStock }) {
  const pool = await appPool();
  const v = hideOutOfStock ? '1' : '0';
  await pool.request()
    .input('k', sql.NVarChar(100), INVENTORY_KEY)
    .input('v', sql.NVarChar(sql.MAX), v)
    .query(`
      MERGE [dbo].[AppSettings] AS t
      USING (SELECT @k AS K) AS s ON t.[SettingKey] = s.K
      WHEN MATCHED THEN UPDATE SET [SettingValue]=@v,[UpdatedAt]=GETUTCDATE()
      WHEN NOT MATCHED THEN INSERT([SettingKey],[SettingValue]) VALUES(@k,@v);
    `);
  return getInventoryConfig();
}

export async function saveEtimsConfig(shopCode, cfg) {
  const pool = await appPool();
  for (const f of ETIMS_FIELDS) {
    const k = etimsKey(shopCode, f);
    const v = String(cfg[f] ?? '');
    await pool.request()
      .input('k', sql.NVarChar(100), k)
      .input('v', sql.NVarChar(sql.MAX), v)
      .query(`
        MERGE [dbo].[AppSettings] AS t
        USING (SELECT @k AS K) AS s ON t.[SettingKey] = s.K
        WHEN MATCHED THEN UPDATE SET [SettingValue]=@v,[UpdatedAt]=GETUTCDATE()
        WHEN NOT MATCHED THEN INSERT([SettingKey],[SettingValue]) VALUES(@k,@v);
      `);
  }
  return getEtimsConfig(shopCode);
}

/**
 * Fetch BC FCL Integration Setup defaults so admin can pre-fill the form.
 * BC table: [dbo].[{prefix}$FCL Integration Setup$<EXT_GUID>] — extension-owned, single record.
 * Field names from the FCL extension (with EXT_GUID suffix).
 */
export async function fetchBcEtimsDefaults(companyId = 'FCL') {
  const resolved = resolveCompanies([companyId]);
  const c = resolved[0] || 'FCL'; // FCL maps to the BC table prefix FCL1$.
  const setupTable = bcTable(c, 'FCL Integration Setup', { ext: true });
  const companyTable = bcTable(c, 'Company Information');
  const companyExtTable = bcTable(c, 'Company Information', { coreExt: true });
  const pool = await bcDb.getPool();
  try {
    const [r, cr, cer] = await Promise.all([
      pool.request().query(`SELECT TOP 1 * FROM ${setupTable}`),
      pool.request().query(`SELECT TOP 1 * FROM ${companyTable}`),
      pool.request().query(`SELECT TOP 1 * FROM ${companyExtTable}`),
    ]);
    if (!r.recordset.length) return null;
    const row = r.recordset[0];
    const company = cr.recordset[0] || {};
    const companyExt = cer.recordset[0] || {};
    // Strip the $<EXT_GUID> suffix from column names so we can look them up by plain name
    const get = (key) => {
      const exact = row[key];
      if (exact != null) return exact;
      const found = Object.keys(row).find(k => k.split('$')[0] === key);
      return found ? row[found] : '';
    };
    const result = {
      invoiceUrl:     String(get('eTims Invoice URL')      || '').trim(),
      invoiceNumUrl:  String(get('eTims InvoiceNum URL')   || '').trim(),
      creditNoteUrl:  String(get('eTims Credit Note URL')  || '').trim(),
      apiKey:         String(get('eTims API Key')          || '').trim(),
      branchId:       String(get('eTims Branch ID')        || '00').trim(),
      companyPin:     String(get('eTims Business PIN')     || '').trim(),
      qrServiceUrl:   String(get('QRCodeServiceURL')       || '').trim(),
      paymentService: String(get('Payment Service')        || '').trim(),
    };
    if (!result.companyPin) {
      const extPinCol = extCol('PIN').slice(1, -1);
      result.companyPin = String(
        companyExt[extPinCol] ||
        companyExt.PIN ||
        company.PIN ||
        ''
      ).trim();
    }
    return result;
  } catch (e) {
    logger.warn('fetchBcEtimsDefaults failed', { error: e.message });
    return null;
  }
}

// ── Print configuration (per shop, stored in AppSettings) ───────────────────
// Key format: pos.print.<SHOP_CODE>.<field>

function printKey(shopCode, field) {
  return `pos.print.${(shopCode || '_GLOBAL_').toUpperCase()}.${field}`;
}

export async function getPrintConfig(shopCode = null) {
  const pool = await appPool();
  const prefix = `pos.print.${(shopCode || '_GLOBAL_').toUpperCase()}.`;
  const r = await pool.request()
    .input('prefix', sql.NVarChar(100), `${prefix}%`)
    .query(`SELECT [SettingKey],[SettingValue] FROM [dbo].[AppSettings] WHERE [SettingKey] LIKE @prefix`);
  const map = Object.fromEntries(r.recordset.map(row => [row.SettingKey, row.SettingValue]));
  return {
    shopCode:       shopCode ? String(shopCode).toUpperCase() : null,
    format:         (map[`${prefix}format`]         || 'a4').toLowerCase(),
    invoicePrinter:  map[`${prefix}invoicePrinter`] || '',
    thermalWidthMm: Number(map[`${prefix}thermalWidthMm`] || 72),
    copies:         Math.max(1, Number(map[`${prefix}copies`] || 1)),
  };
}

export async function savePrintConfig(shopCode, cfg) {
  const pool = await appPool();
  const entries = [
    [printKey(shopCode, 'format'),         (cfg.format || 'a4').toLowerCase()],
    [printKey(shopCode, 'invoicePrinter'),  cfg.invoicePrinter || ''],
    [printKey(shopCode, 'thermalWidthMm'), String(cfg.thermalWidthMm || 72)],
    [printKey(shopCode, 'copies'),         String(cfg.copies || 1)],
  ];
  for (const [k, v] of entries) {
    await pool.request()
      .input('k', sql.NVarChar(100), k)
      .input('v', sql.NVarChar(sql.MAX), v)
      .query(`
        MERGE [dbo].[AppSettings] AS t
        USING (SELECT @k AS K) AS s ON t.[SettingKey] = s.K
        WHEN MATCHED THEN UPDATE SET [SettingValue]=@v,[UpdatedAt]=GETUTCDATE()
        WHEN NOT MATCHED THEN INSERT([SettingKey],[SettingValue]) VALUES(@k,@v);
      `);
  }
  return getPrintConfig(shopCode);
}

// ── PosSpecialPrice (date-bound offers) ───────────────────────────────────────

/**
 * List PosSpecialPrice rows (with item description). When { pageSize } is given
 * returns { rows, total, page, pageSize }; otherwise the full array.
 * @param {Object} [opts] { page, pageSize, q }
 */
/** Set the photo URL on an item. */
export async function setItemImageUrl(itemId, imageUrl) {
  const pool = await appPool();
  const r = await pool.request()
    .input('id',  sql.UniqueIdentifier, itemId)
    .input('url', sql.NVarChar(500), imageUrl || null)
    .query(`UPDATE [dbo].[PosItem] SET [ImageUrl]=@url,[UpdatedAt]=GETUTCDATE() WHERE [ItemId]=@id;
            SELECT [ImageUrl] FROM [dbo].[PosItem] WHERE [ItemId]=@id`);
  return r.recordset[0]?.ImageUrl || null;
}

export async function listSpecialPrices(opts = {}) {
  const pool = await appPool();
  const from = `FROM [dbo].[PosSpecialPrice] sp
    LEFT JOIN [dbo].[PosItem] pi ON pi.[ItemNo] = sp.[ItemNo]`;
  const cols = `sp.[SpecialPriceId],sp.[ItemNo],sp.[ShopCode],sp.[UnitPrice],
           sp.[StartingDate],sp.[EndingDate],sp.[Description],sp.[IsActive],
           pi.[Description] AS ItemDescription`;
  const req = pool.request();
  let where = '';
  if (opts.q) {
    req.input('q', sql.NVarChar(200), `%${opts.q}%`);
    where = `WHERE sp.[ItemNo] LIKE @q OR sp.[ShopCode] LIKE @q OR sp.[Description] LIKE @q OR pi.[Description] LIKE @q`;
  }
  const pg = pageArgs(opts);
  if (!pg) {
    const r = await req.query(`SELECT ${cols} ${from} ${where} ORDER BY sp.[StartingDate] DESC, sp.[ItemNo]`);
    return r.recordset;
  }
  const cnt = await req.query(`SELECT COUNT(*) AS n ${from} ${where}`);
  req.input('off', sql.Int, pg.offset).input('lim', sql.Int, pg.pageSize);
  const r = await req.query(`
    SELECT ${cols} ${from} ${where}
    ORDER BY sp.[StartingDate] DESC, sp.[ItemNo]
    OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY`);
  return { rows: r.recordset, total: cnt.recordset[0].n, page: pg.page, pageSize: pg.pageSize };
}

export async function saveSpecialPrice({ specialPriceId, itemNo, shopCode = null, unitPrice,
                                          startingDate, endingDate = null, description = null, isActive = true }) {
  const pool = await appPool();
  const req = pool.request()
    .input('itemNo',       sql.NVarChar(30),   str(itemNo, 30).toUpperCase())
    .input('shopCode',     sql.NVarChar(50),   str(shopCode, 50).toUpperCase() || null)
    .input('unitPrice',    sql.Decimal(18, 4), num(unitPrice))
    .input('startingDate', sql.Date,           startingDate)
    .input('endingDate',   sql.Date,           endingDate || null)
    .input('description',  sql.NVarChar(200),  str(description, 200) || null)
    .input('isActive',     sql.Bit,            bool(isActive) ? 1 : 0);
  if (specialPriceId) {
    req.input('specialPriceId', sql.UniqueIdentifier, specialPriceId);
    await req.query(`
      UPDATE [dbo].[PosSpecialPrice]
      SET [ItemNo]=@itemNo,[ShopCode]=@shopCode,[UnitPrice]=@unitPrice,
          [StartingDate]=@startingDate,[EndingDate]=@endingDate,
          [Description]=@description,[IsActive]=@isActive,[UpdatedAt]=GETUTCDATE()
      WHERE [SpecialPriceId]=@specialPriceId
    `);
    return specialPriceId;
  }
  const result = await req.query(`
    INSERT INTO [dbo].[PosSpecialPrice]
      ([ItemNo],[ShopCode],[UnitPrice],[StartingDate],[EndingDate],[Description],[IsActive])
    OUTPUT INSERTED.[SpecialPriceId]
    VALUES(@itemNo,@shopCode,@unitPrice,@startingDate,@endingDate,@description,@isActive)
  `);
  return result.recordset[0].SpecialPriceId;
}

export async function deleteSpecialPrice(specialPriceId) {
  const pool = await appPool();
  await pool.request()
    .input('specialPriceId', sql.UniqueIdentifier, specialPriceId)
    .query(`DELETE FROM [dbo].[PosSpecialPrice] WHERE [SpecialPriceId]=@specialPriceId`);
}

/**
 * Bulk-upsert special prices from a parsed CSV/JSON list.
 * Identity key for upsert: (ItemNo, ShopCode-or-blank, StartingDate). Same identity used by BC.
 * Returns { posted, failed, errors[] }.
 */
export async function importSpecialPricesBatch({ rows, createdBy }) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('rows required');
  const pool = await appPool();
  const out = { posted: 0, failed: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const itemNo = String(r.itemNo || r.ItemNo || '').trim().toUpperCase();
      if (!itemNo)               throw new Error('itemNo required');
      const startingDate = r.startingDate || r.StartingDate;
      if (!startingDate)         throw new Error('startingDate required');
      const unitPrice = Number(r.unitPrice ?? r.UnitPrice);
      if (!isFinite(unitPrice) || unitPrice < 0) throw new Error('unitPrice must be >= 0');

      const shopCode    = String(r.shopCode || r.ShopCode || '').trim().toUpperCase() || null;
      const endingDate  = r.endingDate || r.EndingDate || null;
      const description = String(r.description || r.Description || '').trim() || null;
      const isActive    = (r.isActive ?? r.IsActive ?? 1);

      await pool.request()
        .input('itemNo',       sql.NVarChar(30),   itemNo)
        .input('shopCode',     sql.NVarChar(50),   shopCode)
        .input('unitPrice',    sql.Decimal(18, 4), unitPrice)
        .input('startingDate', sql.Date,           startingDate)
        .input('endingDate',   sql.Date,           endingDate || null)
        .input('description',  sql.NVarChar(200),  description)
        .input('isActive',     sql.Bit,            (isActive === false || isActive === 0 || isActive === '0' || isActive === 'false') ? 0 : 1)
        .query(`
          MERGE [dbo].[PosSpecialPrice] AS t
          USING (SELECT @itemNo AS ItemNo, @shopCode AS ShopCode, @startingDate AS StartingDate) AS s
            ON t.[ItemNo] = s.ItemNo
           AND ISNULL(t.[ShopCode], '') = ISNULL(s.ShopCode, '')
           AND t.[StartingDate] = s.StartingDate
          WHEN MATCHED THEN UPDATE SET
            [UnitPrice]=@unitPrice,[EndingDate]=@endingDate,
            [Description]=@description,[IsActive]=@isActive,[UpdatedAt]=GETUTCDATE()
          WHEN NOT MATCHED THEN INSERT
            ([ItemNo],[ShopCode],[UnitPrice],[StartingDate],[EndingDate],[Description],[IsActive])
            VALUES (@itemNo,@shopCode,@unitPrice,@startingDate,@endingDate,@description,@isActive);
        `);
      out.posted += 1;
    } catch (e) {
      out.failed += 1;
      out.errors.push({ row: i + 1, itemNo: r.itemNo || r.ItemNo || '', error: e.message });
    }
  }
  return out;
}

// ── PosFavourite (per-user favourite items) ───────────────────────────────────

export async function listFavourites(userId) {
  const pool = await appPool();
  const r = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT f.[FavouriteId],f.[ItemNo],pi.[Description]
      FROM [dbo].[PosFavourite] f
      LEFT JOIN [dbo].[PosItem] pi ON pi.[ItemNo] = f.[ItemNo]
      WHERE f.[UserId]=@userId
      ORDER BY f.[SortOrder],pi.[Description]
    `);
  return r.recordset;
}

export async function addFavourite(userId, itemNo) {
  const pool = await appPool();
  await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('itemNo', sql.NVarChar(30),     str(itemNo, 30).toUpperCase())
    .query(`
      IF NOT EXISTS (SELECT 1 FROM [dbo].[PosFavourite] WHERE [UserId]=@userId AND [ItemNo]=@itemNo)
        INSERT INTO [dbo].[PosFavourite]([UserId],[ItemNo]) VALUES(@userId,@itemNo)
    `);
}

export async function removeFavourite(userId, itemNo) {
  const pool = await appPool();
  await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('itemNo', sql.NVarChar(30),     str(itemNo, 30).toUpperCase())
    .query(`DELETE FROM [dbo].[PosFavourite] WHERE [UserId]=@userId AND [ItemNo]=@itemNo`);
}

// ── PosVatRate (config — VAT % per posting group) ─────────────────────────────

export async function listVatRates() {
  const pool = await appPool();
  const r = await pool.request().query(`
    SELECT [VatRateId],[PostingGroup],[RatePercent],[TaxType],[IsActive],[CreatedAt],[UpdatedAt]
    FROM [dbo].[PosVatRate]
    ORDER BY [PostingGroup]
  `);
  return r.recordset;
}

export async function saveVatRate({ vatRateId, postingGroup, ratePercent, taxType, isActive = true }) {
  const pool = await appPool();
  const req = pool.request()
    .input('postingGroup', sql.NVarChar(50),    str(postingGroup, 50).toUpperCase())
    .input('ratePercent',  sql.Decimal(8, 4),   num(ratePercent))
    .input('taxType',      sql.NVarChar(10),    str(taxType, 10) || null)
    .input('isActive',     sql.Bit,             bool(isActive) ? 1 : 0);
  if (vatRateId) {
    req.input('vatRateId', sql.UniqueIdentifier, vatRateId);
    await req.query(`
      UPDATE [dbo].[PosVatRate]
      SET [PostingGroup]=@postingGroup,[RatePercent]=@ratePercent,
          [TaxType]=@taxType,[IsActive]=@isActive,[UpdatedAt]=GETUTCDATE()
      WHERE [VatRateId]=@vatRateId
    `);
    return vatRateId;
  }
  const result = await req.query(`
    INSERT INTO [dbo].[PosVatRate]([PostingGroup],[RatePercent],[TaxType],[IsActive])
    OUTPUT INSERTED.[VatRateId]
    VALUES(@postingGroup,@ratePercent,@taxType,@isActive)
  `);
  return result.recordset[0].VatRateId;
}

export async function deleteVatRate(vatRateId) {
  const pool = await appPool();
  await pool.request()
    .input('vatRateId', sql.UniqueIdentifier, vatRateId)
    .query(`DELETE FROM [dbo].[PosVatRate] WHERE [VatRateId]=@vatRateId`);
}

async function loadVatRateMap() {
  const rows = await listVatRates();
  const map = new Map();
  for (const r of rows) {
    if (r.IsActive) map.set(String(r.PostingGroup).toUpperCase(), {
      ratePercent: Number(r.RatePercent || 0),
      taxType:     r.TaxType || '',
    });
  }
  return map;
}

// ── Granular per-step BC sync ───────────────────────────────────────────────
// Each step returns { count, errors[] } so the admin UI can run them independently.

export async function syncShopsFromBc(companyId = 'FCL', { wipe = false } = {}) {
  const out = { count: 0, errors: [], wiped: 0, shops: [] };
  try {
    const pool = await appPool();

    if (wipe) {
      // Drop user-shop assignments first (FK-style) then PosShop. PosUserShop
      // rows keyed on stale shop codes become orphans — clearing them keeps
      // the user-shop UI clean and forces a fresh re-tag after the sync.
      const wipeRes = await pool.request().query(`
        DELETE FROM [dbo].[PosUserShop];
        DELETE FROM [dbo].[PosShop];
        SELECT @@ROWCOUNT AS RowsDeleted;
      `);
      out.wiped = Number(wipeRes.recordset?.[0]?.RowsDeleted || 0);
    }

    const bcShops = await listBcShopSalespersons(companyId);
    // Which per-company column gets this customer number
    const compCol = ({
      FCL: 'FclCustomerNo', CM: 'CmCustomerNo', RMK: 'RmkCustomerNo', FLM: 'FlmCustomerNo',
    })[String(companyId).toUpperCase()] || null;

    for (const s of bcShops) {
      if (!s.code) continue;
      // Match an existing shop by Name first (case-insensitive trim) so an outlet
      // already created for FCL gets the CM CustomerNo merged into the same row.
      // Fall back to creating a new row keyed on the salesperson code.
      const lookup = await pool.request()
        .input('name', sql.NVarChar(200), s.name.trim())
        .query(`
          SELECT TOP 1 [Code] FROM [dbo].[PosShop]
          WHERE  UPPER(LTRIM(RTRIM([Name]))) = UPPER(LTRIM(RTRIM(@name)))
          ORDER BY [CreatedAt]
        `);
      const code = (lookup.recordset[0]?.Code || s.code).toUpperCase();

      const r = pool.request()
        .input('code',               sql.NVarChar(50),  code)
        .input('name',               sql.NVarChar(200), s.name)
        .input('locationCode',       sql.NVarChar(20),  s.defaultLocation || null)
        .input('salespersonCode',    sql.NVarChar(20),  s.salespersonCode || s.code)
        .input('walkInCustomerNo',   sql.NVarChar(20),  s.walkInCustomerNo || null)
        .input('vatBusPostingGroup', sql.NVarChar(50),  s.vatBusPostingGroup || null)
        .input('email',              sql.NVarChar(200), s.email || null)
        .input('currentRoute',       sql.NVarChar(200), s.currentRoute || null)
        .input('tptLocationCode',    sql.NVarChar(200), s.tptLocationCode || null)
        .input('compCust',           sql.NVarChar(20),  s.walkInCustomerNo || null);

      // If we know which per-company column to set, write it; otherwise just upsert the rest.
      const compSet = compCol ? `, [${compCol}] = COALESCE(@compCust, [${compCol}])` : '';
      const compIns = compCol ? `,[${compCol}]` : '';
      const compVal = compCol ? `,@compCust` : '';

      await r.query(`
        MERGE [dbo].[PosShop] AS t
        USING (SELECT @code AS Code) AS src ON t.[Code] = src.Code
        WHEN MATCHED THEN UPDATE SET
          [Name]=@name,
          [LocationCode]=COALESCE(@locationCode,[LocationCode]),
          [SalespersonCode]=COALESCE(@salespersonCode,[SalespersonCode]),
          [WalkInCustomerNo]=COALESCE([WalkInCustomerNo],@walkInCustomerNo),
          [VatBusPostingGroup]=COALESCE(@vatBusPostingGroup,[VatBusPostingGroup]),
          [Email]=COALESCE(@email,[Email]),
          [CurrentRoute]=COALESCE(@currentRoute,[CurrentRoute]),
          [TptLocationCode]=COALESCE(@tptLocationCode,[TptLocationCode]),
          [IsActive]=1,[UpdatedAt]=GETUTCDATE()
          ${compSet}
        WHEN NOT MATCHED THEN INSERT
          ([Code],[Name],[LocationCode],[SalespersonCode],[WalkInCustomerNo],
           [VatBusPostingGroup],[Email],[CurrentRoute],[TptLocationCode],[IsActive]${compIns})
          VALUES (@code,@name,@locationCode,@salespersonCode,@walkInCustomerNo,
                  @vatBusPostingGroup,@email,@currentRoute,@tptLocationCode,1${compVal});
      `);
      out.count++;
    }
    out.shops = bcShops;
  } catch (e) {
    out.errors.push(e.message);
  }
  return out;
}

export async function syncWalkInCustomersFromBc(companyId = 'FCL') {
  const out = { count: 0, deleted: 0, terminals: 0, errors: [] };
  try {
    const pool = await appPool();

    // Existing terminals only. A "terminal" is an active PosShop; its Code and
    // SalespersonCode are the keys a BC shop-salesperson must match. Walk-ins for
    // salesperson codes that aren't set up as a terminal are skipped entirely.
    const termRes = await pool.request().query(
      `SELECT [Code],[SalespersonCode] FROM [dbo].[PosShop] WHERE [IsActive]=1`);
    const termKeys = new Set(
      termRes.recordset
        .flatMap(r => [r.Code, r.SalespersonCode])
        .filter(Boolean)
        .map(x => x.trim().toUpperCase()));
    out.terminals = termRes.recordset.length;

    // Wipe every existing walk-in before reinserting (regular contacts untouched).
    const delRes = await pool.request().query(
      `DELETE FROM [dbo].[PosContact] WHERE [IsWalkIn]=1; SELECT @@ROWCOUNT AS N;`);
    out.deleted = Number(delRes.recordset?.[0]?.N || 0);
    if (!termKeys.size) return out;

    // Keep only BC shop-salespersons that map to an existing terminal.
    const bcShops = (await listBcShopSalespersons(companyId)).filter(s =>
      termKeys.has((s.code || '').toUpperCase()) ||
      termKeys.has((s.salespersonCode || '').toUpperCase()));
    const custNos = bcShops.map(s => s.walkInCustomerNo).filter(Boolean);
    if (!custNos.length) return out;
    const bcCusts = await listBcCustomersByNo(companyId, [...new Set(custNos)]);
    const shopByCustNo = new Map();
    for (const s of bcShops) {
      if (s.walkInCustomerNo) shopByCustNo.set(s.walkInCustomerNo, s.code.toUpperCase());
    }
    for (const cust of bcCusts) {
      const shopCode = shopByCustNo.get(cust.no);
      if (shopCode && cust.customerPriceGroup) {
        await pool.request()
          .input('shopCode', sql.NVarChar(50), shopCode)
          .input('cpg',      sql.NVarChar(50), cust.customerPriceGroup)
          .query(`UPDATE [dbo].[PosShop] SET [CustomerPriceGroup]=@cpg,[UpdatedAt]=GETUTCDATE() WHERE [Code]=@shopCode`);
      }
    }
    for (const cust of bcCusts) {
      if (!cust.no) continue;
      const shopCode = shopByCustNo.get(cust.no) || null;
      if (!shopCode) continue;   // only walk-ins tied to an existing terminal
      await pool.request()
        .input('bcNo',     sql.NVarChar(20),  cust.no.toUpperCase())
        .input('name',     sql.NVarChar(200), cust.name)
        .input('mobileNo', sql.NVarChar(30),  cust.mobileNo || cust.phoneNo || null)
        .input('email',    sql.NVarChar(200), cust.email || null)
        .input('kraPin',   sql.NVarChar(30),  cust.kraPin || null)
        .input('spCode',   sql.NVarChar(20),  cust.salespersonCode || null)
        .input('shopCode', sql.NVarChar(50),  shopCode)
        .input('custType', sql.NVarChar(20),  cust.customerType || null)
        .query(`
          MERGE [dbo].[PosContact] AS t
          USING (SELECT @bcNo AS BcContactNo) AS s ON t.[BcContactNo] = s.[BcContactNo]
          WHEN MATCHED THEN UPDATE SET
            [Name]=@name,[MobileNo]=@mobileNo,[Email]=@email,[KraPin]=@kraPin,
            [SalespersonCode]=@spCode,[ShopCode]=@shopCode,[CustomerType]=@custType,
            [IsActive]=1,[IsWalkIn]=1,[UpdatedAt]=GETUTCDATE()
          WHEN NOT MATCHED THEN INSERT
            ([BcContactNo],[Name],[MobileNo],[Email],[KraPin],[SalespersonCode],[ShopCode],[CustomerType],[IsWalkIn])
            VALUES (@bcNo,@name,@mobileNo,@email,@kraPin,@spCode,@shopCode,@custType,1);
        `);
      out.count++;
    }
  } catch (e) {
    out.errors.push(e.message);
  }
  return out;
}

export async function syncContactsFromBc(companyId = 'FCL') {
  const out = { count: 0, errors: [] };
  try {
    const pool    = await appPool();
    // Only sync contacts whose salesperson code is in the shop terminal list
    // (PosShop). Terminal Code == Salesperson Code. Contacts for salespersons
    // that aren't set up as a terminal are skipped.
    const termRes = await pool.request().query(
      `SELECT [Code], [SalespersonCode] FROM [dbo].[PosShop] WHERE [IsActive]=1`);
    const spCodes = [...new Set(
      termRes.recordset
        .map(r => (r.SalespersonCode || r.Code || '').trim().toUpperCase())
        .filter(Boolean)
    )];
    out.terminals = spCodes.length;
    for (const spCode of spCodes) {
      const bcContacts = await listBcShopContacts(companyId, spCode);
      for (const ct of bcContacts) {
        if (!ct.contactNo) continue;
        await pool.request()
          .input('bcNo',         sql.NVarChar(20),  ct.contactNo.toUpperCase())
          .input('name',         sql.NVarChar(200), ct.name)
          .input('mobileNo',     sql.NVarChar(30),  ct.mobileNo || ct.phoneNo || null)
          .input('email',        sql.NVarChar(200), ct.email || null)
          .input('kraPin',       sql.NVarChar(30),  ct.kraPin || null)
          .input('spCode',       sql.NVarChar(20),  ct.salespersonCode || spCode)
          .input('shopCode',     sql.NVarChar(50),  spCode)
          .input('routeCode',    sql.NVarChar(20),  ct.routeCode || null)
          .input('contactType',  sql.NVarChar(20),  ct.contactType || null)
          .input('companyName',  sql.NVarChar(200), ct.companyName || null)
          .query(`
            MERGE [dbo].[PosContact] AS t
            USING (SELECT @bcNo AS BcContactNo) AS src ON t.[BcContactNo] = src.[BcContactNo]
            WHEN MATCHED AND ISNULL(t.[IsWalkIn], 0) = 0 THEN UPDATE SET
              [Name]=@name,[MobileNo]=@mobileNo,[Email]=@email,[KraPin]=@kraPin,
              [SalespersonCode]=@spCode,[ShopCode]=@shopCode,
              [RouteCode]=@routeCode,[CustomerType]=@contactType,[CompanyName]=@companyName,
              [IsActive]=1,[UpdatedAt]=GETUTCDATE()
            WHEN NOT MATCHED THEN INSERT
              ([BcContactNo],[Name],[MobileNo],[Email],[KraPin],[SalespersonCode],[ShopCode],
               [RouteCode],[CustomerType],[CompanyName],[IsWalkIn])
              VALUES (@bcNo,@name,@mobileNo,@email,@kraPin,@spCode,@shopCode,
                      @routeCode,@contactType,@companyName,0);
          `);
        out.count++;
      }
    }
  } catch (e) {
    out.errors.push(e.message);
  }
  return out;
}

export async function syncCategoriesFromBc(companyId = 'FCL') {
  const out = { count: 0, errors: [] };
  try {
    const pool = await appPool();
    const bcCategories = await listBcInventoryPostingGroups(companyId);
    let order = 0;
    for (const cat of bcCategories) {
      if (!cat.code) continue;
      await pool.request()
        .input('code',      sql.NVarChar(50),  cat.code.toUpperCase())
        .input('name',      sql.NVarChar(200), cat.name || cat.code)
        .input('sortOrder', sql.Int,           order++)
        .query(`
          MERGE [dbo].[PosCategory] AS t
          USING (SELECT @code AS Code) AS s ON t.[Code] = s.Code
          WHEN MATCHED THEN UPDATE SET
            [Name]=@name,[IsActive]=1,[UpdatedAt]=GETUTCDATE()
          WHEN NOT MATCHED THEN INSERT
            ([Code],[Name],[SortOrder],[IsActive])
            VALUES (@code,@name,@sortOrder,1);
        `);
      out.count++;
    }
  } catch (e) {
    out.errors.push(e.message);
  }
  return out;
}

/**
 * Pull PDA items from BC and upsert into PosItem.
 * Pass { wipe: true } to clear PosItem first (drops dependent rows so the slate is clean
 * for a fresh re-import — used when switching companies or the BC catalogue has been pruned).
 */
export async function syncItemsFromBc(companyId = 'FCL', { wipe = false, prune = false } = {}) {
  const out = { count: 0, errors: [], wiped: 0, pruned: 0 };
  try {
    const pool    = await appPool();

    if (wipe) {
      // Clear dependents first so PosItem can be safely truncated.
      const wipeRes = await pool.request().query(`
        DELETE FROM [dbo].[PosFavourite];
        DELETE FROM [dbo].[PosSpecialPrice];
        -- Stock movements / orders / etc. reference ItemNo (string) so they're not FK-blocked.
        DELETE FROM [dbo].[PosItem];
        SELECT @@ROWCOUNT AS RowsDeleted;
      `);
      out.wiped = Number(wipeRes.recordset?.[0]?.RowsDeleted || 0);
    }

    const bcItems = await listBcPdaItems(companyId);
    for (const it of bcItems) {
      if (!it.itemNo) continue;
      // ── VAT rate is derived purely from the BC "VAT Prod_ Posting Group":
      //    VAT16  → 16%   (taxType 'B')
      //    anything else → 0% (taxType 'A')
      // Skips PosVatRate / VAT Posting Setup lookups so the rule is deterministic.
      const vpg     = (it.vatPostingGroup || '').toUpperCase();
      const ratePct = vpg === 'VAT16' ? 16 : 0;
      const taxType = vpg === 'VAT16' ? 'B' : 'A';
      const finalPrice = it.priceIncludesVat
        ? it.unitPrice
        : Math.round(it.unitPrice * (1 + ratePct / 100) * 10000) / 10000;
      // Prefer Quantity Unit Code → Packaging Unit code → Sales UoM as the displayed UoM.
      const uom = it.quantityUnit || it.packagingUnit || it.unitOfMeasure || null;
      await pool.request()
        .input('itemNo',             sql.NVarChar(30),   it.itemNo.toUpperCase())
        .input('description',        sql.NVarChar(200),  it.description)
        .input('categoryCode',       sql.NVarChar(50),   it.categoryCode?.toUpperCase() || null)
        .input('unitPrice',          sql.Decimal(18, 4), finalPrice)
        .input('barcode',            sql.NVarChar(100),  it.barcode || null)
        .input('etimsItemCode',      sql.NVarChar(50),   it.etimsItemCode || null)
        .input('etimsItemClassCode', sql.NVarChar(50),   it.etimsItemClassCode || null)
        .input('unitOfMeasure',      sql.NVarChar(20),   uom)
        .input('vatPostingGroup',    sql.NVarChar(50),   vpg || null)
        .input('priceIncludesVat',   sql.Bit,            1)
        .input('vatPercent',         sql.Decimal(8, 4),  ratePct)
        .input('taxType',            sql.NVarChar(10),   taxType)
        .input('productionCategory', sql.NVarChar(50),   it.productionCategory || null)
        .input('packagingUnit',      sql.NVarChar(20),   it.packagingUnit || null)
        .input('quantityUnit',       sql.NVarChar(20),   it.quantityUnit || null)
        .input('isByproduct',        sql.Bit,            it.isByproduct ? 1 : 0)
        .input('sourceCompany',      sql.NVarChar(20),   String(companyId).toUpperCase())
        .query(`
          MERGE [dbo].[PosItem] AS t
          USING (SELECT @itemNo AS ItemNo) AS s ON t.[ItemNo] = s.ItemNo
          WHEN MATCHED THEN UPDATE SET
            [Description]        = @description,
            [CategoryCode]       = COALESCE(@categoryCode, [CategoryCode]),
            [UnitPrice]          = @unitPrice,
            [Barcode]            = COALESCE(@barcode, [Barcode]),
            [EtimsItemCode]      = @etimsItemCode,
            [EtimsItemClassCode] = @etimsItemClassCode,
            [UnitOfMeasure]      = COALESCE(@unitOfMeasure, [UnitOfMeasure]),
            [VatPostingGroup]    = @vatPostingGroup,
            [PriceIncludesVat]   = @priceIncludesVat,
            [VatPercent]         = @vatPercent,
            [TaxType]            = @taxType,
            [ProductionCategory] = @productionCategory,
            [PackagingUnit]      = @packagingUnit,
            [QuantityUnit]       = @quantityUnit,
            [IsByproduct]        = @isByproduct,
            [SourceCompany]      = @sourceCompany,
            [IsActive]           = 1,
            [UpdatedAt]          = GETUTCDATE()
          WHEN NOT MATCHED THEN INSERT
            ([ItemNo],[Description],[CategoryCode],[UnitPrice],[Barcode],
             [EtimsItemCode],[EtimsItemClassCode],[UnitOfMeasure],
             [VatPostingGroup],[PriceIncludesVat],[VatPercent],[TaxType],
             [ProductionCategory],[PackagingUnit],[QuantityUnit],[IsByproduct],[SourceCompany],[IsActive])
            VALUES (@itemNo,@description,@categoryCode,@unitPrice,@barcode,
                    @etimsItemCode,@etimsItemClassCode,@unitOfMeasure,
                    @vatPostingGroup,@priceIncludesVat,@vatPercent,@taxType,
                    @productionCategory,@packagingUnit,@quantityUnit,@isByproduct,@sourceCompany,1);
        `);
      out.count++;
    }
    if (prune) {
      if (bcItems.length) {
        const req = pool.request()
          .input('sourceCompany', sql.NVarChar(20), String(companyId).toUpperCase());
        const names = [];
        bcItems.forEach((it, i) => {
          const name = `item${i}`;
          names.push(`@${name}`);
          req.input(name, sql.NVarChar(30), it.itemNo.toUpperCase());
        });
        const pr = await req.query(`
          UPDATE [dbo].[PosItem]
          SET [IsActive]=0,[UpdatedAt]=GETUTCDATE()
          WHERE [SourceCompany]=@sourceCompany
            AND [ItemNo] NOT IN (${names.join(',')})
            AND [IsActive]=1;
          SELECT @@ROWCOUNT AS Pruned;
        `);
        out.pruned = Number(pr.recordset?.[0]?.Pruned || 0);
      } else {
        const pr = await pool.request()
          .input('sourceCompany', sql.NVarChar(20), String(companyId).toUpperCase())
          .query(`
            UPDATE [dbo].[PosItem]
            SET [IsActive]=0,[UpdatedAt]=GETUTCDATE()
            WHERE [SourceCompany]=@sourceCompany AND [IsActive]=1;
            SELECT @@ROWCOUNT AS Pruned;
          `);
        out.pruned = Number(pr.recordset?.[0]?.Pruned || 0);
      }
    }
  } catch (e) {
    out.errors.push(e.message);
  }
  return out;
}

export async function syncPaymentTypesFromBc(companyId = 'FCL') {
  const out = { count: 0, errors: [] };
  try {
    const pool    = await appPool();
    const bcTypes = await listBcShopPaymentTypes(companyId);
    const shops   = await listShops();
    const shopByWalkIn = new Map();
    for (const s of shops) {
      if (s.WalkInCustomerNo) shopByWalkIn.set(s.WalkInCustomerNo, s.Code);
    }
    for (const bt of bcTypes) {
      if (!bt.code) continue;
      const shopCode  = shopByWalkIn.get(bt.shopCustomerNo) || null;
      const sortOrder = bt.isDefault ? 0 : 10;
      await pool.request()
        .input('code',           sql.NVarChar(50),  bt.code.toUpperCase())
        .input('shopCode',       sql.NVarChar(50),  shopCode)
        .input('name',           sql.NVarChar(200), bt.paymentMethodCode || bt.code)
        .input('paymentClass',   sql.NVarChar(20),  bt.paymentClass)
        .input('apiEndpoint',    sql.NVarChar(250), bt.apiEndpoint || null)
        .input('useApiEndpoint', sql.Bit,           bt.useApiEndpoint ? 1 : 0)
        .input('balanceAcctType',sql.NVarChar(20),  bt.balanceAcctType || null)
        .input('balanceAcctNo',  sql.NVarChar(20),  bt.balanceAcctNo || null)
        .input('bcSourceNo',     sql.NVarChar(20),  bt.code)
        .input('sortOrder',      sql.Int,           sortOrder)
        .query(`
          MERGE [dbo].[PosPaymentType] AS t
          USING (SELECT @code AS Code, @shopCode AS ShopCode) AS s
            ON t.[Code] = s.Code AND ISNULL(t.[ShopCode], '') = ISNULL(s.ShopCode, '')
          WHEN MATCHED THEN UPDATE SET
            [Name]=@name,[PaymentClass]=@paymentClass,[ApiEndpoint]=@apiEndpoint,
            [UseApiEndpoint]=@useApiEndpoint,[BalanceAcctType]=@balanceAcctType,
            [BalanceAcctNo]=@balanceAcctNo,[BcSourceNo]=@bcSourceNo,
            [IsActive]=1,[UpdatedAt]=GETUTCDATE()
          WHEN NOT MATCHED THEN INSERT
            ([Code],[ShopCode],[Name],[PaymentClass],[ApiEndpoint],[UseApiEndpoint],
             [BalanceAcctType],[BalanceAcctNo],[BcSourceNo],[SortOrder],[IsActive])
            VALUES (@code,@shopCode,@name,@paymentClass,@apiEndpoint,@useApiEndpoint,
                    @balanceAcctType,@balanceAcctNo,@bcSourceNo,@sortOrder,1);
        `);
      out.count++;
    }
  } catch (e) {
    out.errors.push(e.message);
  }
  return out;
}

// ── Shop prices (BC Sales Price → PosSpecialPrice, per shop) ───────────────────
// Pulls every BC Sales Price row for each shop's customer price group and writes
// it as a date-bound PosSpecialPrice (Source='BC'). At sell time the existing
// ActivePrice CTE in listPosItemsGrouped picks the row whose [StartingDate..EndingDate]
// covers the selling date; outside any window the POS falls back to the item-card
// price (PosItem.UnitPrice).
//
// VAT: BC prices (both the item card and the Sales Price table) are VAT-EXCLUSIVE,
// but PosItem.UnitPrice is stored VAT-INCLUSIVE — so we gross each Sales Price up by
// the item's VatPercent to keep both on the same basis for the receipt VAT split.
//
// Price group per shop: resolved from the BC Customer table via the shop's walk-in
// customer no (which itself comes from the salesperson's CustomerNo). Shops with no
// resolvable group fall back to 'FCL SHOPS'.
export async function syncShopPricesFromBc(companyId = 'FCL') {
  const out = { count: 0, shops: 0, priceGroups: [], pruned: 0, byCompany: {}, errors: [] };
  try {
    const pool = await appPool();
    // companyId only drives the per-shop price-group lookup below; Sales Prices are
    // pulled from ALL companies' tables (each item priced from its own SourceCompany).
    const c = resolveCompanies([companyId])[0] || 'FCL';

    // 1. Active shops + their walk-in customer no.
    const shopRes = await pool.request().query(`
      SELECT [Code], [WalkInCustomerNo] FROM [dbo].[PosShop] WHERE [IsActive]=1`);
    const shops = shopRes.recordset;
    out.shops = shops.length;
    if (!shops.length) return out;

    // 2. Resolve each shop's BC customer price group.
    const custNos = [...new Set(shops.map(s => (s.WalkInCustomerNo || '').trim()).filter(Boolean))];
    const groupByCust = new Map();
    if (custNos.length) {
      const bcPool = await bcDb.getPool();
      const custTable = bcTable(c, 'Customer');
      const req = bcPool.request();
      const params = custNos.map((no, i) => { req.input(`cn${i}`, sql.NVarChar(20), no); return `@cn${i}`; }).join(',');
      const gr = await req.query(`
        SELECT [No_] AS No, [Customer Price Group] AS Grp
        FROM ${custTable} WHERE [No_] IN (${params})`);
      gr.recordset.forEach(r => groupByCust.set((r.No || '').trim(), (r.Grp || '').trim()));
    }
    const groupByShop = new Map();
    for (const s of shops) {
      const grp = (groupByCust.get((s.WalkInCustomerNo || '').trim()) || 'FCL SHOPS').toUpperCase();
      groupByShop.set(s.Code, grp);
    }
    const groups = [...new Set([...groupByShop.values()])];
    out.priceGroups = groups;

    // 3. POS catalogue: VAT% + which company each item was synced from.
    //    (only items we actually sell get a synced price)
    const itemRes = await pool.request().query(
      `SELECT [ItemNo],[VatPercent],[SourceCompany] FROM [dbo].[PosItem] WHERE [IsActive]=1`);
    const vatByItem = new Map();
    const compByItem = new Map();
    for (const r of itemRes.recordset) {
      const no = (r.ItemNo || '').toUpperCase();
      vatByItem.set(no, Number(r.VatPercent || 0));
      compByItem.set(no, (r.SourceCompany || 'FCL').toUpperCase());
    }

    // 4. Pull Sales Price rows for those groups across EVERY company's table
    //    (FCL1, CM3, FLM1, RMK — all live in the same DB). Each item's price comes
    //    from the company it was synced from (PosItem.SourceCompany). Local currency,
    //    no variant; dedupe to the lowest Minimum Quantity per (item, group, start date).
    const bcPool = await bcDb.getPool();
    const rowsByGroup = new Map();
    out.byCompany = {};
    for (const comp of ALL_COMPANIES) {
      let priceTable;
      try { priceTable = bcTable(comp, 'Sales Price'); } catch { continue; }
      const preq = bcPool.request();
      const gparams = groups.map((g, i) => { preq.input(`g${i}`, sql.NVarChar(40), g); return `@g${i}`; }).join(',');
      let priceRes;
      try {
        priceRes = await preq.query(`
          WITH P AS (
            SELECT
              UPPER(LTRIM(RTRIM([Item No_])))   AS ItemNo,
              UPPER(LTRIM(RTRIM([Sales Code]))) AS SalesCode,
              [Unit Price]                      AS UnitPrice,
              ISNULL([Price Includes VAT], 0)   AS PriceInclVat,
              CAST([Starting Date] AS DATE)     AS StartingDate,
              CASE WHEN [Ending Date] IS NULL OR [Ending Date] <= '1753-01-01'
                   THEN NULL ELSE CAST([Ending Date] AS DATE) END AS EndingDate,
              ROW_NUMBER() OVER (
                PARTITION BY UPPER(LTRIM(RTRIM([Item No_]))), UPPER(LTRIM(RTRIM([Sales Code]))), CAST([Starting Date] AS DATE)
                ORDER BY ISNULL([Minimum Quantity], 0) ASC, [Unit Price] ASC
              ) AS rn
            FROM ${priceTable}
            WHERE [Sales Type] = 1
              AND UPPER(LTRIM(RTRIM([Sales Code]))) IN (${gparams})
              AND [Unit Price] <> 0
              AND ISNULL(LTRIM(RTRIM([Variant Code])), '') = ''
              AND ISNULL(LTRIM(RTRIM([Currency Code])), '') = ''
          )
          SELECT ItemNo, SalesCode, UnitPrice, PriceInclVat, StartingDate, EndingDate
          FROM P WHERE rn = 1`);
      } catch (e) {
        out.errors.push(`${comp} sales price: ${e.message}`);
        continue;
      }
      let kept = 0;
      for (const r of priceRes.recordset) {
        if (compByItem.get(r.ItemNo) !== comp) continue;   // item belongs to another company (or not a POS item)
        if (!rowsByGroup.has(r.SalesCode)) rowsByGroup.set(r.SalesCode, []);
        rowsByGroup.get(r.SalesCode).push(r);
        kept++;
      }
      out.byCompany[comp] = kept;
    }

    // 5. Fan out to shops, grossing to VAT-inclusive.
    const toInsert = [];
    for (const [shopCode, grp] of groupByShop) {
      for (const r of (rowsByGroup.get(grp) || [])) {
        const vat = vatByItem.get(r.ItemNo) || 0;
        const incl = r.PriceInclVat
          ? Number(r.UnitPrice)
          : Math.round(Number(r.UnitPrice) * (1 + vat / 100) * 10000) / 10000;
        toInsert.push({
          itemNo: r.ItemNo, shopCode, unitPrice: incl,
          startingDate: r.StartingDate, endingDate: r.EndingDate,
          description: `BC ${grp}`,
        });
      }
    }

    // 6. Replace this run's BC rows for the synced shops; manual offers untouched.
    const delReq = pool.request();
    const codeParams = shops.map((s, i) => { delReq.input(`sh${i}`, sql.NVarChar(50), s.Code); return `@sh${i}`; }).join(',');
    const delRes = await delReq.query(`
      DELETE FROM [dbo].[PosSpecialPrice]
      WHERE [Source]='BC' AND [ShopCode] IN (${codeParams});
      SELECT @@ROWCOUNT AS N;`);
    out.pruned = Number(delRes.recordset?.[0]?.N || 0);

    const CHUNK = 100;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const rq = pool.request();
      const values = chunk.map((row, j) => {
        rq.input(`in${j}`, sql.NVarChar(30),   row.itemNo);
        rq.input(`sc${j}`, sql.NVarChar(50),   row.shopCode);
        rq.input(`up${j}`, sql.Decimal(18, 4), row.unitPrice);
        rq.input(`sd${j}`, sql.Date,           row.startingDate);
        rq.input(`ed${j}`, sql.Date,           row.endingDate);
        rq.input(`ds${j}`, sql.NVarChar(200),  row.description);
        return `(@in${j},@sc${j},@up${j},@sd${j},@ed${j},@ds${j},1,'BC')`;
      }).join(',');
      await rq.query(`
        INSERT INTO [dbo].[PosSpecialPrice]
          ([ItemNo],[ShopCode],[UnitPrice],[StartingDate],[EndingDate],[Description],[IsActive],[Source])
        VALUES ${values}`);
      out.count += chunk.length;
    }
    logger.info('pos/syncShopPricesFromBc', { shops: out.shops, groups, byCompany: out.byCompany, inserted: out.count, pruned: out.pruned });
  } catch (e) {
    out.errors.push(e.message);
  }
  return out;
}

// ── Bulk sync from BC: shops, walk-in customers, contacts, categories, items, payment types
//    Composes the per-step helpers above; preserves the legacy { shops, walkInCustomers, … } shape.

export async function syncMasterFromBc(companyId = 'FCL') {
  const result = {
    shops: 0, walkInCustomers: 0, contacts: 0,
    categories: 0, items: 0, paymentTypes: 0, shopPrices: 0,
    errors: [],
  };

  const r1 = await syncShopsFromBc(companyId);            result.shops           = r1.count; r1.errors.forEach(m => result.errors.push(`shops: ${m}`));
  const r2 = await syncWalkInCustomersFromBc(companyId);  result.walkInCustomers = r2.count; r2.errors.forEach(m => result.errors.push(`walkInCustomers: ${m}`));
  const r3 = await syncContactsFromBc(companyId);         result.contacts        = r3.count; r3.errors.forEach(m => result.errors.push(`contacts: ${m}`));
  const r4 = await syncCategoriesFromBc(companyId);       result.categories      = r4.count; r4.errors.forEach(m => result.errors.push(`categories: ${m}`));
  const r5 = await syncItemsFromBc(companyId);            result.items           = r5.count; r5.errors.forEach(m => result.errors.push(`items: ${m}`));
  const r6 = await syncPaymentTypesFromBc(companyId);     result.paymentTypes    = r6.count; r6.errors.forEach(m => result.errors.push(`paymentTypes: ${m}`));
  // Shop prices last — depends on shops (price group) and items (VAT%) being synced first.
  const r7 = await syncShopPricesFromBc(companyId);       result.shopPrices      = r7.count; r7.errors.forEach(m => result.errors.push(`shopPrices: ${m}`));

  return result;
}

// ── PosShop ───────────────────────────────────────────────────────────────────

export async function listShops({ activeOnly = false } = {}) {
  const pool = await appPool();
  const where = activeOnly ? 'WHERE [IsActive]=1' : '';
  const r = await pool.request().query(`
    SELECT [ShopId],[Code],[Name],[LocationCode],[SalespersonCode],[WalkInCustomerNo],
           [CurrentRoute],[TptLocationCode],
           [IsActive],[SortOrder],[CreatedAt],[UpdatedAt]
    FROM [dbo].[PosShop]
    ${where}
    ORDER BY [SortOrder],[Name]
  `);
  return r.recordset;
}

export async function saveShop({ shopId, code, name, locationCode = null, salespersonCode = null,
                                 currentRoute = null, tptLocationCode = null, isActive = true, sortOrder = 0 }) {
  const pool = await appPool();
  const req = pool.request()
    .input('code',            sql.NVarChar(50),  str(code, 50).toUpperCase())
    .input('name',            sql.NVarChar(200), str(name))
    .input('locationCode',    sql.NVarChar(20),  str(locationCode, 20).toUpperCase() || null)
    .input('salespersonCode', sql.NVarChar(20),  str(salespersonCode, 20).toUpperCase() || null)
    .input('currentRoute',    sql.NVarChar(200), str(currentRoute, 200) || null)
    .input('tptLocationCode', sql.NVarChar(200), str(tptLocationCode, 200) || null)
    .input('isActive',        sql.Bit,           bool(isActive) ? 1 : 0)
    .input('sortOrder',       sql.Int,           num(sortOrder));
  if (shopId) {
    req.input('shopId', sql.UniqueIdentifier, shopId);
    await req.query(`
      UPDATE [dbo].[PosShop]
      SET [Code]=@code,[Name]=@name,[LocationCode]=@locationCode,
          [SalespersonCode]=@salespersonCode,
          [CurrentRoute]=@currentRoute,[TptLocationCode]=@tptLocationCode,
          [IsActive]=@isActive,[SortOrder]=@sortOrder,[UpdatedAt]=GETUTCDATE()
      WHERE [ShopId]=@shopId
    `);
    return shopId;
  }
  const result = await req.query(`
    INSERT INTO [dbo].[PosShop]([Code],[Name],[LocationCode],[SalespersonCode],[CurrentRoute],[TptLocationCode],[IsActive],[SortOrder])
    OUTPUT INSERTED.[ShopId]
    VALUES(@code,@name,@locationCode,@salespersonCode,@currentRoute,@tptLocationCode,@isActive,@sortOrder)
  `);
  return result.recordset[0].ShopId;
}

export async function deleteShop(shopId) {
  const pool = await appPool();
  await pool.request()
    .input('shopId', sql.UniqueIdentifier, shopId)
    .query(`DELETE FROM [dbo].[PosShop] WHERE [ShopId]=@shopId`);
}

/** Read every shop the user is tagged to. Primary shop comes first. */
export async function listUserShops(userId) {
  if (!userId) return [];
  try {
    const pool = await appPool();
    const r = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`
        SELECT us.[ShopCode], us.[IsPrimary],
               s.[Name]   AS ShopName,
               s.[LocationCode], s.[SalespersonCode]
        FROM   [dbo].[PosUserShop] us
        LEFT JOIN [dbo].[PosShop]  s ON s.[Code] = us.[ShopCode]
        WHERE  us.[UserId] = @userId
        ORDER BY us.[IsPrimary] DESC, ISNULL(s.[Name], us.[ShopCode])
      `);
    return r.recordset;
  } catch { return []; }
}

/**
 * Replace the user's full set of shop assignments. `shops` is an array of
 * { shopCode, isPrimary }. Exactly one row may have isPrimary=true; if more,
 * the first wins; if none, the first row in the input is auto-promoted.
 */
export async function setUserShops(userId, shops) {
  if (!userId) throw new Error('userId required');
  const cleaned = (shops || [])
    .map(s => ({ shopCode: String(s.shopCode || '').toUpperCase().trim(), isPrimary: !!s.isPrimary }))
    .filter(s => s.shopCode);
  // Dedupe
  const seen = new Set();
  const list = [];
  for (const s of cleaned) {
    if (seen.has(s.shopCode)) continue;
    seen.add(s.shopCode); list.push(s);
  }
  // Promote one primary
  const primaries = list.filter(s => s.isPrimary);
  if (primaries.length === 0 && list.length) list[0].isPrimary = true;
  if (primaries.length > 1) list.forEach((s, i) => { s.isPrimary = (s.shopCode === primaries[0].shopCode); });

  const pool = await appPool();
  const tx   = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`DELETE FROM [dbo].[PosUserShop] WHERE [UserId]=@userId`);
    for (const s of list) {
      await new sql.Request(tx)
        .input('userId',    sql.UniqueIdentifier, userId)
        .input('shopCode',  sql.NVarChar(50),     s.shopCode)
        .input('isPrimary', sql.Bit,              s.isPrimary ? 1 : 0)
        .query(`INSERT INTO [dbo].[PosUserShop]([UserId],[ShopCode],[IsPrimary]) VALUES (@userId,@shopCode,@isPrimary)`);
    }
    // Mirror the primary into legacy Users.ShopCode so existing single-shop code paths still resolve.
    const primary = list.find(s => s.isPrimary);
    if (primary) {
      await new sql.Request(tx)
        .input('userId',   sql.UniqueIdentifier, userId)
        .input('shopCode', sql.NVarChar(50),     primary.shopCode)
        .query(`
          IF COL_LENGTH('dbo.Users', 'ShopCode') IS NOT NULL
            UPDATE [dbo].[Users] SET [ShopCode]=@shopCode WHERE [UserId]=@userId
        `);
    } else {
      await new sql.Request(tx)
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`
          IF COL_LENGTH('dbo.Users', 'ShopCode') IS NOT NULL
            UPDATE [dbo].[Users] SET [ShopCode]=NULL WHERE [UserId]=@userId
        `);
    }
    await tx.commit();
    return await listUserShops(userId);
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

/** Admin overview: users with their assigned shops as a comma-separated list. */
export async function listUsersWithShops() {
  const pool = await appPool();
  const r = await pool.request().query(`
    SELECT u.[UserId], u.[Username], u.[DisplayName], u.[Email], u.[Role], u.[IsActive],
           STUFF((
             SELECT ', ' + us.[ShopCode]
             FROM [dbo].[PosUserShop] us
             WHERE us.[UserId] = u.[UserId]
             ORDER BY us.[IsPrimary] DESC, us.[ShopCode]
             FOR XML PATH(''), TYPE
           ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS Shops,
           (SELECT TOP 1 us.[ShopCode] FROM [dbo].[PosUserShop] us
            WHERE us.[UserId] = u.[UserId] AND us.[IsPrimary] = 1) AS PrimaryShop
    FROM   [dbo].[Users] u
    WHERE  u.[IsActive] = 1
    ORDER BY u.[DisplayName]
  `);
  return r.recordset;
}

export async function getUserShopCode(userId) {
  if (!userId) return null;
  try {
    const pool = await appPool();
    // Use COL_LENGTH guard so a deployment that hasn't yet picked up Users.ShopCode
    // returns null instead of crashing the calling endpoint with a 500.
    const r = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`
        IF COL_LENGTH('dbo.Users', 'ShopCode') IS NOT NULL
          SELECT [ShopCode] AS ShopCode FROM [dbo].[Users] WHERE [UserId]=@userId;
        ELSE
          SELECT CAST(NULL AS NVARCHAR(50)) AS ShopCode WHERE 1=0;
      `);
    return r.recordset[0]?.ShopCode ?? null;
  } catch {
    return null;
  }
}

// ── PosContact ────────────────────────────────────────────────────────────────

/**
 * List PosContact rows. When { pageSize } is given returns
 * { rows, total, page, pageSize }; otherwise the full array (back-compat for
 * the terminal, which relies on the plain array).
 * @param {Object} [opts] { shopCode, activeOnly, page, pageSize, q }
 */
export async function listContacts({ shopCode = null, activeOnly = true, page, pageSize, q } = {}) {
  const pool = await appPool();
  const conditions = [];
  const req = pool.request();
  if (activeOnly) conditions.push('[IsActive]=1');
  if (shopCode) { conditions.push('[ShopCode]=@shopCode'); req.input('shopCode', sql.NVarChar(50), shopCode); }
  if (q) {
    req.input('q', sql.NVarChar(200), `%${q}%`);
    conditions.push('([Name] LIKE @q OR [MobileNo] LIKE @q OR [BcContactNo] LIKE @q OR [ShopCode] LIKE @q OR [SalespersonCode] LIKE @q)');
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const cols = `[ContactId],[BcContactNo],[Name],[MobileNo],[Email],[KraPin],
           [SalespersonCode],[ShopCode],[RouteCode],[CustomerType],[CompanyName],
           [ParentContactNo],[IsLocalOnly],[IsWalkIn],[IsActive],[CreatedAt]`;
  const pg = pageArgs({ page, pageSize });
  if (!pg) {
    const r = await req.query(`SELECT ${cols} FROM [dbo].[PosContact] ${where} ORDER BY [IsWalkIn] DESC, [Name]`);
    return r.recordset;
  }
  const cnt = await req.query(`SELECT COUNT(*) AS n FROM [dbo].[PosContact] ${where}`);
  req.input('off', sql.Int, pg.offset).input('lim', sql.Int, pg.pageSize);
  const r = await req.query(`
    SELECT ${cols} FROM [dbo].[PosContact] ${where}
    ORDER BY [IsWalkIn] DESC, [Name]
    OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY`);
  return { rows: r.recordset, total: cnt.recordset[0].n, page: pg.page, pageSize: pg.pageSize };
}

/**
 * Get the walk-in (umbrella) contact for a given shop. One per shop, marked IsWalkIn=1.
 */
export async function getWalkInForShop(shopCode) {
  if (!shopCode) return null;
  const pool = await appPool();
  const r = await pool.request()
    .input('shopCode', sql.NVarChar(50), shopCode)
    .query(`
      SELECT TOP 1 [ContactId],[BcContactNo],[Name],[MobileNo],[Email],[KraPin],
             [SalespersonCode],[ShopCode],[CompanyName]
      FROM [dbo].[PosContact]
      WHERE [ShopCode] = @shopCode AND [IsWalkIn] = 1 AND [IsActive] = 1
    `);
  return r.recordset[0] || null;
}

/**
 * Cashier creates a sub-contact under their shop's walk-in.
 * Stored locally with IsLocalOnly=1 so an admin can later push to BC if needed.
 * Generates a unique BcContactNo with prefix LOCAL- so it can't collide with BC numbers.
 */
export async function createSubContact({ shopCode, salespersonCode, name, mobileNo, kraPin, email, parentContactNo }) {
  if (!shopCode) throw new Error('shopCode required');
  if (!name)     throw new Error('Contact name required');
  const pool = await appPool();
  const localNo = `LOCAL-${Date.now().toString(36).toUpperCase()}`;
  const r = await pool.request()
    .input('bcNo',           sql.NVarChar(20),  localNo)
    .input('name',           sql.NVarChar(200), str(name))
    .input('mobileNo',       sql.NVarChar(30),  str(mobileNo, 30) || null)
    .input('email',          sql.NVarChar(200), str(email, 200) || null)
    .input('kraPin',         sql.NVarChar(30),  str(kraPin, 30) || null)
    .input('spCode',         sql.NVarChar(20),  str(salespersonCode, 20).toUpperCase() || null)
    .input('shopCode',       sql.NVarChar(50),  str(shopCode, 50).toUpperCase())
    .input('parentContactNo',sql.NVarChar(20),  str(parentContactNo, 20).toUpperCase() || null)
    .query(`
      INSERT INTO [dbo].[PosContact]
        ([BcContactNo],[Name],[MobileNo],[Email],[KraPin],[SalespersonCode],[ShopCode],
         [ParentContactNo],[IsLocalOnly],[IsWalkIn],[IsActive])
      OUTPUT INSERTED.[ContactId], INSERTED.[BcContactNo]
      VALUES(@bcNo,@name,@mobileNo,@email,@kraPin,@spCode,@shopCode,
             @parentContactNo,1,0,1)
    `);
  return r.recordset[0];
}

export async function upsertContacts(contacts, shopCode) {
  const pool = await appPool();
  let imported = 0;
  for (const c of contacts) {
    const bcNo = str(c.contactNo || c.BcContactNo, 20).toUpperCase();
    if (!bcNo) continue;
    await pool.request()
      .input('bcNo',         sql.NVarChar(20),  bcNo)
      .input('name',         sql.NVarChar(200), str(c.name || c.Name))
      .input('mobileNo',     sql.NVarChar(30),  str(c.mobileNo || c.MobileNo || c.phoneNo || '', 30) || null)
      .input('email',        sql.NVarChar(200), str(c.email || c.Email || ''))
      .input('kraPin',       sql.NVarChar(30),  str(c.kraPin || c.KraPin || '', 30) || null)
      .input('spCode',       sql.NVarChar(20),  str(c.salespersonCode || c.SalespersonCode || '', 20).toUpperCase() || null)
      .input('shopCode',     sql.NVarChar(50),  shopCode || null)
      .input('routeCode',    sql.NVarChar(20),  str(c.routeCode || c.RouteCode || '', 20).toUpperCase() || null)
      .input('contactType',  sql.NVarChar(20),  str(c.contactType || c.ContactType || '', 20) || null)
      .input('companyName',  sql.NVarChar(200), str(c.companyName || c.CompanyName || '') || null)
      .query(`
        MERGE [dbo].[PosContact] AS t
        USING (SELECT @bcNo AS BcContactNo) AS s ON t.[BcContactNo] = s.[BcContactNo]
        WHEN MATCHED THEN
          UPDATE SET [Name]=@name,[MobileNo]=@mobileNo,[Email]=@email,[KraPin]=@kraPin,
                     [SalespersonCode]=@spCode,[ShopCode]=@shopCode,
                     [RouteCode]=@routeCode,[CustomerType]=@contactType,[CompanyName]=@companyName,
                     [IsActive]=1,[UpdatedAt]=GETUTCDATE()
        WHEN NOT MATCHED THEN
          INSERT ([BcContactNo],[Name],[MobileNo],[Email],[KraPin],[SalespersonCode],[ShopCode],
                  [RouteCode],[CustomerType],[CompanyName])
          VALUES (@bcNo,@name,@mobileNo,@email,@kraPin,@spCode,@shopCode,
                  @routeCode,@contactType,@companyName);
      `);
    imported++;
  }
  return imported;
}

export async function deleteContact(contactId) {
  if (!contactId) throw new Error('contactId required');
  const pool = await appPool();
  await pool.request()
    .input('id', sql.UniqueIdentifier, contactId)
    .query(`DELETE FROM [dbo].[PosContact] WHERE [ContactId]=@id`);
}

export async function setOrderContact(orderId, { contactNo, contactName, contactPhone, contactPin }) {
  const pool = await appPool();
  const r = await pool.request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .query(`SELECT [Status] FROM [dbo].[PosOrder] WHERE [OrderId]=@orderId`);
  if (!r.recordset.length) throw new Error('Order not found');
  await pool.request()
    .input('orderId',      sql.UniqueIdentifier, orderId)
    .input('contactNo',    sql.NVarChar(20),  str(contactNo,  20) || null)
    .input('contactName',  sql.NVarChar(200), str(contactName) || null)
    .input('contactPhone', sql.NVarChar(30),  str(contactPhone, 30) || null)
    .input('contactPin',   sql.NVarChar(30),  str(contactPin, 30) || null)
    .query(`
      UPDATE [dbo].[PosOrder]
      SET [ContactNo]=@contactNo,[ContactName]=@contactName,
          [ContactPhone]=@contactPhone,[ContactPin]=@contactPin,
          [UpdatedAt]=GETUTCDATE()
      WHERE [OrderId]=@orderId
    `);
}

// ── PosOrder ──────────────────────────────────────────────────────────────────

function terminalOrderPrefix(shopCode) {
  const raw = String(shopCode || 'POS').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (raw || 'POS').slice(0, 10);
}

async function nextOrderNo(pool, shopCode = null) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `${terminalOrderPrefix(shopCode)}-${today}-`;
  const r = await pool.request()
    .input('prefix', sql.NVarChar(30), `${prefix}%`)
    .query(`
    SELECT TOP 1 [OrderNo]
    FROM [dbo].[PosOrder]
    WHERE [OrderNo] LIKE @prefix
    ORDER BY [OrderNo] DESC
  `);
  if (!r.recordset.length) return `${prefix}001`;
  const last = r.recordset[0].OrderNo;
  const seq  = parseInt(last.slice(-3)) + 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

export async function createOrder(cashierUserId, cashierName, shopCode = null) {
  const pool = await appPool();
  const orderNo = await nextOrderNo(pool, shopCode);
  const result = await pool.request()
    .input('orderNo',       sql.NVarChar(30),  orderNo)
    .input('shopCode',      sql.NVarChar(50),  shopCode || null)
    .input('cashierUserId', sql.NVarChar(100), cashierUserId)
    .input('cashierName',   sql.NVarChar(200), cashierName)
    .query(`
      INSERT INTO [dbo].[PosOrder]([OrderNo],[ShopCode],[CashierUserId],[CashierName],[Status],[TotalAmount])
      OUTPUT INSERTED.[OrderId], INSERTED.[OrderNo], INSERTED.[ShopCode]
      VALUES(@orderNo,@shopCode,@cashierUserId,@cashierName,'open',0)
    `);
  return result.recordset[0];
}

export async function getOrder(orderId) {
  const pool = await appPool();
  const hasEtimsNo = await columnExists(pool, 'PosOrder', 'EtimsNo');
  const r = await pool.request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .query(`
      SELECT o.[OrderId],o.[OrderNo],o.[ShopCode],o.[CashierUserId],o.[CashierName],o.[Status],
             o.[Label],
             o.[TotalAmount],o.[Notes],o.[ContactNo],o.[ContactName],o.[ContactPhone],o.[ContactPin],
             ${hasEtimsNo ? 'o.[EtimsNo]' : 'CAST(NULL AS NVARCHAR(50))'} AS [EtimsNo],
             o.[EtimsInvoiceNo],o.[CuSerialNo],o.[QrUrl],o.[SignedAt],o.[PrintedAt],o.[PdfFileName],
             o.[CreatedAt],o.[UpdatedAt],
             l.[LineId],l.[ItemNo],l.[Description],l.[Quantity],l.[UnitPrice],l.[LineAmount],l.[SortOrder],
             pi.[EtimsItemCode],pi.[EtimsItemClassCode],pi.[TaxType],pi.[UnitOfMeasure],pi.[VatPercent],pi.[PriceIncludesVat],
             p.[PaymentId],p.[PaymentTypeCode],p.[PaymentTypeName],p.[Amount],p.[MobileNo],
             p.[Reference],p.[Status] AS PayStatus
      FROM [dbo].[PosOrder] o
      LEFT JOIN [dbo].[PosOrderLine] l  ON l.[OrderId] = o.[OrderId]
      LEFT JOIN [dbo].[PosItem]      pi ON pi.[ItemNo] = l.[ItemNo]
      LEFT JOIN [dbo].[PosPayment]   p  ON p.[OrderId] = o.[OrderId]
      WHERE o.[OrderId]=@orderId
    `);
  if (!r.recordset.length) return null;
  const first = r.recordset[0];
  const order = {
    orderId: first.OrderId, orderNo: first.OrderNo,
    shopCode: first.ShopCode || '', cashierName: first.CashierName,
    status: first.Status, totalAmount: Number(first.TotalAmount || 0),
    label: first.Label || '',
    notes: first.Notes || '',
    contactNo: first.ContactNo || null, contactName: first.ContactName || null,
    contactPhone: first.ContactPhone || null, contactPin: first.ContactPin || null,
    etimsNo: first.EtimsNo || null,
    etimsInvoiceNo: first.EtimsInvoiceNo || null,
    cuSerialNo:     first.CuSerialNo     || null,
    qrUrl:          first.QrUrl          || null,
    signedAt:       first.SignedAt       || null,
    printedAt:      first.PrintedAt      || null,
    pdfFileName:    first.PdfFileName    || null,
    createdAt: first.CreatedAt, updatedAt: first.UpdatedAt,
    lines: [], payments: [],
  };
  const linesSeen = new Set(); const paysSeen = new Set();
  for (const row of r.recordset) {
    if (row.LineId && !linesSeen.has(row.LineId)) {
      linesSeen.add(row.LineId);
      order.lines.push({
        lineId: row.LineId, itemNo: row.ItemNo, description: row.Description,
        quantity: Number(row.Quantity), unitPrice: Number(row.UnitPrice),
        lineAmount: Number(row.LineAmount), sortOrder: row.SortOrder,
        etimsItemCode:      row.EtimsItemCode      || '',
        etimsItemClassCode: row.EtimsItemClassCode || '',
        taxType:            row.TaxType            || '',
        unitOfMeasure:      row.UnitOfMeasure      || '',
        vatPercent:         Number(row.VatPercent ?? 0),
        priceIncludesVat:   row.PriceIncludesVat == null ? true : Boolean(row.PriceIncludesVat),
      });
    }
    if (row.PaymentId && !paysSeen.has(row.PaymentId)) {
      paysSeen.add(row.PaymentId);
      order.payments.push({ paymentId: row.PaymentId, paymentTypeCode: row.PaymentTypeCode,
        paymentTypeName: row.PaymentTypeName, amount: Number(row.Amount),
        mobileNo: row.MobileNo || '', reference: row.Reference || '', status: row.PayStatus });
    }
  }
  return order;
}

export async function listOrders(cashierUserId, role, shopCode = null) {
  const pool = await appPool();
  const req  = pool.request();
  const isAdmin = role === 'admin';

  let where = '';
  if (isAdmin) {
    // admin sees everything
  } else if (shopCode) {
    // shop user scoped to their shop
    req.input('shopCode', sql.NVarChar(50), shopCode);
    where = 'WHERE o.[ShopCode]=@shopCode';
  } else {
    // no shop assigned — fall back to own orders only
    req.input('cashierUserId', sql.NVarChar(100), cashierUserId);
    where = 'WHERE o.[CashierUserId]=@cashierUserId';
  }

  const r = await req.query(`
    SELECT o.[OrderId],o.[OrderNo],o.[ShopCode],o.[CashierName],o.[Status],o.[Label],o.[TotalAmount],
           o.[EtimsInvoiceNo],
           o.[CreatedAt],o.[UpdatedAt],
           COUNT(l.[LineId]) AS LineCount
    FROM [dbo].[PosOrder] o
    LEFT JOIN [dbo].[PosOrderLine] l ON l.[OrderId]=o.[OrderId]
    ${where}
    GROUP BY o.[OrderId],o.[OrderNo],o.[ShopCode],o.[CashierName],o.[Status],o.[Label],o.[EtimsInvoiceNo],
             o.[TotalAmount],o.[CreatedAt],o.[UpdatedAt]
    ORDER BY o.[CreatedAt] DESC
  `);
  return r.recordset;
}

export async function setOrderLines(orderId, lines) {
  const pool = await appPool();
  const req  = pool.request().input('orderId', sql.UniqueIdentifier, orderId);
  await req.query(`DELETE FROM [dbo].[PosOrderLine] WHERE [OrderId]=@orderId`);

  let total = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const qty    = num(l.quantity);
    const price  = num(l.unitPrice);
    if (qty <= 0) throw new Error(`Line "${l.description || l.itemNo}" must have a positive quantity — negative or zero sales are not allowed.`);
    const amount = Math.round(qty * price * 10000) / 10000;
    total += amount;
    const r2 = pool.request()
      .input(`oid${i}`,  sql.UniqueIdentifier, orderId)
      .input(`ino${i}`,  sql.NVarChar(30),    str(l.itemNo, 30).toUpperCase())
      .input(`dsc${i}`,  sql.NVarChar(200),   str(l.description))
      .input(`qty${i}`,  sql.Decimal(18, 4),  qty)
      .input(`prc${i}`,  sql.Decimal(18, 4),  price)
      .input(`amt${i}`,  sql.Decimal(18, 4),  amount)
      .input(`srt${i}`,  sql.Int,             i);
    await r2.query(`
      INSERT INTO [dbo].[PosOrderLine]([OrderId],[ItemNo],[Description],[Quantity],[UnitPrice],[LineAmount],[SortOrder])
      VALUES(@oid${i},@ino${i},@dsc${i},@qty${i},@prc${i},@amt${i},@srt${i})
    `);
  }
  await pool.request()
    .input('total',   sql.Decimal(18, 4), Math.round(total * 10000) / 10000)
    .input('orderId', sql.UniqueIdentifier, orderId)
    .query(`UPDATE [dbo].[PosOrder] SET [TotalAmount]=@total,[UpdatedAt]=GETUTCDATE() WHERE [OrderId]=@orderId`);
}

export async function checkoutOrder(orderId, { paymentTypeCode, paymentTypeName, amount, mobileNo, reference }) {
  const pool  = await appPool();
  const order = await getOrder(orderId);
  if (!order) throw new Error('Order not found');
  if (order.status !== 'open') throw new Error(`Order is already ${order.status}`);
  // Refuse to start checkout if any line would push stock below zero.
  const { assertOrderHasStock } = await import('./PosStockModel.js');
  await assertOrderHasStock({ shopCode: order.shopCode, lines: order.lines });

  const result = await pool.request()
    .input('orderId',          sql.UniqueIdentifier, orderId)
    .input('paymentTypeCode',  sql.NVarChar(50),  str(paymentTypeCode, 50))
    .input('paymentTypeName',  sql.NVarChar(200), str(paymentTypeName))
    .input('amount',           sql.Decimal(18, 4), Math.round(num(amount)))   // KES rounded to whole at checkout
    .input('mobileNo',         sql.NVarChar(30),  str(mobileNo, 30) || null)
    .input('reference',        sql.NVarChar(100), str(reference, 100) || null)
    .query(`
      INSERT INTO [dbo].[PosPayment]([OrderId],[PaymentTypeCode],[PaymentTypeName],[Amount],[MobileNo],[Reference],[Status])
      OUTPUT INSERTED.[PaymentId]
      VALUES(@orderId,@paymentTypeCode,@paymentTypeName,@amount,@mobileNo,@reference,'pending')
    `);
  const paymentId = result.recordset[0].PaymentId;

  await pool.request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .query(`UPDATE [dbo].[PosOrder] SET [Status]='checkout',[UpdatedAt]=GETUTCDATE() WHERE [OrderId]=@orderId`);

  return paymentId;
}

export async function confirmPayment(paymentId, reference = null) {
  const pool = await appPool();
  const r = await pool.request()
    .input('paymentId', sql.UniqueIdentifier, paymentId)
    .query(`SELECT [OrderId],[Status] FROM [dbo].[PosPayment] WHERE [PaymentId]=@paymentId`);
  if (!r.recordset.length) throw new Error('Payment not found');
  const { OrderId, Status } = r.recordset[0];
  if (Status === 'confirmed') throw new Error('Already confirmed');

  // Stock guard: don't flip the order to 'paid' if any line is short — payment has been
  // received but stock isn't there. The cashier needs to either swap items or refund.
  const order = await getOrder(OrderId);
  const { assertOrderHasStock } = await import('./PosStockModel.js');
  await assertOrderHasStock({ shopCode: order.shopCode, lines: order.lines });

  const req2 = pool.request().input('paymentId', sql.UniqueIdentifier, paymentId);
  if (reference) req2.input('ref', sql.NVarChar(100), str(reference, 100));
  await req2.query(`
    UPDATE [dbo].[PosPayment]
    SET [Status]='confirmed'
      ${reference ? ",[Reference]=@ref" : ''}
      ,[UpdatedAt]=GETUTCDATE()
    WHERE [PaymentId]=@paymentId
  `);

  await pool.request()
    .input('orderId', sql.UniqueIdentifier, OrderId)
    .query(`UPDATE [dbo].[PosOrder] SET [Status]='paid',[UpdatedAt]=GETUTCDATE() WHERE [OrderId]=@orderId`);

  return OrderId;
}

/**
 * Reconcile an externally-fetched payment against an open order.
 * Matches by OrderNo or by an existing pending payment's Reference (case-insensitive).
 * Returns true when a payment row was confirmed.
 */
export async function confirmPaymentByReference({ orderNoOrRef, paymentTypeCode, reference, amount }) {
  const pool = await appPool();
  // Try to find a pending payment row whose order matches the accountRef, then any pending row with that reference.
  const r = await pool.request()
    .input('ref', sql.NVarChar(100), str(orderNoOrRef, 100))
    .input('code', sql.NVarChar(50), str(paymentTypeCode, 50).toUpperCase())
    .query(`
      SELECT TOP 1 p.[PaymentId], p.[Status]
      FROM   [dbo].[PosPayment] p
      JOIN   [dbo].[PosOrder]   o ON o.[OrderId] = p.[OrderId]
      WHERE  p.[Status] <> 'confirmed'
        AND  p.[PaymentTypeCode] = @code
        AND  (o.[OrderNo] = @ref OR p.[Reference] = @ref)
      ORDER BY p.[CreatedAt] DESC
    `);
  if (!r.recordset.length) return false;
  const pid = r.recordset[0].PaymentId;
  await confirmPayment(pid, reference || null);
  return true;
}

export async function storeSignResult(orderId, result) {
  if (!result) return;
  const pool = await appPool();
  const hasEtimsNo = await columnExists(pool, 'PosOrder', 'EtimsNo');
  const req = pool.request()
    .input('orderId',        sql.UniqueIdentifier, orderId)
    .input('etimsInvoiceNo', sql.NVarChar(50),  str(result.etimsInvoiceNo, 50) || null)
    .input('cuSerialNo',     sql.NVarChar(50),  str(result.cuSerialNo, 50) || null)
    .input('qrUrl',          sql.NVarChar(500), str(result.qrUrl, 500) || null)
    .input('signedAt',       sql.NVarChar(100), str(result.signedAt, 100) || null);
  if (hasEtimsNo) req.input('etimsNo', sql.NVarChar(50), str(result.etimsNo, 50) || null);
  await req.query(`
      UPDATE [dbo].[PosOrder]
      SET ${hasEtimsNo ? '[EtimsNo]=COALESCE(@etimsNo,[EtimsNo]),' : ''}
          [EtimsInvoiceNo]=@etimsInvoiceNo,[CuSerialNo]=@cuSerialNo,
          [QrUrl]=@qrUrl,[SignedAt]=@signedAt,[UpdatedAt]=GETUTCDATE()
      WHERE [OrderId]=@orderId
    `);
}

/**
 * Verify an admin / shop-admin's username + password (used to elevate a cashier
 * action like Stock Reset). Throws on any failure; resolves true on success.
 */
export async function verifyManagerCredentials(username, password) {
  const pool = await appPool();
  const r = await pool.request()
    .input('u', sql.NVarChar(100), str(username, 100))
    .query(`SELECT [PasswordHash],[Role],[IsActive] FROM [dbo].[Users] WHERE [Username]=@u AND [IsActive]=1`);
  if (!r.recordset.length) throw new Error('Admin user not found');
  const user = r.recordset[0];
  if (!['admin', 'shop-admin'].includes(user.Role)) throw new Error('Manager or admin role required');
  if (!user.PasswordHash) throw new Error('Password not set for this account');
  if (!(await bcrypt.compare(String(password || ''), user.PasswordHash))) throw new Error('Invalid admin password');
  return true;
}

export async function verifyAdminPin(userId, pin) {
  const pool = await appPool();
  const r = await pool.request()
    .input('userId', sql.NVarChar(100), str(userId, 100))
    .query(`
      SELECT [UserId],[PasswordHash],[Role],[IsActive],[AuthProvider]
      FROM [dbo].[Users]
      WHERE [UserId]=@userId AND [IsActive]=1
    `);
  if (!r.recordset.length) throw new Error('Admin user not found');
  const user = r.recordset[0];
  if (user.Role !== 'admin') throw new Error('Admin role required');
  if (!user.PasswordHash) throw new Error('Admin PIN/password is not available for this account');
  const ok = await bcrypt.compare(String(pin || ''), user.PasswordHash);
  if (!ok) throw new Error('Invalid admin PIN');
  return true;
}

// ── M-Pesa application ledger (confirmation code ↔ invoice, partial use) ──────
function parseDate(v) { try { const d = new Date(v); return isNaN(d.getTime()) ? null : d; } catch { return null; } }

/** Map of UPPER(code) → amount already applied across all invoices. */
export async function getMpesaUtilization(codes = []) {
  const map = {};
  const list = [...new Set(codes.map(c => String(c || '').trim().toUpperCase()).filter(Boolean))];
  if (!list.length) return map;
  const pool = await appPool();
  const req = pool.request();
  const params = list.map((c, i) => { req.input('c' + i, sql.NVarChar(40), c); return '@c' + i; }).join(',');
  const r = await req.query(`
    SELECT UPPER([MpesaCode]) AS Code, SUM([AppliedAmount]) AS Applied
    FROM [dbo].[PosMpesaApplication] WHERE UPPER([MpesaCode]) IN (${params})
    GROUP BY UPPER([MpesaCode])`);
  for (const row of r.recordset) map[row.Code] = Number(row.Applied || 0);
  return map;
}

/**
 * Record M-Pesa code→invoice applications for an order. Re-validates available
 * balance per code (full txn amount − already applied) to prevent double-use.
 * @param {Object} p { orderId, matches:[{code,mpesaAmount,applied,phone,name,timestamp}], createdBy }
 */
export async function recordMpesaApplications({ orderId, matches = [], createdBy = null }) {
  if (!orderId) throw new Error('orderId required');
  if (!Array.isArray(matches) || !matches.length) return { applied: 0, rows: 0 };
  const pool = await appPool();
  const ord = await pool.request().input('id', sql.UniqueIdentifier, orderId)
    .query(`SELECT [OrderNo],[EtimsInvoiceNo],[ShopCode] FROM [dbo].[PosOrder] WHERE [OrderId]=@id`);
  const o = ord.recordset[0];
  if (!o) throw new Error('Order not found');

  let appliedTotal = 0, rows = 0;
  for (const m of matches) {
    const code = String(m.code || '').trim().toUpperCase();
    const want = Number(m.applied || 0);
    if (!code || !(want > 0)) continue;
    const mpesaAmount = Number(m.mpesaAmount || 0);
    const util = await getMpesaUtilization([code]);
    const available = mpesaAmount - (util[code] || 0);
    const apply = Math.min(want, available);
    if (!(apply > 0)) throw new Error(`M-Pesa code ${code} is already fully utilised`);
    await pool.request()
      .input('code',        sql.NVarChar(40),  code)
      .input('mpesaAmount', sql.Decimal(18, 2), mpesaAmount)
      .input('applied',     sql.Decimal(18, 2), Math.round(apply * 100) / 100)
      .input('phone',       sql.NVarChar(30),  m.phone || null)
      .input('payer',       sql.NVarChar(200), m.name || null)
      .input('tt',          sql.DateTime2,     parseDate(m.timestamp))
      .input('oid',         sql.UniqueIdentifier, orderId)
      .input('ono',         sql.NVarChar(40),  o.OrderNo)
      .input('inv',         sql.NVarChar(60),  o.EtimsInvoiceNo || null)
      .input('shop',        sql.NVarChar(50),  o.ShopCode || null)
      .input('by',          sql.NVarChar(200), createdBy || null)
      .query(`INSERT INTO [dbo].[PosMpesaApplication]
        ([MpesaCode],[MpesaAmount],[AppliedAmount],[Phone],[PayerName],[TransTime],[OrderId],[OrderNo],[InvoiceNo],[ShopCode],[CreatedBy])
        VALUES(@code,@mpesaAmount,@applied,@phone,@payer,@tt,@oid,@ono,@inv,@shop,@by)`);
    appliedTotal += apply; rows++;
  }
  return { applied: Math.round(appliedTotal * 100) / 100, rows };
}

/** Report: invoice → its M-Pesa payments (one row per application). */
export async function mpesaInvoiceReport({ from = null, to = null, shopCode = null } = {}) {
  const pool = await appPool();
  const req = pool.request();
  const conds = [];
  if (from)     { req.input('from', sql.DateTime2, parseDate(from)); conds.push('a.[CreatedAt] >= @from'); }
  if (to)       { req.input('to',   sql.DateTime2, parseDate(to + 'T23:59:59')); conds.push('a.[CreatedAt] <= @to'); }
  if (shopCode) { req.input('shop', sql.NVarChar(50), shopCode); conds.push('a.[ShopCode] = @shop'); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const r = await req.query(`
    SELECT a.[OrderNo], a.[InvoiceNo], a.[ShopCode], o.[TotalAmount], o.[Status] AS OrderStatus,
           o.[ContactName], a.[MpesaCode], a.[AppliedAmount], a.[MpesaAmount],
           a.[Phone], a.[PayerName], a.[TransTime], a.[CreatedAt]
    FROM [dbo].[PosMpesaApplication] a
    LEFT JOIN [dbo].[PosOrder] o ON o.[OrderId] = a.[OrderId]
    ${where}
    ORDER BY a.[CreatedAt] DESC, a.[OrderNo]`);
  return r.recordset;
}

/** Report: M-Pesa payment (code) → invoices it funds. Only codes with a link,
 *  including partially-utilised ones (Balance = MpesaAmount − Applied). */
export async function mpesaPaymentReport({ from = null, to = null } = {}) {
  const pool = await appPool();
  const req = pool.request();
  const conds = [];
  if (from) { req.input('from', sql.DateTime2, parseDate(from)); conds.push('[CreatedAt] >= @from'); }
  if (to)   { req.input('to',   sql.DateTime2, parseDate(to + 'T23:59:59')); conds.push('[CreatedAt] <= @to'); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const r = await req.query(`
    SELECT [MpesaCode],
           MAX([MpesaAmount]) AS MpesaAmount,
           SUM([AppliedAmount]) AS Applied,
           MAX([PayerName]) AS PayerName, MAX([Phone]) AS Phone, MAX([TransTime]) AS TransTime,
           COUNT(DISTINCT [OrderNo]) AS InvoiceCount,
           STRING_AGG(CONCAT([OrderNo], ' (', CAST([AppliedAmount] AS DECIMAL(18,2)), ')'), ', ') AS Invoices
    FROM [dbo].[PosMpesaApplication] ${where}
    GROUP BY [MpesaCode]
    ORDER BY MAX([TransTime]) DESC`);
  return r.recordset.map(x => ({ ...x, Balance: Math.round((Number(x.MpesaAmount || 0) - Number(x.Applied || 0)) * 100) / 100 }));
}

export async function markStkPushSent(orderId, reference) {
  const pool = await appPool();
  await pool.request()
    .input('orderId',   sql.UniqueIdentifier, orderId)
    .input('reference', sql.NVarChar(100),    str(reference, 100) || null)
    .query(`UPDATE [dbo].[PosOrder]
            SET [StkPushReference]=@reference,[StkPushSentAt]=GETUTCDATE(),
                [StkPushStatus]='pending',[UpdatedAt]=GETUTCDATE()
            WHERE [OrderId]=@orderId`);
}

export async function markConfirmationPrinted(orderId) {
  const pool = await appPool();
  await pool.request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .query(`UPDATE [dbo].[PosOrder]
            SET [ConfirmationPrintedAt]=GETUTCDATE(),[UpdatedAt]=GETUTCDATE()
            WHERE [OrderId]=@orderId`);
}

export async function markPrinted(orderId, fileName = null) {
  const pool = await appPool();
  const req = pool.request().input('orderId', sql.UniqueIdentifier, orderId);
  if (fileName) {
    req.input('fileName', sql.NVarChar(255), fileName);
    await req.query(`UPDATE [dbo].[PosOrder]
                     SET [PrintedAt]=GETUTCDATE(),[PdfFileName]=@fileName
                     WHERE [OrderId]=@orderId`);
  } else {
    await req.query(`UPDATE [dbo].[PosOrder] SET [PrintedAt]=GETUTCDATE() WHERE [OrderId]=@orderId`);
  }
}

/**
 * Park / save an open order as an abandoned cart with a label so a cashier
 * can resume it later (status='saved', visible in PosOrders).
 * Resuming is just opening the order — no API change needed.
 */
export async function saveAbandonedCart(orderId, label) {
  const pool = await appPool();
  const r = await pool.request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .input('label',   sql.NVarChar(80), str(label, 80) || null)
    .query(`
      UPDATE [dbo].[PosOrder]
      SET [Status]='saved',
          [Label]=@label,
          [UpdatedAt]=GETUTCDATE()
      WHERE [OrderId]=@orderId AND [Status] IN ('open','checkout','saved')
    `);
  if (!r.rowsAffected[0]) throw new Error('Order is not in a state that can be parked');
}

/** Resume a parked cart back to 'open'. */
export async function resumeAbandonedCart(orderId) {
  const pool = await appPool();
  await pool.request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .query(`
      UPDATE [dbo].[PosOrder]
      SET [Status]='open', [UpdatedAt]=GETUTCDATE()
      WHERE [OrderId]=@orderId AND [Status]='saved'
    `);
}

export async function cancelOrder(orderId) {
  const pool = await appPool();
  const r = await pool.request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .query(`SELECT [Status] FROM [dbo].[PosOrder] WHERE [OrderId]=@orderId`);
  if (!r.recordset.length) throw new Error('Order not found');
  if (r.recordset[0].Status === 'paid') throw new Error('Cannot cancel a paid order');
  await pool.request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .query(`UPDATE [dbo].[PosOrder] SET [Status]='cancelled',[UpdatedAt]=GETUTCDATE() WHERE [OrderId]=@orderId`);
}

export async function completeOrder(orderId) {
  const pool = await appPool();
  const r = await pool.request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .query(`SELECT [Status] FROM [dbo].[PosOrder] WHERE [OrderId]=@orderId`);
  if (!r.recordset.length) throw new Error('Order not found');
  const { Status } = r.recordset[0];
  if (Status === 'paid') throw new Error('Order already paid');
  if (Status === 'cancelled') throw new Error('Cannot complete a cancelled order');

  // Stock guard: refuse to mark paid if any line is short.
  const order = await getOrder(orderId);
  const { assertOrderHasStock } = await import('./PosStockModel.js');
  await assertOrderHasStock({ shopCode: order.shopCode, lines: order.lines });

  await pool.request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .query(`UPDATE [dbo].[PosOrder] SET [Status]='paid',[UpdatedAt]=GETUTCDATE() WHERE [OrderId]=@orderId`);
}
