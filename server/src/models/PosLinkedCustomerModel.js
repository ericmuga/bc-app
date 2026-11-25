/**
 * models/PosLinkedCustomerModel.js
 * Linked customers — extra BC customer numbers a POS shop can bill instead of
 * its own shop customer (e.g. a distributor with distributor prices).
 *
 *   • per company (FCL / CM / RMK / FLM) — the customer lives in that company
 *   • IsGlobal = 1 → offered at every shop; IsGlobal = 0 → only at ShopCode
 *   • prices come from BC Sales Price: customer-specific (Sales Type 0) beats the
 *     customer's price group (Sales Type 1); VAT-grossed like the shop prices.
 *     Synced on onboarding, on demand, and with the shop-price refresh.
 *   • an order starts on the shop customer; switching sets PosOrder.LinkedCustomerId
 *     and re-prices the order's lines of that company.
 */
import { db, sql } from '../db/pool.js';
import { bcDb, bcSql } from '../db/bcPool.js';
import { ALL_COMPANIES, bcTable } from '../services/bcTables.js';
import { matchesPriceUnit } from '../services/posPriceUnit.js';
import logger from '../services/logger.js';

const up = (v) => String(v ?? '').trim().toUpperCase();
function str(v, max = 200) { return String(v ?? '').trim().slice(0, max); }
function round4(v) { return Math.round(Number(v || 0) * 10000) / 10000; }
function company(c) {
  const co = up(c);
  if (!ALL_COMPANIES.includes(co)) throw new Error(`Unknown company "${c}" — use one of ${ALL_COMPANIES.join(', ')}`);
  return co;
}

function mapRow(r) {
  return {
    linkedCustomerId: r.LinkedCustomerId, company: r.Company, customerNo: r.CustomerNo,
    customerName: r.CustomerName, priceGroup: r.PriceGroup || '', kraPin: r.KraPin || '',
    isGlobal: !!r.IsGlobal, shopCode: r.ShopCode || null, isActive: !!r.IsActive,
    sortOrder: r.SortOrder, notes: r.Notes || '',
    priceCount: r.PriceCount, lastPriceSyncAt: r.LastPriceSyncAt, lastPriceSyncError: r.LastPriceSyncError || null,
    bcSyncStatus: r.BcSyncStatus, bcSyncedAt: r.BcSyncedAt,
    createdBy: r.CreatedBy, createdAt: r.CreatedAt, updatedAt: r.UpdatedAt,
  };
}

// ── BC customer lookup ──────────────────────────────────────────────────────

export async function getBcCustomer(co, customerNo) {
  const pool = await bcDb.getPool();
  const r = await pool.request().input('no', bcSql.NVarChar(20), up(customerNo)).query(`
    SELECT [No_] AS CustomerNo, [Name], [Customer Price Group] AS PriceGroup,
           [VAT Registration No_] AS KraPin, [Blocked], [Currency Code] AS CurrencyCode
    FROM ${bcTable(company(co), 'Customer')} WHERE [No_] = @no
  `);
  return r.recordset[0] || null;
}

// The POS sells in KES; a customer billed in another currency would get foreign
// price-list amounts treated as shillings.
const LCY_CODES = ['', 'KSHS', 'KES'];
function assertKesCustomer(c, co) {
  const cur = up(c.CurrencyCode);
  if (!LCY_CODES.includes(cur)) throw new Error(`Customer ${c.CustomerNo} is billed in ${cur} in BC ${co}; the POS only sells in KES`);
}

export async function searchBcCustomers(co, q, limit = 25) {
  const text = str(q, 100);
  if (text.length < 2) return [];
  const pool = await bcDb.getPool();
  const r = await pool.request()
    .input('q', bcSql.NVarChar(110), `%${text}%`)
    .input('no', bcSql.NVarChar(20), up(text))
    .query(`
      SELECT TOP (${Math.min(Number(limit) || 25, 100)})
             [No_] AS CustomerNo, [Name], [Customer Price Group] AS PriceGroup,
             [VAT Registration No_] AS KraPin, [Blocked], [Currency Code] AS CurrencyCode
      FROM ${bcTable(company(co), 'Customer')}
      WHERE [No_] = @no OR [No_] LIKE @q OR [Name] LIKE @q
      ORDER BY CASE WHEN [No_] = @no THEN 0 ELSE 1 END, [Name]
    `);
  return r.recordset.map((c) => ({
    customerNo: c.CustomerNo, name: c.Name, priceGroup: c.PriceGroup || '', kraPin: c.KraPin || '', blocked: Number(c.Blocked) || 0,
    currencyCode: c.CurrencyCode || '', kesOnly: LCY_CODES.includes(up(c.CurrencyCode)),
  }));
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function listLinkedCustomers({ shopCode = null, activeOnly = false } = {}) {
  const pool = await db.getPool();
  const req = pool.request();
  const where = ['1=1'];
  if (activeOnly) where.push('[IsActive]=1');
  if (shopCode) { req.input('shop', sql.NVarChar(50), up(shopCode)); where.push('([IsGlobal]=1 OR [ShopCode]=@shop)'); }
  const r = await req.query(`
    SELECT * FROM [dbo].[PosLinkedCustomer] WHERE ${where.join(' AND ')}
    ORDER BY [SortOrder], [CustomerName]
  `);
  return r.recordset.map(mapRow);
}

export async function getLinkedCustomer(id) {
  const pool = await db.getPool();
  const r = await pool.request().input('id', sql.UniqueIdentifier, id)
    .query(`SELECT * FROM [dbo].[PosLinkedCustomer] WHERE [LinkedCustomerId]=@id`);
  return r.recordset[0] ? mapRow(r.recordset[0]) : null;
}

/** Create or update a linked customer; validates it in BC and (re)syncs its prices. */
export async function saveLinkedCustomer(body = {}, { createdBy = null } = {}) {
  const co = company(body.company);
  const customerNo = up(body.customerNo).slice(0, 20);
  if (!customerNo) throw new Error('customerNo is required');
  const isGlobal = body.isGlobal === true || body.isGlobal === 1 || body.isGlobal === '1' || body.isGlobal === 'true';
  const shopCode = isGlobal ? null : (up(body.shopCode).slice(0, 50) || null);
  if (!isGlobal && !shopCode) throw new Error('Pick the shop, or tick "Available to all shops"');

  const bc = await getBcCustomer(co, customerNo);
  if (!bc) throw new Error(`Customer ${customerNo} was not found in BC ${co}`);
  if (Number(bc.Blocked) === 3) throw new Error(`Customer ${customerNo} is blocked (All) in BC ${co}`);
  assertKesCustomer(bc, co);

  const pool = await db.getPool();
  const dup = await pool.request()
    .input('co', sql.NVarChar(20), co).input('no', sql.NVarChar(20), customerNo)
    .input('shop', sql.NVarChar(50), shopCode)
    .input('id', sql.UniqueIdentifier, body.linkedCustomerId || null)
    .query(`
      SELECT TOP 1 [IsGlobal],[ShopCode] FROM [dbo].[PosLinkedCustomer]
      WHERE [Company]=@co AND [CustomerNo]=@no
        AND (@id IS NULL OR [LinkedCustomerId]<>@id)
        AND ([IsGlobal]=1 OR ISNULL([ShopCode],'')=ISNULL(@shop,'') OR @shop IS NULL)
    `);
  if (dup.recordset.length) {
    const d = dup.recordset[0];
    throw new Error(`${co} ${customerNo} is already linked ${d.IsGlobal ? 'to all shops' : `to shop ${d.ShopCode}`}`);
  }

  const req = pool.request()
    .input('co', sql.NVarChar(20), co)
    .input('no', sql.NVarChar(20), customerNo)
    .input('name', sql.NVarChar(200), str(bc.Name))
    .input('pg', sql.NVarChar(40), str(bc.PriceGroup, 40) || null)
    .input('pin', sql.NVarChar(30), str(bc.KraPin, 30) || null)
    .input('glob', sql.Bit, isGlobal ? 1 : 0)
    .input('shop', sql.NVarChar(50), shopCode)
    .input('act', sql.Bit, body.isActive === false ? 0 : 1)
    .input('srt', sql.Int, Number(body.sortOrder) || 0)
    .input('notes', sql.NVarChar(500), str(body.notes, 500) || null);
  let id = body.linkedCustomerId || null;
  if (id) {
    req.input('id', sql.UniqueIdentifier, id);
    await req.query(`
      UPDATE [dbo].[PosLinkedCustomer]
      SET [Company]=@co,[CustomerNo]=@no,[CustomerName]=@name,[PriceGroup]=@pg,[KraPin]=@pin,
          [IsGlobal]=@glob,[ShopCode]=@shop,[IsActive]=@act,[SortOrder]=@srt,[Notes]=@notes,
          [BcSyncStatus]='pending',[UpdatedAt]=GETUTCDATE()
      WHERE [LinkedCustomerId]=@id
    `);
  } else {
    req.input('by', sql.NVarChar(100), createdBy ? str(createdBy, 100) : null);
    const r = await req.query(`
      INSERT INTO [dbo].[PosLinkedCustomer]
        ([Company],[CustomerNo],[CustomerName],[PriceGroup],[KraPin],[IsGlobal],[ShopCode],[IsActive],[SortOrder],[Notes],[CreatedBy])
      OUTPUT INSERTED.[LinkedCustomerId]
      VALUES(@co,@no,@name,@pg,@pin,@glob,@shop,@act,@srt,@notes,@by)
    `);
    id = r.recordset[0].LinkedCustomerId;
  }
  // Onboarding: pull this customer's prices straight away.
  const sync = await syncLinkedCustomerPrices({ linkedCustomerId: id });
  return { ...(await getLinkedCustomer(id)), priceSync: sync };
}

export async function deleteLinkedCustomer(id) {
  const pool = await db.getPool();
  const used = await pool.request().input('id', sql.UniqueIdentifier, id)
    .query(`SELECT COUNT(*) AS N FROM [dbo].[PosOrder] WHERE [LinkedCustomerId]=@id`);
  if (used.recordset[0].N > 0) {
    // Keep history intact: orders reference it, so deactivate instead of deleting.
    await pool.request().input('id', sql.UniqueIdentifier, id)
      .query(`UPDATE [dbo].[PosLinkedCustomer] SET [IsActive]=0,[UpdatedAt]=GETUTCDATE() WHERE [LinkedCustomerId]=@id`);
    return { deactivated: true };
  }
  const row = await getLinkedCustomer(id);
  await pool.request().input('id', sql.UniqueIdentifier, id)
    .query(`DELETE FROM [dbo].[PosLinkedCustomer] WHERE [LinkedCustomerId]=@id`);
  if (row) await pruneOrphanPrices(pool, row.company, row.customerNo);
  return { deleted: true };
}

async function pruneOrphanPrices(pool, co, customerNo) {
  await pool.request().input('co', sql.NVarChar(20), co).input('no', sql.NVarChar(20), customerNo).query(`
    IF NOT EXISTS (SELECT 1 FROM [dbo].[PosLinkedCustomer] WHERE [Company]=@co AND [CustomerNo]=@no)
      DELETE FROM [dbo].[PosLinkedCustomerPrice] WHERE [Company]=@co AND [CustomerNo]=@no
  `);
}

// ── Price sync (BC Sales Price → PosLinkedCustomerPrice) ────────────────────

/**
 * Resync prices for one linked customer (linkedCustomerId) or every active one.
 * Per (company, customer): customer prices + its price-group prices, for POS
 * items of that company, VAT-grossed to match POS item prices. Each customer's
 * rows are replaced atomically, so a failure leaves its old prices in place.
 */
export async function syncLinkedCustomerPrices({ linkedCustomerId = null } = {}) {
  const out = { customers: 0, prices: 0, errors: [], byCustomer: [] };
  const pool = await db.getPool();
  const req = pool.request();
  let where = '[IsActive]=1';
  if (linkedCustomerId) { req.input('id', sql.UniqueIdentifier, linkedCustomerId); where = '[LinkedCustomerId]=@id'; }
  const links = (await req.query(`SELECT * FROM [dbo].[PosLinkedCustomer] WHERE ${where}`)).recordset;
  const pairs = new Map();
  for (const l of links) pairs.set(`${l.Company}|${l.CustomerNo}`, { co: up(l.Company), no: up(l.CustomerNo) });
  if (!pairs.size) return out;

  const items = (await pool.request().query(`
    SELECT ItemNo,VatPercent,SourceCompany,UnitOfMeasure,SalesUnitOfMeasure,BaseUnitOfMeasure FROM dbo.PosItem WHERE IsActive=1
  `)).recordset;
  const source = await bcDb.getPool();

  for (const { co, no } of pairs.values()) {
    const res = { company: co, customerNo: no, prices: 0, error: null };
    try {
      const cust = await getBcCustomer(co, no);
      if (!cust) throw new Error(`not found in BC ${co}`);
      assertKesCustomer(cust, co);
      const group = up(cust.PriceGroup);
      const pr = source.request().input('cust', bcSql.NVarChar(20), no);
      if (group) pr.input('grp', bcSql.NVarChar(40), group);
      const prices = (await pr.query(`
        SELECT [Item No_] ItemNo,[Sales Type] SalesType,[Sales Code] SalesCode,
               [Unit Price] UnitPrice,[Price Includes VAT] PriceInclVat,[Unit of Measure Code] Uom,
               CAST([Starting Date] AS date) StartingDate,
               CASE WHEN [Ending Date] <= '1753-01-01' THEN NULL ELSE CAST([Ending Date] AS date) END EndingDate
        FROM ${bcTable(co, 'Sales Price')}
        WHERE (([Sales Type]=0 AND [Sales Code]=@cust) ${group ? 'OR ([Sales Type]=1 AND [Sales Code]=@grp)' : ''})
          AND [Unit Price]<>0 AND ISNULL([Minimum Quantity],0)<=1
          AND ISNULL([Variant Code],'')='' AND ISNULL([Currency Code],'')=''
      `)).recordset;
      const catalogue = new Map(items.filter((i) => up(i.SourceCompany || 'FCL') === co).map((i) => [up(i.ItemNo), i]));
      const selected = new Map();
      for (const p of prices) {
        const item = catalogue.get(up(p.ItemNo));
        if (!item || !matchesPriceUnit(p.Uom, item)) continue;
        if (p.EndingDate && p.EndingDate < p.StartingDate) continue;
        const gross = Number(p.UnitPrice) * (p.PriceInclVat ? 1 : 1 + Number(item.VatPercent || 0) / 100);
        const row = {
          itemNo: up(p.ItemNo), unitPrice: round4(gross),
          startingDate: p.StartingDate || new Date('1753-01-01'), endingDate: p.EndingDate,
          salesType: Number(p.SalesType), salesCode: up(p.SalesCode),
        };
        const key = [row.itemNo, row.salesType, row.startingDate.toISOString(), row.endingDate?.toISOString()].join('|');
        if (!selected.has(key) || selected.get(key).unitPrice > row.unitPrice) selected.set(key, row);
      }
      const rows = [...selected.values()];
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        await new sql.Request(tx).input('co', sql.NVarChar(20), co).input('no', sql.NVarChar(20), no)
          .query(`DELETE FROM [dbo].[PosLinkedCustomerPrice] WHERE [Company]=@co AND [CustomerNo]=@no`);
        for (let i = 0; i < rows.length; i += 500) {
          await new sql.Request(tx)
            .input('co', sql.NVarChar(20), co).input('no', sql.NVarChar(20), no)
            .input('rows', sql.NVarChar(sql.MAX), JSON.stringify(rows.slice(i, i + 500)))
            .query(`
              INSERT [dbo].[PosLinkedCustomerPrice]([Company],[CustomerNo],[ItemNo],[UnitPrice],[StartingDate],[EndingDate],[SalesType],[SalesCode])
              SELECT @co,@no,itemNo,unitPrice,startingDate,endingDate,salesType,salesCode
              FROM OPENJSON(@rows) WITH (itemNo nvarchar(30), unitPrice decimal(18,4), startingDate date, endingDate date,
                                        salesType tinyint, salesCode nvarchar(40))
            `);
        }
        // Keep the cached BC details current on every link of this customer.
        await new sql.Request(tx)
          .input('co', sql.NVarChar(20), co).input('no', sql.NVarChar(20), no)
          .input('name', sql.NVarChar(200), str(cust.Name)).input('pg', sql.NVarChar(40), group || null)
          .input('pin', sql.NVarChar(30), str(cust.KraPin, 30) || null).input('n', sql.Int, rows.length)
          .query(`
            UPDATE [dbo].[PosLinkedCustomer]
            SET [CustomerName]=@name,[PriceGroup]=@pg,[KraPin]=@pin,[PriceCount]=@n,
                [LastPriceSyncAt]=GETUTCDATE(),[LastPriceSyncError]=NULL,[UpdatedAt]=GETUTCDATE()
            WHERE [Company]=@co AND [CustomerNo]=@no
          `);
        await tx.commit();
      } catch (e) { await tx.rollback().catch(() => {}); throw e; }
      res.prices = rows.length;
      out.prices += rows.length;
      out.customers++;
    } catch (e) {
      res.error = e.message;
      out.errors.push(`${co} ${no}: ${e.message}`);
      await pool.request()
        .input('co', sql.NVarChar(20), co).input('no', sql.NVarChar(20), no)
        .input('err', sql.NVarChar(500), str(e.message, 500))
        .query(`UPDATE [dbo].[PosLinkedCustomer] SET [LastPriceSyncError]=@err,[LastPriceSyncAt]=GETUTCDATE() WHERE [Company]=@co AND [CustomerNo]=@no`)
        .catch(() => {});
    }
    out.byCustomer.push(res);
  }
  logger.info('syncLinkedCustomerPrices', { customers: out.customers, prices: out.prices, errors: out.errors.length });
  return out;
}

// ── Terminal: price context + switching the order's customer ────────────────

/**
 * The linked customer that prices a catalogue request: the order's customer when
 * an order is given, else an explicitly requested linked customer. null = shop customer.
 */
export async function priceCustomerFor({ orderId = null, linkedCustomerId = null, shopCode = null } = {}) {
  const pool = await db.getPool();
  let id = null;
  if (orderId) {
    const r = await pool.request().input('o', sql.UniqueIdentifier, orderId)
      .query(`SELECT [LinkedCustomerId] FROM [dbo].[PosOrder] WHERE [OrderId]=@o`);
    id = r.recordset[0]?.LinkedCustomerId || null;
  } else if (linkedCustomerId) {
    id = linkedCustomerId;
  }
  if (!id) return null;
  const lc = await getLinkedCustomer(id);
  if (!lc || !lc.isActive) return null;
  if (!orderId && !lc.isGlobal && shopCode && up(lc.shopCode) !== up(shopCode)) return null;
  return lc;
}

/**
 * Bill an open order to a linked customer (or back to the shop customer when
 * linkedCustomerId is null). The caller re-prices the lines afterwards.
 */
export async function setOrderCustomer(orderId, linkedCustomerId) {
  const pool = await db.getPool();
  const o = await pool.request().input('o', sql.UniqueIdentifier, orderId)
    .query(`SELECT [Status],[ShopCode] FROM [dbo].[PosOrder] WHERE [OrderId]=@o`);
  if (!o.recordset.length) throw new Error('Order not found');
  const { Status, ShopCode } = o.recordset[0];
  if (Status !== 'open') throw new Error(`The customer cannot be changed on a ${Status} order`);

  let lc = null;
  if (linkedCustomerId) {
    lc = await getLinkedCustomer(linkedCustomerId);
    if (!lc || !lc.isActive) throw new Error('Linked customer not found or inactive');
    if (!lc.isGlobal && up(lc.shopCode) !== up(ShopCode)) throw new Error(`${lc.customerName} is not linked to shop ${ShopCode}`);
  }
  await pool.request()
    .input('o', sql.UniqueIdentifier, orderId)
    .input('lid', sql.UniqueIdentifier, lc?.linkedCustomerId || null)
    .input('no', sql.NVarChar(20), lc?.customerNo || null)
    .input('name', sql.NVarChar(200), lc?.customerName || null)
    .input('co', sql.NVarChar(20), lc?.company || null)
    .input('pin', sql.NVarChar(30), lc?.kraPin || null)
    .query(`
      UPDATE [dbo].[PosOrder]
      SET [LinkedCustomerId]=@lid,[CustomerNo]=@no,[CustomerName]=@name,[CustomerCompany]=@co,
          [CustomerPin]=@pin,[UpdatedAt]=GETUTCDATE()
      WHERE [OrderId]=@o
    `);
  return { linkedCustomer: lc, shopCode: ShopCode };
}
